import test from 'node:test';
import assert from 'node:assert/strict';
import { SPELLS, chooseSpell, spellById } from '../lib/spells.mjs';
import { newGame, revealAttack, resolveDefense, spellCost, tacticFamily, MAX_HP, DUCK_HP, MAX_MP } from '../lib/counterspell.mjs';
import { mockJudge, liveAttack, liveJudge, retryModelResponse } from '../lib/judge.mjs';

test('spellbook has exactly 100 unique, concrete locked attacks', () => {
  assert.equal(SPELLS.length, 100);
  assert.equal(new Set(SPELLS.map(s => s.id)).size, 100);
  assert.equal(new Set(SPELLS.map(s => s.name)).size, 100);
  assert.deepEqual(new Set(SPELLS.map(s => s.category)), new Set(['classic', 'silly', 'homage', 'strange']));
  for (const spell of SPELLS) {
    assert.ok(spell.facts.length > 55, spell.name);
    assert.equal(spell.damage, 10);
  }
  assert.equal(spellById(36).name, 'Meatball Monsoon');
});

test('spell selection avoids previously seen attacks until exhausted', () => {
  const used = SPELLS.slice(0, 99).map(s => s.id);
  assert.equal(chooseSpell(used, () => 0).id, SPELLS[99].id);
});

test('all 100 spells have equal opening probability, including Acid Rain', () => {
  const chosen = Array.from({ length: 100 }, (_, index) => chooseSpell([], () => (index + 0.5) / 100).id);
  assert.deepEqual(chosen, SPELLS.map(spell => spell.id));
  assert.equal(chosen.filter(id => id === spellById(8).id).length, 1);
});

test('uniform choice ignores player tactics while excluding used spells', () => {
  const used = [1, 2, 8];
  const available = SPELLS.filter(spell => !used.includes(spell.id));
  const first = chooseSpell(used, () => 0);
  const last = chooseSpell(used, () => 0.999999);
  assert.equal(first.id, available[0].id);
  assert.equal(last.id, available.at(-1).id);
  assert.ok(!used.includes(first.id));
  assert.ok(!used.includes(last.id));
});

test('judge numbers, not player claims, determine actual HP loss and reversal', () => {
  const game = revealAttack(newGame(), { id: 36, line: 'Dinner is served!' });
  const result = resolveDefense(game, 'I open a portal above me, exiting above the duck.', { blocked: 10, reflected: 7, magicCost: 8, reason: 'The portal catches the volley and sends it back. This costs 8 magic.' });
  assert.equal(result.state.player.hp, MAX_HP);
  assert.equal(result.state.duck.hp, DUCK_HP - 7);
  assert.equal(result.state.player.mp, 3);
  assert.equal(result.event.magicCost, 9);
  assert.equal(result.event.reason, 'The portal catches the volley and sends it back.');
  assert.equal(result.event.taken, 0);
  assert.equal(result.event.attack.facts, spellById(36).facts);
  assert.equal(result.state.pending, null);
});

test('zero-reflection explanations omit irrelevant claims about duck damage', () => {
  const attack = revealAttack(newGame(), { id: 17 });
  const verdict = {
    blocked: 0, reflected: 0, magicCost: 0,
    reason: 'A jump lifts you off the ground for a second, but the earthquake lasts five seconds and throws you down. Nothing in the intervention addresses the shaking itself, so no damage is prevented and nothing is turned back on the duck. The duck takes no damage.',
  };
  const event = resolveDefense(attack, 'I jump', verdict).event;
  assert.match(event.reason, /shaking itself, so no damage is prevented\./);
  assert.doesNotMatch(event.reason, /duck/i);
  assert.equal(event.reflected, 0);
  const hit = resolveDefense(attack, 'I redirect it at the duck', { ...verdict, reflected: 3, reason: 'The redirected blast hits the duck for 3 HP.' }).event;
  assert.match(hit.reason, /hits the duck/i);
});

