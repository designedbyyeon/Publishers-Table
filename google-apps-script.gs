/**
 * 부스 계산기 → 구글 시트 연동 스크립트
 *
 * 붙여넣는 곳: 구글 스프레드시트 → 확장 프로그램 → Apps Script
 * 자세한 순서는 기록 페이지의 "구글 시트 연동 → 연동하는 법"에 있습니다.
 */

/* 비워두면 누구나 이 주소로 기록을 보낼 수 있습니다.
   아무 문자열이나 넣고, 앱의 '비밀 키'에 같은 값을 적으면 그 값을 아는 기기만 쓸 수 있습니다. */
const SECRET = '';

const SHEET_NAME = '판매기록';
const HEADER = ['기록ID', '날짜', '요일', '시각', '기기', '팀', '상품', '단가', '수량', '금액'];
const WD = ['일', '월', '화', '수', '목', '금', '토'];

function doGet() {
  return json({ ok: true, sheet: SHEET_NAME, rows: Math.max(0, getSheet().getLastRow() - 1) });
}

function doPost(e) {
  const lock = LockService.getScriptLock();
  try {
    /* 여러 폰이 동시에 보내도 행이 섞이지 않도록 잠급니다. */
    lock.waitLock(25000);

    const body = JSON.parse(e.postData.contents);
    if (SECRET && body.secret !== SECRET) return json({ ok: false, error: '비밀 키가 다릅니다' });

    const sheet = getSheet();
    const ops = body.ops || [];
    const device = body.device || '';

    ops.forEach(function (op) {
      removeRows(sheet, op.id);
      if (op.op !== 'delete') appendRows(sheet, op, device);
    });

    SpreadsheetApp.flush();
    return json({ ok: true, applied: ops.length, rows: Math.max(0, sheet.getLastRow() - 1) });
  } catch (err) {
    return json({ ok: false, error: String(err) });
  } finally {
    try { lock.releaseLock(); } catch (ignored) {}
  }
}

function getSheet() {
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = ss.getSheetByName(SHEET_NAME);
  if (!sheet) sheet = ss.insertSheet(SHEET_NAME);
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADER);
    sheet.getRange(1, 1, 1, HEADER.length).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

/* 같은 기록ID의 기존 행을 모두 지웁니다(수정·삭제 반영). */
function removeRows(sheet, id) {
  const last = sheet.getLastRow();
  if (last < 2) return;
  const ids = sheet.getRange(2, 1, last - 1, 1).getValues();
  for (let i = ids.length - 1; i >= 0; i--) {
    if (String(ids[i][0]) === String(id)) sheet.deleteRow(i + 2);
  }
}

/* 거래 한 건을 상품 줄 수만큼 행으로 씁니다. */
function appendRows(sheet, op, device) {
  const lines = op.lines || [];
  if (!lines.length) return;
  const wd = weekday(op.date);
  const rows = lines.map(function (l) {
    return [op.id, op.date, wd, op.time, device, l.team || '', l.nm || l.id, l.pr, l.qty, l.pr * l.qty];
  });
  sheet.getRange(sheet.getLastRow() + 1, 1, rows.length, HEADER.length).setValues(rows);
}

function weekday(dateStr) {
  const p = String(dateStr).split('-');
  if (p.length !== 3) return '';
  return WD[new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2])).getDay()];
}

function json(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj))
    .setMimeType(ContentService.MimeType.JSON);
}
