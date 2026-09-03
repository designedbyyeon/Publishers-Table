/* 판매 기록 저장소 — 브라우저 localStorage에 쌓입니다. */
window.Store = (function(){
  const KEY = 'booth-records-v1';

  function read(){
    try {
      const raw = localStorage.getItem(KEY);
      if (!raw) return { v:1, records:[] };
      const s = JSON.parse(raw);
      if (!s || !Array.isArray(s.records)) return { v:1, records:[] };
      return s;
    } catch(e){ return { v:1, records:[] }; }
  }

  function write(state){
    try { localStorage.setItem(KEY, JSON.stringify(state)); return true; }
    catch(e){ return false; }
  }

  /* 로컬 기준 날짜 문자열. toISOString은 UTC로 밀리므로 직접 조립합니다. */
  function dateKey(d){
    const p = n => String(n).padStart(2,'0');
    return d.getFullYear() + '-' + p(d.getMonth()+1) + '-' + p(d.getDate());
  }
  function timeKey(d){
    const p = n => String(n).padStart(2,'0');
    return p(d.getHours()) + ':' + p(d.getMinutes());
  }

  const WD = ['일','월','화','수','목','금','토'];
  function weekday(dateStr){
    const p = dateStr.split('-').map(Number);
    return WD[new Date(p[0], p[1]-1, p[2]).getDay()];
  }
  function shortDate(dateStr){
    const p = dateStr.split('-').map(Number);
    return p[1] + '/' + p[2] + ' ' + weekday(dateStr);
  }

  function newId(){
    return 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2,7);
  }

  /* lines: [{id, qty}] — 판매 시점의 단가를 함께 저장해 나중에 가격이 바뀌어도 과거 기록이 흔들리지 않게 합니다. */
  function add(lines){
    const now = new Date();
    const rec = {
      id: newId(),
      date: dateKey(now),
      time: timeKey(now),
      ts: now.getTime(),
      lines: lines.map(l => ({
        id: l.id,
        qty: l.qty,
        pr: (window.CATALOG[l.id] || {}).pr || 0
      }))
    };
    const s = read();
    s.records.push(rec);
    return write(s) ? rec : null;
  }

  function all(){
    return read().records.slice().sort((a,b) => b.ts - a.ts);
  }

  function update(id, patch){
    const s = read();
    const i = s.records.findIndex(r => r.id === id);
    if (i < 0) return false;
    s.records[i] = Object.assign({}, s.records[i], patch);
    s.records[i].lines = s.records[i].lines.filter(l => l.qty > 0);
    write(s);
    return true;
  }

  function remove(id){
    const s = read();
    s.records = s.records.filter(r => r.id !== id);
    write(s);
    return true;
  }

  function clearAll(){
    write({ v:1, records:[] });
  }

  function recTotal(rec){
    return rec.lines.reduce((sum, l) => sum + l.pr * l.qty, 0);
  }
  function recCount(rec){
    return rec.lines.reduce((sum, l) => sum + l.qty, 0);
  }

  /* 날짜별 묶음 — 최신 날짜가 앞으로 */
  function byDate(){
    const map = {};
    all().forEach(r => { (map[r.date] = map[r.date] || []).push(r); });
    return Object.keys(map).sort().reverse().map(date => ({
      date: date,
      label: shortDate(date),
      records: map[date]
    }));
  }

  /* 기록 묶음의 집계 */
  function summarize(records){
    const perItem = {};
    const perTeam = { t1:0, t2:0 };
    let total = 0, count = 0;

    records.forEach(r => {
      r.lines.forEach(l => {
        const info = window.CATALOG[l.id];
        const amt = l.pr * l.qty;
        if (!perItem[l.id]) perItem[l.id] = { id:l.id, qty:0, amt:0, pr:l.pr };
        perItem[l.id].qty += l.qty;
        perItem[l.id].amt += amt;
        total += amt;
        count += l.qty;
        if (info) perTeam[info.team] += amt;
      });
    });

    const items = Object.keys(window.CATALOG)
      .filter(id => perItem[id])
      .map(id => Object.assign({}, perItem[id], {
        nm: window.CATALOG[id].nm,
        team: window.CATALOG[id].team
      }));

    return { total, count, sales: records.length, perTeam, items };
  }

  function todaySummary(){
    const today = dateKey(new Date());
    return summarize(all().filter(r => r.date === today));
  }

  return {
    add, all, update, remove, clearAll,
    byDate, summarize, todaySummary,
    recTotal, recCount,
    dateKey, timeKey, weekday, shortDate
  };
})();
