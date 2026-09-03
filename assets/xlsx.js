/* 외부 라이브러리 없이 .xlsx(엑셀) 파일을 만듭니다.
   xlsx는 XML 몇 개를 담은 zip이라, 압축 없이(store) 묶어 내보냅니다. */
window.buildXlsx = (function(){

  /* ── zip ─────────────────────────────── */
  const CRC_TABLE = (function(){
    const t = new Uint32Array(256);
    for (let n = 0; n < 256; n++){
      let c = n;
      for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
      t[n] = c >>> 0;
    }
    return t;
  })();

  function crc32(buf){
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }

  function dosTime(d){
    return ((d.getHours() << 11) | (d.getMinutes() << 5) | (d.getSeconds() / 2)) & 0xFFFF;
  }
  function dosDate(d){
    return (((d.getFullYear() - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate()) & 0xFFFF;
  }

  function zip(files){
    const enc = new TextEncoder();
    const now = new Date();
    const time = dosTime(now), date = dosDate(now);
    const parts = [], central = [];
    let offset = 0;

    files.forEach(f => {
      const name = enc.encode(f.name);
      const data = f.data;
      const crc = crc32(data);

      const lh = new Uint8Array(30 + name.length);
      const lv = new DataView(lh.buffer);
      lv.setUint32(0, 0x04034b50, true);
      lv.setUint16(4, 20, true);
      lv.setUint16(6, 0x0800, true);   // UTF-8 파일명
      lv.setUint16(8, 0, true);        // 무압축
      lv.setUint16(10, time, true);
      lv.setUint16(12, date, true);
      lv.setUint32(14, crc, true);
      lv.setUint32(18, data.length, true);
      lv.setUint32(22, data.length, true);
      lv.setUint16(26, name.length, true);
      lv.setUint16(28, 0, true);
      lh.set(name, 30);

      const ch = new Uint8Array(46 + name.length);
      const cv = new DataView(ch.buffer);
      cv.setUint32(0, 0x02014b50, true);
      cv.setUint16(4, 20, true);
      cv.setUint16(6, 20, true);
      cv.setUint16(8, 0x0800, true);
      cv.setUint16(10, 0, true);
      cv.setUint16(12, time, true);
      cv.setUint16(14, date, true);
      cv.setUint32(16, crc, true);
      cv.setUint32(20, data.length, true);
      cv.setUint32(24, data.length, true);
      cv.setUint16(28, name.length, true);
      cv.setUint16(30, 0, true);
      cv.setUint16(32, 0, true);
      cv.setUint16(34, 0, true);
      cv.setUint16(36, 0, true);
      cv.setUint32(38, 0, true);
      cv.setUint32(42, offset, true);
      ch.set(name, 46);

      parts.push(lh, data);
      central.push(ch);
      offset += lh.length + data.length;
    });

    const cdSize = central.reduce((s, c) => s + c.length, 0);
    const eocd = new Uint8Array(22);
    const ev = new DataView(eocd.buffer);
    ev.setUint32(0, 0x06054b50, true);
    ev.setUint16(4, 0, true);
    ev.setUint16(6, 0, true);
    ev.setUint16(8, files.length, true);
    ev.setUint16(10, files.length, true);
    ev.setUint32(12, cdSize, true);
    ev.setUint32(16, offset, true);
    ev.setUint16(20, 0, true);

    return new Blob(parts.concat(central, [eocd]), { type:'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  /* ── xlsx ────────────────────────────── */
  const esc = s => String(s)
    .replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;')
    .replace(/"/g,'&quot;').replace(/'/g,'&apos;')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g,'');

  function colName(i){
    let s = '';
    i += 1;
    while (i > 0){ const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = ((i - m) / 26) | 0; }
    return s;
  }

  function sheetXml(sheet){
    const rows = [];
    const all = [sheet.header].concat(sheet.rows);

    all.forEach((cells, r) => {
      const isHeader = r === 0;
      const cs = cells.map((v, c) => {
        const ref = colName(c) + (r + 1);
        if (typeof v === 'number' && isFinite(v)){
          return '<c r="' + ref + '" s="2"><v>' + v + '</v></c>';
        }
        if (v === null || v === undefined || v === '') return '';
        return '<c r="' + ref + '" t="inlineStr" s="' + (isHeader ? 1 : 0) + '"><is><t xml:space="preserve">' + esc(v) + '</t></is></c>';
      }).join('');
      rows.push('<row r="' + (r + 1) + '">' + cs + '</row>');
    });

    const cols = (sheet.widths || []).map((w, i) =>
      '<col min="' + (i+1) + '" max="' + (i+1) + '" width="' + w + '" customWidth="1"/>').join('');

    return '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
      (cols ? '<cols>' + cols + '</cols>' : '') +
      '<sheetData>' + rows.join('') + '</sheetData></worksheet>';
  }

  const STYLES = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
    '<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">' +
    '<numFmts count="1"><numFmt numFmtId="164" formatCode="#,##0"/></numFmts>' +
    '<fonts count="2">' +
      '<font><sz val="11"/><color theme="1"/><name val="맑은 고딕"/></font>' +
      '<font><b/><sz val="11"/><color theme="1"/><name val="맑은 고딕"/></font>' +
    '</fonts>' +
    '<fills count="2"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill></fills>' +
    '<borders count="1"><border><left/><right/><top/><bottom/><diagonal/></border></borders>' +
    '<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>' +
    '<cellXfs count="3">' +
      '<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>' +
      '<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>' +
      '<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>' +
    '</cellXfs>' +
    '<cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>' +
    '</styleSheet>';

  /* sheets: [{ name, widths:[..], header:[..], rows:[[..]] }] */
  return function buildXlsx(sheets){
    const enc = new TextEncoder();
    const files = [];
    const put = (name, text) => files.push({ name, data: enc.encode(text) });

    put('[Content_Types].xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">' +
      '<Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>' +
      '<Default Extension="xml" ContentType="application/xml"/>' +
      '<Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>' +
      sheets.map((s, i) => '<Override PartName="/xl/worksheets/sheet' + (i+1) + '.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>').join('') +
      '<Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>' +
      '</Types>');

    put('_rels/.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      '<Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>' +
      '</Relationships>');

    put('xl/workbook.xml',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" ' +
      'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>' +
      sheets.map((s, i) => '<sheet name="' + esc(s.name) + '" sheetId="' + (i+1) + '" r:id="rId' + (i+1) + '"/>').join('') +
      '</sheets></workbook>');

    put('xl/_rels/workbook.xml.rels',
      '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>' +
      '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
      sheets.map((s, i) => '<Relationship Id="rId' + (i+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet' + (i+1) + '.xml"/>').join('') +
      '<Relationship Id="rId' + (sheets.length+1) + '" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>' +
      '</Relationships>');

    put('xl/styles.xml', STYLES);
    sheets.forEach((s, i) => put('xl/worksheets/sheet' + (i+1) + '.xml', sheetXml(s)));

    return zip(files);
  };
})();
