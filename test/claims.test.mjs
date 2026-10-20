import test from 'node:test';
import assert from 'node:assert/strict';
import { redemptionResult } from '../lib/claims.mjs';

const claim = Object.freeze({ reference: 'DM-1-test', outcome: 'player', rounds: 7, earnedAt: 100 });

test('redeeming records a timestamp without mutating the verified claim', () => {
  const first = redemptionResult(claim, 200);
  assert.equal(first.status, 200);
  assert.deepEqual(first.body.claim, { ...claim, redeemedAt: 200 });
  assert.equal(claim.redeemedAt, undefined);
  const second = redemptionResult(first.body.claim, 300);
  assert.equal(second.status, 409);
  assert.equal(second.body.claim.redeemedAt, 200);
  assert.match(second.body.error, /already redeemed/i);
});

test('unknown references cannot be redeemed', () => {
  const result = redemptionResult(undefined, 200);
  assert.equal(result.status, 404);
  assert.equal(result.body.verified, false);
});
