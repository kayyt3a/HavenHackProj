/* ==========================================================================
   config.js  -  ALL the tuning knobs in one place.
   Units: pixels (px), seconds (s). Speeds are px/s, accelerations px/s^2.
   Gravity 1.0 == 1000 px/s^2. Tweak, save, refresh the page.
   ========================================================================== */
(function () {
  const BBH = (window.BBH = window.BBH || {});

  BBH.CONFIG = {
    // ------------------------------------------------------------------ physics
    world: {
      stepHz: 60,              // fixed physics rate. Rendering is decoupled from this.
      maxCatchUpSteps: 6,      // max physics steps in one frame (stops the "spiral of death")
      gravity: 0.6,            // Matter gravity.y. 1.0 = 1000 px/s^2. Lower = floatier, longer hang time
      positionIterations: 10,
      velocityIterations: 8,
      constraintIterations: 4,
      ledgeThickness: 30,      // collision thickness of ledges (they are one-way: jump up through them)
      ledgeTolerance: 14,      // how far a body may sink into a ledge top and still count as "standing on it"
      arenaHalfWidth: 850,     // default arena half-width (levels can override)
    },

    // -------------------------------------------------------------------- blobs
    blob: {
      radius: 24,
      density: 0.0011,         // blob mass is ~2.0 with these numbers
      moveSpeed: 300,          // top running speed
      groundAccel: 4800,       // run acceleration on the ground
      airAccel: 2600,          // air steering. Higher = easier to line up under the ball
      brakeAccel: 4200,        // how fast a blob stops when you let go of the keys
      iceControl: 0.10,        // 1 = normal grip, 0 = pure ice. Applies to accel + brake on ice
      jumpSpeed: 820,          // launch speed of a hop. Apex height = v^2 / (2 * gravity * 1000)  (820 -> ~560 px)
      jumpCut: 0.55,           // releasing jump early multiplies upward speed by this (variable height)
      fallFloat: 0.45,         // fraction of gravity cancelled while falling & holding jump = "floaty"
      coyoteTime: 0.10,        // can still jump this long after walking off a ledge
      jumpBuffer: 0.12,        // jump pressed slightly before landing still counts
      bounciness: 0.3,         // restitution - how bouncy the blob is on landing
      friction: 0.02,
      airFriction: 0.012,
      groundMinNormalY: 0.55,  // how steep a surface can be and still count as "ground"
      // ragdoll flop
      flopTime: 0.8,           // seconds limp; jump can recover early after the minimum lock below
      flopMinLock: 0.18,       // impact beat before jump-to-recover is allowed
      flopHitSpeed: 430,       // hit by a rock/boulder faster than this (px/s) => flop
      flopFallSpeed: 1100,     // landing faster than this => flop (jump/pad landings stay below it, long falls don't)
      flopMassBoostMax: 2.2,
      // defensive recovery for the rare case where a physics body is pinched in a ledge edge
      stuckSpeed: 18,          // px/s: steering below this speed counts as blocked
      stuckTime: 0.42,         // seconds of active airborne steering before a small escape nudge
      unstickSpeed: 150,       // horizontal px/s after the nudge
      unstickLift: 180,        // upward px/s after the nudge
    },

    // ---------------------------------------------------------------- THE HIT
    // Touching the object with a blob "hits" it. The blob that just hit it is LOCKED OUT
    // (passes through it, drawn as a ghost) until a DIFFERENT blob hits it. Chain hits to climb!
    hit: {
      impulse: 360,            // upward speed (px/s) added by one hit. Bigger = fewer hits needed per ledge
      side: 230,               // sideways push away from the hitter (aim by choosing which side you hit from)
      keepUp: 0.85,            // fraction of existing UP speed kept -> quick consecutive hits stack
      keepDown: 0.1,           // fraction of existing DOWN speed kept (a hit cancels the fall)
      maxSpeed: 760,           // speed cap after a hit (760 px/s = about 480 px of rise). Stops the ball rocketing off-screen
      referenceWeight: 16,     // an object this heavy (in blob-masses) gets the full impulse
      weightExponent: 0.45,    // heavier object => weaker hits (more teamwork). 0 = weight doesn't matter
      cooldown: 0.06,          // min time between any two hits on the same object
      ghostAlpha: 0.4,         // how see-through a locked-out blob looks
    },

    // ------------------------------------------------------------------ objects
    object: {
      // Level data gives object "weight" in blob-masses. It is multiplied by this per player count.
      massScaleByPlayers: { 2: 0.7, 3: 0.85, 4: 1.0 },
      airFriction: 0.001,
      ballFriction: 0.9,
      ballRestitution: 0.18,
      rollResist: 0.01,        // spin damping so the ball settles on a ledge
      windFactor: 0.45,        // wind pushes objects this fraction as hard as blobs
      // egg
      eggImpactThreshold: 360, // landings slower than this (px/s) do NO damage
      eggDamagePerSpeed: 0.0014,
      eggBlobFactor: 0.0,      // blob touches never hurt the egg
    },

    // ------------------------------------------------------------------- rules
    rules: {
      fallMargin: 330,         // object this far below the last checkpoint ledge => bounce back
      restTime: 0.35,          // object must sit on a ledge this long to claim it as a checkpoint / the summit
      blobRescueDepth: 700,    // a blob this far below the object is plopped back near it (free)
      noooSpeed: 520,          // object falling faster than this toward a locked-out teammate => NOOO
      noooCooldown: 7,
      respawnDelay: 0.5,
    },

    // ------------------------------------------------------------------ hazards
    hazards: {
      windAccel: 520,
      rockWarn: 1.0,           // seconds of "!" warning before a rock falls
      rockDespawn: 14,
      boulderWarn: 2.5,
      padCooldown: 0.25,
      padObjectFactor: 0.6,    // objects are launched at this fraction of the pad power
    },

    // ----------------------------------------------------------------- camera
    camera: {
      minZoom: 0.28,
      maxZoom: 0.95,
      padding: 260,
      smoothing: 3.4,
      zoomSmoothing: 1.8,
      lookUp: 170,             // shifts the view up (you are always climbing)
    },

    // ------------------------------------------------------------------- game feel
    feel: {
      shakeScale: 1.0,
      slowmoScale: 0.30,
      slowmoTime: 1.1,
      replayEnabled: true,
      replayWindow: 1.9,
      replaySpeed: 0.5,
      recordSeconds: 5,
    },
  };
})();
