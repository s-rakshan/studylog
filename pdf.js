/* Study Log: tiny offline PDF writer (A4, Helvetica) for the same export model as docx.js. */
(function () {
  const W = [278,278,355,556,556,889,667,191,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,333,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584];
  const WIN = { '·': 0xB7, '—': 0x97, '–': 0x96, '…': 0x85, '‘': 0x91, '’': 0x92, '“': 0x93, '”': 0x94, '•': 0x95, '★': 0x2A, '₹': 0x52 };
  const enc = s => [...String(s)].map(c => { const n = c.charCodeAt(0); if (n >= 32 && n < 127) return n; if (WIN[c]) return WIN[c]; if (n >= 160 && n < 256) return n; return 63; });
  const cw = (n, b) => (n >= 32 && n < 127 ? W[n - 32] : n === 0x97 ? 1000 : n === 0xB7 ? 278 : 556) * (b ? 1.06 : 1);
  const tw = (s, sz, b) => enc(s).reduce((a, n) => a + cw(n, b), 0) * sz / 1000;
  const esc = s => enc(s).map(n => n === 40 || n === 41 || n === 92 ? '\\' + String.fromCharCode(n) : String.fromCharCode(n)).join('');
  function wrap(s, w, sz, b) {
    const out = []; let line = '';
    for (const word of String(s).split(/\s+/)) {
      const t = line ? line + ' ' + word : word;
      if (tw(t, sz, b) <= w || !line) { line = t; while (tw(line, sz, b) > w && line.length > 1) { let i = line.length; while (i > 1 && tw(line.slice(0, i), sz, b) > w) i--; out.push(line.slice(0, i)); line = line.slice(i); } }
      else { out.push(line); line = word; }
    }
    out.push(line); return out;
  }
  window.makePdf = function (m) {
    const PW = 595, PH = 842, ML = 40, MR = 40, MT = 48, MB = 48, CW = [64, 58, 66, 227, 100], pages = []; let ops, y;
    const page = () => { ops = []; pages.push(ops); y = PH - MT; };
    const text = (s, x, yy, sz, b, gray) => ops.push(`BT /${b ? 'F2' : 'F1'} ${sz} Tf ${gray ? '0.4 0.4 0.4' : '0 0 0'} rg ${x.toFixed(1)} ${yy.toFixed(1)} Td (${esc(s)}) Tj ET`);
    const rect = (x, yy, w, h, g) => ops.push(`${g} g ${x} ${yy.toFixed(1)} ${w} ${h.toFixed(1)} re f 0 g`);
    const hline = yy => ops.push(`0.8 G 0.5 w ${ML} ${yy.toFixed(1)} m ${PW - MR} ${yy.toFixed(1)} l S`);
    const need = h => { if (y - h < MB) page(); };
    const row = (cells, b, shade) => {
      const sz = 9.5, lh = 12.5, lines = cells.map((c, i) => wrap(c, CW[i] - 10, sz, b)), h = Math.max(...lines.map(l => l.length)) * lh + 8;
      need(h); if (shade) rect(ML, y - h, PW - ML - MR, h, shade);
      let x = ML; lines.forEach((L, i) => { L.forEach((t, j) => text(t, x + 5, y - 13 - j * lh, sz, b)); x += CW[i]; });
      y -= h; hline(y);
    };
    page();
    text(m.title, ML, y - 18, 20, 1); y -= 34;
    wrap(m.subtitle, PW - ML - MR, 10).forEach(t => { text(t, ML, y - 10, 10, 0, 1); y -= 14; }); y -= 10;
    m.days.forEach(d => {
      need(70); text(d.title, ML, y - 13, 12, 1); y -= 22; hline(y);
      row(m.head, 1, 0.93); d.rows.forEach(r => row(r)); row(d.total, 1, 0.97); y -= 16;
    });
    if (m.summary?.length) { need(60); text('Summary', ML, y - 14, 13, 1); y -= 24; m.summary.forEach(s => wrap(s, PW - ML - MR, 10).forEach(t => { need(14); text(t, ML, y - 10, 10); y -= 15; })); }
    // assemble
    const objs = [], add = s => (objs.push(s), objs.length);
    add('<< /Type /Catalog /Pages 2 0 R >>'); add('');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>');
    add('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding >>');
    const kids = pages.map((p, i) => {
      const s = p.join('\n') + `\nBT /F1 8 Tf 0.5 0.5 0.5 rg ${PW - MR - 40} 24 Td (${i + 1} / ${pages.length}) Tj ET`;
      const c = add(`<< /Length ${s.length} >>\nstream\n${s}\nendstream`);
      return add(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Resources << /Font << /F1 3 0 R /F2 4 0 R >> >> /Contents ${c} 0 R >>`);
    });
    objs[1] = `<< /Type /Pages /Kids [${kids.map(k => k + ' 0 R').join(' ')}] /Count ${kids.length} >>`;
    let out = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n'; const off = [];
    objs.forEach((o, i) => { off.push(out.length); out += `${i + 1} 0 obj\n${o}\nendobj\n`; });
    const xr = out.length;
    out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n` + off.map(o => String(o).padStart(10, '0') + ' 00000 n \n').join('');
    out += `trailer\n<< /Size ${objs.length + 1} /Root 1 0 R >>\nstartxref\n${xr}\n%%EOF`;
    const bytes = new Uint8Array(out.length); for (let i = 0; i < out.length; i++) bytes[i] = out.charCodeAt(i) & 255;
    return new Blob([bytes], { type: 'application/pdf' });
  };
})();
