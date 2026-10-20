import test from 'node:test';
import assert from 'node:assert/strict';
import { estimateMagicCost } from '../public/magic-preview.js';

test('magic preview is absent for an empty spell', () => {
  assert.equal(estimateMagicCost('   '), null);
});

test('magic preview distinguishes physical moves, cover, and expensive redirection', () => {
  assert.deepEqual(estimateMagicCost('I dodge to the left'), { min: 0, max: 3, style: 'Mostly physical action' });
  assert.deepEqual(estimateMagicCost('I conjure a stone wall'), { min: 3, max: 7, style: 'Magical protection' });
  assert.deepEqual(estimateMagicCost('I teleport behind the duck'), { min: 8, max: 10, style: 'Space-bending spell' });
  assert.deepEqual(estimateMagicCost('I run to the duck and hold him above my head'), { min: 0, max: 3, style: 'Mostly physical action' });
  assert.deepEqual(estimateMagicCost('I hold the duck over my head as a shield'), { min: 0, max: 3, style: 'Mostly physical action' });
  assert.deepEqual(estimateMagicCost('I switch places with the duck'), { min: 0, max: 0, style: 'Physical position change' });
  assert.deepEqual(estimateMagicCost('I magically switch places with the duck'), { min: 8, max: 10, style: 'Space-bending spell' });
});

test('check previews magic only, including a physical grab-and-swap', () => {
  const action = 'I run to the duck, grabbing him and switching places with him.';
  assert.deepEqual(estimateMagicCost(action), { min: 0, max: 0, style: 'Physical position change' });
});