test('teleport costs the same whether it hurts the duck or not', () => {
  const claim = 'I teleport and switch places with the duck so its spell hits the duck.';
  const verdict = { blocked: 10, reflected: 7, magicCost: 0, reason: 'The duck is in the attack path.' };
  assert.equal(spellCost(claim, verdict), 8);
  assert.equal(spellCost(claim, { ...verdict, blocked: 0, reflected: 0 }), 8);
  let state = revealAttack(newGame(), { id: 1 });
  let result = resolveDefense(state, claim, verdict);
  assert.equal(result.event.fizzled, false);
  assert.equal(result.state.player.mp, 4);
  assert.equal(result.state.duck.hp, 17);
  state = revealAttack(result.state, { id: 2 });
  result = resolveDefense(state, claim, verdict);
  assert.equal(result.event.fizzled, true);
  assert.equal(result.event.blocked, 0);
  assert.equal(result.event.reflected, 0);
  assert.equal(result.state.duck.hp, 17);
  assert.equal(result.state.player.hp, 20);
  assert.equal(result.state.player.mp, 6);
  assert.match(result.event.reason, /8 magic \(you had 4\)/i);
});

test('physical cleverness is not charged extra for damaging the duck', () => {
  const action = 'I lift the duck into its own acid rain and use it as cover';
  const harmless = { blocked: 3, reflected: 0, magicCost: 0, reason: 'The duck covers your head.' };
  const damaging = { ...harmless, reflected: 7, reason: 'The duck intercepts the rain.' };
  assert.equal(spellCost(action, harmless), 0);
  assert.equal(spellCost(action, damaging), 0);
  assert.equal(spellCost('I conjure a modest wall', { ...harmless, magicCost: 3 }), 4);
  assert.equal(spellCost('I conjure a modest wall', { ...damaging, magicCost: 3 }), 4);
  const state = revealAttack(newGame(), { id: 2 });
  const result = resolveDefense(state, action, damaging);
  assert.equal(result.event.magicCost, 0);
  assert.equal(result.event.reflected, 7);
  assert.equal(result.state.player.mp, MAX_MP);
});

test('an unqualified place exchange is physical; an explicit magical swap is not', () => {
  const verdict = { blocked: 0, reflected: 0, magicCost: 7, reason: 'The player remains in danger.' };
  assert.equal(spellCost('i switch places with the duck', verdict), 0);
  assert.equal(spellCost('I physically swap positions with the duck.', verdict), 0);
  assert.equal(spellCost('I run to the duck, grabbing him and switching places with him.', verdict), 0);
  assert.equal(spellCost('I instantly switch places with the duck', { ...verdict, magicCost: 0 }), 8);
  assert.equal(spellCost('I teleport and switch places with the duck', { ...verdict, magicCost: 0 }), 8);
  assert.match(spellById(6).facts, /rest of the arena stays still/i);
});

test('magic recovers by two after every turn and never exceeds the pool', () => {
  let state = revealAttack(newGame(), { id: 1 });
  state = resolveDefense(state, 'I duck beneath it', { blocked: 10, reflected: 0, magicCost: 0, reason: 'I get below it.' }).state;
  assert.equal(state.player.mp, MAX_MP);
  state = revealAttack(state, { id: 2 });
  state = resolveDefense(state, 'I conjure a wall', { blocked: 10, reflected: 0, magicCost: 6, reason: 'A wall stops it.' }).state;
  assert.equal(state.player.mp, 5);
});

test('repeating a tactic within six turns reduces return damage, but not its block', () => {
  const action = 'I run to the duck, grabbing him and switching places with him.';
  const verdict = { blocked: 10, reflected: 8, magicCost: 0, reason: 'You move the duck into the path.' };
  assert.equal(tacticFamily(action), 'duck-grab');
  let state = revealAttack(newGame(), { id: 1 });
  let result = resolveDefense(state, action, verdict);
  assert.equal(result.event.fizzled, false);
  assert.equal(result.event.reflected, 8);
  assert.equal(result.state.player.mp, MAX_MP);
  state = revealAttack(result.state, { id: 2 });
  state = resolveDefense(state, 'I dodge beneath the blast', { blocked: 8, reflected: 0, magicCost: 0, reason: 'You avoid most of it.' }).state;
  state = revealAttack(state, { id: 3 });
  result = resolveDefense(state, action, verdict);
  assert.equal(result.event.reflected, 4);
  assert.equal(result.event.blocked, 10);
  assert.equal(result.event.repeatCount, 1);
  assert.equal(result.state.duck.hp, DUCK_HP - 12);
  assert.match(result.event.reason, /recognizes your repeated/i);
});

