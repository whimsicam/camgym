'use strict';

/* ==========================================================================
   CAM Gym — logica dell'app (vanilla JS, nessuna dipendenza).
   Tutti i contenuti del programma arrivano da programma.json.
   ========================================================================== */

const K = {
  programma: 'camgym.programma',
  logs: 'camgym.logs',
  peso: 'camgym.peso',
  coda: 'camgym.coda',
  corrente: 'camgym.sessioneCorrente',
  impostazioni: 'camgym.impostazioni',
  versioneVista: 'camgym.versioneVista',
  pesiProgramma: 'camgym.pesiProgramma',
};

const S = {
  prog: null,
  logs: {},        // nome file -> log
  peso: {},        // AAAA-MM-GG -> { data, kg }
  coda: [],        // file in attesa di sincronizzazione
  cur: null,       // sessione in corso
  vista: 'home',
  storico: false,
  coachAperto: false,
  aggiornato: false,
  aggiungi: null,  // bozza "+ aggiungi esercizio"
  sync: { stato: 'idle', msg: '' },
  impMsg: '',
};

/* ---------- localStorage ---------- */

function leggi(k, def) {
  try { const v = localStorage.getItem(k); return v ? JSON.parse(v) : def; } catch { return def; }
}
function scrivi(k, v) {
  try { localStorage.setItem(k, JSON.stringify(v)); } catch (e) { console.warn('localStorage', e); }
}
function salvaCur() { if (S.cur) scrivi(K.corrente, S.cur); else localStorage.removeItem(K.corrente); }

/* ---------- formati ---------- */

