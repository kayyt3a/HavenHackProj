/* audio.js - every sound is synthesised live with the Web Audio API (no audio files). */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  let ctx = null, master = null, muted = false, noiseBuf = null;
  const last = {};

  function ensure() {
    if (ctx) return ctx;
    const AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    try {
      ctx = new AC(); master = ctx.createGain(); master.gain.value = muted ? 0 : 0.7; master.connect(ctx.destination);
      noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 1, ctx.sampleRate);
      const d = noiseBuf.getChannelData(0); for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
    } catch (e) { ctx = null; }
    return ctx;
  }
  /** rate-limit a sound so collision spam doesn't turn into noise */
  const ok = (name, gap) => { const t = performance.now(); if (last[name] && t - last[name] < gap * 1000) return false; last[name] = t; return true; };

  function tone(f0, f1, dur, type = 'sine', vol = 0.3, delay = 0) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + delay, o = c.createOscillator(), g = c.createGain();
    o.type = type; o.frequency.setValueAtTime(f0, t); o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
    g.gain.setValueAtTime(0.0001, t); g.gain.exponentialRampToValueAtTime(vol, t + 0.012); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g); g.connect(master); o.start(t); o.stop(t + dur + 0.05);
  }
  function noise(dur, freq, vol = 0.3, type = 'lowpass', delay = 0, q = 1) {
    const c = ensure(); if (!c || muted) return;
    const t = c.currentTime + delay, s = c.createBufferSource(), f = c.createBiquadFilter(), g = c.createGain();
    s.buffer = noiseBuf; f.type = type; f.frequency.value = freq; f.Q.value = q;
    g.gain.setValueAtTime(vol, t); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    s.connect(f); f.connect(g); g.connect(master); s.start(t, Math.random() * 0.5); s.stop(t + dur + 0.05);
  }

  BBH.Sound = {
    unlock() { const c = ensure(); if (c && c.state === 'suspended') c.resume(); },
    setMuted(m) { muted = m; if (master) master.gain.value = m ? 0 : 0.7; },
    isMuted() { return muted; },
    jump() { if (ok('jump', 0.05)) tone(300, 720, 0.16, 'sine', 0.22); },
    land(i = 0.5) { if (ok('land', 0.05)) { tone(180, 70, 0.12, 'sine', 0.18 * i + 0.05); noise(0.06, 900, 0.06 * i); } },
    /** the satisfying hit: a boingy bonk, pitched by how hard it was */
    hit(power = 400, combo = 1) {
      if (!ok('hit', 0.04)) return;
      const p = Math.min(1, power / 760), base = 260 + Math.min(combo, 12) * 22;
      tone(base, base * 2.4, 0.2, 'triangle', 0.36);
      tone(base * 0.5, base * 0.25, 0.14, 'sine', 0.3);
      noise(0.05, 2200, 0.12 + p * 0.1, 'highpass');
    },
    bounce() { if (ok('bounce', 0.05)) { tone(220, 880, 0.28, 'sine', 0.3); tone(440, 1320, 0.22, 'triangle', 0.15, 0.03); } },
    boing() { if (ok('boing', 0.05)) tone(160, 620, 0.35, 'sawtooth', 0.12); },
    flop() { if (ok('flop', 0.1)) { tone(420, 90, 0.5, 'sawtooth', 0.22); tone(300, 60, 0.55, 'sine', 0.2, 0.05); noise(0.12, 600, 0.15); } },
    thud(i = 0.6) { if (ok('thud', 0.06)) { tone(120, 38, 0.3, 'sine', 0.3 * i + 0.1); noise(0.14, 400, 0.2 * i); } },
    rockHit() { if (ok('rock', 0.06)) { tone(200, 80, 0.14, 'square', 0.1); noise(0.12, 1200, 0.2); } },
    crack() { if (ok('crack', 0.08)) { noise(0.1, 4000, 0.3, 'highpass'); tone(1200, 400, 0.08, 'square', 0.1); } },
    splat() { noise(0.35, 800, 0.4); tone(300, 60, 0.4, 'sawtooth', 0.2); },
    checkpoint() { [523, 659, 784, 1047].forEach((f, i) => tone(f, f * 1.01, 0.22, 'triangle', 0.22, i * 0.09)); },
    win() { [523, 659, 784, 1047, 784, 1047, 1319].forEach((f, i) => tone(f, f, 0.26, 'triangle', 0.25, i * 0.12)); },
    nooo() { [392, 370, 349, 330].forEach((f, i) => tone(f, f * 0.93, 0.55, 'sawtooth', 0.13, i * 0.38)); tone(150, 60, 1.6, 'sine', 0.2); },
    replay() { tone(880, 440, 0.25, 'square', 0.08); tone(660, 330, 0.25, 'square', 0.08, 0.15); },
    respawn() { tone(200, 800, 0.3, 'sine', 0.22); noise(0.2, 2000, 0.1, 'bandpass'); },
    warn() { if (ok('warn', 0.5)) { tone(880, 880, 0.1, 'square', 0.1); tone(880, 880, 0.1, 'square', 0.1, 0.16); } },
    rumble() { noise(2.2, 160, 0.5); tone(60, 40, 2.2, 'sawtooth', 0.15); },
    wind() { if (ok('wind', 1.5)) noise(1.6, 900, 0.22, 'bandpass', 0, 0.8); },
    click() { tone(500, 700, 0.07, 'triangle', 0.15); },
    back() { tone(400, 280, 0.08, 'triangle', 0.14); },
  };
})();
