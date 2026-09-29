/* Bürger-Anliegen 2.4.1 – KI-Ablauf (Gemini). Ohne DOM, in Node testbar.
   Netz nur über die übergebene "transport"-Funktion und nur zu generativelanguage.googleapis.com.
   Modell-Kette (Standard, 2.4.0): gemini-2.5-flash (bestätigt, mit Google-Suche) -> gemini-3.8-flash -> gemini-3.5-flash-lite -> Offline-Vorlage.
   Jedes Modell: maximales Nachdenken (thinkingLevel "high" bzw. thinkingBudget 24576), viel Platz für die Antwort.
   2.4.0: pro Modell höchstens ca. 45 s, insgesamt höchstens ca. 90 s (Zeitlimit greift auch, wenn der Transport hängt).
   Bei 503/überlastet, 429, Zeitüberschreitung: SOFORT nächstes Modell (keine Wiederholung desselben Modells, kein Warten).
   Mit Internet-Suche: zuerst jedes Modell MIT Suche (Suche ist kostenlos nur bei manchen Modellen),
   erst wenn keines suchen darf, beste Antwort ohne Suche + Hinweis. Keine eigenen Mengen-Grenzen. */
(function (root) {
  'use strict';
  var BA = (typeof module !== 'undefined' && module.exports) ? require('./logic.js') : root.BA;

  function builtinKey() {
    var k = root.BA_BUILTIN_KEY;
    return typeof k === 'string' && k.length >= 20 ? k : '';
  }
  /** Eigener Schlüssel (Einstellungen) hat Vorrang, sonst eingebauter (nur private Version). */
  function effectiveKey(cfg) {
    var own = cfg && typeof cfg.key === 'string' ? cfg.key.trim() : '';
    return own || builtinKey();
  }
  function keyStatus(cfg) {
    if (cfg && cfg.enabled === false) return 'off';
    if (cfg && cfg.key && cfg.key.trim()) return 'own';
    if (builtinKey()) return 'builtin';
    return 'none';
  }
  function backoffMs(cls, attempt) {
    var ms = cls && cls.retryMs > 0 ? cls.retryMs : 2000 * Math.pow(2, attempt);
    return Math.min(Math.max(ms, 500), 30000);
  }
  /** 2.1 speicherte das alte Standard-Modell fest. Beim Update auf die neue Kette umstellen. */
  function migrateCfg(c) {
    c = c && typeof c === 'object' ? c : {};
    var out = { key: typeof c.key === 'string' ? c.key : '', model: typeof c.model === 'string' ? c.model : '',
      fallbackModel: typeof c.fallbackModel === 'string' ? c.fallbackModel : '',
      liteModel: typeof c.liteModel === 'string' ? c.liteModel : '',
      enabled: c.enabled !== false, v: 3 };
    if (!(c.v >= 2)) {
      if (!out.model || out.model === 'gemini-2.5-flash') out.model = BA.DEFAULT_GEMINI_MODEL;
    }
    // 2.4.0: alte Standard-Kette (3.8 -> 2.5 -> Lite) auf die neue Reihenfolge umstellen; eigene Modelle bleiben
    if (!(c.v >= 3) && (!out.model || out.model === 'gemini-3.8-flash') && (!out.fallbackModel || out.fallbackModel === 'gemini-2.5-flash')) {
      out.model = BA.DEFAULT_GEMINI_MODEL; out.fallbackModel = BA.FALLBACK_GEMINI_MODEL;
    }
    if (!out.model) out.model = BA.DEFAULT_GEMINI_MODEL;
    if (!out.fallbackModel) out.fallbackModel = BA.FALLBACK_GEMINI_MODEL;
    if (!out.liteModel) out.liteModel = BA.LITE_GEMINI_MODEL;
    return out;
  }

  /** Transport-Antwort spätestens nach ms (+ kleine Reserve) – auch wenn der Transport selbst hängt (z. B. Android-Brücke). */
  function withTimeout(p, ms, graceMs) {
    return new Promise(function (resolve) {
      var done = false;
      var timer = setTimeout(function () { if (!done) { done = true; resolve({ status: 0, text: '', timeout: true }); } }, ms + (graceMs >= 0 ? graceMs : 1500));
      Promise.resolve(p).then(function (r) { if (!done) { done = true; clearTimeout(timer); resolve(r || { status: 0, text: '' }); } },
        function () { if (!done) { done = true; clearTimeout(timer); resolve({ status: 0, text: '' }); } });
    });
  }
  /** Prompt für Aufgabe bauen (für die Vorschau „das geht an Google“). */
  function preparePrompt(opts) {
    var prompt = BA.buildKiPrompt(opts.task, opts);
    if (!prompt) return null;
    return { prompt: prompt, user: prompt.user, system: prompt.system, removed: (prompt.anon && prompt.anon.removed) || [], counts: prompt.anon && prompt.anon.counts };
  }

  /**
   * run(opts) -> Promise<result>
   * opts: task, input, art, anliegen, data, cfg {key, model, fallbackModel, liteModel, enabled}, grounding (bool),
   *       transport(req) -> Promise<{status, text, timeout?}>  (req: {method, url, body, key, timeoutMs})
   *       userText (optional, aus der Vorschau; wird bei Änderung erneut anonymisiert), onProgress({model, index, grounding, elapsedMs})
   *       perModelMs / totalMs / now / graceMs (nur für Tests)
   * result: {ok, text, sources, queries, notes[], model, grounded, offline, error{kind,message}, sent, tried[], timings[], elapsedMs}
   */
  function run(opts) {
    var cfg = opts.cfg || {};
    var now = typeof opts.now === 'function' ? opts.now : function () { return Date.now(); };
    var perModelMs = opts.perModelMs > 0 ? opts.perModelMs : BA.GEMINI_TIMEOUT_MS;
    var totalMs = opts.totalMs > 0 ? opts.totalMs : BA.GEMINI_TOTAL_TIMEOUT_MS;
    var minSliceMs = opts.minSliceMs >= 0 ? opts.minSliceMs : 3000;
    var started = now();
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var notes = [], tried = [], timings = [];
    if (cfg.enabled === false) return Promise.resolve({ ok: false, error: { kind: 'off', message: BA.KI_MESSAGES.off }, notes: notes });
    var key = effectiveKey(cfg);
    if (!key) return Promise.resolve({ ok: false, error: { kind: 'nokey', message: BA.KI_MESSAGES.nokey }, notes: notes });
    var prompt = BA.buildKiPrompt(opts.task, opts);
    if (!prompt) return Promise.resolve({ ok: false, error: { kind: 'other', message: BA.KI_MESSAGES.other }, notes: notes });
    if (typeof opts.userText === 'string' && !BA.isTextEmpty(opts.userText) && opts.userText !== prompt.user) {
      // In der Vorschau geändert: zur Sicherheit noch einmal anonymisieren
      prompt.user = BA.anonymizeText(opts.userText).text;
    }
    var models = BA.modelChain(cfg);
    var sentText = 'System: ' + prompt.system + '\n\n' + prompt.user;
    var lastCls = null;
    var groundingWanted = !!opts.grounding;
    function elapsed() { return now() - started; }
    function remaining() { return totalMs - elapsed(); }
    function fin(r) { r.timings = timings; r.elapsedMs = elapsed(); r.tried = tried; return r; }

    function offlineResult(kind, message) {
      var tpl = BA.offlineFallback(opts.task, opts);
      notes.push(message);
      return fin({ ok: true, offline: true, text: tpl, sources: [], queries: [], notes: notes, model: '', grounded: false,
        error: { kind: kind, message: message }, sent: sentText });
    }
    function endOfChain() {
      if (lastCls && lastCls.total) return offlineResult('timeout', BA.KI_MESSAGES.timeoutTotal);
      if (lastCls && /^(quota|server|model|forbidden|timeout|bad|empty|parse)$/.test(lastCls.kind)) {
        return offlineResult(lastCls.kind, lastCls.kind === 'quota' ? lastCls.message : lastCls.message + ' Bis dahin: Vorlage.');
      }
      var c = lastCls || { kind: 'other', message: BA.KI_MESSAGES.other };
      return fin({ ok: false, error: { kind: c.kind, message: c.message }, notes: notes, sent: sentText });
    }

    // Durchlauf über die Kette; useGrounding fest pro Durchlauf.
    function pass(useGrounding) {
      var groundRefused = 0;
      function tryModel(mi) {
        if (mi >= models.length) {
          if (useGrounding && groundRefused > 0 && remaining() > minSliceMs) return null; // Signal: ohne Suche nochmal
          return endOfChain();
        }
        var rem = remaining();
        if (rem <= minSliceMs) { lastCls = { kind: 'timeout', total: true, message: BA.KI_MESSAGES.timeoutTotal }; return endOfChain(); }
        var model = models[mi];
        var tmo = Math.max(1, Math.min(perModelMs, rem));
        var body = BA.buildGeminiRequestBody(prompt, useGrounding, model);
        onProgress({ model: model, index: mi, grounding: useGrounding, elapsedMs: elapsed() });
        tried.push(model + (useGrounding ? '+Suche' : ''));
        var t0 = now();
        return withTimeout(Promise.resolve().then(function () {
          return opts.transport({ method: 'POST', url: BA.geminiUrl(model, 'generate'), body: JSON.stringify(body), key: key, timeoutMs: tmo });
        }), tmo, opts.graceMs).then(function (res) {
          res = res || { status: 0, text: '' };
          timings.push({ model: model, grounding: useGrounding, status: res.timeout ? 'timeout' : res.status, ms: now() - t0 });
          if (res.status === 200) {
            var p = BA.parseGeminiResponse(res.text);
            if (!p.ok) {
              var m = BA.KI_MESSAGES[p.reason] || BA.KI_MESSAGES.other;
              if (p.reason === 'blocked') return fin({ ok: false, error: { kind: 'blocked', message: m }, notes: notes, sent: sentText });
              lastCls = { kind: p.reason, message: m };
              return tryModel(mi + 1);
            }
            if (useGrounding && !p.sources.length) notes.push(BA.KI_NOTES.noSources);
            if (mi > 0) notes.push(useGrounding ? BA.KI_NOTES.groundingModel : BA.KI_NOTES.fallbackModel);
            return fin({ ok: true, offline: false, text: BA.stripMarkdown(p.text), sources: p.sources, queries: p.queries, notes: notes,
              model: model, grounded: useGrounding && p.grounded, sent: sentText });
          }
          if (res.timeout) {
            lastCls = { kind: 'timeout', status: 0, message: BA.KI_MESSAGES.timeout, total: remaining() <= minSliceMs };
            return tryModel(mi + 1); // nächstes Modell (keine Wiederholung)
          }
          var cls = BA.classifyGeminiError(res.status, res.text);
          lastCls = cls;
          if (cls.kind === 'offline') return offlineResult('offline', BA.KI_MESSAGES.offline + ' Hier eine Vorlage.');
          if (cls.kind === 'key' || cls.kind === 'region') return fin({ ok: false, error: { kind: cls.kind, message: cls.message }, notes: notes, sent: sentText });
          // Suche nicht erlaubt / eigenes Limit: nächstes Modell MIT Suche probieren
          if (useGrounding && (cls.kind === 'quota' || cls.kind === 'forbidden' || cls.kind === 'bad')) groundRefused++;
          // 503/überlastet, 429, 404 …: sofort nächstes Modell, kein Warten, keine Wiederholung
          return tryModel(mi + 1);
        });
      }
      return tryModel(0);
    }

    return pass(groundingWanted).then(function (r) {
      if (r) return r;
      notes.push(BA.KI_NOTES.groundingOff);
      return pass(false).then(function (r2) {
        return r2 || endOfChain();
      });
    });
  }

  /** Schlüssel testen: GET models/{id} (kostenlos, erzeugt keinen Text). */
  function testKey(cfg, transport) {
    var key = effectiveKey(cfg);
    if (!key) return Promise.resolve({ ok: false, kind: 'nokey', message: BA.KI_MESSAGES.nokey });
    var model = BA.cleanModel(cfg.model, BA.DEFAULT_GEMINI_MODEL);
    return Promise.resolve().then(function () {
      return transport({ method: 'GET', url: BA.geminiUrl(model, 'get'), body: '', key: key, timeoutMs: 30000 });
    }).then(function (r) { return r || { status: 0, text: '' }; }, function () { return { status: 0, text: '' }; })
      .then(function (r) {
        if (r.status === 200) return { ok: true, kind: 'ok', message: 'Der Schlüssel funktioniert. KI bereit (erstes Modell ' + model + ').' };
        var c = BA.classifyGeminiError(r.status, r.text);
        if (c.kind === 'quota') return { ok: true, kind: 'quota', message: 'Der Schlüssel funktioniert, aber das Tageslimit ist gerade erreicht.' };
        if (c.kind === 'model') return { ok: false, kind: 'model', message: 'Der Schlüssel scheint zu gehen, aber das Modell „' + model + '“ gibt es nicht. Bitte Modell-Feld leeren.' };
        return { ok: false, kind: c.kind, message: c.message };
      });
  }

  /** fetch-Transport (Browser / Edge-Fallback). Schlüssel im Header, nicht in der URL. Mit Zeitlimit. */
  function fetchTransport(req) {
    if (!BA.isGeminiUrl(req.url)) return Promise.resolve({ status: 0, text: '' });
    var init = { method: req.method, headers: { 'x-goog-api-key': req.key }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
    if (req.method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = req.body; }
    var ctrl = typeof AbortController === 'function' ? new AbortController() : null;
    var timedOut = false, timer = null;
    if (ctrl) {
      init.signal = ctrl.signal;
      timer = setTimeout(function () { timedOut = true; ctrl.abort(); }, req.timeoutMs > 0 ? req.timeoutMs : BA.GEMINI_TIMEOUT_MS);
    }
    return fetch(req.url, init).then(function (r) {
      return r.text().then(function (t) { clearTimeout(timer); return { status: r.status, text: t }; });
    }).then(null, function () { clearTimeout(timer); return { status: 0, text: '', timeout: timedOut }; });
  }

  var api = { run: run, testKey: testKey, fetchTransport: fetchTransport, effectiveKey: effectiveKey, keyStatus: keyStatus,
    builtinKey: builtinKey, backoffMs: backoffMs, migrateCfg: migrateCfg, withTimeout: withTimeout, preparePrompt: preparePrompt };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BAKi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
