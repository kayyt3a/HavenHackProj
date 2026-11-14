/* Headless regression checks for independent wallets, purchases and equipment. */
const assert = require('node:assert/strict');
global.window = global;
global.BBH = {};
require('../js/cosmetics.js');

const C = BBH.Cosmetics;
const state = C.normalize(null);
assert.equal(state.players.length, 4);
assert.deepEqual(state.players.map((p) => p.coins), [0, 0, 0, 0]);

// The chain number is the payout multiplier, credited only to the hitter.
assert.equal(C.award(state, 2, 10), 10);
assert.deepEqual(state.players.map((p) => p.coins), [0, 0, 10, 0]);
C.award(state, 0, 4);
assert.deepEqual(state.players.map((p) => p.coins), [4, 0, 10, 0]);

// Purchases are private to that player and cannot overdraw another wallet.
let result = C.buyOrEquip(state, 2, 'color', 'pink');
assert.equal(result.ok, false);
assert.equal(result.reason, 'coins');
C.award(state, 2, 30);
result = C.buyOrEquip(state, 2, 'color', 'pink');
assert.equal(result.ok, true);
assert.equal(state.players[2].coins, 5);
assert.equal(state.players[2].color, 'pink');
assert.equal(state.players[0].color, 'green');

// Owned items equip without charging twice.
const before = state.players[2].coins;
C.buyOrEquip(state, 2, 'color', 'pink');
assert.equal(state.players[2].coins, before);

// Every ball skin is free and immediately selectable.
assert.equal(C.equipBall(state, 'disco'), true);
assert.equal(state.ball, 'disco');
assert.equal(C.equipBall(state, 'not-a-skin'), false);

console.log('Cosmetics economy checks passed.');
