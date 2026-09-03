/* 구글 시트 연동 — 저장은 항상 폰에 먼저, 전송은 뒤따라갑니다.
   네트워크가 끊겨도 판매는 계속 기록되고, 연결이 돌아오면 밀린 것만 보냅니다. */
window.Sync = (function(){
  const CFG = 'booth-sync-v1';

  function config(){
    try {
      const raw = localStorage.getItem(CFG);
      const c = raw ? JSON.parse(raw) : {};
      return {
        url: c.url || '',
        secret: c.secret || '',
        device: c.device || '',
        enabled: c.url ? (c.enabled !== false) : false
      };
    } catch(e){ return { url:'', secret:'', device:'', enabled:false }; }
  }

  function setConfig(patch){
    const next = Object.assign(config(), patch);
    try { localStorage.setItem(CFG, JSON.stringify(next)); } catch(e){}
    return next;
  }

  /* 상태 구독 — UI가 여기에 붙습니다. */
  const listeners = [];
  let state = { busy:false, lastOk:null, lastError:null };
  function onChange(fn){ listeners.push(fn); fn(status()); }
  function emit(){ const s = status(); listeners.forEach(fn => fn(s)); }
  function status(){
    return {
      enabled: config().enabled,
      pending: Store.pendingOps().length,
      busy: state.busy,
      lastOk: state.lastOk,
      lastError: state.lastError,
      online: navigator.onLine !== false
    };
  }

  function post(payload){
    const c = config();
    /* text/plain 으로 보내면 프리플라이트 없이 Apps Script 가 받습니다. */
    return fetch(c.url, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain;charset=utf-8' },
      body: JSON.stringify(payload),
      redirect: 'follow'
    }).then(r => r.json());
  }

  /* 연결 확인 — 시트 쪽 doGet 응답을 봅니다. */
  function test(url){
    const target = url || config().url;
    if (!target) return Promise.reject(new Error('주소가 비어 있습니다'));
    return fetch(target, { redirect:'follow' })
      .then(r => r.json())
      .then(j => {
        if (!j || !j.ok) throw new Error((j && j.error) || '시트가 응답하지 않았습니다');
        return j;
      });
  }

  /* 초대 링크(#setup=...)로 열면 주소를 물어보지 않고 바로 연결합니다. */
  function applyLink(){
    const h = (location.hash || '').replace(/^#/, '');
    if (h.indexOf('setup=') < 0) return false;
    let url = '', secret = '';
    try {
      const q = new URLSearchParams(h);
      url = (q.get('setup') || '').trim();
      secret = (q.get('k') || '').trim();
    } catch(e){ return false; }
    if (!url || url.indexOf('/exec') < 0) return false;

    setConfig({ url, secret, enabled:true });
    /* 주소가 화면에 계속 남지 않도록 해시를 지웁니다. */
    try { history.replaceState(null, '', location.pathname + location.search); }
    catch(e){ location.hash = ''; }
    return true;
  }

  /* 팀원에게 보낼 초대 링크 */
  function inviteLink(page){
    const c = config();
    if (!c.url) return '';
    const base = location.origin + location.pathname.replace(/[^/]*$/, '') + (page || 'index.html');
    let q = 'setup=' + encodeURIComponent(c.url);
    if (c.secret) q += '&k=' + encodeURIComponent(c.secret);
    return base + '#' + q;
  }

  let inFlight = null;

  function flush(){
    const c = config();
    if (!c.enabled || !c.url) return Promise.resolve({ skipped:true });
    if (inFlight) return inFlight;

    const ops = Store.pendingOps();
    if (!ops.length){
      state.lastError = null;
      emit();
      return Promise.resolve({ sent:0 });
    }

    state.busy = true; emit();

    /* 한 번에 너무 많이 보내지 않도록 나눠 보냅니다. */
    const batch = ops.slice(0, 40);

    inFlight = post({
      secret: c.secret,
      device: c.device || '이름없는 기기',
      ops: batch
    }).then(res => {
      if (!res || !res.ok) throw new Error((res && res.error) || '시트가 저장을 거부했습니다');
      Store.markSynced(batch);
      state.lastOk = Date.now();
      state.lastError = null;
      return { sent: batch.length };
    }).catch(err => {
      /* 실패해도 폰의 기록은 그대로 남습니다. 다음 기회에 다시 보냅니다. */
      state.lastError = err && err.message ? err.message : '전송 실패';
      return { sent:0, error: state.lastError };
    }).then(r => {
      state.busy = false;
      inFlight = null;
      emit();
      /* 아직 남았으면 이어서 */
      if (r.sent && Store.pendingOps().length) setTimeout(flush, 400);
      return r;
    });

    return inFlight;
  }

  /* 자동 전송: 화면을 열 때, 네트워크가 돌아올 때, 그리고 주기적으로 */
  function start(){
    const linked = applyLink();
    if (!config().enabled) return;
    if (linked) emit();
    flush();
    window.addEventListener('online', flush);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) flush();
    });
    setInterval(() => { if (navigator.onLine !== false) flush(); }, 45000);
  }

  return { config, setConfig, test, flush, start, onChange, status, applyLink, inviteLink };
})();
