/* ==========================================================================
   levels-data.js  -  levels as plain data. Copy a level, tweak it, add it to the array. That's it.

   The world is OPEN SPACE: a flat floor at y = 0 and floating LEDGES stacked above it.
   Up is negative y. Ledges are one-way: you can jump / bounce up through them and land on top.

   LEVEL FORMAT
   ------------
   id, name, twist (shown on level select), tip (shown when the level starts)
   theme:   colours { skyTop, skyBottom, hillFar, hillNear, grass, soil, accent }
   arena:   { halfWidth }                           optional, walls at +-halfWidth (default 850)
   ledges:  [ { x, y, w, cp?, goal?, ice? } ]       x = centre, y = TOP surface, w = width
              cp:true   -> a checkpoint: the object resting here becomes your respawn point
              goal:true -> the summit: object resting here wins the level
              ice:true  -> slippery
   object:  { type:'ball'|'egg'|'crate', weight, ... }   weight = how many "blob-masses" it is.
              Heavier object => weaker hits => more chained teamwork needed (see config.js "hit")
   hazards: list of
     { type:'wind',     y0, y1, accel:[ax,ay], gust:{period,on}? }                 push zone between heights y0..y1
     { type:'rocks',    y0, y1, every:[min,max], radius:[min,max] }                falling rocks while the object is between y0..y1
     { type:'spring' | 'mushroom', ledge, dx, power, angle, w }                    launch pad on ledge #ledge (-1 = floor). angle>0 leans right
     { type:'boulder',  ledge, every:[min,max], radius, reach }                    boulder rolls across ledge #ledge now and then
     { type:'platform', w, path:[[x,y],[x,y]], speed, pause }                      moving (one-way) platform
   ========================================================================== */
