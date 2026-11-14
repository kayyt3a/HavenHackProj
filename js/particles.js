/* particles.js - puffs, confetti, stars, sparks and shell bits, all drawn with plain canvas shapes. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const rand = (a, b) => a + Math.random() * (b - a);
  const CONFETTI = ['#ff7eb6', '#ffd23f', '#4fc3ff', '#6fe08f', '#b39cff', '#ff9a5c'];

  class Particles {
    constructor() { this.list = []; }
    clear() { this.list.length = 0; }
    add(p) { if (this.list.length < 900) this.list.push(p); }

    puff(x, y, n = 6, color = '#ffffff', spread = 1, up = 0) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2);
        this.add({ kind: 'puff', x: x + rand(-8, 8), y: y + rand(-4, 4), vx: Math.cos(a) * rand(20, 110) * spread, vy: Math.sin(a) * rand(10, 60) * spread - up, life: rand(0.35, 0.7), max: 0.7, size: rand(6, 14), color, g: -20 });
      }
    }
    dust(x, y, n = 5) { this.puff(x, y, n, 'rgba(255,255,255,0.9)', 1.1, 20); }
    ring(x, y, color = '#fff', size = 60) { this.add({ kind: 'ring', x, y, vx: 0, vy: 0, life: 0.35, max: 0.35, size, color, g: 0 }); }
    sparks(x, y, color, n = 10, speed = 260) {
      for (let i = 0; i < n; i++) {
        const a = rand(0, Math.PI * 2), s = rand(speed * 0.4, speed);
        this.add({ kind: 'spark', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(0.3, 0.6), max: 0.6, size: rand(2.5, 5), color, g: 500 });
      }
    }
    stars(x, y, n = 5) {
      for (let i = 0; i < n; i++) this.add({ kind: 'star', x: x + rand(-18, 18), y: y + rand(-6, 6), vx: rand(-60, 60), vy: rand(-170, -80), life: rand(0.6, 1.0), max: 1.0, size: rand(7, 12), color: '#ffe066', g: 260, rot: rand(0, 6), vr: rand(-6, 6) });
    }
    confetti(x, y, n = 60, power = 1) {
      for (let i = 0; i < n; i++) {
        const a = rand(-Math.PI * 0.95, -Math.PI * 0.05), s = rand(250, 780) * power;
        this.add({ kind: 'conf', x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life: rand(1.6, 3.2), max: 3.2, size: rand(6, 12), color: CONFETTI[(Math.random() * CONFETTI.length) | 0], g: 520, rot: rand(0, 6), vr: rand(-10, 10) });
      }
    }
    shell(x, y, n = 16) {
      for (let i = 0; i < n; i++) this.add({ kind: 'conf', x, y, vx: rand(-320, 320), vy: rand(-520, -80), life: rand(1, 2), max: 2, size: rand(8, 15), color: i % 3 ? '#fff6e5' : '#ffd9a8', g: 800, rot: rand(0, 6), vr: rand(-12, 12) });
    }
    update(dt) {
      for (let i = this.list.length - 1; i >= 0; i--) {
        const p = this.list[i];
        p.life -= dt;
        if (p.life <= 0) { this.list.splice(i, 1); continue; }
        p.vy += p.g * dt; p.x += p.vx * dt; p.y += p.vy * dt;
        if (p.kind === 'conf') p.vx *= 1 - 0.8 * dt;
        if (p.rot !== undefined) p.rot += p.vr * dt;
      }
    }
    draw(ctx, t) {
      for (const p of this.list) {
        const k = p.life / p.max;
        ctx.save(); ctx.translate(p.x, p.y);
        switch (p.kind) {
          case 'puff': ctx.globalAlpha = Math.min(1, k * 1.4) * 0.8; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size * (1.6 - k * 0.6), 0, 6.3); ctx.fill(); break;
          case 'ring': ctx.globalAlpha = k; ctx.strokeStyle = p.color; ctx.lineWidth = 6 * k + 1; ctx.beginPath(); ctx.arc(0, 0, p.size * (1.4 - k), 0, 6.3); ctx.stroke(); break;
          case 'spark': ctx.globalAlpha = k; ctx.fillStyle = p.color; ctx.beginPath(); ctx.arc(0, 0, p.size * k + 0.5, 0, 6.3); ctx.fill(); break;
          case 'star': ctx.globalAlpha = Math.min(1, k * 2); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.strokeStyle = '#b8860b'; ctx.lineWidth = 1.5; ctx.beginPath();
            for (let i = 0; i < 10; i++) { const r = i % 2 ? p.size * 0.45 : p.size; const a = (i / 10) * 6.2832; ctx[i ? 'lineTo' : 'moveTo'](Math.cos(a) * r, Math.sin(a) * r); }
            ctx.closePath(); ctx.fill(); ctx.stroke(); break;
          case 'conf': ctx.globalAlpha = Math.min(1, k * 2.5); ctx.rotate(p.rot); ctx.fillStyle = p.color; ctx.scale(1, Math.abs(Math.sin(p.rot * 1.7)) * 0.8 + 0.2); ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2); break;
        }
        ctx.restore();
      }
    }
  }
  BBH.Particles = Particles;
})();
