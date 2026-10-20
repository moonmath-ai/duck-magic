import test from 'node:test';
import assert from 'node:assert/strict';
import { callTelemetry, estimatedCostUsd } from '../lib/telemetry.mjs';
import { newGame, revealAttack, resolveDefense } from '../lib/counterspell.mjs';

test('GLM Flash cost includes cached reads at the cache rate, not full input rate', () => {
  const usage = { promptTokens: 1000, completionTokens: 100, cacheReadTokens: 500 };
  assert.equal(estimatedCostUsd(usage, 'glm-5.3-flash'), 0.00014);
  assert.equal(estimatedCostUsd(usage, 'zro/glm-5.3-flash'), 0.00014);
});

test('missing usage or unknown model never becomes a fake zero-dollar call', () => {
  assert.equal(estimatedCostUsd(null, 'glm-5.3-flash'), null);
  assert.equal(estimatedCostUsd({ promptTokens: 50, completionTokens: 10 }, 'unknown-model'), null);
  assert.equal(callTelemetry({ latencyMs: 400, usage: null, servedModel: 'glm-5.3-flash' }).estimatedCostUsd, null);
});

test('a completed turn retains both duck-choice and referee telemetry', () => {
  const duck = callTelemetry({ latencyMs: 300, usage: { promptTokens: 100, completionTokens: 20 }, servedModel: 'glm-5.3-flash' });
  const judge = callTelemetry({ latencyMs: 600, usage: { promptTokens: 200, completionTokens: 40 }, servedModel: 'glm-5.3-flash' });
  const state = revealAttack(newGame(), { id: 1, inference: duck });
  const result = resolveDefense(state, 'I raise a stone wall.', { blocked: 10, reflected: 0, magicCost: 4, reason: 'The wall stops the spell.' }, { judgeInference: judge });
  assert.deepEqual(result.event.calls, [duck, judge]);
  assert.equal(result.state.pending, null);
});

test('a recovered malformed reply remains in the round call ledger', () => {
  const duck = callTelemetry({ latencyMs: 300, usage: { promptTokens: 100, completionTokens: 20 }, servedModel: 'glm-5.3-flash' });
  const malformed = { ...callTelemetry({ latencyMs: 400, usage: { promptTokens: 200, completionTokens: 80 }, servedModel: 'glm-5.3-flash' }), failed: true };
  const judge = callTelemetry({ latencyMs: 600, usage: { promptTokens: 200, completionTokens: 40 }, servedModel: 'glm-5.3-flash' });
  const state = revealAttack(newGame(), { id: 1, inference: duck, modelCalls: [duck] });
  const result = resolveDefense(state, 'I raise a stone wall.', { blocked: 10, reflected: 0, magicCost: 4, reason: 'The wall stops the spell.' }, { judgeInferenceCalls: [malformed, judge] });
  assert.deepEqual(result.event.calls, [duck, malformed, judge]);
  assert.equal(result.event.calls.reduce((sum, call) => sum + call.estimatedCostUsd, 0), duck.estimatedCostUsd + malformed.estimatedCostUsd + judge.estimatedCostUsd);
});