(function () {
  const BBH = (window.BBH = window.BBH || {});

  BBH.LEVELS = [
    /* ------------------------------------------------------------------ 1 */
    {
      id: 'up-we-go',
      name: 'Up We Go',
      twist: 'A giant bouncy ball. Keep it in the air, one hit at a time.',
      tip: 'Bump the ball to hit it up! The blob that just hit it turns ghostly and must wait for a TEAMMATE to hit it next.',
      theme: { skyTop: '#bde6ff', skyBottom: '#fff1e6', hillFar: '#d9ecff', hillNear: '#c8f0dc', grass: '#9fe3b5', soil: '#ffe2c7', accent: '#ff9bb8' },
      ledges: [
        { x: -300, y: -240, w: 760 },
        { x: 300, y: -480, w: 760, cp: true },
        { x: -300, y: -720, w: 760 },
        { x: 300, y: -960, w: 760, cp: true },
        { x: -300, y: -1200, w: 760 },
        { x: 0, y: -1440, w: 900, cp: true, goal: true },
      ],
      object: { type: 'ball', radius: 85, weight: 14 },
      hazards: [],
    },

    /* ------------------------------------------------------------------ 2 */
    {
      id: 'mushroom-hop',
      name: 'Mushroom Hop',
      twist: 'A heavier ball and wide gaps. Bounce across on the mushrooms!',
      tip: 'Hit the ball sideways onto a mushroom and it will boing across the gap. Mushrooms launch you too!',
      theme: { skyTop: '#d5c8ff', skyBottom: '#ffe3f1', hillFar: '#e6dcff', hillNear: '#ffd9ec', grass: '#c3a6ff', soil: '#ffe9f4', accent: '#ff8fd0' },
      ledges: [
        { x: -420, y: -250, w: 560 },
        { x: 400, y: -500, w: 560, cp: true },
        { x: -400, y: -750, w: 560 },
        { x: 400, y: -1000, w: 560, cp: true },
        { x: -400, y: -1250, w: 560 },
        { x: 0, y: -1500, w: 800, cp: true, goal: true },
      ],
      object: { type: 'ball', radius: 100, weight: 24 },
      hazards: [
        { type: 'mushroom', ledge: -1, dx: 330, power: 820, angle: 4, w: 150 },
        { type: 'mushroom', ledge: 0, dx: 240, power: 780, angle: 18, w: 130 },
        { type: 'mushroom', ledge: 1, dx: -240, power: 780, angle: -18, w: 130 },
        { type: 'mushroom', ledge: 2, dx: 240, power: 780, angle: 18, w: 130 },
        { type: 'mushroom', ledge: 3, dx: -240, power: 780, angle: -18, w: 130 },
        { type: 'mushroom', ledge: 4, dx: 240, power: 780, angle: 18, w: 130 },
      ],
    },

    /* ------------------------------------------------------------------ 3 */
    {
      id: 'eggs-press',
      name: 'Eggs-press Delivery',
      twist: 'A fragile egg that cracks if it lands too hard. Catch it!',
      tip: 'Watch the damage bar. Hitting the egg back up cushions a fall - dropping it on a ledge hurts!',
      theme: { skyTop: '#ffe9b8', skyBottom: '#ffd6e0', hillFar: '#ffe9d1', hillNear: '#ffdcc2', grass: '#ffd36b', soil: '#fff0d6', accent: '#ff9a5c' },
      ledges: [
        { x: -280, y: -230, w: 760 },
        { x: 280, y: -460, w: 760, cp: true },
        { x: -280, y: -690, w: 760, ice: true },
        { x: 280, y: -920, w: 760, cp: true },
        { x: -280, y: -1150, w: 760 },
        { x: 280, y: -1380, w: 760, cp: true },
        { x: 0, y: -1610, w: 900, cp: true, goal: true },
      ],
      object: { type: 'egg', weight: 9, width: 74, height: 100 },
      hazards: [],
    },

    /* ------------------------------------------------------------------ 4 */
    {
      id: 'crate-escalator',
      name: 'Crate Escalator',
      twist: 'A big wobbly crate and sliding platforms. Time your hits!',
      tip: 'Crates tumble and land on their corners. Use the sliding platforms as stepping stones.',
      theme: { skyTop: '#c5f1e8', skyBottom: '#fff7d6', hillFar: '#d6f4ea', hillNear: '#cdeedd', grass: '#8fdcc0', soil: '#fdeccc', accent: '#ffb347' },
      ledges: [
        { x: -300, y: -240, w: 760 },
        { x: 300, y: -480, w: 760, cp: true },
        { x: -300, y: -960, w: 700, cp: true },
        { x: 300, y: -1440, w: 700, cp: true },
        { x: 0, y: -1680, w: 900, cp: true, goal: true },
      ],
      object: { type: 'crate', size: 140, weight: 16 },
      hazards: [
        { type: 'platform', w: 340, path: [[-420, -720], [420, -720]], speed: 120, pause: 0.8 },
        { type: 'platform', w: 340, path: [[420, -1200], [-420, -1200]], speed: 130, pause: 0.8 },
      ],
    },

    /* ------------------------------------------------------------------ 5 */
    {
      id: 'grand-wobble',
      name: 'The Grand Wobble',
      twist: 'The finale! A huge ball, wind gusts, mushrooms, ice, falling rocks and a roaming boulder.',
      tip: 'Everything is out to get you. Keep the hits rotating and bounce back, bounce back, bounce back!',
      theme: { skyTop: '#ffc6e0', skyBottom: '#c6d8ff', hillFar: '#ffd9ec', hillNear: '#e3d0ff', grass: '#ff9fcb', soil: '#f4e4ff', accent: '#6c5ce7' },
      ledges: [
        { x: -300, y: -260, w: 760 },
        { x: 300, y: -520, w: 760, cp: true },
        { x: -300, y: -780, w: 760, ice: true },
        { x: 300, y: -1040, w: 760, cp: true },
        { x: -300, y: -1300, w: 760 },
        { x: 300, y: -1560, w: 760, cp: true },
        { x: -300, y: -1820, w: 760 },
        { x: 0, y: -2080, w: 920, cp: true, goal: true },
      ],
      object: { type: 'ball', radius: 125, weight: 34 },
      hazards: [
        { type: 'wind', y0: -1100, y1: -560, accel: [-420, 0], gust: { period: 6, on: 2.4 } },
        { type: 'spring', ledge: 1, dx: -280, power: 700, angle: 0, w: 110 },
        { type: 'mushroom', ledge: 4, dx: 250, power: 780, angle: 16, w: 150 },
        { type: 'boulder', ledge: 3, every: [12, 18], radius: 50 },
        { type: 'rocks', y0: -2100, y1: -1300, every: [2.5, 4.5], radius: [22, 36] },
        { type: 'wind', y0: -2150, y1: -1700, accel: [420, 0], gust: { period: 7, on: 2.6 } },
      ],
    },
  ];
})();
