/* BeeTris: versus multiplayer module (not wired into the UI yet).
 *
 * Builds on the game's public API (window.HBP) and never touches game internals.
 * A match is two or more players in a room. The host picks a seed, everyone starts with the same piece
 * sequence, line clears send garbage to opponents, and each client streams a small board snapshot.
 *
 * Transports are swappable:
 *   - BroadcastChannelTransport: tabs of the same browser, no server. For local testing and demos.
 *   - WebSocketTransport: the relay in server/relay.js (or any server that speaks the protocol below).
 *
 * Protocol v1 (JSON, every message carries t = type, from = player id, room):
 *   hello  {name, version, hive?}        join a room; the server (or peers) answer with roster
 *   roster {players: [{id, name, hive?}]}
 *   ready  {}                            this player is ready
 *   start  {seed, at}                    host or server starts the match
 *   snap   {board, lines, total, hf}     about 4 per second while playing
 *   attack {lines, to?}                  garbage rows sent to opponents (to omitted = everyone else)
 *   over   {total, lines, hf, seconds}   this player topped out
 *
 * Usage (two tabs on the same browser):
 *   const m = HBPMultiplayer.createMatch({ room: 'test', name: 'alice', transport: new HBPMultiplayer.BroadcastChannelTransport('test') });
 *   m.onRoster(players => ...); m.onOpponent((id, snap) => HBPMultiplayer.drawMini(canvas, snap.board));
 *   m.ready(); // when every player is ready the host sends start and both games begin
 */