test('portal memory survives the magic-recovery turns needed to reuse it', () => {
  const portal = 'I open a portal above me with its exit above the duck.';
  let state = revealAttack(newGame(), { id: 36 });
  state = resolveDefense(state, portal, { blocked: 10, reflected: 8, magicCost: 7, reason: 'The attack returns through the portal.' }).state;
  for (const id of [37, 38, 39]) {
    state = revealAttack(state, { id });
    state = resolveDefense(state, 'I dodge to cover.', { blocked: 8, reflected: 0, magicCost: 0, reason: 'You move behind cover.' }).state;
  }
  state = revealAttack(state, { id: 40 });
  const result = resolveDefense(state, portal, { blocked: 10, reflected: 8, magicCost: 7, reason: 'The attack returns through the portal.' });
  assert.equal(result.event.fizzled, false);
  assert.equal(result.event.reflected, 4);
  assert.equal(result.event.blocked, 10);
});

test('old saved games lose the retired stamina field', () => {
  const state = revealAttack(newGame(), { id: 1 });
  state.player.stamina = 3;
  const result = resolveDefense(state, 'I dodge', { blocked: 5, reflected: 0, magicCost: 0, staminaCost: 1, reason: 'You partly dodge.' });
  assert.equal(result.state.player.stamina, undefined);
  assert.equal(result.event.staminaCost, undefined);
});

test('referee cannot invent reflected damage from a move that never sends anything back', () => {
  const state = revealAttack(newGame(), { id: 2 });
  const result = resolveDefense(state, 'I sweep the sock puppets off my robe.', { blocked: 8, reflected: 10, magicCost: 0, reason: 'You sweep them away and they strike the duck.' });
  assert.equal(result.event.reflected, 0);
  assert.equal(result.state.duck.hp, DUCK_HP);
});

test('attack facts cannot be rewritten by a model choice', () => {
  const state = revealAttack(newGame(), { id: 1, facts: 'harmless confetti', damage: 0, name: 'Fake', line: 'Watch out.' });
  assert.equal(state.pending.name, 'Fireball');
  assert.equal(state.pending.damage, 10);
  assert.equal(state.pending.facts, spellById(1).facts);
});

test('mock is openly simplistic but distinguishes vague, specific, and causal counters', () => {
  const attack = spellById(36);
  assert.deepEqual([mockJudge(attack, 'I raise a roof').blocked, mockJudge(attack, 'I raise a stone roof').blocked, mockJudge(attack, 'I eat them all').blocked], [6, 10, 0]);
  assert.equal(mockJudge(attack, 'I open a portal above me with its exit above the duck').reflected, 7);
  assert.equal(mockJudge(SPELLS.find(s => s.name === 'Laser-Sword Sweep'), 'I duck beneath the waist-high sweep').blocked, 10);
  assert.doesNotMatch(mockJudge(attack, 'I raise a stone roof').reason, /the duck/i);
  assert.match(mockJudge(attack, 'I open a portal above me with its exit above the duck').reason, /duck/i);
});

test('irrelevant defenses get no consolation block and an attack-specific explanation', () => {
  const reflection = SPELLS.find(spell => spell.name === 'Reflection Swap');
  assert.equal(reflection.name, 'Reflection Swap');
  const verdict = mockJudge(reflection, 'I pucker my lips');
  assert.equal(verdict.blocked, 0);
  assert.equal(verdict.reflected, 0);
  assert.match(verdict.reason, /lips.*mirror image.*behind/i);
  assert.match(verdict.reason, /full 10 HP/i);
  assert.equal(mockJudge(reflection, 'I raise a stone roof').blocked, 0);
  const generic = mockJudge(spellById(1), 'I pucker my lips');
  assert.equal(generic.blocked, 0);
  assert.match(generic.reason, /wagon-sized ball of fire/i);
  assert.doesNotMatch(generic.reason, /scale and timing/i);
});

