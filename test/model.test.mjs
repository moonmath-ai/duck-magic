import test from 'node:test';
import assert from 'node:assert/strict';
import { livePlan } from '../lib/model.mjs';
import { newGame } from '../lib/engine.mjs';

test('live model adapter sends current state and accepts a novel shape recipe', async () => {
  const original = globalThis.fetch;
  let request;
  globalThis.fetch = async (url, init) => {
    request = { url, init };
    return new Response(JSON.stringify({
      model: 'glm-5.3-flash',
      usage: { prompt_tokens: 311, completion_tokens: 127 },
      choices: [{ message: { content: JSON.stringify({
        player: { name: 'Meatball Monsoon', kind: 'attack', element: 'food', power: 3, line: 'Dinner falls!', visual: { motion: 'rain', count: 14, color: '#ad512c', shapes: [{ type: 'circle', cx: 50, cy: 50, r: 30, fill: '#ad512c' }, { type: 'circle', cx: 36, cy: 39, r: 6, fill: '#e9824e' }] } },
        duck: { name: 'Royal Umbrella', kind: 'guard', element: 'arcane', power: 2, line: 'My crown stays clean!', visual: { motion: 'spiral', count: 4, color: '#f7d75a', shapes: [{ type: 'path', d: 'M 10 60 Q 50 10 90 60 Z', fill: '#f7d75a' }] } },
      }) } }],
    }), { status: 200, headers: { 'Content-Type': 'application/json' } });
  };
  try {
    const result = await livePlan('I summon a flood of meatballs above the duck', newGame(), { apiKey: 'test-key', model: 'glm-5.3-flash', baseUrl: 'https://example.test/v1' });
    assert.equal(request.url, 'https://example.test/v1/chat/completions');
    assert.equal(JSON.parse(request.init.body).model, 'glm-5.3-flash');
    assert.equal(JSON.parse(request.init.body).messages[1].content.includes('meatballs'), true);
    assert.equal(result.player.visual.motion, 'rain');
    assert.equal(result.player.visual.count, 14);
    assert.deepEqual(result.usage, { promptTokens: 311, completionTokens: 127 });
  } finally { globalThis.fetch = original; }
});