const pad = n => String(n).padStart(2, '0');
function dataLocale(d = new Date()) {
  d = new Date(d);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
function isoLocale(ms) {
  const d = new Date(ms);
  const off = -d.getTimezoneOffset(), a = Math.abs(off);
  return `${dataLocale(d)}T${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}` +
    `${off >= 0 ? '+' : '-'}${pad(Math.floor(a / 60))}:${pad(a % 60)}`;
}
function parseData(s) { const [y, m, g] = s.slice(0, 10).split('-').map(Number); return new Date(y, m - 1, g); }
function lunedi(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  x.setDate(x.getDate() - (x.getDay() + 6) % 7);
  return x;
}
function giorniFa(data) { return Math.round((parseData(dataLocale()) - parseData(data)) / 86400000); }
function quando(data) {
  if (!data) return 'MAI';
  const n = giorniFa(data);
  return n <= 0 ? 'OGGI' : n === 1 ? 'IERI' : `${n} GG FA`;
}
function ggmm(data) { return `${data.slice(8, 10)}/${data.slice(5, 7)}`; }

function num(n, dec = 2) {
  if (n == null || n === '' || !isFinite(n)) return '';
  return Number(n).toLocaleString('it-IT', { maximumFractionDigits: dec });
}
function parseNum(s) {
  if (s == null) return null;
  s = String(s).trim().replace(',', '.');
  if (s === '') return null;
  const n = parseFloat(s);
  return isFinite(n) ? n : null;
}
const arrot = n => Math.round(n * 100) / 100;
function mmss(sec) {
  sec = Math.max(0, Math.round(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec % 3600 / 60), s = sec % 60;
  return h ? `${h}:${pad(m)}:${pad(s)}` : `${pad(m)}:${pad(s)}`;
}
function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
function slug(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'esercizio';
}

/* ---------- programma ---------- */

const sessioni = () => S.prog?.sessioni || [];
const sessione = id => sessioni().find(s => s.id === id);
const regole = () => S.prog?.regole || {};
const ordine = () => regole().ordine_sessioni || sessioni().filter(s => !s.opzionale).map(s => s.id);

function faseAttiva() {
  const f = S.prog?.fase;
  if (!f || !f.dal || !f.al) return null;
  const oggi = dataLocale();
  return oggi >= f.dal && oggi <= f.al ? f : null;
}

// Definizione aggiornata di un esercizio della sessione in corso:
// si rilegge dal programma (così cue e testi cambiati arrivano subito), con la copia salvata come riserva.
function defDi(e) {
  if (e.extra) return e.def;
  return sessione(S.cur?.sessione)?.esercizi.find(x => x.id === e.previsto) || e.def;
}
function nomeDi(e) {
  const d = defDi(e);
  if (e.extra) return d.nome;
  return e.alt ? (d.alternativa?.nome || e.nome) : d.nome;
}

// Registro dei peso_kg visti nel programma, per sapere quando Claude ne ha cambiato uno.
// Prima volta che si vede un valore: vale la data "aggiornato"; cambio rilevato dopo: vale il momento del rilevamento.
function registraPesiProgramma(p) {
  const reg = leggi(K.pesiProgramma, {});
  const primo = p.aggiornato ? parseData(p.aggiornato).getTime() : 0;
  for (const s of p.sessioni || []) for (const e of s.esercizi || []) {
    const k = `${s.id}/${e.id}`, kg = e.peso_kg ?? null;
    if (!reg[k]) reg[k] = { kg, da: primo };
    else if (reg[k].kg !== kg) reg[k] = { kg, da: Math.max(Date.now(), primo) };
  }
  scrivi(K.pesiProgramma, reg);
}

/* ---------- log e progressione ---------- */

const tempoLog = l => Date.parse(l.inizio) || (l.data ? parseData(l.data).getTime() : 0);
function logsOrdinati() { return Object.values(S.logs).sort((a, b) => tempoLog(b) - tempoLog(a)); }

function ultimoEsercizio(id) {
  for (const l of logsOrdinati()) {
    const e = (l.esercizi || []).find(x => x.id === id && x.serie && x.serie.length);
    if (e) return { log: l, es: e };
  }
  return null;
}

function incremento(d) {
  const inc = regole().incremento_kg || {};
  return d.carico === 'assistito' || d.carico === 'corpo_libero' ? inc[d.carico] : inc[d.tipo];
}

function caricoDiLavoro(d, serie) {
  const kgs = serie.map(s => s.kg).filter(k => k != null);
  if (!kgs.length) return null;
  return d.carico === 'assistito' ? Math.min(...kgs) : Math.max(...kgs);
}

function suggerisci(sid, d, id) {
  const principale = id === d.id;
  const pesoProg = principale ? (d.peso_kg ?? null) : null;
  const u = ultimoEsercizio(id);
  if (!u) return { kg: pesoProg, su: false };
  if (principale) {
    const reg = leggi(K.pesiProgramma, {})[`${sid}/${d.id}`];
    const daProg = reg ? reg.da : (S.prog.aggiornato ? parseData(S.prog.aggiornato).getTime() : 0);
    if (daProg > tempoLog(u.log)) return { kg: pesoProg, su: false };
  }
  const kg = caricoDiLavoro(d, u.es.serie);
  if (kg == null) return { kg: pesoProg, su: false };
  const tutteMax = u.es.serie.length >= d.serie && u.es.serie.every(s => (s.rip ?? 0) >= d.rip_max);
  const f = faseAttiva();
  const inc = incremento(d);
  if (tutteMax && inc && !(f && f.tipo === 'ripartenza')) {
    return { kg: arrot(d.carico === 'assistito' ? Math.max(0, kg - inc) : kg + inc), su: true };
  }
  return { kg, su: false };
}

function rirDefault(d) {
  const f = faseAttiva();
  if (f && f.rir_target != null) return Math.min(4, Number(f.rir_target));
  const t = regole().rir_target?.[d.tipo];
  if (t == null) return null;
  const n = String(t).match(/\d+/g);
  return n ? Math.min(4, Math.max(...n.map(Number))) : null;
}

function unitaTxt(d) { return d.unita === 'sec' ? ' sec' : d.unita === 'min' ? ' min' : ''; }
function caricoTxt(d, kg) {
  if (d.tipo === 'cardio') return '';
  if (d.carico === 'assistito') return kg == null ? 'assistenza: calibra' : `assistenza ${num(kg)} kg`;
  if (d.carico === 'corpo_libero') return kg ? `+${num(kg)} kg` : 'corpo libero';
  return kg == null ? 'calibra' : `${num(kg)} kg`;
}
function targetTxt(d, kg) {
  const c = caricoTxt(d, kg);
  return `${d.serie} × ${d.rip_min}–${d.rip_max}${unitaTxt(d)}${c ? ' · ' + c : ''}`;
}
function ultimaTxt(d, id) {
  const u = ultimoEsercizio(id);
  if (!u) return 'prima volta';
  const ss = u.es.serie;
  const kgs = [...new Set(ss.map(s => s.kg).filter(k => k != null))];
  let c = '';
  if (d.tipo !== 'cardio') {
    const kgStr = kgs.length ? kgs.map(k => num(k)).join('/') : null;
    if (d.carico === 'assistito') c = kgStr ? `assistenza ${kgStr} kg` : '';
    else if (d.carico === 'corpo_libero') c = kgs.some(k => k > 0) ? `+${kgStr} kg` : 'corpo libero';
    else c = kgStr ? `${kgStr} kg` : '';
  }
  const rirs = [...new Set(ss.map(s => s.rir).filter(r => r != null))];
  const rir = rirs.length ? `RIR ${rirs.map(r => r >= 4 ? '4+' : r).join('/')}` : '';
  return [`${ss.length} × ${ss.map(s => s.rip).join(', ')}${unitaTxt(d)}`, c, rir, ggmm(u.log.data)]
    .filter(Boolean).join(' · ');
}

/* ---------- statistiche settimanali ---------- */

function statsSettimana(lun) {
  const fine = new Date(lun); fine.setDate(fine.getDate() + 7);
  const ord = ordine();
  const opz = sessioni().filter(s => s.opzionale).map(s => s.id);
  const serieTot = ord.reduce((a, id) => a + (sessione(id)?.esercizi || []).reduce((b, e) => b + e.serie, 0), 0);
  let sess = 0, serie = 0, cardio = 0;
  for (const l of Object.values(S.logs)) {
    if (!l.data) continue;
    const d = parseData(l.data);
    if (d < lun || d >= fine) continue;
    if (ord.includes(l.sessione)) {
      sess++;
      serie += (l.esercizi || []).filter(e => e.previsto).reduce((a, e) => a + (e.serie?.length || 0), 0);
    } else if (opz.includes(l.sessione)) cardio++;
  }
  return { sess, sessTot: ord.length, serie, serieTot, cardio, cardioTot: 2 };
}

// Settimana 1 = la settimana (lun–dom) del primo allenamento registrato.
function numeroSettimana() {
  const date = Object.values(S.logs).map(l => l.data).filter(Boolean).sort();
  if (!date.length) return 1;
  return Math.round((lunedi(new Date()) - lunedi(parseData(date[0]))) / (7 * 86400000)) + 1;
}

function ultimaData(sid) { return logsOrdinati().find(l => l.sessione === sid)?.data || null; }

function prossimaSessione() {
  const ord = ordine();
  const ult = logsOrdinati().find(l => ord.includes(l.sessione));
  if (!ult) return ord[0];
  return ord[(ord.indexOf(ult.sessione) + 1) % ord.length];
}

/* ---------- sessione in corso ---------- */

function creaEsercizio(sid, d, alt = false) {
  const id = alt ? d.alternativa.id : d.id;
  const sugg = suggerisci(sid, d, id);
  const rir = rirDefault(d);
  return {
    previsto: d.id, id, alt, nome: alt ? d.alternativa.nome : d.nome, def: d,
    sugg, fatto: false, note: '',
    serie: Array.from({ length: d.serie }, () => ({ kg: sugg.kg, rip: d.rip_max, rir, fatta: false, t: null })),
  };
}

function nuovaSessione(sid) {
  const s = sessione(sid);
  S.cur = {
    sessione: sid, versione: S.prog.versione, inizio: Date.now(),
    esercizi: s.esercizi.map(d => creaEsercizio(sid, d)),
    timer: null, energia: null, note: '',
  };
  salvaCur();
}

function apriSessione(sid) {
  if (S.cur && S.cur.sessione !== sid) {
    const n = sessione(S.cur.sessione)?.nome || S.cur.sessione;
    if (!confirm(`C'è una sessione ${n} in corso. Abbandonarla e iniziare ${sessione(sid).nome}?`)) return;
    S.cur = null;
  }
  if (!S.cur) nuovaSessione(sid);
  vai('sessione');
}

function contaSerie() {
  let fatte = 0, tot = 0;
  for (const e of S.cur.esercizi) { tot += e.serie.length; fatte += e.serie.filter(s => s.fatta).length; }
  return { fatte, tot };
}

function volume() {
  let v = 0;
  for (const e of S.cur.esercizi) {
    const d = defDi(e);
    if (d.unita !== 'rip' || d.carico === 'assistito') continue;
    for (const s of e.serie) if (s.fatta && s.kg) v += s.kg * (s.rip || 0);
  }
  return v;
}

function recuperoMedio() {
  const ts = S.cur.esercizi.flatMap(e => e.serie.filter(s => s.fatta && s.t).map(s => s.t)).sort((a, b) => a - b);
  const gaps = [];
  for (let i = 1; i < ts.length; i++) { const g = ts[i] - ts[i - 1]; if (g > 0 && g < 15 * 60000) gaps.push(g); }
  return gaps.length ? gaps.reduce((a, b) => a + b, 0) / gaps.length / 1000 : null;
}

function recuperoDopo(ei, si) {
  const e = S.cur.esercizi[ei], d = defDi(e), R = regole().recupero_sec || {};
  if (d.superset) {
    const membri = S.cur.esercizi.filter(x => defDi(x).superset === d.superset);
    return membri.every(m => !m.serie[si] || m.serie[si].fatta) ? (R.superset || 0) : 0;
  }
  return R[d.tipo] || 0;
}

/* ---------- timer di recupero ---------- */

let audioCtx = null;
function sbloccaAudio() {
  try {
    if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch { /* niente audio */ }
}
function bip() {
  if (!audioCtx) return;
  const t = audioCtx.currentTime;
  [0, 0.22].forEach(dt => {
    const o = audioCtx.createOscillator(), g = audioCtx.createGain();
    o.type = 'sine'; o.frequency.value = 880;
    g.gain.setValueAtTime(0.0001, t + dt);
    g.gain.exponentialRampToValueAtTime(0.35, t + dt + 0.02);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dt + 0.16);
    o.connect(g).connect(audioCtx.destination);
    o.start(t + dt); o.stop(t + dt + 0.18);
  });
}
function flash() {
  const f = document.getElementById('flash');
  f.classList.remove('on'); void f.offsetWidth; f.classList.add('on');
  if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
}
function avviaTimer(sec) {
  S.cur.timer = { fine: Date.now() + sec * 1000, durata: sec, avvisato: false };
}
function restoTimer() { return S.cur?.timer ? (S.cur.timer.fine - Date.now()) / 1000 : 0; }

function tick() {
  if (!S.cur) return;
  if (S.vista === 'sessione' || S.vista === 'chiusura') {
    const el = document.getElementById('m-durata');
    if (el) el.textContent = mmss((Date.now() - S.cur.inizio) / 1000);
  }
  const t = S.cur.timer;
  if (!t) return;
  const r = restoTimer();
  if (r <= 0 && !t.avvisato) { t.avvisato = true; salvaCur(); bip(); flash(); }
  if (r <= -8) { S.cur.timer = null; salvaCur(); if (S.vista === 'sessione') render(); return; }
  const v = document.getElementById('t-val');
  if (v) {
    v.textContent = r > 0 ? mmss(Math.ceil(r)) : '00:00';
    document.getElementById('t-lbl').textContent = r > 0 ? 'RECUPERO ATTIVO' : 'RECUPERO FINITO';
    const ring = document.getElementById('t-ring');
    const C = 2 * Math.PI * 21;
    ring.setAttribute('stroke-dashoffset', (C * (1 - Math.max(0, r) / t.durata)).toFixed(2));
  }
}

/* ---------- SVG ---------- */

const ARTE = {
  armor: '<path d="M16 3L6 7V15C6 21.5 10.3 27.5 16 29C21.7 27.5 26 21.5 26 15V7L16 3Z"/><path d="M16 6V26"/><path d="M9 13H23"/><circle cx="16" cy="13" r="2"/>',
  roots: '<line x1="16" x2="16" y1="4" y2="18"/><line x1="16" x2="8" y1="18" y2="28"/><line x1="16" x2="24" y1="18" y2="28"/><line x1="12" x2="14" y1="23" y2="28"/><line x1="20" x2="18" y1="23" y2="28"/><circle cx="16" cy="4" r="1.5"/><line stroke-dasharray="2 2" x1="5" x2="27" y1="28" y2="28"/>',
  guns: '<line x1="10" x2="22" y1="16" y2="16"/><rect height="12" rx="0.5" width="3" x="7" y="10"/><rect height="8" rx="0.5" width="3" x="4" y="12"/><rect height="12" rx="0.5" width="3" x="22" y="10"/><rect height="8" rx="0.5" width="3" x="25" y="12"/>',
  wings: '<g><path d="M15 13C11 8 6 6.5 2.5 7.5C4.5 10.5 7.5 12.5 11 13.5C8 14 5.5 15.5 3.5 17.5C7 18.5 10.5 17.5 13 16C11 18 10 20.5 9.5 23C12.5 21.5 14.5 19 15 16"/></g><g transform="matrix(-1 0 0 1 32 0)"><path d="M15 13C11 8 6 6.5 2.5 7.5C4.5 10.5 7.5 12.5 11 13.5C8 14 5.5 15.5 3.5 17.5C7 18.5 10.5 17.5 13 16C11 18 10 20.5 9.5 23C12.5 21.5 14.5 19 15 16"/></g><line x1="16" x2="16" y1="10" y2="25" stroke-dasharray="1.5 1.5"/>',
  breathe: '<path d="M2 15C5 10 8 10 11 15S17 20 20 15S26 10 30 15"/><path d="M2 21C5 17.5 8 17.5 11 21S17 24.5 20 21S26 17.5 30 21" stroke-dasharray="2 2"/>',
};
const arte = (id, cls = 'art') =>
  `<svg class="${cls}" viewBox="0 0 32 32" fill="none" stroke="currentColor" stroke-width="1" aria-hidden="true">${ARTE[id] || '<circle cx="16" cy="16" r="10"/>'}</svg>`;

const ICONA = {
  home: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><rect x="4" y="4" width="7" height="7"/><rect x="13" y="4" width="7" height="7"/><rect x="4" y="13" width="7" height="7"/><rect x="13" y="13" width="7" height="7"/></svg>',
  gear: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="12" cy="12" r="3"/><path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1"/></svg>',
  back: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.4" aria-hidden="true"><path d="M20 12H5M11 6l-6 6 6 6"/></svg>',
  check: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true"><path d="M6 12.5l4 4 8-9"/></svg>',
  clessidra: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M7 3h10M7 21h10M8 3c0 5 8 5 8 9s-8 4-8 9M16 3c0 5-8 5-8 9s8 4 8 9"/></svg>',
  sveglia: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="12" cy="13" r="7"/><path d="M12 9v4l3 2M4 5l3-2M20 5l-3-2"/></svg>',
  lista: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><circle cx="5" cy="6" r="1"/><circle cx="5" cy="12" r="1"/><circle cx="5" cy="18" r="1"/><path d="M9 6h11M9 12h11M9 18h11"/></svg>',
  cestino: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.2" aria-hidden="true"><path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 11v6M14 11v6"/></svg>',
};

function arco(r, p, c) {
  if (p <= 0) return '';
  if (p >= 0.9999) return `M ${c} ${c - r} A ${r} ${r} 0 1 1 ${c} ${c + r} A ${r} ${r} 0 1 1 ${c} ${c - r}`;
  const a = p * 2 * Math.PI;
  return `M ${c} ${c - r} A ${r} ${r} 0 ${p > 0.5 ? 1 : 0} 1 ${(c + r * Math.sin(a)).toFixed(2)} ${(c - r * Math.cos(a)).toFixed(2)}`;
}
const quota = (a, b) => b ? Math.min(1, a / b) : 0;

// Tre anelli concentrici: esterno sessioni (spesso), medio serie (sottile), interno cardio (tratteggiato).
function anelli(st) {
  const p = [quota(st.sess, st.sessTot), quota(st.serie, st.serieTot), quota(st.cardio, st.cardioTot)];
  return `<svg viewBox="0 0 120 120" fill="none" aria-hidden="true">
    <circle cx="60" cy="60" r="52" stroke="var(--line)" stroke-width="1" stroke-dasharray="2 2"/>
    <circle cx="60" cy="60" r="40" stroke="var(--line)" stroke-width="1"/>
    <circle cx="60" cy="60" r="28" stroke="var(--line)" stroke-width="1" stroke-dasharray="3 3"/>
    <path d="${arco(52, p[0], 60)}" stroke="var(--ink)" stroke-width="3" stroke-linecap="round"/>
    <path d="${arco(40, p[1], 60)}" stroke="var(--ink)" stroke-width="1.5"/>
    <path d="${arco(28, p[2], 60)}" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="4 2"/>
  </svg>`;
}

function anelloPiccolo(p, cls = 'ring-s') {
  const C = 2 * Math.PI * 19;
  return `<span class="${cls}"><svg viewBox="0 0 44 44" fill="none" aria-hidden="true">
    <circle cx="22" cy="22" r="19" stroke="var(--line)" stroke-width="1"/>
    <path d="${arco(19, p, 22)}" stroke="var(--ink)" stroke-width="1.5"/>
  </svg><b id="m-ring-t">${Math.round(p * 100)}%</b></span>`;
}

/* ---------- componenti ---------- */

function pill(on, act, e) {
  return `<button class="pill ${on ? 'on' : ''}" role="switch" aria-checked="${on}" data-act="${act}" data-e="${e}">
    <span class="pill-t">${on ? 'ON' : 'OFF'}</span><span class="pill-k"></span></button>`;
}

function statoSync() {
  if (!syncPronto()) return { dot: 'off', txt: S.coda.length ? `${S.coda.length} IN CODA · NON CONFIGURATO` : 'NON CONFIGURATO' };
  if (S.sync.stato === 'sync') return { dot: 'blink', txt: 'IN CORSO…' };
  if (S.coda.length) return { dot: 'blink', txt: `${S.coda.length} IN CODA` };
  if (S.sync.stato === 'errore') return { dot: 'off', txt: 'ERRORE' };
  return { dot: 'on', txt: 'OK' };
}

function tabbar(attiva) {
  return `<nav class="tabbar">
    <button class="tab ${attiva === 'home' ? 'on' : ''}" data-act="home">${ICONA.home}<span>HOME</span></button>
    <button class="tab ${attiva === 'storico' ? 'on' : ''}" data-act="vai-storico">${ICONA.lista}<span>STORICO</span></button>
  </nav>`;
}

// Riga "sessione in corso" mostrata in home e nello storico, per riprenderla.
function bannerInCorso() {
  if (!S.cur) return '';
  const s = sessione(S.cur.sessione) || { nome: S.cur.sessione };
  const { fatte, tot } = contaSerie();
  return `<button class="card resume" data-act="apri" data-id="${S.cur.sessione}">
    ${arte(S.cur.sessione, 'art art-s')}
    <div class="grow"><div class="row-c"><span class="tag">IN CORSO</span><b class="body-b">${esc(s.nome.toUpperCase())}</b></div>
    <span class="lbl-m">${fatte}/${tot} SERIE · DALLE ${isoLocale(S.cur.inizio).slice(11, 16)}</span></div>
    <span class="chip ink">RIPRENDI</span>
  </button>`;
}

/* ---------- vista: home ---------- */

function vistaHome() {
  const p = S.prog;
  const lun = lunedi(new Date());
  const st = statsSettimana(lun);
  const sett = numeroSettimana();
  const prossima = prossimaSessione();
  const f = faseAttiva();
  const sy = statoSync();
  const principali = sessioni().filter(s => !s.opzionale);
  const opzionali = sessioni().filter(s => s.opzionale);
  const pct = n => `${Math.round(n * 100)}%`;

  const storico = S.storico ? `<div class="storico">
      ${Array.from({ length: 8 }, (_, i) => {
        const l = new Date(lun); l.setDate(l.getDate() - 7 * (7 - i));
        const s = statsSettimana(l);
        return `<div class="st-w ${i === 7 ? 'cur' : ''}">${anelli(s)}<span>${ggmm(dataLocale(l))}</span><span>${s.sess}/${s.sessTot}</span></div>`;
      }).join('')}
    </div>` : '';

  const card = (s, i) => {
    const inCorso = S.cur?.sessione === s.id;
    const next = S.cur ? inCorso : s.id === prossima;
    return `<button class="card mod ${next ? 'next' : ''}" data-act="apri" data-id="${s.id}">
      <div class="mod-top">${next ? `<span class="tag">${inCorso ? 'IN CORSO' : 'NEXT'}</span>` : `<span class="lbl-m">MOD_${pad(i + 1)}</span>`}${arte(s.id)}</div>
      <div class="mod-mid"><h2 class="h-md">${esc(s.nome)}</h2><p class="lbl-m clamp">${esc(s.focus)}</p></div>
      <div class="mod-foot"><span class="cap">${s.durata_min} MIN</span><span class="lbl-m">${quando(ultimaData(s.id))}</span></div>
    </button>`;
  };

  const pesoOggi = S.peso[dataLocale()];
  const pesi = Object.values(S.peso).filter(x => x.kg != null).sort((a, b) => a.data.localeCompare(b.data));
  const sette = pesi.filter(x => giorniFa(x.data) >= 0 && giorniFa(x.data) < 7);
  const media = sette.length ? sette.reduce((a, x) => a + x.kg, 0) / sette.length : null;
  const ultimo = pesi[pesi.length - 1], prec = pesi[pesi.length - 2];
  const delta = ultimo && prec ? ultimo.kg - prec.kg : null;

  return `
  <header class="top">
    <div class="top-l"><span class="lbl">CAM://SYS</span><span class="muted">•</span><h1 class="h-md">HOME</h1></div>
    <button class="ico-btn" data-act="impostazioni" aria-label="Impostazioni">${ICONA.gear}</button>
  </header>
  <main class="wrap">
    <div class="subbar">
      <div class="row-c"><span class="dot ${sy.dot}"></span><span class="lbl">LOG://ACTIVE_SYS</span></div>
      <span class="lbl-m">PROG_V${esc(p.versione)} · W-${pad(sett)}</span>
    </div>

    ${bannerInCorso()}

    ${S.aggiornato ? `<section class="card banner">
      <div class="row-b"><span class="tag">PROGRAMMA AGGIORNATO</span><span class="lbl-m">V${esc(p.versione)} · ${esc(p.aggiornato || '')}</span></div>
      ${p.messaggio_coach ? `<p class="body">${esc(p.messaggio_coach)}</p>` : ''}
      <button class="btn" data-act="aggiornato-ok">OK, VISTO</button>
    </section>` : ''}

    <section class="card telemetry">
      <div class="row-b hair"><span class="lbl-m">TELEMETRIA SETTIMANALE</span><span class="lbl">SETTIMANA ${sett}</span></div>
      <div class="tele">
        <button class="rings" data-act="storico" aria-label="Storico 8 settimane">
          ${anelli(st)}
          <span class="rings-c"><b>${st.sess}</b><span class="lbl-m">/ ${st.sessTot}</span></span>
        </button>
        <div class="legend">
          <div><span class="lbl-m"><i class="lg lg1"></i>SESSIONI</span><div class="row-b"><b>${st.sess} / ${st.sessTot}</b><span class="cap muted">${pct(quota(st.sess, st.sessTot))}</span></div></div>
          <div><span class="lbl-m"><i class="lg lg2"></i>SERIE</span><div class="row-b"><b>${st.serie} / ${st.serieTot}</b><span class="cap muted">${pct(quota(st.serie, st.serieTot))}</span></div></div>
          <div><span class="lbl-m"><i class="lg lg3"></i>CARDIO</span><div class="row-b"><b>${st.cardio} / ${st.cardioTot}</b><span class="cap muted">${pct(quota(st.cardio, st.cardioTot))}</span></div></div>
        </div>
      </div>
      ${storico}
      ${p.messaggio_coach ? `<button class="coach ${S.coachAperto ? 'open' : ''}" data-act="coach"><span class="tag">COACH</span><span class="coach-t">${esc(p.messaggio_coach)}</span></button>` : ''}
      ${f ? `<div class="fase"><span class="tag">${esc(String(f.tipo).toUpperCase())}</span><span class="cap">${esc(f.nota || '')}</span></div>` : ''}
    </section>

    <section class="mods">
      <div class="row-b px"><span class="lbl-m">MODULI D'ALLENAMENTO // CORPO</span><span class="lbl-m">SPLIT ${ordine().length}D</span></div>
      <div class="grid2">${principali.map(card).join('')}</div>
    </section>

    <section class="card table">
      ${opzionali.map(s => {
        const n = statsSettimana(lun).cardio;
        return `<button class="trow breathe" data-act="apri" data-id="${s.id}">
          ${arte(s.id, 'art art-s')}
          <div class="grow"><div class="row-c"><b class="body-b">${esc(s.nome.toUpperCase())}</b><span class="cap muted">· ${esc(s.focus.toLowerCase())}</span></div>
          <span class="lbl-m">OPZIONALE · ${s.durata_min} MIN · ${quando(ultimaData(s.id))} · ${n}/2 SETT.</span></div>
          <span class="chip">APRI</span>
        </button>`;
      }).join('')}
      <div class="trow peso">
        <div class="row-b"><span class="lbl-m">PESO DI STAMATTINA</span>${media != null ? `<span class="chip">MEDIA 7G ${num(media, 1)} kg</span>` : ''}</div>
        <div class="row-b peso-in">
          <label class="row-c base"><input id="peso-in" class="metric-in" type="text" inputmode="decimal" autocomplete="off" placeholder="${pesoOggi ? num(pesoOggi.kg, 1) : '—'}" value="${pesoOggi ? num(pesoOggi.kg, 1) : ''}" aria-label="Peso in kg"><span class="muted body">kg</span></label>
          <button class="btn sm" data-act="peso-salva">${pesoOggi ? 'AGGIORNA' : 'SALVA'}</button>
        </div>
        ${delta != null ? `<span class="cap muted">DELTA ${delta >= 0 ? '+' : '−'}${num(Math.abs(delta), 1)} kg dalla pesata del ${ggmm(prec.data)}</span>` : ''}
      </div>
    </section>

    <div class="foot">
      <div class="row-c"><span class="dot ${sy.dot}"></span><span class="lbl-m">SYNC: ${sy.txt}</span></div>
      <span class="lbl-m">PROG ${esc(p.aggiornato || '')}</span>
    </div>
  </main>
  ${tabbar('home')}`;
}

/* ---------- vista: sessione ---------- */

function gruppi() {
  const out = [], visti = new Set();
  S.cur.esercizi.forEach((e, i) => {
    const ss = defDi(e).superset;
    if (!ss) return out.push({ idx: [i] });
    if (visti.has(ss)) return;
    visti.add(ss);
    out.push({ superset: ss, idx: S.cur.esercizi.map((x, j) => defDi(x).superset === ss ? j : -1).filter(j => j >= 0) });
  });
  return out;
}

const TIPO = { multi: 'MULTIARTICOLARE', iso: 'ISOLAMENTO', addome: 'ADDOME', cardio: 'CARDIO', extra: 'EXTRA' };

function testaEsercizio(i, n, lettera) {
  const e = S.cur.esercizi[i], d = defDi(e);
  const altBtn = !e.extra && (d.alternativa || e.alt)
    ? `<button class="btn-sq" data-act="alt" data-e="${i}">${e.alt ? '[ ORIGINALE ]' : '[ ALTERNATIVA ]'}</button>` : '';
  return `
    <div class="ex-head">
      <div><div class="lbl-m">#${pad(n)} // ${e.extra ? 'EXTRA' : TIPO[d.tipo] || esc(d.tipo).toUpperCase()}${lettera ? ` · ${lettera}` : ''}</div>
      <h2 class="h-md up">${esc(nomeDi(e))}</h2>
      ${e.alt ? `<div class="lbl-m">AL POSTO DI: ${esc(d.nome)}</div>` : ''}</div>
      ${altBtn}
    </div>
    ${d.cue ? `<p class="cue">“${esc(d.cue)}”</p>` : ''}
    <div class="kv"><span class="lbl-m">TARGET</span><span class="body-b">${esc(targetTxt(d, e.sugg.kg))}</span>${e.sugg.su ? '<span class="tag sm">↑ SALI DI PESO</span>' : ''}</div>
    <div class="kv last"><span class="lbl-m">ULTIMA VOLTA</span><span class="cap">${esc(ultimaTxt(d, e.id))}</span></div>`;
}

function etichetteColonne(ds) {
  const c = new Set(ds.map(d => d.carico)), u = new Set(ds.map(d => d.unita));
  const kg = ds.every(d => d.tipo === 'cardio') ? '' : c.size > 1 ? 'KG' :
    c.has('assistito') ? 'ASSIST.' : c.has('corpo_libero') ? 'ZAVORRA' : 'KG';
  const rip = u.size > 1 ? 'RIP' : u.has('sec') ? 'SEC' : u.has('min') ? 'MIN' : 'RIP';
  const rir = ds.every(d => d.tipo === 'cardio') ? '' : 'RIR';
  return `<div class="set-h"><div class="set-g"><span>SET</span><span>${kg}</span><span>${rip}</span><span>${rir}</span></div><span class="set-h-ok">OK</span></div>`;
}

// Ogni card ha al massimo una serie "aperta" (quella che si modifica). Nei superset la card è una sola.
function chiaveCard(i) {
  const ss = defDi(S.cur.esercizi[i]).superset;
  return ss ? S.cur.esercizi.findIndex(x => defDi(x).superset === ss) : i;
}
function serieAperta(chiave, righe) {
  const sel = S.cur.sel?.[chiave];
  if (sel && righe.some(([i, r]) => `${i}:${r}` === sel)) return sel;
  const r = righe.find(([i, r]) => !S.cur.esercizi[i].serie[r].fatta);
  return r ? `${r[0]}:${r[1]}` : null;
}

function rigaSerie(i, si, etichetta, aperta) {
  const e = S.cur.esercizi[i], d = defDi(e), s = e.serie[si];
  const da = `data-e="${i}" data-s="${si}"`;
  const cardio = d.tipo === 'cardio';
  const kgTxt = cardio ? '' : s.kg == null ? 'calibra' : num(s.kg);
  const rirTxt = cardio ? '' : s.rir == null ? '—' : s.rir >= 4 ? '4+' : String(s.rir);
  const ripU = d.unita === 'sec' ? 'SEC' : d.unita === 'min' ? 'MIN' : 'RIP';
  const kgU = d.carico === 'assistito' ? 'KG ASSIST.' : d.carico === 'corpo_libero' ? 'KG ZAVORRA' : 'KG';

  if (!aperta) {
    return `<div class="set ${s.fatta ? 'done' : 'queued'}">
      <button class="set-g set-sum" data-act="apri-serie" ${da} aria-label="Modifica serie ${etichetta}">
        <span class="set-n">${etichetta}</span>
        <span class="${s.kg == null && !cardio ? 'cal' : ''}">${kgTxt}</span>
        <span>${s.rip ?? ''}</span>
        <span>${rirTxt}</span>
      </button>
      <button class="chk ${s.fatta ? 'on' : ''}" data-act="chk" ${da} aria-pressed="${s.fatta}" aria-label="Serie ${etichetta} fatta">${ICONA.check}</button>
    </div>`;
  }

  const box = (act, val, unit, input) => `
    <div class="box">
      <button class="bx" data-act="${act}" data-d="-1" ${da} aria-label="Meno">−</button>
      <div class="bx-v">${input || `<span class="bx-n">${val}</span>`}<span class="lbl-m">${unit}</span></div>
      <button class="bx" data-act="${act}" data-d="1" ${da} aria-label="Più">+</button>
    </div>`;
  const kgInput = `<input class="bx-n" type="text" inputmode="decimal" autocomplete="off" data-in="kg" ${da} value="${s.kg == null ? '' : num(s.kg)}" placeholder="calibra" aria-label="Kg serie ${etichetta}">`;

  return `<div class="set open ${s.fatta ? 'done' : ''}">
    <div class="row-b open-h"><span class="set-n">SERIE ${etichetta}</span><span class="lbl-m">${s.fatta ? 'FATTA · MODIFICA' : 'IN CORSO'}</span></div>
    <div class="boxes ${cardio ? 'one' : ''}">
      ${cardio ? '' : box('kg', '', kgU, kgInput)}
      ${box('rip', s.rip ?? '', ripU)}
    </div>
    ${cardio ? '' : `<div class="rir"><span class="lbl-m">RIR</span><div class="rir-g">${[0, 1, 2, 3, 4].map(v =>
      `<button class="rb ${s.rir === v ? 'on' : ''}" data-act="rir" data-v="${v}" ${da}>${v === 4 ? '4+' : v}</button>`).join('')}</div></div>`}
    ${s.fatta
      ? `<div class="open-f"><button class="btn ghost" data-act="chk" ${da}>ANNULLA SERIE</button><button class="btn inv" data-act="chiudi-serie" ${da}>OK</button></div>`
      : `<button class="btn inv wide-s" data-act="chk" ${da}>${ICONA.check}<span>SERIE FATTA</span></button>`}
  </div>`;
}

function piedeEsercizio(i, lettera) {
  const e = S.cur.esercizi[i];
  const f = e.serie.filter(s => s.fatta).length;
  return `
    <div class="ex-foot"><div class="row-c"><span class="lbl">${lettera ? lettera + ' · ' : ''}FATTO</span>${pill(e.fatto, 'fatto', i)}</div>
    <span class="lbl-m">${f}/${e.serie.length} SERIE</span></div>
    <label class="ex-note"><span class="lbl-m">NOTE:</span><textarea rows="1" data-in="note" data-e="${i}" placeholder="—">${esc(e.note)}</textarea></label>`;
}

function cardGruppo(g, nBase) {
  if (!g.superset) {
    const i = g.idx[0], e = S.cur.esercizi[i];
    const ap = serieAperta(i, e.serie.map((_, si) => [i, si]));
    return `<article class="card ex">
      ${testaEsercizio(i, nBase)}
      <div class="sets">${etichetteColonne([defDi(e)])}${e.serie.map((_, si) => rigaSerie(i, si, si + 1, ap === `${i}:${si}`)).join('')}</div>
      ${piedeEsercizio(i)}
    </article>`;
  }
  const L = 'ABCDEFG';
  const max = Math.max(...g.idx.map(i => S.cur.esercizi[i].serie.length));
  const righe = [];
  for (let r = 0; r < max; r++) g.idx.forEach((i, k) => { if (S.cur.esercizi[i].serie[r]) righe.push([i, r, L[k]]); });
  const ap = serieAperta(g.idx[0], righe);
  const giri = Array.from({ length: max }, (_, r) => g.idx.every(i => !S.cur.esercizi[i].serie[r] || S.cur.esercizi[i].serie[r].fatta)).filter(Boolean).length;
  return `<article class="card ex superset">
    <div class="row-b ss-h"><span class="tag">SUPERSET</span><span class="lbl-m">GIRO ${Math.min(giri + 1, max)}/${max} · RECUPERO ${regole().recupero_sec?.superset || 0}s A FINE GIRO</span></div>
    ${g.idx.map((i, k) => `<div class="ss-m">${testaEsercizio(i, nBase + k, L[k])}</div>`).join('')}
    <div class="sets">${etichetteColonne(g.idx.map(i => defDi(S.cur.esercizi[i])))}${righe.map(([i, r, l]) => rigaSerie(i, r, `${r + 1}${l}`, ap === `${i}:${r}`)).join('')}</div>
    ${g.idx.map((i, k) => piedeEsercizio(i, L[k])).join('')}
  </article>`;
}

function dock() {
  const t = S.cur.timer;
  if (!t) return '';
  const r = restoTimer(), C = 2 * Math.PI * 21;
  return `<div class="dock">
    <div class="dock-ring"><svg viewBox="0 0 48 48" fill="none" aria-hidden="true"><circle cx="24" cy="24" r="21" stroke="var(--line)" stroke-width="1"/>
      <circle id="t-ring" cx="24" cy="24" r="21" stroke="var(--ink)" stroke-width="1.5" stroke-dasharray="${C.toFixed(2)}" stroke-dashoffset="${(C * (1 - Math.max(0, r) / t.durata)).toFixed(2)}" transform="rotate(-90 24 24)"/></svg>${ICONA.clessidra}</div>
    <div class="dock-t"><span class="lbl-m" id="t-lbl">${r > 0 ? 'RECUPERO ATTIVO' : 'RECUPERO FINITO'}</span><span class="metric" id="t-val">${mmss(Math.ceil(Math.max(0, r)))}</span></div>
    <button class="btn-sq" data-act="t" data-d="-15">−15s</button>
    <button class="btn-sq" data-act="t" data-d="15">+15s</button>
    <button class="btn-sq" data-act="t-stop">STOP</button>
    <button class="btn-sq ios" data-act="t-ios" aria-label="Timer iPhone">${ICONA.sveglia}<span>IPHONE</span></button>
  </div>`;
}

function vistaSessione() {
  const s = sessione(S.cur.sessione) || { nome: S.cur.sessione, focus: '' };
  const { fatte, tot } = contaSerie();
  const rm = recuperoMedio();
  const f = faseAttiva();
  let n = 1;
  const cards = gruppi().map(g => { const h = cardGruppo(g, n); n += g.idx.length; return h; }).join('');
  const a = S.aggiungi;
  return `
  <header class="top">
    <div class="top-l"><button class="ico-btn plain" data-act="home" aria-label="Home">${ICONA.back}</button><h1 class="h-md">SESSIONE ${esc(s.nome.toUpperCase())}</h1></div>
    <div class="row-c"><span class="lbl-m">REC // LIVE</span><span class="dot blink"></span></div>
  </header>
  <main class="wrap sess ${S.cur.timer ? 'has-dock' : ''}">
    <div class="sess-meta">
      <div><div class="h-lg">${esc(s.nome)}</div><div class="lbl-m">${esc(s.focus)}</div></div>
      <div class="row-c"><div class="r-txt"><span class="lbl-m">COMPLETATO</span><span class="lbl" id="m-serie">${fatte} / ${tot} SERIE</span></div>${anelloPiccolo(quota(fatte, tot))}</div>
    </div>
    ${s.nota_sessione ? `<p class="nota"><span class="tag">NOTA</span> ${esc(s.nota_sessione)}</p>` : ''}
    ${f ? `<div class="fase"><span class="tag">${esc(String(f.tipo).toUpperCase())}</span><span class="cap">${esc(f.nota || '')} · RIR ${esc(f.rir_target ?? '')}</span></div>` : ''}
    <div class="metrics">
      <div><span class="lbl-m">VOLUME TOTALE</span><span class="metric" id="m-vol">${num(Math.round(volume()))} <small>KG</small></span></div>
      <div><span class="lbl-m">DURATA</span><span class="metric" id="m-durata">${mmss((Date.now() - S.cur.inizio) / 1000)}</span></div>
      <div><span class="lbl-m">RECUPERO MEDIO</span><span class="metric" id="m-rec">${rm == null ? '--:--' : mmss(rm)}</span></div>
    </div>
    ${cards}
    ${a ? `<section class="card ex addform">
      <div class="lbl">NUOVO ESERCIZIO · SOLO PER QUESTA SESSIONE</div>
      <label class="fld"><span class="lbl-m">NOME</span><input data-in="add" data-k="nome" type="text" value="${esc(a.nome)}" autocomplete="off"></label>
      <div class="grid3">
        <label class="fld"><span class="lbl-m">SERIE</span><input data-in="add" data-k="serie" type="text" inputmode="numeric" value="${esc(a.serie)}"></label>
        <label class="fld"><span class="lbl-m">RIP</span><input data-in="add" data-k="rip" type="text" inputmode="numeric" value="${esc(a.rip)}"></label>
        <label class="fld"><span class="lbl-m">KG</span><input data-in="add" data-k="kg" type="text" inputmode="decimal" value="${esc(a.kg)}"></label>
      </div>
      <div class="row-b"><button class="btn ghost" data-act="add-no">ANNULLA</button><button class="btn" data-act="add-ok">AGGIUNGI</button></div>
    </section>` : `<button class="btn wide" data-act="add">+ AGGIUNGI ESERCIZIO A SESSIONE ${esc(s.nome.toUpperCase())}</button>`}
    <button class="btn wide inv" data-act="chiudi">CHIUDI SESSIONE</button>
    <button class="link" data-act="abbandona">Elimina questa sessione senza salvarla</button>
  </main>
  ${dock()}
  ${tabbar('sessione')}`;
}

/* ---------- vista: chiusura ---------- */

function vistaChiusura() {
  const s = sessione(S.cur.sessione) || { nome: S.cur.sessione };
  const { fatte, tot } = contaSerie();
  const es = S.cur.esercizi.filter(e => e.fatto).length;
  return `
  <header class="top">
    <div class="top-l"><button class="ico-btn plain" data-act="torna" aria-label="Torna alla sessione">${ICONA.back}</button><h1 class="h-md">CHIUDI ${esc(s.nome.toUpperCase())}</h1></div>
    <span class="lbl-m">REC // STOP</span>
  </header>
  <main class="wrap">
    <section class="card">
      <div class="metrics in">
        <div><span class="lbl-m">DURATA</span><span class="metric" id="m-durata">${mmss((Date.now() - S.cur.inizio) / 1000)}</span></div>
        <div><span class="lbl-m">SERIE</span><span class="metric">${fatte}/${tot}</span></div>
        <div><span class="lbl-m">ESERCIZI</span><span class="metric">${es}/${S.cur.esercizi.length}</span></div>
      </div>
      <div class="row-b hair"><span class="lbl-m">VOLUME TOTALE</span><span class="body-b">${num(Math.round(volume()))} kg</span></div>
      <div class="row-b"><span class="lbl-m">INIZIO</span><span class="cap">${isoLocale(S.cur.inizio).slice(11, 16)}</span></div>
    </section>
    <section class="card">
      <div class="lbl">ENERGIA</div>
      <div class="energia">${[1, 2, 3, 4, 5].map(v => `<button class="en ${S.cur.energia === v ? 'on' : ''}" data-act="energia" data-v="${v}">${v}</button>`).join('')}</div>
      <label class="fld"><span class="lbl-m">NOTE GENERALI</span><textarea rows="4" data-in="sess-note">${esc(S.cur.note)}</textarea></label>
    </section>
    <button class="btn wide inv" data-act="salva">SALVA</button>
    <button class="btn wide" data-act="torna">TORNA ALLA SESSIONE</button>
    <button class="link" data-act="abbandona">Elimina questa sessione senza salvarla</button>
  </main>`;
}

/* ---------- vista: storico ---------- */

const GIORNI = ['DOM', 'LUN', 'MAR', 'MER', 'GIO', 'VEN', 'SAB'];

function nomeEsercizio(x) {
  if (x.nome) return x.nome;
  for (const s of sessioni()) for (const e of s.esercizi) {
    if (e.id === x.id) return e.nome;
    if (e.alternativa?.id === x.id) return e.alternativa.nome;
  }
  return x.id;
}
function defEsercizio(x) {
  for (const s of sessioni()) for (const e of s.esercizi) if (e.id === x.previsto || e.id === x.id) return e;
  return null;
}

function serieTxt(x) {
  const d = defEsercizio(x);
  const u = d?.unita === 'sec' ? '″' : d?.unita === 'min' ? '′' : '';
  return (x.serie || []).map(s => {
    const kg = s.kg == null || d?.tipo === 'cardio' ? '' : d?.carico === 'assistito' ? `−${num(s.kg)}` : num(s.kg);
    return `${kg ? kg + '×' : ''}${s.rip ?? '?'}${u}${s.rir != null ? `<i>@${s.rir >= 4 ? '4+' : s.rir}</i>` : ''}`;
  }).join(' · ');
}

function vistaStorico() {
  const voci = Object.entries(S.logs).sort((a, b) => tempoLog(b[1]) - tempoLog(a[1]));
  const inCoda = new Set(S.coda.filter(x => x.tipo === 'log').map(x => x.nome));
  const settimane = [];
  for (const [nome, l] of voci) {
    const lun = dataLocale(lunedi(parseData(l.data)));
    let w = settimane[settimane.length - 1];
    if (!w || w.lun !== lun) settimane.push(w = { lun, voci: [] });
    w.voci.push([nome, l]);
  }
  const ord = ordine();

  const riga = ([nome, l]) => {
    const s = sessione(l.sessione) || { nome: l.sessione };
    const ss = (l.esercizi || []).reduce((a, e) => a + (e.serie?.length || 0), 0);
    const aperto = S.logAperto === nome;
    const d = parseData(l.data);
    const ora = (l.inizio || '').slice(11, 16);
    let vol = 0;
    for (const x of l.esercizi || []) {
      const def = defEsercizio(x);
      if (def && (def.unita !== 'rip' || def.carico === 'assistito')) continue;
      for (const z of x.serie || []) if (z.kg) vol += z.kg * (z.rip || 0);
    }
    return `<div class="log ${aperto ? 'open' : ''}">
      <button class="log-h" data-act="log" data-f="${esc(nome)}">
        ${arte(l.sessione, 'art art-s')}
        <div class="grow"><div class="row-c"><b class="body-b">${esc(String(s.nome).toUpperCase())}</b>${inCoda.has(nome) ? '<span class="chip">IN CODA</span>' : ''}</div>
        <span class="lbl-m">${GIORNI[d.getDay()]} ${ggmm(l.data)}${ora ? ' · ' + ora : ''} · ${l.durata_min ?? '—'} MIN · ${ss} SERIE</span></div>
        <span class="log-x">${aperto ? '−' : '+'}</span>
      </button>
      ${aperto ? `<div class="log-b">
        <div class="metrics in">
          <div><span class="lbl-m">VOLUME</span><span class="metric">${num(Math.round(vol))} <small>KG</small></span></div>
          <div><span class="lbl-m">DURATA</span><span class="metric">${l.durata_min ?? '—'} <small>MIN</small></span></div>
          <div><span class="lbl-m">ENERGIA</span><span class="metric">${l.energia ?? '—'}<small>${l.energia ? '/5' : ''}</small></span></div>
        </div>
        ${(l.esercizi || []).map(x => `<div class="log-e ${x.serie?.length ? '' : 'skip'}">
          <div class="row-b"><span class="body-b">${esc(nomeEsercizio(x))}</span><span class="lbl-m">${x.serie?.length ? `${x.serie.length} SERIE` : 'SALTATO'}</span></div>
          ${x.serie?.length ? `<div class="cap log-s">${serieTxt(x)}</div>` : ''}
          ${x.note ? `<div class="cap muted">“${esc(x.note)}”</div>` : ''}
        </div>`).join('')}
        ${l.note ? `<p class="cap log-n"><span class="lbl-m">NOTE</span> ${esc(l.note)}</p>` : ''}
        <button class="btn danger" data-act="log-elimina" data-f="${esc(nome)}">${ICONA.cestino}<span>ELIMINA SESSIONE</span></button>
      </div>` : ''}
    </div>`;
  };

  return `
  <header class="top">
    <div class="top-l"><span class="lbl">CAM://LOG</span><span class="muted">•</span><h1 class="h-md">STORICO</h1></div>
    <span class="lbl-m">${voci.length} SESSIONI</span>
  </header>
  <main class="wrap">
    ${bannerInCorso()}
    ${!voci.length ? `<section class="card"><div class="lbl">NESSUNA SESSIONE</div><p class="cap muted">Le sessioni salvate compaiono qui, dalla più recente.</p></section>` : ''}
    ${settimane.map(w => {
      const fine = parseData(w.lun); fine.setDate(fine.getDate() + 6);
      const nPrinc = w.voci.filter(([, l]) => ord.includes(l.sessione)).length;
      return `<section class="week">
        <div class="row-b px"><span class="lbl-m">SETTIMANA ${ggmm(w.lun)} – ${ggmm(dataLocale(fine))}</span><span class="lbl">${nPrinc} / ${ord.length}</span></div>
        <div class="card table">${w.voci.map(riga).join('')}</div>
      </section>`;
    }).join('')}
    ${voci.length ? `<p class="cap muted center">Tocca una sessione per vedere il dettaglio o eliminarla.</p>` : ''}
  </main>
  ${tabbar('storico')}`;
}

/* ---------- vista: impostazioni ---------- */

function vistaImpostazioni() {
  const c = cfg();
  return `
  <header class="top">
    <div class="top-l"><button class="ico-btn plain" data-act="home" aria-label="Home">${ICONA.back}</button><h1 class="h-md">IMPOSTAZIONI</h1></div>
    <span class="lbl-m">CAM://CFG</span>
  </header>
  <main class="wrap">
    <section class="card">
      <div class="lbl">SINCRONIZZAZIONE GITHUB</div>
      <label class="fld"><span class="lbl-m">OWNER</span><input id="c-owner" type="text" autocapitalize="off" autocomplete="off" value="${esc(c.owner)}"></label>
      <label class="fld"><span class="lbl-m">REPO</span><input id="c-repo" type="text" autocapitalize="off" autocomplete="off" value="${esc(c.repo)}"></label>
      <label class="fld"><span class="lbl-m">BRANCH</span><input id="c-branch" type="text" autocapitalize="off" autocomplete="off" value="${esc(c.branch || 'main')}"></label>
      <label class="fld"><span class="lbl-m">TOKEN (FINE-GRAINED · CONTENTS R/W)</span><input id="c-token" type="password" autocomplete="off" value="${esc(c.token)}"></label>
      <p class="cap muted">Il token resta solo in questo browser (localStorage): non finisce mai nel repo né nei log.</p>
      <div class="row-b"><button class="btn" data-act="imp-prova">PROVA CONNESSIONE</button><button class="btn inv" data-act="imp-salva">SALVA</button></div>
      ${S.impMsg ? `<p class="cap msg">${esc(S.impMsg)}</p>` : ''}
    </section>
    <section class="card">
      <div class="row-b"><span class="lbl">CODA</span><span class="lbl-m">${S.coda.length} FILE</span></div>
      ${S.coda.map(x => `<div class="trow cap">${esc(x.path)}</div>`).join('')}
      <button class="btn wide" data-act="imp-sync">SINCRONIZZA ORA</button>
    </section>
    <section class="card">
      <div class="lbl">BACKUP</div>
      <p class="cap muted">${Object.keys(S.logs).length} sessioni · ${Object.keys(S.peso).length} pesate</p>
      <button class="btn wide" data-act="imp-esporta">ESPORTA TUTTI I DATI</button>
    </section>
  </main>`;
}

/* ---------- render ---------- */

function render() {
  const app = document.getElementById('app');
  if (!S.prog) {
    app.innerHTML = `<main class="wrap"><section class="card"><div class="lbl">PROGRAMMA NON DISPONIBILE</div>
      <p class="cap">Impossibile leggere programma.json. Controlla la connessione e riapri l'app.</p>
      <button class="btn" data-act="impostazioni">IMPOSTAZIONI</button></section></main>`;
    if (S.vista === 'impostazioni') app.innerHTML = vistaImpostazioni();
    return;
  }
  if ((S.vista === 'sessione' || S.vista === 'chiusura') && !S.cur) S.vista = 'home';
  app.innerHTML = S.vista === 'sessione' ? vistaSessione()
    : S.vista === 'chiusura' ? vistaChiusura()
    : S.vista === 'impostazioni' ? vistaImpostazioni()
    : S.vista === 'storico' ? vistaStorico()
    : vistaHome();
  document.querySelectorAll('.ex-note textarea').forEach(autoAltezza);
}

function vai(v) {
  const cambia = v !== S.vista;
  S.vista = v;
  render();
  if (cambia) window.scrollTo(0, 0);
}

// Aggiorna i numeri della sessione senza ridisegnare (per non perdere il focus mentre si scrive).
function aggiornaLive() {
  if (S.vista !== 'sessione' || !S.cur) return;
  const { fatte, tot } = contaSerie();
  const set = (id, h) => { const el = document.getElementById(id); if (el) el.innerHTML = h; };
  set('m-vol', `${num(Math.round(volume()))} <small>KG</small>`);
  set('m-serie', `${fatte} / ${tot} SERIE`);
}

function toast(msg) {
  const t = document.getElementById('toast');
  t.textContent = msg;
  t.classList.add('on');
  clearTimeout(toast.h);
  toast.h = setTimeout(() => t.classList.remove('on'), 2600);
}

function autoAltezza(el) { el.style.height = 'auto'; el.style.height = el.scrollHeight + 'px'; }

/* ---------- eventi ---------- */

document.addEventListener('click', ev => {
  const b = ev.target.closest('[data-act]');
  if (!b) return;
  sbloccaAudio();
  const act = b.dataset.act, i = +b.dataset.e, si = +b.dataset.s;
  const e = S.cur?.esercizi[i];
  switch (act) {
    case 'home': vai('home'); break;
    case 'vai-storico': vai('storico'); break;
    case 'log': S.logAperto = S.logAperto === b.dataset.f ? null : b.dataset.f; render(); break;
    case 'log-elimina': {
      const l = S.logs[b.dataset.f];
      if (!l) return;
      const n = sessione(l.sessione)?.nome || l.sessione;
      if (!confirm(`Eliminare la sessione ${n} del ${ggmm(l.data)}? Viene tolta anche dal repo e non si può recuperare.`)) return;
      eliminaLog(b.dataset.f);
      break;
    }
    case 'apri-serie': S.cur.sel = { ...(S.cur.sel || {}), [chiaveCard(i)]: `${i}:${si}` }; salvaCur(); render(); break;
    case 'chiudi-serie': if (S.cur.sel) delete S.cur.sel[chiaveCard(i)]; salvaCur(); render(); break;
    case 'impostazioni': S.impMsg = ''; vai('impostazioni'); break;
    case 'apri': apriSessione(b.dataset.id); break;
    case 'storico': S.storico = !S.storico; render(); break;
    case 'coach': S.coachAperto = !S.coachAperto; render(); break;
    case 'aggiornato-ok': S.aggiornato = false; localStorage.setItem(K.versioneVista, S.prog.versione); render(); break;
    case 'peso-salva': salvaPeso(); break;

    case 'kg': {
      const d = defDi(e), s = e.serie[si];
      const step = incremento(d) || (d.tipo === 'iso' ? 1.25 : 2.5);
      const prima = s.kg;
      s.kg = Math.max(0, arrot((s.kg ?? 0) + step * +b.dataset.d));
      // i carichi delle serie successive non ancora fatte seguono
      e.serie.forEach((x, j) => { if (j > si && !x.fatta && x.kg === prima) x.kg = s.kg; });
      salvaCur(); render(); break;
    }
    case 'rip': {
      const d = defDi(e), s = e.serie[si];
      s.rip = Math.max(0, (s.rip ?? 0) + (d.unita === 'sec' ? 5 : 1) * +b.dataset.d);
      salvaCur(); render(); break;
    }
    case 'rir': { const s = e.serie[si], v = +b.dataset.v; s.rir = s.rir === v ? null : v; salvaCur(); render(); break; }
    case 'chk': {
      const s = e.serie[si];
      s.fatta = !s.fatta;
      s.t = s.fatta ? Date.now() : null;
      S.cur.sel = S.cur.sel || {};
      if (s.fatta) {
        if (e.serie.every(x => x.fatta)) e.fatto = true;
        const rec = recuperoDopo(i, si);
        if (rec) avviaTimer(rec);
        delete S.cur.sel[chiaveCard(i)];            // si passa alla serie successiva
      } else {
        e.fatto = false;
        S.cur.sel[chiaveCard(i)] = `${i}:${si}`;    // la serie annullata resta aperta
      }
      salvaCur(); render(); break;
    }
    case 'fatto': e.fatto = !e.fatto; salvaCur(); render(); break;
    case 'alt': {
      if (e.serie.some(s => s.fatta) && !confirm('Hai già spuntato delle serie: cambiando esercizio si azzerano. Continuare?')) return;
      const d = defDi(e);
      const nuovo = creaEsercizio(S.cur.sessione, d, !e.alt);
      nuovo.note = e.note;
      S.cur.esercizi[i] = nuovo;
      salvaCur(); render(); break;
    }
    case 'add': S.aggiungi = { nome: '', serie: '3', rip: '10', kg: '' }; render(); break;
    case 'add-no': S.aggiungi = null; render(); break;
    case 'add-ok': aggiungiEsercizio(); break;

    case 't': if (S.cur.timer) { S.cur.timer.fine += +b.dataset.d * 1000; S.cur.timer.durata = Math.max(1, S.cur.timer.durata + +b.dataset.d); S.cur.timer.avvisato = restoTimer() <= 0; salvaCur(); tick(); } break;
    case 't-stop': S.cur.timer = null; salvaCur(); render(); break;
    case 't-ios': location.href = `shortcuts://run-shortcut?name=Recupero&input=text&text=${Math.max(1, Math.ceil(restoTimer()))}`; break;

    case 'chiudi': S.cur.timer = null; salvaCur(); vai('chiusura'); break;
    case 'torna': vai('sessione'); break;
    case 'energia': S.cur.energia = +b.dataset.v; salvaCur(); render(); break;
    case 'salva': salvaSessione(); break;
    case 'abbandona':
      if (confirm('Abbandonare la sessione? I dati non salvati andranno persi.')) { S.cur = null; salvaCur(); vai('home'); }
      break;

    case 'imp-salva': salvaImpostazioni(); S.impMsg = 'Impostazioni salvate.'; render(); sincronizza(); break;
    case 'imp-prova': salvaImpostazioni(); provaConnessione(); break;
    case 'imp-sync': sincronizza(true); break;
    case 'imp-esporta': esporta(); break;
  }
});

document.addEventListener('input', ev => {
  const el = ev.target, k = el.dataset.in;
  if (!k) return;
  if (k === 'add') { S.aggiungi[el.dataset.k] = el.value; return; }
  if (k === 'sess-note') { S.cur.note = el.value; salvaCur(); return; }
  const e = S.cur?.esercizi[+el.dataset.e];
  if (!e) return;
  if (k === 'note') { e.note = el.value; autoAltezza(el); salvaCur(); }
  if (k === 'kg') { e.serie[+el.dataset.s].kg = parseNum(el.value); salvaCur(); aggiornaLive(); }
});

// Un carico scritto a mano (es. "calibra") si propaga alle serie successive non ancora fatte.
document.addEventListener('change', ev => {
  const el = ev.target;
  if (el.dataset.in !== 'kg') return;
  const e = S.cur?.esercizi[+el.dataset.e], si = +el.dataset.s;
  if (!e) return;
  const kg = e.serie[si].kg;
  el.value = kg == null ? '' : num(kg);
  e.serie.forEach((x, j) => {
    if (j <= si || x.fatta) return;
    x.kg = kg;
    const inp = document.querySelector(`input[data-in="kg"][data-e="${el.dataset.e}"][data-s="${j}"]`);
    if (inp) inp.value = kg == null ? '' : num(kg);
  });
  salvaCur();
});

/* ---------- azioni ---------- */

function aggiungiEsercizio() {
  const a = S.aggiungi;
  const nome = a.nome.trim();
  if (!nome) { toast('Scrivi il nome dell\'esercizio'); return; }
  const serie = Math.max(1, Math.min(10, parseInt(a.serie, 10) || 3));
  const rip = Math.max(1, parseInt(a.rip, 10) || 10);
  const kg = parseNum(a.kg);
  const d = {
    id: `extra-${slug(nome)}`, nome, tipo: 'iso', serie, rip_min: rip, rip_max: rip,
    unita: 'rip', carico: 'kg', peso_kg: kg, cue: '', alternativa: null,
  };
  S.cur.esercizi.push({
    previsto: null, id: d.id, alt: false, nome, def: d, extra: true,
    sugg: { kg, su: false }, fatto: false, note: '',
    serie: Array.from({ length: serie }, () => ({ kg, rip, rir: rirDefault(d), fatta: false, t: null })),
  });
  S.aggiungi = null;
  salvaCur(); render();
}

function nomeLogLibero(base) {
  if (!S.logs[`${base}.json`]) return `${base}.json`;
  let n = 2;
  while (S.logs[`${base}-${n}.json`]) n++;
  return `${base}-${n}.json`;
}

function salvaSessione() {
  const c = S.cur, fine = Date.now();
  const data = dataLocale(c.inizio);
  const log = {
    data, sessione: c.sessione, versione_programma: c.versione,
    inizio: isoLocale(c.inizio), fine: isoLocale(fine),
    durata_min: Math.round((fine - c.inizio) / 60000),
    energia: c.energia, note: c.note,
    esercizi: c.esercizi.map(e => {
      const x = {
        id: e.id, previsto: e.previsto, fatto: e.fatto,
        serie: e.serie.filter(s => s.fatta).map(s => ({ kg: s.kg, rip: s.rip, rir: s.rir })),
        note: e.note,
      };
      if (e.extra) x.nome = e.def.nome;
      return x;
    }),
  };
  const base = `${data}-${c.sessione}`;
  const nome = nomeLogLibero(base);
  S.logs[nome] = log;
  scrivi(K.logs, S.logs);
  S.coda.push({ tipo: 'log', base, nome, path: `logs/${nome}`, msg: `log: ${c.sessione} ${data}`, dati: log });
  scrivi(K.coda, S.coda);
  S.cur = null; salvaCur();
  vai('home');
  toast(syncPronto() ? 'Sessione salvata · sincronizzazione…' : 'Sessione salvata sul telefono');
  sincronizza();
}

// Elimina una sessione salvata: subito dal telefono, dal repo appena c'è rete.
function eliminaLog(nome) {
  delete S.logs[nome];
  scrivi(K.logs, S.logs);
  S.coda.push({ tipo: 'elimina', nome, path: `logs/${nome}`, msg: `elimina log: ${nome.replace(/\.json$/, '')}` });
  scrivi(K.coda, S.coda);
  S.logAperto = null;
  render();
  toast(syncPronto() ? 'Sessione eliminata · sincronizzazione…' : 'Sessione eliminata dal telefono');
  sincronizza();
}

function salvaPeso() {
  const el = document.getElementById('peso-in');
  const kg = parseNum(el.value);
  if (kg == null || kg < 30 || kg > 250) { toast('Peso non valido'); return; }
  const data = dataLocale();
  const dati = { data, kg: arrot(kg) };
  S.peso[data] = dati;
  scrivi(K.peso, S.peso);
  const path = `peso/${data}.json`;
  S.coda = S.coda.filter(x => x.path !== path);
  S.coda.push({ tipo: 'peso', path, msg: `peso: ${data}`, dati });
  scrivi(K.coda, S.coda);
  render();
  toast(`Peso ${num(kg, 1)} kg salvato`);
  sincronizza();
}

function esporta() {
  const dati = {
    esportato: isoLocale(Date.now()), programma: S.prog, logs: S.logs, peso: S.peso,
    coda: S.coda, sessione_in_corso: S.cur,
  };
  const url = URL.createObjectURL(new Blob([JSON.stringify(dati, null, 2)], { type: 'application/json' }));
  const a = document.createElement('a');
  a.href = url; a.download = `camgym-backup-${dataLocale()}.json`;
  document.body.appendChild(a); a.click(); a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/* ---------- GitHub ---------- */

function cfgDefault() {
  // Su GitHub Pages (owner.github.io/repo/) owner e repo si ricavano dall'indirizzo.
  const h = location.hostname, seg = location.pathname.split('/').filter(Boolean)[0] || '';
  return h.endsWith('.github.io') ? { owner: h.split('.')[0], repo: seg } : { owner: '', repo: '' };
}
function cfg() { return { ...cfgDefault(), branch: 'main', token: '', ...leggi(K.impostazioni, {}) }; }
function syncPronto() { const c = cfg(); return !!(c.owner && c.repo && c.token); }
function salvaImpostazioni() {
  const v = id => document.getElementById(id)?.value.trim() ?? '';
  scrivi(K.impostazioni, { owner: v('c-owner'), repo: v('c-repo'), branch: v('c-branch') || 'main', token: v('c-token') });
}

async function gh(path, opts = {}) {
  const c = cfg();
  return fetch(`https://api.github.com/repos/${encodeURIComponent(c.owner)}/${encodeURIComponent(c.repo)}${path}`, {
    ...opts,
    cache: 'no-store',
    headers: {
      Accept: 'application/vnd.github+json',
      Authorization: `Bearer ${c.token}`,
      'X-GitHub-Api-Version': '2022-11-28',
      ...(opts.headers || {}),
    },
  });
}
const percorso = p => `/contents/${p.split('/').map(encodeURIComponent).join('/')}`;
const ref = () => `?ref=${encodeURIComponent(cfg().branch || 'main')}`;
function b64(str) {
  const bytes = new TextEncoder().encode(str);
  let bin = '';
  bytes.forEach(b => { bin += String.fromCharCode(b); });
  return btoa(bin);
}
async function leggiFileRemoto(path) {
  const r = await gh(percorso(path) + ref(), { headers: { Accept: 'application/vnd.github.raw+json' } });
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return r.json();
}
async function shaRemoto(path) {
  const r = await gh(percorso(path) + ref());
  if (r.status === 404) return null;
  if (!r.ok) throw new Error(`GitHub ${r.status}`);
  return (await r.json()).sha;
}
async function scriviRemoto(path, dati, msg, sha) {
  const body = { message: msg, content: b64(JSON.stringify(dati, null, 2) + '\n'), branch: cfg().branch || 'main' };
  if (sha) body.sha = sha;
  return gh(percorso(path), { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}

async function eliminaRemoto(path, msg) {
  const sha = await shaRemoto(path);
  if (!sha) return; // già assente
  const r = await gh(percorso(path), {
    method: 'DELETE', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message: msg, sha, branch: cfg().branch || 'main' }),
  });
  if (!r.ok && r.status !== 404) throw new Error(`GitHub ${r.status}`);
}

const eliminazioneInCoda = nome => S.coda.some(x => x.tipo === 'elimina' && x.nome === nome);

async function inviaElemento(it) {
  if (it.tipo === 'elimina') { await eliminaRemoto(it.path, it.msg); return; }
  // sessione eliminata prima ancora di essere caricata: non serve caricarla
  if (it.tipo === 'log' && !S.logs[it.nome] && eliminazioneInCoda(it.nome)) return;
  if (it.tipo === 'peso') {
    const r = await scriviRemoto(it.path, it.dati, it.msg, await shaRemoto(it.path));
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    return;
  }
  // Un log non sovrascrive mai un file esistente: se il nome è preso si passa a -2, -3, …
  let nome = it.nome;
  for (let n = 2; n < 50; n++) {
    const r = await scriviRemoto(`logs/${nome}`, it.dati, it.msg);
    if (r.ok) break;
    if (r.status !== 422 && r.status !== 409) throw new Error(`GitHub ${r.status}`);
    const esistente = await leggiFileRemoto(`logs/${nome}`);
    if (esistente && esistente.inizio === it.dati.inizio && esistente.sessione === it.dati.sessione) break; // già caricato
    nome = `${it.base}-${n}.json`;
  }
  if (nome !== it.nome) {
    delete S.logs[it.nome];
    S.logs[nome] = it.dati;
    scrivi(K.logs, S.logs);
  }
}

async function scaricaRemoto() {
  let nuovi = 0;
  for (const dir of ['logs', 'peso']) {
    const r = await gh(percorso(dir) + ref());
    if (r.status === 404) continue;
    if (!r.ok) throw new Error(`GitHub ${r.status}`);
    const lista = await r.json();
    if (!Array.isArray(lista)) continue;
    const remoti = new Set();
    for (const f of lista) {
      if (f.type !== 'file' || !f.name.endsWith('.json')) continue;
      const chiave = dir === 'logs' ? f.name : f.name.replace(/\.json$/, '');
      remoti.add(chiave);
      const locale = dir === 'logs' ? S.logs : S.peso;
      if (locale[chiave]) continue;
      if (dir === 'logs' && eliminazioneInCoda(chiave)) continue;
      const dati = await leggiFileRemoto(f.path).catch(() => null);
      if (!dati) continue;
      locale[chiave] = dati;
      nuovi++;
    }
    // Il repo è la fonte: un log sparito dal repo (eliminato da un altro dispositivo o da Claude)
    // sparisce anche qui, salvo che sia ancora in coda per essere caricato.
    if (dir === 'logs') {
      const daCaricare = new Set(S.coda.filter(x => x.tipo === 'log').map(x => x.nome));
      for (const k of Object.keys(S.logs)) {
        if (!remoti.has(k) && !daCaricare.has(k)) { delete S.logs[k]; nuovi++; }
      }
    }
  }
  if (nuovi) { scrivi(K.logs, S.logs); scrivi(K.peso, S.peso); }
  return nuovi;
}

let syncInCorso = false;
async function sincronizza(manuale = false) {
  if (syncInCorso) return;
  if (!syncPronto()) { if (manuale) toast('Configura owner, repo e token'); return; }
  syncInCorso = true;
  S.sync = { stato: 'sync', msg: '' };
  if (S.vista === 'home') render();
  try {
    while (S.coda.length) {
      const it = S.coda[0];
      await inviaElemento(it);
      S.coda = S.coda.filter(x => x !== it);   // per identità: la coda può cambiare durante l'invio
      scrivi(K.coda, S.coda);
    }
    await scaricaRemoto();
    S.sync = { stato: 'ok', msg: '' };
    if (manuale) toast('Sincronizzato');
  } catch (err) {
    S.sync = { stato: 'errore', msg: String(err.message || err) };
    if (manuale) toast(`Sync non riuscita: ${S.sync.msg}`);
  } finally {
    syncInCorso = false;
    if (S.vista === 'home' || S.vista === 'impostazioni' || S.vista === 'storico') render();
  }
}

async function provaConnessione() {
  S.impMsg = 'Prova in corso…'; render();
  try {
    if (!syncPronto()) throw new Error('compila owner, repo e token');
    const r = await gh('');
    if (!r.ok) throw new Error(r.status === 404 ? 'repo non trovato o token senza accesso' : r.status === 401 ? 'token non valido' : `GitHub ${r.status}`);
    const j = await r.json();
    S.impMsg = j.permissions && j.permissions.push === false
      ? `Connesso a ${j.full_name}, ma il token non ha permesso di scrittura.`
      : `OK: connesso a ${j.full_name}.`;
  } catch (err) {
    S.impMsg = `Errore: ${err.message || err}`;
  }
  render();
}

/* ---------- avvio ---------- */

async function scaricaProgramma() {
  if (syncPronto() && navigator.onLine) {
    try { const p = await leggiFileRemoto('programma.json'); if (p) return p; } catch { /* si prova il file statico */ }
  }
  try {
    const r = await fetch(`programma.json?t=${Date.now()}`, { cache: 'no-store' });
    if (r.ok) return await r.json();
  } catch { /* offline */ }
  return null;
}

function usaProgramma(p) {
  S.prog = p;
  scrivi(K.programma, p);
  registraPesiProgramma(p);
  const vista = localStorage.getItem(K.versioneVista);
  if (!vista) localStorage.setItem(K.versioneVista, p.versione);
  else if (vista !== p.versione) S.aggiornato = true;
}

async function avvia() {
  S.logs = leggi(K.logs, {});
  S.peso = leggi(K.peso, {});
  S.coda = leggi(K.coda, []);
  S.cur = leggi(K.corrente, null);
  if (S.cur) S.vista = 'sessione';

  const p = await scaricaProgramma();
  if (p) usaProgramma(p);
  else S.prog = leggi(K.programma, null);
  render();

  setInterval(tick, 250);
  sincronizza();
  window.addEventListener('online', () => sincronizza());
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') { tick(); if (S.coda.length) sincronizza(); }
  });
  if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
}

avvia();
