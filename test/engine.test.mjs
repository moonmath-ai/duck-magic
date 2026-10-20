import test from 'node:test';
import assert from 'node:assert/strict';
import { newGame, resolveTurn, sanitizeVisual } from '../lib/engine.mjs';
import { mockPlan } from '../lib/model.mjs';

const spell = (kind = 'attack', power = 2, element = 'arcane') => ({ name: 'Test spell', kind, power, element, line: 'Magic!', visual: { motion: 'burst', count: 4, shapes: [{ type: 'circle', cx: 50, cy: 50, r: 20, fill: '#336699' }] } });

test('meatball mock produces recognizable falling shapes', () => {
  const plan = mockPlan('I summon a flood of meatballs above the duck', newGame());
  assert.equal(plan.player.visual.motion, 'rain');
  assert.ok(plan.player.visual.count >= 10);
  assert.ok(plan.player.visual.shapes.length >= 3);
});

test('both combatants spend MP, act, and regenerate', () => {
  const { state, event } = resolveTurn(newGame(), 'cast', { player: spell(), duck: spell() });
  assert.equal(state.turn, 1);
  assert.equal(state.player.hp, 19);
  assert.equal(state.duck.hp, 19);
  assert.equal(state.player.mp, 7);
  assert.equal(state.duck.mp, 7);
  assert.equal(event.toDuck, 5);
});

test('guard prevents damage and heal cannot exceed maximum', () => {
  const defended = resolveTurn(newGame(), 'guard', { player: spell('guard', 2), duck: spell('attack', 2) }).state;
  assert.equal(defended.player.hp, 24);
  defended.player.hp = 23;
  const healed = resolveTurn(defended, 'heal', { player: spell('heal', 2), duck: spell('guard', 1) }).state;
  assert.equal(healed.player.hp, 24);
});

test('insufficient MP downgrades or fizzles instead of overspending', () => {
  const game = newGame();
  game.player.mp = 3;
  game.duck.mp = 1;
  const { state, event } = resolveTurn(game, 'huge spell', { player: spell('attack', 3), duck: spell('attack', 3) });
  assert.equal(event.playerSpell.power, 1);
  assert.equal(event.playerSpell.cost, 3);
  assert.equal(event.duckSpell.fizzled, true);
  assert.equal(state.player.mp, 2);
  assert.equal(state.duck.mp, 3);
});

test('a wet arena empowers lightning and is then cleared', () => {
  const game = newGame();
  game.arena = 'wet';
  const { state, event } = resolveTurn(game, 'zap', { player: spell('attack', 1, 'lightning'), duck: spell('guard', 1) });
  assert.equal(event.toDuck, 1);
  assert.equal(state.arena, 'clear');
});

test('generated visuals reject markup, foreign attributes and unsafe paths', () => {
  const clean = sanitizeVisual({ motion: 'evil', count: 500, shapes: [
    { type: 'script', text: 'alert(1)' },
    { type: 'path', d: 'M 0 0 L 20 20 onload=evil()', fill: 'url(javascript:alert(1))' },
    { type: 'circle', cx: 50, cy: 50, r: 40, fill: '#aabbcc', onload: 'evil()' },
  ] });
  assert.equal(clean.count, 16);
  assert.equal(clean.motion, 'lob');
  assert.equal(clean.shapes.length, 1);
  assert.equal(clean.shapes[0].fill, '#aabbcc');
  assert.equal(clean.shapes[0].onload, undefined);
});

test('a completed game refuses more turns', () => {
  const game = newGame();
  game.duck.hp = 3;
  const result = resolveTurn(game, 'win', { player: spell(), duck: spell('guard', 1) });
  assert.equal(result.state.winner, null);
  const second = resolveTurn(result.state, 'win', { player: spell(), duck: spell() });
  assert.equal(second.state.winner, 'player');
  assert.throws(() => resolveTurn(second.state, 'again', { player: spell(), duck: spell() }), /duel is over/);
});
