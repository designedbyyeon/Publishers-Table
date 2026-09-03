/* 상품 목록 — 가격이나 상품이 바뀌면 이 파일만 고치면 됩니다. */
window.TEAMS = [
  { key:'t1', name:'글자취미팀', items:[
    { id:'g1', nm:'글자취미 1권',        pr:37000, main:true },
    { id:'g2', nm:'글자취미 디지털 USB', pr:30000 },
    { id:'g3', nm:'얼마나 오렌지',       pr:25000 },
    { id:'g4', nm:'오렌지 엽서 3종세트', pr:3000  }
  ]},
  { key:'t2', name:'한주한자팀', items:[
    { id:'h1', nm:'한주한자 아카이빙북', pr:30000, main:true },
    { id:'h2', nm:'노트북 스티커',       pr:3000  },
    { id:'h3', nm:'용어 정리집',         pr:15000 },
    { id:'h4', nm:'로고 스티커',         pr:2000  },
    { id:'h5', nm:'책갈피',              pr:6000  }
  ]}
];

window.CATALOG = {};
window.TEAMS.forEach(t => t.items.forEach(i => {
  window.CATALOG[i.id] = Object.assign({ team:t.key, teamName:t.name }, i);
}));

window.TEAM_NAME = { t1:'글자취미', t2:'한주한자' };

window.won = n => (n || 0).toLocaleString('ko-KR');
