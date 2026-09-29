/* Bürger-Anliegen 2.3.0 – QR-Code lokal erzeugen (vendor/qrcode.js, MIT). Kein Internet, kein fremder Dienst. */
(function (root) {
  'use strict';
  /** Gibt {size, dark(r,c)} zurück oder null. Fehlerkorrektur M (gut lesbar, auch gedruckt). */
  function matrix(text) {
    var gen = root.qrcode;
    if (typeof gen !== 'function' || !text) return null;
    try {
      var q = gen(0, 'M');
      q.addData(String(text));
      q.make();
      var n = q.getModuleCount();
      return { size: n, dark: function (r, c) { return q.isDark(r, c); } };
    } catch (e) { return null; }
  }
  /** SVG-Element (ohne innerHTML, CSP-sicher). Weißer Rand von 4 Modulen. */
  function svg(text, doc) {
    var Q = matrix(text); doc = doc || root.document;
    if (!Q || !doc) return null;
    var NS = 'http://www.w3.org/2000/svg', n = Q.size + 8, d = '';
    for (var r = 0; r < Q.size; r++) {
      for (var c = 0; c < Q.size; c++) {
        if (!Q.dark(r, c)) continue;
        var c2 = c; while (c2 + 1 < Q.size && Q.dark(r, c2 + 1)) c2++;
        d += 'M' + (c + 4) + ' ' + (r + 4) + 'h' + (c2 - c + 1) + 'v1h-' + (c2 - c + 1) + 'z';
        c = c2;
      }
    }
    var el = doc.createElementNS(NS, 'svg');
    el.setAttribute('viewBox', '0 0 ' + n + ' ' + n);
    el.setAttribute('role', 'img');
    el.setAttribute('shape-rendering', 'crispEdges');
    var bg = doc.createElementNS(NS, 'rect');
    bg.setAttribute('width', n); bg.setAttribute('height', n); bg.setAttribute('fill', '#fff');
    var p = doc.createElementNS(NS, 'path');
    p.setAttribute('d', d); p.setAttribute('fill', '#000');
    el.appendChild(bg); el.appendChild(p);
    return el;
  }
  root.BAQr = { matrix: matrix, svg: svg };
})(typeof globalThis !== 'undefined' ? globalThis : this);
