// 소 귀에 경 읽는 절 — realtime server.
// Channels: 기본 법당 (b1, b2, … 24 people each, filled in order) and 발원 법당 (someone opens one "for" a
// person or a wish, picks a capacity, public or invite-only, and it closes by itself after a quiet day/week).
// One Durable Object per channel plus one Lobby object that keeps the channel list and the counters.
// Nobody signs in. People are random ids for the length of a connection; channel owners hold a random key
// in their own browser. The only text people type is a short channel wish, which is length-limited,
// filtered (no links, phone-like numbers, abuse) and can be reported.

const BASIC_CAP = 24, MAX_SEATS = 16, CAPS = [2, 4, 8, 16], MAX_BASIC = 1000, WORLD = { w: 224, h: 300 };
const CATS = { heal: '쾌유를 비는 법당', pass: '합격을 비는 법당', family: '가족의 평안을 비는 법당', memorial: '명복을 비는 법당', thanks: '감사를 올리는 법당', free: '발원 법당' };
const QUIET = ['heal', 'memorial'];
const CREATE_PER_DAY = 3, REPORT_HIDE = 3, MAX_TEXT = 20;
const CORS = { 'Access-Control-Allow-Origin': '*', 'Access-Control-Allow-Methods': 'GET, POST, OPTIONS', 'Access-Control-Allow-Headers': 'Content-Type', 'Content-Type': 'application/json; charset=utf-8' };
const json = (o, s = 200) => new Response(JSON.stringify(o), { status: s, headers: CORS });
const kstDay = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
const rid = n => { const a = 'abcdefghijkmnpqrstuvwxyz23456789', b = crypto.getRandomValues(new Uint8Array(n)); return [...b].map(v => a[v % a.length]).join(''); };
async function sha(s) { const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s)); return [...new Uint8Array(h)].map(b => b.toString(16).padStart(2, '0')).join(''); }

