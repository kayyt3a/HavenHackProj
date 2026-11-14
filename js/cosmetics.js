/* cosmetics.js - persistent per-player wallets, shop catalogues and equipment. */
(function () {
  const BBH = (window.BBH = window.BBH || {});

  const COLORS = [
    { id: 'green', name: 'Slime Lime', color: '#4fd96a', cost: 0 },
    { id: 'red', name: 'Chaos Coral', color: '#ff5a5f', cost: 0 },
    { id: 'blue', name: 'Bonk Blue', color: '#4aa8ff', cost: 0 },
    { id: 'yellow', name: 'Yell-oh!', color: '#ffd23f', cost: 0 },
    { id: 'pink', name: 'Bubblegum', color: '#ff72bf', cost: 35 },
    { id: 'purple', name: 'Grape Escape', color: '#9568f5', cost: 45 },
    { id: 'orange', name: 'Tangerine', color: '#ff9138', cost: 55 },
    { id: 'mint', name: 'Fresh Mint', color: '#55e0c0', cost: 70 },
    { id: 'midnight', name: 'Midnight', color: '#38466f', cost: 90 },
    { id: 'gold', name: 'Summit Gold', color: '#f4b928', cost: 120 },
  ];

  const ACCESSORIES = [
    { id: 'none', name: 'Au naturel', icon: '·', cost: 0 },
    { id: 'spots', name: 'Party Spots', icon: '●', cost: 45 },
    { id: 'antenna', name: 'Boing Antenna', icon: '⌁', cost: 70 },
    { id: 'party', name: 'Party Hat', icon: '△', cost: 90 },
    { id: 'shades', name: 'Cool Shades', icon: '▰', cost: 125 },
    { id: 'crown', name: 'Bounce Royalty', icon: '♛', cost: 180 },
  ];

  const BALLS = [
    { id: 'classic', name: 'Classic', icon: '○' },
    { id: 'beach', name: 'Beach Ball', icon: '◉' },
    { id: 'watermelon', name: 'Watermelon', icon: '🍉' },
    { id: 'eight', name: 'Eight Ball', icon: '➑' },
    { id: 'disco', name: 'Disco Ball', icon: '◇' },
    { id: 'earth', name: 'Tiny Earth', icon: '🌍' },
    { id: 'candy', name: 'Candy Swirl', icon: '◎' },
  ];

  const defaultColors = ['green', 'red', 'blue', 'yellow'];
  const find = (list, id) => list.find((x) => x.id === id);
  const defaultPlayer = (i) => ({
    coins: 0,
    color: defaultColors[i],
    accessory: 'none',
    ownedColors: [defaultColors[i]],
    ownedAccessories: ['none'],
  });

  function normalize(raw) {
    const state = raw && typeof raw === 'object' ? raw : {};
    state.players = Array.from({ length: 4 }, (_, i) => {
      const d = defaultPlayer(i), p = state.players && state.players[i];
      if (!p || typeof p !== 'object') return d;
      const out = {
        coins: Math.max(0, Math.floor(Number(p.coins) || 0)),
        color: find(COLORS, p.color) ? p.color : d.color,
        accessory: find(ACCESSORIES, p.accessory) ? p.accessory : 'none',
        ownedColors: Array.isArray(p.ownedColors) ? p.ownedColors.filter((id) => find(COLORS, id)) : [],
        ownedAccessories: Array.isArray(p.ownedAccessories) ? p.ownedAccessories.filter((id) => find(ACCESSORIES, id)) : [],
      };
      if (!out.ownedColors.includes(d.color)) out.ownedColors.push(d.color);
      if (!out.ownedColors.includes(out.color)) out.color = d.color;
      if (!out.ownedAccessories.includes('none')) out.ownedAccessories.push('none');
      if (!out.ownedAccessories.includes(out.accessory)) out.accessory = 'none';
      return out;
    });
    state.ball = find(BALLS, state.ball) ? state.ball : 'classic';
    return state;
  }

  function apply(state) {
    state = normalize(state);
    state.players.forEach((p, i) => {
      const c = find(COLORS, p.color) || COLORS[i];
      if (BBH.BLOB_STYLES && BBH.BLOB_STYLES[i]) {
        BBH.BLOB_STYLES[i].name = c.name;
        BBH.BLOB_STYLES[i].color = c.color;
        BBH.BLOB_STYLES[i].accessory = p.accessory;
      }
    });
    Cosmetics.ballSkin = state.ball;
    return state;
  }

  function award(state, player, combo) {
    state = normalize(state);
    const amount = Math.max(1, Math.floor(Number(combo) || 1));
    state.players[player].coins += amount;
    return amount;
  }

  function buyOrEquip(state, player, kind, id) {
    state = normalize(state);
    const p = state.players[player];
    const isColor = kind === 'color';
    const list = isColor ? COLORS : ACCESSORIES;
    const owned = isColor ? p.ownedColors : p.ownedAccessories;
    const item = find(list, id);
    if (!item) return { ok: false, reason: 'missing' };
    if (!owned.includes(id)) {
      if (p.coins < item.cost) return { ok: false, reason: 'coins', needed: item.cost - p.coins };
      p.coins -= item.cost;
      owned.push(id);
    }
    if (isColor) p.color = id;
    else p.accessory = id;
    apply(state);
    return { ok: true, item, coins: p.coins };
  }

  function equipBall(state, id) {
    state = normalize(state);
    if (!find(BALLS, id)) return false;
    state.ball = id;
    Cosmetics.ballSkin = id;
    return true;
  }

  const Cosmetics = {
    colors: COLORS,
    accessories: ACCESSORIES,
    balls: BALLS,
    ballSkin: 'classic',
    normalize,
    apply,
    award,
    buyOrEquip,
    equipBall,
    findColor: (id) => find(COLORS, id),
    findAccessory: (id) => find(ACCESSORIES, id),
  };
  BBH.Cosmetics = Cosmetics;
})();