test('game has a real lose condition and cannot apply another verdict after ending', () => {
  let state = newGame();
  for (let i = 0; i < 3; i++) {
    state = revealAttack(state, { id: i + 1 });
    state = resolveDefense(state, 'I do nothing', { blocked: 0, reflected: 0, reason: 'No defense.' }).state;
  }
  assert.equal(state.winner, 'duck');
  assert.throws(() => resolveDefense(state, 'I win', { blocked: 10, reflected: 10 }), /no attack/i);
});

test('a duel continues past twelve rounds while both combatants have HP', () => {
  let state = newGame();
  for (let i = 0; i < 13; i++) {
    state = revealAttack(state, { id: i + 1 });
    state = resolveDefense(state, 'I safely block it', { blocked: 10, reflected: 0, reason: 'The defense stops the attack.' }).state;
  }
  assert.equal(state.turn, 13);
  assert.equal(state.winner, null);
  assert.equal(state.player.hp, MAX_HP);
  assert.equal(state.duck.hp, DUCK_HP);
  assert.equal(revealAttack(state, { id: 14 }).pending.id, 14);
});

test('live duck narrates the server-selected spell and judge sees only the locked attack', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    const request = JSON.parse(options.body);
    requests.push(request);
    const answer = requests.length === 1 ? { line: 'Dinner is served!' } : { blocked: 6, reflected: 0, magicCost: 3, reason: 'A wooden roof leaves gaps.' };
    return { ok: true, json: async () => ({ model: 'test-model', choices: [{ message: { content: JSON.stringify(answer) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) };
  };
  try {
    const env = { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'test-model' };
    const attack = await liveAttack(newGame(), env, () => 0.355);
    assert.equal(attack.id, 36);
    assert.match(requests[0].messages[0].content, /uniformly at random/);
    const choiceInput = JSON.parse(requests[0].messages[1].content);
    assert.equal(choiceInput.lockedSpell.id, 36);
    assert.equal(choiceInput.candidateSpells, undefined);
    assert.deepEqual(choiceInput.recentCounters, []);
    const verdict = await liveJudge(spellById(36), 'I raise a roof', env);
    assert.equal(verdict.blocked, 6);
    assert.equal(verdict.magicCost, 3);
    assert.match(requests[1].messages[1].content, /Twelve hot, bowling-ball-sized meatballs/);
    assert.doesNotMatch(requests[1].messages[1].content, /Upside-Down Rain/);
    assert.match(requests[1].messages[0].content, /name the player's actual intervention/i);
    assert.match(requests[1].messages[0].content, /when reflected is 0, do not mention the duck's safety/i);
    assert.match(requests[1].messages[0].content, /Do NOT increase or decrease magicCost based on blocked damage, reflected damage/i);
    assert.match(requests[1].messages[0].content, /Earthquake shakes only its stated starting patch/i);
  } finally { globalThis.fetch = originalFetch; }
});

test('Qwen slash-prefixed magicCost is normalized without relaxing numeric validation', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ model: 'Qwen/Qwen3.8-27B', choices: [{ message: { content: JSON.stringify({ '/magicCost': 5, blocked: 10, reflected: 0, reason: 'The roof catches the volley.' }) } }], usage: { prompt_tokens: 100, completion_tokens: 20 } }) };
  };
  try {
    const verdict = await liveJudge(spellById(36), 'I raise a stone roof.', { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'Qwen/Qwen3.8-27B' }, false, [{ tactic: 'portal', defense: 'I swap places with the duck.', reflected: 4 }]);
    assert.equal(verdict.magicCost, 5);
    assert.equal(verdict.blocked, 10);
    assert.equal(request.chat_template_kwargs.enable_thinking, false);
    assert.equal(request.reasoning_effort, undefined);
    assert.equal(request.max_tokens, 650);
    assert.match(request.messages[0].content, /ONLY current action/);
    assert.equal(JSON.parse(request.messages[1].content).recentTactics[0].defense, undefined);
  } finally { globalThis.fetch = originalFetch; }
});

