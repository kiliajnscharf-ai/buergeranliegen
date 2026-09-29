/* Bürger-Anliegen Bad Pyrmont 2.4.1 – reine Logik (ohne DOM), auch in Node testbar.
   Gleiche Regeln wie AnliegenLogic.java (Android). Keine Netzwerk-Zugriffe. */
(function (root) {
  'use strict';

  var VERSION = '2.4.1';
  // Öffentliche Web-Adresse (für den Bürger-Link / QR-Code). Keine Nummer, kein Schlüssel.
  var PUBLIC_URL = 'https://kiliajnscharf-ai.github.io/buergeranliegen/';
  var HEADER = 'Anliegen für Hajo Bönke (SPD Bad Pyrmont)';
  var THEMEN = ['Straße & Wege', 'Verkehr & Parken', 'Schule & Kita', 'Umwelt & Grün', 'Sauberkeit',
    'Soziales & Senioren', 'Jugend & Sport', 'Wirtschaft & Tourismus', 'Sonstiges'];
  var DRINGLICHKEIT = ['normal', 'wichtig', 'dringend'];
  var STATUS = ['Neu', 'In Arbeit', 'Erledigt'];
  // Gebiet: ganzes Stadtgebiet Bad Pyrmont. Ortsteile laut Hauptsatzung der Stadt Bad Pyrmont § 5
  // (Änderung vom 07.05.2026, in Kraft 01.06.2026) plus Kernstadt. Holzhausen und Oesdorf gehören zur Kernstadt,
  // Friedensthal zu Löwensen. Gleiche Liste in AnliegenLogic.java (Android).
  var KERNSTADT = 'Bad Pyrmont (Kernstadt)';
  var ORT_UNBEKANNT = 'Anderer Ort / weiß nicht';
  var ORTSTEILE = [KERNSTADT, 'Baarsen', 'Eichenborn', 'Großenberg', 'Hagen', 'Kleinenberg', 'Löwensen', 'Neersen', 'Thal', ORT_UNBEKANNT];
  var ORTSTEIL_LABELS = {}; // Anzeige in Auswahllisten (gespeichert wird immer der Name aus ORTSTEILE)
  ORTSTEIL_LABELS['Löwensen'] = 'Löwensen (mit Friedensthal)';
  var OHNE_ORTSTEIL = '–'; // Anzeige für alte Einträge ohne Ortsteil
  var FILTER_OHNE_ORTSTEIL = '-'; // Filterwert „ohne Angabe“
  var GEBIET_TEXT = 'Stadtgebiet Bad Pyrmont: Kernstadt (mit Holzhausen und Oesdorf) und die Ortsteile Baarsen, Eichenborn, ' +
    'Großenberg, Hagen, Kleinenberg, Löwensen (mit Friedensthal), Neersen und Thal';
  var MAX_TEXT = 4000, MAX_SHORT = 120, MAX_LIST = 5000;
  // 2.4.0: Bürger-Nachricht kürzer (WhatsApp-Link bleibt handlich). Helfer-Texte dürfen weiter 4000 Zeichen haben.
  var MAX_CITIZEN_TEXT = 1500;
  var MAX_WA_URL = 8000; // Obergrenze für den wa.me-Link (sehr lange Links öffnen auf manchen Handys nicht)
  var DAY = 86400000;

  // ------------------------------------------------------------ Text
  var EXTRA_BLANK = '\u200B\u200C\u200D\uFEFF\u00A0';
  function isBlank(c) { return /\s/.test(c) || EXTRA_BLANK.indexOf(c) >= 0; }
  function cleanText(s) {
    if (s == null) return '';
    var t = String(s).replace(/\r\n/g, '\n').replace(/\r/g, '\n');
    var a = 0, b = t.length;
    while (a < b && isBlank(t.charAt(a))) a++;
    while (b > a && isBlank(t.charAt(b - 1))) b--;
    return t.slice(a, b);
  }
  function cleanLine(s) {
    if (s == null) return '';
    return cleanText(String(s).replace(/[\n\r\t]/g, ' '));
  }
  function clip(s, n) { s = String(s == null ? '' : s); return s.length > n ? s.slice(0, n) : s; }
  function isTextEmpty(t) { return cleanText(t) === ''; }

  // ------------------------------------------------------------ Ortsteil
  /** Nur Werte aus ORTSTEILE (auch die Anzeige-Namen werden erkannt), sonst ''. */
  function cleanOrtsteil(v) {
    var s = cleanLine(v);
    if (!s) return '';
    if (ORTSTEILE.indexOf(s) >= 0) return s;
    for (var k in ORTSTEIL_LABELS) if (ORTSTEIL_LABELS[k] === s) return k;
    return '';
  }
  /** Anzeige: Ortsteil oder „–“ (alte Einträge / keine Angabe). */
  function ortsteilText(v) { return cleanOrtsteil(v) || OHNE_ORTSTEIL; }
  function ortsteilOptions() {
    return ORTSTEILE.map(function (o) { return { v: o, t: ORTSTEIL_LABELS[o] || o }; });
  }

  // ------------------------------------------------------------ Nummer
  /** Wie Java normalizeNumber: gibt Ziffern (international, ohne +) oder null. */
  function normalizeStrict(raw) {
    if (raw == null) return null;
    var s = String(raw).trim();
    if (!s) return null;
    var digits = '', plus = 0;
    for (var i = 0; i < s.length; i++) {
      var c = s.charAt(i);
      if (c >= '0' && c <= '9') digits += c;
      else if (c === '+') { if (digits.length) return null; plus++; }
      else if (' -/().\u00A0\t'.indexOf(c) >= 0) { /* Trennzeichen */ }
      else return null;
    }
    if (plus > 1) return null;
    if (plus === 0 && digits.indexOf('00') === 0) digits = digits.slice(2);
    if (!digits || digits.charAt(0) === '0') return null;
    if (digits.length < 8 || digits.length > 15) return null;
    return digits;
  }
  /** Nur Trennzeichen entfernen (für Anzeige/Fehlertexte). */
  function normalizeNumber(input) {
    var s = String(input == null ? '' : input).trim().replace(/[\s\-()./\u00A0]/g, '');
    if (s.charAt(0) === '+') s = s.slice(1);
    else if (s.indexOf('00') === 0) s = s.slice(2);
    return s;
  }
  function validateNumber(input) {
    var raw = String(input == null ? '' : input).trim();
    if (raw === '') return { ok: true, number: '', empty: true };
    var n = normalizeStrict(raw);
    if (n) return { ok: true, number: n, empty: false };
    if (/[^0-9+\s\-()./\u00A0]/.test(raw)) return { ok: false, number: '', error: 'Bitte nur Ziffern eingeben (z. B. +49 170 1234567).' };
    var d = normalizeNumber(raw);
    if (!/^[0-9]+$/.test(d)) return { ok: false, number: '', error: 'Bitte nur Ziffern eingeben (z. B. +49 170 1234567).' };
    if (d.charAt(0) === '0') return { ok: false, number: '', error: 'Bitte mit Ländervorwahl eingeben, z. B. 49 statt der ersten 0.' };
    return { ok: false, number: '', error: 'Die Nummer muss 8 bis 15 Ziffern haben (mit Ländervorwahl).' };
  }

  // ------------------------------------------------------------ Standort
  function validCoord(lat, lon) {
    return typeof lat === 'number' && typeof lon === 'number' && isFinite(lat) && isFinite(lon) &&
      lat >= -90 && lat <= 90 && lon >= -180 && lon <= 180;
  }
  function osmLink(lat, lon) {
    if (!validCoord(lat, lon)) return '';
    var la = lat.toFixed(5), lo = lon.toFixed(5);
    return 'https://www.openstreetmap.org/?mlat=' + la + '&mlon=' + lo + '#map=18/' + la + '/' + lo;
  }
  function standortText(loc) {
    if (!loc || !validCoord(loc.lat, loc.lon)) return '';
    var s = osmLink(loc.lat, loc.lon);
    if (typeof loc.acc === 'number' && isFinite(loc.acc) && loc.acc > 0) s += ' (ca. ' + Math.max(1, Math.round(loc.acc)) + ' m genau)';
    return s;
  }

  // ------------------------------------------------------------ Nachricht (Bürger)
  function buildMessage(o) {
    o = o || {};
    var lines = [HEADER, 'Art: ' + (o.art === 'Idee' ? 'Idee' : 'Anliegen')];
    if (THEMEN.indexOf(o.thema) >= 0) lines.push('Thema: ' + o.thema);
    if (DRINGLICHKEIT.indexOf(o.dringlichkeit) >= 0) lines.push('Dringlichkeit: ' + o.dringlichkeit);
    var n = cleanLine(o.name), ort = cleanLine(o.ort), st = standortText(o.standort), ot = cleanOrtsteil(o.ortsteil);
    if (n) lines.push('Name: ' + n);
    if (ot) lines.push('Ortsteil: ' + ot);
    if (ort) lines.push('Ort: ' + ort);
    if (st) lines.push('Standort: ' + st);
    if (o.foto) lines.push('Foto: im Anhang');
    return lines.join('\n') + '\n\n' + clipChars(cleanText(o.text), MAX_CITIZEN_TEXT);
  }
  /** Kürzt nach Zeichen (Emoji werden nicht zerschnitten). */
  function clipChars(s, n) {
    var a = Array.from(String(s == null ? '' : s));
    return a.length > n ? a.slice(0, n).join('') : String(s == null ? '' : s);
  }
  function urlEncode(s) {
    return encodeURIComponent(s == null ? '' : String(s)).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  function buildWhatsAppUrl(message, number) {
    var v = validateNumber(number);
    var n = v.ok ? v.number : '';
    var base = 'https://wa.me/' + n + '?text=';
    var url = base + urlEncode(message);
    if (url.length <= MAX_WA_URL) return url;
    // 2.4.0: zu langer Link -> Text am Ende kürzen (mit Hinweis), damit WhatsApp sicher aufgeht
    var note = '\n[… gekürzt]', chars = Array.from(String(message == null ? '' : message)), lo = 0, hi = chars.length;
    while (lo < hi) {
      var mid = (lo + hi + 1) >> 1;
      if ((base + urlEncode(chars.slice(0, mid).join('') + note)).length <= MAX_WA_URL) lo = mid; else hi = mid - 1;
    }
    return base + urlEncode(chars.slice(0, lo).join('') + note);
  }
  function isAllowedExternal(url) {
    return typeof url === 'string' && !/[\s"<>\\]/.test(url) &&
      (url.indexOf('https://wa.me/') === 0 || url.indexOf('https://www.openstreetmap.org/') === 0 ||
       url.indexOf('https://aistudio.google.com/') === 0 || url.indexOf(PUBLIC_URL) === 0);
  }

  // ------------------------------------------------------------ 2.3.0: Bürger-Link (QR-Code) mit optionaler Nummer
  /** Basis-Adresse für den Bürger-Link: eigene http(s)-Adresse (nicht localhost), sonst die öffentliche Seite. */
  function citizenBase(href) {
    var m = /^(https?:\/\/([^\/?#:]+)(?::\d+)?)(\/[^?#]*)?/.exec(String(href || ''));
    if (!m) return PUBLIC_URL;
    var host = m[2].toLowerCase();
    if (host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || /^(10|192\.168)\./.test(host)) return PUBLIC_URL;
    var path = (m[3] || '/').replace(/index\.html?$/i, '');
    if (path.charAt(path.length - 1) !== '/') path += '/';
    if (/[\s"<>\\]/.test(m[1] + path)) return PUBLIC_URL;
    return m[1] + path;
  }
  /** Link für Bürgerinnen und Bürger. Nummer nur, wenn gültig und ausdrücklich gewünscht. */
  function buildCitizenLink(base, number) {
    var b = String(base || PUBLIC_URL).split(/[?#]/)[0];
    if (!/^https?:\/\//.test(b)) b = PUBLIC_URL;
    var n = number ? normalizeStrict(number) : null;
    return b + '?modus=buerger' + (n ? '&an=' + n : '');
  }
  /** Liest ?modus=buerger und ?an=<Nummer> aus der Adresse. Ungültige Werte werden ignoriert. */
  function parseLinkParams(search) {
    var out = { buerger: false, number: '' };
    String(search || '').replace(/^[?#]/, '').split('&').forEach(function (kv) {
      var i = kv.indexOf('='), k = i < 0 ? kv : kv.slice(0, i), v = i < 0 ? '' : kv.slice(i + 1);
      try { k = decodeURIComponent(k); v = decodeURIComponent(v.replace(/\+/g, ' ')); } catch (e) { return; }
      if (k === 'modus' && v === 'buerger') out.buerger = true;
      if (k === 'an' && v.length <= 30) { var n = normalizeStrict(v); if (n) { out.number = n; out.buerger = true; } }
    });
    return out;
  }
  /** "+491701234567" für die Anzeige. */
  function displayNumber(n) {
    n = String(n || '');
    return n ? '+' + n : '';
  }

  // ------------------------------------------------------------ 2.3.0: WhatsApp-Nachricht übernehmen (Helfer)
  /** Liest eine Bürger-Nachricht (Format von buildMessage) aus kopiertem WhatsApp-Text. */
  /** 2.4.0: Telefonnummer aus WhatsApp (Absender) international: „0151 …“ -> „+49151…“. Sonst ''. */
  function phoneToIntl(s) {
    var t = String(s == null ? '' : s).replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '').trim();
    if (!/^[+0-9][0-9 \-\/().\u00A0\u202F]{5,24}$/.test(t)) return '';
    var d = t.replace(/[^0-9]/g, '');
    if (t.charAt(0) === '+') { /* schon international */ }
    else if (d.indexOf('00') === 0) d = d.slice(2);
    else if (d.charAt(0) === '0') d = '49' + d.slice(1);
    else return '';
    if (d.length < 8 || d.length > 15 || d.charAt(0) === '0') return '';
    return '+' + d;
  }
  function parseCitizenMessage(raw) {
    var t = String(raw == null ? '' : raw).replace(/\r\n?/g, '\n').replace(/[\u200E\u200F\u202A-\u202E\u2066-\u2069]/g, '');
    // WhatsApp-Kopie: "[29.09.26, 10:15] Maria: ..." (iPhone) oder "29.09.26, 10:15 - +49 151 …: ..." (Android) vorne entfernen,
    // 2.4.0: Absender merken (Nummer -> Kontakt)
    var sender = '';
    var pre = /^\s*(?:\[[^\]\n]{4,40}\]\s*|\d{1,2}\.\d{1,2}\.\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?\s+-\s+)([^:\n]{1,60}):\s*/.exec(t);
    if (pre) { sender = cleanLine(pre[1]); t = t.slice(pre[0].length); }
    var res = { ok: false, art: 'Anliegen', thema: '', dringlichkeit: '', name: '', ortsteil: '', ort: '', standort: '', foto: false, text: '',
      phone: phoneToIntl(sender), sender: '' };
    if (sender && !res.phone && !/^\+?[0-9 ()\-\u2026.]+$/.test(sender)) res.sender = clip(sender, MAX_SHORT);
    var lines = t.split('\n');
    var h = -1;
    for (var i = 0; i < lines.length && i < 5; i++) if (cleanLine(lines[i]).indexOf(HEADER) >= 0) { h = i; break; }
    if (h < 0) { res.text = clip(cleanText(t), MAX_TEXT); res.ok = !!res.text; res.format = false; return res; }
    var j = h + 1;
    for (; j < lines.length; j++) {
      var l = cleanLine(lines[j]);
      if (!l) { j++; break; }
      var m = /^(Art|Thema|Dringlichkeit|Name|Ortsteil|Ort|Standort|Foto):\s*(.*)$/.exec(l);
      if (!m) break;
      var k = m[1], v = cleanLine(m[2]);
      if (k === 'Art') res.art = v === 'Idee' ? 'Idee' : 'Anliegen';
      else if (k === 'Thema') res.thema = THEMEN.indexOf(v) >= 0 ? v : '';
      else if (k === 'Dringlichkeit') res.dringlichkeit = DRINGLICHKEIT.indexOf(v) >= 0 ? v : '';
      else if (k === 'Name') res.name = clip(v, MAX_SHORT);
      else if (k === 'Ortsteil') res.ortsteil = cleanOrtsteil(v);
      else if (k === 'Ort') res.ort = clip(v, MAX_SHORT);
      else if (k === 'Standort') { var u = /https:\/\/www\.openstreetmap\.org\/\S+/.exec(v); res.standort = u ? u[0] : ''; }
      else if (k === 'Foto') res.foto = true;
    }
    res.text = clip(cleanText(lines.slice(j).join('\n')), MAX_TEXT);
    res.format = true;
    res.ok = !!(res.text || res.thema || res.ort || res.ortsteil);
    return res;
  }
  /** Macht aus der gelesenen Nachricht Felder für ein Helfer-Anliegen. */
  function anliegenFromMessage(p) {
    var extra = [];
    if (p.standort) extra.push('Standort: ' + p.standort);
    if (p.foto) extra.push('Foto: in WhatsApp');
    var text = (p.art === 'Idee' ? 'Idee: ' : '') + (p.text || '');
    if (extra.length) text = cleanText(text) + '\n\n' + extra.join('\n');
    var kontakt = [p.name || p.sender || '', p.phone || ''].filter(Boolean).join(', ');
    return { thema: p.thema || 'Sonstiges', dringlichkeit: p.dringlichkeit || 'normal', ortsteil: cleanOrtsteil(p.ortsteil), ort: p.ort || '',
      kontakt: clip(kontakt, MAX_SHORT), text: clip(cleanText(text), MAX_TEXT), status: 'Neu' };
  }

  // ------------------------------------------------------------ Datum
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function isValidDate(s) {
    if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
    var y = +s.slice(0, 4), m = +s.slice(5, 7), d = +s.slice(8, 10);
    var dt = new Date(Date.UTC(y, m - 1, d));
    return y >= 2000 && y <= 2100 && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }
  function isValidTime(s) { return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s); }
  function dateDE(isoDate) { // 'YYYY-MM-DD' -> 'TT.MM.JJJJ'
    return isValidDate(isoDate) ? isoDate.slice(8, 10) + '.' + isoDate.slice(5, 7) + '.' + isoDate.slice(0, 4) : '';
  }
  function localDate(ms) { var d = new Date(ms); return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function stampDE(iso) { var t = Date.parse(iso); return isNaN(t) ? '' : dateDE(localDate(t)); }
  function isoOk(s) { return typeof s === 'string' && !isNaN(Date.parse(s)); }

  // ------------------------------------------------------------ Daten (Helfer)
  var seq = 0;
  function newId(prefix, now) {
    seq = (seq + 1) % 1296;
    return (prefix || 'x') + (now || Date.now()).toString(36) + seq.toString(36) + Math.floor(Math.random() * 1e6).toString(36);
  }
  function emptyData() { return { version: 2, mode: '', anliegen: [], ideen: [], termine: [], lastBackup: '' }; }
  function pick(v, list, def) { return list.indexOf(v) >= 0 ? v : def; }

  function sanitizeAnliegen(a, nowIso) {
    if (!a || typeof a !== 'object') return null;
    var text = clip(cleanText(a.text), MAX_TEXT);
    if (!text) return null;
    var status = pick(a.status, STATUS, 'Neu');
    var created = isoOk(a.created) ? a.created : nowIso;
    return {
      id: typeof a.id === 'string' && a.id ? clip(a.id, 64) : newId('a'),
      thema: pick(a.thema, THEMEN, 'Sonstiges'),
      dringlichkeit: pick(a.dringlichkeit, DRINGLICHKEIT, 'normal'),
      status: status,
      ortsteil: cleanOrtsteil(a.ortsteil), // '' = keine Angabe (auch alte Sicherungen)
      ort: clip(cleanLine(a.ort), MAX_SHORT),
      text: text,
      kontakt: clip(cleanLine(a.kontakt), MAX_SHORT),
      created: created,
      updated: isoOk(a.updated) ? a.updated : created,
      erledigtAm: status === 'Erledigt' ? (isoOk(a.erledigtAm) ? a.erledigtAm : (isoOk(a.updated) ? a.updated : nowIso)) : '',
      vorherStatus: a.vorherStatus === 'Neu' || a.vorherStatus === 'In Arbeit' ? a.vorherStatus : '' // 2.4.0: für „Wieder öffnen“
    };
  }
  function sanitizeIdee(i, nowIso) {
    if (!i || typeof i !== 'object') return null;
    var titel = clip(cleanLine(i.titel), MAX_SHORT), text = clip(cleanText(i.text), MAX_TEXT);
    if (!titel && !text) return null;
    if (!titel) titel = clip(cleanLine(text.split('\n')[0]), 60);
    var created = isoOk(i.created) ? i.created : nowIso;
    return { id: typeof i.id === 'string' && i.id ? clip(i.id, 64) : newId('i'), titel: titel, text: text,
      created: created, updated: isoOk(i.updated) ? i.updated : created };
  }
  function sanitizeTermin(t, nowIso) {
    if (!t || typeof t !== 'object') return null;
    var titel = clip(cleanLine(t.titel), MAX_SHORT);
    if (!titel) return null;
    var list = Array.isArray(t.checkliste) ? t.checkliste : [];
    var items = [];
    for (var k = 0; k < list.length && items.length < 50; k++) {
      var it = list[k]; var txt = clip(cleanLine(it && it.text), MAX_SHORT);
      if (txt) items.push({ text: txt, done: !!(it && it.done) });
    }
    var dauer = parseInt(t.dauer, 10);
    var created = isoOk(t.created) ? t.created : nowIso;
    return {
      id: typeof t.id === 'string' && t.id ? clip(t.id, 64) : newId('t'),
      titel: titel,
      datum: isValidDate(t.datum) ? t.datum : '',
      zeit: isValidDate(t.datum) && isValidTime(t.zeit) ? t.zeit : '',
      dauer: dauer >= 15 && dauer <= 1440 ? dauer : 60,
      ort: clip(cleanLine(t.ort), MAX_SHORT),
      notiz: clip(cleanText(t.notiz), MAX_TEXT),
      checkliste: items,
      erledigt: !!t.erledigt,
      created: created,
      updated: isoOk(t.updated) ? t.updated : created
    };
  }
  function sanitizeList(list, fn, nowIso) {
    var out = [], ids = {};
    if (!Array.isArray(list)) return out;
    for (var i = 0; i < list.length && out.length < MAX_LIST; i++) {
      var x = fn(list[i], nowIso);
      if (!x) continue;
      while (ids[x.id]) x.id = newId(x.id.charAt(0));
      ids[x.id] = 1; out.push(x);
    }
    return out;
  }
  function sanitizeData(raw, nowIso) {
    nowIso = nowIso || new Date().toISOString();
    var d = emptyData();
    if (!raw || typeof raw !== 'object') return d;
    d.mode = raw.mode === 'buerger' || raw.mode === 'helfer' ? raw.mode : '';
    d.anliegen = sanitizeList(raw.anliegen, sanitizeAnliegen, nowIso);
    d.ideen = sanitizeList(raw.ideen, sanitizeIdee, nowIso);
    d.termine = sanitizeList(raw.termine, sanitizeTermin, nowIso);
    d.lastBackup = isoOk(raw.lastBackup) ? raw.lastBackup : '';
    return d;
  }
  function parseData(text, nowIso) {
    if (!text) return emptyData();
    try { return sanitizeData(JSON.parse(text), nowIso); } catch (e) { return emptyData(); }
  }
  function upsert(list, item) {
    for (var i = 0; i < list.length; i++) if (list[i].id === item.id) { list[i] = item; return list; }
    list.unshift(item); return list;
  }
  function removeById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) { list.splice(i, 1); return true; }
    return false;
  }
  function findById(list, id) {
    for (var i = 0; i < list.length; i++) if (list[i].id === id) return list[i];
    return null;
  }
  /** Status setzen und erledigtAm pflegen. */
  function withStatus(a, status, nowIso) {
    var b = {}; for (var k in a) if (Object.prototype.hasOwnProperty.call(a, k)) b[k] = a[k];
    b.status = pick(status, STATUS, 'Neu');
    if (a.status !== b.status && a.status !== 'Erledigt') b.vorherStatus = a.status; // 2.4.0
    if (b.status === 'Erledigt') { if (a.status !== 'Erledigt' || !b.erledigtAm) b.erledigtAm = nowIso; }
    else b.erledigtAm = '';
    b.updated = nowIso;
    return b;
  }
  /** 2.4.0: „Wieder öffnen“ stellt den Status von vorher her (z. B. „In Arbeit“), sonst „Neu“. */
  function reopenStatus(a) { return a && (a.vorherStatus === 'In Arbeit' || a.vorherStatus === 'Neu') ? a.vorherStatus : 'Neu'; }
  function filterAnliegen(list, f) {
    f = f || {};
    var q = cleanLine(f.q || '').toLowerCase();
    var out = list.filter(function (a) {
      if (q && (a.text + ' ' + a.ort + ' ' + (a.ortsteil || '') + ' ' + a.thema + ' ' + a.kontakt).toLowerCase().indexOf(q) < 0) return false;
      if (f.ortsteil) {
        if (f.ortsteil === FILTER_OHNE_ORTSTEIL) { if (cleanOrtsteil(a.ortsteil)) return false; }
        else if (cleanOrtsteil(a.ortsteil) !== f.ortsteil) return false;
      }
      return (!f.thema || a.thema === f.thema) && (!f.status || a.status === f.status);
    });
    return out.sort(function (x, y) {
      var s = STATUS.indexOf(x.status) - STATUS.indexOf(y.status);
      if (s) return s;
      var d = DRINGLICHKEIT.indexOf(y.dringlichkeit) - DRINGLICHKEIT.indexOf(x.dringlichkeit);
      if (d) return d;
      return x.created < y.created ? 1 : x.created > y.created ? -1 : 0;
    });
  }

  // ------------------------------------------------------------ Termine
  function progress(t) {
    var done = 0; (t.checkliste || []).forEach(function (c) { if (c.done) done++; });
    return { done: done, total: (t.checkliste || []).length };
  }
  function sortTermine(list) {
    return list.slice().sort(function (a, b) {
      if (a.erledigt !== b.erledigt) return a.erledigt ? 1 : -1;
      var ka = a.datum ? a.datum + ' ' + (a.zeit || '99:99') : '9999';
      var kb = b.datum ? b.datum + ' ' + (b.zeit || '99:99') : '9999';
      if (ka !== kb) return ka < kb ? -1 : 1;
      return a.created < b.created ? 1 : a.created > b.created ? -1 : 0;
    });
  }
  function terminWann(t) {
    if (!t.datum) return 'ohne Datum';
    return dateDE(t.datum) + (t.zeit ? ', ' + t.zeit + ' Uhr' : '');
  }

  var CHECKLISTEN = {
    'Infostand': ['Standort bei der Stadt anmelden', 'Tisch, Schirm und Aufsteller einpacken', 'Info-Material und Flyer mitnehmen',
      'Liste für Anliegen und Stifte mitnehmen', 'Helferinnen und Helfer einteilen', 'Beitrag vorher in sozialen Medien posten',
      'Nachher: Anliegen in die App eintragen'],
    'Veranstaltung': ['Raum buchen und Termin festlegen', 'Einladung schreiben und verteilen', 'Technik prüfen (Mikrofon, Beamer)',
      'Ablauf und Redezeiten planen', 'Getränke organisieren', 'Barrierefreiheit prüfen', 'Nachher: Danke-Beitrag und Ergebnisse teilen'],
    'Hausbesuche': ['Straßen und Gebiet festlegen', 'Info-Karten mit Kontakt drucken', 'Zu zweit gehen, Route absprechen',
      'Nur klingeln, nichts aufdrängen', 'Anliegen nur mit Einverständnis notieren', 'Nachher: Anliegen in die App eintragen']
  };
  function checklistFor(name) {
    var l = CHECKLISTEN[name]; if (!l) return [];
    return l.map(function (t) { return { text: t, done: false }; });
  }

  // ------------------------------------------------------------ Ideen-Vorlagen (offline, neutral)
  var VORLAGEN = [
    { id: 'sprechstunde', titel: 'Bürgersprechstunde',
      text: 'Bürgersprechstunde mit Hajo Bönke\n\nWann: [Datum], [Uhrzeit] Uhr\nWo: [Ort], Bad Pyrmont\n\nSie haben ein Anliegen, eine Frage oder eine Idee für Bad Pyrmont? ' +
        'Kommen Sie vorbei. Eine Anmeldung ist nicht nötig. Jedes Anliegen wird aufgenommen und weitergegeben.' },
    { id: 'infostand', titel: 'Infostand am Markt',
      text: 'Infostand am Markt\n\nWann: [Datum], [Uhrzeit] bis [Uhrzeit] Uhr\nWo: [Ort, z. B. Marktplatz / Brunnenstraße]\n\n' +
        'Wir sind vor Ort und hören zu: Was läuft gut in Bad Pyrmont, was kann besser werden? Bringen Sie Ihre Anliegen und Ideen mit.' },
    { id: 'spaziergang', titel: 'Stadtspaziergang',
      text: 'Stadtspaziergang durch [Ortsteil]\n\nTreffpunkt: [Ort], [Datum], [Uhrzeit] Uhr\nDauer: etwa 1 Stunde\n\n' +
        'Gemeinsam schauen wir uns an, wo es hakt: Wege, Plätze, Parken, Beleuchtung. Zeigen Sie uns die Stellen, die Ihnen wichtig sind.' },
    { id: 'umfrage', titel: 'Kurze Umfrage',
      text: 'Kurze Umfrage für Bad Pyrmont\n\n1. Was gefällt Ihnen in Ihrem Ortsteil?\n2. Was sollte sich zuerst ändern?\n' +
        '3. Welches Thema ist Ihnen am wichtigsten? (Verkehr, Schule, Umwelt, Soziales, anderes)\n4. Wie möchten Sie informiert werden?\n\n' +
        'Die Antworten sind freiwillig. Bitte keine Namen anderer Personen nennen.' },
    { id: 'post-einladung', titel: 'Social-Media-Post: Einladung',
      text: 'Am [Datum] um [Uhrzeit] Uhr bin ich in [Ort] für Sie da. Kommen Sie vorbei und erzählen Sie mir, was Sie in Bad Pyrmont bewegt. ' +
        'Ich freue mich auf das Gespräch.\n\n#BadPyrmont' },
    { id: 'post-rueckblick', titel: 'Social-Media-Post: Rückblick und Danke',
      text: 'Danke für die vielen Gespräche am [Datum] in [Ort]. Die wichtigsten Themen waren: [Thema 1], [Thema 2] und [Thema 3]. ' +
        'Ich nehme alle Anliegen mit und melde mich, sobald es Neuigkeiten gibt.\n\n#BadPyrmont' },
    { id: 'post-update', titel: 'Social-Media-Post: Anliegen erledigt',
      text: 'Kurzes Update: Das Anliegen „[Thema]“ in [Ort] wurde bearbeitet. [Was wurde getan?]\n' +
        'Danke an alle, die darauf hingewiesen haben. Weitere Anliegen können Sie mir jederzeit schicken.\n\n#BadPyrmont' },
    { id: 'aufruf', titel: 'Aufruf: Anliegen melden',
      text: 'Haben Sie ein Anliegen für Bad Pyrmont? Ein kaputter Weg, eine gefährliche Kreuzung oder eine gute Idee? ' +
        'Schreiben Sie mir per WhatsApp. Name und Ort sind freiwillig. Ich kümmere mich darum und gebe Bescheid.' }
  ];

  // ------------------------------------------------------------ CSV
  function csvCell(v) {
    var s = String(v == null ? '' : v);
    if (/^[=+\-@\t\r]/.test(s)) s = "'" + s; // Formel-Schutz für Tabellenprogramme
    if (/[;"\n\r]/.test(s)) s = '"' + s.replace(/"/g, '""') + '"';
    return s;
  }
  function anliegenCSV(list) {
    var rows = [['Datum', 'Thema', 'Dringlichkeit', 'Status', 'Ortsteil', 'Ort', 'Text', 'Kontakt', 'Erledigt am']];
    list.forEach(function (a) {
      rows.push([stampDE(a.created), a.thema, a.dringlichkeit, a.status, ortsteilText(a.ortsteil), a.ort, a.text, a.kontakt, a.erledigtAm ? stampDE(a.erledigtAm) : '']);
    });
    return '\uFEFF' + rows.map(function (r) { return r.map(csvCell).join(';'); }).join('\r\n') + '\r\n';
  }

  // ------------------------------------------------------------ Sicherung
  function makeBackup(data, nowIso) {
    var d = sanitizeData(data, nowIso);
    return JSON.stringify({ app: 'buergeranliegen', version: 2, exportiert: nowIso,
      daten: { anliegen: d.anliegen, ideen: d.ideen, termine: d.termine } }, null, 2);
  }
  function parseBackup(text, nowIso) {
    var obj;
    try { obj = JSON.parse(String(text == null ? '' : text).replace(/^\uFEFF/, '')); }
    catch (e) { return { ok: false, error: 'Die Datei ist keine gültige Sicherung (kein JSON).' }; }
    if (!obj || typeof obj !== 'object') return { ok: false, error: 'Die Datei ist keine gültige Sicherung.' };
    var src = obj.app === 'buergeranliegen' && obj.daten && typeof obj.daten === 'object' ? obj.daten : obj;
    if (!Array.isArray(src.anliegen) && !Array.isArray(src.ideen) && !Array.isArray(src.termine)) {
      return { ok: false, error: 'In der Datei sind keine Anliegen, Ideen oder Termine.' };
    }
    var d = sanitizeData(src, nowIso);
    return { ok: true, data: d, counts: { anliegen: d.anliegen.length, ideen: d.ideen.length, termine: d.termine.length } };
  }
  // 2.4.0: Was geht beim Laden einer Sicherung verloren? (neuere oder fehlende Einträge auf dem Gerät)
  function countsOf(d) { d = d || {}; return { anliegen: (d.anliegen || []).length, ideen: (d.ideen || []).length, termine: (d.termine || []).length }; }
  function restoreDiff(cur, inc) {
    cur = cur || emptyData(); inc = inc || emptyData();
    var kinds = [['anliegen', 'Anliegen', function (a) { return a.thema + ': ' + excerpt(a.text, 60); }],
      ['ideen', 'Idee', function (i) { return i.titel; }], ['termine', 'Termin', function (t) { return t.titel; }]];
    var lost = [];
    kinds.forEach(function (k) {
      var idx = {};
      (inc[k[0]] || []).forEach(function (x) { idx[x.id] = x; });
      (cur[k[0]] || []).forEach(function (x) {
        var o = idx[x.id];
        var tx = Date.parse(x.updated || x.created), to = o ? Date.parse(o.updated || o.created) : NaN;
        if (!o) lost.push({ kind: k[1], title: k[2](x), updated: x.updated || x.created, why: 'fehlt in der Sicherung' });
        else if (tx > to) lost.push({ kind: k[1], title: k[2](x), updated: x.updated || x.created, why: 'hier neuer bearbeitet' });
      });
    });
    lost.sort(function (a, b) { return a.updated < b.updated ? 1 : a.updated > b.updated ? -1 : 0; });
    return { current: countsOf(cur), incoming: countsOf(inc), lost: lost };
  }
  function countsText(c) { return c.anliegen + ' Anliegen, ' + c.ideen + ' Ideen, ' + c.termine + ' Termine'; }
  /** Text für den Dialog vor dem Laden. */
  function restoreSummary(diff, max) {
    max = max || 5;
    var L = ['Sicherung laden?', '', 'Jetzt auf dem Gerät: ' + countsText(diff.current) + '.', 'In der Sicherung: ' + countsText(diff.incoming) + '.', ''];
    if (diff.lost.length) {
      L.push('Achtung: ' + diff.lost.length + (diff.lost.length === 1 ? ' Eintrag geht' : ' Einträge gehen') + ' verloren (neuer als die Sicherung):');
      diff.lost.slice(0, max).forEach(function (x) { L.push('- ' + x.kind + ' „' + excerpt(x.title, 50) + '“ (' + stampDE(x.updated) + ', ' + x.why + ')'); });
      if (diff.lost.length > max) L.push('- … und ' + (diff.lost.length - max) + ' weitere');
      L.push('');
    }
    L.push('Vorher speichert die App automatisch eine Sicherheitskopie. Sie können sie danach wiederherstellen.');
    return L.join('\n');
  }
  /** Sicherheitskopie (vor Laden/Löschen): gleiche Form wie eine Sicherung, mit Grund. */
  function makeSafetyCopy(data, nowIso, grund) {
    var o = JSON.parse(makeBackup(data, nowIso));
    o.sicherheitskopie = true; o.grund = cleanLine(grund || '');
    return JSON.stringify(o);
  }
  function parseSafetyCopy(text, nowIso) {
    if (!text) return null;
    var r = parseBackup(text, nowIso);
    if (!r.ok) return null;
    var o = {}; try { o = JSON.parse(text); } catch (e) {}
    r.stamp = isoOk(o.exportiert) ? o.exportiert : ''; r.grund = cleanLine(o.grund || '');
    return r;
  }

  // ------------------------------------------------------------ Kalender (.ics)
  function icsEscape(s) { return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n'); }
  function utf8Len(ch) { var c = ch.codePointAt(0); return c < 0x80 ? 1 : c < 0x800 ? 2 : c < 0x10000 ? 3 : 4; }
  function icsFold(line) {
    var out = [], cur = '', len = 0, limit = 75;
    for (var ch of line) { // eslint-disable-line
      var l = utf8Len(ch);
      if (len + l > limit) { out.push(cur); cur = ' '; len = 1; limit = 75; }
      cur += ch; len += l;
    }
    out.push(cur);
    return out.join('\r\n');
  }
  function utcStamp(ms) {
    var d = new Date(ms);
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + pad(d.getUTCSeconds()) + 'Z';
  }
  function addMinutes(datum, zeit, min) { // lokale "schwebende" Zeit, ohne Zeitzonen-Umrechnung
    var d = new Date(Date.UTC(+datum.slice(0, 4), +datum.slice(5, 7) - 1, +datum.slice(8, 10), +zeit.slice(0, 2), +zeit.slice(3, 5) + min));
    return d.getUTCFullYear() + pad(d.getUTCMonth() + 1) + pad(d.getUTCDate()) + 'T' + pad(d.getUTCHours()) + pad(d.getUTCMinutes()) + '00';
  }
  function terminBeschreibung(t) {
    var s = t.notiz || '';
    if (t.checkliste && t.checkliste.length) {
      s += (s ? '\n\n' : '') + 'Checkliste:\n' + t.checkliste.map(function (c) { return (c.done ? '[x] ' : '[ ] ') + c.text; }).join('\n');
    }
    return s;
  }
  function buildICS(t, nowMs) {
    if (!t || !isValidDate(t.datum)) return '';
    var L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Buerger-Anliegen Bad Pyrmont//' + VERSION + '//DE', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
      'BEGIN:VEVENT', 'UID:' + t.id + '@buergeranliegen.local', 'DTSTAMP:' + utcStamp(nowMs || Date.now())];
    var ymd = t.datum.replace(/-/g, '');
    if (isValidTime(t.zeit)) {
      L.push('DTSTART:' + ymd + 'T' + t.zeit.replace(':', '') + '00');
      L.push('DTEND:' + addMinutes(t.datum, t.zeit, t.dauer || 60));
    } else {
      L.push('DTSTART;VALUE=DATE:' + ymd);
      L.push('DTEND;VALUE=DATE:' + addMinutes(t.datum, '00:00', 1440).slice(0, 8));
    }
    L.push('SUMMARY:' + icsEscape(t.titel));
    if (t.ort) L.push('LOCATION:' + icsEscape(t.ort));
    var desc = terminBeschreibung(t);
    if (desc) L.push('DESCRIPTION:' + icsEscape(desc));
    L.push('END:VEVENT', 'END:VCALENDAR');
    return L.map(icsFold).join('\r\n') + '\r\n';
  }
  function safeFileName(s) {
    var t = String(s || '').toLowerCase().replace(/ä/g, 'ae').replace(/ö/g, 'oe').replace(/ü/g, 'ue').replace(/ß/g, 'ss')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '');
    return t.slice(0, 40).replace(/-+$/, '') || 'datei';
  }

  // ------------------------------------------------------------ Wochen-Zusammenfassung
  function excerpt(s, n) { s = cleanLine(s); return s.length > n ? s.slice(0, n - 1) + '…' : s; }
  /** Anzahl je Ortsteil (Reihenfolge wie ORTSTEILE, „ohne Angabe“ zuletzt), nur Ortsteile mit Anliegen. */
  function ortsteilCounts(list) {
    var out = [];
    ORTSTEILE.forEach(function (o) {
      var c = list.filter(function (a) { return cleanOrtsteil(a.ortsteil) === o; }).length;
      if (c) out.push({ name: o, count: c });
    });
    var none = list.filter(function (a) { return !cleanOrtsteil(a.ortsteil); }).length;
    if (none) out.push({ name: 'ohne Angabe (' + OHNE_ORTSTEIL + ')', count: none });
    return out;
  }
  function buildSummary(data, nowMs) {
    nowMs = nowMs || Date.now();
    var since = nowMs - 7 * DAY;
    var inWeek = function (iso) { var t = Date.parse(iso); return !isNaN(t) && t >= since && t <= nowMs + DAY; };
    var an = data.anliegen || [], id = data.ideen || [], te = data.termine || [];
    var offen = an.filter(function (a) { return a.status !== 'Erledigt'; });
    var L = ['Wochen-Zusammenfassung für Hajo Bönke', 'Zeitraum: ' + dateDE(localDate(since)) + ' bis ' + dateDE(localDate(nowMs)), ''];
    L.push('Anliegen');
    L.push('- Neu in dieser Woche: ' + an.filter(function (a) { return inWeek(a.created); }).length);
    L.push('- Offen gesamt: ' + offen.length + ' (davon in Arbeit: ' + offen.filter(function (a) { return a.status === 'In Arbeit'; }).length + ')');
    L.push('- Erledigt in dieser Woche: ' + an.filter(function (a) { return a.status === 'Erledigt' && inWeek(a.erledigtAm); }).length);
    L.push('', 'Offene Anliegen nach Thema');
    var any = false;
    THEMEN.forEach(function (th) {
      var c = offen.filter(function (a) { return a.thema === th; }).length;
      if (c) { L.push('- ' + th + ': ' + c); any = true; }
    });
    if (!any) L.push('- keine');
    L.push('', 'Offene Anliegen nach Ortsteil');
    ortsteilCounts(offen).forEach(function (c) { L.push('- ' + c.name + ': ' + c.count); });
    if (!offen.length) L.push('- keine');
    L.push('', 'Dringende Anliegen (offen)');
    var dr = filterAnliegen(offen.filter(function (a) { return a.dringlichkeit === 'dringend'; }), {});
    dr.slice(0, 10).forEach(function (a) {
      var wo = [cleanOrtsteil(a.ortsteil), a.ort].filter(Boolean).join(', ');
      L.push('- [' + a.thema + '] ' + (wo ? wo + ': ' : '') + excerpt(a.text, 90));
    });
    if (dr.length > 10) L.push('- … und ' + (dr.length - 10) + ' weitere');
    if (!dr.length) L.push('- keine');
    L.push('', 'Offene Aufgaben und Termine');
    var ot = sortTermine(te.filter(function (t) { return !t.erledigt; }));
    ot.slice(0, 10).forEach(function (t) {
      var p = progress(t);
      L.push('- ' + (t.datum ? terminWann(t) + ': ' : '') + t.titel + (t.ort ? ' (' + t.ort + ')' : '') + (p.total ? ' – ' + p.done + ' von ' + p.total + ' erledigt' : ''));
    });
    if (ot.length > 10) L.push('- … und ' + (ot.length - 10) + ' weitere');
    if (!ot.length) L.push('- keine');
    L.push('', 'Neue Ideen in dieser Woche');
    var ni = id.filter(function (i) { return inWeek(i.created); });
    ni.slice(0, 10).forEach(function (i) { L.push('- ' + excerpt(i.titel, 90)); });
    if (ni.length > 10) L.push('- … und ' + (ni.length - 10) + ' weitere');
    if (!ni.length) L.push('- keine');
    return L.join('\n');
  }


  // ------------------------------------------------------------ 2.3.0: Sicherungs-Erinnerung
  var BACKUP_DAYS = 14;
  /** level: 'none' (keine Daten), 'ok', 'due' (nie oder älter als 14 Tage). */
  function backupReminder(data, nowMs) {
    nowMs = nowMs || Date.now();
    var n = (data.anliegen || []).length + (data.ideen || []).length + (data.termine || []).length;
    if (!n) return { level: 'none', text: '' };
    var t = Date.parse(data.lastBackup || '');
    if (isNaN(t)) return { level: 'due', days: -1, text: 'Noch keine Sicherung gemacht. Bitte jetzt sichern.' };
    var days = Math.max(0, Math.floor((nowMs - t) / DAY));
    var when = days === 0 ? 'heute' : days === 1 ? 'gestern' : 'vor ' + days + ' Tagen';
    var txt = 'Letzte Sicherung: ' + stampDE(data.lastBackup) + ' (' + when + ').';
    if (days >= BACKUP_DAYS) return { level: 'due', days: days, text: txt + ' Bitte wieder sichern.' };
    return { level: 'ok', days: days, text: txt };
  }

  // ------------------------------------------------------------ KI: Anonymisierung (vor jedem Senden)
  // 2.4.0: Unicode-Buchstaben (ş, ı, ğ, ç, ł, á, Kyrillisch …), Namen nach Rollen-Wörtern (Anwohnerin, Sohn, Amt …),
  // Vorname + Nachname ohne Überlappung (Rollen-Wörter: siehe ROLLEN), Paar-Heuristik für fremde Namen, Kinder-Vornamen, mehrteilige Straßen + Hausnummer.
  // Ortsteile, Orte und „Hajo Bönke“ bleiben erlaubt. Gleiche Regeln in AnliegenLogic.anonymizeText (Android).
  var VORNAMEN = ('Anna Maria Marie Sophie Sofia Emma Mia Hannah Hanna Lena Lea Laura Julia Sarah Sara Lisa Katharina Christina Andrea Sabine Susanne ' +
    'Petra Monika Ursula Renate Karin Birgit Claudia Nicole Stefanie Martina Heike Gabriele Brigitte Ingrid Elke Anja Silke Tanja Sandra Melanie ' +
    'Jana Jennifer Jessica Nina Kerstin Barbara Christa Helga Erika Elisabeth Gisela Doris Ute Angelika Marion Beate Anke Carina Johanna Clara Klara ' +
    'Gerda Hildegard Irmgard Waltraud Gertrud Edith Inge Ilse Margot Rosemarie Hannelore Marianne Sieglinde Karla Paula Frieda Greta Ida Lotta Mila ' +
    'Emilia Leonie Amelie Ella Lina Luisa Louisa Leni Marlene Nele Pia Romy Zoe Charlotte Mathilda Matilda Hailey Lara Alina Selin Elif Zeynep Merve ' +
    'Peter Michael Thomas Andreas Stefan Stephan Christian Frank Markus Marcus Klaus Wolfgang Jürgen Juergen Uwe Hans Dieter Werner Bernd Manfred Günter ' +
    'Guenter Horst Helmut Gerhard Karl Heinz Rolf Ralf Jörg Joerg Dirk Sven Tobias Jan Lukas Lucas Leon Paul Felix Jonas Maximilian Alexander Daniel ' +
    'David Florian Sebastian Tim Timo Kevin Dennis Patrick Philipp Simon Matthias Martin Oliver Torsten Thorsten Holger Volker Rainer Norbert Detlef ' +
    'Friedrich Wilhelm Heinrich Hermann Otto Walter Kurt Egon Erich Fritz Siegfried Reinhard Hartmut Lothar Ulrich Gerd Gert Harald Jens Lars Nils ' +
    'Jannik Janik Yannick Luca Luka Matteo Mattis Moritz Niklas Nico Noel Liam Leo Levi Anton Oskar Jakob Jacob Julian Fabian Lennard Lennart Linus ' +
    'Malte Marlon Milan Mika Mike Samuel Vincent Valentin Henri Hannes Bastian Benedikt Erik Eric Justus Konstantin Emir Yusuf Can Deniz Kerem ' +
    'Ali Mehmet Mustafa Ahmet Ahmed Mohammed Muhammad Hasan Hüseyin Ibrahim Fatma Ayse Ayşe Emine Hatice Olga Irina Natalia Natascha Svetlana Swetlana ' +
    'Tatjana Oksana Piotr Pawel Paweł Tomasz Krzysztof Katarzyna Agnieszka Małgorzata Anna-Lena Kilian Ben Finn Noah Elias Luis Henry Emil Theo Ole Mats').split(' ');
  var VORNAMEN_SET = {};
  VORNAMEN.forEach(function (n) { VORNAMEN_SET[n] = 1; });
  // Wörter vor einem Namen (Anrede, Familie, Nachbarschaft, Ämter). Groß geschrieben, wie im Text.
  var ROLLEN = ('Herr Herrn Frau Familie Fam. Hr. Fr. Dr. Prof. Anwohnerin Anwohner Anwohnerinnen Nachbarin Nachbar Nachbarn Sohn Sohnes Tochter ' +
    'Kind Enkel Enkelin Enkelsohn Enkeltochter Bruder Schwester Mutter Vater Mama Papa Oma Opa Onkel Tante Neffe Nichte Cousin Cousine Ehemann Ehefrau ' +
    'Mann Freund Freundin Kollege Kollegin Mieter Mieterin Vermieter Vermieterin Bürgermeister Bürgermeisterin Ortsbürgermeister Ortsbürgermeisterin ' + // Rollen-Wörter (Anonymisierung)
    'Ortsvorsteher Ortsvorsteherin Ratsherr Ratsfrau Ratsmitglied Stadtrat Stadträtin Landrat Landrätin Pastor Pastorin Pfarrer Pfarrerin Lehrer ' +
    'Lehrerin Erzieher Erzieherin Hausmeister Hausmeisterin Schüler Schülerin').split(' ');
  // Hinweis-Wörter vor dem eigenen Namen
  var NAMENS_HINWEISE = ['Mein Name ist', 'mein Name ist', 'Ich bin', 'ich bin', 'Ich heiße', 'ich heiße', 'heiße', 'heisse', 'Name:', 'Kontakt:',
    'Absender:', 'Viele Grüße', 'viele Grüße', 'Liebe Grüße', 'Beste Grüße', 'Freundliche Grüße', 'Mit freundlichen Grüßen', 'Grüße', 'Gruß', 'LG', 'VG', 'MfG'];
  // Keine Namen (Wörter nach „Ich bin …“ usw.)
  var KEIN_NAME = {};
  ('Anwohner Anwohnerin Rentner Rentnerin Bürger Bürgerin Mitglied Mutter Vater Student Studentin Schüler Schülerin Radfahrer Radfahrerin ' +
    'Autofahrer Autofahrerin Fußgänger Fußgängerin Nachbar Nachbarin Eltern Oma Opa Lehrer Lehrerin Mieter Mieterin Eigentümer Eigentümerin ' +
    'Neu Neue Hier Seit Aus Ihr Ihre Euer Eure Dein Deine Der Die Das Den Dem Des Ein Eine Einer Einen Sehr Leider Danke Bitte Hallo Und Oder ' +
    'Frau Herr Familie SPD Stadt Gemeinde Verwaltung Rat Team').split(' ').forEach(function (w) { KEIN_NAME[w] = 1; });
  ROLLEN.forEach(function (w) { KEIN_NAME[w] = 1; });
  // Wörter, die am Satzanfang groß stehen und keine Vornamen sind (für die Paar-Heuristik)
  var PAAR_STOPP = {};
  ('Der Die Das Den Dem Des Ein Eine Einen Einem Einer Ich Wir Sie Er Es Ihr Mein Meine Meinen Unser Unsere Bitte Danke Hallo Liebe Lieber Sehr ' +
    'Guten Am Im An In Auf Bei Von Zum Zur Mit Nach Vor Hinter Über Unter Seit Wegen Heute Gestern Morgen Hier Dort Jetzt Auch Aber Und Oder Wenn ' +
    'Weil Dass Leider Schon Noch Viele Alle Kein Keine Diese Dieser Dieses Jede Jeder Jedes Neue Neuer Neues Alte Alter Altes Große Großer Kleine Kleiner ' +
    'Café Cafe').split(' ').forEach(function (w) { PAAR_STOPP[w] = 1; });
  // Erlaubte Namen (Orte, Ortsteile, Politiker selbst) – werden nie ersetzt
  var ERLAUBT = ['Landkreis Hameln-Pyrmont', 'Hameln-Pyrmont', 'Hajo Bönke', 'Bad Pyrmont', 'Pyrmont', 'Kernstadt', 'Holzhausen', 'Oesdorf',
    'Friedensthal', 'Baarsen', 'Eichenborn', 'Großenberg', 'Hagen', 'Kleinenberg', 'Löwensen', 'Neersen', 'Thal', 'Hameln', 'Lügde', 'Aerzen',
    'Emmerthal', 'Niedersachsen', 'Kurpark', 'Staatsbad', 'Hylligen Born', 'SPD'];
  var LB = '\\p{L}\\p{M}\\p{N}';            // „Buchstabe/Ziffer“ für Wortgrenzen (Unicode)
  var NW = '\\p{Lu}[\\p{Ll}\\p{M}]+(?:[-\'’]\\p{Lu}[\\p{Ll}\\p{M}]+)*'; // Namens-Wort, z. B. Müller-Lüdenscheidt, Yılmaz, Петрова
  var WS = '[ \\t\\u00A0\\u202F]+';          // Leerraum innerhalb einer Zeile
  var SUFFIX = '(?:[Ss]traße|[Ss]trasse|[Ss]tr\\.|[Ww]eg|[Gg]asse|[Pp]latz|[Aa]llee|[Rr]ing|[Dd]amm|[Uu]fer|[Pp]fad|[Cc]haussee|[Pp]romenade|[Ss]tieg|[Ss]teig|[Tt]wete)';
  var STREET_ADJ = '(?:Alte|Alter|Altes|Neue|Neuer|Neues|Große|Großer|Kleine|Kleiner|Lange|Langer|Hohe|Hoher|Obere|Oberer|Untere|Unterer|Breite|Breiter|Kurze|Kurzer|Schmale|Hintere|Vordere|Mittlere)';
  var STREET = '(?:' + STREET_ADJ + WS + '(?:Straße|Strasse|Str\\.|Weg|Gasse|Allee|Platz|Ring|Damm|Wall|Reihe|Twete)|' +
    '(?:(?:Bad|Sankt|St\\.|' + STREET_ADJ + ')' + WS + ')?' +
    '(?:\\p{Lu}[\\p{Ll}\\p{M}]*er' + WS + '(?:Straße|Strasse|Str\\.|Weg|Allee|Platz|Ring|Damm|Gasse)|\\p{Lu}[\\p{Ll}\\p{M}]*(?:-\\p{Lu}[\\p{Ll}\\p{M}]*)*-?' + SUFFIX + '))';
  var PREP_STREET = '(?:Am|An der|An den|Auf dem|Auf der|Im|In der|In den|Zum|Zur|Hinter der|Hinter dem|Unter den|Vor dem|Beim|Bei der|Bei den)';
  var NOT_STREET_WORD = '(?!(?:Jahr|Jahre|Jahren|Monat|Januar|Februar|März|April|Mai|Juni|Juli|August|September|Oktober|November|Dezember|Alter|Moment|Schnitt|Durchschnitt|Sommer|Winter|Herbst|Frühjahr|Frühling|Zimmer|Raum|Stock|Bus|Kapitel|Artikel|Paragraph|Paragraf)(?![\\p{L}]))';
  var HAUSNR = '(\\d{1,4}(?:[ ]?[a-zA-Z](?![\\p{L}]))?(?:[ ]?[-–\\/][ ]?\\d{1,4})?)(?![0-9.:,]?[0-9])(?![ ]?(?:Uhr|Minuten|Min\\.|Jahre|Jahren|Prozent|%|€|Euro|Meter|km|m(?![\\p{L}])|Kinder|Leute|Personen|Autos|Wochen|Tage|Monate|Stunden))';
  var SURNAME_END = /(?:ski|ska|cki|cka|dzki|dzka|wicz|czyk|czak|enko|chuk|juk|ova|owa|eva|ewa|ov|ow|ev|ew|oğlu|oglu|escu|vić|ić|poulos|idis|akis|yan)$/;
  var GERMAN_LETTERS = /^[A-Za-zÄÖÜäöüß\-'’]+$/;
  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }
  function isVorname(w) {
    if (VORNAMEN_SET[w]) return true;
    if (w.indexOf('-') > 0) { var p = w.split('-'); for (var i = 0; i < p.length; i++) if (!VORNAMEN_SET[p[i]]) return false; return true; }
    return false;
  }
  function isForeignWord(w) { return !GERMAN_LETTERS.test(w); }
  /** Heuristik: „Vorname Nachname“ (zwei große Wörter), der kein normaler deutscher Satzteil ist. */
  function looksLikeNamePair(w1, w2) {
    if (PAAR_STOPP[w1] || KEIN_NAME[w1] || KEIN_NAME[w2]) return false;
    if (isVorname(w1)) return true;
    if (isForeignWord(w1) || isForeignWord(w2)) return true;
    return SURNAME_END.test(w2) && w2.length >= 5;
  }
  var RE_CACHE = null;
  function anonRegexes() {
    if (RE_CACHE) return RE_CACHE;
    var sortedErlaubt = ERLAUBT.slice().sort(function (a, b) { return b.length - a.length; });
    RE_CACHE = {
      email: /[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g,
      link: /https?:\/\/[^\s<>"]+/g,
      phone: /(?:\+|\b0)[0-9][0-9 \-\/()]{5,20}[0-9]/g,
      hausnummerWort: new RegExp('(Hausnummer|Hausnr\\.?|Haus-Nr\\.?)[ ]?' + HAUSNR, 'gu'),
      street: new RegExp('(^|[^' + LB + '])(' + STREET + ')[ ]?' + HAUSNR, 'gu'),
      prepStreet: new RegExp('(^|[^' + LB + '])(' + PREP_STREET + WS + NOT_STREET_WORD + NW + '(?:' + WS + NW + '){0,2})' + WS + HAUSNR, 'gu'),
      erlaubt: new RegExp('(^|[^' + LB + '])(' + sortedErlaubt.map(escRe).join('|') + ')(?![' + LB + '])', 'gu'),
      rolle: new RegExp('(^|[^' + LB + '])(' + ROLLEN.map(escRe).join('|') + ')((?:' + WS + '(?:Dr\\.|Prof\\.|Herrn|Herr|Frau|Hr\\.|Fr\\.))*)' + WS + '(' + NW + ')(' + WS + '(' + NW + '))?(?![' + LB + '])', 'gu'),
      hinweis: new RegExp('(^|[^' + LB + '])(' + NAMENS_HINWEISE.map(escRe).join('|') + ')(,?' + WS + '(?:(?:Ihre|Ihr|Eure|Euer|Deine|Dein)' + WS + ')?)(' + NW + ')(' + WS + '(' + NW + '))?(?![' + LB + '])', 'gu'),
      wort: new RegExp('(^|[^' + LB + '\\-])(' + NW + ')(?![' + LB + '])', 'gu'),
      zwischen: new RegExp('^' + WS + '$'),
      vornameDavor: new RegExp('(?:^|[^' + LB + '\\-])(' + NW + ')' + WS + '$', 'u'),
      handle: /(^|\s)@[A-Za-z0-9_.]{3,}/g
    };
    return RE_CACHE;
  }

  /** Entfernt/pseudonymisiert personenbezogene Daten. extraNames: z. B. Kontakt-Felder.
      Rückgabe: {text, counts, total, removed:[{kind, text, tag}]} – „removed“ nur für die Vorschau auf dem Gerät. */
  function anonymizeText(input, extraNames) {
    var R = anonRegexes();
    var t = String(input == null ? '' : input);
    var counts = { email: 0, telefon: 0, adresse: 0, name: 0, link: 0 };
    var removed = [], prot = [], nameWords = {};
    function protect(s) { prot.push(s); return '\u0002' + String.fromCharCode(0xE000 + prot.length - 1) + '\u0003'; }
    function note(kind, orig, tag) { counts[kind]++; removed.push({ kind: kind, text: String(orig).trim(), tag: tag }); return protect(tag); }
    function addNameWord(w) { if (w && w.length >= 3 && !KEIN_NAME[w] && !PAAR_STOPP[w]) nameWords[w] = 1; }
    // 0) vorhandene Platzhalter bleiben (zweiter Durchlauf nach dem Bearbeiten ändert nichts)
    t = t.replace(/\[(?:Name|Telefon|E-Mail|Hausnummer|Link)\]/g, function (m) { return protect(m); });
    // 1) E-Mail, 2) Links, 3) Telefon
    t = t.replace(R.email, function (m) { return note('email', m, '[E-Mail]'); });
    t = t.replace(R.link, function (m) { return note('link', m, '[Link]'); });
    t = t.replace(R.phone, function (m) {
      var d = m.replace(/[^0-9]/g, '');
      if (d.length < 7 || d.length > 15) return m;
      return note('telefon', m, '[Telefon]');
    });
    // 4) Hausnummern: „Hausnummer 12“, Straße (auch mehrteilig) + Nummer, „Am Hylligen Born 3“. Straßenname bleibt.
    t = t.replace(R.hausnummerWort, function (m, w, nr) { return w + ' ' + note('adresse', nr, '[Hausnummer]'); });
    t = t.replace(R.street, function (m, pre, street, nr) { return pre + protect(street) + ' ' + note('adresse', nr, '[Hausnummer]'); });
    t = t.replace(R.prepStreet, function (m, pre, street, nr) { return pre + protect(street) + ' ' + note('adresse', nr, '[Hausnummer]'); });
    t = t.replace(/Hajo Bönke/g, function (m) { return protect(m); });
    // 5) Rollen-Wort + Name(n) – vor dem Schutz der Ortsnamen, damit „Herr Hagen“ ein Name ist: „Anwohnerin Sabine Kraft“, „Sohn Jannik“, „Frau Dr. Müller“, Amts-Rollen-Wörter
    t = t.replace(R.rolle, function (m, pre, rolle, titel, w1, tail, w2) {
      if (KEIN_NAME[w1]) return m;
      var two = !!w2 && !KEIN_NAME[w2] && !PAAR_STOPP[w2];
      addNameWord(w1); if (two) addNameWord(w2);
      return pre + rolle + (titel || '') + ' ' + note('name', two ? w1 + ' ' + w2 : w1, '[Name]') + (two ? '' : (tail || ''));
    });
    // 6) Erlaubte Namen schützen (Ortsteile, Orte, Hajo Bönke)
    // … aber nicht direkt nach einem Vornamen: „Peter Hagen“ ist ein Name, „in Hagen“ ein Ort.
    t = t.replace(R.erlaubt, function (m, pre, w, off, str) {
      if (w.indexOf(' ') < 0 && w !== 'SPD') {
        var before = R.vornameDavor.exec(str.slice(0, off + pre.length));
        if (before && isVorname(before[1])) return m;
      }
      return pre + protect(w);
    });
    // 7) Namen aus Kontakt-Feldern (genau diese Wörter, längste zuerst – überlappungsfrei)
    var extra = [];
    (extraNames || []).forEach(function (raw) {
      String(raw || '').split(/[\s,;:()\/]+/).forEach(function (w) {
        w = w.replace(/^[^\p{L}]+|[^\p{L}]+$/gu, '');
        if (w.length < 3 || !/^\p{Lu}/u.test(w) || /\d/.test(w) || KEIN_NAME[w] || ERLAUBT.indexOf(w) >= 0) return;
        if (extra.indexOf(w) < 0) extra.push(w);
      });
    });
    function replaceWords(list) {
      list.sort(function (a, b) { return b.length - a.length; }).forEach(function (w) {
        var re = new RegExp('(^|[^' + LB + '\\-])' + escRe(w) + '(?![' + LB + ']|-\\p{L})', 'gu');
        t = t.replace(re, function (m, pre) { return pre + note('name', w, '[Name]'); });
      });
    }
    replaceWords(extra);
    // 8) Hinweis-Wort + Name: „Ich bin Svetlana Petrowa“, „Viele Grüße, Maria Muster“
    t = t.replace(R.hinweis, function (m, pre, cue, mid, w1, tail, w2) {
      if (KEIN_NAME[w1] || PAAR_STOPP[w1]) return m;
      var two = !!w2 && !KEIN_NAME[w2] && !PAAR_STOPP[w2];
      addNameWord(w1); if (two) addNameWord(w2);
      return pre + cue + mid + note('name', two ? w1 + ' ' + w2 : w1, '[Name]') + (two ? '' : (tail || ''));
    });
    // 9) Vorname (+ Nachname) und Paar-Heuristik für fremde Namen: „Gerda Kowalski“, „Ayşe Yılmaz“, „Kevin“
    var toks = [], mm;
    R.wort.lastIndex = 0;
    while ((mm = R.wort.exec(t)) !== null) {
      toks.push({ s: mm.index + mm[1].length, w: mm[2] });
      R.wort.lastIndex = mm.index + mm[1].length + mm[2].length;
    }
    var out9 = '', pos = 0;
    for (var ti = 0; ti < toks.length; ti++) {
      var a = toks[ti], b = toks[ti + 1];
      var adj = b && R.zwischen.test(t.slice(a.s + a.w.length, b.s));
      if (adj && looksLikeNamePair(a.w, b.w)) {
        addNameWord(a.w); addNameWord(b.w);
        // „Hans Peter Müller“: zweiter Vorname, dann Nachname
        var c = toks[ti + 2], last = b;
        if (c && isVorname(b.w) && R.zwischen.test(t.slice(b.s + b.w.length, c.s)) && !KEIN_NAME[c.w] && !PAAR_STOPP[c.w]) {
          addNameWord(c.w); last = c; ti++;
        }
        out9 += t.slice(pos, a.s) + note('name', t.slice(a.s, last.s + last.w.length), '[Name]'); pos = last.s + last.w.length; ti++;
      } else if (isVorname(a.w)) {
        addNameWord(a.w);
        out9 += t.slice(pos, a.s) + note('name', a.w, '[Name]'); pos = a.s + a.w.length;
      }
    }
    t = out9 + t.slice(pos);
    // 10) Einmal erkannte Namen überall ersetzen (z. B. später nur „Kowalski“)
    replaceWords(Object.keys(nameWords));
    // 11) @handles
    t = t.replace(R.handle, function (m, pre) { return pre + note('name', m.slice(pre.length), '[Name]'); });
    // Geschützte Teile zurück
    for (var guard = 0; guard < 3 && t.indexOf('\u0002') >= 0; guard++) {
      t = t.replace(/\u0002([\uE000-\uF8FF])\u0003/g, function (m, c) { return prot[c.charCodeAt(0) - 0xE000]; });
    }
    t = t.replace(/\[Name\](?:[ \t]+\[Name\])+/g, '[Name]');
    var total = counts.email + counts.telefon + counts.adresse + counts.name + counts.link;
    return { text: t, counts: counts, total: total, removed: removed };
  }

  // ------------------------------------------------------------ KI: Prompts
  // 2.4.0: gemini-2.5-flash zuerst (bestätigt stabil, Google-Suche kostenlos), dann 3.8-flash, dann 3.5-flash-lite, dann Vorlage.
  var DEFAULT_GEMINI_MODEL = 'gemini-2.5-flash';
  var FALLBACK_GEMINI_MODEL = 'gemini-3.8-flash';
  var LITE_GEMINI_MODEL = 'gemini-3.5-flash-lite';
  var GEMINI_MAX_OUTPUT_TOKENS = 32768; // inkl. Denk-Tokens (Obergrenze der Modelle: 65536)
  var GEMINI_ANSWER_TOKENS = 8192;      // Platz für die eigentliche Antwort nach dem Nachdenken
  var GEMINI_THINKING_BUDGET_25 = 24576;
  var GEMINI_TIMEOUT_MS = 45000;        // 2.4.0: höchstens ca. 45 s pro Modell
  var GEMINI_TOTAL_TIMEOUT_MS = 90000;  // 2.4.0: höchstens ca. 90 s insgesamt, dann Vorlage
  var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var KI_TASKS = ['zusammenfassen', 'antwort', 'text', 'recherche'];
  var TEXT_ARTEN = ['Social-Media-Post', 'Flyer-Text', 'Pressemitteilung', 'Rede-Stichpunkte'];
  // 2.4.1: Hajo Bönke hat die Stichwahl am 27.09.2026 gewonnen – „gewählter Bürgermeister“, aber noch nicht im Amt.
  var SYSTEM_KI = 'Du bist erfahrener Büroleiter und Pressereferent für Hajo Bönke (SPD) in Bad Pyrmont (Niedersachsen). ' +
    'Hajo Bönke hat am 27.09.2026 die Stichwahl gewonnen: Er ist gewählter Bürgermeister von Bad Pyrmont, aber noch nicht im Amt. ' +
    'Schreibe auf Deutsch, klar, respektvoll und in einfacher Sprache mit kurzen Sätzen. ' +
    'Erfinde keine Fakten: nur Fakten aus der Anfrage oder aus der Suche, keine erfundenen Zahlen, Namen, Termine, Zitate oder Versprechen. ' +
    'Unsicherheiten klar markieren (z. B. „unsicher:“ oder Platzhalter wie [Datum]). ' +
    'Platzhalter [Name], [Telefon], [E-Mail], [Hausnummer], [Link] sind anonymisiert – nicht ersetzen und nicht raten. ' +
    'Keine Angriffe auf Personen oder Parteien, keine Übertreibungen. ' +
    'Wo sinnvoll: konkrete nächste Schritte nennen. ' +
    'Gebiet: Die Anliegen kommen aus dem ganzen ' + GEBIET_TEXT + '. Ortsteil-Namen sind keine personenbezogenen Daten. ' +
    'Zuständigkeit: Nicht alles ist Sache der Stadt Bad Pyrmont. Kreisstraßen und Müllabfuhr (KreisAbfallWirtschaft) liegen beim Landkreis Hameln-Pyrmont; ' +
    'Bundes- und Landesstraßen bei der Niedersächsischen Landesbehörde für Straßenbau und Verkehr (Land); Polizei beim Land Niedersachsen; ' +
    'der Kurpark beim Niedersächsischen Staatsbad Pyrmont (Gesellschaft des Landes); Orte außerhalb (z. B. Lügde in NRW, Aerzen, Emmerthal, Hameln) bei der jeweiligen Kommune. ' +
    'Wenn ein Anliegen wahrscheinlich dort liegt, sage das klar („vermutlich zuständig: …, bitte prüfen“) und verspreche kein Handeln der Stadt. Bei Gefahr: Notruf 110 oder 112. ' +
    'Nenne ihn höchstens „gewählter Bürgermeister“ (nie ohne „gewählter“). Schreibe nie, dass er schon im Amt ist, und stelle ihn nicht als Stadtverwaltung dar. ' +
    'Keine Zusagen ohne Grundlage: nicht versprechen, dass etwas repariert, erledigt oder entschieden wird, und nicht zusagen, dass sich jemand meldet oder kümmert. ' +
    'Nur reinen Text schreiben, kein Markdown: keine Sternchen (* oder **), keine Rauten (#) als Überschrift, keine Tabellen, keine Links in Klammern. ' +
    'Aufzählungen nur mit „-“ am Zeilenanfang. Hashtags nur in Social-Media-Posts.';
  /** 2.4.0: Markdown aus KI-Antworten entfernen (**fett**, # Überschrift, * Aufzählung). Hashtags wie #BadPyrmont bleiben. */
  function stripMarkdown(s) {
    return String(s == null ? '' : s)
      .replace(/\*\*([^*\n]+)\*\*/g, '$1').replace(/__([^_\n]+)__/g, '$1')
      .replace(/^[ \t]*#{1,6}[ \t]+/gm, '')
      .replace(/^([ \t]*)[*•][ \t]+/gm, '$1- ')
      .replace(/(^|[\s(])\*([^*\n]+)\*(?=[\s).,!?:;]|$)/g, '$1$2')
      .replace(/\*\*/g, '')
      .replace(/^[ \t]*(?:-{3,}|\*{3,}|_{3,})[ \t]*$/gm, '')
      .replace(/\[([^\]\n]+)\]\((https?:\/\/[^)\s]+)\)/g, '$1 ($2)')
      .replace(/\n{3,}/g, '\n\n').trim();
  }

  /** Zeigt nie den ganzen Schlüssel: nur •••• + letzte 4 Zeichen. */
  function maskApiKey(k) {
    k = String(k == null ? '' : k).trim();
    if (!k) return '';
    return k.length <= 8 ? '••••' : '••••' + k.slice(-4);
  }
  function isValidModelId(m) { return typeof m === 'string' && /^[a-z0-9][a-z0-9.\-]{1,62}$/.test(m); }
  function cleanModel(m, def) { m = String(m == null ? '' : m).trim().replace(/^models\//, ''); return isValidModelId(m) ? m : (def || DEFAULT_GEMINI_MODEL); }
  /** method 'generate' (POST) oder 'get' (GET models/{id}, Schlüssel-Test). */
  function geminiUrl(model, method) {
    return GEMINI_BASE + cleanModel(model) + (method === 'get' ? '' : ':generateContent');
  }
  function isGeminiUrl(u) { return typeof u === 'string' && u.indexOf(GEMINI_BASE) === 0 && !/[\s"<>\\]/.test(u); }

  /** Anliegen als anonymisierte Textzeilen (ohne Kontakt-Feld). */
  function anliegenForKi(list) {
    var names = [];
    list.forEach(function (a) { if (a.kontakt) names.push(a.kontakt); });
    var ots = [];
    var lines = list.map(function (a, i) {
      ots.push(ortsteilText(a.ortsteil));
      return (i + 1) + '. Thema: ' + a.thema + ' | Dringlichkeit: ' + a.dringlichkeit + ' | Status: ' + a.status +
        ' | Ortsteil: ' + otMarker(i) + (a.ort ? ' | Ort: ' + cleanLine(a.ort) : '') + ' | Datum: ' + stampDE(a.created) + '\n   ' + cleanLine(a.text);
    });
    return withOrtsteile(anonymizeText(lines.join('\n'), names), ots);
  }
  // Ortsteil (feste Liste, keine Person) wird NACH der Anonymisierung eingesetzt – sonst könnte z. B.
  // ein Kontakt „Peter Hagen“ den Ortsteil „Hagen“ zu [Name] machen. Freitext wird weiter anonymisiert.
  function otMarker(i) { return '\u0001OT' + i + '\u0001'; }
  function withOrtsteile(anon, ots) {
    anon.text = anon.text.replace(/\u0001OT(\d+)\u0001/g, function (m, i) { return ots[+i] || OHNE_ORTSTEIL; });
    return anon;
  }

  /** Baut {system, user, anon, grounding} für eine Aufgabe. Ohne eigene Mengen-Grenzen. */
  function buildKiPrompt(task, o) {
    o = o || {};
    var data = o.data || emptyData();
    var anon, user;
    if (task === 'zusammenfassen') {
      var offen = filterAnliegen(data.anliegen.filter(function (a) { return a.status !== 'Erledigt'; }), {});
      anon = anliegenForKi(offen);
      user = 'Rolle: Büroleiter für Hajo Bönke (SPD), gewählter Bürgermeister von Bad Pyrmont (noch nicht im Amt).\n' +
        'Hier sind ' + offen.length + ' offene Bürger-Anliegen.\n' +
        'Aufgabe (nur aus den vorliegenden Texten, nichts erfinden):\n' +
        '1. Kurze Gesamtschau (3 bis 5 Sätze).\n' +
        '2. Prioritätenliste: zuerst dringend, dann wichtig, dann normal.\n' +
        '3. Gruppierung nach Thema.\n' +
        '4. Pro Punkt ein konkreter nächster Schritt (wer/was – ohne Versprechen).\n' +
        '5. Unklarheiten mit „unsicher:“ markieren.\n' +
        '6. Pro Punkt kurz einschätzen, wer vermutlich zuständig ist (Stadt Bad Pyrmont, Landkreis Hameln-Pyrmont, Land oder andere Kommune) – im Zweifel „unsicher“.\n' +
        '7. Kurz zählen, wie viele Anliegen aus welchem Ortsteil kommen.\n\nAnliegen:\n' + (anon.text || '(keine)');
    } else if (task === 'antwort') {
      var a = o.anliegen || {};
      anon = withOrtsteile(anonymizeText('Thema: ' + (a.thema || '') + '\nOrtsteil: ' + otMarker(0) + '\nOrt: ' + cleanLine(a.ort || '') +
        '\nStatus: ' + (a.status || '') + '\nAnliegen: ' + cleanText(a.text || ''), a.kontakt ? [a.kontakt] : []), [ortsteilText(a.ortsteil)]);
      user = 'Rolle: freundlicher Büro-Mitarbeiter für Hajo Bönke (SPD), gewählter Bürgermeister von Bad Pyrmont (noch nicht im Amt).\n' +
        'Hajo Bönke höchstens „gewählter Bürgermeister“ nennen. Nicht so schreiben, als wäre er schon im Amt oder als spräche die Stadt.\n' +
        'Schreibe einen respektvollen Antwort-Entwurf an die Bürgerin/den Bürger.\n' +
        'Struktur: Dank → kurze Wiedergabe des Anliegens (ohne neue Fakten) → was als Nächstes passiert ' +
        '(ehrlich, ohne Versprechen) → ggf. eine Rückfrage → Bitte um Geduld.\n' +
        'Ist wahrscheinlich nicht die Stadt Bad Pyrmont zuständig (z. B. Landkreis Hameln-Pyrmont, Land, Staatsbad oder andere Kommune), ' +
        'sage das freundlich und nenne die vermutlich zuständige Stelle (mit „vermutlich“).\n' +
        'Anrede: „Guten Tag,“ (ohne Namen). Unterschrift: „[Name], für Hajo Bönke“.\n' +
        'Keine Zusagen wie „wir melden uns“, „wir kümmern uns“ oder „das wird erledigt“. Kein Markdown.\n' +
        'Höchstens 120 Wörter, WhatsApp-tauglich, klare kurze Sätze.\n\n' + anon.text;
    } else if (task === 'text') {
      var art = TEXT_ARTEN.indexOf(o.art) >= 0 ? o.art : TEXT_ARTEN[0];
      anon = anonymizeText(cleanText(o.input || ''));
      var how = {
        'Social-Media-Post': 'einen kurzen Social-Media-Post (höchstens 80 Wörter, 1 bis 2 Hashtags wie #BadPyrmont, keine Emoji-Flut, sachlich-einladend)',
        'Flyer-Text': 'einen Flyer-Text mit klarer Überschrift, 3 bis 5 kurzen Absätzen und einem konkreten Aufruf zum Mitmachen (Kontakt als Platzhalter)',
        'Pressemitteilung': 'eine sachliche Pressemitteilung: Überschrift, „Bad Pyrmont, [Datum]“, W-Fragen, Fakten nur aus den Stichworten; Zitate nur als Platzhalter [Zitat Hajo Bönke]',
        'Rede-Stichpunkte': 'Stichpunkte für eine kurze Rede: Einstieg, 3 bis 5 Kernpunkte mit Nutzen für Bürgerinnen und Bürger, Schluss mit Einladung zum Gespräch'
      }[art];
      user = 'Rolle: Pressereferent für Hajo Bönke (SPD Bad Pyrmont), gewählter Bürgermeister von Bad Pyrmont.\nSchreibe ' + how + '.\n' +
        'Er ist noch nicht im Amt: höchstens „gewählter Bürgermeister“ schreiben, nie so, als wäre er schon im Amt.\n' +
        'Nur belegte Inhalte aus den Stichworten; Unsicherheiten markieren.\nThema und Stichworte:\n' + (anon.text || '[Thema]');
    } else if (task === 'recherche') {
      anon = anonymizeText(cleanText(o.input || ''));
      user = 'Rolle: Recherche-Assistent für Hajo Bönke (SPD), gewählter Bürgermeister von Bad Pyrmont (noch nicht im Amt; Niedersachsen; ganzes Stadtgebiet mit allen Ortsteilen).\n' +
        'Nutze die verfügbare Internetsuche. Liefere 3 bis 6 konkrete Ideen/Beispiele aus anderen deutschen Kommunen.\n' +
        'Pro Punkt: Was? Warum hilft das? Wo gibt es das schon? Eine Quelle nennen, wenn vorhanden.\n' +
        'Nur überprüfbare Angaben. Wenn unsicher oder keine Quelle: ausdrücklich „unsicher“ schreiben.\n' +
        'Am Ende: 2 bis 3 mögliche nächste Schritte für Bad Pyrmont (ohne Versprechen).\n' +
        'Thema: ' + (anon.text || '[Thema]');
    } else {
      return null;
    }
    return { task: task, system: SYSTEM_KI, user: user, anon: anon };
  }

  /** thinkingBudget für Gemini 2.5; thinkingLevel „high“ für Gemini 3.x (REST generateContent). */
  function thinkingConfigFor(model) {
    var m = cleanModel(model, DEFAULT_GEMINI_MODEL);
    if (!/^gemini-/.test(m)) return null; // z. B. Gemma: kein Denk-Parameter
    if (/^gemini-2\.5/.test(m)) {
      var budget = /pro/i.test(m) ? 32768 : GEMINI_THINKING_BUDGET_25;
      return { thinkingBudget: budget };
    }
    return { thinkingLevel: 'high' };
  }

  /** maxOutputTokens zählt das Nachdenken mit: Budget + Platz für die Antwort. */
  function maxOutputTokensFor(model) {
    var tc = thinkingConfigFor(model);
    if (tc && tc.thinkingBudget) return tc.thinkingBudget + GEMINI_ANSWER_TOKENS;
    return GEMINI_MAX_OUTPUT_TOKENS;
  }

  /** Modell-Kette: Einstellungen zuerst, dann Standard-Ersatz, dann Lite. Ohne Doppelungen. */
  function modelChain(cfg) {
    cfg = cfg || {};
    var list = [];
    function add(raw, def) {
      var m = cleanModel(raw, def);
      if (list.indexOf(m) < 0) list.push(m);
    }
    add(cfg.model, DEFAULT_GEMINI_MODEL);
    add(cfg.fallbackModel, FALLBACK_GEMINI_MODEL);
    add(cfg.liteModel, LITE_GEMINI_MODEL);
    return list;
  }

  function buildGeminiRequestBody(prompt, grounding, model) {
    var body = {
      systemInstruction: { parts: [{ text: prompt.system }] },
      contents: [{ role: 'user', parts: [{ text: prompt.user }] }],
      generationConfig: {
        maxOutputTokens: maxOutputTokensFor(model)
      }
    };
    var tc = thinkingConfigFor(model);
    if (tc) body.generationConfig.thinkingConfig = tc;
    // Gemini 3.x: Google empfiehlt Standard-Temperatur (1.0) – nicht setzen. Gemini 2.5: ruhiger (0.4).
    if (/^gemini-2\.5/.test(cleanModel(model, DEFAULT_GEMINI_MODEL))) body.generationConfig.temperature = 0.4;
    if (grounding) body.tools = [{ google_search: {} }];
    return body;
  }

  // ------------------------------------------------------------ KI: Antwort lesen
  function isHttpsUrl(u) {
    return typeof u === 'string' && /^https:\/\/[A-Za-z0-9.\-]+(?::\d+)?(?:[\/?#][^\s"<>\\]*)?$/.test(u) && u.length <= 2048;
  }
  function parseGeminiResponse(text) {
    var j;
    try { j = typeof text === 'string' ? JSON.parse(text) : text; } catch (e) { return { ok: false, reason: 'parse' }; }
    if (!j || typeof j !== 'object') return { ok: false, reason: 'parse' };
    if (j.promptFeedback && j.promptFeedback.blockReason) return { ok: false, reason: 'blocked' };
    var c = j.candidates && j.candidates[0];
    if (!c) return { ok: false, reason: 'empty' };
    var parts = (c.content && c.content.parts) || [];
    var out = [];
    parts.forEach(function (p) { if (p && typeof p.text === 'string' && !p.thought) out.push(p.text); });
    var txt = cleanText(out.join(''));
    var sources = [], seen = {}, queries = [];
    var gm = c.groundingMetadata;
    if (gm) {
      (gm.groundingChunks || []).forEach(function (ch) {
        var w = ch && ch.web;
        if (!w || !isHttpsUrl(w.uri) || seen[w.uri]) return;
        seen[w.uri] = 1;
        sources.push({ title: cleanLine(w.title || '') || w.uri.replace(/^https:\/\//, '').split('/')[0], url: w.uri });
      });
      (gm.webSearchQueries || []).forEach(function (q) { if (typeof q === 'string' && cleanLine(q)) queries.push(cleanLine(q)); });
    }
    if (!txt) return { ok: false, reason: c.finishReason === 'SAFETY' || c.finishReason === 'PROHIBITED_CONTENT' ? 'blocked' : 'empty' };
    return { ok: true, text: txt, sources: sources, queries: queries, grounded: !!gm, finishReason: c.finishReason || '' };
  }

  // ------------------------------------------------------------ KI: Fehler einordnen
  /** status: HTTP-Status (0 = kein Netz). Gibt {kind, retryMs, message}. */
  function classifyGeminiError(status, bodyText) {
    var j = null, err = {};
    try { j = JSON.parse(bodyText || ''); } catch (e) {}
    if (j && j.error) err = j.error;
    var msg = String(err.message || ''), st = String(err.status || '');
    var reasons = '', retryMs = 0;
    (err.details || []).forEach(function (d) {
      if (!d) return;
      if (d.reason) reasons += ' ' + d.reason;
      if (d.retryDelay) { var s = parseFloat(String(d.retryDelay)); if (isFinite(s)) retryMs = Math.round(s * 1000); }
    });
    var quotaIds = '';
    (err.details || []).forEach(function (d) { (d && d.violations || []).forEach(function (v) { quotaIds += ' ' + (v.quotaId || '') + ' ' + (v.quotaMetric || ''); }); });
    var keyish = /API_KEY_INVALID|API key not valid|API_KEY_SERVICE_BLOCKED|API_KEY_HTTP_REFERRER_BLOCKED|API key expired|CONSUMER_SUSPENDED/i.test(msg + reasons);
    var kind;
    var hardLimit = /limit:\s*0\b/.test(msg);
    if (!status) kind = 'offline';
    else if (status === 429 || st === 'RESOURCE_EXHAUSTED') kind = 'quota';
    else if (keyish || status === 401) kind = 'key';
    else if (status === 400 && (st === 'FAILED_PRECONDITION' || /location is not supported|not available in your country/i.test(msg))) kind = 'region';
    else if (status === 404) kind = 'model';
    else if (status === 403) kind = 'forbidden';
    else if (status === 400) kind = 'bad';
    else if (status >= 500) kind = 'server';
    else kind = 'other';
    // 2.4.0: Minuten-Limit und Tages-Limit unterscheiden
    var scope = '';
    if (kind === 'quota') {
      if (/PerDay|per day|daily/i.test(quotaIds + ' ' + msg)) scope = 'day';
      else if (/PerMinute|per minute/i.test(quotaIds + ' ' + msg) || (retryMs > 0 && retryMs <= 120000)) scope = 'minute';
    }
    var message = kind === 'quota' ? (scope === 'day' ? KI_MESSAGES.quotaDay : scope === 'minute' ? KI_MESSAGES.quotaMinute : KI_MESSAGES.quota)
      : (KI_MESSAGES[kind] || KI_MESSAGES.other);
    return { kind: kind, status: status, retryMs: retryMs, hardLimit: hardLimit, scope: scope, message: message };
  }
  var KI_MESSAGES = {
    nokey: 'Die KI ist noch nicht eingerichtet. Bitte unter ⚙ Einstellungen einen kostenlosen Schlüssel eintragen.',
    off: 'Die KI ist ausgeschaltet. Einschalten unter ⚙ Einstellungen.',
    offline: 'Keine Internet-Verbindung. Die KI braucht Internet. Alles andere funktioniert weiter.',
    key: 'Der Schlüssel funktioniert nicht. Bitte unter ⚙ prüfen oder neu kopieren (aistudio.google.com/apikey).',
    quota: 'KI-Limit von Google erreicht. Bitte in 1 Minute noch einmal versuchen. Klappt es dann nicht, ist das Tageslimit voll (morgen wieder da). Bis dahin: Vorlage.',
    quotaMinute: 'Zu viele KI-Anfragen in kurzer Zeit (Minuten-Limit von Google). Bitte etwa 1 Minute warten und dann noch einmal tippen. Bis dahin: Vorlage.',
    quotaDay: 'KI-Tageslimit von Google erreicht – morgen wieder da, bis dahin Vorlagen.',
    region: 'Google bietet die kostenlose KI in dieser Region gerade nicht an.',
    model: 'Dieses KI-Modell gibt es nicht (mehr). Bitte unter ⚙ das Modell-Feld leeren.',
    forbidden: 'Google erlaubt diese Anfrage mit dem Schlüssel nicht.',
    bad: 'Google konnte die Anfrage nicht bearbeiten.',
    server: 'Der KI-Dienst von Google ist gerade überlastet. Bitte später noch einmal versuchen.',
    blocked: 'Die KI hat keine Antwort gegeben (Sicherheits-Filter). Bitte anders formulieren.',
    empty: 'Die KI hat eine leere Antwort geschickt. Bitte noch einmal versuchen.',
    parse: 'Die Antwort der KI war nicht lesbar. Bitte noch einmal versuchen.',
    timeout: 'Die KI hat zu lange gebraucht. Bitte noch einmal versuchen.',
    timeoutTotal: 'Die KI hat zu lange gebraucht (über 1,5 Minuten). Hier eine Vorlage. Bitte später noch einmal versuchen.',
    other: 'Die KI hat gerade nicht geantwortet. Bitte später noch einmal versuchen.'
  };
  var KI_NOTES = {
    groundingOff: 'Internet-Suche war nicht möglich (Limit oder nicht freigeschaltet). Antwort ohne Suche – bitte Fakten selbst prüfen.',
    groundingModel: 'Für die Internet-Suche wurde ein anderes Modell genutzt (die Suche ist kostenlos nur bei manchen Modellen).',
    noSources: 'Die KI hat keine Quellen geliefert. Bitte Fakten selbst prüfen.',
    fallbackModel: 'Das erste KI-Modell war ausgelastet, überlastet oder zu langsam. Die Antwort kommt vom nächsten Modell.',
    answeredBy: 'Antwort von: ',
    offlineTpl: 'Ohne KI erstellt (Vorlage). Bitte [Klammern] ersetzen.',
    thinking: 'KI denkt gründlich nach … bitte einen Moment warten.',
    preview: 'Vorschau: Das geht an Google. Grau markiert: entfernte Angaben.'
  };

  // ------------------------------------------------------------ KI: Offline-Ersatz (Vorlagen)
  function vorlageById(id) { for (var i = 0; i < VORLAGEN.length; i++) if (VORLAGEN[i].id === id) return VORLAGEN[i]; return null; }
  function offlineFallback(task, o) {
    o = o || {};
    var data = o.data || emptyData();
    if (task === 'zusammenfassen') {
      var offen = filterAnliegen(data.anliegen.filter(function (a) { return a.status !== 'Erledigt'; }), {});
      var L = ['Offene Anliegen, geordnet nach Dringlichkeit (ohne KI):', ''];
      offen.forEach(function (a, i) { L.push((i + 1) + '. [' + a.dringlichkeit + '] ' + a.thema + ' – ' + ortsteilText(a.ortsteil) + (a.ort ? ', ' + cleanLine(a.ort) : '') + ': ' + excerpt(a.text, 100)); });
      if (!offen.length) L.push('Keine offenen Anliegen.');
      L.push('', 'Nach Thema:');
      THEMEN.forEach(function (th) { var c = offen.filter(function (a) { return a.thema === th; }).length; if (c) L.push('- ' + th + ': ' + c); });
      L.push('', 'Nach Ortsteil:');
      ortsteilCounts(offen).forEach(function (c) { L.push('- ' + c.name + ': ' + c.count); });
      return L.join('\n');
    }
    if (task === 'antwort') {
      var a = o.anliegen || {};
      return 'Guten Tag,\n\nvielen Dank für Ihre Nachricht' + (a.thema ? ' zum Thema „' + a.thema + '“' : '') + '. ' +
        'Ihr Anliegen ist aufgenommen und geht an Hajo Bönke. ' +
        'Bitte haben Sie etwas Geduld. [Optional: nächster Schritt oder Rückfrage]\n\nViele Grüße\n[Name], für Hajo Bönke';
    }
    if (task === 'text') {
      var map = { 'Social-Media-Post': 'post-einladung', 'Flyer-Text': 'infostand', 'Pressemitteilung': null, 'Rede-Stichpunkte': null };
      var head = o.input ? 'Thema: ' + cleanText(o.input) + '\n\n' : '';
      if (o.art === 'Pressemitteilung') {
        return head + 'Pressemitteilung\n\n[Überschrift]\n\nBad Pyrmont, [Datum]. [Was passiert? Wer? Wann? Wo?]\n\n' +
          '[Warum ist das wichtig für Bad Pyrmont?]\n\n„[Zitat Hajo Bönke]“\n\nKontakt: [Name], [Telefon]';
      }
      if (o.art === 'Rede-Stichpunkte') {
        return head + 'Rede-Stichpunkte\n\n- Begrüßung und Dank\n- Worum geht es? [Thema]\n- Punkt 1: [ … ]\n- Punkt 2: [ … ]\n- Punkt 3: [ … ]\n' +
          '- Was wir als Nächstes tun: [ … ]\n- Einladung zum Gespräch, Dank';
      }
      var v = vorlageById(map[o.art] || 'post-einladung');
      return head + (v ? v.text : '');
    }
    if (task === 'recherche') {
      return 'Internet-Recherche geht nur mit KI. Ideen aus den Vorlagen:\n\n' + VORLAGEN.map(function (v) { return '- ' + v.titel; }).join('\n');
    }
    return '';
  }

  // ------------------------------------------------------------ PDF-Inhalte (Blöcke, ohne DOM)
  // Nur Zeichen, die die PDF-Standardschrift (WinAnsi) kann. Emojis usw. werden ersetzt/entfernt.
  var WINANSI_EXTRA = '€‚ƒ„…†‡ˆ‰Š‹ŒŽ‘’“”•–—˜™š›œžŸ';
  // 2.4.0: Umschrift statt „?“ (wenn keine Unicode-Schrift geladen ist): ş->s, ı->i, ł->l, Кириллица -> Latein
  var TRANSLIT = { 'ı': 'i', 'İ': 'I', 'ł': 'l', 'Ł': 'L', 'đ': 'd', 'Đ': 'D', 'ħ': 'h', 'ŧ': 't', 'ø': 'ø', 'ß': 'ß', 'ə': 'e', 'Ə': 'E', 'ŀ': 'l',
    'а': 'a', 'б': 'b', 'в': 'w', 'г': 'g', 'д': 'd', 'е': 'e', 'ё': 'jo', 'ж': 'sch', 'з': 's', 'и': 'i', 'й': 'j', 'к': 'k', 'л': 'l', 'м': 'm',
    'н': 'n', 'о': 'o', 'п': 'p', 'р': 'r', 'с': 's', 'т': 't', 'у': 'u', 'ф': 'f', 'х': 'ch', 'ц': 'z', 'ч': 'tsch', 'ш': 'sch', 'щ': 'schtsch',
    'ъ': '', 'ы': 'y', 'ь': '', 'э': 'e', 'ю': 'ju', 'я': 'ja', 'і': 'i', 'ї': 'ji', 'є': 'je', 'ґ': 'g' };
  function translitChar(ch) {
    if (Object.prototype.hasOwnProperty.call(TRANSLIT, ch)) return TRANSLIT[ch];
    var lo = ch.toLowerCase();
    if (lo !== ch && Object.prototype.hasOwnProperty.call(TRANSLIT, lo)) { var t = TRANSLIT[lo]; return t ? t.charAt(0).toUpperCase() + t.slice(1) : ''; }
    var base = ch.normalize ? ch.normalize('NFD').replace(/[\u0300-\u036f]/g, '') : ch;
    return base !== ch && /^[\x20-\x7E\u00A0-\u00FF]+$/.test(base) ? base : null;
  }
  /** Unicode-Schrift (DejaVu-Teilmenge) kann diese Bereiche. */
  function pdfFontHas(c) {
    return (c >= 32 && c <= 126) || (c >= 0xA0 && c <= 0x24F) || c === 0x259 || (c >= 0x386 && c <= 0x3CE) || (c >= 0x400 && c <= 0x45F) ||
      c === 0x490 || c === 0x491 || c === 0x1E9E || (c >= 0x2010 && c <= 0x2027) || c === 0x2030 || c === 0x2039 || c === 0x203A || c === 0x20AC ||
      c === 0x2116 || c === 0x2122 || (c >= 0x2190 && c <= 0x2193) || c === 0x2212;
  }
  /** unicode=true: für die eingebettete Unicode-Schrift (behält ş, ł, Кириллица), sonst WinAnsi mit Umschrift. */
  function pdfSafe(s, unicode) {
    var t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      .replace(/[✓✔☑]/g, '[x]').replace(/[☐]/g, '[ ]').replace(/[→➔]/g, '->').replace(/[\u2010\u2011\u2012]/g, '-')
      .replace(/[\u00A0\u202F\u2007]/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
    var out = '';
    for (var ch of t) { // eslint-disable-line
      var c = ch.codePointAt(0);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.indexOf(ch) >= 0 || (unicode && pdfFontHas(c))) out += ch;
      else if (c > 0xFFFF || (c >= 0x2600 && c <= 0x27BF) || (c >= 0xFE00 && c <= 0xFE0F)) out += ''; // Emoji weg
      else { var tr = translitChar(ch); out += tr == null ? '?' : tr; }
    }
    return out.replace(/ {2,}/g, ' ');
  }
  function pdfDoc(title, subtitle, blocks, o) {
    o = o || {};
    return { title: title, subtitle: subtitle || '', blocks: blocks, sample: !!o.sample, stamp: o.stamp || dateDE(localDate(o.nowMs || Date.now())) };
  }
  function pdfFileName(kind, nowMs) { return 'buergeranliegen-' + kind + '-' + localDate(nowMs || Date.now()) + '.pdf'; }

  function pdfAnliegenBericht(data, f, o) {
    f = f || {}; o = o || {};
    var list = filterAnliegen(data.anliegen || [], f);
    var B = [];
    var fOt = f.ortsteil === FILTER_OHNE_ORTSTEIL ? 'ohne Angabe' : (f.ortsteil || 'alle');
    B.push({ t: 'meta', v: 'Filter: Thema ' + (f.thema || 'alle') + ' · Ortsteil ' + fOt + ' · Status ' + (f.status || 'alle') + ' · ' + list.length + ' Anliegen' });
    var counts = STATUS.map(function (s) { return s + ': ' + list.filter(function (a) { return a.status === s; }).length; }).join(' · ');
    B.push({ t: 'meta', v: counts });
    if (list.length) B.push({ t: 'meta', v: 'Nach Ortsteil: ' + ortsteilCounts(list).map(function (c) { return c.name + ' ' + c.count; }).join(' · ') });
    if (!list.length) B.push({ t: 'p', v: 'Keine Anliegen für diesen Filter.' });
    list.forEach(function (a, i) {
      B.push({ t: 'h2', v: (i + 1) + '. ' + a.thema + ' – ' + ortsteilText(a.ortsteil) + (a.ort ? ', ' + a.ort : '') });
      B.push({ t: 'meta', v: 'Ortsteil: ' + ortsteilText(a.ortsteil) + ' · Status: ' + a.status + ' · Dringlichkeit: ' + a.dringlichkeit + ' · Eingang: ' + stampDE(a.created) +
        (a.erledigtAm ? ' · erledigt: ' + stampDE(a.erledigtAm) : '') });
      B.push({ t: 'p', v: a.text });
      if (o.kontakt && a.kontakt) B.push({ t: 'meta', v: 'Kontakt: ' + a.kontakt });
    });
    return pdfDoc('Anliegen-Bericht', 'Bürger-Anliegen Bad Pyrmont · für Hajo Bönke', B, o);
  }
  function pdfWochenbericht(data, o) {
    o = o || {};
    var lines = buildSummary(data, o.nowMs).split('\n');
    var B = [];
    lines.slice(1).forEach(function (l) {
      if (!l) return;
      if (/^Zeitraum:/.test(l)) B.push({ t: 'meta', v: l });
      else if (/^- /.test(l)) B.push({ t: 'li', v: l.slice(2) });
      else B.push({ t: 'h2', v: l });
    });
    B.push({ t: 'space' });
    B.push({ t: 'meta', v: 'Erstellt mit der App „Bürger-Anliegen Bad Pyrmont“. Bitte vor Weitergabe prüfen.' });
    return pdfDoc('Wochenbericht für Hajo Bönke', 'SPD Bad Pyrmont · letzte 7 Tage', B, o);
  }
  function pdfTermine(data, o) {
    o = o || {};
    var list = sortTermine(data.termine || []);
    var B = [];
    var offen = list.filter(function (t) { return !t.erledigt; }), done = list.filter(function (t) { return t.erledigt; });
    B.push({ t: 'meta', v: offen.length + ' offen · ' + done.length + ' erledigt' });
    [['Offen', offen], ['Erledigt', done]].forEach(function (g) {
      if (!g[1].length) return;
      B.push({ t: 'h1', v: g[0] });
      g[1].forEach(function (t) {
        var p = progress(t);
        B.push({ t: 'h2', v: (t.erledigt ? '[x] ' : '[ ] ') + t.titel });
        B.push({ t: 'meta', v: terminWann(t) + (t.ort ? ' · ' + t.ort : '') + (p.total ? ' · Checkliste ' + p.done + ' von ' + p.total : '') });
        if (t.notiz) B.push({ t: 'p', v: t.notiz });
        t.checkliste.forEach(function (c) { B.push({ t: 'li', v: (c.done ? '[x] ' : '[ ] ') + c.text }); });
      });
    });
    if (!list.length) B.push({ t: 'p', v: 'Noch keine Termine oder Aufgaben.' });
    return pdfDoc('Termine & Aufgaben', 'Bürger-Anliegen Bad Pyrmont · Helfer-Liste', B, o);
  }
  function pdfIdeeFlyer(idee, o) {
    o = o || {};
    var paras = cleanText(idee.text || '').split(/\n{2,}/);
    var B = [{ t: 'big', v: idee.titel || 'Idee' }];
    paras.forEach(function (p) { B.push({ t: 'lead', v: p }); });
    B.push({ t: 'space' });
    var kontakt = 'Ihr Anliegen oder Ihre Idee? Schreiben Sie Hajo Bönke per WhatsApp' + (o.number ? ': +' + o.number : '.');
    B.push({ t: 'box', v: kontakt });
    if (o.link) { B.push({ t: 'qr', v: o.link, size: 45 }); B.push({ t: 'meta', v: 'QR-Code scannen: ' + o.link }); }
    return pdfDoc('Infoblatt', 'Hajo Bönke · gewählter Bürgermeister von Bad Pyrmont · SPD', B, o);
  }
  /** Aushang / Handzettel mit QR-Code zum Bürger-Link. */
  function pdfAushang(link, o) {
    o = o || {};
    var B = [
      { t: 'big', v: 'Ihr Anliegen für Bad Pyrmont' },
      { t: 'lead', v: 'Schreiben Sie Hajo Bönke direkt per WhatsApp: ein Problem, eine Frage oder eine gute Idee.' },
      { t: 'lead', v: 'Hajo Bönke (SPD) ist gewählter Bürgermeister von Bad Pyrmont.' },
      { t: 'lead', v: 'Für das ganze Stadtgebiet: Kernstadt und alle Ortsteile.' },
      { t: 'qr', v: link, size: 85 },
      { t: 'h2', v: 'So geht es' },
      { t: 'lead', v: '1. QR-Code mit der Handy-Kamera scannen.' },
      { t: 'lead', v: '2. Anliegen eintippen. Ortsteil, Name und Ort sind freiwillig.' },
      { t: 'lead', v: '3. Auf den grünen WhatsApp-Knopf tippen. Dann in WhatsApp auf Senden tippen.' },
      { t: 'space' },
      { t: 'box', v: 'Kostenlos · nur WhatsApp nötig · ohne Anmeldung · nichts wird gespeichert' },
      { t: 'meta', v: 'Link: ' + link }
    ];
    return pdfDoc('Aushang: Anliegen an Hajo Bönke', 'Hajo Bönke · gewählter Bürgermeister von Bad Pyrmont · SPD', B, o);
  }
  function pdfKiErgebnis(title, text, sources, o) {
    o = o || {};
    var meta = 'KI-Entwurf – bitte vor Verwendung prüfen.';
    if (o.model) meta += ' Antwort von: ' + cleanLine(o.model) + '.';
    var B = [{ t: 'meta', v: meta }];
    cleanText(text).split(/\n{2,}/).forEach(function (p) { B.push({ t: 'p', v: p }); });
    if (sources && sources.length) {
      B.push({ t: 'h2', v: 'Quellen' });
      sources.forEach(function (s, i) { B.push({ t: 'li', v: (i + 1) + '. ' + s.title + ' – ' + s.url }); });
    }
    return pdfDoc(title || 'KI-Ergebnis', 'Bürger-Anliegen Bad Pyrmont', B, o);
  }
  function sampleData(nowMs) {
    nowMs = nowMs || Date.now();
    var iso = function (dAgo) { return new Date(nowMs - dAgo * DAY).toISOString(); };
    var day = function (dAhead) { return localDate(nowMs + dAhead * DAY); };
    return sanitizeData({ anliegen: [
      { id: 'b1', thema: 'Straße & Wege', dringlichkeit: 'dringend', status: 'Neu', ortsteil: KERNSTADT, ort: 'Holzhausen', text: 'Beispiel: Schlagloch auf dem Radweg, Größe etwa 30 cm. Gefahr für Radfahrer.', created: iso(1) },
      { id: 'b2', thema: 'Verkehr & Parken', dringlichkeit: 'wichtig', status: 'In Arbeit', ortsteil: KERNSTADT, ort: 'Oesdorf', text: 'Beispiel: Autos fahren vor der Grundschule zu schnell. Wunsch: Tempo 30 und Blitzer-Anhänger.', created: iso(3) },
      { id: 'b3', thema: 'Umwelt & Grün', dringlichkeit: 'normal', status: 'Erledigt', ort: 'Kurpark', text: 'Beispiel: Mehr Mülleimer am Spielplatz – wurden aufgestellt.', created: iso(6), erledigtAm: iso(2) },
      { id: 'b4', thema: 'Soziales & Senioren', dringlichkeit: 'wichtig', status: 'Neu', ortsteil: 'Löwensen', ort: 'Bushaltestelle', text: 'Beispiel: Sitzbank an der Bushaltestelle für ältere Menschen gewünscht.', created: iso(2) }
    ], ideen: [
      { id: 'bi1', titel: 'Beispiel: Bürgersprechstunde im Ortsteil', text: 'Einmal im Monat vor Ort zuhören. Ohne Anmeldung.', created: iso(2) }
    ], termine: [
      { id: 'bt1', titel: 'Beispiel: Infostand am Markt', datum: day(5), zeit: '10:00', dauer: 180, ort: 'Marktplatz', checkliste: [{ text: 'Standort anmelden', done: true }, { text: 'Flyer mitnehmen', done: false }], created: iso(4) },
      { id: 'bt2', titel: 'Beispiel: Rückmeldung an Schule geben', datum: '', erledigt: false, created: iso(1) }
    ] }, new Date(nowMs).toISOString());
  }

  var api = {
    VERSION: VERSION, PUBLIC_URL: PUBLIC_URL, HEADER: HEADER,
    ORTSTEILE: ORTSTEILE, ORTSTEIL_LABELS: ORTSTEIL_LABELS, KERNSTADT: KERNSTADT, ORT_UNBEKANNT: ORT_UNBEKANNT, OHNE_ORTSTEIL: OHNE_ORTSTEIL,
    FILTER_OHNE_ORTSTEIL: FILTER_OHNE_ORTSTEIL, GEBIET_TEXT: GEBIET_TEXT, cleanOrtsteil: cleanOrtsteil, ortsteilText: ortsteilText,
    ortsteilOptions: ortsteilOptions, ortsteilCounts: ortsteilCounts,
    citizenBase: citizenBase, buildCitizenLink: buildCitizenLink, parseLinkParams: parseLinkParams, displayNumber: displayNumber,
    parseCitizenMessage: parseCitizenMessage, anliegenFromMessage: anliegenFromMessage, backupReminder: backupReminder,
    BACKUP_DAYS: BACKUP_DAYS, pdfAushang: pdfAushang, THEMEN: THEMEN, DRINGLICHKEIT: DRINGLICHKEIT, STATUS: STATUS,
    MAX_TEXT: MAX_TEXT, MAX_SHORT: MAX_SHORT, MAX_CITIZEN_TEXT: MAX_CITIZEN_TEXT, MAX_WA_URL: MAX_WA_URL, clipChars: clipChars,
    phoneToIntl: phoneToIntl, reopenStatus: reopenStatus, restoreDiff: restoreDiff, restoreSummary: restoreSummary, countsText: countsText,
    makeSafetyCopy: makeSafetyCopy, parseSafetyCopy: parseSafetyCopy, stripMarkdown: stripMarkdown, GEMINI_TOTAL_TIMEOUT_MS: GEMINI_TOTAL_TIMEOUT_MS,
    pdfFontHas: pdfFontHas, translitChar: translitChar, ERLAUBT_NAMEN: ERLAUBT, CHECKLISTEN: CHECKLISTEN, VORLAGEN: VORLAGEN,
    cleanText: cleanText, cleanLine: cleanLine, isTextEmpty: isTextEmpty,
    normalizeNumber: normalizeNumber, normalizeStrict: normalizeStrict, validateNumber: validateNumber,
    osmLink: osmLink, standortText: standortText, validCoord: validCoord,
    buildMessage: buildMessage, urlEncode: urlEncode, buildWhatsAppUrl: buildWhatsAppUrl, isAllowedExternal: isAllowedExternal,
    isValidDate: isValidDate, isValidTime: isValidTime, dateDE: dateDE, stampDE: stampDE, localDate: localDate,
    newId: newId, emptyData: emptyData, sanitizeAnliegen: sanitizeAnliegen, sanitizeIdee: sanitizeIdee, sanitizeTermin: sanitizeTermin,
    sanitizeData: sanitizeData, parseData: parseData, upsert: upsert, removeById: removeById, findById: findById,
    withStatus: withStatus, filterAnliegen: filterAnliegen, progress: progress, sortTermine: sortTermine, terminWann: terminWann,
    checklistFor: checklistFor, csvCell: csvCell, anliegenCSV: anliegenCSV, makeBackup: makeBackup, parseBackup: parseBackup,
    buildICS: buildICS, icsFold: icsFold, icsEscape: icsEscape, safeFileName: safeFileName, terminBeschreibung: terminBeschreibung,
    buildSummary: buildSummary,
    anonymizeText: anonymizeText, buildKiPrompt: buildKiPrompt, buildGeminiRequestBody: buildGeminiRequestBody,
    parseGeminiResponse: parseGeminiResponse, classifyGeminiError: classifyGeminiError, offlineFallback: offlineFallback,
    maskApiKey: maskApiKey, isValidModelId: isValidModelId, cleanModel: cleanModel, geminiUrl: geminiUrl, isGeminiUrl: isGeminiUrl, isHttpsUrl: isHttpsUrl,
    DEFAULT_GEMINI_MODEL: DEFAULT_GEMINI_MODEL, FALLBACK_GEMINI_MODEL: FALLBACK_GEMINI_MODEL, LITE_GEMINI_MODEL: LITE_GEMINI_MODEL,
    GEMINI_MAX_OUTPUT_TOKENS: GEMINI_MAX_OUTPUT_TOKENS, GEMINI_THINKING_BUDGET_25: GEMINI_THINKING_BUDGET_25, GEMINI_TIMEOUT_MS: GEMINI_TIMEOUT_MS, GEMINI_BASE: GEMINI_BASE,
    thinkingConfigFor: thinkingConfigFor, modelChain: modelChain, maxOutputTokensFor: maxOutputTokensFor, GEMINI_ANSWER_TOKENS: GEMINI_ANSWER_TOKENS,
    SYSTEM_KI: SYSTEM_KI, KI_TASKS: KI_TASKS, TEXT_ARTEN: TEXT_ARTEN, KI_MESSAGES: KI_MESSAGES, KI_NOTES: KI_NOTES, VORNAMEN: VORNAMEN,
    pdfSafe: pdfSafe, pdfFileName: pdfFileName, pdfAnliegenBericht: pdfAnliegenBericht, pdfWochenbericht: pdfWochenbericht,
    pdfTermine: pdfTermine, pdfIdeeFlyer: pdfIdeeFlyer, pdfKiErgebnis: pdfKiErgebnis, sampleData: sampleData
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.BA = api;
})(this);
