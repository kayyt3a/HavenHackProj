/* object.js - the awkward things the team must keep in the air: ball, egg, crate. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const { Bodies, Body, Composite } = Matter;

  function blobMass() { const c = BBH.CONFIG.blob; return Math.PI * c.radius * c.radius * c.density * 0.99; }

  class GameObject {
    constructor(def, level, mass) {
      this.def = def; this.level = level; this.totalMass = mass;
      this.bodies = []; this.parts = [];
      this.broken = false; this.breakReason = '';
      this.radius = 100; this.roundBodies = [];
      this.pulse = 0; this.damage = 0;
    }
    add(body) {
      body.plugin.object = this;
      body.collisionFilter.category = BBH.CAT.OBJECT;
      Composite.add(this.level.engine.world, body);
      this.bodies.push(body); this.parts.push(body);
    }
    /** how strong a hit is on this object (heavier = weaker = more chained teamwork) */
    hitScale() {
      const h = BBH.CONFIG.hit;
      const w = this.totalMass / blobMass();
      return Math.pow(h.referenceWeight / w, h.weightExponent);
    }
    center() { return this.parts[0].position; }
    bottom() { return this.parts[0].bounds.max.y; }
    speed() { const v = this.parts[0].velocity; return { x: v.x * 60, y: v.y * 60 }; }
    beforeStep() {
      const k = 1 - BBH.CONFIG.object.rollResist;
      for (const b of this.roundBodies) Body.setAngularVelocity(b, b.angularVelocity * k);
    }
    afterStep(dt) { this.pulse = Math.max(0, this.pulse - dt * 4); }
    onImpact() {}
    hud() { return null; }
    poses() { return { parts: this.parts.map((b) => ({ x: b.position.x, y: b.position.y, a: b.angle })), damage: this.damage, pulse: this.pulse }; }
    resetBodies() { for (const b of this.bodies) { Body.setVelocity(b, { x: 0, y: 0 }); Body.setAngularVelocity(b, 0); } }
    hit(vx, vy) {
      const b = this.parts[0];
      Body.setVelocity(b, { x: vx * BBH.PXS, y: vy * BBH.PXS });
      Body.setAngularVelocity(b, b.angularVelocity * 0.5 + (Math.random() - 0.5) * 0.12);
      this.pulse = 1;
    }
  }

  const eyes = (ctx, look, worry, R, ey, spacing) => {
    const er = R * 0.2;
    for (const s of [-1, 1]) {
      ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = Math.max(2, R * 0.03);
      ctx.beginPath(); ctx.arc(s * spacing, ey, er, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#2b2236'; const pr = worry ? er * 0.3 : er * 0.5;
      ctx.beginPath(); ctx.arc(s * spacing + look.x * (er - pr - 1), ey + look.y * (er - pr - 1), pr, 0, 6.3); ctx.fill();
    }
  };

  // ======================================================================= BALL
  class Ball extends GameObject {
    constructor(def, level, mass) {
      super(def, level, mass);
      const cfg = BBH.CONFIG.object;
      this.radius = def.radius || 100;
      const body = Bodies.circle(0, 0, this.radius, {
        friction: cfg.ballFriction, frictionStatic: 1, frictionAir: cfg.airFriction, restitution: cfg.ballRestitution,
        label: 'ball', slop: 0.1,
      }, 72);
      Body.setMass(body, mass);
      this.body = body; this.roundBodies = [body];
      this.add(body);
    }
    place(x, ledgeTop) {
      Body.setPosition(this.body, { x, y: ledgeTop - this.radius - 2 });
      Body.setAngle(this.body, 0); this.resetBodies();
    }
    draw(ctx, t, poses) {
      // just a big white circle
      const p = poses.parts[0], R = this.radius * (1 + poses.pulse * 0.05);
      ctx.save(); ctx.translate(p.x, p.y);
      ctx.fillStyle = '#ffffff'; ctx.strokeStyle = '#8f86a6'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.3); ctx.fill(); ctx.stroke();
      ctx.restore();
    }
  }

  // ========================================================================= EGG
  class Egg extends GameObject {
    constructor(def, level, mass) {
      super(def, level, mass);
      const w = def.width || 74, h = def.height || 100;
      this.w = w; this.h = h; this.radius = h / 2;
      const pts = [];
      for (let i = 0; i < 22; i++) {
        const a = (i / 22) * Math.PI * 2;
        const yy = Math.sin(a), narrow = 1 - 0.18 * (-yy > 0 ? -yy : 0);
        pts.push({ x: Math.cos(a) * (w / 2) * narrow, y: yy * (h / 2) });
      }
      const body = Bodies.fromVertices(0, 0, [pts], { friction: def.friction ?? 0.5, frictionStatic: 0.5, frictionAir: 0.001, restitution: 0.05, label: 'egg', slop: 0.1 });
      Body.setCentre(body, { x: 0, y: h * 0.3 }, true);   // weighted bottom: wobbles upright like a roly-poly
      Body.setMass(body, mass);
      this.body = body;
      this.add(body);
      this.hitCd = 0; this.cracks = this.makeCracks();
    }
    makeCracks() {
      let seed = 7; const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
      const list = [];
      for (let i = 0; i < 5; i++) {
        const pts = []; let x = (rnd() - 0.5) * this.w * 0.5, y = -this.h * 0.35 + rnd() * this.h * 0.5;
        pts.push([x, y]);
        for (let k = 0; k < 5; k++) { x += (rnd() - 0.5) * 22; y += 8 + rnd() * 10; pts.push([x, y]); }
        list.push(pts);
      }
      return list;
    }
    place(x, ledgeTop) {
      Body.setPosition(this.body, { x, y: ledgeTop - this.h * 0.2 - 3 });   // centre of mass sits low
      Body.setAngle(this.body, 0); this.resetBodies();
      this.damage = 0; this.broken = false; this.hitCd = 0;
    }
    afterStep(dt) { super.afterStep(dt); this.hitCd = Math.max(0, this.hitCd - dt); }
    onImpact(speed, other, col, x, y) {
      const cfg = BBH.CONFIG.object;
      if (this.broken || this.hitCd > 0) return;
      let s = speed;
      if (other.plugin && other.plugin.blob) s *= cfg.eggBlobFactor;
      if (s <= cfg.eggImpactThreshold) return;
      const dmg = (s - cfg.eggImpactThreshold) * cfg.eggDamagePerSpeed;
      this.damage = Math.min(1, this.damage + dmg);
      this.hitCd = 0.15;
      this.level.emit('eggHit', { x, y, damage: dmg, total: this.damage, speed: s });
      if (this.damage >= 1) { this.broken = true; this.breakReason = 'egg'; this.level.emit('eggBreak', { x, y }); }
    }
    hud() { return { kind: 'bar', label: 'Egg damage', value: this.damage }; }
    draw(ctx, t, poses, extra) {
      const p = poses.parts[0], w = this.w, h = this.h, dmg = poses.damage;
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.translate(0, -h * 0.3);   // body.position is the lowered centre of mass; the shape centre is above it
      ctx.scale(1 + poses.pulse * 0.08, 1 + poses.pulse * 0.08);
      ctx.beginPath();
      ctx.moveTo(0, -h / 2);
      ctx.bezierCurveTo(w * 0.62, -h * 0.5, w * 0.55, h * 0.5, 0, h / 2);
      ctx.bezierCurveTo(-w * 0.55, h * 0.5, -w * 0.62, -h * 0.5, 0, -h / 2);
      ctx.closePath();
      const g = ctx.createLinearGradient(-w / 2, -h / 2, w / 2, h / 2);
      g.addColorStop(0, '#fffaf0'); g.addColorStop(1, '#ffe2b8');
      ctx.fillStyle = g; ctx.fill();
      ctx.strokeStyle = '#b07a4a'; ctx.lineWidth = 3.5; ctx.stroke();
      ctx.fillStyle = 'rgba(190,130,90,0.35)';
      [[-14, 18, 4], [10, 26, 3], [18, -6, 3.5], [-18, -22, 3]].forEach(([x, y, r]) => { ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill(); });
      ctx.strokeStyle = '#5b3b2a'; ctx.lineWidth = 2.2; ctx.lineJoin = 'round';
      const n = Math.floor(dmg * 5.99);
      for (let i = 0; i <= n && i < this.cracks.length; i++) {
        if (dmg < 0.12 && i > 0) break;
        const pts = this.cracks[i], upto = i === n ? Math.max(2, Math.ceil((dmg * 5.99 - n) * pts.length)) : pts.length;
        ctx.beginPath();
        for (let k = 0; k < upto; k++) k ? ctx.lineTo(pts[k][0], pts[k][1]) : ctx.moveTo(pts[k][0], pts[k][1]);
        ctx.stroke();
      }
      const look = extra && extra.look ? extra.look : { x: 0, y: 0 };
      const scared = dmg > 0.5 || (extra && extra.worry);
      for (const s of [-1, 1]) {
        ctx.fillStyle = '#fff'; ctx.strokeStyle = '#3a2f4a'; ctx.lineWidth = 2;
        ctx.beginPath(); ctx.arc(s * w * 0.2, -h * 0.08, w * 0.15, 0, 6.3); ctx.fill(); ctx.stroke();
        ctx.fillStyle = '#2b2236'; const pr = scared ? w * 0.04 : w * 0.075;
        ctx.beginPath(); ctx.arc(s * w * 0.2 + look.x * w * 0.05, -h * 0.08 + look.y * w * 0.05, pr, 0, 6.3); ctx.fill();
      }
      ctx.strokeStyle = '#2b2236'; ctx.lineWidth = 2.6; ctx.lineCap = 'round'; ctx.beginPath();
      if (scared) ctx.ellipse(0, h * 0.14, w * 0.06, w * 0.08, 0, 0, 6.3); else ctx.arc(0, h * 0.06, w * 0.13, 0.3, Math.PI - 0.3);
      ctx.stroke();
      ctx.restore();
    }
  }

  // ======================================================================= CRATE
  class Crate extends GameObject {
    constructor(def, level, mass) {
      super(def, level, mass);
      this.s = def.size || 140; this.radius = this.s * 0.75;
      const body = Bodies.rectangle(0, 0, this.s, this.s, { friction: 0.8, frictionStatic: 1, frictionAir: 0.001, restitution: 0.15, label: 'crate', chamfer: { radius: 10 }, slop: 0.1 });
      Body.setMass(body, mass);
      this.body = body; this.add(body);
    }
    place(x, ledgeTop) {
      Body.setPosition(this.body, { x, y: ledgeTop - this.s / 2 - 3 });
      Body.setAngle(this.body, 0); this.resetBodies();
    }
    draw(ctx, t, poses, extra) {
      const p = poses.parts[0], s = this.s * (1 + poses.pulse * 0.07);
      ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.a);
      ctx.fillStyle = '#e8b27a'; ctx.strokeStyle = '#7a4a2a'; ctx.lineWidth = 5;
      ctx.beginPath(); ctx.roundRect(-s / 2, -s / 2, s, s, 12); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#d29a62'; ctx.fillRect(-s / 2 + 8, -s / 2 + 8, s - 16, 12); ctx.fillRect(-s / 2 + 8, s / 2 - 20, s - 16, 12);
      ctx.strokeStyle = 'rgba(122,74,42,0.6)'; ctx.lineWidth = 7;
      ctx.beginPath(); ctx.moveTo(-s / 2 + 14, -s / 2 + 14); ctx.lineTo(s / 2 - 14, s / 2 - 14); ctx.moveTo(s / 2 - 14, -s / 2 + 14); ctx.lineTo(-s / 2 + 14, s / 2 - 14); ctx.stroke();
      // goofy face (stays on the crate, tumbles with it)
      const look = extra && extra.look ? extra.look : { x: 0, y: 0 };
      ctx.fillStyle = '#e8b27a'; ctx.beginPath(); ctx.roundRect(-s * 0.36, -s * 0.2, s * 0.72, s * 0.4, 10); ctx.fill();
      eyes(ctx, look, extra && extra.worry, s * 0.6, -s * 0.03, s * 0.17);
      ctx.strokeStyle = '#2b2236'; ctx.lineWidth = 3.5; ctx.lineCap = 'round'; ctx.beginPath(); ctx.arc(0, s * 0.1, s * 0.09, 0.3, Math.PI - 0.3); ctx.stroke();
      ctx.restore();
    }
  }

  BBH.createObject = function (def, level, playerCount) {
    const scale = BBH.CONFIG.object.massScaleByPlayers[playerCount] ?? 1;
    const mass = def.weight * blobMass() * scale;
    if (def.type === 'egg') return new Egg(def, level, mass);
    if (def.type === 'crate') return new Crate(def, level, mass);
    return new Ball(def, level, mass);
  };
  BBH.blobMass = blobMass;
})();
