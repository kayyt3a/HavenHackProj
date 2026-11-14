/* Headless regression checks for level construction and one-way platform stability. */
const assert = require('node:assert/strict');

global.window = global;
global.Matter = require('../lib/matter.min.js');

for (const file of ['config', 'blob', 'object', 'hazards', 'level', 'levels-data']) {
  require(`../js/${file}.js`);
}

const idle = (n) => Array.from({ length: n }, () => ({ x: 0, jumpHeld: false, jumpPressed: false }));

// Every level must construct and survive several seconds of fixed-step physics
// without non-finite bodies or an accidental engine exception.
for (const def of BBH.LEVELS) {
  const level = new BBH.Level(def, 4);
  for (let i = 0; i < 240; i++) {
    level.step(1 / 60, idle(4));
    if (level.pendingBounce) level.respawnAll();
  }
  for (const body of Matter.Composite.allBodies(level.engine.world)) {
    assert.ok(Number.isFinite(body.position.x) && Number.isFinite(body.position.y), `${def.id}: non-finite body`);
  }
}

// Regression: an upward-moving objective crossing an island must not become
// solid until its lower edge has fully cleared the island top.
{
  const level = new BBH.Level(BBH.LEVELS[4], 4);
  const body = level.object.bodies[0];
  const oneWay = level.oneWays[0];
  const top = oneWay.body.bounds.min.y;
  const radius = level.object.radius;

  Matter.Body.setPosition(body, { x: oneWay.body.position.x, y: top - radius + 5 });
  Matter.Body.setVelocity(body, { x: 0, y: -8 });
  level.updateFilters();
  assert.equal(body.collisionFilter.mask & oneWay.bit, 0, 'rising ball became solid inside an island');

  Matter.Body.setPosition(body, { x: oneWay.body.position.x, y: top - radius - 25 });
  Matter.Body.setVelocity(body, { x: 0, y: 2 });
  level.updateFilters();
  assert.notEqual(body.collisionFilter.mask & oneWay.bit, 0, 'falling ball did not land from above');
}

// Regression: a genuinely pinched airborne blob receives a small escape nudge,
// and jump can cut short the non-interactive tail of a ragdoll flop.
{
  const level = new BBH.Level(BBH.LEVELS[0], 2);
  const blob = level.blobs[0];
  blob.grounded = false;
  Matter.Body.setPosition(blob.body, { x: 0, y: -400 });
  Matter.Body.setVelocity(blob.body, { x: 0, y: 0 });
  blob.input = { x: 1, jumpHeld: false, jumpPressed: false };
  for (let i = 0; i < 30; i++) blob.update(1 / 60);
  assert.ok(blob.body.velocity.x > 0 && blob.body.velocity.y < 0, 'pinched blob did not self-release');

  blob.limp = BBH.CONFIG.blob.flopTime - BBH.CONFIG.blob.flopMinLock - 0.05;
  blob.input = { x: 0, jumpHeld: true, jumpPressed: true };
  blob.update(1 / 60);
  assert.equal(blob.limp, 0, 'jump did not recover a flopped blob');
}

console.log(`Physics smoke checks passed for ${BBH.LEVELS.length} levels.`);
