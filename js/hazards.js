/* hazards.js - wind zones, falling rocks, launch pads (mushroom/spring), roaming boulder, moving platforms. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const { Bodies, Body, Composite } = Matter;
  const PXS = 1 / 60, ACC = 1e-6;
  const rand = (a, b) => a + Math.random() * (b - a);
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Hazard {
    constructor(def, level) { this.def = def; this.level = level; }
    update() {}
    reset() {}
    draw() {}
    drawFront() {}
    snap() { return null; }
    drawSnap() {}
  }

  // ======================================================================= WIND
  class Wind extends Hazard {
    constructor(def, level) {
      super(def, level);
      this.x0 = level.minX; this.x1 = level.maxX;
      this.y0 = def.y0; this.y1 = def.y1;
      this.accel = def.accel || [BBH.CONFIG.hazards.windAccel, 0];
      this.strength = 1; this.t = Math.random() * 3; this.warned = false;
      this.streaks = []; for (let i = 0; i < 26; i++) this.streaks.push({ x: Math.random(), y: Math.random(), s: rand(0.6, 1.4), l: rand(60, 160) });
    }
    envelope() {
      const g = this.def.gust;
      if (!g) return 1;
      const ph = this.t % g.period, start = g.period - g.on;
      if (ph < start - 0.8) return 0;
      if (ph < start) return (ph - (start - 0.8)) / 0.8 * 0.25;   // telltale breeze before the gust
      return Math.min(1, 0.25 + (ph - start) * 4);
    }
    update(dt) {
      this.t += dt;
      this.strength = this.envelope();
      if (this.def.gust && this.strength > 0.9 && !this.warned) { this.warned = true; this.level.emit('gust', { x: (this.x0 + this.x1) / 2, y: (this.y0 + this.y1) / 2 }); }
      if (this.strength < 0.5) this.warned = false;
      if (this.strength <= 0.3) return;
      const f = this.strength, cfg = BBH.CONFIG.object;
      const push = (b, k) => {
        const p = b.position;
        if (p.x < this.x0 || p.x > this.x1 || p.y < this.y0 || p.y > this.y1) return;
        Body.applyForce(b, p, { x: this.accel[0] * b.mass * ACC * f * k, y: this.accel[1] * b.mass * ACC * f * k });
      };
      for (const bl of this.level.blobs) push(bl.body, 1);
      for (const ob of this.level.object.bodies) push(ob, cfg.windFactor);
      for (const r of this.level.rocks) push(r.body, 0.5);
    }
    draw(ctx, t, cam) {
      const f = this.strength;
      if (f < 0.05) return;
      const dir = Math.sign(this.accel[0]) || 1;
      ctx.save();
      ctx.globalAlpha = 0.35 * Math.min(1, f * 1.3);
      ctx.strokeStyle = '#ffffff'; ctx.lineWidth = 4; ctx.lineCap = 'round';
      const W = this.x1 - this.x0, H = this.y1 - this.y0;
      for (const s of this.streaks) {
        const prog = ((t * 0.35 * s.s * (f > 0.5 ? 2.2 : 0.8) + s.x) % 1);
        const x = dir > 0 ? this.x0 + prog * W : this.x1 - prog * W;
        const y = this.y0 + s.y * H;
        ctx.beginPath(); ctx.moveTo(x, y); ctx.quadraticCurveTo(x - dir * s.l * 0.5, y - 14, x - dir * s.l, y); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ======================================================================= PADS
  class Pad extends Hazard {
    constructor(def, level) {
      super(def, level);
      this.kind = def.type;
      this.w = def.w || 130;
      const L = def.ledge != null && def.ledge >= 0 ? level.ledges[def.ledge] : null;
      this.x = def.x != null ? def.x : (L ? L.x : 0) + (def.dx || 0);
      this.capY = def.y != null ? def.y : (L ? L.y : level.floorY);
      this.power = def.power || 600;
      this.angle = (def.angle || 0) * Math.PI / 180;
      this.squash = 0; this.cool = new Map();
      this.sensorW = this.w * 0.62;   // trigger zone is narrower than the drawn cap, so you can stand next to it
      this.sensor = Bodies.rectangle(this.x, this.capY - 20, this.sensorW, 44, { isStatic: true, isSensor: true, label: 'pad' });
      this.sensor.plugin.pad = this;
      Composite.add(level.engine.world, this.sensor);
    }
    update(dt) {
      this.squash = Math.max(0, this.squash - dt * 3.5);
      for (const [k, v] of this.cool) { if (v - dt <= 0) this.cool.delete(k); else this.cool.set(k, v - dt); }
    }
    /** a dynamic body overlaps the pad's trigger zone */
    trigger(body) {
      if (this.cool.has(body.id)) return;
      const isBlob = !!(body.plugin && body.plugin.blob);
      const k = isBlob ? 1 : BBH.CONFIG.hazards.padObjectFactor;
      const vx = Math.sin(this.angle) * this.power * k, vy = -Math.cos(this.angle) * this.power * k;
      // already moving away faster than the pad would send it? leave it alone
      if (body.velocity.y / PXS < vy * 0.7) return;
      Body.setVelocity(body, { x: vx * PXS, y: vy * PXS });
      if (body.plugin && body.plugin.blob) { body.plugin.blob.sqV += 3.5; body.plugin.blob.jumping = false; }
      this.cool.set(body.id, BBH.CONFIG.hazards.padCooldown);
      this.squash = 1;
      this.level.emit('pad', { x: this.x, y: this.capY, big: !isBlob, kind: this.kind });
    }
    draw(ctx, t) {
      const x = this.x, base = this.capY, s = this.squash;
      ctx.save();
      if (this.kind === 'mushroom') {
        ctx.fillStyle = '#fff1dc'; ctx.strokeStyle = '#b98a6a'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(x - 22, base - 34, 44, 40, 10); ctx.fill(); ctx.stroke();
        const w = this.w * (1 + s * 0.12), h = 46 * (1 - s * 0.45);
        ctx.translate(x, base - 26); ctx.rotate(this.angle * 0.35);
        ctx.fillStyle = '#ff7a9c'; ctx.strokeStyle = '#b8475f'; ctx.lineWidth = 3.5;
        ctx.beginPath(); ctx.moveTo(-w / 2, 0); ctx.bezierCurveTo(-w / 2, -h * 1.6, w / 2, -h * 1.6, w / 2, 0); ctx.quadraticCurveTo(0, 12, -w / 2, 0); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#fff';
        [[-0.25, -0.5, 9], [0.12, -0.78, 11], [0.32, -0.32, 7], [-0.05, -0.28, 6]].forEach(([a, b, r]) => { ctx.beginPath(); ctx.arc(a * w, b * h, r, 0, 6.3); ctx.fill(); });
      } else {
        const w = this.w, coil = 52 * (1 - s * 0.55);
        ctx.translate(x, base); ctx.rotate(this.angle * 0.5);
        ctx.fillStyle = '#7fd6c4'; ctx.strokeStyle = '#3d8f80'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-w / 2, -8, w, 12, 5); ctx.fill(); ctx.stroke();
        ctx.strokeStyle = '#ff9a5c'; ctx.lineWidth = 6; ctx.lineJoin = 'round'; ctx.beginPath();
        for (let i = 0; i <= 6; i++) { const yy = -8 - (coil * i) / 6; ctx.lineTo((i % 2 ? 1 : -1) * w * 0.32, yy); }
        ctx.stroke();
        ctx.fillStyle = '#ff7eb6'; ctx.strokeStyle = '#b8475f'; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.roundRect(-w / 2, -8 - coil - 12, w, 12, 5); ctx.fill(); ctx.stroke();
      }
      ctx.restore();
    }
  }

  // ======================================================================= ROCKS
  class RockField extends Hazard {
    constructor(def, level) {
      super(def, level);
      this.timer = rand(def.every[0], def.every[1]);
      this.warnings = [];
    }
    reset() {
      for (const r of this.level.rocks.filter((r) => r.owner === this)) this.level.removeRock(r);
      this.warnings.length = 0; this.timer = 3;
    }
    update(dt) {
      const L = this.level, c = L.object.center();
      const active = c.y > this.def.y0 && c.y < this.def.y1;
      if (active) {
        this.timer -= dt;
        if (this.timer <= 0) {
          this.timer = rand(this.def.every[0], this.def.every[1]);
          const targets = [c, ...L.blobs.map((b) => b.body.position)];
          const tg = targets[Math.floor(Math.random() * targets.length)];
          const x = clamp(tg.x + rand(-140, 140), L.minX + 40, L.maxX - 40);
          this.warnings.push({ x, y: tg.y, t: BBH.CONFIG.hazards.rockWarn, r: rand(this.def.radius[0], this.def.radius[1]) });
          L.emit('rockWarn', { x, y: tg.y - 250 });
        }
      }
      for (const w of this.warnings) w.t -= dt;
      while (this.warnings.length && this.warnings[0].t <= 0) {
        const w = this.warnings.shift();
        L.spawnRock(w.x, Math.min(w.y, c.y) - 950, w.r, this);
      }
    }
    draw(ctx, t) {
      for (const w of this.warnings) {
        const k = 1 - w.t / BBH.CONFIG.hazards.rockWarn;
        ctx.save(); ctx.translate(w.x, w.y - 260);
        ctx.strokeStyle = `rgba(255,90,110,${0.25 + 0.2 * Math.sin(t * 20)})`; ctx.lineWidth = 4; ctx.setLineDash([10, 12]);
        ctx.beginPath(); ctx.moveTo(0, -40); ctx.lineTo(0, 420); ctx.stroke(); ctx.setLineDash([]);
        const s = 1 + k * 0.25;
        ctx.scale(s, s);
        ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.moveTo(0, -42); ctx.lineTo(20, -8); ctx.lineTo(-20, -8); ctx.closePath(); ctx.fill();
        ctx.fillStyle = '#fff'; ctx.font = '700 22px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -12);
        ctx.restore();
      }
    }
  }

  // ===================================================================== BOULDER
  class Boulder extends Hazard {
    constructor(def, level) {
      super(def, level);
      this.ledge = level.ledges[def.ledge];
      this.timer = rand(def.every[0], def.every[1]) * 0.7;
      this.warn = 0; this.live = null;
    }
    reset() {
      if (this.live) { this.level.removeRock(this.live); this.live = null; }
      this.warn = 0; this.timer = rand(this.def.every[0], this.def.every[1]) * 0.6;
    }
    update(dt) {
      const L = this.level, c = L.object.center(), d = this.def, ld = this.ledge;
      if (this.live && !L.rocks.includes(this.live)) this.live = null;
      if (this.live) {
        if (this.live.body.position.y > ld.y + 700 || this.live.age > 25) { L.removeRock(this.live); this.live = null; }
        return;
      }
      if (c.y < ld.y - 650 || c.y > ld.y + 420) return;   // only while the team is near this ledge
      if (this.warn > 0) {
        this.warn -= dt;
        if (this.warn <= 0) {
          const x = ld.x - ld.w / 2 + d.radius + 8, y = ld.y - d.radius - 8;
          this.live = L.spawnRock(x, y, d.radius, this, { boulder: true, vx: 380 });
          L.emit('boulder', { x, y });
        }
        return;
      }
      this.timer -= dt;
      if (this.timer <= 0) {
        this.timer = rand(d.every[0], d.every[1]);
        this.warn = BBH.CONFIG.hazards.boulderWarn;
        L.emit('boulderWarn', { x: ld.x - ld.w / 2 + 40, y: ld.y });
      }
    }
    draw(ctx, t) {
      if (this.warn <= 0) return;
      const ld = this.ledge;
      ctx.save(); ctx.translate(ld.x - ld.w / 2 + 50 + Math.sin(t * 60) * 3, ld.y);
      ctx.fillStyle = '#ff5a6e'; ctx.beginPath(); ctx.moveTo(0, -150); ctx.lineTo(34, -92); ctx.lineTo(-34, -92); ctx.closePath(); ctx.fill();
      ctx.fillStyle = '#fff'; ctx.font = '800 34px system-ui,sans-serif'; ctx.textAlign = 'center'; ctx.fillText('!', 0, -100);
      ctx.restore();
    }
  }

  // =================================================================== PLATFORM
  class Platform extends Hazard {
    constructor(def, level) {
      super(def, level);
      this.w = def.w || 300; this.h = 26;
      this.path = def.path;
      this.speed = def.speed || 90; this.pause = def.pause || 2;
      const a = this.path[0], b = this.path[1];
      this.len = Math.hypot(b[0] - a[0], b[1] - a[1]);
      this.moveT = this.len / this.speed;
      this.phase = 0;
      this.body = Bodies.rectangle(a[0], a[1], this.w, this.h, { isStatic: true, friction: 0.9, label: 'platform', collisionFilter: { category: 1, mask: 0xFFFFFFFF } });
      this.body.plugin.kinematic = true; this.body.plugin.vel = { x: 0, y: 0 };
      Composite.add(level.engine.world, this.body);
      level.addOneWay(this.body);
      this.pos = { x: a[0], y: a[1] };
    }
    at(phase) {
      const cyc = 2 * (this.moveT + this.pause);
      let t = ((phase % cyc) + cyc) % cyc, k;
      if (t < this.pause) k = 0;
      else if (t < this.pause + this.moveT) k = (t - this.pause) / this.moveT;
      else if (t < 2 * this.pause + this.moveT) k = 1;
      else k = 1 - (t - 2 * this.pause - this.moveT) / this.moveT;
      k = k * k * (3 - 2 * k);   // ease in/out so riders aren't flung
      const a = this.path[0], b = this.path[1];
      return { x: a[0] + (b[0] - a[0]) * k, y: a[1] + (b[1] - a[1]) * k };
    }
    update(dt) {
      this.phase += dt;
      const np = this.at(this.phase);
      const vx = (np.x - this.pos.x) / dt, vy = (np.y - this.pos.y) / dt;
      this.body.plugin.vel.x = vx; this.body.plugin.vel.y = vy;
      Body.setPosition(this.body, np, true);
      this.pos = np;
    }
    snap() { return { x: this.pos.x, y: this.pos.y }; }
    draw(ctx, t) { this.drawAt(ctx, this.pos); }
    drawSnap(ctx, t, s) { this.drawAt(ctx, s); }
    drawAt(ctx, p) {
      const w = this.w, h = this.h;
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = '#b9a7ff'; ctx.strokeStyle = '#6a55c9'; ctx.lineWidth = 3.5;
      ctx.beginPath(); ctx.roundRect(-w / 2, -h / 2, w, h, 9); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d8ceff'; ctx.beginPath(); ctx.roundRect(-w / 2 + 6, -h / 2 + 4, w - 12, 6, 3); ctx.fill();
      ctx.fillStyle = '#6a55c9';
      for (let i = -3; i <= 3; i++) { ctx.beginPath(); ctx.arc(i * (w / 8), h / 2 - 6, 3, 0, 6.3); ctx.fill(); }
      ctx.restore();
    }
  }

  BBH.createHazard = function (def, level) {
    switch (def.type) {
      case 'wind': return new Wind(def, level);
      case 'spring': case 'mushroom': return new Pad(def, level);
      case 'rocks': return new RockField(def, level);
      case 'boulder': return new Boulder(def, level);
      case 'platform': return new Platform(def, level);
    }
    throw new Error('Unknown hazard type: ' + def.type);
  };
})();
