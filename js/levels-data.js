/* ==========================================================================
   levels-data.js  -  levels as plain data. Copy a level, tweak it, add it to the array. That's it.

   The world is OPEN SPACE: a flat floor at y = 0 and floating LEDGES stacked above it.
   Up is negative y. Ledges are one-way: you can jump / bounce up through them and land on top.

   LEVEL FORMAT
   ------------
   id, name, twist (shown on level select), tip (shown when the level starts)
   theme:   colours { skyTop, skyBottom, hillFar, hillNear, grass, soil, accent }
   arena:   { halfWidth }                           optional, walls at +-halfWidth (default 850)
   ledges:  [ { x, y, w, cp?, goal?, ice?, extra? } ]  x = centre, y = TOP surface, w = width
              extra:true -> a helper platform (side perch, stepping stone...), not part of the ball's main route
              Keep the MAIN route first in the array: hazards refer to ledges by their index.
   blocks:  [ { x, y, w, h } ]                      solid towers / pillars (solid from every side). y = top surface
              cp:true   -> a checkpoint: the object resting here becomes your respawn point
              goal:true -> the summit: object resting here wins the level
              ice:true  -> slippery
   object:  { type:'ball'|'egg'|'crate', weight, ... }   weight = how many "blob-masses" it is.
              Heavier object => weaker hits => more chained teamwork needed (see config.js "hit")
   hazards: list of
     { type:'wind',     y0, y1, accel:[ax,ay], gust:{period,on}? }                 push zone between heights y0..y1
     { type:'rocks',    y0, y1, every:[min,max], radius:[min,max] }                falling rocks while the object is between y0..y1
     { type:'spring' | 'mushroom', ledge, dx, power, angle, w, objPower? }          launch pad on ledge #ledge (-1 = floor). angle>0 leans right.
                                                                                 power launches blobs, objPower launches the ball/egg/crate
     { type:'boulder',  ledge, every:[min,max], radius, reach }                    boulder rolls across ledge #ledge now and then
     { type:'platform', w, path:[[x,y],[x,y]], speed, pause }                      moving (one-way) platform; vertical paths make a lift
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
        // main route: zig-zag up the tower
        { x: -320, y: -300, w: 720 },
        { x: 320, y: -600, w: 720, cp: true },
        { x: -320, y: -900, w: 720 },
        { x: 320, y: -1200, w: 720, cp: true },
        { x: -320, y: -1500, w: 720 },
        { x: 320, y: -1800, w: 720, cp: true },
        { x: 0, y: -2100, w: 1300, cp: true, goal: true },
        // helper platforms: a step up from the floor, side perches for hitting from a different angle
        { x: 0, y: -150, w: 220, extra: true },
        { x: -760, y: -480, w: 180, extra: true },
        { x: 760, y: -780, w: 180, extra: true },
        { x: -760, y: -1080, w: 180, extra: true },
        { x: 760, y: -1380, w: 180, extra: true },
        { x: -760, y: -1680, w: 180, extra: true },
        { x: 0, y: -1650, w: 260, extra: true },
      ],
      object: { type: 'ball', radius: 85, weight: 14 },
      hazards: [],
    },

    /* ------------------------------------------------------------------ 2 */
    {
      id: 'mushroom-hop',
      name: 'Mushroom Hop',
      twist: 'A heavier ball and wide gaps. Bounce across on the mushrooms!',
      tip: 'Roll the ball onto a mushroom and it boings across the gap. Mushrooms launch blobs too, so you can ride them!',
      theme: { skyTop: '#d5c8ff', skyBottom: '#ffe3f1', hillFar: '#e6dcff', hillNear: '#ffd9ec', grass: '#c3a6ff', soil: '#ffe9f4', accent: '#ff8fd0' },
      arena: { halfWidth: 950 },
      ledges: [
        // main route: ledges on opposite sides with a wide gap in the middle; mushrooms bridge it
        { x: -570, y: -300, w: 560 },
        { x: 490, y: -600, w: 640, cp: true },
        { x: -570, y: -900, w: 560 },
        { x: 490, y: -1200, w: 640, cp: true },
        { x: -570, y: -1500, w: 560 },
        { x: 490, y: -1800, w: 640, cp: true },
        { x: 0, y: -2100, w: 1600, cp: true, goal: true },
        // helper platforms: stepping stones up the middle of the gap + a start ramp
        { x: -80, y: -170, w: 220, extra: true },
        { x: 0, y: -450, w: 200, extra: true },
        { x: -40, y: -750, w: 200, extra: true },
        { x: 20, y: -1050, w: 200, extra: true },
        { x: -40, y: -1350, w: 200, extra: true },
        { x: 20, y: -1650, w: 200, extra: true },
        { x: 860, y: -380, w: 160, extra: true },
        { x: -860, y: -1200, w: 160, extra: true },
      ],
      blocks: [
        { x: 880, y: -300, w: 140, h: 300 },     // a tower to hop onto on the right
      ],
      object: { type: 'ball', radius: 100, weight: 24 },
      hazards: [
        // launch pads at the ends of each main ledge, tilted toward the next one
        { type: 'mushroom', ledge: 0, dx: 230, power: 900, objPower: 760, angle: 30, w: 130 },
        { type: 'mushroom', ledge: 1, dx: -250, power: 900, objPower: 760, angle: -30, w: 130 },
        { type: 'mushroom', ledge: 2, dx: 230, power: 900, objPower: 760, angle: 30, w: 130 },
        { type: 'mushroom', ledge: 3, dx: -250, power: 900, objPower: 760, angle: -30, w: 130 },
        { type: 'mushroom', ledge: 4, dx: 230, power: 900, objPower: 760, angle: 30, w: 130 },
        { type: 'mushroom', ledge: 5, dx: -250, power: 900, objPower: 760, angle: -30, w: 130 },
        // a lift so blobs can get up the side quickly
        { type: 'platform', w: 220, path: [[-880, -60], [-880, -620]], speed: 150, pause: 1.2 },
      ],
    },

    /* ------------------------------------------------------------------ 3 */
    {
      id: 'eggs-press',
      name: 'Eggs-press Delivery',
      twist: 'A fragile egg that cracks if it lands too hard. Catch it!',
      tip: 'Watch the damage bar. Hitting the egg back up cushions a fall - dropping it on a ledge hurts!',
      theme: { skyTop: '#ffe9b8', skyBottom: '#ffd6e0', hillFar: '#ffe9d1', hillNear: '#ffdcc2', grass: '#ffd36b', soil: '#fff0d6', accent: '#ff9a5c' },
      arena: { halfWidth: 950 },
      ledges: [
        // main route: includes two icy ledges and a narrow one
        { x: -330, y: -280, w: 700 },
        { x: 330, y: -560, w: 700, cp: true },
        { x: -330, y: -840, w: 700, ice: true },
        { x: 330, y: -1120, w: 700, cp: true },
        { x: -330, y: -1400, w: 480 },
        { x: 330, y: -1680, w: 700, cp: true },
        { x: -330, y: -1960, w: 700, ice: true },
        { x: 0, y: -2240, w: 960, cp: true, goal: true },
        // helper platforms: safe shelves that catch a dropped egg, perches at the walls
        { x: 0, y: -140, w: 240, extra: true },
        { x: 0, y: -420, w: 260, extra: true },
        { x: 0, y: -700, w: 260, extra: true },
        { x: 0, y: -980, w: 260, extra: true },
        { x: 0, y: -1260, w: 260, extra: true },
        { x: 0, y: -1540, w: 260, extra: true },
        { x: 0, y: -1820, w: 260, extra: true },
        { x: 0, y: -2100, w: 260, extra: true },
        { x: -860, y: -700, w: 170, extra: true },
        { x: 860, y: -1260, w: 170, extra: true },
      ],
      blocks: [
        { x: 880, y: -560, w: 140, h: 200 },
        { x: -880, y: -1400, w: 140, h: 220 },
      ],
      object: { type: 'egg', weight: 9, width: 74, height: 100 },
      hazards: [
        { type: 'spring', ledge: -1, dx: 700, power: 1000, angle: 0, w: 110 },     // floor spring: bounce up to a perch
        { type: 'spring', ledge: 14, dx: 0, power: 900, angle: 0, w: 100 },
      ],
    },

    /* ------------------------------------------------------------------ 4 */
    {
      id: 'crate-escalator',
      name: 'Crate Escalator',
      twist: 'A big wobbly crate, sliding platforms, a lift and stone towers.',
      tip: 'Crates tumble and land on their corners. Ride the sliding platforms and the lift to get above the crate!',
      theme: { skyTop: '#c5f1e8', skyBottom: '#fff7d6', hillFar: '#d6f4ea', hillNear: '#cdeedd', grass: '#8fdcc0', soil: '#fdeccc', accent: '#ffb347' },
      arena: { halfWidth: 1050 },
      ledges: [
        { x: -360, y: -300, w: 720 },
        { x: 360, y: -600, w: 720, cp: true },
        { x: -360, y: -900, w: 720 },
        { x: 360, y: -1200, w: 720, cp: true },
        { x: -360, y: -1500, w: 720 },
        { x: 360, y: -1800, w: 720, cp: true },
        { x: -360, y: -2100, w: 720 },
        { x: 0, y: -2400, w: 1000, cp: true, goal: true },
        // helpers
        { x: 0, y: -150, w: 240, extra: true },
        { x: 960, y: -900, w: 170, extra: true },
        { x: -960, y: -1500 + 150, w: 170, extra: true },
        { x: 960, y: -2100, w: 170, extra: true },
        { x: 0, y: -1050, w: 240, extra: true },
        { x: 0, y: -1650, w: 240, extra: true },
        { x: 0, y: -2250, w: 240, extra: true },
      ],
      blocks: [
        { x: 960, y: -300, w: 160, h: 300 },
        { x: -960, y: -700, w: 160, h: 400 },
        { x: 960, y: -1500, w: 160, h: 300 },
        { x: -960, y: -2100, w: 160, h: 400 },
      ],
      object: { type: 'crate', size: 140, weight: 16 },
      hazards: [
        // sliding platforms in the gaps between the main ledges
        { type: 'platform', w: 340, path: [[-560, -750], [560, -750]], speed: 130, pause: 0.8 },
        { type: 'platform', w: 340, path: [[560, -1350], [-560, -1350]], speed: 140, pause: 0.8 },
        { type: 'platform', w: 340, path: [[-560, -1950], [560, -1950]], speed: 150, pause: 0.8 },
        // lifts up the side walls
        { type: 'platform', w: 220, path: [[-880, -60], [-880, -1000]], speed: 170, pause: 1.5 },
        { type: 'platform', w: 220, path: [[880, -1000], [880, -2000]], speed: 170, pause: 1.5 },
      ],
    },

    /* ------------------------------------------------------------------ 5 */
    {
      id: 'grand-wobble',
      name: 'The Grand Wobble',
      twist: 'The finale! A huge ball, wind gusts, mushrooms, ice, falling rocks and a roaming boulder.',
      tip: 'Everything is out to get you. Keep the hits rotating and bounce back, bounce back, bounce back!',
      theme: { skyTop: '#ffc6e0', skyBottom: '#c6d8ff', hillFar: '#ffd9ec', hillNear: '#e3d0ff', grass: '#ff9fcb', soil: '#f4e4ff', accent: '#6c5ce7' },
      arena: { halfWidth: 1100 },
      ledges: [
        // main route
        { x: -380, y: -280, w: 760 },
        { x: 380, y: -560, w: 760, cp: true },
        { x: -380, y: -840, w: 760, ice: true },
        { x: 380, y: -1120, w: 760, cp: true },        // 3: the boulder rolls across this one
        { x: -380, y: -1400, w: 760 },                  // 4: mushroom
        { x: 380, y: -1680, w: 760, cp: true },
        { x: -380, y: -1960, w: 760, ice: true },
        { x: 380, y: -2240, w: 760, cp: true },
        { x: 250, y: -2520, w: 1400, cp: true, goal: true },
        // helper platforms
        { x: 0, y: -150, w: 240, extra: true },
        { x: 0, y: -430, w: 240, extra: true },
        { x: 0, y: -710, w: 240, extra: true },
        { x: 0, y: -990, w: 240, extra: true },
        { x: 0, y: -1270, w: 240, extra: true },
        { x: 0, y: -1550, w: 240, extra: true },
        { x: 0, y: -1830, w: 240, extra: true },
        { x: 0, y: -2110, w: 240, extra: true },
        { x: 0, y: -2390, w: 240, extra: true },
        { x: -1010, y: -560, w: 170, extra: true },
        { x: 1010, y: -1120, w: 170, extra: true },
        { x: -1010, y: -1680, w: 170, extra: true },
        { x: 1010, y: -2240, w: 170, extra: true },
      ],
      blocks: [
        { x: -1010, y: -300, w: 160, h: 300 },
        { x: 1010, y: -840, w: 160, h: 280 },
        { x: -1010, y: -1400, w: 160, h: 280 },
        { x: 1010, y: -1960, w: 160, h: 280 },
      ],
      object: { type: 'ball', radius: 125, weight: 30 },
      hazards: [
        { type: 'wind', y0: -1200, y1: -560, accel: [-420, 0], gust: { period: 6, on: 2.4 } },
        { type: 'spring', ledge: 1, dx: -300, power: 1000, angle: 0, w: 110 },
        { type: 'boulder', ledge: 3, every: [12, 18], radius: 50 },
        { type: 'mushroom', ledge: 4, dx: 270, power: 1000, angle: 14, w: 150 },
        { type: 'rocks', y0: -2560, y1: -1700, every: [2.5, 4.5], radius: [22, 36] },
        { type: 'wind', y0: -2300, y1: -1650, accel: [420, 0], gust: { period: 7, on: 2.6 } },
        { type: 'spring', ledge: 6, dx: -300, power: 1000, angle: 0, w: 110 },
        { type: 'platform', w: 220, path: [[-1010, -100], [-1010, -1000]], speed: 180, pause: 1.5 },
      ],
    },
  ];
})();
