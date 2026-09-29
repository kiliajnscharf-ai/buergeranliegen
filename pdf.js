/* Bürger-Anliegen 2.4.0 – PDF-Ausgabe mit gebündeltem jsPDF (MIT, vendor/, kein CDN). Offline.
   2.3.0: Block 'qr' zeichnet einen QR-Code als Vektor (qr.js / vendor/qrcode.js, lokal).
   2.4.0: Unicode-Schrift (vendor/pdffont.js, DejaVu Sans Auszug) für ş, ı, ł, Kyrillisch …; ohne Schrift: Umschrift (ş → s). */
(function (root) {
  'use strict';
  var BA = root.BA;
  var RED = [227, 0, 15], GREY = [90, 90, 90];

  /** doc: Ergebnis von BA.pdf*(); gibt Uint8Array (PDF-Bytes) zurück. */
  function render(docSpec) {
    var JsPDF = (root.jspdf && root.jspdf.jsPDF) || root.jsPDF;
    if (!JsPDF) throw new Error('PDF-Bibliothek fehlt');
    var pdf = new JsPDF({ unit: 'mm', format: 'a4', compress: true });
    var FONT = 'helvetica', F = root.BA_PDF_FONT;
    if (F && F.regular && F.bold && docSpec.unicode !== false) {
      try {
        pdf.addFileToVFS('BADejaVu.ttf', F.regular); pdf.addFont('BADejaVu.ttf', 'BADejaVu', 'normal');
        pdf.addFileToVFS('BADejaVu-Bold.ttf', F.bold); pdf.addFont('BADejaVu-Bold.ttf', 'BADejaVu', 'bold');
        pdf.setFont('BADejaVu', 'normal');
        FONT = 'BADejaVu';
      } catch (e) { FONT = 'helvetica'; }
    }
    var UNI = FONT !== 'helvetica';
    var S = function (s) { return BA.pdfSafe(s, UNI); };
    var setFont0 = pdf.setFont.bind(pdf);
    pdf.setFont = function (name, style) { return setFont0(name === 'helvetica' ? FONT : name, style); };
    pdf.setProperties({ title: S(docSpec.title), subject: S(docSpec.subtitle), creator: 'Bürger-Anliegen Bad Pyrmont ' + BA.VERSION, author: 'Bürger-Anliegen Bad Pyrmont' });
    var W = 210, H = 297, M = 20, TW = W - 2 * M, TOP = 34, BOTTOM = H - 20;
    var y = TOP;
    function header() {
      pdf.setFillColor(RED[0], RED[1], RED[2]);
      pdf.rect(0, 0, W, 5, 'F');
      pdf.setFont('helvetica', 'bold'); pdf.setFontSize(15); pdf.setTextColor(0);
      pdf.text(S(docSpec.title), M, 16);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9.5); pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
      pdf.text(S(docSpec.subtitle), M, 22);
      pdf.text('Stand: ' + S(docSpec.stamp), W - M, 16, { align: 'right' });
      if (docSpec.sample) {
        pdf.setFont('helvetica', 'bold'); pdf.setTextColor(RED[0], RED[1], RED[2]);
        pdf.text('Beispieldaten', W - M, 22, { align: 'right' });
      }
      pdf.setDrawColor(200); pdf.setLineWidth(0.3); pdf.line(M, 26, W - M, 26);
      pdf.setTextColor(0);
    }
    function newPage() { pdf.addPage(); header(); y = TOP; }
    function ensure(h) { if (y + h > BOTTOM) newPage(); }
    function para(text, size, style, color, indent, gapAfter, lh) {
      pdf.setFont('helvetica', style || 'normal'); pdf.setFontSize(size);
      pdf.setTextColor(color ? color[0] : 0, color ? color[1] : 0, color ? color[2] : 0);
      var lineH = (lh || 1.4) * size * 0.3528;
      var lines = pdf.splitTextToSize(S(text), TW - (indent || 0));
      lines.forEach(function (ln) { ensure(lineH); pdf.text(ln, M + (indent || 0), y + lineH * 0.8); y += lineH; });
      y += gapAfter || 0;
    }
    header();
    docSpec.blocks.forEach(function (b) {
      switch (b.t) {
        case 'h1': ensure(14); y += 2; para(b.v, 14, 'bold', RED, 0, 2); break;
        case 'h2': ensure(12); y += 1.5; para(b.v, 12, 'bold', null, 0, 1); break;
        case 'meta': para(b.v, 9.5, 'normal', GREY, 0, 1.5); break;
        case 'li':
          pdf.setFont('helvetica', 'normal'); pdf.setFontSize(11);
          ensure(6); pdf.setTextColor(0); pdf.text('•', M + 1, y + 4.3);
          para(b.v, 11, 'normal', null, 6, 0.8); break;
        case 'big': ensure(30); y += 6; para(b.v, 26, 'bold', RED, 0, 6, 1.2); break;
        case 'lead': para(b.v, 14, 'normal', null, 0, 4, 1.45); break;
        case 'box': {
          pdf.setFont('helvetica', 'bold'); pdf.setFontSize(13);
          var lines = pdf.splitTextToSize(S(b.v), TW - 10), h = lines.length * 6.5 + 8;
          ensure(h); pdf.setFillColor(253, 235, 236); pdf.setDrawColor(RED[0], RED[1], RED[2]);
          pdf.roundedRect(M, y, TW, h, 3, 3, 'FD'); pdf.setTextColor(0);
          lines.forEach(function (ln, i) { pdf.text(ln, M + 5, y + 9 + i * 6.5); });
          y += h + 4; break;
        }
        case 'qr': {
          var Q = root.BAQr && root.BAQr.matrix(b.v);
          if (!Q) { para(b.v, 11, 'normal', null, 0, 3); break; }
          var side = Math.min(b.size || 60, TW), cell = side / (Q.size + 8);
          ensure(side + 4);
          var x0 = M + (TW - side) / 2, y0 = y;
          pdf.setFillColor(255, 255, 255); pdf.rect(x0, y0, side, side, 'F');
          pdf.setFillColor(0, 0, 0);
          for (var r = 0; r < Q.size; r++) {
            for (var c = 0; c < Q.size; c++) {
              if (!Q.dark(r, c)) continue;
              var c2 = c; while (c2 + 1 < Q.size && Q.dark(r, c2 + 1)) c2++;
              pdf.rect(x0 + (c + 4) * cell, y0 + (r + 4) * cell, (c2 - c + 1) * cell + 0.01, cell + 0.01, 'F');
              c = c2;
            }
          }
          y += side + 4; break;
        }
        case 'space': y += 6; break;
        default: para(b.v, 11, 'normal', null, 0, 3);
      }
    });
    var n = pdf.getNumberOfPages();
    for (var i = 1; i <= n; i++) {
      pdf.setPage(i);
      pdf.setFont('helvetica', 'normal'); pdf.setFontSize(9); pdf.setTextColor(GREY[0], GREY[1], GREY[2]);
      pdf.setDrawColor(220); pdf.line(M, H - 14, W - M, H - 14);
      pdf.text('Bürger-Anliegen Bad Pyrmont' + (docSpec.sample ? ' · Beispieldaten' : ''), M, H - 9);
      pdf.text('Seite ' + i + ' von ' + n, W - M, H - 9, { align: 'right' });
    }
    render.lastFont = FONT;
    return new Uint8Array(pdf.output('arraybuffer'));
  }
  function toBase64(u8) {
    var s = '', CH = 0x8000;
    for (var i = 0; i < u8.length; i += CH) s += String.fromCharCode.apply(null, u8.subarray(i, i + CH));
    return btoa(s);
  }
  root.BAPdf = { render: render, toBase64: toBase64 };
})(typeof globalThis !== 'undefined' ? globalThis : this);
