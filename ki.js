/* Bürger-Anliegen 2.2.0 – KI-Ablauf (Gemini). Ohne DOM, in Node testbar.
   Netz nur über die übergebene "transport"-Funktion und nur zu generativelanguage.googleapis.com.
   Modell-Kette (Standard): gemini-3.8-flash (klügstes kostenloses) -> gemini-2.5-flash -> gemini-3.5-flash-lite -> Offline-Vorlage.
   Jedes Modell: maximales Nachdenken (thinkingLevel "high" bzw. thinkingBudget), viel Platz für die Antwort.
   Bei 429 (Limit) / 5xx: einmal kurz warten und wiederholen (bei "limit: 0" sofort weiter) -> nächstes Modell.
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
      enabled: c.enabled !== false, v: 2 };
    if (!(c.v >= 2)) {
      if (!out.model || out.model === 'gemini-2.5-flash') out.model = BA.DEFAULT_GEMINI_MODEL;
    }
    if (!out.model) out.model = BA.DEFAULT_GEMINI_MODEL;
    if (!out.fallbackModel) out.fallbackModel = BA.FALLBACK_GEMINI_MODEL;
    if (!out.liteModel) out.liteModel = BA.LITE_GEMINI_MODEL;
    return out;
  }

  /**
   * run(opts) -> Promise<result>
   * opts: task, input, art, anliegen, data, cfg {key, model, fallbackModel, liteModel, enabled}, grounding (bool),
   *       transport(req) -> Promise<{status, text, timeout?}>  (req: {method, url, body, key, timeoutMs})
   *       sleep(ms) -> Promise, onProgress({model, index, grounding}) optional
   * result: {ok, text, sources, queries, notes[], model, grounded, offline, error{kind,message}, sent, tried[]}
   */
  function run(opts) {
    var cfg = opts.cfg || {};
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var onProgress = typeof opts.onProgress === 'function' ? opts.onProgress : function () {};
    var notes = [];
    var tried = [];
    if (cfg.enabled === false) return Promise.resolve({ ok: false, error: { kind: 'off', message: BA.KI_MESSAGES.off }, notes: notes });
    var key = effectiveKey(cfg);
    if (!key) return Promise.resolve({ ok: false, error: { kind: 'nokey', message: BA.KI_MESSAGES.nokey }, notes: notes });
    var prompt = BA.buildKiPrompt(opts.task, opts);
    if (!prompt) return Promise.resolve({ ok: false, error: { kind: 'other', message: BA.KI_MESSAGES.other }, notes: notes });
    var models = BA.modelChain(cfg);
    var sentText = 'System: ' + prompt.system + '\n\n' + prompt.user;
    var lastCls = null;
    var groundingWanted = !!opts.grounding;

    function offlineResult(kind, message) {
      var tpl = BA.offlineFallback(opts.task, opts);
      notes.push(message);
      return { ok: true, offline: true, text: tpl, sources: [], queries: [], notes: notes, model: '', grounded: false,
        error: { kind: kind, message: message }, sent: sentText, tried: tried };
    }
    function endOfChain() {
      if (lastCls && /^(quota|server|model|forbidden|timeout|bad|empty|parse)$/.test(lastCls.kind)) {
        return offlineResult(lastCls.kind, lastCls.kind === 'quota' ? BA.KI_MESSAGES.quota : lastCls.message + ' Bis dahin: Vorlage.');
      }
      var c = lastCls || { kind: 'other', message: BA.KI_MESSAGES.other };
      return { ok: false, error: { kind: c.kind, message: c.message }, notes: notes, sent: sentText, tried: tried };
    }

    // Durchlauf über die Kette; useGrounding fest pro Durchlauf.
    function pass(useGrounding) {
      var groundRefused = 0;
      function tryModel(mi) {
        if (mi >= models.length) {
          if (useGrounding && groundRefused > 0) return null; // Signal: ohne Suche nochmal
          return endOfChain();
        }
        var model = models[mi];
        var retried = false;
        function attempt() {
          var body = BA.buildGeminiRequestBody(prompt, useGrounding, model);
          onProgress({ model: model, index: mi, grounding: useGrounding });
          tried.push(model + (useGrounding ? '+Suche' : ''));
          return Promise.resolve().then(function () {
            return opts.transport({ method: 'POST', url: BA.geminiUrl(model, 'generate'), body: JSON.stringify(body), key: key, timeoutMs: BA.GEMINI_TIMEOUT_MS });
          }).then(function (res) { return res || { status: 0, text: '' }; }, function () { return { status: 0, text: '' }; })
            .then(function (res) {
              if (res.status === 200) {
                var p = BA.parseGeminiResponse(res.text);
                if (!p.ok) {
                  var m = BA.KI_MESSAGES[p.reason] || BA.KI_MESSAGES.other;
                  if (p.reason === 'blocked') return { ok: false, error: { kind: 'blocked', message: m }, notes: notes, sent: sentText, tried: tried };
                  lastCls = { kind: p.reason, message: m };
                  if (!retried) { retried = true; return attempt(); }
                  return tryModel(mi + 1);
                }
                if (useGrounding && !p.sources.length) notes.push(BA.KI_NOTES.noSources);
                if (mi > 0) notes.push(useGrounding ? BA.KI_NOTES.groundingModel : BA.KI_NOTES.fallbackModel);
                return { ok: true, offline: false, text: p.text, sources: p.sources, queries: p.queries, notes: notes,
                  model: model, grounded: useGrounding && p.grounded, sent: sentText, tried: tried };
              }
              if (res.timeout) {
                lastCls = { kind: 'timeout', status: 0, message: BA.KI_MESSAGES.timeout };
                return tryModel(mi + 1); // schnelleres Modell probieren
              }
              var cls = BA.classifyGeminiError(res.status, res.text);
              lastCls = cls;
              if (cls.kind === 'offline') return offlineResult('offline', BA.KI_MESSAGES.offline + ' Hier eine Vorlage.');
              if (cls.kind === 'key' || cls.kind === 'region') return { ok: false, error: { kind: cls.kind, message: cls.message }, notes: notes, sent: sentText, tried: tried };
              // Suche nicht erlaubt / eigenes Limit: nächstes Modell MIT Suche probieren (ohne Warten)
              if (useGrounding && (cls.kind === 'quota' || cls.kind === 'forbidden' || cls.kind === 'bad')) {
                groundRefused++;
                return tryModel(mi + 1);
              }
              if ((cls.kind === 'quota' || cls.kind === 'server') && !retried && !cls.hardLimit) {
                retried = true;
                return sleep(backoffMs(cls, 0)).then(attempt);
              }
              return tryModel(mi + 1);
            });
        }
        return attempt();
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
    builtinKey: builtinKey, backoffMs: backoffMs, migrateCfg: migrateCfg };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BAKi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
