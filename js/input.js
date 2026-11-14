/* input.js - one keyboard, up to four players. Uses physical key codes so layouts don't matter. */
(function () {
  const BBH = (window.BBH = window.BBH || {});

  // Edit these to remap. Values are KeyboardEvent.code strings.
  const MAPS = [
    { left: 'KeyA', right: 'KeyD', jump: 'KeyW', show: { left: 'A', right: 'D', jump: 'W' } },
    { left: 'ArrowLeft', right: 'ArrowRight', jump: 'ArrowUp', show: { left: '←', right: '→', jump: '↑' } },
    { left: 'KeyJ', right: 'KeyL', jump: 'KeyI', show: { left: 'J', right: 'L', jump: 'I' } },
    { left: 'Numpad4', right: 'Numpad6', jump: 'Numpad8', show: { left: '4', right: '6', jump: '8' } },
  ];

  const down = new Set();
  const jumpQueued = [false, false, false, false];
  const swallow = new Set();
  MAPS.forEach((m) => ['left', 'right', 'jump'].forEach((k) => swallow.add(m[k])));
  ['Space', 'Escape', 'Tab'].forEach((k) => swallow.add(k));

  const listeners = { menuKey: null };

  window.addEventListener('keydown', (e) => {
    if (swallow.has(e.code)) e.preventDefault();
    if (!e.repeat) {
      down.add(e.code);
      MAPS.forEach((m, i) => { if (e.code === m.jump) jumpQueued[i] = true; });
      if (listeners.menuKey) listeners.menuKey(e);
    } else {
      down.add(e.code);
    }
  });
  window.addEventListener('keyup', (e) => down.delete(e.code));
  window.addEventListener('blur', () => down.clear());

  BBH.Input = {
    maps: MAPS,
    onKey(fn) { listeners.menuKey = fn; },
    /** Read player p's controls. jumpPressed is true once per key press (consumed by read). */
    read(p) {
      const m = MAPS[p];
      const jp = jumpQueued[p];
      jumpQueued[p] = false;
      return {
        x: (down.has(m.right) ? 1 : 0) - (down.has(m.left) ? 1 : 0),
        jumpHeld: down.has(m.jump),
        jumpPressed: jp,
      };
    },
    clearEdges() { jumpQueued.fill(false); },
    isDown(code) { return down.has(code); },
    /** test hook: a fake input source (used by the headless simulation) */
    _down: down,
  };
})();
