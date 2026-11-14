/* camera.js - follows the object + the whole team, zooms out when they spread apart, shakes on big hits. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));

  class Camera {
    constructor() {
      this.x = 0; this.y = -200; this.zoom = 0.6;
      this.vw = 800; this.vh = 600; this.dpr = 1;
      this.shakeMag = 0; this.punch = 0;
      this.left = 0; this.right = 0; this.top = 0; this.bottom = 0;
      this.sx = 0; this.sy = 0;
    }
    resize(w, h, dpr) { this.vw = w; this.vh = h; this.dpr = dpr; }

    /** points: [{x,y,r}] things that must stay in view. focus: the object {x,y,r} (always kept in view) */
    update(dt, points, focus, level, snap) {
      const C = BBH.CONFIG.camera;
      let x0 = Infinity, x1 = -Infinity, y0 = Infinity, y1 = -Infinity;
      for (const p of points) {
        x0 = Math.min(x0, p.x - p.r); x1 = Math.max(x1, p.x + p.r);
        y0 = Math.min(y0, p.y - p.r); y1 = Math.max(y1, p.y + p.r);
      }
      const pad = C.padding;
      const bw = x1 - x0 + pad * 2, bh = y1 - y0 + pad * 2;
      const targetZoom = clamp(Math.min(this.vw / bw, this.vh / bh), C.minZoom, C.maxZoom);
      let tx = (x0 + x1) / 2, ty = (y0 + y1) / 2 - C.lookUp / targetZoom * 0.5;
      // keep the arena framed: don't scroll sideways past the walls
      if (level) {
        const halfView = this.vw / targetZoom / 2, hw = level.maxX + 90;
        tx = halfView >= hw ? 0 : clamp(tx, -hw + halfView, hw - halfView);
        ty = Math.min(ty, level.floorY - this.vh / targetZoom / 2 + 140);   // don't show too much below the floor
      }
      // always keep the object comfortably on screen
      if (focus) {
        const hv = this.vh / targetZoom / 2, wv = this.vw / targetZoom / 2;
        ty = clamp(ty, focus.y + focus.r - hv * 0.86, focus.y - focus.r + hv * 0.86);
        tx = clamp(tx, focus.x - wv * 0.86, focus.x + wv * 0.86);
      }
      const k = 1 - Math.exp(-C.smoothing * dt), kz = 1 - Math.exp(-C.zoomSmoothing * dt);
      this.x += (tx - this.x) * k; this.y += (ty - this.y) * k;
      this.zoom += (targetZoom - this.zoom) * kz;
      this.shakeMag *= Math.exp(-7 * dt);
      this.punch *= Math.exp(-3.2 * dt);
      const sm = this.shakeMag * BBH.CONFIG.feel.shakeScale;
      this.sx = (Math.random() - 0.5) * 2 * sm; this.sy = (Math.random() - 0.5) * 2 * sm;
      this.bounds();
    }
    snapTo(x, y, zoom) { this.x = x; this.y = y; if (zoom) this.zoom = zoom; this.bounds(); }
    get z() { return this.zoom * (1 + this.punch * 0.22); }
    bounds() {
      const z = this.z;
      this.left = this.x - this.vw / z / 2; this.right = this.x + this.vw / z / 2;
      this.top = this.y - this.vh / z / 2; this.bottom = this.y + this.vh / z / 2;
    }
    shake(m) { this.shakeMag = Math.min(26, Math.max(this.shakeMag, m)); }
    apply(ctx) {
      const z = this.z * this.dpr;
      ctx.setTransform(z, 0, 0, z, (this.vw / 2 - this.x * this.z + this.sx) * this.dpr, (this.vh / 2 - this.y * this.z + this.sy) * this.dpr);
    }
    toScreen(wx, wy) { return { x: (wx - this.x) * this.z + this.vw / 2, y: (wy - this.y) * this.z + this.vh / 2 }; }
  }
  BBH.Camera = Camera;
})();
