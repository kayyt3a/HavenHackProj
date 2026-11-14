/* level.js - builds an open-space physics world (floor + one-way ledges) from level data and runs it one fixed step at a time. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const { Engine, Bodies, Body, Composite, Events } = Matter;
  const PXS = 1 / 60;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  let UID = 1;

  class Level {
    constructor(def, playerCount) {
      const W = BBH.CONFIG.world;
      this.uid = UID++;
      this.def = def; this.n = playerCount;
      this.engine = Engine.create({ positionIterations: W.positionIterations, velocityIterations: W.velocityIterations, constraintIterations: W.constraintIterations, enableSleeping: false });
      this.engine.gravity.y = W.gravity;
      this.stepMs = 1000 / W.stepHz;
      this.time = 0; this.rocks = []; this.onEvent = null; this.oneWays = [];
      this.cp = 0; this.won = false; this.pendingBounce = null; this.noooCd = 0;
      this.dramas = []; this.rec = []; this.simT = 0;
      this.lastHitter = null; this.hitCd = 0; this.combo = 0; this.bestCombo = 0; this.totalHits = 0;
      this.restT = 0; this.restLedge = null;

      this.floorY = 0;
      const half = (def.arena && def.arena.halfWidth) || W.arenaHalfWidth;
      this.minX = -half; this.maxX = half;
      this.buildWorld();

      // checkpoint list: the floor, then every cp ledge from low to high
      const cpLedges = this.ledges.filter((l) => l.cp).sort((a, b) => b.y - a.y);
      this.checkpoints = [{ x: 0, y: this.floorY, ledge: null, anim: 1, flagX: -half + 140 }]
        .concat(cpLedges.map((l) => ({ x: l.x, y: l.y, ledge: l, anim: 0, flagX: l.x - l.w / 2 + 46 })));
      this.goalLedge = this.ledges.find((l) => l.goal) || this.ledges[this.ledges.length - 1];

      this.object = BBH.createObject(def.object, this, playerCount);
      this.blobs = [];
      for (let i = 0; i < playerCount; i++) this.blobs.push(new BBH.Blob(this, i));
      this.hazards = (def.hazards || []).map((h) => BBH.createHazard(h, this));
      this.topY = Math.min(...this.ledges.map((l) => l.y), ...this.blocks.map((b) => b.y)) - 1200;
      Composite.add(this.engine.world, Bodies.rectangle(0, this.topY - 30, half * 2 + 200, 60, { isStatic: true, label: 'ceiling' }));

      Events.on(this.engine, 'collisionStart', (e) => this.onCollisions(e.pairs, true));
      Events.on(this.engine, 'collisionActive', (e) => this.onCollisions(e.pairs, false));
      this.respawnAll();
    }

    emit(name, data) { if (this.onEvent) this.onEvent(name, data); }
    drama(score, label, x, y) { this.dramas.push({ t: this.simT, score, label, x, y }); if (this.dramas.length > 60) this.dramas.shift(); }

    // -------------------------------------------------------------------- world
    addOneWay(body) {
      const bit = 1 << (3 + this.oneWays.length);
      body.collisionFilter.category = bit; body.collisionFilter.mask = 0xFFFFFFFF;
      this.oneWays.push({ body, bit });
      return bit;
    }

    buildWorld() {
      const W = BBH.CONFIG.world;
      const half = this.maxX, T = W.ledgeThickness;
      // floor + walls (solid)
      const floor = Bodies.rectangle(0, this.floorY + 400, half * 2 + 400, 800, { isStatic: true, friction: 0.8, label: 'floor' });
      floor.plugin.surface = 'grass';
      const tall = 12000;
      const wl = Bodies.rectangle(-half - 30, -tall / 2 + 400, 60, tall, { isStatic: true, friction: 0, label: 'wall' });
      const wr = Bodies.rectangle(half + 30, -tall / 2 + 400, 60, tall, { isStatic: true, friction: 0, label: 'wall' });
      Composite.add(this.engine.world, [floor, wl, wr]);
      // solid blocks (pillars / towers): solid from every side
      this.blocks = (this.def.blocks || []).map((b) => {
        const B = Object.assign({}, b);
        B.x0 = b.x - b.w / 2; B.x1 = b.x + b.w / 2;
        const body = Bodies.rectangle(b.x, b.y + b.h / 2, b.w, b.h, { isStatic: true, friction: 0.8, frictionStatic: 1, label: 'block', chamfer: { radius: 6 } });
        body.plugin.surface = 'grass';
        Composite.add(this.engine.world, body);
        return B;
      });
      // ledges (one-way: solid only when you come from above)
      this.ledges = this.def.ledges.map((l) => {
        const L = Object.assign({}, l);
        L.x0 = l.x - l.w / 2; L.x1 = l.x + l.w / 2;
        const body = Bodies.rectangle(l.x, l.y + T / 2, l.w, T, { isStatic: true, friction: l.ice ? 0.004 : 0.9, frictionStatic: l.ice ? 0 : 1, label: 'ledge', slop: 0.05 });
        body.plugin.surface = l.ice ? 'ice' : 'grass';
        Composite.add(this.engine.world, body);
        this.addOneWay(body);
        L.body = body;
        return L;
      });
    }

    /** one-way platforms: each dynamic body only collides with a ledge while it is above that ledge's top */
    updateFilters() {
      const tol = BBH.CONFIG.world.ledgeTolerance;
      const apply = (b, extraMask) => {
        let mask = 0xFFFFFFFF;
        const bottom = b.bounds.max.y, vyStep = Math.max(0, b.velocity.y);
        for (const ow of this.oneWays) {
          const top = ow.body.bounds.min.y;
          if (bottom > top + tol + vyStep * 1.3) mask &= ~ow.bit;
        }
        b.collisionFilter.mask = (mask & extraMask) | 0;
      };
      for (const bl of this.blobs) apply(bl.body, bl.locked ? ~BBH.CAT.OBJECT : 0xFFFFFFFF);
      for (const ob of this.object.bodies) apply(ob, 0xFFFFFFFF);
      for (const r of this.rocks) apply(r.body, 0xFFFFFFFF);
    }

    // ------------------------------------------------------------------ spawning
    respawnAll() {
      const cp = this.checkpoints[this.cp], ob = this.object;
      for (const h of this.hazards) h.reset();
      for (const r of [...this.rocks]) this.removeRock(r);
      ob.place(cp.x, cp.y);
      const r = BBH.CONFIG.blob.radius;
      // spawn slots either side of the object, kept on the ledge and clear of launch pads; extras drop in from above
      const pads = this.hazards.filter((h) => h.sensor && Math.abs(h.capY - cp.y) < 6);
      const lo = cp.ledge ? cp.ledge.x0 + 34 : this.minX + 40, hi = cp.ledge ? cp.ledge.x1 - 34 : this.maxX - 40;
      const free = (x) => !pads.some((h) => Math.abs(x - h.x) < h.sensorW / 2 + r + 6) && x > lo && x < hi;
      const slots = [];
      for (let k = 0; k < 8; k++) for (const side of [-1, 1]) { const x = cp.x + side * (ob.radius + 50 + k * 54); if (free(x)) slots.push(x); }
      this.blobs.forEach((b, i) => {
        if (slots[i] != null) b.reset(slots[i], cp.y - r - 6);
        else b.reset(cp.x + (i % 2 ? 1 : -1) * 40, cp.y - ob.radius * 2 - 60 - (i - slots.length) * 60);
        b.happy = 0; b.lastVx = 0; b.lastVy = 0;
      });
      this.lastHitter = null; this.combo = 0; this.restT = 0;
      this.pendingBounce = null; this.noooCd = 2; this.rec.length = 0;
    }

    spawnRock(x, y, r, owner, opts = {}) {
      const boulder = !!opts.boulder;
      let body;
      if (boulder) body = Bodies.circle(x, y, r, { density: 0.0032, friction: 0.5, frictionAir: 0.001, restitution: 0.1, label: 'boulder' }, 36);
      else body = Bodies.polygon(x, y, 7, r, { density: 0.0022, friction: 0.6, restitution: 0.3, label: 'rock', chamfer: { radius: r * 0.25 } });
      body.plugin.rock = true; if (boulder) body.plugin.round = true;
      Body.setVelocity(body, { x: (opts.vx || 0) * PXS, y: 0 });
      Body.setAngularVelocity(body, boulder ? 0 : (Math.random() - 0.5) * 0.2);
      Composite.add(this.engine.world, body);
      const rock = { body, r, owner, boulder, age: 0, hue: boulder ? '#a89bb8' : ['#b7a9c9', '#c9b7a9', '#a9c0c9'][Math.floor(Math.random() * 3)] };
      this.rocks.push(rock);
      return rock;
    }
    removeRock(r) { Composite.remove(this.engine.world, r.body); const i = this.rocks.indexOf(r); if (i >= 0) this.rocks.splice(i, 1); }

    // ---------------------------------------------------------------------- THE HIT
    tryHit(blob, obj, cx, cy) {
      const h = BBH.CONFIG.hit;
      if (blob.locked || this.hitCd > 0 || this.won || this.pendingBounce) return false;
      const o = obj.parts[0], v = obj.speed(), sc = obj.hitScale();
      // hits come from the side or from below: landing ON TOP of the object is just a bump (no stomping it upward)
      if (cy < o.position.y - obj.radius * 0.35) return false;
      let vy = v.y < 0 ? v.y * h.keepUp : v.y * h.keepDown;
      vy -= h.impulse * sc;
      const dx = clamp((o.position.x - blob.x) / (obj.radius + blob.r), -1, 1);
      let vx = v.x * 0.6 + dx * h.side * sc;
      const sp = Math.hypot(vx, vy);
      if (sp > h.maxSpeed) { vx *= h.maxSpeed / sp; vy *= h.maxSpeed / sp; }
      obj.hit(vx, vy);
      this.hitCd = h.cooldown;
      this.lastHitter = blob;
      for (const b of this.blobs) b.locked = b === blob;
      blob.hitFlash = 0.35; blob.sqV += 2.5;
      this.combo++; this.totalHits++;
      this.bestCombo = Math.max(this.bestCombo, this.combo);
      this.emit('hit', { blob, x: cx, y: cy, combo: this.combo, power: Math.hypot(vx, vy) });
      return true;
    }

    // --------------------------------------------------------------- collisions
    onCollisions(pairs, isStart) {
      for (const p of pairs) {
        const A = p.bodyA.parent, B = p.bodyB.parent, col = p.collision;
        if (A.isSensor || B.isSensor) {
          const pad = (A.plugin && A.plugin.pad) || (B.plugin && B.plugin.pad);
          if (pad) { const other = A.plugin && A.plugin.pad ? B : A; if (!other.isStatic) pad.trigger(other); }
          continue;
        }
        const n = col.normal;
        const va = this.velOf(A), vb = this.velOf(B);
        const rel = Math.abs((va.x - vb.x) * n.x + (va.y - vb.y) * n.y);
        const ba = A.plugin && A.plugin.blob, bb = B.plugin && B.plugin.blob;
        const oa = A.plugin && A.plugin.object, ob = B.plugin && B.plugin.object;
        let cx = 0, cy = 0, k = 0;
        for (const s of col.supports) if (s) { cx += s.x; cy += s.y; k++; }
        if (k) { cx /= k; cy /= k; } else { cx = A.position.x; cy = A.position.y; }

        if (isStart && ((ba && ob) || (bb && oa))) {     // blob touches the object: that's a HIT
          if (this.tryHit(ba || bb, oa || ob, cx, cy)) continue;
        }
        if (ba) ba.contact(B, col, isStart, rel);
        if (bb) bb.contact(A, col, isStart, rel);
        if (!isStart) continue;
        if (oa) oa.onImpact(rel, B, col, cx, cy);
        if (ob) ob.onImpact(rel, A, col, cx, cy);
        const ra = A.plugin && A.plugin.rock, rb = B.plugin && B.plugin.rock;
        if ((oa || ob) && !ba && !bb) this.objectLanded(oa ? A : B, B === (oa ? A : B) ? A : B, rel, cx, cy);
        if ((oa || ob || ra || rb) && !(ba || bb) && rel > 90) {
          const m = Math.max(oa || ob ? (oa ? A : B).mass : 0, ra || rb ? (ra ? A : B).mass : 0);
          this.emit('impact', { x: cx, y: cy, speed: rel, mass: m, kind: oa || ob ? 'object' : 'rock' });
          if ((oa || ob) && rel > 380) this.drama(rel * 0.12, 'bonk', cx, cy);
        }
      }
    }
    velOf(b) {
      if (b.plugin && b.plugin.vel) return b.plugin.vel;
      return { x: b.velocity.x / PXS, y: b.velocity.y / PXS };
    }
    /** the object touched the floor / a ledge: the juggling chain ends */
    objectLanded(objBody, other, rel, x, y) {
      if (!other.isStatic && !(other.plugin && other.plugin.kinematic)) return;
      if (other.label === 'wall' || other.label === 'ceiling') return;
      if (rel < 60) return;
      if (this.combo >= 4) { this.emit('comboLost', { count: this.combo, x, y }); this.drama(40 + this.combo * 6, 'combo', x, y); }
      this.combo = 0;
    }

    // ----------------------------------------------------------------- stepping
    /** one fixed physics step. inputs: array of {x, jumpHeld, jumpPressed} */
    step(dt, inputs) {
      this.simT += dt; this.time += dt;
      this.noooCd = Math.max(0, this.noooCd - dt);
      this.hitCd = Math.max(0, this.hitCd - dt);
      const ob = this.object, oc = ob.center();
      this.blobs.forEach((b, i) => {
        if (inputs && inputs[i]) b.input = inputs[i];
        b.lookX = oc.x - b.x; b.lookY = oc.y - b.y;
        const d = Math.hypot(b.lookX, b.lookY) || 1; b.lookX /= d; b.lookY /= d;
      });
      for (const h of this.hazards) h.update(dt);
      for (const b of this.blobs) b.update(dt);
      ob.beforeStep(dt);
      for (const r of this.rocks) r.age += dt;
      this.updateFilters();
      Engine.update(this.engine, this.stepMs);
      for (const b of this.blobs) b.afterStep(dt);
      ob.afterStep(dt);
      for (const r of [...this.rocks]) {
        if (!r.boulder && r.age > BBH.CONFIG.hazards.rockDespawn) { this.emit('rockPoof', { x: r.body.position.x, y: r.body.position.y, r: r.r }); this.removeRock(r); }
        else if (r.body.position.y > this.floorY + 600) this.removeRock(r);
      }
      this.checkRules(dt);
      this.record();
    }

    checkRules(dt) {
      const R = BBH.CONFIG.rules, ob = this.object, c = ob.center(), v = ob.speed();
      // is the object resting on a ledge?
      const bottom = ob.bottom();
      let on = null;
      for (const L of this.ledges) if (c.x >= L.x0 && c.x <= L.x1 && Math.abs(bottom - L.y) < 18) on = L;
      if (!on) for (const B of this.blocks) if (c.x >= B.x0 && c.x <= B.x1 && Math.abs(bottom - B.y) < 18) on = B;   // resting on a block: allowed, but it's no checkpoint
      if (on && Math.abs(v.y) < 80 && Math.abs(v.x) < 300) { this.restT = on === this.restLedge ? this.restT + dt : 0; this.restLedge = on; }
      else { this.restT = 0; this.restLedge = null; }
      if (this.restLedge && this.restT >= R.restTime && !this.pendingBounce) {
        const L = this.restLedge;
        if (L.goal && !this.won) {
          this.won = true; for (const b of this.blobs) { b.happy = 99; b.locked = false; }
          this.emit('win', { x: L.x, y: L.y });
        } else if (L.cp) {
          const idx = this.checkpoints.findIndex((cp) => cp.ledge === L);
          if (idx > this.cp) {
            this.cp = idx; this.checkpoints[idx].anim = 0.001;
            for (const b of this.blobs) { b.happy = 2.2; b.faceT = 0; }
            this.emit('checkpoint', { index: idx, x: L.x, y: L.y });
          }
        }
      }
      for (const cp of this.checkpoints) if (cp.anim > 0 && cp.anim < 1) cp.anim = Math.min(1, cp.anim + dt * 1.4);

      // bounce back rules: the object fell too far below the last checkpoint ledge, or broke
      if (!this.pendingBounce && !this.won) {
        const cp = this.checkpoints[this.cp];
        if (ob.broken) this.pendingBounce = ob.breakReason === 'crates' ? 'crates' : 'broken';
        else if (c.y > cp.y + R.fallMargin) this.pendingBounce = 'fell';
        if (this.pendingBounce) { this.drama(60, 'bounce', c.x, c.y); this.emit('bounceBack', { reason: this.pendingBounce }); }
      }
      // loose blobs get plopped back near the object for free
      for (const b of this.blobs) {
        if (b.y > c.y + R.blobRescueDepth || b.y > this.floorY + 500) {
          const x = clamp(c.x + (Math.random() < 0.5 ? -1 : 1) * (ob.radius + 70 + Math.random() * 60), this.minX + 60, this.maxX - 60);
          b.rescueTo(x, Math.min(c.y, this.floorY - 300) - 120);
        }
      }
      // "NOOO": the object plummets onto a teammate who is locked out and can't catch it, or a long chain is dropped
      if (this.noooCd <= 0 && !this.won && !this.pendingBounce && v.y > R.noooSpeed) {
        for (const b of this.blobs) {
          if (Math.abs(b.x - c.x) < ob.radius + 70 && b.y > c.y && b.y - c.y < 520 && b.locked) {
            this.noooCd = R.noooCooldown;
            for (const bb of this.blobs) bb.fear = 2.0;
            this.drama(100, 'nooo', c.x, c.y);
            this.emit('nooo', { x: c.x, y: c.y });
            break;
          }
        }
      }
      // fear: something big is falling on us
      if (v.y > 250) for (const b of this.blobs) { if (Math.abs(b.x - c.x) < ob.radius + 120 && b.y > c.y) b.fear = Math.max(b.fear, 0.4); }
    }

    // ------------------------------------------------------------------- replay
    record() {
      const keep = Math.round(BBH.CONFIG.feel.recordSeconds * BBH.CONFIG.world.stepHz);
      const ob = this.object;
      this.rec.push({
        t: this.simT,
        blobs: this.blobs.map((b) => b.pose()),
        obj: ob.poses(),
        rocks: this.rocks.map((r) => ({ x: r.body.position.x, y: r.body.position.y, a: r.body.angle, r: r.r, boulder: r.boulder, hue: r.hue })),
        plats: this.hazards.map((h) => h.snap()),
        look: this.lookDir(),
      });
      if (this.rec.length > keep) this.rec.shift();
    }
    lookDir() { const v = this.object.speed(); const l = Math.hypot(v.x, v.y) || 1; return { x: v.x / l, y: v.y / l, worry: v.y > 350 }; }

    /** pick the worst moment of the last few seconds -> { frames, label } */
    worstMoment() {
      const feel = BBH.CONFIG.feel;
      if (!this.rec.length) return null;
      const last = this.rec[this.rec.length - 1].t, first = this.rec[0].t;
      let best = null;
      for (const d of this.dramas) if (d.t >= first && d.score > (best ? best.score : 0) && d.label !== 'bounce') best = d;
      const center = best ? best.t : last - feel.replayWindow * 0.6;
      let t0 = clamp(center - feel.replayWindow * 0.65, first, last), t1 = Math.min(last, t0 + feel.replayWindow);
      t0 = Math.max(first, t1 - feel.replayWindow);
      return { frames: this.rec.filter((s) => s.t >= t0 && s.t <= t1), label: best ? best.label : 'fail', at: best };
    }

    // ------------------------------------------------------------------ drawing
    drawBackground(ctx, cam, w, h, t) {
      const th = this.def.theme;
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, th.skyTop); g.addColorStop(1, th.skyBottom);
      ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
      // the higher you climb, the dreamier the sky gets
      const alt = clamp(-cam.y / Math.max(1, -this.topY), 0, 1);
      ctx.fillStyle = `rgba(120,100,200,${alt * 0.22})`; ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = `rgba(255,255,255,${0.15 + alt * 0.6})`;
      for (let i = 0; i < 26; i++) {
        const sx = (i * 97.3) % w, sy = ((i * 61.7 + t * 4 * (1 + (i % 3))) % h);
        ctx.beginPath(); ctx.arc(sx, sy * 0.9, 1.2 + (i % 3), 0, 6.3); ctx.fill();
      }
      ctx.fillStyle = 'rgba(255,255,255,0.5)'; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.2, Math.min(w, h) * 0.09, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.3)'; ctx.beginPath(); ctx.arc(w * 0.82, h * 0.2, Math.min(w, h) * 0.13, 0, 6.3); ctx.fill();
      ctx.fillStyle = 'rgba(255,255,255,0.7)';
      for (let i = 0; i < 8; i++) {
        const sp = 0.08 + (i % 3) * 0.05;
        const cx = (((i * 331 + 120 - cam.x * sp - t * (6 + i * 2)) % (w + 400)) + (w + 400)) % (w + 400) - 200;
        const cy = (((i * 173 - cam.y * sp * 1.2) % (h + 200)) + (h + 200)) % (h + 200) - 60;
        const s = 0.8 + (i % 3) * 0.35;
        ctx.beginPath(); ctx.ellipse(cx, cy, 70 * s, 26 * s, 0, 0, 6.3); ctx.ellipse(cx - 40 * s, cy + 6 * s, 44 * s, 20 * s, 0, 0, 6.3); ctx.ellipse(cx + 44 * s, cy + 8 * s, 50 * s, 20 * s, 0, 0, 6.3); ctx.fill();
      }
      // distant hills, only visible near the floor
      const layers = [[0.12, th.hillFar, 0.62, 120, 0.004], [0.28, th.hillNear, 0.74, 90, 0.007]];
      for (const [par, col, base, amp, fq] of layers) {
        ctx.fillStyle = col; ctx.beginPath(); ctx.moveTo(0, h + 4000);
        const off = -cam.x * par, vy = -cam.y * par * 0.9 + cam.y * 0;
        for (let x = 0; x <= w + 20; x += 20) {
          const wx = (x - off) * fq * 7;
          ctx.lineTo(x, h * base + vy + Math.sin(wx) * amp * 0.5 + Math.sin(wx * 2.3 + 1.7) * amp * 0.25 + (-cam.y) * (1 - par) * 0.0);
        }
        ctx.lineTo(w, h + 4000); ctx.closePath(); ctx.fill();
      }
    }

    hash(x) { const h = Math.sin(x * 12.9898) * 43758.5453; return h - Math.floor(h); }

    drawIsland(ctx, L, th, t) {
      const x0 = L.x0, w = L.w, y = L.y, depth = 54;
      ctx.save();
      // soil underside (rounded, tapering)
      ctx.fillStyle = L.ice ? '#d8f3ff' : th.soil; ctx.strokeStyle = 'rgba(80,60,100,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(x0, y);
      ctx.lineTo(x0 + w, y);
      ctx.quadraticCurveTo(x0 + w - 10, y + depth * 0.9, x0 + w * 0.72, y + depth + 8);
      ctx.quadraticCurveTo(x0 + w * 0.5, y + depth + 26, x0 + w * 0.28, y + depth + 8);
      ctx.quadraticCurveTo(x0 + 10, y + depth * 0.9, x0, y);
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.45)'; ctx.lineWidth = 8; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(x0 + 40, y + 28); ctx.lineTo(x0 + w - 40, y + 28); ctx.stroke();
      // grass / ice top
      ctx.fillStyle = L.ice ? '#bdeaff' : th.grass; ctx.strokeStyle = 'rgba(80,60,100,0.35)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.roundRect(x0 - 6, y - 4, w + 12, 20, 10); ctx.fill(); ctx.stroke();
      if (L.ice) { ctx.strokeStyle = 'rgba(255,255,255,0.9)'; ctx.lineWidth = 4; ctx.beginPath(); ctx.moveTo(x0 + 10, y); ctx.lineTo(x0 + w - 10, y); ctx.stroke(); }
      // decorations
      for (let x = x0 + 30; x < x0 + w - 20; x += 64) {
        const r = this.hash(x + y), px = x + r * 30;
        if (L.ice) continue;
        if (r < 0.4) {
          ctx.strokeStyle = '#6fbf8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - 15); ctx.stroke();
          ctx.fillStyle = [th.accent, '#fff', '#ffe08a'][Math.floor(r * 30) % 3]; ctx.beginPath(); ctx.arc(px, y - 19, 6, 0, 6.3); ctx.fill();
          ctx.fillStyle = '#ffd23f'; ctx.beginPath(); ctx.arc(px, y - 19, 2.5, 0, 6.3); ctx.fill();
        } else if (r < 0.7) {
          ctx.strokeStyle = '#6fbf8a'; ctx.lineWidth = 3; ctx.beginPath();
          ctx.moveTo(px - 7, y); ctx.lineTo(px - 9, y - 11); ctx.moveTo(px, y); ctx.lineTo(px, y - 15); ctx.moveTo(px + 7, y); ctx.lineTo(px + 9, y - 10); ctx.stroke();
        }
      }
      ctx.restore();
    }

    drawBlock(ctx, B, th) {
      ctx.save();
      ctx.fillStyle = th.soil; ctx.strokeStyle = 'rgba(80,60,100,0.45)'; ctx.lineWidth = 4;
      ctx.beginPath(); ctx.roundRect(B.x0, B.y, B.w, B.h, 14); ctx.fill(); ctx.stroke();
      ctx.save(); ctx.clip();
      ctx.strokeStyle = 'rgba(255,255,255,0.5)'; ctx.lineWidth = 8;
      for (let y = B.y + 70; y < B.y + B.h; y += 90) { ctx.beginPath(); ctx.moveTo(B.x0, y); ctx.lineTo(B.x1, y); ctx.stroke(); }
      ctx.restore();
      ctx.fillStyle = th.grass; ctx.beginPath(); ctx.roundRect(B.x0 - 4, B.y - 4, B.w + 8, 20, 10); ctx.fill(); ctx.stroke();
      ctx.restore();
    }

    drawFloor(ctx, cam, th) {
      const x0 = this.minX - 400, x1 = this.maxX + 400, y = this.floorY;
      ctx.fillStyle = th.soil; ctx.fillRect(x0, y, x1 - x0, 1600);
      ctx.fillStyle = th.grass; ctx.strokeStyle = 'rgba(80,60,100,0.35)'; ctx.lineWidth = 3;
      ctx.fillRect(x0, y - 4, x1 - x0, 28); ctx.beginPath(); ctx.moveTo(x0, y - 4); ctx.lineTo(x1, y - 4); ctx.stroke();
      ctx.strokeStyle = 'rgba(255,255,255,0.4)'; ctx.lineWidth = 14;
      for (let k = 1; k < 3; k++) { ctx.beginPath(); ctx.moveTo(x0, y + 70 * k + 20); ctx.lineTo(x1, y + 70 * k + 20); ctx.stroke(); }
      for (let x = Math.floor(cam.left / 70) * 70; x < cam.right; x += 70) {
        if (x < this.minX || x > this.maxX) continue;
        const r = this.hash(x), px = x + r * 50;
        if (r < 0.35) { ctx.strokeStyle = '#6fbf8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px, y); ctx.lineTo(px, y - 16); ctx.stroke(); ctx.fillStyle = [th.accent, '#fff', '#ffe08a'][Math.floor(r * 30) % 3]; ctx.beginPath(); ctx.arc(px, y - 20, 6, 0, 6.3); ctx.fill(); }
        else if (r < 0.6) { ctx.strokeStyle = '#6fbf8a'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(px - 7, y); ctx.lineTo(px - 9, y - 11); ctx.moveTo(px, y); ctx.lineTo(px, y - 15); ctx.moveTo(px + 7, y); ctx.lineTo(px + 9, y - 10); ctx.stroke(); }
      }
    }

    drawWalls(ctx, cam, th) {
      // soft pillars of cloud mark the sides of the arena
      for (const sx of [this.minX, this.maxX]) {
        const g = ctx.createLinearGradient(sx - 90 * Math.sign(sx) * 0, 0, sx + (sx < 0 ? -140 : 140), 0);
        g.addColorStop(0, 'rgba(255,255,255,0.0)'); g.addColorStop(1, 'rgba(255,255,255,0.0)');
        ctx.strokeStyle = 'rgba(255,255,255,0.55)'; ctx.lineWidth = 8; ctx.setLineDash([26, 22]);
        ctx.beginPath(); ctx.moveTo(sx, cam.top - 100); ctx.lineTo(sx, Math.min(cam.bottom + 100, this.floorY)); ctx.stroke(); ctx.setLineDash([]);
      }
    }

    drawFlag(ctx, x, y, color, raise, t, big) {
      const H = big ? 190 : 120;
      ctx.save(); ctx.translate(x, y);
      ctx.strokeStyle = '#8d7aa8'; ctx.lineWidth = 6; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.moveTo(0, 4); ctx.lineTo(0, -H); ctx.stroke();
      ctx.fillStyle = '#8d7aa8'; ctx.beginPath(); ctx.arc(0, -H, 7, 0, 6.3); ctx.fill();
      const fy = -H + 12 + (1 - raise) * (H - 40), fw = big ? 86 : 60, fh = big ? 56 : 38;
      ctx.fillStyle = color; ctx.strokeStyle = 'rgba(60,40,80,0.5)'; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.moveTo(3, fy);
      for (let i = 0; i <= 8; i++) { const k = i / 8; ctx.lineTo(3 + k * fw, fy + Math.sin(t * 5 + k * 5) * 5 * k); }
      for (let i = 8; i >= 0; i--) { const k = i / 8; ctx.lineTo(3 + k * fw * 0.92, fy + fh + Math.sin(t * 5 + k * 5 + 0.4) * 5 * k); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      if (big) { ctx.fillStyle = '#fff'; ctx.font = '800 26px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('★', 3 + fw * 0.4, fy + fh * 0.7); }
      ctx.restore();
    }

    /** draw the world. `snap` (optional) draws recorded actors instead of live ones (replay of shame) */
    drawWorld(ctx, cam, t, snap, zoom) {
      const th = this.def.theme;
      this.drawWalls(ctx, cam, th);
      this.drawFloor(ctx, cam, th);
      for (const B of this.blocks) if (B.y < cam.bottom + 80 && B.y + B.h > cam.top - 80) this.drawBlock(ctx, B, th);
      for (const L of this.ledges) if (L.y > cam.top - 120 && L.y < cam.bottom + 120) this.drawIsland(ctx, L, th, t);
      this.checkpoints.forEach((c, i) => {
        if (c.y < cam.top - 250 || c.y > cam.bottom + 250) return;
        const reached = i <= this.cp;
        this.drawFlag(ctx, c.flagX, c.y, reached ? '#6fe08f' : '#c9bfd9', i === 0 ? 0.55 : (reached ? c.anim : 0.35), t, false);
      });
      this.drawFlag(ctx, this.goalLedge.x + this.goalLedge.w * 0.32, this.goalLedge.y, this.won ? '#ffd23f' : '#ff7eb6', 1, t, true);
      for (const h of this.hazards) { if (snap && h.snap) continue; h.draw(ctx, t, cam); }
      if (snap) {
        this.hazards.forEach((h, i) => { if (snap.plats[i]) h.drawSnap(ctx, t, snap.plats[i]); });
        this.object.draw(ctx, t, snap.obj, { look: snap.look, worry: snap.look.worry });
        for (const r of snap.rocks) this.drawRock(ctx, r, 1);
        this.blobs.forEach((b, i) => b.draw(ctx, t, snap.blobs[i], zoom));
        this.blobs.forEach((b, i) => b.drawTag(ctx, snap.blobs[i], zoom));
      } else {
        const look = this.lookDir();
        this.object.draw(ctx, t, this.object.poses(), { look, worry: look.worry });
        for (const r of this.rocks) this.drawRock(ctx, { x: r.body.position.x, y: r.body.position.y, a: r.body.angle, r: r.r, boulder: r.boulder, hue: r.hue }, clamp((BBH.CONFIG.hazards.rockDespawn - r.age) / 1.5, 0, 1));
        for (const b of this.blobs) b.draw(ctx, t, null, zoom);
        for (const b of this.blobs) b.drawTag(ctx, null, zoom);
      }
    }

    drawRock(ctx, r, alpha) {
      ctx.save(); ctx.globalAlpha = alpha; ctx.translate(r.x, r.y); ctx.rotate(r.a);
      ctx.fillStyle = r.hue; ctx.strokeStyle = '#5b4a6e'; ctx.lineWidth = 3.5; ctx.lineJoin = 'round';
      ctx.beginPath();
      if (r.boulder) ctx.arc(0, 0, r.r, 0, 6.3);
      else for (let i = 0; i < 7; i++) { const a = (i / 7) * 6.2832, rr = r.r * (0.94 + 0.08 * Math.sin(i * 2.4)); ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * rr, Math.sin(a) * rr); }
      ctx.closePath(); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.35)'; ctx.beginPath(); ctx.arc(-r.r * 0.3, -r.r * 0.3, r.r * 0.22, 0, 6.3); ctx.fill();
      ctx.strokeStyle = 'rgba(70,50,90,0.4)'; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(r.r * 0.1, -r.r * 0.1); ctx.lineTo(r.r * 0.4, r.r * 0.3); ctx.moveTo(-r.r * 0.3, r.r * 0.3); ctx.lineTo(-r.r * 0.1, r.r * 0.55); ctx.stroke();
      ctx.restore();
    }
  }

  BBH.Level = Level;
})();
