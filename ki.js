/* Bürger-Anliegen 2.1.0 – KI-Ablauf (Gemini). Ohne DOM, in Node testbar.
   Netz nur über die übergebene "transport"-Funktion und nur zu generativelanguage.googleapis.com.
   Ablauf: Anfrage (optional mit Google-Suche) -> bei Such-Fehler ohne Suche -> bei 429/5xx einmal
   warten und wiederholen -> Ersatz-Modell -> Offline-Vorlage. Keine eigenen Mengen-Grenzen. */
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

  /**
   * run(opts) -> Promise<result>
   * opts: task, input, art, anliegen, data, cfg {key, model, fallbackModel, enabled}, grounding (bool),
   *       transport(req) -> Promise<{status, text}>  (req: {method:'POST'|'GET', url, body, key})
   *       sleep(ms) -> Promise
   * result: {ok, text, sources, queries, notes[], model, grounded, offline(bool), error{kind,message}, sent}
   */
  function run(opts) {
    var cfg = opts.cfg || {};
    var sleep = opts.sleep || function (ms) { return new Promise(function (r) { setTimeout(r, ms); }); };
    var notes = [];
    if (cfg.enabled === false) return Promise.resolve({ ok: false, error: { kind: 'off', message: BA.KI_MESSAGES.off }, notes: notes });
    var key = effectiveKey(cfg);
    if (!key) return Promise.resolve({ ok: false, error: { kind: 'nokey', message: BA.KI_MESSAGES.nokey }, notes: notes });
    var prompt = BA.buildKiPrompt(opts.task, opts);
    if (!prompt) return Promise.resolve({ ok: false, error: { kind: 'other', message: BA.KI_MESSAGES.other }, notes: notes });
    var models = [BA.cleanModel(cfg.model, BA.DEFAULT_GEMINI_MODEL)];
    var fb = BA.cleanModel(cfg.fallbackModel, BA.FALLBACK_GEMINI_MODEL);
    if (models.indexOf(fb) < 0) models.push(fb);
    var grounding = !!opts.grounding;
    var sentText = 'System: ' + prompt.system + '\n\n' + prompt.user;
    var lastCls = null;

    function offlineResult(kind, message) {
      var tpl = BA.offlineFallback(opts.task, opts);
      notes.push(message);
      return { ok: true, offline: true, text: tpl, sources: [], queries: [], notes: notes, model: '', grounded: false,
        error: { kind: kind, message: message }, sent: sentText };
    }

    function tryModel(mi) {
      if (mi >= models.length) {
        if (lastCls && (lastCls.kind === 'quota' || lastCls.kind === 'server' || lastCls.kind === 'model' || lastCls.kind === 'forbidden')) {
          return Promise.resolve(offlineResult(lastCls.kind, lastCls.kind === 'quota' ? BA.KI_MESSAGES.quota : lastCls.message + ' Bis dahin: Vorlage.'));
        }
        var c = lastCls || { kind: 'other', message: BA.KI_MESSAGES.other };
        return Promise.resolve({ ok: false, error: { kind: c.kind, message: c.message }, notes: notes, sent: sentText });
      }
      var model = models[mi];
      var retried = false;
      function attempt(useGrounding) {
        var body = BA.buildGeminiRequestBody(prompt, useGrounding);
        return Promise.resolve().then(function () {
          return opts.transport({ method: 'POST', url: BA.geminiUrl(model, 'generate'), body: JSON.stringify(body), key: key });
        }).then(function (res) { return res || { status: 0, text: '' }; }, function () { return { status: 0, text: '' }; })
          .then(function (res) {
            if (res.status === 200) {
              var p = BA.parseGeminiResponse(res.text);
              if (!p.ok) {
                var m = BA.KI_MESSAGES[p.reason] || BA.KI_MESSAGES.other;
                if (p.reason === 'blocked') return { ok: false, error: { kind: 'blocked', message: m }, notes: notes, sent: sentText };
                lastCls = { kind: p.reason, message: m };
                if (!retried) { retried = true; return attempt(useGrounding); }
                return tryModel(mi + 1);
              }
              if (useGrounding && !p.sources.length) notes.push(BA.KI_NOTES.noSources);
              if (mi > 0) notes.push(BA.KI_NOTES.fallbackModel);
              return { ok: true, offline: false, text: p.text, sources: p.sources, queries: p.queries, notes: notes,
                model: model, grounded: useGrounding && p.grounded, sent: sentText };
            }
            var cls = BA.classifyGeminiError(res.status, res.text);
            lastCls = cls;
            if (cls.kind === 'offline') return offlineResult('offline', BA.KI_MESSAGES.offline + ' Hier eine Vorlage.');
            if (cls.kind === 'key' || cls.kind === 'region') return { ok: false, error: { kind: cls.kind, message: cls.message }, notes: notes, sent: sentText };
            // Google-Suche kann eigenes Limit / keine Freigabe haben -> ohne Suche weiter (gleiches Modell)
            if (useGrounding && (cls.kind === 'quota' || cls.kind === 'forbidden' || cls.kind === 'bad')) {
              notes.push(BA.KI_NOTES.groundingOff);
              grounding = false;
              return attempt(false);
            }
            if ((cls.kind === 'quota' || cls.kind === 'server') && !retried) {
              retried = true;
              return sleep(backoffMs(cls, 0)).then(function () { return attempt(useGrounding); });
            }
            return tryModel(mi + 1);
          });
      }
      return attempt(grounding);
    }
    return tryModel(0);
  }

  /** Schlüssel testen: GET models/{id} (kostenlos, erzeugt keinen Text). */
  function testKey(cfg, transport) {
    var key = effectiveKey(cfg);
    if (!key) return Promise.resolve({ ok: false, kind: 'nokey', message: BA.KI_MESSAGES.nokey });
    var model = BA.cleanModel(cfg.model, BA.DEFAULT_GEMINI_MODEL);
    return Promise.resolve().then(function () {
      return transport({ method: 'GET', url: BA.geminiUrl(model, 'get'), body: '', key: key });
    }).then(function (r) { return r || { status: 0, text: '' }; }, function () { return { status: 0, text: '' }; })
      .then(function (r) {
        if (r.status === 200) return { ok: true, kind: 'ok', message: 'Der Schlüssel funktioniert. KI bereit (Modell ' + model + ').' };
        var c = BA.classifyGeminiError(r.status, r.text);
        if (c.kind === 'quota') return { ok: true, kind: 'quota', message: 'Der Schlüssel funktioniert, aber das Tageslimit ist gerade erreicht.' };
        if (c.kind === 'model') return { ok: false, kind: 'model', message: 'Der Schlüssel scheint zu gehen, aber das Modell „' + model + '“ gibt es nicht. Bitte Modell-Feld leeren.' };
        return { ok: false, kind: c.kind, message: c.message };
      });
  }

  /** fetch-Transport (Browser / Edge-Fallback). Schlüssel im Header, nicht in der URL. */
  function fetchTransport(req) {
    if (!BA.isGeminiUrl(req.url)) return Promise.resolve({ status: 0, text: '' });
    var init = { method: req.method, headers: { 'x-goog-api-key': req.key }, credentials: 'omit', referrerPolicy: 'no-referrer', cache: 'no-store' };
    if (req.method === 'POST') { init.headers['Content-Type'] = 'application/json'; init.body = req.body; }
    return fetch(req.url, init).then(function (r) {
      return r.text().then(function (t) { return { status: r.status, text: t }; });
    }, function () { return { status: 0, text: '' }; });
  }

  var api = { run: run, testKey: testKey, fetchTransport: fetchTransport, effectiveKey: effectiveKey, keyStatus: keyStatus, builtinKey: builtinKey, backoffMs: backoffMs };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BAKi = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
