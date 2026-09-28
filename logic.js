/* Bürger-Anliegen Bad Pyrmont 2.2.0 – reine Logik (ohne DOM), auch in Node testbar.
   Gleiche Regeln wie AnliegenLogic.java (Android). Keine Netzwerk-Zugriffe. */
(function (root) {
  'use strict';

  var VERSION = '2.2.0';
  var HEADER = 'Anliegen für Hajo Bönke (SPD Bad Pyrmont)';
  var THEMEN = ['Straße & Wege', 'Verkehr & Parken', 'Schule & Kita', 'Umwelt & Grün', 'Sauberkeit',
    'Soziales & Senioren', 'Jugend & Sport', 'Wirtschaft & Tourismus', 'Sonstiges'];
  var DRINGLICHKEIT = ['normal', 'wichtig', 'dringend'];
  var STATUS = ['Neu', 'In Arbeit', 'Erledigt'];
  var MAX_TEXT = 4000, MAX_SHORT = 120, MAX_LIST = 5000;
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
    var n = cleanLine(o.name), ort = cleanLine(o.ort), st = standortText(o.standort);
    if (n) lines.push('Name: ' + n);
    if (ort) lines.push('Ort: ' + ort);
    if (st) lines.push('Standort: ' + st);
    if (o.foto) lines.push('Foto: im Anhang');
    return lines.join('\n') + '\n\n' + cleanText(o.text);
  }
  function urlEncode(s) {
    return encodeURIComponent(s == null ? '' : String(s)).replace(/[!'()*]/g, function (c) {
      return '%' + c.charCodeAt(0).toString(16).toUpperCase();
    });
  }
  function buildWhatsAppUrl(message, number) {
    var v = validateNumber(number);
    var n = v.ok ? v.number : '';
    return 'https://wa.me/' + n + '?text=' + urlEncode(message);
  }
  function isAllowedExternal(url) {
    return typeof url === 'string' && !/[\s"<>\\]/.test(url) &&
      (url.indexOf('https://wa.me/') === 0 || url.indexOf('https://www.openstreetmap.org/') === 0 ||
       url.indexOf('https://aistudio.google.com/') === 0);
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
  function emptyData() { return { version: 2, mode: '', anliegen: [], ideen: [], termine: [] }; }
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
      ort: clip(cleanLine(a.ort), MAX_SHORT),
      text: text,
      kontakt: clip(cleanLine(a.kontakt), MAX_SHORT),
      created: created,
      updated: isoOk(a.updated) ? a.updated : created,
      erledigtAm: status === 'Erledigt' ? (isoOk(a.erledigtAm) ? a.erledigtAm : (isoOk(a.updated) ? a.updated : nowIso)) : ''
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
    if (b.status === 'Erledigt') { if (a.status !== 'Erledigt' || !b.erledigtAm) b.erledigtAm = nowIso; }
    else b.erledigtAm = '';
    b.updated = nowIso;
    return b;
  }
  function filterAnliegen(list, f) {
    f = f || {};
    var out = list.filter(function (a) {
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
    var rows = [['Datum', 'Thema', 'Dringlichkeit', 'Status', 'Ort', 'Text', 'Kontakt', 'Erledigt am']];
    list.forEach(function (a) {
      rows.push([stampDE(a.created), a.thema, a.dringlichkeit, a.status, a.ort, a.text, a.kontakt, a.erledigtAm ? stampDE(a.erledigtAm) : '']);
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
    L.push('', 'Dringende Anliegen (offen)');
    var dr = filterAnliegen(offen.filter(function (a) { return a.dringlichkeit === 'dringend'; }), {});
    dr.slice(0, 10).forEach(function (a) { L.push('- [' + a.thema + '] ' + (a.ort ? a.ort + ': ' : '') + excerpt(a.text, 90)); });
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


  // ------------------------------------------------------------ KI: Anonymisierung (vor jedem Senden)
  // Häufige Vornamen (für "Vorname Nachname" ohne Anrede). Rest über Anrede/Hinweiswörter.
  var VORNAMEN = ('Anna Maria Marie Sophie Sofia Emma Mia Hannah Hanna Lena Lea Laura Julia Sarah Sara Lisa Katharina Christina Andrea Sabine Susanne ' +
    'Petra Monika Ursula Renate Karin Birgit Claudia Nicole Stefanie Martina Heike Gabriele Brigitte Ingrid Elke Anja Silke Tanja Sandra Melanie ' +
    'Jana Jennifer Jessica Nina Kerstin Barbara Christa Helga Erika Elisabeth Gisela Doris Ute Angelika Marion Beate Anke Carina Johanna Clara Klara ' +
    'Peter Michael Thomas Andreas Stefan Stephan Christian Frank Markus Marcus Klaus Wolfgang Jürgen Juergen Uwe Hans Dieter Werner Bernd Manfred Günter ' +
    'Guenter Horst Helmut Gerhard Karl Heinz Rolf Ralf Jörg Joerg Dirk Sven Tobias Jan Lukas Lucas Leon Paul Felix Jonas Maximilian Alexander Daniel ' +
    'David Florian Sebastian Tim Timo Kevin Dennis Patrick Philipp Simon Matthias Martin Oliver Torsten Thorsten Holger Volker Rainer Norbert Detlef ' +
    'Ali Mehmet Mustafa Ahmet Fatma Ayse Ayşe Emine Olga Irina Natalia Piotr Anna-Lena Hajo Kilian Ben Finn Noah Elias Luis Henry Emil Theo Ole Mats').split(' ');
  var VORNAMEN_SET = {};
  VORNAMEN.forEach(function (n) { VORNAMEN_SET[n] = 1; });
  var CAP = '[A-ZÄÖÜ][a-zäöüß]+(?:-[A-ZÄÖÜ][a-zäöüß]+)?';
  var STREET_END = '(?:straße|strasse|str\\.|weg|gasse|platz|allee|ring|damm|ufer|pfad|chaussee|promenade|stieg|steig|twete)';

  function escRe(s) { return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  /** Entfernt/pseudonymisiert personenbezogene Daten. extraNames: z. B. Kontakt-Felder. */
  function anonymizeText(input, extraNames) {
    var t = String(input == null ? '' : input);
    var counts = { email: 0, telefon: 0, adresse: 0, name: 0, link: 0 };
    function rep(kind, tag) { return function () { counts[kind]++; return tag; }; }
    // 1) E-Mail
    t = t.replace(/[A-Za-z0-9._%+\-]+@[A-Za-z0-9\-]+(?:\.[A-Za-z0-9\-]+)*\.[A-Za-z]{2,}/g, rep('email', '[E-Mail]'));
    // 2) Links mit möglichen Daten (Query) -> [Link]
    t = t.replace(/https?:\/\/[^\s<>"]+/g, rep('link', '[Link]'));
    // 3) Telefon: beginnt mit +, 00 oder 0; Trennzeichen Leerzeichen - / ( ); 7-15 Ziffern
    t = t.replace(/(?:\+|\b0)[0-9][0-9 \-\/()]{5,20}[0-9]/g, function (m) {
      var d = m.replace(/[^0-9]/g, '');
      if (d.length < 7 || d.length > 15) return m;
      counts.telefon++; return '[Telefon]';
    });
    // 4) Straße + Hausnummer -> Straße bleibt, Hausnummer weg
    t = t.replace(new RegExp('(' + CAP + STREET_END + '|' + CAP + ' ' + STREET_END.replace('(?:', '(?:') + ')\\s*(\\d{1,4}(?:\\s?[a-zA-Z](?![A-Za-zÄÖÜäöüß]))?)(?![0-9.:,]?[0-9])(?!\\s?(?:Uhr|Minuten|Min\\.|Jahre|Prozent|%|€|Euro|Meter|km|m\\b))', 'g'),
      function (m, street) { counts.adresse++; return street + ' [Hausnummer]'; });
    // 4b) "Am Markt 3", "An der Kirche 7": Hausnummer weg
    t = t.replace(new RegExp('\\b((?:Am|An der|An den|Auf dem|Auf der|Im|In der|Zum|Zur|Hinter der|Hinter dem) ' + CAP + ')\\s+(\\d{1,4}(?:\\s?[a-zA-Z](?![A-Za-zÄÖÜäöüß]))?)(?![0-9.:,]?[0-9])(?!\\s?(?:Uhr|Minuten|Min\\.|Jahre|Prozent|%|€|Euro|Meter|km|m\\b))', 'g'),
      function (m, street) { counts.adresse++; return street + ' [Hausnummer]'; });
    // 5) Namen aus Kontakt-Feldern (genau diese Wörter)
    (extraNames || []).forEach(function (raw) {
      String(raw || '').split(/[\s,;:]+/).forEach(function (w) {
        if (w.length < 3 || !/^[A-ZÄÖÜ]/.test(w) || /\d/.test(w)) return;
        var re = new RegExp('(^|[^A-Za-zÄÖÜäöüß])' + escRe(w) + '(?![A-Za-zÄÖÜäöüß])', 'g');
        t = t.replace(re, function (m, pre) { counts.name++; return pre + '[Name]'; });
      });
    });
    // 6) Anrede / Hinweiswort + Name(n)
    t = t.replace(new RegExp('\\b(Herr|Herrn|Frau|Familie|Fam\\.|Hr\\.|Fr\\.|Dr\\.|Prof\\.)((?:\\s+(?:Dr|Prof)\\.)*)\\s+(?:' + CAP + ')(?:\\s+' + CAP + ')?', 'g'),
      function (m, anrede, titel) { counts.name++; return anrede + (titel || '') + ' [Name]'; });
    t = t.replace(new RegExp('\\b(Name:|Kontakt:|heiße|heisse|Ich bin|ich bin|mein Name ist|Mein Name ist)\\s+(?:' + CAP + ')(?:\\s+' + CAP + ')?', 'g'),
      function (m, cue) { counts.name++; return cue + ' [Name]'; });
    // 7) Häufiger Vorname + Nachname
    t = t.replace(new RegExp('\\b(' + CAP + ')\\s+(' + CAP + ')\\b', 'g'), function (m, v, n) {
      if (!VORNAMEN_SET[v] || v === 'Hajo') return m;
      counts.name++; return '[Name]';
    });
    // 8) @handles
    t = t.replace(/(^|\s)@[A-Za-z0-9_.]{3,}/g, function (m, pre) { counts.name++; return pre + '[Name]'; });
    t = t.replace(/\[Name\](?:\s+\[Name\])+/g, '[Name]');
    var total = counts.email + counts.telefon + counts.adresse + counts.name + counts.link;
    return { text: t, counts: counts, total: total };
  }

  // ------------------------------------------------------------ KI: Prompts
  var DEFAULT_GEMINI_MODEL = 'gemini-3.8-flash';
  var FALLBACK_GEMINI_MODEL = 'gemini-2.5-flash';
  var LITE_GEMINI_MODEL = 'gemini-3.5-flash-lite';
  var GEMINI_MAX_OUTPUT_TOKENS = 32768; // inkl. Denk-Tokens (Obergrenze der Modelle: 65536)
  var GEMINI_ANSWER_TOKENS = 8192;      // Platz für die eigentliche Antwort nach dem Nachdenken
  var GEMINI_THINKING_BUDGET_25 = 24576;
  var GEMINI_TIMEOUT_MS = 240000; // 4 Minuten: gründliches Nachdenken braucht Zeit
  var GEMINI_BASE = 'https://generativelanguage.googleapis.com/v1beta/models/';
  var KI_TASKS = ['zusammenfassen', 'antwort', 'text', 'recherche'];
  var TEXT_ARTEN = ['Social-Media-Post', 'Flyer-Text', 'Pressemitteilung', 'Rede-Stichpunkte'];
  var SYSTEM_KI = 'Du bist erfahrener Büroleiter und Pressereferent für Hajo Bönke, ' +
    'SPD-Kommunalpolitiker in Bad Pyrmont (Niedersachsen). ' +
    'Schreibe auf Deutsch, klar, respektvoll und in einfacher Sprache mit kurzen Sätzen. ' +
    'Erfinde keine Fakten: nur Fakten aus der Anfrage oder aus der Suche, keine erfundenen Zahlen, Namen, Termine, Zitate oder Versprechen. ' +
    'Unsicherheiten klar markieren (z. B. „unsicher:“ oder Platzhalter wie [Datum]). ' +
    'Platzhalter [Name], [Telefon], [E-Mail], [Hausnummer], [Link] sind anonymisiert – nicht ersetzen und nicht raten. ' +
    'Keine Angriffe auf Personen oder Parteien, keine Übertreibungen. ' +
    'Wo sinnvoll: konkrete nächste Schritte nennen. ' +
    'Keine Markdown-Tabellen. Aufzählungen mit „-“ sind erlaubt.';

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
    var lines = list.map(function (a, i) {
      return (i + 1) + '. Thema: ' + a.thema + ' | Dringlichkeit: ' + a.dringlichkeit + ' | Status: ' + a.status +
        (a.ort ? ' | Ort: ' + cleanLine(a.ort) : '') + ' | Datum: ' + stampDE(a.created) + '\n   ' + cleanLine(a.text);
    });
    return anonymizeText(lines.join('\n'), names);
  }

  /** Baut {system, user, anon, grounding} für eine Aufgabe. Ohne eigene Mengen-Grenzen. */
  function buildKiPrompt(task, o) {
    o = o || {};
    var data = o.data || emptyData();
    var anon, user;
    if (task === 'zusammenfassen') {
      var offen = filterAnliegen(data.anliegen.filter(function (a) { return a.status !== 'Erledigt'; }), {});
      anon = anliegenForKi(offen);
      user = 'Rolle: Büroleiter für Hajo Bönke (SPD Bad Pyrmont).\n' +
        'Hier sind ' + offen.length + ' offene Bürger-Anliegen.\n' +
        'Aufgabe (nur aus den vorliegenden Texten, nichts erfinden):\n' +
        '1. Kurze Gesamtschau (3 bis 5 Sätze).\n' +
        '2. Prioritätenliste: zuerst dringend, dann wichtig, dann normal.\n' +
        '3. Gruppierung nach Thema.\n' +
        '4. Pro Punkt ein konkreter nächster Schritt (wer/was – ohne Versprechen).\n' +
        '5. Unklarheiten mit „unsicher:“ markieren.\n\nAnliegen:\n' + (anon.text || '(keine)');
    } else if (task === 'antwort') {
      var a = o.anliegen || {};
      anon = anonymizeText('Thema: ' + (a.thema || '') + '\nOrt: ' + cleanLine(a.ort || '') + '\nStatus: ' + (a.status || '') + '\nAnliegen: ' + cleanText(a.text || ''),
        a.kontakt ? [a.kontakt] : []);
      user = 'Rolle: freundlicher Büro-Mitarbeiter für Hajo Bönke.\n' +
        'Schreibe einen respektvollen Antwort-Entwurf an die Bürgerin/den Bürger.\n' +
        'Struktur: Dank → kurze Wiedergabe des Anliegens (ohne neue Fakten) → was als Nächstes passiert ' +
        '(ehrlich, ohne Versprechen) → ggf. eine Rückfrage → Bitte um Geduld.\n' +
        'Anrede: „Guten Tag,“ (ohne Namen). Unterschrift: „[Name], für Hajo Bönke“.\n' +
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
      user = 'Rolle: Pressereferent für Hajo Bönke, SPD Bad Pyrmont.\nSchreibe ' + how + '.\n' +
        'Nur belegte Inhalte aus den Stichworten; Unsicherheiten markieren.\nThema und Stichworte:\n' + (anon.text || '[Thema]');
    } else if (task === 'recherche') {
      anon = anonymizeText(cleanText(o.input || ''));
      user = 'Rolle: Recherche-Assistent für den Kommunalpolitiker Hajo Bönke (Bad Pyrmont, Niedersachsen).\n' +
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
    return { kind: kind, status: status, retryMs: retryMs, hardLimit: hardLimit, message: KI_MESSAGES[kind] || KI_MESSAGES.other };
  }
  var KI_MESSAGES = {
    nokey: 'Die KI ist noch nicht eingerichtet. Bitte unter ⚙ Einstellungen einen kostenlosen Schlüssel eintragen.',
    off: 'Die KI ist ausgeschaltet. Einschalten unter ⚙ Einstellungen.',
    offline: 'Keine Internet-Verbindung. Die KI braucht Internet. Alles andere funktioniert weiter.',
    key: 'Der Schlüssel funktioniert nicht. Bitte unter ⚙ prüfen oder neu kopieren (aistudio.google.com/apikey).',
    quota: 'KI-Tageslimit von Google erreicht – morgen wieder da, bis dahin Vorlagen.',
    region: 'Google bietet die kostenlose KI in dieser Region gerade nicht an.',
    model: 'Dieses KI-Modell gibt es nicht (mehr). Bitte unter ⚙ das Modell-Feld leeren.',
    forbidden: 'Google erlaubt diese Anfrage mit dem Schlüssel nicht.',
    bad: 'Google konnte die Anfrage nicht bearbeiten.',
    server: 'Der KI-Dienst von Google ist gerade überlastet. Bitte später noch einmal versuchen.',
    blocked: 'Die KI hat keine Antwort gegeben (Sicherheits-Filter). Bitte anders formulieren.',
    empty: 'Die KI hat eine leere Antwort geschickt. Bitte noch einmal versuchen.',
    parse: 'Die Antwort der KI war nicht lesbar. Bitte noch einmal versuchen.',
    timeout: 'Die KI hat zu lange gebraucht. Bitte noch einmal versuchen.',
    other: 'Die KI hat gerade nicht geantwortet. Bitte später noch einmal versuchen.'
  };
  var KI_NOTES = {
    groundingOff: 'Internet-Suche war nicht möglich (Limit oder nicht freigeschaltet). Antwort ohne Suche – bitte Fakten selbst prüfen.',
    groundingModel: 'Für die Internet-Suche wurde ein anderes Modell genutzt (die Suche ist kostenlos nur bei manchen Modellen).',
    noSources: 'Die KI hat keine Quellen geliefert. Bitte Fakten selbst prüfen.',
    fallbackModel: 'Das erste KI-Modell war ausgelastet oder überlastet. Die Antwort kommt vom nächsten Modell.',
    answeredBy: 'Antwort von: ',
    offlineTpl: 'Ohne KI erstellt (Vorlage). Bitte [Klammern] ersetzen.',
    thinking: 'KI denkt gründlich nach … bitte einen Moment warten.'
  };

  // ------------------------------------------------------------ KI: Offline-Ersatz (Vorlagen)
  function vorlageById(id) { for (var i = 0; i < VORLAGEN.length; i++) if (VORLAGEN[i].id === id) return VORLAGEN[i]; return null; }
  function offlineFallback(task, o) {
    o = o || {};
    var data = o.data || emptyData();
    if (task === 'zusammenfassen') {
      var offen = filterAnliegen(data.anliegen.filter(function (a) { return a.status !== 'Erledigt'; }), {});
      var L = ['Offene Anliegen, geordnet nach Dringlichkeit (ohne KI):', ''];
      offen.forEach(function (a, i) { L.push((i + 1) + '. [' + a.dringlichkeit + '] ' + a.thema + (a.ort ? ' – ' + cleanLine(a.ort) : '') + ': ' + excerpt(a.text, 100)); });
      if (!offen.length) L.push('Keine offenen Anliegen.');
      L.push('', 'Nach Thema:');
      THEMEN.forEach(function (th) { var c = offen.filter(function (a) { return a.thema === th; }).length; if (c) L.push('- ' + th + ': ' + c); });
      return L.join('\n');
    }
    if (task === 'antwort') {
      var a = o.anliegen || {};
      return 'Guten Tag,\n\nvielen Dank für Ihre Nachricht' + (a.thema ? ' zum Thema „' + a.thema + '“' : '') + '. ' +
        'Wir haben Ihr Anliegen aufgenommen und geben es an Hajo Bönke weiter. ' +
        'Sobald es Neuigkeiten gibt, melden wir uns bei Ihnen.\n\nViele Grüße\n[Name], für Hajo Bönke';
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
  function pdfSafe(s) {
    var t = String(s == null ? '' : s).replace(/\r\n?/g, '\n').replace(/\t/g, '    ')
      .replace(/[✓✔☑]/g, '[x]').replace(/[☐]/g, '[ ]').replace(/[→➔]/g, '->').replace(/[\u2010\u2011\u2012]/g, '-')
      .replace(/[\u00A0\u202F\u2007]/g, ' ').replace(/[\u200B-\u200D\uFEFF]/g, '');
    var out = '';
    for (var ch of t) { // eslint-disable-line
      var c = ch.codePointAt(0);
      if (c === 10 || (c >= 32 && c <= 126) || (c >= 160 && c <= 255) || WINANSI_EXTRA.indexOf(ch) >= 0) out += ch;
      else if (c > 0xFFFF || (c >= 0x2600 && c <= 0x27BF) || (c >= 0xFE00 && c <= 0xFE0F)) out += ''; // Emoji weg
      else out += '?';
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
    B.push({ t: 'meta', v: 'Filter: Thema ' + (f.thema || 'alle') + ' · Status ' + (f.status || 'alle') + ' · ' + list.length + ' Anliegen' });
    var counts = STATUS.map(function (s) { return s + ': ' + list.filter(function (a) { return a.status === s; }).length; }).join(' · ');
    B.push({ t: 'meta', v: counts });
    if (!list.length) B.push({ t: 'p', v: 'Keine Anliegen für diesen Filter.' });
    list.forEach(function (a, i) {
      B.push({ t: 'h2', v: (i + 1) + '. ' + a.thema + (a.ort ? ' – ' + a.ort : '') });
      B.push({ t: 'meta', v: 'Status: ' + a.status + ' · Dringlichkeit: ' + a.dringlichkeit + ' · Eingang: ' + stampDE(a.created) +
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
    return pdfDoc('Infoblatt', 'Hajo Bönke · SPD Bad Pyrmont', B, o);
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
      { id: 'b1', thema: 'Straße & Wege', dringlichkeit: 'dringend', status: 'Neu', ort: 'Holzhausen', text: 'Beispiel: Schlagloch auf dem Radweg, Größe etwa 30 cm. Gefahr für Radfahrer.', created: iso(1) },
      { id: 'b2', thema: 'Verkehr & Parken', dringlichkeit: 'wichtig', status: 'In Arbeit', ort: 'Oesdorf', text: 'Beispiel: Autos fahren vor der Grundschule zu schnell. Wunsch: Tempo 30 und Blitzer-Anhänger.', created: iso(3) },
      { id: 'b3', thema: 'Umwelt & Grün', dringlichkeit: 'normal', status: 'Erledigt', ort: 'Kurpark', text: 'Beispiel: Mehr Mülleimer am Spielplatz – wurden aufgestellt.', created: iso(6), erledigtAm: iso(2) },
      { id: 'b4', thema: 'Soziales & Senioren', dringlichkeit: 'wichtig', status: 'Neu', ort: 'Löwensen', text: 'Beispiel: Sitzbank an der Bushaltestelle für ältere Menschen gewünscht.', created: iso(2) }
    ], ideen: [
      { id: 'bi1', titel: 'Beispiel: Bürgersprechstunde im Ortsteil', text: 'Einmal im Monat vor Ort zuhören. Ohne Anmeldung.', created: iso(2) }
    ], termine: [
      { id: 'bt1', titel: 'Beispiel: Infostand am Markt', datum: day(5), zeit: '10:00', dauer: 180, ort: 'Marktplatz', checkliste: [{ text: 'Standort anmelden', done: true }, { text: 'Flyer mitnehmen', done: false }], created: iso(4) },
      { id: 'bt2', titel: 'Beispiel: Rückmeldung an Schule geben', datum: '', erledigt: false, created: iso(1) }
    ] }, new Date(nowMs).toISOString());
  }

  var api = {
    VERSION: VERSION, HEADER: HEADER, THEMEN: THEMEN, DRINGLICHKEIT: DRINGLICHKEIT, STATUS: STATUS,
    MAX_TEXT: MAX_TEXT, MAX_SHORT: MAX_SHORT, CHECKLISTEN: CHECKLISTEN, VORLAGEN: VORLAGEN,
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