test('Qwen retries an empty JSON verdict with a focused schema reminder', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const content = requests.length === 1 ? '{"":""}' : JSON.stringify({ magicCost: 0, blocked: 7, reflected: 0, reason: 'The player moves clear of most of the attack.' });
    return { ok: true, json: async () => ({ model: 'Qwen/Qwen3.8-27B', choices: [{ message: { content } }] }) };
  };
  try {
    const env = { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'Qwen/Qwen3.8-27B' };
    const verdict = await retryModelResponse(retry => liveJudge(spellById(1), 'I jump sideways.', env, retry));
    assert.equal(verdict.blocked, 7);
    assert.equal(requests.length, 2);
    assert.match(requests[1].messages[0].content, /previous verdict failed the required JSON schema/);
    assert.equal(requests[1].chat_template_kwargs.enable_thinking, false);
    assert.equal(requests[1].max_tokens, 950);
  } finally { globalThis.fetch = originalFetch; }
});

test('a transient provider 500 is retried once without changing game state', async () => {
  const originalFetch = globalThis.fetch;
  let calls = 0;
  globalThis.fetch = async () => {
    calls++;
    if (calls === 1) return { ok: false, status: 500 };
    return { ok: true, json: async () => ({ model: 'Qwen/Qwen3.8-27B', choices: [{ message: { content: JSON.stringify({ line: 'Catch this!' }) } }] }) };
  };
  try {
    const attack = await retryModelResponse(retry => liveAttack(newGame(), { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'Qwen/Qwen3.8-27B' }, () => 0, retry));
    assert.equal(attack.line, 'Catch this!');
    assert.equal(calls, 2);
  } finally { globalThis.fetch = originalFetch; }
});

test('duck taunt receives prior player counters without changing spell selection', async () => {
  const originalFetch = globalThis.fetch;
  let request;
  globalThis.fetch = async (_url, options) => {
    request = JSON.parse(options.body);
    return { ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ id: 8, line: 'Try this one!' }) } }] }) };
  };
  try {
    const state = { ...newGame(), turn: 2, history: [
      { attack: spellById(36), defense: 'I sprint to the side', blocked: 8, reflected: 0, taken: 2 },
      { attack: spellById(1), defense: 'I sprint to the side', blocked: 6, reflected: 0, taken: 4 },
    ] };
    const attack = await liveAttack(state, { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'test-model' }, () => 0);
    const input = JSON.parse(request.messages[1].content);
    assert.equal(input.recentCounters.length, 2);
    assert.equal(input.lockedSpell.id, 1);
    assert.equal(attack.id, 1);
  } finally { globalThis.fetch = originalFetch; }
});

test('model cannot override a uniformly selected spell', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ choices: [{ message: { content: JSON.stringify({ id: 100, line: 'I cast Upside-Down Rain!' }) } }] }) });
  try {
    const state = newGame();
    const result = await liveAttack(state, { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'test-model' }, () => 0);
    assert.equal(result.id, SPELLS[0].id);
    assert.equal(result.line, 'I cast Upside-Down Rain!');
  } finally { globalThis.fetch = originalFetch; }
});

test('incomplete judge JSON retries once with more room and keeps failed-call usage', async () => {
  const originalFetch = globalThis.fetch;
  const requests = [];
  const failures = [];
  globalThis.fetch = async (_url, options) => {
    requests.push(JSON.parse(options.body));
    const content = requests.length === 1
      ? '{"blocked":10,"reflected":'
      : JSON.stringify({ blocked: 10, reflected: 0, magicCost: 4, reason: 'Your stone cover catches the attack.' });
    return { ok: true, json: async () => ({ model: 'glm-5.3-flash', choices: [{ message: { content } }], usage: { prompt_tokens: 120, completion_tokens: 50 } }) };
  };
  try {
    const env = { baseUrl: 'https://example.invalid/v1', apiKey: 'test-only', model: 'glm-5.3-flash' };
    const result = await retryModelResponse(async retry => {
      try { return await liveJudge(spellById(1), 'I raise a stone wall.', env, retry); }
      catch (error) { failures.push(error); throw error; }
    });
    assert.equal(result.blocked, 10);
    assert.equal(requests.length, 2);
    assert.deepEqual(requests.map(request => request.max_tokens), [650, 950]);
    assert.equal(failures[0].code, 'INCOMPLETE_JSON');
    assert.deepEqual(failures[0].telemetry.usage, { promptTokens: 120, completionTokens: 50 });
  } finally { globalThis.fetch = originalFetch; }
});