(function () {
  'use strict';
  const PROTOCOL = 1;
  // garbage sent for a clear of 1, 2, 3, 4 lines, plus extras for seals and combos
  const ATTACK = [0, 0, 1, 2, 4];
  const attackFor = ({ n, sealed, combo }) => (ATTACK[Math.min(n, 4)] || 0) + (sealed ? 1 : 0) + (combo >= 2 ? 1 : 0);
  const uid = () => Math.random().toString(36).slice(2, 10);

  class BroadcastChannelTransport {
    constructor(room) { this.ch = new BroadcastChannel(`hbp-room-${room}`); this.handlers = []; this.ch.onmessage = e => this.handlers.forEach(h => h(e.data)); }
    send(msg) { this.ch.postMessage(msg); }
    onMessage(h) { this.handlers.push(h); }
    close() { this.ch.close(); }
  }

  class WebSocketTransport {
    constructor(url) {
      this.handlers = []; this.queue = []; this.ws = new WebSocket(url);
      this.ws.onopen = () => { this.queue.forEach(m => this.ws.send(m)); this.queue = []; };
      this.ws.onmessage = e => { let m; try { m = JSON.parse(e.data); } catch (err) { return; } this.handlers.forEach(h => h(m)); };
    }
    send(msg) { const raw = JSON.stringify(msg); if (this.ws.readyState === 1) this.ws.send(raw); else this.queue.push(raw); }
    onMessage(h) { this.handlers.push(h); }
    close() { this.ws.close(); }
  }

  function createMatch({ room, name, transport, hive = null, token = null, game = window.HBP }) {
    if (!game) throw new Error('game-api-missing');
    const me = uid();
    const players = new Map([[me, { id: me, name, hive, ready: false, over: false }]]);
    const cb = { roster: [], opponent: [], start: [], attack: [], result: [] };
    const fire = (k, ...a) => cb[k].forEach(f => { try { f(...a); } catch (e) { /* ignore */ } });
    let snapTimer = 0, unsub = [];
    const send = (t, data = {}) => transport.send({ v: PROTOCOL, t, from: me, room, ...data });
    const roster = () => [...players.values()];
    const report = name => { try { if (game.track) game.track(name); } catch (e) { /* analytics must never break a match */ } };
    const isHost = () => roster().map(p => p.id).sort()[0] === me; // lowest id hosts; a server may override

    transport.onMessage(msg => {
      if (!msg || msg.room !== room || msg.from === me || msg.v !== PROTOCOL) return;
      const p = players.get(msg.from) || { id: msg.from, name: '?', ready: false, over: false };
      switch (msg.t) {
        case 'hello':
          players.set(msg.from, { ...p, name: String(msg.name || '?').slice(0, 16), hive: msg.hive || null });
          send('roster', { players: roster().map(({ id, name: n, hive: h }) => ({ id, name: n, hive: h })) });
          fire('roster', roster()); break;
        case 'roster':
          (msg.players || []).forEach(q => { if (!players.has(q.id)) players.set(q.id, { ...q, ready: false, over: false }); });
          fire('roster', roster()); break;
        case 'ready':
          players.set(msg.from, { ...p, ready: true }); fire('roster', roster()); maybeStart(); break;
        case 'start': begin(msg.seed); break;
        case 'snap': fire('opponent', msg.from, msg); break;
        case 'attack': if (!msg.to || msg.to === me) { fire('attack', msg.lines, msg.from); game.receiveGarbage(msg.lines); } break;
        case 'over': players.set(msg.from, { ...p, over: true, result: msg }); fire('roster', roster()); checkEnd(); break;
      }
    });

    function maybeStart() {
      const all = roster();
      if (all.length >= 2 && all.every(q => q.ready) && isHost()) {
        const seed = (Math.random() * 4294967296) >>> 0;
        send('start', { seed, at: Date.now() });
        begin(seed);
      }
    }
    function begin(seed) {
      report('vs-start');
      players.forEach((q, id) => players.set(id, { ...q, over: false }));
      game.start({ seed, name });
      fire('start', seed);
      clearInterval(snapTimer);
      snapTimer = setInterval(() => { if (game.isPlaying()) send('snap', game.snapshot()); }, 250);
    }
    function checkEnd() {
      const alive = roster().filter(q => !q.over);
      if (alive.length <= 1) {
        clearInterval(snapTimer);
        const winner = alive[0] ? alive[0].id : null;
        report(winner === me ? 'vs-win' : 'vs-lose');
        fire('result', { winner, players: roster() });
      }
    }

    unsub.push(game.on('lines', e => { const n = attackFor(e); if (n > 0) send('attack', { lines: n }); }));
    unsub.push(game.on('over', e => { players.set(me, { ...players.get(me), over: true, result: e }); send('over', e); checkEnd(); }));
    // the session token only ever goes to a server, which swaps it for a verified Hive name; never to peers
    report('vs-join');
    send('hello', { name, version: game.version(), hive, ...(transport instanceof WebSocketTransport && token ? { token } : {}) });

    return {
      id: me,
      players: roster,
      ready() { players.set(me, { ...players.get(me), ready: true }); send('ready'); fire('roster', roster()); maybeStart(); },
      leave() { clearInterval(snapTimer); unsub.forEach(f => f()); transport.close(); },
      onRoster: f => cb.roster.push(f), onOpponent: f => cb.opponent.push(f), onStart: f => cb.start.push(f),
      onAttack: f => cb.attack.push(f), onResult: f => cb.result.push(f),
    };
  }

  // tiny opponent preview: draws the snapshot board ("..GG./...") onto a canvas
  function drawMini(canvas, board, cell = 6) {
    const rows = String(board || '').split('/');
    const c = canvas.getContext('2d');
    canvas.width = 10 * cell; canvas.height = rows.length * cell;
    c.fillStyle = '#12070c'; c.fillRect(0, 0, canvas.width, canvas.height);
    rows.forEach((r, y) => [...r].forEach((ch, x) => { if (ch !== '.') { c.fillStyle = ch === 'G' ? '#4a3942' : '#e31337'; c.fillRect(x * cell, y * cell, cell - 1, cell - 1); } }));
  }

  window.HBPMultiplayer = { PROTOCOL, ATTACK, attackFor, createMatch, drawMini, BroadcastChannelTransport, WebSocketTransport };
})();
