(function () {
  'use strict';
  if (!window.BA) { console.error('BA fehlt'); return; }
  var $ = function (id) { return document.getElementById(id); };
  // Android: Java-Brücke "BAAndroid" auf dieselben Namen abbilden wie die Windows-Bindungen.
  if (window.BAAndroid) {
    var AB = window.BAAndroid;
    window.baLoadNumber = function () { return AB.loadNumber(); };
    window.baSaveNumber = function (n) { return AB.saveNumber(n || ''); };
    window.baLoadMode = function () { return AB.loadMode(); };
    window.baSaveMode = function (m) { return AB.saveMode(m || ''); };
    window.baLoadData = function () { return AB.loadData(); };
    window.baSaveData = function (t) { if (!AB.saveData(t)) throw new Error('save'); return true; };
    window.baOpenExternal = function (u) { AB.openExternal(u); };
    window.baSendWhatsApp = function (msg, num, photo) { AB.sendWhatsApp(msg, num || '', !!photo); };
    // 2.3.0: Chat selbst wählen (Link weitergeben) – Android nimmt dann NICHT die gespeicherte Nummer
    if (typeof AB.sendWhatsAppAnyChat === 'function') window.baSendWhatsAppAnyChat = function (msg) { AB.sendWhatsAppAnyChat(msg); };
    // 2.4.0: Ergebnis (gespeichert / abgebrochen) kommt per window.BA_onFileResult zurück
    var fileWait = null;
    window.BA_onFileResult = function (ok) { var f = fileWait; fileWait = null; if (f) f(!!ok); };
    window.baSaveFile = function (name, text) {
      if (typeof AB.fileResults !== 'function') { AB.shareFile(name, text); return true; }
      return new Promise(function (resolve) {
        if (fileWait) fileWait(false);
        fileWait = function (ok) { resolve(ok ? true : { cancelled: true }); };
        AB.shareFile(name, text);
      });
    };
    window.baSaveBytes = function (name, b64) {
      if (typeof AB.shareBytes === 'function') { AB.shareBytes(name, b64); return true; }
      // Fallback: share as text will corrupt PDF – refuse
      return false;
    };
    window.baLoadKi = function () { return AB.loadKi ? AB.loadKi() : ''; };
    window.baSaveKi = function (t) { return AB.saveKi ? AB.saveKi(t) : false; };
    var geminiWait = {}, geminiSeq = 0;
    window.BA_onGemini = function (id, res) {
      var f = geminiWait[id]; delete geminiWait[id];
      if (f) f(res && typeof res === 'object' ? res : { status: 0, text: '' });
    };
    window.baGemini = function (method, url, body, key) {
      if (typeof AB.geminiAsync !== 'function') return Promise.resolve({ status: 0, text: '' });
      return new Promise(function (resolve) {
        var id = 'g' + (++geminiSeq).toString(36);
        geminiWait[id] = resolve;
        AB.geminiAsync(id, method, url, body || '', key || '');
      });
    };
    window.baAddCalendar = function (json) { AB.addCalendar(json); };
    window.baCopy = function (t) { AB.copy(t); };
    window.baPickPhoto = function () { AB.pickPhoto(); };
    window.baClearPhoto = function () { AB.clearPhoto(); };
    window.baLocate = function () { AB.requestLocation(); };
  }
  var now = function () { return new Date().toISOString(); };
  var KEY_NUM = 'buergeranliegen-nummer';
  var KEY_MODE = 'buergeranliegen-mode';
  var KEY_DATA = 'buergeranliegen-data';
  var KEY_CONSENT = 'buergeranliegen-consent-seen';
  var KEY_KI = 'buergeranliegen-ki';
  var KEY_KI_CONSENT = 'buergeranliegen-ki-consent';
  var KEY_LINK_NUM = 'buergeranliegen-link-mit-nummer';
  var KEY_SAFETY = 'buergeranliegen-sicherheitskopie';   // 2.4.0: automatische Sicherheitskopie vor Laden/Löschen
  var KEY_HELFER_INTRO = 'buergeranliegen-helfer-intro-gesehen';
  var SS_SENT = 'buergeranliegen-gesendet';              // 2.4.0: nur sessionStorage (dieser Tab)
  var SS_AN = 'buergeranliegen-an';                      // 2.4.0: Nummer aus Hajos Link, nur für diesen Besuch
  function ssGet(k) { try { return sessionStorage.getItem(k) || ''; } catch (e) { return ''; } }
  function ssSet(k, v) { try { if (v) sessionStorage.setItem(k, v); else sessionStorage.removeItem(k); } catch (e) {} }
  var UA = (navigator.userAgent || '');
  // iPhone/iPad (iPadOS meldet sich als Mac mit Touch)
  var IS_IOS = /iPhone|iPad|iPod/.test(UA) || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
  var IS_MOBILE = IS_IOS || /Android|Mobile/i.test(UA);

  // ---- Speicher: Windows-Bindungen oder localStorage
  var store = {
    getNum: function () {
      if (typeof window.baLoadNumber === 'function') {
        return Promise.resolve(window.baLoadNumber()).then(function (v) { return v || ''; }, function () { return ''; });
      }
      try { return Promise.resolve(localStorage.getItem(KEY_NUM) || ''); } catch (e) { return Promise.resolve(''); }
    },
    setNum: function (v) {
      try { if (v) localStorage.setItem(KEY_NUM, v); else localStorage.removeItem(KEY_NUM); } catch (e) {}
      if (typeof window.baSaveNumber === 'function') return Promise.resolve(window.baSaveNumber(v));
      return Promise.resolve();
    },
    getMode: function () {
      if (typeof window.baLoadMode === 'function') {
        return Promise.resolve(window.baLoadMode()).then(function (v) { return v || ''; }, function () { return ''; });
      }
      try { return Promise.resolve(localStorage.getItem(KEY_MODE) || ''); } catch (e) { return Promise.resolve(''); }
    },
    setMode: function (v) {
      try { if (v) localStorage.setItem(KEY_MODE, v); else localStorage.removeItem(KEY_MODE); } catch (e) {}
      if (typeof window.baSaveMode === 'function') return Promise.resolve(window.baSaveMode(v));
      return Promise.resolve();
    },
    getData: function () {
      if (typeof window.baLoadData === 'function') {
        return Promise.resolve(window.baLoadData()).then(function (t) { return BA.parseData(t || ''); }, function () { return BA.emptyData(); });
      }
      try { return Promise.resolve(BA.parseData(localStorage.getItem(KEY_DATA) || '')); }
      catch (e) { return Promise.resolve(BA.emptyData()); }
    },
    setData: function (d) {
      var t = JSON.stringify({ version: 2, mode: d.mode || '', anliegen: d.anliegen, ideen: d.ideen, termine: d.termine, lastBackup: d.lastBackup || '' });
      try { localStorage.setItem(KEY_DATA, t); state.canStore = true; }
      catch (e) { state.canStore = false; }
      if (typeof window.baSaveData === 'function') {
        var fail = function () { state.canStore = false; toast('Speichern hat nicht geklappt. Bitte eine Sicherung machen.'); };
        try {
          return Promise.resolve(window.baSaveData(t)).then(function () { state.canStore = true; }, fail);
        } catch (e) { fail(); return Promise.resolve(); }
      }
      return Promise.resolve();
    },

    getKi: function () {
      if (typeof window.baLoadKi === 'function') {
        return Promise.resolve(window.baLoadKi()).then(function (t) {
          try { return t ? JSON.parse(t) : { key: '', model: '', enabled: true }; } catch (e) { return { key: '', model: '', enabled: true }; }
        }, function () { return { key: '', model: '', enabled: true }; });
      }
      try {
        var raw = localStorage.getItem(KEY_KI);
        return Promise.resolve(raw ? JSON.parse(raw) : { key: '', model: '', enabled: true });
      } catch (e) { return Promise.resolve({ key: '', model: '', enabled: true }); }
    },
    setKi: function (cfg) {
      var t = JSON.stringify({ key: cfg.key || '', model: cfg.model || '', fallbackModel: cfg.fallbackModel || '',
        liteModel: cfg.liteModel || '', enabled: cfg.enabled !== false, v: 3 });
      if (typeof window.baSaveKi === 'function') {
        try { return Promise.resolve(window.baSaveKi(t)); } catch (e) { return Promise.resolve(); }
      }
      try { localStorage.setItem(KEY_KI, t); } catch (e) {}
      return Promise.resolve();
    },
    getKiConsent: function () {
      try { return localStorage.getItem(KEY_KI_CONSENT) === '1'; } catch (e) { return false; }
    },
    setKiConsent: function () {
      try { localStorage.setItem(KEY_KI_CONSENT, '1'); } catch (e) {}
    }

  };

  var state = {
    mode: '', number: '', data: BA.emptyData(), screen: 's-start', prev: null,
    loc: null, photo: null, editing: null, canStore: true, toastT: 0, ki: BAKi.migrateCfg({}), lastKi: null,
    linkNumber: '', lastMsg: null, snap: null, sendLock: 0, lastOrder: null, safety: null
  };
  /** Gespeicherte Nummer hat Vorrang. Sonst die Nummer aus Hajos Link (nur für diesen Besuch, nicht gespeichert). */
  function effNumber() { return state.number || state.linkNumber || ''; }
  var TITLES = {
    's-start': ['Bürger-Anliegen Bad Pyrmont', 'für Hajo Bönke · SPD Bad Pyrmont'],
    's-buerger': ['Anliegen senden', 'An Hajo per WhatsApp'],
    's-settings': ['Einstellungen', 'Nummer und Modus'],
    's-helfer': ['Helfer-Bereich', 'Nur auf diesem Gerät'],
    's-anliegen': ['Anliegen-Liste', 'Filter und Status'],
    's-anliegen-edit': ['Anliegen', 'Bearbeiten'],
    's-ideen': ['Ideen-Sammlung', 'Vorlagen und eigene Ideen'],
    's-idee-edit': ['Idee', 'Bearbeiten'],
    's-termine': ['Termine & Aufgaben', 'Checklisten und Kalender'],
    's-termin-edit': ['Termin', 'Bearbeiten'],
    's-summary': ['Wochen-Zusammenfassung', 'Für Hajo'],
    's-backup': ['Sichern & Export', 'Sicherung und Tabelle'],
    's-pdf': ['PDF erstellen', 'Berichte offline'],
    's-ki': ['KI-Assistent', 'Entwürfe prüfen'],
    's-link': ['Bürger-Link', 'QR-Code zum Weitergeben']
  };

  function toast(msg) {
    var t = $('toast'); t.textContent = msg; t.hidden = false; t.classList.remove('undo');
    clearTimeout(state.toastT);
    state.toastT = setTimeout(function () { t.hidden = true; }, 4000);
  }
  /** 2.4.0: Hinweis mit „Rückgängig“ (z. B. nach Status-Tipp). */
  function toastUndo(msg, undo) {
    var t = $('toast'); t.textContent = ''; t.hidden = false; t.classList.add('undo');
    var sp = document.createElement('span'); sp.textContent = msg; t.appendChild(sp);
    var b = document.createElement('button'); b.type = 'button'; b.id = 'toastUndo'; b.textContent = 'Rückgängig';
    b.addEventListener('click', function () { clearTimeout(state.toastT); t.hidden = true; t.classList.remove('undo'); undo(); });
    t.appendChild(b);
    clearTimeout(state.toastT);
    state.toastT = setTimeout(function () { t.hidden = true; t.classList.remove('undo'); }, 8000);
  }
  /** opts: {yes, no} – eigene Beschriftung der Knöpfe. */
  function confirmDlg(msg, opts) {
    opts = opts || {};
    return new Promise(function (res) {
      var back = document.activeElement;
      $('modalText').textContent = msg;
      $('modalYes').textContent = opts.yes || 'Ja';
      $('modalNo').textContent = opts.no || 'Abbrechen';
      $('modal').hidden = false;
      function onKey(e) { if (e.key === 'Escape') { e.preventDefault(); done(false); } }
      function done(y) {
        $('modal').hidden = true;
        $('modalYes').onclick = null; $('modalNo').onclick = null;
        document.removeEventListener('keydown', onKey);
        try { if (back && back.focus) back.focus(); } catch (e) {}
        res(y);
      }
      $('modalYes').onclick = function () { done(true); };
      $('modalNo').onclick = function () { done(false); };
      document.addEventListener('keydown', onKey);
      try { $('modalYes').focus(); } catch (e) {}
    });
  }
  function openUrl(url) {
    if (!BA.isAllowedExternal(url) && url.indexOf('https://wa.me/') !== 0) return;
    if (typeof window.baOpenExternal === 'function') { window.baOpenExternal(url); return; }
    // Handy: WhatsApp im selben Tab öffnen (kein leerer Zusatz-Tab, kein Pop-up-Blocker, v. a. iPhone Safari).
    if (IS_MOBILE && url.indexOf('https://wa.me/') === 0) { try { window.location.href = url; } catch (e0) {} return; }
    var w = null;
    try { w = window.open(url, '_blank'); if (w) try { w.opener = null; } catch (e2) {} } catch (e) {}
    if (!w) try { window.location.href = url; } catch (e3) {}
  }
  /** noNumber: Chat selbst wählen (z. B. Link an Bekannte weitergeben). */
  function sendWA(msg, withPhoto, noNumber) {
    var num = noNumber ? '' : effNumber();
    if (noNumber && typeof window.baSendWhatsAppAnyChat === 'function') {
      window.__lastUrl = 'bridge:anychat';
      window.baSendWhatsAppAnyChat(msg);
      return;
    }
    if (typeof window.baSendWhatsApp === 'function') {
      window.__lastUrl = 'bridge:' + (withPhoto ? 'photo:' : '') + num;
      window.baSendWhatsApp(msg, num, !!withPhoto);
      return;
    }
    var url = BA.buildWhatsAppUrl(msg, num);
    window.__lastUrl = url;
    openUrl(url);
  }
  /** iPhone: Dateien über das Teilen-Menü („In Dateien sichern“, WhatsApp …). Gibt true zurück, wenn geteilt wird. */
  function shareFileIOS(name, mime, data) {
    if (!IS_IOS || typeof navigator.share !== 'function' || typeof navigator.canShare !== 'function' || typeof File !== 'function') return false;
    var f;
    try { f = new File([data], name, { type: mime }); } catch (e) { return false; }
    try { if (!navigator.canShare({ files: [f] })) return false; } catch (e) { return false; }
    // 2.4.0: Promise<boolean> – false, wenn abgebrochen (dann bleibt z. B. die Sicherungs-Erinnerung stehen)
    return navigator.share({ files: [f], title: name }).then(function () { toast('Datei: ' + name); return true; }, function (err) {
      if (err && err.name === 'AbortError') { toast('Abgebrochen – nichts gespeichert.'); return false; }
      blobDownload(name, mime, data); return true;
    });
  }
  function blobDownload(name, mime, data) {
    var blob = new Blob([data], { type: mime });
    var a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(function () { try { URL.revokeObjectURL(a.href); } catch (e) {} }, 60000);
    toast('Datei gespeichert: ' + name);
  }
  function downloadBytes(name, mime, u8) {
    if (typeof window.baSaveBytes === 'function') {
      try {
        var b64 = (window.BAPdf && BAPdf.toBase64) ? BAPdf.toBase64(u8) : btoa(Array.prototype.map.call(u8, function (x) { return String.fromCharCode(x); }).join(''));
        return Promise.resolve(window.baSaveBytes(name, b64)).then(function (p) {
          if (typeof p === 'string' && p) toast('Gespeichert in: ' + p);
          else toast('PDF: ' + name);
        }, function () { toast('Speichern hat nicht geklappt.'); });
      } catch (e) { toast('Speichern hat nicht geklappt.'); return Promise.resolve(); }
    }
    try {
      if (!shareFileIOS(name, mime || 'application/pdf', u8)) blobDownload(name, mime || 'application/pdf', u8);
    } catch (e) { toast('PDF konnte nicht gespeichert werden.'); }
    return Promise.resolve();
  }
  // 2.4.0: große Bibliotheken erst bei Bedarf laden (Bürger-Formular erscheint sofort, auch bei langsamem Netz)
  var scriptCache = {};
  function ensureScript(src, ready) {
    if (ready()) return Promise.resolve(true);
    if (scriptCache[src]) return scriptCache[src];
    scriptCache[src] = new Promise(function (resolve) {
      var s = document.createElement('script');
      s.src = src; s.async = true;
      s.onload = function () { resolve(ready()); };
      s.onerror = function () { delete scriptCache[src]; s.remove(); resolve(false); };
      document.head.appendChild(s);
    });
    return scriptCache[src];
  }
  function ensureQr() {
    return Promise.all([
      ensureScript('vendor/qrcode.js', function () { return typeof window.qrcode === 'function'; }),
      ensureScript('qr.js', function () { return !!window.BAQr; })
    ]).then(function (r) { return r[0] && r[1]; });
  }
  function ensurePdf() {
    return Promise.all([
      ensureScript('vendor/jspdf.umd.min.js', function () { return !!((window.jspdf && window.jspdf.jsPDF) || window.jsPDF); }),
      ensureScript('pdf.js', function () { return !!window.BAPdf; }),
      ensureQr(),
      // Unicode-Schrift (DejaVu Sans, Auszug): fehlt sie, schreibt die PDF fremde Buchstaben ohne Akzente (ş → s)
      ensureScript('vendor/pdffont.js', function () { return !!window.BA_PDF_FONT; })
    ]).then(function (r) { return r[0] && r[1]; });
  }
  function makePdfAndSave(spec, kind) {
    if ($('pdfMsg')) { $('pdfMsg').hidden = false; $('pdfMsg').textContent = 'PDF wird erstellt …'; }
    return ensurePdf().then(function (ok) {
      if (!ok) { toast('PDF-Bibliothek konnte nicht geladen werden. Bitte Internet prüfen und nochmal tippen.'); if ($('pdfMsg')) $('pdfMsg').hidden = true; return; }
      var bytes, name = BA.pdfFileName(kind);
      try { bytes = BAPdf.render(spec); } catch (e) { toast('PDF-Erstellung fehlgeschlagen.'); if ($('pdfMsg')) $('pdfMsg').hidden = true; return; }
      return downloadBytes(name, 'application/pdf', bytes).then(function () {
        if ($('pdfMsg')) { $('pdfMsg').hidden = false; $('pdfMsg').textContent = 'PDF erstellt: ' + name; }
      });
    });
  }
  /** Promise<boolean>: true = gespeichert/geteilt (soweit erkennbar), false = abgebrochen oder Fehler. */
  function download(name, mime, text) {
    if (typeof window.baSaveFile === 'function') {
      try {
        return Promise.resolve(window.baSaveFile(name, text)).then(function (p) {
          if (p && typeof p === 'object' && p.cancelled) { toast('Abgebrochen – nichts gespeichert.'); return false; }
          if (p === false || p === '') return false;
          if (typeof p === 'string' && p) toast('Gespeichert in: ' + p);
          return true;
        }, function () { toast('Speichern hat nicht geklappt.'); return false; });
      } catch (e) { toast('Speichern hat nicht geklappt.'); return Promise.resolve(false); }
    }
    try {
      // .ics nicht teilen: Safari öffnet Kalender-Dateien direkt im Kalender.
      var sh = /\.ics$/.test(name) ? false : shareFileIOS(name, mime, text);
      if (sh) return sh;
      blobDownload(name, mime, text);
      return Promise.resolve(true);
    } catch (e) { toast('Speichern hat nicht geklappt.'); return Promise.resolve(false); }
  }
  function copyText(t) {
    if (typeof window.baCopy === 'function') { window.baCopy(t); toast('Kopiert'); return Promise.resolve(); }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(t).then(function () { toast('Kopiert'); }, function () { fallbackCopy(t); });
    }
    fallbackCopy(t); return Promise.resolve();
  }
  function fallbackCopy(t) {
    var ta = document.createElement('textarea');
    ta.value = t; ta.setAttribute('readonly', ''); ta.style.position = 'fixed'; ta.style.left = '-9999px';
    document.body.appendChild(ta); ta.select();
    try { document.execCommand('copy'); toast('Kopiert'); } catch (e) { toast('Kopieren nicht möglich'); }
    ta.remove();
  }

  function fillSelect(el, items, withEmpty, emptyLabel) {
    el.innerHTML = '';
    if (withEmpty) {
      var o = document.createElement('option'); o.value = ''; o.textContent = emptyLabel || 'Bitte wählen …'; el.appendChild(o);
    }
    items.forEach(function (it) {
      var o = document.createElement('option');
      if (typeof it === 'string') { o.value = it; o.textContent = it; }
      else { o.value = it.v; o.textContent = it.t; }
      el.appendChild(o);
    });
  }
  /** Ortsteile + „ohne Angabe“ (alte Einträge) für Filter. */
  function ortsteilFilterOptions() {
    return BA.ortsteilOptions().concat([{ v: BA.FILTER_OHNE_ORTSTEIL, t: BA.OHNE_ORTSTEIL + ' ohne Angabe' }]);
  }
  function initSelects() {
    fillSelect($('thema'), BA.THEMEN, true);
    fillSelect($('ortsteil'), BA.ortsteilOptions(), true);
    fillSelect($('fThema'), BA.THEMEN, true, 'Alle Themen');
    fillSelect($('fOrtsteil'), ortsteilFilterOptions(), true, 'Alle Ortsteile');
    fillSelect($('aeOrtsteil'), BA.ortsteilOptions(), true, BA.OHNE_ORTSTEIL + ' (keine Angabe)');
    fillSelect($('fStatus'), BA.STATUS, true, 'Alle');
    fillSelect($('aeThema'), BA.THEMEN, false);
    fillSelect($('aeDring'), BA.DRINGLICHKEIT, false);
    fillSelect($('aeStatus'), BA.STATUS, false);
    fillSelect($('teVorlage'), Object.keys(BA.CHECKLISTEN).map(function (k) { return { v: k, t: k }; }), true, 'Vorlage wählen …');
    if ($('pdfThema')) fillSelect($('pdfThema'), BA.THEMEN, true, 'Alle Themen');
    if ($('pdfOrtsteil')) fillSelect($('pdfOrtsteil'), ortsteilFilterOptions(), true, 'Alle Ortsteile');
    if ($('pdfStatus')) fillSelect($('pdfStatus'), BA.STATUS, true, 'Alle');
  }

  function show(id) {
    document.querySelectorAll('.screen').forEach(function (s) { s.hidden = true; });
    var el = $(id); if (!el) return;
    if (id === 's-helfer') refreshHelfer(); // 2.3.0: Zähler immer aktuell (auch nach „Zurück“)
    el.hidden = false;
    state.prev = state.screen; state.screen = id;
    var ti = TITLES[id] || TITLES['s-start'];
    $('topTitle').textContent = ti[0];
    $('topSub').textContent = ti[1];
    var root = id === 's-start' || (id === 's-buerger' && state.mode === 'buerger') || (id === 's-helfer' && state.mode === 'helfer');
    $('backBtn').hidden = !!root;
    // 2.4.0: Im Bürger-Modus kein auffälliges ⚙ (lange auf den Titel drücken oder unten „Einstellungen (für Helfer)“)
    $('gearBtn').hidden = id === 's-buerger' && state.mode === 'buerger';
    if (id === 's-anliegen-edit' || id === 's-idee-edit' || id === 's-termin-edit') state.snap = editSnap(id); else state.snap = null;
    window.scrollTo(0, 0);
  }
  // ---- 2.4.0: ungespeicherte Änderungen erkennen
  var EDIT_FIELDS = {
    's-anliegen-edit': ['aeThema', 'aeDring', 'aeText', 'aeOrtsteil', 'aeOrt', 'aeKontakt', 'aeStatus', 'aePaste'],
    's-idee-edit': ['ieTitel', 'ieText'],
    's-termin-edit': ['teTitel', 'teDatum', 'teZeit', 'teDauer', 'teOrt', 'teNotiz', 'teDone', 'teItem']
  };
  function editSnap(id) {
    var f = EDIT_FIELDS[id]; if (!f) return null;
    var o = f.map(function (k) { var el = $(k); return el ? (el.type === 'checkbox' ? String(el.checked) : el.value) : ''; });
    if (id === 's-termin-edit') o.push(JSON.stringify(teChecks));
    return JSON.stringify(o);
  }
  function isDirty() {
    return !!(state.snap && EDIT_FIELDS[state.screen] && editSnap(state.screen) !== state.snap);
  }
  /** Vor dem Verlassen eines Bearbeiten-Bildschirms fragen, wenn etwas geändert wurde. */
  function leaveEdit(next) {
    if (!isDirty()) { next(); return; }
    var isNew = !state.editing;
    confirmDlg((isNew ? 'Der neue Eintrag ist noch nicht gespeichert.' : 'Ihre Änderungen sind noch nicht gespeichert.') +
      '\nÄnderungen verwerfen?', { yes: 'Verwerfen', no: 'Weiter bearbeiten' }).then(function (ok) {
      if (ok) { state.snap = null; next(); }
    });
  }
  function goHome() {
    if (state.mode === 'buerger') show('s-buerger');
    else if (state.mode === 'helfer') { refreshHelfer(); show('s-helfer'); }
    else show('s-start');
  }
  function goBack() {
    if (isDirty()) { leaveEdit(goBack); return; }
    var s = state.screen;
    if (s === 's-settings') return goHome();
    if (s === 's-anliegen-edit') return show('s-anliegen');
    if (s === 's-idee-edit') return show('s-ideen');
    if (s === 's-termin-edit') return show('s-termine');
    if (s === 's-anliegen' || s === 's-ideen' || s === 's-termine' || s === 's-summary' || s === 's-backup' || s === 's-pdf' || s === 's-ki' || s === 's-link') return show('s-helfer');
    goHome();
  }
  function setMode(m) {
    state.mode = m;
    state.data.mode = m;
    return Promise.all([store.setMode(m), store.setData(state.data)]);
  }

  // ---- Bürger
  function showTarget() {
    var num = effNumber();
    $('target').textContent = state.number
      ? 'Ihre Nachricht geht an Hajo Bönke (Nummer +' + state.number + ').'
      : state.linkNumber
        ? 'Ihre Nachricht geht an Hajo Bönke: +' + state.linkNumber + ' (Nummer aus Hajos Link).'
        : 'Hinweis: Hajos Nummer fehlt. Am besten öffnen Sie den Link oder QR-Code von Hajo noch einmal. ' +
          'Sie können aber auch ohne Nummer senden: Dann wählen Sie den Chat mit Hajo in WhatsApp selbst aus.';
    $('target').className = num ? 'info' : 'warn';
    $('send').textContent = num ? 'Per WhatsApp an Hajo senden' : 'WhatsApp ohne Nummer öffnen';
  }
  function updateCounter() {
    var n = $('text').value.length, max = BA.MAX_CITIZEN_TEXT;
    $('textCount').textContent = n + ' von ' + max + ' Zeichen' + (n >= max ? ' – mehr geht nicht' : '');
    $('textCount').className = 'counter' + (n > max - 150 ? ' near' : '');
  }
  function updateOrtAnders() {
    $('ortAnders').hidden = $('ortsteil').value !== BA.ORT_UNBEKANNT;
  }
  function updateNotfall() {
    var d = document.querySelector('input[name="dring"]:checked');
    $('notfall').hidden = !(d && d.value === 'dringend');
  }
  /** Nur die Felder leeren (nach dem Senden: nichts Altes rutscht in die nächste Meldung). */
  function resetFields() {
    $('text').value = ''; $('name').value = ''; $('ort').value = ''; $('ortsteil').value = '';
    $('thema').value = '';
    document.querySelector('input[name="art"][value="Anliegen"]').checked = true;
    document.querySelector('input[name="dring"][value="normal"]').checked = true;
    $('consent').checked = false;
    $('error').hidden = true; $('consentError').hidden = true;
    clearLoc(); clearPhoto();
    updateCounter(); updateNotfall(); updateOrtAnders();
  }
  function clearForm() {
    if (state.lastMsg && state.lastMsg.photo && typeof window.baClearPhoto === 'function') try { window.baClearPhoto(); } catch (e) {}
    resetFields();
    $('after').hidden = true;
    state.lastMsg = null; state.lastFields = null;
    ssSet(SS_SENT, '');
  }
  function readFields() {
    var artEl = document.querySelector('input[name="art"]:checked');
    var drEl = document.querySelector('input[name="dring"]:checked');
    return { art: artEl ? artEl.value : 'Anliegen', thema: $('thema').value, dringlichkeit: drEl ? drEl.value : 'normal',
      name: $('name').value, ortsteil: $('ortsteil').value, ort: $('ort').value, text: $('text').value };
  }
  function writeFields(f) {
    if (!f) return;
    var a = document.querySelector('input[name="art"][value="' + (f.art === 'Idee' ? 'Idee' : 'Anliegen') + '"]'); if (a) a.checked = true;
    var d = document.querySelector('input[name="dring"][value="' + (BA.DRINGLICHKEIT.indexOf(f.dringlichkeit) >= 0 ? f.dringlichkeit : 'normal') + '"]'); if (d) d.checked = true;
    $('thema').value = BA.THEMEN.indexOf(f.thema) >= 0 ? f.thema : '';
    $('ortsteil').value = f.ortsteil || ''; if ($('ortsteil').value !== (f.ortsteil || '')) $('ortsteil').value = '';
    $('name').value = f.name || ''; $('ort').value = f.ort || ''; $('text').value = f.text || '';
    updateCounter(); updateNotfall(); updateOrtAnders();
  }
  /** „Wie geht es weiter?“ anzeigen (auch nach der Rückkehr aus WhatsApp). */
  function showAfter(num, back) {
    $('afterStep1').innerHTML = '';
    $('afterStep1').appendChild(document.createTextNode(back
      ? 'Haben Sie in WhatsApp auf '
      : num ? 'WhatsApp ist jetzt offen. Tippen Sie dort auf '
        : 'WhatsApp ist jetzt offen. Wählen Sie den Chat mit Hajo Bönke. Dann tippen Sie auf '));
    var b = document.createElement('strong'); b.textContent = 'Senden'; $('afterStep1').appendChild(b);
    $('afterStep1').appendChild(document.createTextNode(back ? ' (➤) getippt? Dann ist alles erledigt.' : ' (➤).'));
    $('afterPhoto').hidden = !!(state.lastMsg && state.lastMsg.photo) || !$('photoBox').hidden;
    $('after').hidden = false;
    state.afterAt = back ? 0 : Date.now(); // Doppel-Tipp soll nicht gleich „Fertig“ treffen
    try { $('after').scrollIntoView({ block: 'center' }); $('afterTitle').focus({ preventScroll: true }); } catch (e) {}
  }
  function afterTapOk() { return !(Date.now() - (state.afterAt || 0) < 700); }
  /** Nach der Rückkehr aus WhatsApp (Seite neu geladen): Bestätigung wieder zeigen. */
  function restoreSent() {
    var raw = ssGet(SS_SENT); if (!raw) return false;
    var o = null; try { o = JSON.parse(raw); } catch (e) {}
    if (!o || typeof o.msg !== 'string' || !(Date.now() - (+o.at || 0) < 6 * 3600 * 1000)) { ssSet(SS_SENT, ''); return false; }
    state.lastMsg = { msg: o.msg, photo: false }; state.lastFields = o.fields || null;
    showAfter(effNumber(), true);
    return true;
  }
  function clearLoc() {
    state.loc = null;
    $('locStatus').hidden = true; $('locDel').hidden = true;
    $('locBtn').disabled = false; $('locBtn').textContent = '📍 Standort anhängen';
  }
  function clearPhoto() {
    if (state.photo && typeof window.baClearPhoto === 'function') try { window.baClearPhoto(); } catch (e) {}
    state.photo = null;
    $('photoInfo').hidden = true; $('photoThumb').removeAttribute('src');
  }
  function locOk(lat, lon, acc) {
    state.loc = { lat: lat, lon: lon, acc: acc };
    var a = acc > 0 ? ' (ca. ' + Math.max(1, Math.round(acc)) + ' m genau)' : '';
    $('locStatus').hidden = false;
    $('locStatus').textContent = '✓ Standort angehängt' + a + '. Er wird als Karten-Link mitgeschickt.';
    $('locDel').hidden = false;
    $('locBtn').disabled = false; $('locBtn').textContent = '📍 Standort aktualisieren';
  }
  function locFail(m) {
    $('locBtn').disabled = false; $('locBtn').textContent = state.loc ? '📍 Standort aktualisieren' : '📍 Standort anhängen';
    toast(m || 'Standort konnte nicht gelesen werden. Bitte Ortsteil/Straße eintippen.');
  }
  window.BA_onLocation = function (ok, lat, lon, acc, msg) {
    if (ok && BA.validCoord(+lat, +lon)) locOk(+lat, +lon, +acc); else locFail(msg);
  };
  window.BA_onPhoto = function (ok, thumb, msg) {
    if (!ok) { if (msg) toast(msg); return; }
    state.photo = { thumb: thumb || '' };
    $('after').hidden = true;
    if (thumb && /^data:image\/jpeg;base64,/.test(thumb)) $('photoThumb').src = thumb; else $('photoThumb').removeAttribute('src');
    $('photoInfo').hidden = false;
  };
  window.BA_back = function () {
    if (!$('modal').hidden) { $('modalNo').click(); return true; }
    if (!$('kiConsent').hidden) { $('kiConsentNo').click(); return true; }
    var s = state.screen;
    var root = s === 's-start' || (s === 's-buerger' && state.mode === 'buerger') || (s === 's-helfer' && state.mode === 'helfer');
    if (root) return false;
    goBack(); return true;
  };
  function attachLoc() {
    if (typeof window.baLocate === 'function') {
      $('locBtn').disabled = true; $('locBtn').textContent = 'Standort wird gesucht …';
      window.baLocate();
      return;
    }
    if (!navigator.geolocation) {
      toast('Standort ist hier nicht verfügbar. Bitte Ortsteil/Straße eintippen.');
      return;
    }
    $('locBtn').disabled = true; $('locBtn').textContent = 'Standort wird gesucht …';
    navigator.geolocation.getCurrentPosition(function (pos) {
      locOk(pos.coords.latitude, pos.coords.longitude, pos.coords.accuracy);
    }, function (err) {
      var m = 'Standort konnte nicht gelesen werden. Bitte Ortsteil/Straße eintippen.';
      if (err && err.code === 1) m = 'Standort-Erlaubnis wurde abgelehnt. Bitte Ortsteil/Straße eintippen.';
      else if (err && err.code === 3) m = 'Standort-Suche hat zu lange gedauert.';
      locFail(m);
    }, { enableHighAccuracy: true, timeout: 15000, maximumAge: 60000 });
  }
  function setupPhoto() {
    // Foto nur, wenn die Android/Windows-Brücke einen Share-Intent bietet; im Browser deaktiviert (wa.me kann kein Bild).
    if (typeof window.baPickPhoto === 'function' && typeof window.baSendWhatsApp === 'function') {
      $('photoBox').hidden = false;
      $('photoTip').hidden = true;
    }
  }
  function onSend(ev) {
    if (ev) ev.preventDefault();
    // 2.4.0: Doppel-Tipp-Schutz
    if (Date.now() - state.sendLock < 2000) return;
    var text = $('text').value;
    if (BA.isTextEmpty(text)) { $('error').hidden = false; $('text').focus(); return; }
    $('error').hidden = true;
    if (!$('consent').checked) { $('consentError').hidden = false; $('consent').focus(); return; }
    $('consentError').hidden = true;
    state.sendLock = Date.now();
    $('send').disabled = true;
    setTimeout(function () { $('send').disabled = false; }, 2000);
    var fields = readFields();
    var msg = BA.buildMessage({
      art: fields.art, thema: fields.thema, dringlichkeit: fields.dringlichkeit,
      name: fields.name, ortsteil: fields.ortsteil, ort: fields.ort, text: text,
      standort: state.loc, foto: !!state.photo
    });
    var photo = !!state.photo;
    state.lastMsg = { msg: msg, photo: photo }; state.lastFields = fields;
    // Für die Rückkehr aus WhatsApp merken (nur dieser Tab, weg beim Schließen)
    ssSet(SS_SENT, JSON.stringify({ msg: msg, fields: fields, at: Date.now() }));
    // Anzeige „Wie geht es weiter?“ zuerst, dann WhatsApp öffnen (auf dem Handy verlässt der Tab evtl. die Seite).
    showAfter(effNumber(), false);
    sendWA(msg, photo);
    // Formular leeren: kein altes Thema, keine Dringlichkeit, kein Ort in der nächsten Meldung
    var keepPhoto = state.photo; state.photo = null; // Foto-Datei wird für „Nochmal öffnen“ noch gebraucht
    resetFields(); state.photo = null;
    if (keepPhoto) { $('photoInfo').hidden = true; $('photoThumb').removeAttribute('src'); }
  }

  // ---- Helfer: Listen
  function saveData() { return store.setData(state.data).then(function () {
    if ($('storeWarn')) $('storeWarn').hidden = !!state.canStore;
  }); }
  function refreshHelfer() {
    var d = state.data;
    var offen = d.anliegen.filter(function (a) { return a.status !== 'Erledigt'; }).length;
    $('cntAnliegen').textContent = offen ? offen + ' offen' : (d.anliegen.length ? d.anliegen.length + ' gesamt' : 'noch keine');
    $('cntIdeen').textContent = d.ideen.length ? d.ideen.length + ' gespeichert' : 'noch keine';
    var ot = d.termine.filter(function (t) { return !t.erledigt; }).length;
    $('cntTermine').textContent = ot ? ot + ' offen' : (d.termine.length ? d.termine.length + ' gesamt' : 'noch keine');
    $('storeWarn').hidden = !!state.canStore;
    var rb = BA.backupReminder(d);
    $('bkRemind').hidden = rb.level !== 'due';
    var introSeen = false; try { introSeen = localStorage.getItem(KEY_HELFER_INTRO) === '1'; } catch (e) {}
    $('helferIntro').hidden = introSeen;
    $('bkRemindText').textContent = rb.text + (IS_IOS && rb.level === 'due' ? ' Auf dem iPhone kann Safari Daten löschen, wenn die Seite länger nicht geöffnet wird.' : '');
    refreshKiTile();
  }
  /** keepOrder (2.4.0): nach Status-Tipp bleiben die Karten an ihrem Platz (kein Springen). */
  function renderAnliegen(keepOrder) {
    var f = { thema: $('fThema').value, ortsteil: $('fOrtsteil').value, status: $('fStatus').value, q: $('fSuche').value };
    var list = BA.filterAnliegen(state.data.anliegen, f);
    if (keepOrder === true && state.lastOrder) {
      var pos = {}; state.lastOrder.forEach(function (id, i) { pos[id] = i; });
      var kept = state.lastOrder.map(function (id) { return BA.findById(state.data.anliegen, id); }).filter(Boolean);
      list = kept.concat(list.filter(function (a) { return !(a.id in pos); }));
    }
    state.lastOrder = list.map(function (a) { return a.id; });
    var total = state.data.anliegen.length, filtered = !!(f.thema || f.ortsteil || f.status || BA.cleanLine(f.q));
    var ul = $('anliegenList'); ul.innerHTML = '';
    $('anliegenEmpty').hidden = list.length > 0;
    $('anliegenCount').textContent = !total ? '' : filtered ? list.length + ' von ' + total + ' Anliegen' : total + (total === 1 ? ' Anliegen' : ' Anliegen');
    $('fReset').hidden = !filtered;
    if (!list.length) {
      $('anliegenEmpty').textContent = total
        ? 'Nichts gefunden. Tippen Sie auf „Filter zurücksetzen“ oder legen Sie ein neues Anliegen an.'
        : 'Noch keine Anliegen. Tippen Sie auf „+ Neues Anliegen“. Tipp: Eine WhatsApp-Nachricht können Sie dort einfügen.';
      return;
    }
    list.forEach(function (a) {
      var li = document.createElement('li');
      li.innerHTML = '<h2 class="cardh"></h2><p class="meta"></p><p class="txt"></p><div class="actions"></div>';
      li.setAttribute('data-id', a.id);
      li.querySelector('h2').textContent = a.thema + ' · ' + BA.ortsteilText(a.ortsteil) + (a.ort ? ', ' + a.ort : '');
      li.querySelector('.meta').innerHTML = '';
      [['badge ' + a.status.split(' ')[0], a.status], ['badge ' + a.dringlichkeit, a.dringlichkeit],
        ['', BA.stampDE(a.created)]].forEach(function (x) {
        var s = document.createElement('span'); s.className = x[0] || 'date';
        s.textContent = x[1]; li.querySelector('.meta').appendChild(s);
      });
      li.querySelector('.txt').textContent = a.text.length > 160 ? a.text.slice(0, 159) + '…' : a.text;
      var act = li.querySelector('.actions');
      function btn(label, cls, fn) {
        var b = document.createElement('button'); b.type = 'button'; b.className = cls; b.textContent = label;
        b.addEventListener('click', fn); act.appendChild(b);
      }
      btn('Öffnen', 'mid secondary', function () { openAnliegen(a.id); });
      if (a.status === 'Neu') btn('In Arbeit', 'mid secondary', function () { setAnliegenStatus(a.id, 'In Arbeit'); });
      if (a.status !== 'Erledigt') btn('Erledigt', 'mid', function () { setAnliegenStatus(a.id, 'Erledigt'); });
      else btn('Wieder öffnen', 'mid secondary', function () { setAnliegenStatus(a.id, BA.reopenStatus(a)); });
      ul.appendChild(li);
    });
  }
  function openAnliegen(id) {
    var a = id ? BA.findById(state.data.anliegen, id) : null;
    state.editing = a ? a.id : null;
    $('aeTitle').textContent = a ? 'Anliegen bearbeiten' : 'Neues Anliegen';
    $('aeThema').value = a ? a.thema : 'Sonstiges';
    $('aeDring').value = a ? a.dringlichkeit : 'normal';
    $('aeText').value = a ? a.text : '';
    $('aeOrtsteil').value = a ? (a.ortsteil || '') : '';
    $('aeOrt').value = a ? a.ort : '';
    $('aeKontakt').value = a ? a.kontakt : '';
    $('aeStatus').value = a ? a.status : 'Neu';
    $('aeError').hidden = true;
    $('aeDelete').hidden = !a;
    $('aePasteBox').hidden = !!a; $('aePasteBox').open = false;
    $('aePaste').value = ''; $('aePasteMsg').hidden = true;
    show('s-anliegen-edit');
  }
  function pasteAnliegen() {
    var p = BA.parseCitizenMessage($('aePaste').value);
    if (!p.ok) { $('aePasteMsg').hidden = false; $('aePasteMsg').className = 'error'; $('aePasteMsg').textContent = 'Bitte zuerst eine Nachricht einfügen.'; return; }
    var f = BA.anliegenFromMessage(p);
    $('aeThema').value = f.thema; $('aeDring').value = f.dringlichkeit; $('aeText').value = f.text;
    if (f.ortsteil) $('aeOrtsteil').value = f.ortsteil;
    if (f.ort) $('aeOrt').value = f.ort;
    if (f.kontakt) $('aeKontakt').value = f.kontakt;
    $('aeError').hidden = true;
    $('aePasteMsg').hidden = false; $('aePasteMsg').className = 'ok';
    $('aePasteMsg').textContent = p.format ? 'Felder ausgefüllt. Bitte kurz prüfen und speichern.' : 'Text übernommen. Bitte Thema wählen und speichern.';
    $('aePasteBox').open = false;
    try { $('aeThema').focus(); } catch (e) {}
  }
  function saveAnliegen() {
    if (BA.isTextEmpty($('aeText').value)) { $('aeError').hidden = false; return; }
    $('aeError').hidden = true;
    var nowIso = now();
    var raw = {
      id: state.editing || BA.newId('a'),
      thema: $('aeThema').value, dringlichkeit: $('aeDring').value,
      text: $('aeText').value, ortsteil: $('aeOrtsteil').value, ort: $('aeOrt').value, kontakt: $('aeKontakt').value,
      status: $('aeStatus').value, created: nowIso, updated: nowIso
    };
    if (state.editing) {
      var old = BA.findById(state.data.anliegen, state.editing);
      if (old) { raw.created = old.created; raw.erledigtAm = old.erledigtAm; }
    }
    var item = BA.sanitizeAnliegen(raw, nowIso);
    if (item.status === 'Erledigt' && !item.erledigtAm) item.erledigtAm = nowIso;
    if (item.status !== 'Erledigt') item.erledigtAm = '';
    state.data.anliegen = BA.upsert(state.data.anliegen, item);
    saveData().then(function () { toast('Gespeichert'); show('s-anliegen'); renderAnliegen(); });
  }
  function setAnliegenStatus(id, st) {
    var a = BA.findById(state.data.anliegen, id); if (!a) return;
    var before = JSON.parse(JSON.stringify(a));
    state.data.anliegen = BA.upsert(state.data.anliegen, BA.withStatus(a, st, now()));
    saveData().then(function () {
      renderAnliegen(true); refreshHelfer(); focusCard(id);
      toastUndo(st === 'Erledigt' ? 'Als erledigt markiert.' : st === 'In Arbeit' ? 'Status: In Arbeit.' : 'Wieder geöffnet (' + st + ').', function () {
        state.data.anliegen = BA.upsert(state.data.anliegen, BA.sanitizeAnliegen(before, now()));
        saveData().then(function () { renderAnliegen(true); refreshHelfer(); focusCard(id); toast('Rückgängig gemacht: ' + before.status); });
      });
    });
  }
  function focusCard(id) {
    var li = document.querySelector('#anliegenList li[data-id="' + String(id).replace(/[^a-zA-Z0-9_-]/g, '') + '"]');
    var b = li && li.querySelector('.actions button:last-child');
    try { if (b) b.focus({ preventScroll: true }); } catch (e) {}
  }
  function deleteAnliegen() {
    confirmDlg('Dieses Anliegen wirklich löschen?').then(function (ok) {
      if (!ok || !state.editing) return;
      BA.removeById(state.data.anliegen, state.editing);
      saveData().then(function () { toast('Gelöscht'); show('s-anliegen'); renderAnliegen(); });
    });
  }

  function renderIdeen() {
    var ul = $('ideenList'); ul.innerHTML = '';
    $('ideenEmpty').hidden = state.data.ideen.length > 0;
    if (!state.data.ideen.length) {
      $('ideenEmpty').textContent = 'Noch keine eigenen Ideen. Nutzen Sie eine Vorlage oder tippen Sie auf „+ Eigene Idee“.';
    }
    state.data.ideen.slice().sort(function (a, b) { return a.updated < b.updated ? 1 : -1; }).forEach(function (i) {
      var li = document.createElement('li');
      li.innerHTML = '<h3></h3><p class="meta"></p><p class="txt"></p><div class="actions"></div>';
      li.querySelector('h3').textContent = i.titel;
      li.querySelector('.meta').textContent = BA.stampDE(i.updated);
      li.querySelector('.txt').textContent = i.text.length > 140 ? i.text.slice(0, 139) + '…' : i.text;
      var act = li.querySelector('.actions');
      var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'mid secondary'; b1.textContent = 'Öffnen';
      b1.addEventListener('click', function () { openIdee(i.id); }); act.appendChild(b1);
      var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'mid'; b2.textContent = 'Kopieren';
      b2.addEventListener('click', function () { copyText(i.text); }); act.appendChild(b2);
      ul.appendChild(li);
    });
    var vu = $('vorlagenList'); vu.innerHTML = '';
    BA.VORLAGEN.forEach(function (v) {
      var li = document.createElement('li');
      li.innerHTML = '<h3></h3><p class="txt"></p><div class="actions"></div>';
      li.querySelector('h3').textContent = v.titel;
      li.querySelector('.txt').textContent = v.text.length > 180 ? v.text.slice(0, 179) + '…' : v.text;
      var act = li.querySelector('.actions');
      var b1 = document.createElement('button'); b1.type = 'button'; b1.className = 'mid'; b1.textContent = 'Kopieren';
      b1.addEventListener('click', function () { copyText(v.text); });
      var b2 = document.createElement('button'); b2.type = 'button'; b2.className = 'mid secondary'; b2.textContent = 'Als Idee speichern';
      b2.addEventListener('click', function () {
        var item = BA.sanitizeIdee({ titel: v.titel, text: v.text, created: now(), updated: now() }, now());
        state.data.ideen = BA.upsert(state.data.ideen, item);
        saveData().then(function () { toast('Gespeichert'); renderIdeen(); refreshHelfer(); });
      });
      act.appendChild(b1); act.appendChild(b2); vu.appendChild(li);
    });
  }
  function openIdee(id) {
    var i = id ? BA.findById(state.data.ideen, id) : null;
    state.editing = i ? i.id : null;
    $('ieTitle').textContent = i ? 'Idee bearbeiten' : 'Neue Idee';
    $('ieTitel').value = i ? i.titel : '';
    $('ieText').value = i ? i.text : '';
    $('ieError').hidden = true;
    $('ieDelete').hidden = !i;
    show('s-idee-edit');
  }
  function saveIdee() {
    if (BA.isTextEmpty($('ieTitel').value) && BA.isTextEmpty($('ieText').value)) { $('ieError').hidden = false; return; }
    $('ieError').hidden = true;
    var nowIso = now();
    var raw = { id: state.editing || BA.newId('i'), titel: $('ieTitel').value, text: $('ieText').value, created: nowIso, updated: nowIso };
    if (state.editing) { var old = BA.findById(state.data.ideen, state.editing); if (old) raw.created = old.created; }
    var item = BA.sanitizeIdee(raw, nowIso);
    state.data.ideen = BA.upsert(state.data.ideen, item);
    saveData().then(function () { toast('Gespeichert'); show('s-ideen'); renderIdeen(); });
  }
  function deleteIdee() {
    confirmDlg('Diese Idee wirklich löschen?').then(function (ok) {
      if (!ok || !state.editing) return;
      BA.removeById(state.data.ideen, state.editing);
      saveData().then(function () { toast('Gelöscht'); show('s-ideen'); renderIdeen(); });
    });
  }

  var teChecks = [];
  function renderTeCheck() {
    var ul = $('teCheck'); ul.innerHTML = '';
    teChecks.forEach(function (c, idx) {
      var li = document.createElement('li');
      var cb = document.createElement('input'); cb.type = 'checkbox'; cb.checked = !!c.done; cb.id = 'teCk' + idx;
      cb.addEventListener('change', function () { teChecks[idx].done = cb.checked; });
      // 2.4.0: Text ist die Beschriftung der Checkbox (Screenreader, größere Tipp-Fläche)
      var sp = document.createElement('label'); sp.htmlFor = cb.id; sp.textContent = c.text;
      var x = document.createElement('button'); x.type = 'button'; x.className = 'x'; x.setAttribute('aria-label', 'Punkt „' + c.text + '“ entfernen'); x.textContent = '×';
      x.addEventListener('click', function () { teChecks.splice(idx, 1); renderTeCheck(); });
      li.appendChild(cb); li.appendChild(sp); li.appendChild(x); ul.appendChild(li);
    });
  }
  function renderTermine() {
    var list = BA.sortTermine(state.data.termine);
    var ul = $('termineList'); ul.innerHTML = '';
    $('termineEmpty').hidden = list.length > 0;
    if (!list.length) {
      $('termineEmpty').textContent = 'Noch keine Termine. Tippen Sie auf „+ Neuer Termin / Aufgabe“. Vorlagen: Infostand, Veranstaltung, Hausbesuche.';
      return;
    }
    list.forEach(function (t) {
      var p = BA.progress(t);
      var li = document.createElement('li');
      li.innerHTML = '<h2 class="cardh"></h2><p class="meta"></p><div class="actions"></div>';
      li.querySelector('h2').textContent = (t.erledigt ? '✓ ' : '') + t.titel;
      li.querySelector('.meta').textContent = BA.terminWann(t) + (t.ort ? ' · ' + t.ort : '') + (p.total ? ' · ' + p.done + '/' + p.total : '');
      var act = li.querySelector('.actions');
      var b = document.createElement('button'); b.type = 'button'; b.className = 'mid secondary'; b.textContent = 'Öffnen';
      b.addEventListener('click', function () { openTermin(t.id); }); act.appendChild(b);
      ul.appendChild(li);
    });
  }
  function openTermin(id) {
    var t = id ? BA.findById(state.data.termine, id) : null;
    state.editing = t ? t.id : null;
    $('teTitle').textContent = t ? 'Termin bearbeiten' : 'Neuer Termin';
    $('teTitel').value = t ? t.titel : '';
    $('teDatum').value = t ? t.datum : '';
    $('teZeit').value = t ? t.zeit : '';
    $('teDauer').value = String(t ? t.dauer : 60);
    $('teOrt').value = t ? t.ort : '';
    $('teNotiz').value = t ? t.notiz : '';
    $('teDone').checked = t ? !!t.erledigt : false;
    teChecks = t ? t.checkliste.map(function (c) { return { text: c.text, done: !!c.done }; }) : [];
    renderTeCheck();
    $('teError').hidden = true;
    $('teDelete').hidden = !t;
    $('teCal').hidden = !(t && t.datum);
    $('teSaved').hidden = true;
    show('s-termin-edit');
  }
  function saveTermin() {
    if (BA.isTextEmpty($('teTitel').value)) { $('teError').hidden = false; return; }
    $('teError').hidden = true;
    var nowIso = now();
    var raw = {
      id: state.editing || BA.newId('t'), titel: $('teTitel').value, datum: $('teDatum').value,
      zeit: $('teZeit').value, dauer: +$('teDauer').value, ort: $('teOrt').value, notiz: $('teNotiz').value,
      checkliste: teChecks, erledigt: $('teDone').checked, created: nowIso, updated: nowIso
    };
    if (state.editing) { var old = BA.findById(state.data.termine, state.editing); if (old) raw.created = old.created; }
    var item = BA.sanitizeTermin(raw, nowIso);
    state.data.termine = BA.upsert(state.data.termine, item);
    saveData().then(function () {
      if (item.datum) {
        // 2.4.0: gleich danach „In Kalender eintragen“ anbieten (auf dem Bildschirm bleiben)
        state.editing = item.id;
        $('teTitle').textContent = 'Termin bearbeiten';
        $('teDelete').hidden = false; $('teCal').hidden = false;
        $('teSaved').hidden = false;
        state.snap = editSnap('s-termin-edit');
        toast('Gespeichert');
        try { $('teCal').focus(); $('teSaved').scrollIntoView({ block: 'center' }); } catch (e) {}
        return;
      }
      toast('Gespeichert'); show('s-termine'); renderTermine();
    });
  }
  function deleteTermin() {
    confirmDlg('Diesen Termin wirklich löschen?').then(function (ok) {
      if (!ok || !state.editing) return;
      BA.removeById(state.data.termine, state.editing);
      saveData().then(function () { toast('Gelöscht'); show('s-termine'); renderTermine(); });
    });
  }
  function calTermin() {
    var t = state.editing ? BA.findById(state.data.termine, state.editing) : null;
    if (!t || !t.datum) { toast('Bitte zuerst speichern und ein Datum eintragen.'); return; }
    var ics = BA.buildICS(t);
    if (!ics) { toast('Kein gültiges Datum.'); return; }
    if (typeof window.baAddCalendar === 'function') {
      window.baAddCalendar(JSON.stringify({
        titel: t.titel, datum: t.datum, zeit: t.zeit || '', dauer: t.dauer, ort: t.ort || '',
        notiz: BA.terminBeschreibung(t)
      }));
      return;
    }
    download(BA.safeFileName(t.titel) + '.ics', 'text/calendar;charset=utf-8', ics);
  }

  function showSummary() {
    $('summaryText').textContent = BA.buildSummary(state.data);
    show('s-summary');
  }

  // ---- Bürger-Link & QR-Code (2.3.0)
  function currentCitizenLink() {
    var withNum = $('linkNum').checked && !!state.number;
    return BA.buildCitizenLink(BA.citizenBase(location.href), withNum ? state.number : '');
  }
  function renderLink() {
    var has = !!state.number;
    $('linkNum').disabled = !has;
    if (!has) $('linkNum').checked = false;
    $('linkNumInfo').textContent = has
      ? ($('linkNum').checked ? 'Die Nummer +' + state.number + ' steht sichtbar im Link und im QR-Code. Nur mit Hajos Zustimmung weitergeben.'
        : 'Ohne Nummer wählen Bürger den Chat mit Hajo in WhatsApp selbst aus.')
      : 'Noch keine Nummer gespeichert. Hajos Nummer unter ⚙ Einstellungen eintragen, dann hier den Haken setzen.';
    var link = currentCitizenLink();
    $('linkText').textContent = link;
    var box = $('qrCode');
    box.setAttribute('aria-label', 'QR-Code zum Bürger-Link: ' + link);
    ensureQr().then(function () {
      if (currentCitizenLink() !== link) return;
      box.innerHTML = '';
      var svg = window.BAQr && BAQr.svg(link);
      if (svg) { svg.setAttribute('aria-hidden', 'true'); svg.setAttribute('focusable', 'false'); box.appendChild(svg); }
      else box.textContent = 'QR-Code konnte nicht erstellt werden.';
    });
  }
  function openLinkScreen() {
    try { $('linkNum').checked = localStorage.getItem(KEY_LINK_NUM) === '1'; } catch (e) {}
    renderLink();
    ensurePdf(); // für „Aushang (PDF)“ schon mal laden
  }

  // ---- Einstellungen / Backup
  function openSettings() {
    $('number').value = state.number ? '+' + state.number : '';
    $('numError').hidden = true; $('numOk').hidden = true;
    $('modeNow').textContent = state.mode === 'buerger' ? 'Aktuell: Anliegen senden (Bürger)'
      : state.mode === 'helfer' ? 'Aktuell: Helfer-Bereich' : 'Noch kein Modus gewählt';
    $('ver').textContent = BA.VERSION;
    $('linkNumHint').hidden = !(state.linkNumber && !state.number);
    $('linkNumHint').textContent = 'Zurzeit wird die Nummer aus Hajos Link benutzt: +' + state.linkNumber + '. Sie wird nicht gespeichert.';
    fillKiSettings();
    show('s-settings');
  }
  function fillKiSettings() {
    var st = BAKi.keyStatus(state.ki);
    var label = st === 'own' ? 'KI bereit (eigener Schlüssel ' + BA.maskApiKey(state.ki.key) + ')'
      : st === 'builtin' ? 'KI bereit (eingebauter Schlüssel)'
      : st === 'off' ? 'KI ausgeschaltet'
      : 'KI: nicht eingerichtet – kostenlosen Schlüssel eintragen';
    if ($('kiSettings')) $('kiSettings').hidden = state.mode !== 'helfer';
    if ($('kiStatus')) $('kiStatus').textContent = label;
    if ($('kiEnabled')) $('kiEnabled').checked = state.ki.enabled !== false;
    if ($('kiKey')) $('kiKey').value = state.ki.key || '';
    if ($('kiModel')) $('kiModel').value = state.ki.model || BA.DEFAULT_GEMINI_MODEL;
    if ($('kiFallback')) $('kiFallback').value = state.ki.fallbackModel || BA.FALLBACK_GEMINI_MODEL;
    if ($('kiLite')) $('kiLite').value = state.ki.liteModel || BA.LITE_GEMINI_MODEL;
    if ($('kiMsg')) $('kiMsg').hidden = true;
    if ($('kiErr')) $('kiErr').hidden = true;
  }
  function refreshKiTile() {
    if (!$('cntKi')) return;
    var st = BAKi.keyStatus(state.ki);
    $('cntKi').textContent = st === 'own' || st === 'builtin' ? 'KI bereit' : (st === 'off' ? 'ausgeschaltet' : 'Schlüssel unter ⚙');
  }
  function transportForKi() {
    if (typeof window.baGemini === 'function' && window.BAAndroid) {
      return function (req) {
        if (!BA.isGeminiUrl(req.url)) return Promise.resolve({ status: 0, text: '' });
        return Promise.resolve(window.baGemini(req.method, req.url, req.body || '', req.key || '')).then(function (r) {
          return { status: (r && +r.status) || 0, text: (r && typeof r.text === 'string') ? r.text : '', timeout: !!(r && r.timeout) };
        }, function () { return { status: 0, text: '' }; });
      };
    }
    return BAKi.fetchTransport;
  }
  // ---- 2.4.0: Sicherheitskopie vor „Sicherung laden“ und „Alles löschen“
  function hasData(d) { return !!(d.anliegen.length || d.ideen.length || d.termine.length); }
  function loadSafety() {
    var t = ''; try { t = localStorage.getItem(KEY_SAFETY) || ''; } catch (e) {}
    return BA.parseSafetyCopy(t || state.safety || '', now());
  }
  /** Speichert den jetzigen Stand als Sicherheitskopie (Gerät). Gibt den JSON-Text zurück. */
  function makeSafety(grund) {
    var t = BA.makeSafetyCopy(state.data, now(), grund);
    state.safety = t; // falls der Speicher voll ist: wenigstens bis zum Schließen
    try { localStorage.setItem(KEY_SAFETY, t); } catch (e) {}
    return t;
  }
  function renderSafety() {
    var s = loadSafety();
    $('bkSafety').hidden = !s;
    if (!s) return;
    $('bkSafetyText').textContent = 'Sicherheitskopie vom ' + (s.stamp ? BA.stampDE(s.stamp) : '?') + (s.grund ? ' (' + s.grund + ')' : '') +
      ': ' + BA.countsText(s.counts) + '.';
  }
  function applyData(d) {
    state.data.anliegen = d.anliegen; state.data.ideen = d.ideen; state.data.termine = d.termine;
    return saveData();
  }
  function afterReplace(msg) {
    $('bkError').hidden = true;
    $('bkStatus').hidden = false;
    $('bkStatus').textContent = msg + ' Die vorherigen Daten liegen in der Sicherheitskopie (unten). Sie können sie wiederherstellen oder als Datei speichern.';
    renderSafety(); refreshHelfer(); toast(msg);
  }
  function doImport(file) {
    if (!file) return;
    var r = new FileReader();
    r.onload = function () {
      var res = BA.parseBackup(String(r.result || ''), now());
      if (!res.ok) { $('bkError').hidden = false; $('bkError').textContent = res.error; $('bkStatus').hidden = true; return; }
      var diff = BA.restoreDiff(state.data, res.data);
      confirmDlg(BA.restoreSummary(diff), { yes: 'Sicherung laden', no: 'Abbrechen' }).then(function (ok) {
        if (!ok) return;
        if (hasData(state.data)) makeSafety('vor dem Laden einer Sicherung');
        applyData(res.data).then(function () { afterReplace('Sicherung geladen.'); });
      });
    };
    r.readAsText(file, 'UTF-8');
  }
  function restoreSafety() {
    var s = loadSafety();
    if (!s) { toast('Keine Sicherheitskopie vorhanden.'); renderSafety(); return; }
    var diff = BA.restoreDiff(state.data, s.data);
    confirmDlg(BA.restoreSummary(diff).replace('Sicherung laden?', 'Sicherheitskopie wiederherstellen?').replace('In der Sicherung:', 'In der Sicherheitskopie:'),
      { yes: 'Wiederherstellen', no: 'Abbrechen' }).then(function (ok) {
      if (!ok) return;
      var cur = hasData(state.data) ? BA.makeSafetyCopy(state.data, now(), 'vor dem Wiederherstellen') : '';
      applyData(s.data).then(function () {
        if (cur) { state.safety = cur; try { localStorage.setItem(KEY_SAFETY, cur); } catch (e) {} }
        else { state.safety = null; try { localStorage.removeItem(KEY_SAFETY); } catch (e) {} }
        afterReplace('Sicherheitskopie wiederhergestellt.');
        if (!cur) $('bkStatus').textContent = 'Sicherheitskopie wiederhergestellt.';
      });
    });
  }
  function downloadSafety() {
    var s = null; try { s = localStorage.getItem(KEY_SAFETY); } catch (e) {}
    s = s || state.safety;
    if (!s) { toast('Keine Sicherheitskopie vorhanden.'); return; }
    download('buergeranliegen-sicherheitskopie-' + BA.localDate(Date.now()) + '.json', 'application/json;charset=utf-8', s);
  }

  // ---- Events
  function bind() {
    $('backBtn').addEventListener('click', goBack);
    $('gearBtn').addEventListener('click', function () { leaveEdit(openSettings); });
    // 2.4.0: Bürger-Modus: Einstellungen nur über langes Drücken auf den Titel oder den kleinen Link unten
    (function () {
      var t = 0, el = $('topTitle');
      function start() { clearTimeout(t); t = setTimeout(function () { t = 0; if (state.screen === 's-buerger') openSettings(); }, 800); }
      function stop() { clearTimeout(t); t = 0; }
      el.addEventListener('pointerdown', start); el.addEventListener('pointerup', stop);
      el.addEventListener('pointerleave', stop); el.addEventListener('pointercancel', stop);
      el.addEventListener('contextmenu', function (e) { if (state.screen === 's-buerger') e.preventDefault(); });
    })();
    $('helferLink').addEventListener('click', openSettings);
    $('helferIntroOk').addEventListener('click', function () {
      try { localStorage.setItem(KEY_HELFER_INTRO, '1'); } catch (e) {}
      $('helferIntro').hidden = true;
    });
    window.addEventListener('beforeunload', function (e) {
      if (isDirty()) { e.preventDefault(); e.returnValue = ''; return ''; }
    });
    $('pickBuerger').addEventListener('click', function () { setMode('buerger').then(function () { clearForm(); showTarget(); show('s-buerger'); }); });
    $('pickHelfer').addEventListener('click', function () { setMode('helfer').then(function () { refreshHelfer(); show('s-helfer'); }); });
    $('switchMode').addEventListener('click', function () {
      confirmDlg('Modus wechseln? Ihre Helfer-Daten bleiben gespeichert.').then(function (ok) {
        if (!ok) return;
        store.setMode('').then(function () { state.mode = ''; show('s-start'); });
      });
    });
    $('saveNum').addEventListener('click', function () {
      var v = BA.validateNumber($('number').value);
      if (!v.ok) { $('numError').hidden = false; $('numError').textContent = v.error; $('numOk').hidden = true; return; }
      state.number = v.number;
      $('number').value = state.number ? '+' + state.number : '';
      store.setNum(state.number).then(function () {
        $('numError').hidden = true; $('numOk').hidden = false;
        $('numOk').textContent = state.number ? 'Gespeichert: +' + state.number : 'Keine Nummer gespeichert.';
        showTarget();
      });
    });
    $('delNum').addEventListener('click', function () {
      state.number = ''; $('number').value = '';
      store.setNum('').then(function () { $('numOk').hidden = false; $('numOk').textContent = 'Nummer gelöscht.'; $('numError').hidden = true; showTarget(); });
    });

    $('text').setAttribute('maxlength', String(BA.MAX_CITIZEN_TEXT));
    $('text').addEventListener('input', function () { if (!BA.isTextEmpty(this.value)) $('error').hidden = true; updateCounter(); });
    document.querySelectorAll('input[name="dring"]').forEach(function (r) { r.addEventListener('change', updateNotfall); });
    $('ortsteil').addEventListener('change', updateOrtAnders);
    $('again').addEventListener('click', function () { if (afterTapOk() && state.lastMsg) sendWA(state.lastMsg.msg, state.lastMsg.photo); });
    $('consent').addEventListener('change', function () { if (this.checked) $('consentError').hidden = true; });
    $('form').addEventListener('submit', onSend);
    $('clear').addEventListener('click', function () { if (afterTapOk()) clearForm(); });
    $('keep').addEventListener('click', function () {
      if (!afterTapOk()) return;
      writeFields(state.lastFields); ssSet(SS_SENT, '');
      if (state.lastFields) $('consent').checked = true; // gleiche Nachricht, Einverständnis war schon gegeben
      $('after').hidden = true; try { $('text').focus(); } catch (e) {}
    });
    $('locBtn').addEventListener('click', attachLoc);
    $('locDel').addEventListener('click', clearLoc);
    $('photoBtn').addEventListener('click', function () {
      if (typeof window.baPickPhoto === 'function') window.baPickPhoto();
      else toast('Foto-Anhang ist in dieser Version nur in der Android-App möglich.');
    });
    $('photoDel').addEventListener('click', clearPhoto);

    document.querySelectorAll('[data-go]').forEach(function (b) {
      b.addEventListener('click', function () {
        var id = b.getAttribute('data-go');
        if (id === 's-anliegen') { renderAnliegen(); show(id); }
        else if (id === 's-ideen') { renderIdeen(); show(id); }
        else if (id === 's-termine') { renderTermine(); show(id); }
        else if (id === 's-summary') showSummary();
        else if (id === 's-pdf') { openPdfScreen(); show(id); }
        else if (id === 's-ki') { openKiScreen(); show(id); }
        else if (id === 's-link') { openLinkScreen(); show(id); }
        else if (id === 's-backup') { renderSafety(); $('bkStatus').hidden = true; $('bkError').hidden = true; show(id); }
        else show(id);
      });
    });
    $('fThema').addEventListener('change', renderAnliegen);
    $('fOrtsteil').addEventListener('change', renderAnliegen);
    $('fStatus').addEventListener('change', renderAnliegen);
    $('fSuche').addEventListener('input', renderAnliegen);
    $('fReset').addEventListener('click', function () { $('fSuche').value = ''; $('fThema').value = ''; $('fOrtsteil').value = ''; $('fStatus').value = ''; renderAnliegen(); });
    $('aePasteGo').addEventListener('click', pasteAnliegen);
    $('bkRemindGo').addEventListener('click', function () { renderSafety(); show('s-backup'); });
    $('linkNum').addEventListener('change', function () {
      try { localStorage.setItem(KEY_LINK_NUM, this.checked ? '1' : '0'); } catch (e) {}
      renderLink();
    });
    $('linkCopy').addEventListener('click', function () { copyText(currentCitizenLink()); });
    $('linkShare').addEventListener('click', function () {
      sendWA('Haben Sie ein Anliegen für Bad Pyrmont? Schreiben Sie Hajo Bönke (SPD) ganz einfach per WhatsApp: ' + currentCitizenLink(), false, true);
    });
    $('linkOpen').addEventListener('click', function () { openUrl(currentCitizenLink()); });
    $('linkPdf').addEventListener('click', function () { makePdfAndSave(BA.pdfAushang(currentCitizenLink()), 'aushang'); });
    $('newAnliegen').addEventListener('click', function () { openAnliegen(null); });
    $('aeSave').addEventListener('click', saveAnliegen);
    $('aeDelete').addEventListener('click', deleteAnliegen);
    $('newIdee').addEventListener('click', function () { openIdee(null); });
    $('ieSave').addEventListener('click', saveIdee);
    $('ieDelete').addEventListener('click', deleteIdee);
    $('ieCopy').addEventListener('click', function () { copyText($('ieText').value); });
    $('newTermin').addEventListener('click', function () { openTermin(null); });
    $('teSave').addEventListener('click', saveTermin);
    $('teDelete').addEventListener('click', deleteTermin);
    $('teCal').addEventListener('click', calTermin);
    $('teVorlageAdd').addEventListener('click', function () {
      var k = $('teVorlage').value; if (!k) return;
      BA.checklistFor(k).forEach(function (c) { teChecks.push(c); });
      renderTeCheck(); $('teVorlage').value = '';
      if (!$('teTitel').value) $('teTitel').value = k;
    });
    $('teItemAdd').addEventListener('click', function () {
      var t = $('teItem').value.trim(); if (!t) return;
      teChecks.push({ text: t.slice(0, BA.MAX_SHORT), done: false });
      $('teItem').value = ''; renderTeCheck();
    });
    $('teDatum').addEventListener('change', function () { $('teCal').hidden = !$('teDatum').value || !state.editing; });

    $('sumSend').addEventListener('click', function () {
      sendWA($('summaryText').textContent, false);
    });
    $('sumCopy').addEventListener('click', function () { copyText($('summaryText').textContent); });

    $('bkExport').addEventListener('click', function () {
      var name = 'buergeranliegen-sicherung-' + BA.localDate(Date.now()) + '.json';
      download(name, 'application/json;charset=utf-8', BA.makeBackup(state.data, now())).then(function (ok) {
        // 2.4.0: Erinnerung nur zurücksetzen, wenn wirklich gespeichert/geteilt (nicht bei „Abbrechen“)
        if (!ok) {
          $('bkStatus').hidden = true; $('bkError').hidden = false;
          $('bkError').textContent = 'Die Sicherung wurde nicht gespeichert (abgebrochen). Bitte nochmal tippen.';
          return;
        }
        state.data.lastBackup = now();
        return saveData().then(function () {
          $('bkStatus').hidden = false; $('bkStatus').textContent = 'Sicherung erstellt: ' + name + '. Bitte gut aufbewahren (z. B. in „Dateien“ oder per E-Mail an sich selbst).';
          $('bkError').hidden = true;
        });
      });
    });
    $('bkSafetyRestore').addEventListener('click', restoreSafety);
    $('bkSafetyDownload').addEventListener('click', downloadSafety);
    $('bkImportBtn').addEventListener('click', function () { $('bkFile').click(); });
    $('bkFile').addEventListener('change', function () { doImport(this.files && this.files[0]); this.value = ''; });
    $('csvExport').addEventListener('click', function () {
      download('buergeranliegen-anliegen-' + BA.localDate(Date.now()) + '.csv', 'text/csv;charset=utf-8', BA.anliegenCSV(state.data.anliegen));
    });
    $('wipeAll').addEventListener('click', function () {
      var c = BA.restoreDiff(state.data, BA.emptyData()).current;
      confirmDlg('Wirklich ALLE Helfer-Daten löschen?\n\nGelöscht werden: ' + BA.countsText(c) + '.\n\n' +
        'Vorher speichert die App automatisch eine Sicherheitskopie. Unter „Sichern & Export“ können Sie sie wiederherstellen oder als Datei speichern.',
        { yes: 'Alles löschen', no: 'Abbrechen' }).then(function (ok) {
        if (!ok) return;
        if (hasData(state.data)) makeSafety('vor dem Löschen');
        applyData(BA.emptyData()).then(function () { afterReplace('Alles gelöscht.'); });
      });
    });

    // PDF
    if ($('pdfAnliegen')) $('pdfAnliegen').addEventListener('click', function () {
      var f = { thema: $('pdfThema').value, ortsteil: $('pdfOrtsteil').value, status: $('pdfStatus').value };
      makePdfAndSave(BA.pdfAnliegenBericht(state.data, f, { kontakt: $('pdfKontakt') && $('pdfKontakt').checked }), 'anliegen');
    });
    if ($('pdfWoche')) $('pdfWoche').addEventListener('click', function () {
      makePdfAndSave(BA.pdfWochenbericht(state.data), 'wochenbericht');
    });
    if ($('pdfTermine')) $('pdfTermine').addEventListener('click', function () {
      makePdfAndSave(BA.pdfTermine(state.data), 'termine');
    });
    if ($('pdfIdee')) $('pdfIdee').addEventListener('click', function () {
      var id = $('pdfIdeeSel').value;
      var idee = BA.findById(state.data.ideen, id) || BA.VORLAGEN.filter(function (v) { return v.id === id; })[0];
      if (!idee) { toast('Bitte eine Idee wählen.'); return; }
      makePdfAndSave(BA.pdfIdeeFlyer(idee, { number: state.number, link: BA.buildCitizenLink(BA.citizenBase(location.href), state.number) }), 'infoblatt');
    });
    // KI settings
    if ($('saveKi')) $('saveKi').addEventListener('click', function () {
      state.ki = {
        key: ($('kiKey').value || '').trim(),
        model: BA.cleanModel(($('kiModel').value || '').trim(), BA.DEFAULT_GEMINI_MODEL),
        fallbackModel: BA.cleanModel(($('kiFallback') ? $('kiFallback').value : '').trim(), BA.FALLBACK_GEMINI_MODEL),
        liteModel: BA.cleanModel(($('kiLite') ? $('kiLite').value : '').trim(), BA.LITE_GEMINI_MODEL),
        enabled: $('kiEnabled').checked, v: 2
      };
      store.setKi(state.ki).then(function () {
        fillKiSettings(); refreshKiTile();
        $('kiMsg').hidden = false; $('kiMsg').textContent = 'Gespeichert.';
        $('kiErr').hidden = true;
      });
    });
    if ($('kiModelsReset')) $('kiModelsReset').addEventListener('click', function () {
      $('kiModel').value = BA.DEFAULT_GEMINI_MODEL;
      if ($('kiFallback')) $('kiFallback').value = BA.FALLBACK_GEMINI_MODEL;
      if ($('kiLite')) $('kiLite').value = BA.LITE_GEMINI_MODEL;
      $('kiMsg').hidden = false; $('kiMsg').textContent = 'Standard-Modelle eingetragen. Bitte „KI speichern“ tippen.';
    });
    if ($('delKi')) $('delKi').addEventListener('click', function () {
      state.ki.key = '';
      store.setKi(state.ki).then(function () { fillKiSettings(); refreshKiTile(); toast('Schlüssel gelöscht'); });
    });
    if ($('testKi')) $('testKi').addEventListener('click', function () {
      var cfg = { key: ($('kiKey').value || '').trim() || state.ki.key, model: ($('kiModel').value || '').trim() || state.ki.model, enabled: true };
      $('kiMsg').hidden = true; $('kiErr').hidden = true;
      BAKi.testKey(cfg, transportForKi()).then(function (r) {
        if (r.ok) { $('kiMsg').hidden = false; $('kiMsg').textContent = r.message; }
        else { $('kiErr').hidden = false; $('kiErr').textContent = r.message; }
      });
    });
    if ($('openStudio')) $('openStudio').addEventListener('click', function () {
      openUrl('https://aistudio.google.com/apikey');
    });
    if ($('kiGoSettings')) $('kiGoSettings').addEventListener('click', openSettings);
    if ($('kiTask')) $('kiTask').addEventListener('change', updateKiForm);
    if ($('kiRun')) $('kiRun').addEventListener('click', runKi);
    if ($('kiCopy')) $('kiCopy').addEventListener('click', function () { copyText($('kiResult').value); });
    if ($('kiWa')) $('kiWa').addEventListener('click', function () { sendWA($('kiResult').value, false); });
    if ($('kiIdee')) $('kiIdee').addEventListener('click', function () {
      var txt = $('kiResult').value;
      if (BA.isTextEmpty(txt)) return;
      var item = BA.sanitizeIdee({ titel: 'KI: ' + ($('kiTask').selectedOptions[0].textContent || 'Idee'), text: txt, created: now(), updated: now() }, now());
      state.data.ideen = BA.upsert(state.data.ideen, item);
      saveData().then(function () { toast('Als Idee gespeichert'); });
    });
    if ($('kiPdf')) $('kiPdf').addEventListener('click', function () {
      var src = (state.lastKi && state.lastKi.sources) || [];
      var mdl = (state.lastKi && !state.lastKi.offline && state.lastKi.model) || '';
      makePdfAndSave(BA.pdfKiErgebnis('KI-Ergebnis', $('kiResult').value, src, { model: mdl }), 'ki-ergebnis');
    });
    if ($('kiConsentYes')) $('kiConsentYes').addEventListener('click', function () {
      store.setKiConsent(); $('kiConsent').hidden = true;
      if (window.__kiAfterConsent) { var f = window.__kiAfterConsent; window.__kiAfterConsent = null; f(); }
    });
    if ($('kiConsentNo')) $('kiConsentNo').addEventListener('click', function () {
      $('kiConsent').hidden = true; window.__kiAfterConsent = null;
    });

  }

  function openPdfScreen() {
    ensurePdf(); // 2.4.0: PDF-Bibliothek erst hier laden (im Hintergrund)
    fillSelect($('pdfThema'), BA.THEMEN, true, 'Alle Themen');
    fillSelect($('pdfOrtsteil'), ortsteilFilterOptions(), true, 'Alle Ortsteile');
    fillSelect($('pdfStatus'), BA.STATUS, true, 'Alle');
    var sel = $('pdfIdeeSel'); sel.innerHTML = '';
    var o0 = document.createElement('option'); o0.value = ''; o0.textContent = 'Idee wählen …'; sel.appendChild(o0);
    state.data.ideen.forEach(function (i) {
      var o = document.createElement('option'); o.value = i.id; o.textContent = i.titel; sel.appendChild(o);
    });
    BA.VORLAGEN.forEach(function (v) {
      var o = document.createElement('option'); o.value = v.id; o.textContent = 'Vorlage: ' + v.titel; sel.appendChild(o);
    });
    if ($('pdfMsg')) $('pdfMsg').hidden = true;
  }
  function updateKiForm() {
    var task = $('kiTask').value;
    $('kiAnliegenBox').hidden = task !== 'antwort';
    $('kiArtBox').hidden = task !== 'text';
    $('kiTextBox').hidden = !(task === 'text' || task === 'recherche');
    $('kiInputLabel').textContent = task === 'recherche' ? 'Recherche-Thema' : 'Thema / Stichworte';
    if (task !== window.__kiLastTask) { $('kiGrounding').checked = task === 'recherche'; window.__kiLastTask = task; }
    if (task === 'antwort') {
      var s = $('kiAnliegen'); s.innerHTML = '';
      var offen = state.data.anliegen.filter(function (a) { return a.status !== 'Erledigt'; });
      if (!offen.length) { var o = document.createElement('option'); o.value = ''; o.textContent = 'Keine offenen Anliegen'; s.appendChild(o); }
      else offen.forEach(function (a) {
        var o = document.createElement('option'); o.value = a.id;
        o.textContent = a.thema + ' (' + BA.ortsteilText(a.ortsteil) + '): ' + (a.text.length > 50 ? a.text.slice(0, 49) + '…' : a.text);
        s.appendChild(o);
      });
    }
  }
  function openKiScreen() {
    var st = BAKi.keyStatus(state.ki);
    $('kiSetup').hidden = st !== 'none';
    $('kiOff').hidden = st !== 'off';
    $('kiMain').hidden = !(st === 'own' || st === 'builtin');
    $('kiResultBox').hidden = true;
    $('kiError').hidden = true;
    $('kiBusy').hidden = true;
    $('kiPreview').hidden = true;
    if (st === 'own' || st === 'builtin') updateKiForm();
  }
  function ensureKiConsent(next) {
    if (store.getKiConsent()) { next(); return; }
    window.__kiAfterConsent = next;
    $('kiConsent').hidden = false;
  }
  function runKi() {
    var task = $('kiTask').value;
    $('kiInputErr').hidden = true; $('kiError').hidden = true;
    if ((task === 'text' || task === 'recherche') && BA.isTextEmpty($('kiInput').value)) {
      $('kiInputErr').hidden = false; return;
    }
    if (task === 'antwort' && !$('kiAnliegen').value) {
      $('kiError').hidden = false; $('kiError').textContent = 'Bitte ein Anliegen wählen.'; return;
    }
    ensureKiConsent(function () {
      var anliegen = task === 'antwort' ? BA.findById(state.data.anliegen, $('kiAnliegen').value) : null;
      var opts = { task: task, input: $('kiInput') ? $('kiInput').value : '', art: $('kiArt') ? $('kiArt').value : '',
        anliegen: anliegen, data: state.data };
      // 2.4.0: Vorschau „Das geht an Google“ – erst nach Bestätigung senden
      showKiPreview(opts, function (userText) { doRunKi(opts, userText); });
    });
  }
  var KI_TAG_RE = /\[(Name|Telefon|E-Mail|Hausnummer|Link)\]/g;
  function showKiPreview(opts, onSend) {
    var p = BAKi.preparePrompt(opts);
    if (!p) { $('kiError').hidden = false; $('kiError').textContent = BA.KI_MESSAGES.other; return; }
    $('kiResultBox').hidden = true;
    var view = $('kiPrevView'); view.textContent = '';
    var txt = p.user, last = 0, m;
    KI_TAG_RE.lastIndex = 0;
    while ((m = KI_TAG_RE.exec(txt))) {
      view.appendChild(document.createTextNode(txt.slice(last, m.index)));
      var mk = document.createElement('mark'); mk.textContent = m[0]; view.appendChild(mk);
      last = m.index + m[0].length;
    }
    view.appendChild(document.createTextNode(txt.slice(last)));
    var ul = $('kiPrevRemoved'); ul.innerHTML = '';
    var seen = {};
    (p.removed || []).forEach(function (r) {
      var k = r.tag + '|' + r.text; if (seen[k]) return; seen[k] = 1;
      var li = document.createElement('li');
      var del = document.createElement('del'); del.textContent = r.text;
      li.appendChild(del); li.appendChild(document.createTextNode(' → ' + r.tag));
      ul.appendChild(li);
    });
    $('kiPrevNone').hidden = !!ul.children.length;
    $('kiPrevRemovedBox').hidden = !ul.children.length;
    $('kiPrevText').value = txt;
    $('kiPreview').hidden = false;
    $('kiRun').disabled = true;
    try { $('kiPreview').scrollIntoView({ block: 'start' }); $('kiPrevTitle').focus({ preventScroll: true }); } catch (e) {}
    $('kiPrevSend').onclick = function () {
      var edited = $('kiPrevText').value;
      $('kiPreview').hidden = true; $('kiRun').disabled = false;
      onSend(edited !== txt ? edited : undefined);
    };
    $('kiPrevCancel').onclick = function () {
      $('kiPreview').hidden = true; $('kiRun').disabled = false;
      toast('Nichts gesendet.');
    };
  }
  function doRunKi(o, userText) {
    {
      $('kiBusy').hidden = false; $('kiResultBox').hidden = true; $('kiRun').disabled = true;
      var grounding = !!$('kiGrounding').checked; // optional pro Anfrage
      var started = Date.now(), curModel = '', curSearch = false;
      function busyText() {
        var s = Math.round((Date.now() - started) / 1000);
        if ($('kiBusyDetail')) $('kiBusyDetail').textContent = (curModel ? 'Modell: ' + curModel + (curSearch ? ' mit Google-Suche' : '') + ' · ' : '') +
          s + ' Sekunden. Höchstens etwa 1,5 Minuten, dann gibt es eine Antwort oder eine Vorlage. Sie können die App weiter benutzen.';
      }
      busyText();
      var tick = setInterval(busyText, 1000);
      BAKi.run({
        task: o.task, input: o.input, art: o.art,
        anliegen: o.anliegen, data: state.data, cfg: state.ki, grounding: grounding, userText: userText,
        transport: transportForKi(),
        onProgress: function (p) { curModel = p.model; curSearch = !!p.grounding; busyText(); }
      }).then(function (r) {
        clearInterval(tick);
        $('kiBusy').hidden = true; $('kiRun').disabled = false;
        state.lastKi = r;
        if ($('kiModelUsed')) {
          var used = r.ok && !r.offline && r.model;
          $('kiModelUsed').hidden = !(r.ok || r.offline);
          $('kiModelUsed').textContent = used ? BA.KI_NOTES.answeredBy + r.model + (r.grounded ? ' (mit Google-Suche)' : '')
            : BA.KI_NOTES.answeredBy + 'Offline-Vorlage (ohne KI)';
        }
        if (!r.ok && !r.offline) {
          $('kiError').hidden = false; $('kiError').textContent = (r.error && r.error.message) || BA.KI_MESSAGES.other;
          return;
        }
        $('kiResultBox').hidden = false;
        $('kiResult').value = r.text || '';
        $('kiResult').readOnly = false;
        var note = (r.notes || []).join(' ');
        if (r.offline) note = (note ? note + ' ' : '') + BA.KI_NOTES.offlineTpl;
        $('kiNote').hidden = !note; $('kiNote').textContent = note || '';
        var box = $('kiSourcesBox'); var ul = $('kiSources');
        if (r.sources && r.sources.length) {
          box.hidden = false; ul.innerHTML = '';
          r.sources.forEach(function (s) {
            var li = document.createElement('li');
            var a = document.createElement('a'); a.href = s.url; a.textContent = s.title || s.url;
            a.rel = 'noopener noreferrer'; a.target = '_blank';
            a.title = s.url;
            a.addEventListener('click', function (ev) {
              ev.preventDefault();
              if (BA.isAllowedExternal(s.url)) openUrl(s.url);
              else copyText(s.url);
            });
            li.appendChild(a); ul.appendChild(li);
          });
        } else { box.hidden = true; }
        if ($('kiSent')) $('kiSent').textContent = r.sent || '';
        ensurePdf(); // für „Als PDF“
      });
    }
  }


  // ---- Start
  initSelects();
  setupPhoto();
  bind();
  Promise.all([store.getNum(), store.getMode(), store.getData(), store.getKi()]).then(function (arr) {
    var vn = BA.validateNumber(arr[0]);
    state.number = vn.ok ? vn.number : '';
    state.mode = arr[1] === 'buerger' || arr[1] === 'helfer' ? arr[1] : '';
    state.data = arr[2];
    var rawKi = arr[3] || { key: '', model: '', enabled: true };
    state.ki = BAKi.migrateCfg(rawKi);
    if (!(rawKi.v >= 3)) store.setKi(state.ki); // Update 2.1/2.2/2.3 -> 2.4: neue Modell-Reihenfolge merken
    // localStorage-Probe
    try { localStorage.setItem('__ba_probe', '1'); localStorage.removeItem('__ba_probe'); state.canStore = true; }
    catch (e) { state.canStore = typeof window.baSaveData === 'function'; }
    // 2.3.0: Bürger-Link (?modus=buerger&an=…) – öffnet direkt „Anliegen senden“. Nummer nur für diesen Besuch.
    var lp = BA.parseLinkParams(location.search);
    // 2.4.0: ?an= für diesen Besuch merken (sessionStorage, nie dauerhaft) – auch nach Rückkehr aus WhatsApp
    if (lp.number) { state.linkNumber = lp.number; ssSet(SS_AN, lp.number); }
    else { var ssn = BA.validateNumber(ssGet(SS_AN)); if (ssn.ok && ssn.number) state.linkNumber = ssn.number; }
    if (lp.buerger) {
      if (!state.mode) { state.mode = 'buerger'; setMode('buerger'); }
      showTarget(); updateCounter();
      show('s-buerger');
      restoreSent();
      return;
    }
    showTarget(); updateCounter();
    if (state.mode === 'buerger') { show('s-buerger'); restoreSent(); }
    else if (state.mode === 'helfer') { refreshHelfer(); show('s-helfer'); }
    else show('s-start');
  });
})();
