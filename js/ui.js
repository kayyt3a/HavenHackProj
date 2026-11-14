/* ui.js - everything that lives in the DOM: menus, HUD, toasts, big pop-up text. main.js owns the logic. */
(function () {
  const BBH = (window.BBH = window.BBH || {});
  const $ = (id) => document.getElementById(id);

  const ICON = {
    sound: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M16.5 8.5a5 5 0 0 1 0 7M19 6a8.5 8.5 0 0 1 0 12"/></svg>',
    muted: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6h4l5 4V5L8 9H4z" fill="currentColor"/><path d="M17 9l5 6M22 9l-5 6"/></svg>',
    pause: '<svg viewBox="0 0 24 24" fill="currentColor"><rect x="6" y="5" width="4" height="14" rx="1.5"/><rect x="14" y="5" width="4" height="14" rx="1.5"/></svg>',
  };
  const LOGO_COLORS = ['#ff7eb6', '#4aa8ff', '#ffb400', '#4fd96a', '#8d7bff', '#ff5a5f'];
  const SCREENS = ['title', 'levels', 'shop', 'pause', 'results'];

  let toastTimer = 0, failTimer = 0, lastText = {}, shopPlayer = 0;
  const setText = (id, v) => { if (lastText[id] !== v) { lastText[id] = v; $(id).textContent = v; } };

  const UI = {
    on: {},   // callbacks filled in by main.js

    init() {
      // animated logo
      const logo = $('logo'); let i = 0;
      'Bounce Back Hill'.split('').forEach((ch) => {
        const s = document.createElement('span');
        if (ch === ' ') { s.innerHTML = '&nbsp;'; s.style.width = '0.3em'; } else { s.textContent = ch; s.style.color = LOGO_COLORS[i % LOGO_COLORS.length]; s.style.animationDelay = (i * 0.07) + 's'; i++; }
        logo.appendChild(s);
      });
      // mute buttons (HUD one + a floating one for menus)
      const fixed = document.createElement('button');
      fixed.className = 'icon-btn mute-fixed'; fixed.id = 'btn-mute-fixed'; fixed.title = 'Mute (M)'; fixed.setAttribute('aria-label', 'Mute');
      document.body.appendChild(fixed);
      this.muteBtns = [fixed, $('btn-mute')];
      this.muteBtns.forEach((b) => b.addEventListener('click', () => { BBH.Sound.unlock(); UI.on.mute && UI.on.mute(); }));
      $('btn-pause').innerHTML = ICON.pause;
      $('btn-pause').addEventListener('click', () => UI.on.pause && UI.on.pause());

      document.querySelectorAll('[data-players]').forEach((b) => b.addEventListener('click', () => { BBH.Sound.unlock(); BBH.Sound.click(); UI.on.players(+b.dataset.players); }));
      const bind = (id, ev, sound) => $(id).addEventListener('click', () => { BBH.Sound.unlock(); (sound || BBH.Sound.click)(); UI.on[ev] && UI.on[ev](); });
      bind('btn-play', 'toLevels'); bind('btn-levels-back', 'toTitle', BBH.Sound.back);
      bind('btn-shop', 'shop'); bind('btn-level-shop', 'shop'); bind('btn-shop-back', 'shopBack', BBH.Sound.back);
      bind('btn-resume', 'resume'); bind('btn-bounce', 'manualBounce'); bind('btn-restart', 'restart');
      bind('btn-replay-toggle', 'toggleReplay'); bind('btn-quit', 'quit', BBH.Sound.back);
      bind('btn-next', 'next'); bind('btn-retry', 'retry'); bind('btn-results-menu', 'toLevels');
    },

    setMuted(m) { this.muteBtns.forEach((b) => { b.innerHTML = m ? ICON.muted : ICON.sound; b.setAttribute('aria-pressed', m); }); },

    show(name) {
      SCREENS.forEach((s) => $('screen-' + s).classList.toggle('hidden', s !== name));
      $('btn-mute-fixed').classList.toggle('hidden', !!this.hudOn);
    },
    hud(on) {
      this.hudOn = on;
      $('hud').classList.toggle('hidden', !on);
      $('btn-mute-fixed').classList.toggle('hidden', on);
      if (!on) { $('toast').classList.add('hidden'); $('failmsg').classList.add('hidden'); }
    },

    setPlayers(n) {
      document.querySelectorAll('[data-players]').forEach((b) => b.classList.toggle('on', +b.dataset.players === n));
      const box = $('controls'); box.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const st = BBH.BLOB_STYLES[i], k = BBH.Input.maps[i].show;
        const d = document.createElement('div');
        d.className = 'ctl'; d.style.setProperty('--c', st.color); d.style.animationDelay = (i * 0.05) + 's';
        d.innerHTML = `<div class="who"><span class="dot"></span>P${i + 1} ${st.name}</div>
          <div class="keys"><div><kbd>${k.left}</kbd><kbd>${k.right}</kbd>move</div><div><kbd>${k.jump}</kbd>jump</div></div>`;
        box.appendChild(d);
      }
    },

    renderLevels(levels, save) {
      const grid = $('level-grid'); grid.innerHTML = '';
      levels.forEach((L, i) => {
        const b = save.best[L.id];
        const el = document.createElement('button');
        el.className = 'lvl';
        el.innerHTML = `<span class="num">${i + 1}</span>${b ? '<span class="done">⭐</span>' : ''}
          <h3>${L.name}</h3><p>${L.twist}</p>
          <div class="best"><span>⏱ ${b ? UI.fmt(b.time) : '--:--.-'}</span><span>↺ ${b ? b.bounces : '--'}</span></div>
          <div class="swatch" style="background:linear-gradient(90deg,${L.theme.skyTop},${L.theme.grass},${L.theme.accent})"></div>`;
        el.addEventListener('click', () => { BBH.Sound.unlock(); BBH.Sound.click(); UI.on.pick(i); });
        grid.appendChild(el);
      });
    },

    renderShop(cosmetics) {
      const C = BBH.Cosmetics, profiles = cosmetics.players;
      const tabs = $('shop-tabs'); tabs.innerHTML = '';
      profiles.forEach((p, i) => {
        const c = C.findColor(p.color);
        const b = document.createElement('button');
        b.className = 'shop-tab' + (i === shopPlayer ? ' on' : '');
        b.style.setProperty('--c', c.color);
        b.textContent = `P${i + 1} · ${p.coins} ◈`;
        b.addEventListener('click', () => { BBH.Sound.click(); shopPlayer = i; UI.renderShop(cosmetics); });
        tabs.appendChild(b);
      });
      const p = profiles[shopPlayer], col = C.findColor(p.color);
      $('shop-balance').innerHTML = `<span style="color:${col.color}">P${shopPlayer + 1}</span> balance <b>${p.coins}</b> ◈`;

      const makeItem = (item, kind, owned, equipped, previewStyle, previewText = '') => {
        const b = document.createElement('button');
        b.className = `shop-item ${owned ? 'owned' : 'locked'} ${equipped ? 'equipped' : ''}`;
        b.innerHTML = `<span class="preview" style="${previewStyle}">${previewText}</span><span class="item-name">${item.name}</span><span class="price">${owned ? (equipped ? 'Wearing now' : 'Owned · equip') : item.cost + ' ◈'}</span>`;
        b.addEventListener('click', () => { BBH.Sound.click(); UI.on.shopItem && UI.on.shopItem(shopPlayer, kind, item.id); });
        return b;
      };

      const colors = $('shop-colors'); colors.innerHTML = '';
      C.colors.forEach((item) => colors.appendChild(makeItem(item, 'color', p.ownedColors.includes(item.id), p.color === item.id, `--preview:${item.color};background:${item.color}`)));
      const acc = $('shop-accessories'); acc.innerHTML = '';
      C.accessories.forEach((item) => acc.appendChild(makeItem(item, 'accessory', p.ownedAccessories.includes(item.id), p.accessory === item.id, `--preview:${col.color};background:${col.color}`, item.icon)));
      const balls = $('shop-balls'); balls.innerHTML = '';
      C.balls.forEach((item) => {
        const b = document.createElement('button');
        b.className = 'shop-item owned' + (cosmetics.ball === item.id ? ' equipped' : '');
        b.innerHTML = `<span class="preview">${item.icon}</span><span class="item-name">${item.name}</span><span class="price">FREE · equip</span>`;
        b.addEventListener('click', () => { BBH.Sound.click(); UI.on.ballSkin && UI.on.ballSkin(item.id); });
        balls.appendChild(b);
      });
    },

    fmt(t) { const m = Math.floor(t / 60), s = t - m * 60; return `${m}:${s < 10 ? '0' : ''}${s.toFixed(1)}`; },

    // HUD
    setLevel(name) { setText('hud-level', name); },
    setTime(t) { setText('hud-time', UI.fmt(t)); },
    setBounces(n) { setText('hud-bounces', String(n)); },
    setCombo(n) { setText('hud-combo', n ? `${n}×` : '0×'); $('hud-combo-wrap').classList.toggle('hot', n >= 3); },
    setWallets(profiles, n) {
      const el = $('hud-wallets'); el.innerHTML = '';
      for (let i = 0; i < n; i++) {
        const c = BBH.Cosmetics.findColor(profiles[i].color);
        const d = document.createElement('span'); d.className = 'hud-wallet'; d.style.setProperty('--c', c.color);
        d.textContent = `P${i + 1} ${profiles[i].coins} ◈`; el.appendChild(d);
      }
    },
    setBar(info) {
      const wrap = $('hud-bar-wrap');
      wrap.classList.toggle('hidden', !info);
      if (!info) return;
      setText('hud-bar-label', info.label);
      $('hud-bar-fill').style.width = Math.round(info.value * 100) + '%';
    },
    setReplayLabel(on) { $('btn-replay-toggle').textContent = 'Replay of shame: ' + (on ? 'on' : 'off'); },

    toast(text, ms = 4200) {
      const el = $('toast'); el.textContent = text; el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      clearTimeout(toastTimer); toastTimer = setTimeout(() => el.classList.add('hidden'), ms);
    },
    hideToast() { clearTimeout(toastTimer); $('toast').classList.add('hidden'); },
    big(text, cls) {
      const el = $('bigtext'); el.textContent = text; el.className = 'bigtext' + (cls ? ' ' + cls : '');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      clearTimeout(this._bigT); this._bigT = setTimeout(() => el.classList.add('hidden'), 1500);
    },
    failMsg(text, ms = 2300) {
      const el = $('failmsg'); el.textContent = text; el.classList.remove('hidden');
      el.style.animation = 'none'; void el.offsetWidth; el.style.animation = '';
      clearTimeout(failTimer); failTimer = setTimeout(() => el.classList.add('hidden'), ms);
    },
    hideFail() { clearTimeout(failTimer); $('failmsg').classList.add('hidden'); },
    replayBanner(on) { $('replay-banner').classList.toggle('hidden', !on); },

    results(d) {
      $('res-rating').textContent = d.rating; $('res-sub').textContent = d.sub;
      $('res-time').textContent = UI.fmt(d.time); $('res-bounces').textContent = d.bounces; $('res-combo').textContent = d.combo;
      $('res-time-best').textContent = d.newTime ? '★ new best!' : ''; $('res-bounces-best').textContent = d.newBounces ? '★ new best!' : '';
      $('btn-next').classList.toggle('hidden', !d.hasNext);
      $('res-earnings').innerHTML = d.earnings.map((n, i) => `<span class="earning-pill" style="--c:${BBH.BLOB_STYLES[i].color}">P${i + 1} +${n} ◈</span>`).join('');
    },
  };
  BBH.UI = UI;
})();
