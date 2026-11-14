/* blob.js - the squishy player character: physics drive, flop, lock-out ghost state, and drawing. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const { Bodies, Body, Composite } = Matter;

  const PXS = 1 / 60;   // Matter velocity unit: px per 1/60 s
  const ACC = 1e-6;     // (px/s^2) * mass  ->  Matter force
  BBH.PXS = PXS; BBH.ACC = ACC;

  BBH.BLOB_STYLES = [
    { name: 'Green',  color: '#4fd96a' },
    { name: 'Red',    color: '#ff5a5f' },
    { name: 'Blue',   color: '#4aa8ff' },
    { name: 'Yellow', color: '#ffd23f' },
  ];

  // collision categories (ledges get their own bits, see level.js)
  BBH.CAT = { WORLD: 1, BLOB: 2, OBJECT: 4 };

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  function shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
    const f = (c) => Math.round(clamp(amt < 0 ? c * (1 + amt) : c + (255 - c) * amt, 0, 255));
    return `rgb(${f(r)},${f(g)},${f(b)})`;
  }
  BBH.shade = shade;

  class Blob {
    constructor(level, index) {
      const cfg = BBH.CONFIG.blob;
      this.level = level;
      this.index = index;
      this.style = BBH.BLOB_STYLES[index];
      this.r = cfg.radius;
      this.body = Bodies.circle(0, 0, cfg.radius, {
        density: cfg.density, friction: cfg.friction, frictionStatic: 0, frictionAir: cfg.airFriction,
        restitution: cfg.bounciness, slop: 0.06, label: 'blob',
        collisionFilter: { category: BBH.CAT.BLOB, mask: 0xFFFFFFFF },
      }, 26);
      this.body.plugin.blob = this;
      this.baseInertia = this.body.inertia;
      Body.setInertia(this.body, Infinity);
      Composite.add(level.engine.world, this.body);

      this.grounded = false; this.coyote = 0; this.jumpBuf = 0; this.jumping = false; this.jumpHeld = false;
      this.limp = 0;
      this.locked = false;          // just hit the object: ghosted until a teammate hits it
      this.groundVel = { x: 0, y: 0 }; this.onIce = false;
      this._hits = 0; this._gvx = 0; this._gvy = 0; this._ice = false;
      // visual state
      this.sq = 0; this.sqV = 0; this.lean = 0; this.face = 'normal'; this.faceT = 0; this.happy = 0; this.fear = 0;
      this.eye = { x: 0, y: 0, vx: 0, vy: 0 }; this.lastVx = 0; this.lastVy = 0; this.wob = 0; this.hitFlash = 0;
      this.lookX = 0; this.lookY = 0;
      this.input = { x: 0, jumpHeld: false, jumpPressed: false };
    }

    reset(x, y) {
      Body.setInertia(this.body, Infinity);
      Body.setAngle(this.body, 0); Body.setAngularVelocity(this.body, 0);
      Body.setPosition(this.body, { x, y }); Body.setVelocity(this.body, { x: 0, y: 0 });
      this.limp = 0; this.coyote = 0; this.jumpBuf = 0; this.grounded = false; this.jumping = false;
      this.locked = false; this.hitFlash = 0;
      this.sq = 0.25; this.sqV = 0; this.face = 'normal'; this.fear = 0;
    }

    get x() { return this.body.position.x; }
    get y() { return this.body.position.y; }

    /** called by Level for every (solid) contact this blob is part of */
    contact(other, col, isStart, relSpeed) {
      const cfg = BBH.CONFIG.blob, b = this.body;
      let cx = 0, cy = 0, n = 0;
      for (const s of col.supports) if (s) { cx += s.x; cy += s.y; n++; }
      if (!n) return;
      cx /= n; cy /= n;
      let dx = cx - b.position.x, dy = cy - b.position.y;
      const d = Math.hypot(dx, dy) || 1; dx /= d; dy /= d;
      const isGround = dy > cfg.groundMinNormalY;
      const isObject = !!(other.plugin && other.plugin.object);
      if (isGround && !isObject) {
        this._hits++;
        const v = other.plugin && other.plugin.vel ? other.plugin.vel : { x: other.velocity.x / PXS, y: other.velocity.y / PXS };
        if (other.isStatic || (other.plugin && other.plugin.kinematic) || this._hits === 1) { this._gvx = v.x; this._gvy = v.y; }
        if (other.plugin && other.plugin.surface === 'ice') this._ice = true;
      }
      if (!isStart || isObject) return;   // object contacts are "hits", handled by the level
      const lvl = this.level;
      let boost = 1;
      const dynamicOther = !other.isStatic && !(other.plugin && other.plugin.kinematic);
      if (dynamicOther) boost = clamp(Math.sqrt(other.mass / b.mass) / 2, 0.5, cfg.flopMassBoostMax);
      const eff = relSpeed * boost;
      if (this.limp <= 0) {
        if (dynamicOther && eff > cfg.flopHitSpeed) { this.flop(eff, cx, cy, other); return; }
        if (!dynamicOther && isGround && relSpeed > cfg.flopFallSpeed) { this.flop(relSpeed, cx, cy, other); return; }
      }
      if (isGround && relSpeed > 110) {
        this.sqV += clamp(relSpeed / 140, 0.5, 4.5);
        lvl.emit('blobLand', { blob: this, x: cx, y: cy, speed: relSpeed });
      } else if (!isGround && relSpeed > 150) {
        this.sqV += clamp(relSpeed / 220, 0.3, 3);
        lvl.emit('blobBump', { blob: this, x: cx, y: cy, speed: relSpeed, other });
      }
    }

    flop(power, x, y, other) {
      const cfg = BBH.CONFIG.blob;
      this.limp = cfg.flopTime;
      Body.setInertia(this.body, this.baseInertia);
      Body.setAngularVelocity(this.body, (Math.random() < 0.5 ? -1 : 1) * clamp(power / 500, 0.2, 0.6));
      this.face = 'dizzy'; this.faceT = cfg.flopTime;
      this.sqV += 3;
      this.level.emit('flop', { blob: this, x, y, power, other });
    }

    recover() {
      Body.setInertia(this.body, Infinity);
      Body.setAngle(this.body, 0); Body.setAngularVelocity(this.body, 0);
      Body.setVelocity(this.body, { x: this.body.velocity.x * 0.3, y: -260 * PXS });
      this.limp = 0; this.sqV -= 4; this.face = 'normal';
      this.level.emit('recover', { blob: this });
    }

    rescueTo(x, y) {
      this.reset(x, y);
      this.level.emit('blobRescue', { blob: this, x, y });
    }

    // ----------------------------------------------------------------- per step
    update(dt) {
      const cfg = BBH.CONFIG.blob, inp = this.input, b = this.body;
      this.coyote = Math.max(0, this.coyote - dt);
      this.jumpBuf = Math.max(0, this.jumpBuf - dt);
      this.faceT = Math.max(0, this.faceT - dt);
      this.happy = Math.max(0, this.happy - dt);
      this.hitFlash = Math.max(0, this.hitFlash - dt);
      this.jumpHeld = inp.jumpHeld;
      if (inp.jumpPressed) this.jumpBuf = cfg.jumpBuffer;

      if (this.limp > 0) {
        this.limp -= dt;
        if (this.limp <= 0) this.recover();
        return;
      }

      const m = b.mass;
      const vx = b.velocity.x / PXS, vy = b.velocity.y / PXS;
      const dir = inp.x;
      const iceF = this.onIce ? cfg.iceControl : 1;
      let fx = 0, fy = 0;
      if (this.grounded) {
        const s = vx - this.groundVel.x;
        const target = dir * cfg.moveSpeed;
        let A;
        if (dir === 0) A = cfg.brakeAccel * iceF;
        else if (dir * s < 0) A = Math.max(cfg.groundAccel, cfg.brakeAccel) * iceF;
        else A = cfg.groundAccel * iceF;
        fx = m * clamp((target - s) / 0.05, -A, A) * ACC;
      } else {
        const A = dir === 0 ? cfg.airAccel * 0.12 : cfg.airAccel;
        fx = m * clamp((dir * cfg.moveSpeed - vx) / 0.05, -A, A) * ACC;
      }
      // floaty fall while holding jump
      if (!this.grounded && vy > 0 && this.jumpHeld) fy -= m * BBH.CONFIG.world.gravity * 0.001 * cfg.fallFloat;
      Body.applyForce(b, b.position, { x: fx, y: fy });

      // jump
      if (this.jumpBuf > 0 && this.coyote > 0) {
        Body.setVelocity(b, { x: b.velocity.x, y: (-cfg.jumpSpeed + Math.min(0, this.groundVel.y)) * PXS });
        this.jumpBuf = 0; this.coyote = 0; this.jumping = true; this.grounded = false;
        this.sqV -= 3.2;
        this.level.emit('jump', { blob: this, x: b.position.x, y: b.position.y + this.r });
      }
      if (this.jumping) {
        if (b.velocity.y >= 0) this.jumping = false;
        else if (!this.jumpHeld) { Body.setVelocity(b, { x: b.velocity.x, y: b.velocity.y * cfg.jumpCut }); this.jumping = false; }
      }
    }

    /** after Engine.update: resolve this step's contacts into grounded state and animate */
    afterStep(dt) {
      if (this._hits > 0) {
        this.grounded = true; this.coyote = BBH.CONFIG.blob.coyoteTime;
        this.groundVel = { x: this._gvx, y: this._gvy }; this.onIce = this._ice;
      } else { this.grounded = false; this.onIce = false; this.groundVel = { x: 0, y: 0 }; }
      this._hits = 0; this._gvx = 0; this._gvy = 0; this._ice = false;
      this.animate(dt);
    }

    animate(dt) {
      const b = this.body;
      const vx = b.velocity.x / PXS, vy = b.velocity.y / PXS;
      const k = 220, c = 14;
      this.sqV += (-k * this.sq - c * this.sqV) * dt;
      this.sq += this.sqV * dt;
      this.sq = clamp(this.sq, -0.6, 0.65);
      if (!this.grounded && this.limp <= 0) this.sq += (clamp(-Math.abs(vy) / 1800, -0.3, 0) - this.sq) * Math.min(1, dt * 6) * 0.5;
      this.lean += (clamp(vx / 450, -1, 1) * 0.22 - this.lean) * Math.min(1, dt * 10);
      // googly pupils: swing with acceleration, settle toward the object
      const ax = (vx - this.lastVx) / Math.max(dt, 1e-4), ay = (vy - this.lastVy) / Math.max(dt, 1e-4);
      this.lastVx = vx; this.lastVy = vy;
      const e = this.eye;
      e.vx += (-(e.x - this.lookX * 0.55) * 160 - e.vx * 9 - ax * 0.0009) * dt;
      e.vy += (-(e.y - this.lookY * 0.55) * 160 - e.vy * 9 - ay * 0.0009 + 18) * dt;
      e.x = clamp(e.x + e.vx * dt, -1, 1); e.y = clamp(e.y + e.vy * dt, -1, 1);
      this.wob += dt * (this.limp > 0 ? 14 : 6);
      if (this.faceT <= 0 && this.limp <= 0) this.face = this.happy > 0 ? 'happy' : this.fear > 0 ? 'wide' : this.locked ? 'sleepy' : 'normal';
      this.fear = Math.max(0, this.fear - dt);
    }

    pose() {
      const b = this.body;
      return {
        x: b.position.x, y: b.position.y, angle: this.limp > 0 ? b.angle : this.lean, sq: this.sq, face: this.face,
        ex: this.eye.x, ey: this.eye.y, limp: this.limp > 0, wob: this.wob, locked: this.locked, flash: this.hitFlash,
      };
    }

    // ------------------------------------------------------------------- drawing
    draw(ctx, t, p, zoom) {
      p = p || this.pose();
      const r = this.r, col = this.style.color;
      ctx.save();
      if (p.locked) ctx.globalAlpha = BBH.CONFIG.hit.ghostAlpha + 0.1 * Math.sin(t * 6);
      ctx.translate(p.x, p.y);
      ctx.rotate(p.angle);
      let sx = 1 + p.sq * 0.7, sy = 1 - p.sq * 0.7;
      if (p.limp) { sx = 1 + Math.sin(p.wob) * 0.14; sy = 1 + Math.cos(p.wob * 1.3) * 0.14; }
      else ctx.translate(0, r * (1 - sy));
      ctx.scale(sx, sy);
      const grad = ctx.createRadialGradient(-r * 0.35, -r * 0.45, r * 0.15, 0, 0, r * 1.15);
      grad.addColorStop(0, shade(col, 0.45)); grad.addColorStop(0.55, col); grad.addColorStop(1, shade(col, -0.18));
      ctx.fillStyle = grad; ctx.strokeStyle = shade(col, -0.38); ctx.lineWidth = 2.5; ctx.lineJoin = 'round';
      if (p.locked) ctx.setLineDash([5, 4]);
      ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.97, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
      ctx.setLineDash([]);
      if (p.flash > 0) { ctx.fillStyle = `rgba(255,255,255,${p.flash * 1.6})`; ctx.beginPath(); ctx.ellipse(0, 0, r, r * 0.97, 0, 0, 6.3); ctx.fill(); }
      // slime: gooey puddle lip at the bottom, glossy highlight on top
      ctx.fillStyle = shade(col, -0.12); ctx.strokeStyle = shade(col, -0.38); ctx.lineWidth = 2;
      ctx.beginPath(); ctx.ellipse(0, r * 0.93, r * 1.08, r * 0.17, 0, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = 'rgba(255,255,255,0.65)';
      ctx.beginPath(); ctx.ellipse(-r * 0.52, -r * 0.62, r * 0.2, r * 0.11, -0.7, 0, 6.3); ctx.fill();
      ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.8, r * 0.06, 0, 6.3); ctx.fill();
      this.drawFace(ctx, p, r);
      ctx.restore();
    }

    drawFace(ctx, p, r) {
      const face = p.face;
      const ey = -r * 0.22, exs = r * 0.4;
      let er = r * 0.36;
      if (face === 'wide') er = r * 0.42;
      for (const s of [-1, 1]) {
        const cx = s * exs;
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = 1.8;
        if (face === 'happy') {
          ctx.lineWidth = 3; ctx.lineCap = 'round';
          ctx.beginPath(); ctx.arc(cx, ey + er * 0.35, er * 0.65, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
          continue;
        }
        if (face === 'sleepy') {   // half-closed, bored: you're locked out until a teammate hits the ball
          ctx.beginPath(); ctx.arc(cx, ey, er, 0, 6.3); ctx.fill(); ctx.stroke();
          ctx.fillStyle = '#2b2236'; ctx.beginPath(); ctx.arc(cx + p.ex * 2, ey + er * 0.35, er * 0.42, 0, 6.3); ctx.fill();
          ctx.fillStyle = shade(this.style.color, -0.05); ctx.fillRect(cx - er - 1, ey - er - 1, er * 2 + 2, er * 1.15);
          ctx.beginPath(); ctx.moveTo(cx - er, ey - er * 0.1); ctx.lineTo(cx + er, ey - er * 0.1); ctx.stroke();
          continue;
        }
        ctx.beginPath(); ctx.arc(cx, ey, er, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2236';
        if (face === 'dizzy') {
          ctx.strokeStyle = '#2b2236'; ctx.lineWidth = 2; ctx.beginPath();
          for (let a = 0; a < 9; a += 0.4) { const rr = (a / 9) * er * 0.8; const px = cx + Math.cos(a + p.wob * 2) * rr, py = ey + Math.sin(a + p.wob * 2) * rr; a ? ctx.lineTo(px, py) : ctx.moveTo(px, py); }
          ctx.stroke();
        } else {
          const pr = face === 'wide' ? er * 0.28 : er * 0.45;
          const lim = er - pr - 1;
          ctx.beginPath(); ctx.arc(cx + p.ex * lim, ey + p.ey * lim, pr, 0, 6.3); ctx.fill();
          ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(cx + p.ex * lim - pr * 0.3, ey + p.ey * lim - pr * 0.3, pr * 0.28, 0, 6.3); ctx.fill();
        }
      }
      ctx.strokeStyle = '#2b2236'; ctx.fillStyle = '#2b2236'; ctx.lineWidth = 2.2; ctx.lineCap = 'round';
      const my = r * 0.42;
      ctx.beginPath();
      if (face === 'happy') { ctx.arc(0, my - r * 0.18, r * 0.3, 0.1, Math.PI - 0.1); ctx.closePath(); ctx.fillStyle = '#7a2438'; ctx.fill(); }
      else if (face === 'wide') { ctx.ellipse(0, my, r * 0.16, r * 0.2, 0, 0, 6.3); ctx.fill(); }
      else if (face === 'dizzy') { ctx.moveTo(-r * 0.3, my); for (let i = 1; i <= 4; i++) ctx.lineTo(-r * 0.3 + i * r * 0.15, my + (i % 2 ? -1 : 1) * 3); ctx.stroke(); }
      else if (face === 'sleepy') { ctx.moveTo(-r * 0.2, my); ctx.lineTo(r * 0.2, my); ctx.stroke(); }
      else { ctx.arc(0, my - r * 0.12, r * 0.24, 0.25, Math.PI - 0.25); ctx.stroke(); }
    }

    drawTag(ctx, p, zoom) {
      p = p || this.pose();
      const s = clamp(1 / zoom, 1, 2.6) * 0.92;
      ctx.save();
      ctx.translate(p.x, p.y - this.r - 18 * s);
      ctx.scale(s, s);
      ctx.font = '700 13px ui-rounded, "Arial Rounded MT Bold", "Trebuchet MS", system-ui, sans-serif';
      ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
      const label = `${p.locked ? '⏳ ' : ''}P${this.index + 1} ${this.style.name}`;
      const w = ctx.measureText(label).width + 14;
      ctx.fillStyle = p.locked ? 'rgba(235,230,245,0.8)' : 'rgba(255,255,255,0.9)'; ctx.strokeStyle = this.style.color; ctx.lineWidth = 2.5;
      ctx.beginPath(); ctx.roundRect(-w / 2, -10, w, 20, 10); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#3a2f4a'; ctx.fillText(label, 0, 1);
      ctx.restore();
    }
  }

  BBH.Blob = Blob;
})();