// ───────── the wish text filter ─────────
const BAD = ['시발', '씨발', '씨바', 'ㅅㅂ', 'ㅆㅂ', '병신', 'ㅂㅅ', '좆', '존나', 'ㅈㄴ', '개새', '새끼', '꺼져', '닥쳐', '미친놈', '미친년', '지랄', '썅', '엿먹', '느금', '니애미', '애미', '애비', '창녀', '걸레', '한남', '한녀', '김치녀', '틀딱', '급식충', '맘충', '흑형', '짱깨', '쪽바리', '죽어라', '죽여', '자살', 'fuck', 'shit', 'bitch', 'sex', '섹스', '야동', '토토', '카지노', '바카라', '대출', '코인방', '리딩방', '텔레', '카톡', 'open.kakao', '오픈채팅'];
function cleanText(raw) {
  if (typeof raw !== 'string') return { err: '문구를 써 주세요' };
  const t = raw.normalize('NFC').replace(/\s+/g, ' ').trim();
  if (!t) return { err: '문구를 써 주세요' };
  if ([...t].length > MAX_TEXT) return { err: `${MAX_TEXT}자까지 쓸 수 있어요` };
  if (!/^[가-힣ㄱ-ㅎㅏ-ㅣa-zA-Z0-9 .,!?~·'"()\-]+$/.test(t)) return { err: '한글, 영문, 숫자와 간단한 문장부호만 쓸 수 있어요' };
  const flat = t.toLowerCase().replace(/[\s.,!?~·'"()\-]/g, '');
  if (/https?|www|\.com|\.kr|\.net|@/.test(t.toLowerCase())) return { err: '링크나 주소는 넣을 수 없어요' };
  if (/\d{4,}|\d{2,4}\D{0,2}\d{3,4}\D{0,2}\d{4}/.test(t)) return { err: '전화번호처럼 긴 숫자는 넣을 수 없어요' };
  if (BAD.some(w => flat.includes(w))) return { err: '쓸 수 없는 말이 들어 있어요' };
  return { text: t };
}

export default {
  async fetch(req, env) {
    const url = new URL(req.url), lobby = env.STATS.get(env.STATS.idFromName('all'));
    if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
    if (url.pathname === '/ws') {
      if (req.headers.get('Upgrade') !== 'websocket') return json({ error: 'websocket only' }, 426);
      const ch = (url.searchParams.get('ch') || 'b1').slice(0, 24);
      if (!/^(b\d{1,4}|w_[a-z0-9]{10})$/.test(ch)) return json({ error: 'bad channel' }, 400);
      return env.ROOM.get(env.ROOM.idFromName('ch-' + ch)).fetch(new Request('https://r/ws?ch=' + ch, req));
    }
    if (url.pathname === '/' ) return json({ ok: true, name: '소 귀에 경 읽는 절' });
    // everything else is the lobby; pass the caller's IP along only as a hash for the daily limits
    const ip = req.headers.get('CF-Connecting-IP') || 'local';
    const h = new Headers(req.headers); h.set('X-Who', await sha(ip + '|' + kstDay() + '|' + (env.SALT || 'cowtemple')));
    return lobby.fetch(new Request('https://l' + url.pathname + url.search, { method: req.method, headers: h, body: req.method === 'POST' ? await req.text() : undefined }));
  },
  // optional: report the live head count to 메타모아 every 10 minutes, only if the owner set the secrets
  async scheduled(ev, env) {
    const lobby = env.STATS.get(env.STATS.idFromName('all'));
    await lobby.fetch('https://l/sweep', { method: 'POST' });
    if (!env.METAMOA_KEY || !env.METAMOA_SPACE) return;
    const { online } = await (await lobby.fetch('https://l/stats')).json();
    await fetch(`https://metamoa.com/api/live/${encodeURIComponent(env.METAMOA_SPACE)}`, { method: 'POST', headers: { 'Authorization': 'Bearer ' + env.METAMOA_KEY, 'Content-Type': 'application/json' }, body: JSON.stringify({ count: Math.max(0, Math.min(100000, online | 0)) }) });
  },
};

// ───────── lobby: channel list + counters ─────────
export class Stats {
  constructor(state) {
    this.state = state; this.live = new Map();   // ch -> { n, t } reported by rooms every few seconds
    this.loaded = this.state.blockConcurrencyWhile(async () => {
      this.c = (await this.state.storage.get('c')) || { day: kstDay(), today: {}, all: {} };
      this.chs = (await this.state.storage.get('chs')) || {};
      this.lim = (await this.state.storage.get('lim')) || { day: kstDay(), make: {}, rep: {} };
    });
  }
  n(ch) { const v = this.live.get(ch); return v && Date.now() - v.t < 30e3 ? v.n : 0; }
  online() { let s = 0; for (const k of this.live.keys()) s += this.n(k); return s; }
  day() { const d = kstDay(); if (this.c.day !== d) { this.c.day = d; this.c.today = {}; } if (this.lim.day !== d) this.lim = { day: d, make: {}, rep: {} }; }
  pub(c) { return { id: c.id, cat: c.cat, title: CATS[c.cat], text: c.text, cap: c.cap, pub: c.pub, quiet: QUIET.includes(c.cat), n: this.n(c.id), tok: c.tok || 0, bow: c.bow || 0, hap: c.hap || 0, created: c.created, until: c.last + c.keep }; }
  async sweep() { const now = Date.now(); let ch = false; for (const id in this.chs) { const c = this.chs[id]; if (this.n(id) === 0 && now - c.last > c.keep) { delete this.chs[id]; ch = true; } } if (ch) await this.state.storage.put('chs', this.chs); }
  async fetch(req) {
    await this.loaded; this.day();
    const url = new URL(req.url), p = url.pathname, who = req.headers.get('X-Who') || 'x';
    if (p === '/stats') return json({ online: this.online(), today: this.c.today, all: this.c.all });
    if (p === '/sweep') { await this.sweep(); return json({ ok: true }); }
    if (p === '/pick') { for (let k = 1; k <= MAX_BASIC; k++) if (this.n('b' + k) < BASIC_CAP - 3) return json({ ch: 'b' + k }); return json({ ch: 'b1' }); }
    if (p === '/channels' && req.method === 'GET') {
      await this.sweep();
      let top = 1; for (const k of this.live.keys()) if (k[0] === 'b' && this.n(k) > 0) top = Math.max(top, +k.slice(1));
      const basic = []; for (let k = 1; k <= Math.min(top + 1, MAX_BASIC); k++) basic.push({ id: 'b' + k, n: this.n('b' + k), cap: BASIC_CAP });
      const wish = Object.values(this.chs).filter(c => c.pub && !c.hidden).map(c => this.pub(c)).sort((a, b) => b.n - a.n || b.tok - a.tok).slice(0, 100);
      return json({ basic, wish, stats: { online: this.online(), today: this.c.today } });
    }
    if (p === '/channels' && req.method === 'POST') {
      let b; try { b = await req.json(); } catch (e) { return json({ error: '잘못된 요청이에요' }, 400); }
      if ((this.lim.make[who] || 0) >= CREATE_PER_DAY) return json({ error: `발원 법당은 하루에 ${CREATE_PER_DAY}개까지 열 수 있어요` }, 429);
      if (!CATS[b.cat]) return json({ error: '발원 종류를 골라 주세요' }, 400);
      const t = cleanText(b.text); if (t.err) return json({ error: t.err }, 400);
      const cap = CAPS.includes(b.cap) ? b.cap : 8, keep = (b.days === 7 ? 7 : 1) * 86400e3;
      const id = 'w_' + rid(10), key = rid(24), now = Date.now();
      this.chs[id] = { id, cat: b.cat, text: t.text, cap, pub: b.pub !== false, keep, created: now, last: now, owner: await sha(key), reports: [], hidden: false, tok: 0, bow: 0, hap: 0 };
      this.lim.make[who] = (this.lim.make[who] || 0) + 1;
      await this.state.storage.put('chs', this.chs); await this.state.storage.put('lim', this.lim);
      return json({ ch: this.pub(this.chs[id]), key });
    }
    const m = p.match(/^\/channels\/(w_[a-z0-9]{10}|b\d{1,4})(\/(close|report|join))?$/);
    if (m) {
      const id = m[1], act = m[3];
      if (id[0] === 'b') return json({ ch: { id, cat: 'basic', title: +id.slice(1) + '번 법당', text: '', cap: BASIC_CAP, pub: true, quiet: false, n: this.n(id) } });
      const c = this.chs[id]; if (!c) return json({ error: '닫혔거나 없는 법당이에요' }, 404);
      if (!act && req.method === 'GET') return json({ ch: this.pub(c) });
      if (act === 'close' && req.method === 'POST') { const b = await req.json().catch(() => ({})); if ((await sha(String(b.key || ''))) !== c.owner) return json({ error: '이 법당을 연 브라우저에서만 닫을 수 있어요' }, 403); delete this.chs[id]; await this.state.storage.put('chs', this.chs); return json({ ok: true }); }
      if (act === 'report' && req.method === 'POST') {
        const rk = id + '|' + who; if (this.lim.rep[rk]) return json({ ok: true, already: true });
        this.lim.rep[rk] = 1; c.reports.push(Date.now()); if (c.reports.length >= REPORT_HIDE) c.hidden = true;
        await this.state.storage.put('chs', this.chs); await this.state.storage.put('lim', this.lim); return json({ ok: true });
      }
    }
    if (p === '/add' && req.method === 'POST') {
      const b = await req.json(); this.live.set(b.ch, { n: b.n | 0, t: Date.now() });
      for (const k of ['tok', 'ear', 'bow', 'hap', 'visit', 'b108']) { const d = Math.max(0, Math.min(1e6, b.d?.[k] | 0)); if (!d) continue; this.c.today[k] = (this.c.today[k] || 0) + d; this.c.all[k] = (this.c.all[k] || 0) + d; }
      const c = this.chs[b.ch]; if (c) { for (const k of ['tok', 'bow', 'hap']) c[k] = (c[k] || 0) + Math.max(0, Math.min(1e6, b.d?.[k] | 0)); if (b.n > 0) c.last = Date.now(); }
      await this.state.storage.put('c', this.c); if (c) await this.state.storage.put('chs', this.chs);
      return json({ online: this.online(), today: this.c.today, ch: c ? this.pub(c) : null, gone: b.ch[0] === 'w' && !c });
    }
    return json({ error: 'not found' }, 404);
  }
}

// ───────── one channel ─────────
const ok = (v, lo, hi) => typeof v === 'number' && isFinite(v) && v >= lo && v <= hi;
export class Room {
  constructor(state, env) { this.state = state; this.env = env; this.ps = new Map(); this.d = {}; this.nextId = 1; this.ch = 'b1'; this.info = null; this.timer = null; }
  lobby() { return this.env.STATS.get(this.env.STATS.idFromName('all')); }
  async fetch(req) {
    const url = new URL(req.url); this.ch = url.searchParams.get('ch') || 'b1';
    if (!this.info || this.info.id !== this.ch) {
      const r = await this.lobby().fetch('https://l/channels/' + this.ch); const j = await r.json().catch(() => ({}));
      this.info = j.ch || null; if (this.info) { this.cap = this.info.cap; this.seats = new Array(Math.min(MAX_SEATS, this.cap)).fill(null); }
    }
    const pair = new WebSocketPair(), [client, ws] = Object.values(pair); ws.accept();
    const refuse = t => { ws.send(JSON.stringify({ t })); ws.close(1000, t); return new Response(null, { status: 101, webSocket: client }); };
    if (!this.info) return refuse('gone');
    if (this.ps.size >= this.cap) return refuse('full');
    const p = { id: this.nextId++, x: 112 + Math.random() * 20 - 10, y: 284, look: 0, snd: 0, seat: -1, pose: 'stand', ws, last: {}, joined: false };
    this.ps.set(ws, p);
    ws.addEventListener('message', ev => this.onMsg(p, ev.data));
    const bye = () => this.leave(p); ws.addEventListener('close', bye); ws.addEventListener('error', bye);
    if (!this.timer) this.timer = setInterval(() => this.flush(), 5000);
    return new Response(null, { status: 101, webSocket: client });
  }
  pub(p) { return { id: p.id, x: Math.round(p.x), y: Math.round(p.y), look: p.look, snd: p.snd, seat: p.seat, pose: p.pose }; }
  cast(msg, except) { const s = JSON.stringify(msg); for (const [ws, q] of this.ps) if (q !== except && q.joined) { try { ws.send(s); } catch (e) {} } }
  limit(p, k, perSec) { const now = Date.now(), b = p.last[k] || { t: now, n: 0 }; if (now - b.t > 1000) { b.t = now; b.n = 0; } b.n++; p.last[k] = b; return b.n <= perSec; }
  add(k, n = 1) { this.d[k] = (this.d[k] || 0) + n; }
  onMsg(p, raw) {
    if (typeof raw !== 'string' || raw.length > 300) return;
    let m; try { m = JSON.parse(raw); } catch (e) { return; }
    if (!this.limit(p, 'all', 30)) return;
    if (m.t === 'hi' && !p.joined) {
      p.joined = true; p.look = ok(m.look, 0, 7) ? m.look | 0 : 0; p.snd = ok(m.snd, 0, 5) ? m.snd | 0 : 0; this.add('visit');
      p.ws.send(JSON.stringify({ t: 'welcome', id: p.id, ch: this.info, you: this.pub(p), peers: [...this.ps.values()].filter(q => q !== p && q.joined).map(q => this.pub(q)), seats: this.seats, stats: this.lastStats || null }));
      this.cast({ t: 'join', p: this.pub(p) }, p);
    } else if (!p.joined) return;
    else if (m.t === 'mv' && ok(m.x, 0, WORLD.w) && ok(m.y, 120, WORLD.h)) {
      if (!this.limit(p, 'mv', 12)) return;
      if (p.seat >= 0) this.stand(p);
      p.x = m.x; p.y = m.y; p.pose = 'stand'; this.cast({ t: 'mv', id: p.id, x: Math.round(p.x), y: Math.round(p.y) }, p);
    } else if (m.t === 'sit' && ok(m.c, 0, this.seats.length - 1)) {
      const c = m.c | 0;
      if (this.seats[c] !== null && this.seats[c] !== p.id) { p.ws.send(JSON.stringify({ t: 'seatno', c })); return; }
      if (p.seat >= 0) this.seats[p.seat] = null;
      this.seats[c] = p.id; p.seat = c; p.pose = 'sit'; this.cast({ t: 'sit', id: p.id, c });
    } else if (m.t === 'up') this.stand(p);
    else if (m.t === 'look') { if (!this.limit(p, 'look', 3)) return; p.look = ok(m.look, 0, 7) ? m.look | 0 : p.look; p.snd = ok(m.snd, 0, 5) ? m.snd | 0 : p.snd; this.cast({ t: 'look', id: p.id, look: p.look, snd: p.snd }, p); }
    else if (m.t === 'act' && ['tok', 'hap', 'bow'].includes(m.a)) {
      if (!this.limit(p, 'act', 12)) return;
      const cow = ok(m.cow, 0, 4) ? m.cow | 0 : 0;
      if (m.a === 'tok') { this.add('tok'); this.add('ear'); }
      if (m.a === 'hap') this.add('hap');
      if (m.a === 'bow') { this.add('bow'); if (m.n === 108) this.add('b108'); }
      this.cast({ t: 'act', id: p.id, a: m.a, cow, ch: typeof m.ch === 'string' ? m.ch.slice(0, 1) : '' }, p);
    }
  }
  stand(p) { if (p.seat >= 0 && this.seats[p.seat] === p.id) this.seats[p.seat] = null; const was = p.seat; p.seat = -1; p.pose = 'stand'; if (was >= 0) this.cast({ t: 'up', id: p.id }); }
  leave(p) {
    if (!this.ps.has(p.ws)) return;
    this.stand(p); this.ps.delete(p.ws);
    if (p.joined) this.cast({ t: 'leave', id: p.id });
    if (!this.ps.size && this.timer) { this.flush(); clearInterval(this.timer); this.timer = null; }
  }
  async flush() {
    const d = this.d; this.d = {};
    try {
      const r = await this.lobby().fetch('https://l/add', { method: 'POST', body: JSON.stringify({ ch: this.ch, n: [...this.ps.values()].filter(q => q.joined).length, d }) });
      const s = await r.json(); this.lastStats = s; if (s.ch) this.info = { ...this.info, ...s.ch };
      this.cast({ t: 'stats', s });
      if (s.gone) { this.info = null; this.cast({ t: 'gone' }); for (const ws of this.ps.keys()) { try { ws.close(1000, 'gone'); } catch (e) {} } }
    } catch (e) { for (const k in d) this.d[k] = (this.d[k] || 0) + d[k]; }
  }
}
