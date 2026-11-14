/* main.js - game loop (fixed timestep physics), state machine, effects, replay of shame, results, saving. */
(function () {
  const BBH = window.BBH, CFG = BBH.CONFIG, UI = BBH.UI, Sound = BBH.Sound, Input = BBH.Input;
  const canvas = document.getElementById('game'), ctx = canvas.getContext('2d');
  const cam = new BBH.Camera(), particles = new BBH.Particles();
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const pick = (arr) => arr[(Math.random() * arr.length) | 0];

  // ------------------------------------------------------------------ save data
  const SAVE_KEY = 'bounceBackHill.v1';
  let save = { best: {}, muted: false, replay: true, players: 4, cosmetics: null };
  try { const s = JSON.parse(localStorage.getItem(SAVE_KEY) || 'null'); if (s) save = Object.assign(save, s); } catch (e) { /* private mode etc. */ }
  save.cosmetics = BBH.Cosmetics.apply(save.cosmetics);
  const persist = () => { try { localStorage.setItem(SAVE_KEY, JSON.stringify(save)); } catch (e) { /* ignore */ } };

  // ---------------------------------------------------------------- flavour text
  const MESSAGES = {
    fell: ['Gravity wins again', 'That went down faster than it went up', 'Physics: 1, Team: 0', 'The ball sends its regards (from the bottom)', 'Well, that was one way to descend'],
    broken: ['Egg-cellent attempt. Egg-stremely cracked.', 'Shell-shocked!', 'Cracked under pressure', 'Sunny side down', 'That yolk was on you'],
    manual: ['Voluntary bounce back. How brave.', 'Taking the shortcut... backwards', 'Coward\'s elevator, going down'],
    team: ['Teamwork makes the dream work, barely', 'Everybody hit it. Just not in the right order.', 'Ball: 1. Communication: 0', 'Next time, hit the ball. With your body.'],
  };
  const RATINGS = [
    [0, 'Suspiciously Flawless', 'Not a single bounce back? Sus.'],
    [2, 'Barely Bounced', 'A mere scratch.'],
    [5, 'Gravity\'s Frenemies', 'You two get along great, mostly.'],
    [9, 'Professional Ball Droppers', 'Dropping it with style.'],
    [14, 'Hill Enjoyers (Reluctantly)', 'It is a very tall hill.'],
    [24, 'Sisyphus Would Be Proud', 'The ball is just a rock with feelings.'],
    [Infinity, 'Friendship Tested To Destruction', 'Still friends? Debatable.'],
  ];

  // ------------------------------------------------------------------ game state
  const G = {
    state: 'title',            // title | levels | shop | playing | paused | replay | results
    players: clamp(save.players | 0 || 4, 2, 4),
    levelIdx: 0, level: null, demo: null,
    ts: 1, slow: 0, acc: 0, clock: 0,
    bounces: 0, bounceReq: null, replay: null, pending: null, winT: 0, floaters: [], runCoins: [0,0,0,0], shopReturn: 'title',
  };
  let dpr = 1, vw = 800, vh = 600, last = performance.now();

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    vw = window.innerWidth; vh = window.innerHeight;
    canvas.width = Math.round(vw * dpr); canvas.height = Math.round(vh * dpr);
    cam.resize(vw, vh, dpr);
  }
  window.addEventListener('resize', resize);

  // ------------------------------------------------------------- floating text
  function floater(x, y, text, color = '#fff', size = 26) { G.floaters.push({ x, y, text, color, size, life: 1.0, max: 1.0 }); }

  // ------------------------------------------------------------------- events
  function onEvent(name, d) {
    const L = G.level;
    switch (name) {
      case 'jump': Sound.jump(); particles.dust(d.x, d.y, 3); break;
      case 'blobLand':
        if (d.speed > 220) { particles.dust(d.x, d.y, 4); Sound.land(clamp(d.speed / 700, 0.2, 1)); }
        break;
      case 'hit': {
        const earned = BBH.Cosmetics.award(save.cosmetics, d.blob.index, d.combo);
        G.runCoins[d.blob.index] += earned;
        persist(); UI.setWallets(save.cosmetics.players, G.players);
        Sound.hit(d.power, d.combo);
        particles.sparks(d.x, d.y, d.blob.style.color, 12, 300);
        particles.ring(d.x, d.y, '#ffffff', 70);
        cam.shake(2.5 + Math.min(d.combo, 8) * 0.3);
        floater(d.x, d.y - 40, d.combo > 1 ? 'x' + d.combo : 'BONK', d.blob.style.color, d.combo > 3 ? 34 : 26);
        floater(d.x, d.y + 28, `P${d.blob.index + 1} +${earned} ◈`, '#fff7a8', 18);
        break;
      }
      case 'flop': Sound.flop(); particles.stars(d.x, d.y - 20, 5); cam.shake(6); floater(d.x, d.y - 40, 'oof!', '#fff', 26); break;
      case 'recover': Sound.boing(); break;
      case 'impact':
        if (d.kind === 'rock') { Sound.rockHit(); particles.dust(d.x, d.y, 3); }
        else {
          Sound.thud(clamp(d.speed / 800, 0.2, 1)); particles.dust(d.x, d.y, 6);
          if (d.speed > 450) cam.shake(clamp(d.speed / 110, 3, 14));
        }
        break;
      case 'pad': Sound.bounce(); particles.sparks(d.x, d.y - 20, '#ffffff', 10, 320); particles.puff(d.x, d.y - 10, 4, '#ffd1e3'); if (d.big) cam.shake(4); floater(d.x, d.y - 80, 'BOING!', '#ff8fd0', 28); break;
      case 'eggHit': Sound.crack(); cam.shake(6 + d.damage * 20); particles.sparks(d.x, d.y, '#fff6e5', 8, 220); floater(d.x, d.y - 40, 'crack!', '#ffd9a8', 30); break;
      case 'eggBreak': Sound.splat(); particles.shell(d.x, d.y - 30, 22); cam.shake(14); break;
      case 'checkpoint':
        Sound.checkpoint(); particles.confetti(d.x, d.y - 80, 70); UI.toast('Checkpoint! You will bounce back here.', 2400);
        break;
      case 'win':
        Sound.win(); G.winT = 2.4; G.slow = 0.7;
        for (let i = 0; i < 4; i++) setTimeout(() => particles.confetti(d.x + (i - 1.5) * 120, d.y - 120, 70, 1.15), i * 220);
        UI.big('SUMMIT!', 'good'); cam.punch = 0.6;
        break;
      case 'nooo':
        Sound.nooo(); UI.big('NOOOO!'); G.slow = CFG.feel.slowmoTime; cam.punch = 1; cam.shake(8);
        break;
      case 'comboLost': floater(d.x, d.y - 60, 'dropped! x' + d.count, '#ff5a5f', 30); break;
      case 'bounceBack': G.bounceReq = d.reason; break;
      case 'gust': Sound.wind(); break;
      case 'rockWarn': Sound.warn(); break;
      case 'boulderWarn': Sound.rumble(); cam.shake(5); UI.toast('Boulder incoming!', 2600); break;
      case 'boulder': cam.shake(8); break;
      case 'rockPoof': particles.puff(d.x, d.y, 6, '#d9cfe8'); break;
      case 'blobRescue': particles.puff(d.x, d.y, 8, '#ffffff', 1.3); Sound.respawn(); break;
    }
  }

  // ---------------------------------------------------------------- level flow
  function startLevel(idx) {
    G.levelIdx = idx;
    BBH.Cosmetics.apply(save.cosmetics);
    const def = BBH.LEVELS[idx];
    G.level = new BBH.Level(def, G.players);
    G.level.onEvent = onEvent;
    G.bounces = 0; G.bounceReq = null; G.replay = null; G.pending = null; G.winT = 0; G.slow = 0; G.ts = 1; G.acc = 0; G.floaters = []; G.runCoins = [0,0,0,0];
    particles.clear(); Input.clearEdges();
    const c = G.level.object.center();
    cam.snapTo(c.x, c.y - 120, 0.55); cam.punch = 0;
    G.state = 'playing';
    UI.show(null); UI.hud(true); UI.setLevel(`${idx + 1}. ${def.name}`); UI.setBounces(0); UI.setCombo(0); UI.setTime(0);
    UI.setWallets(save.cosmetics.players, G.players);
    UI.hideFail(); UI.replayBanner(false);
    UI.toast(def.tip, 6500);
    Sound.respawn();
  }

  function beginBounce(reason) {
    if (G.state !== 'playing' || !G.level) return;
    const L = G.level;
    G.bounces++; UI.setBounces(G.bounces);
    const worst = L.worstMoment();
    const teamy = worst && (worst.label === 'combo' || worst.label === 'nooo') ? 0.5 : 0.15;
    const msg = reason === 'broken' || reason === 'crates' ? pick(MESSAGES.broken) : reason === 'manual' ? pick(MESSAGES.manual) : Math.random() < teamy ? pick(MESSAGES.team) : pick(MESSAGES.fell);
    G.pending = { msg };
    UI.hideToast();
    if (save.replay && CFG.feel.replayEnabled && worst && worst.frames.length > 12 && reason !== 'manual') {
      G.replay = { frames: worst.frames, pos: 0, hold: 0.45, label: worst.label };
      G.state = 'replay'; UI.replayBanner(true); Sound.replay();
      const f0 = worst.frames[0].obj.parts[0]; cam.snapTo(f0.x, f0.y, cam.zoom);
    } else finishBounce();
  }

  function finishBounce() {
    UI.replayBanner(false);
    const L = G.level;
    L.respawnAll();
    G.replay = null; G.state = 'playing'; G.slow = 0; G.ts = 1; G.acc = 0; G.bounceReq = null;
    const cp = L.checkpoints[L.cp];
    for (const b of L.blobs) particles.puff(b.x, b.y + 10, 6, '#ffffff', 1.2);
    Sound.respawn(); cam.punch = 0; Input.clearEdges();
    const c = L.object.center(); cam.snapTo(c.x, c.y - 120, cam.zoom);
    UI.failMsg(G.pending ? G.pending.msg : 'Gravity wins again', 2400);
  }

  function finishWin() {
    const L = G.level, def = BBH.LEVELS[G.levelIdx];
    const time = L.time, bounces = G.bounces;
    const prev = save.best[def.id];
    const newTime = !prev || time < prev.time, newBounces = !prev || bounces < prev.bounces;
    save.best[def.id] = { time: newTime ? time : prev.time, bounces: newBounces ? bounces : prev.bounces };
    persist();
    const [, rating, sub] = RATINGS.find((r) => bounces <= r[0]);
    G.state = 'results';
    UI.hud(false); UI.hideFail(); UI.show('results');
    UI.results({ rating, sub, time, bounces, combo: L.bestCombo, earnings: G.runCoins.slice(0, G.players), newTime: newTime && !!prev, newBounces: newBounces && !!prev, hasNext: G.levelIdx < BBH.LEVELS.length - 1 });
  }

  function goTitle() { G.state = 'title'; UI.hud(false); UI.show('title'); BBH.Cosmetics.apply(save.cosmetics); UI.setPlayers(G.players); startDemo(); }
  function goLevels() { G.state = 'levels'; UI.hud(false); UI.renderLevels(BBH.LEVELS, save); UI.show('levels'); if (!G.demo) startDemo(); }
  function goShop() {
    G.shopReturn = G.state === 'levels' ? 'levels' : 'title';
    G.state = 'shop'; UI.hud(false); UI.renderShop(save.cosmetics); UI.show('shop');
  }
  function leaveShop() { if (G.shopReturn === 'levels') goLevels(); else goTitle(); }

  function pause() { if (G.state === 'playing') { G.state = 'paused'; UI.setReplayLabel(save.replay); UI.show('pause'); Sound.back(); } }
  function resume() { if (G.state === 'paused') { G.state = 'playing'; UI.show(null); UI.hud(true); last = performance.now(); Input.clearEdges(); } }

  // ------------------------------------------------------------------ demo (title backdrop)
  function startDemo() {
    BBH.Cosmetics.apply(save.cosmetics);
    G.demo = new BBH.Level(BBH.LEVELS[0], 4);
    G.demo.onEvent = (name, d) => {
      if (name === 'hit') { particles.sparks(d.x, d.y, d.blob.style.color, 8, 240); particles.ring(d.x, d.y, '#fff', 60); }
      else if (name === 'blobLand' && d.speed > 220) particles.dust(d.x, d.y, 3);
    };
    particles.clear();
    const c = G.demo.object.center(); cam.snapTo(c.x, c.y - 120, 0.5);
  }
  function demoInputs(L) {
    const o = L.object.center(), v = L.object.speed();
    return L.blobs.map((b) => {
      const inp = { x: 0, jumpHeld: true, jumpPressed: false };
      if (b.locked) { const away = b.x - o.x; inp.x = Math.abs(away) < 90 ? Math.sign(away || 1) : 0; return inp; }
      const dx = o.x + v.x * 0.25 - b.x; inp.x = Math.abs(dx) < 12 ? 0 : Math.sign(dx);
      const dy = o.y - b.y, reach = L.object.radius + b.r;
      if (Math.abs(dx) < reach * 0.9 && dy < -reach * 0.4 && dy > -(reach + 330) && b.grounded) inp.jumpPressed = true;
      return inp;
    });
  }

  // -------------------------------------------------------------------- update
  function readInputs(n) { const a = []; for (let i = 0; i < n; i++) a.push(Input.read(i)); return a; }

  function followLive(dt, L, snapFrame) {
    const pts = [], pose = snapFrame;
    let focus;
    if (pose) {
      pose.blobs.forEach((b) => pts.push({ x: b.x, y: b.y, r: 40 }));
      const p = pose.obj.parts[0]; focus = { x: p.x, y: p.y, r: L.object.radius };
      pts.push(focus);
    } else {
      const c = L.object.center(); focus = { x: c.x, y: c.y, r: L.object.radius };
      pts.push(focus);
      for (const b of L.blobs) pts.push({ x: b.x, y: b.y, r: 40 });
    }
    cam.update(dt, pts, focus, L);
  }

  function update(dt) {
    G.clock += dt;
    const step = 1 / CFG.world.stepHz;
    if (G.state === 'playing') {
      G.slow = Math.max(0, G.slow - dt);
      const target = G.slow > 0 ? CFG.feel.slowmoScale : 1;
      G.ts += (target - G.ts) * Math.min(1, dt * 9);
      G.acc += dt * G.ts;
      let n = 0;
      const L = G.level;
      while (G.acc >= step && n < CFG.world.maxCatchUpSteps) {
        L.step(step, readInputs(G.players));
        G.acc -= step; n++;
        if (G.bounceReq) break;
      }
      if (n === CFG.world.maxCatchUpSteps) G.acc = 0;
      particles.update(dt * G.ts);
      followLive(dt, L);
      // object looks worried / blobs look at it
      UI.setTime(L.time); UI.setCombo(L.combo); UI.setBar(L.object.hud());
      if (G.bounceReq) { const r = G.bounceReq; G.bounceReq = null; beginBounce(r); }
      if (L.won && G.winT > 0) { G.winT -= dt; if (G.winT <= 0) finishWin(); }
    } else if (G.state === 'replay') {
      const R = G.replay;
      R.pos += dt * CFG.world.stepHz * CFG.feel.replaySpeed;
      const i = Math.min(R.frames.length - 1, Math.floor(R.pos));
      followLive(dt, G.level, R.frames[i]);
      if (R.pos >= R.frames.length - 1) { R.hold -= dt; if (R.hold <= 0) finishBounce(); }
      particles.update(dt * 0.5);
    } else if (G.state === 'title' || G.state === 'levels') {
      if (!G.demo) startDemo();
      const L = G.demo;
      G.acc += dt;
      let n = 0;
      while (G.acc >= step && n < 4) { L.step(step, demoInputs(L)); G.acc -= step; n++; if (L.pendingBounce) L.respawnAll(); }
      if (n === 4) G.acc = 0;
      particles.update(dt);
      const c = L.object.center(), pts = [{ x: c.x, y: c.y, r: L.object.radius }];
      for (const b of L.blobs) pts.push({ x: b.x, y: b.y, r: 40 });
      cam.update(dt, pts, { x: c.x, y: c.y, r: L.object.radius }, L);
    } else if (G.state === 'results') {
      particles.update(dt);
    }
    for (let i = G.floaters.length - 1; i >= 0; i--) { const f = G.floaters[i]; f.life -= dt; f.y -= 55 * dt; if (f.life <= 0) G.floaters.splice(i, 1); }
  }

  // -------------------------------------------------------------------- render
  function drawArrows(L, snap) {
    const m = 38;
    const items = [];
    const o = snap ? snap.obj.parts[0] : L.object.center();
    items.push({ x: o.x, y: o.y, color: '#ffffff', label: '', ball: true });
    L.blobs.forEach((b, i) => { const p = snap ? snap.blobs[i] : b; items.push({ x: p.x, y: p.y, color: b.style.color, label: 'P' + (i + 1) }); });
    for (const it of items) {
      const s = cam.toScreen(it.x, it.y);
      if (s.x > -4 && s.x < vw + 4 && s.y > -4 && s.y < vh + 4) continue;
      const cx = vw / 2, cy = vh / 2, dx = s.x - cx, dy = s.y - cy;
      const k = Math.min((vw / 2 - m) / Math.abs(dx || 1e-6), (vh / 2 - m) / Math.abs(dy || 1e-6));
      const ax = cx + dx * k, ay = cy + dy * k, ang = Math.atan2(dy, dx);
      ctx.save(); ctx.translate(ax, ay);
      ctx.rotate(ang);
      ctx.fillStyle = it.color; ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = 3; ctx.lineJoin = 'round';
      ctx.beginPath(); ctx.moveTo(26, 0); ctx.lineTo(-8, -17); ctx.lineTo(-8, 17); ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.rotate(-ang);
      ctx.fillStyle = '#3a2f4a'; ctx.font = '800 13px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      if (it.label) ctx.fillText(it.label, -Math.cos(ang) * 22, -Math.sin(ang) * 22);
      ctx.restore();
    }
  }

  function drawFloaters() {
    for (const f of G.floaters) {
      const k = f.life / f.max;
      ctx.save(); ctx.translate(f.x, f.y); ctx.globalAlpha = Math.min(1, k * 2);
      const s = clamp(1 / cam.z, 1, 2.4) * (1 + (1 - k) * 0.2);
      ctx.scale(s, s);
      ctx.font = `900 ${f.size}px ui-rounded, "Arial Rounded MT Bold", system-ui, sans-serif`; ctx.textAlign = 'center';
      ctx.lineWidth = 6; ctx.strokeStyle = '#fff'; ctx.lineJoin = 'round'; ctx.strokeText(f.text, 0, 0);
      ctx.fillStyle = f.color; ctx.fillText(f.text, 0, 0);
      ctx.restore();
    }
  }

  function render() {
    const L = G.state === 'title' || G.state === 'levels' ? G.demo : G.level;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!L) { ctx.fillStyle = '#cfe9ff'; ctx.fillRect(0, 0, vw, vh); return; }
    const snap = G.state === 'replay' && G.replay ? G.replay.frames[Math.min(G.replay.frames.length - 1, Math.floor(G.replay.pos))] : null;
    L.drawBackground(ctx, cam, vw, vh, G.clock);
    cam.apply(ctx);
    L.drawWorld(ctx, cam, G.clock, snap, cam.z);
    particles.draw(ctx, G.clock);
    drawFloaters();
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (G.state === 'playing' || G.state === 'paused' || G.state === 'replay') drawArrows(L, snap);
    // slow-mo vignette
    if (G.state === 'playing' && G.ts < 0.85) {
      const a = (1 - G.ts) * 0.5, g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.3, vw / 2, vh / 2, Math.max(vw, vh) * 0.75);
      g.addColorStop(0, 'rgba(255,60,90,0)'); g.addColorStop(1, `rgba(255,60,90,${a})`);
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    // replay of shame: sepia tint + vignette
    if (G.state === 'replay') {
      ctx.fillStyle = 'rgba(120,80,20,0.2)'; ctx.fillRect(0, 0, vw, vh);
      const g = ctx.createRadialGradient(vw / 2, vh / 2, Math.min(vw, vh) * 0.25, vw / 2, vh / 2, Math.max(vw, vh) * 0.7);
      g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(30,10,0,0.6)');
      ctx.fillStyle = g; ctx.fillRect(0, 0, vw, vh);
    }
    if (G.state === 'title' || G.state === 'levels') { ctx.fillStyle = 'rgba(255,255,255,0.18)'; ctx.fillRect(0, 0, vw, vh); }
  }

  // ---------------------------------------------------------------------- loop
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now;
    update(dt); render();
    requestAnimationFrame(frame);
  }

  // -------------------------------------------------------------------- wiring
  function setMuted(m) { save.muted = m; Sound.setMuted(m); UI.setMuted(m); persist(); }
  function setPlayers(n) { G.players = n; save.players = n; persist(); UI.setPlayers(n); }
  function toggleMute() { Sound.unlock(); setMuted(!save.muted); }

  UI.on.mute = toggleMute;
  UI.on.pause = pause;
  UI.on.players = setPlayers;
  UI.on.toLevels = goLevels;
  UI.on.toTitle = goTitle;
  UI.on.shop = goShop;
  UI.on.shopBack = leaveShop;
  UI.on.shopItem = (player, kind, id) => {
    const result = BBH.Cosmetics.buyOrEquip(save.cosmetics, player, kind, id);
    if (!result.ok) {
      if (result.reason === 'coins') UI.toast(`P${player + 1} needs ${result.needed} more ◈`, 1800);
      return;
    }
    persist(); UI.renderShop(save.cosmetics); UI.setPlayers(G.players);
    UI.toast(`${result.item.name} equipped for P${player + 1}!`, 1500);
  };
  UI.on.ballSkin = (id) => {
    BBH.Cosmetics.equipBall(save.cosmetics, id); persist(); UI.renderShop(save.cosmetics);
    const item = BBH.Cosmetics.balls.find((b) => b.id === id); UI.toast(`${item.name} ball equipped — free!`, 1500);
  };
  UI.on.pick = (i) => startLevel(i);
  UI.on.resume = resume;
  UI.on.restart = () => startLevel(G.levelIdx);
  UI.on.retry = () => startLevel(G.levelIdx);
  UI.on.next = () => startLevel(Math.min(BBH.LEVELS.length - 1, G.levelIdx + 1));
  UI.on.quit = () => { G.level = null; goLevels(); };
  UI.on.toggleReplay = () => { save.replay = !save.replay; persist(); UI.setReplayLabel(save.replay); };
  UI.on.manualBounce = () => { resume(); G.bounceReq = 'manual'; };

  Input.onKey((e) => {
    Sound.unlock();
    const c = e.code;
    if (c === 'KeyM') { toggleMute(); return; }
    switch (G.state) {
      case 'title':
        if (c === 'Enter' || c === 'Space') { Sound.click(); goLevels(); }
        else if (c === 'KeyS') { Sound.click(); goShop(); }
        else if (c === 'Digit2' || c === 'Digit3' || c === 'Digit4') { Sound.click(); setPlayers(+c.slice(5)); }
        break;
      case 'levels':
        if (c === 'Escape') { Sound.back(); goTitle(); }
        else if (c === 'KeyS') { Sound.click(); goShop(); }
        else if (/^Digit[1-9]$/.test(c) && +c.slice(5) <= BBH.LEVELS.length) { Sound.click(); startLevel(+c.slice(5) - 1); }
        break;
      case 'shop':
        if (c === 'Escape') { Sound.back(); leaveShop(); }
        break;
      case 'playing':
        if (c === 'Escape' || c === 'KeyP') pause();
        break;
      case 'paused':
        if (c === 'Escape' || c === 'KeyP' || c === 'Enter') resume();
        break;
      case 'replay':
        if (G.replay) G.replay.pos = G.replay.frames.length + 5, G.replay.hold = 0;   // any key skips the shame
        break;
      case 'results':
        if (c === 'Enter' || c === 'Space') { if (G.levelIdx < BBH.LEVELS.length - 1) startLevel(G.levelIdx + 1); else goLevels(); }
        else if (c === 'Escape') goLevels();
        break;
    }
  });
  canvas.addEventListener('pointerdown', () => { Sound.unlock(); if (G.state === 'replay' && G.replay) { G.replay.pos = G.replay.frames.length + 5; G.replay.hold = 0; } });
  window.addEventListener('blur', () => { if (G.state === 'playing') pause(); });
  document.addEventListener('visibilitychange', () => { if (document.hidden && G.state === 'playing') pause(); last = performance.now(); });

  // ---------------------------------------------------------------------- boot
  UI.init();
  Sound.setMuted(save.muted); UI.setMuted(save.muted);
  UI.setPlayers(G.players);
  resize();
  startDemo();
  UI.show('title');
  requestAnimationFrame((t) => { last = t; frame(t); });

  // handy for tinkering in the console / automated tests
  BBH.game = G; BBH.cam = cam;
})();
