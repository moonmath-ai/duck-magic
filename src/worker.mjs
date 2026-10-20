import { DurableObject } from 'cloudflare:workers';
import { newGame, revealAttack, resolveDefense } from '../lib/counterspell.mjs';
import { liveAttack, liveJudge, isRetryableModelResponse, retryModelResponse } from '../lib/judge.mjs';
import { chooseSpell } from '../lib/spells.mjs';
import { callTelemetry, estimatedCostUsd } from '../lib/telemetry.mjs';
import { redemptionResult } from '../lib/claims.mjs';

const SESSION_TTL_MS = 2 * 60 * 60 * 1000;
const PRESENCE_WINDOW_MS = 90 * 1000;
const CLEANUP_INTERVAL_MS = 15 * 60 * 1000;
const RESERVATION_USD = 0.005;
const MAX_CONCURRENT_CALLS = 6;

function json(value, status = 200) {
  return new Response(JSON.stringify(value), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' },
  });
}

function errorMessage(error) {
  return error?.name === 'AbortError' ? 'The model timed out. This turn was not applied.' : String(error?.message || 'The turn could not be resolved.');
}

function configuredModel(env, provider = 'zro') {
  return provider === 'qwen'
    ? { apiKey: env.TT_API_KEY || '', model: 'Qwen/Qwen3.8-27B', baseUrl: 'https://console.tenstorrent.com/v1', provider: 'tenstorrent' }
    : { apiKey: env.ZRO_API_KEY || '', model: env.ZRO_MODEL || 'glm-5.3-flash', baseUrl: env.ZRO_BASE_URL || 'https://zro.moonmath.ai/v1', provider: 'zro' };
}

function freshAnalytics(now = Date.now()) {
  return {
    startedAt: now, uniqueTrackingStartedAt: now, uniqueVisitors: 0, uniquePlayers: 0, uniqueWinners: 0,
    requests: 0, failedRequests: 0, malformedResponses: 0, unknownUsage: 0,
    promptTokens: 0, completionTokens: 0, cacheReadTokens: 0,
    knownCostUsd: 0, responseTimeMs: 0, timedCalls: 0,
    duckChoices: 0, refereeCalls: 0, playedDuels: 0, finishedDuels: 0,
    playerWins: 0, duckWins: 0, draws: 0, completedRounds: 0, lastCall: null,
  };
}

function inferenceCalls(game) {
  if (Array.isArray(game.inferenceCalls)) return game.inferenceCalls;
  const completed = (game.history || []).flatMap(event => Array.isArray(event.calls) ? event.calls : []);
  return [...completed, ...(game.pending?.inferenceCalls || [game.pending?.inference].filter(Boolean))];
}

async function readSpell(request) {
  const body = await request.text();
  if (body.length > 4000) throw new Error('Request too large.');
  let input;
  try { input = JSON.parse(body || '{}'); } catch { throw new Error('Invalid request.'); }
  const spell = String(input.spell || '').trim();
  if (!spell || spell.length > 180) throw new Error('Spell must be 1–180 characters.');
  return spell;
}

export class DuelState extends DurableObject {
  constructor(ctx, env) {
    super(ctx, env);
    this.activeCalls = 0;
    this.busySessions = new Set();
    this.analyticsWrites = Promise.resolve();
    this.browserTrackingQueue = Promise.resolve();
    this.ready = ctx.blockConcurrencyWhile(async () => {
      this.eventNumber = (await ctx.storage.get('eventNumber')) || 1;
      this.budget = (await ctx.storage.get('budget')) || { spent: 0, reserved: 0 };
      this.analytics = (await ctx.storage.get('analytics')) || freshAnalytics();
      this.analytics.malformedResponses ??= 0;
      if (this.analytics.uniqueTrackingStartedAt === undefined) {
        this.analytics.uniqueTrackingStartedAt = Date.now();
        this.analytics.uniqueVisitors = 0;
        this.analytics.uniquePlayers = 0;
        this.analytics.uniqueWinners = 0;
        await ctx.storage.put('analytics', this.analytics);
      }
    });
  }

  eventKey(kind, id) {
    return `${kind}:${this.eventNumber === 1 ? '' : `${this.eventNumber}:`}${id}`;
  }

  async session(id) {
    const key = this.eventKey('session', id);
    const saved = await this.ctx.storage.get(key);
    const game = saved && Date.now() - saved.lastActive < SESSION_TTL_MS ? saved.game : newGame();
    return { key, game };
  }

  async save(key, game) {
    await this.ctx.storage.put(key, { game, lastActive: Date.now() });
    if (!(await this.ctx.storage.getAlarm())) await this.ctx.storage.setAlarm(Date.now() + CLEANUP_INTERVAL_MS);
  }

  async issueRewardClaim(game) {
    if ((!game.winner || (game.winner !== 'player' && game.turn < 10)) || game.claimReference) return;
    const reference = `DM-${this.eventNumber}-${crypto.randomUUID()}`;
    await this.ctx.storage.put(`claim:${reference}`, { reference, eventNumber: this.eventNumber, rounds: game.turn, outcome: game.winner, earnedAt: Date.now() });
    game.claimReference = reference;
  }

  async onlinePlayerCount(now = Date.now()) {
    const presence = await this.ctx.storage.list({ prefix: this.eventKey('presence', '') });
    return [...presence.values()].filter(lastSeen => now - lastSeen < PRESENCE_WINDOW_MS).length;
  }

  async persistAnalytics() {
    const snapshot = structuredClone(this.analytics);
    this.analyticsWrites = this.analyticsWrites.catch(() => {}).then(() => this.ctx.storage.put('analytics', snapshot));
    await this.analyticsWrites;
  }

  async trackBrowser(id, { played = false, won = false } = {}) {
    const update = this.browserTrackingQueue.catch(() => {}).then(async () => {
      const key = this.eventKey('browser', id);
      const previous = (await this.ctx.storage.get(key)) || { visited: false, played: false, won: false };
      const next = { visited: true, played: previous.played || played, won: previous.won || won };
      if (!previous.visited) this.analytics.uniqueVisitors++;
      if (!previous.played && next.played) this.analytics.uniquePlayers++;
      if (!previous.won && next.won) this.analytics.uniqueWinners++;
      if (!previous.visited || previous.played !== next.played || previous.won !== next.won) {
        await this.ctx.storage.put(key, next);
        await this.persistAnalytics();
      }
    });
    this.browserTrackingQueue = update;
    await update;
  }

  async meteredCall(kind, action) {
    if (this.activeCalls >= MAX_CONCURRENT_CALLS) throw new Error('The duck is busy. Try again in a moment.');
    const limit = this.modelFallback === 'Qwen/Qwen3.8-27B'
      ? Number(this.env.DUEL_QWEN_BUDGET_USD || 3)
      : Number(this.env.DUEL_GLOBAL_BUDGET_USD || 2);
    if (this.budget.spent + this.budget.reserved + RESERVATION_USD > limit) throw new Error('The duel inference allowance is exhausted.');
    this.activeCalls++;
    this.budget.reserved += RESERVATION_USD;
    await this.ctx.storage.put('budget', this.budget);
    let result = null;
    let failure = null;
    try {
      result = await action();
      return result;
    } catch (error) {
      failure = error;
      error.metered = true;
      throw error;
    } finally {
      // A malformed response can still report usage; account for that failed call too.
      const observed = result || failure?.telemetry;
      const measured = observed ? estimatedCostUsd(observed.usage, observed.servedModel || this.modelFallback || this.env.ZRO_MODEL) : null;
      this.budget.spent += measured ?? RESERVATION_USD;
      this.budget.reserved = Math.max(0, this.budget.reserved - RESERVATION_USD);
      this.activeCalls--;
      this.analytics.requests++;
      this.analytics[kind === 'duck' ? 'duckChoices' : 'refereeCalls']++;
      if (!result) this.analytics.failedRequests++;
      if (failure && isRetryableModelResponse(failure)) this.analytics.malformedResponses++;
      if (observed) {
        const call = callTelemetry(observed, this.modelFallback || this.env.ZRO_MODEL);
        if (call.estimatedCostUsd === null) this.analytics.unknownUsage++;
        else this.analytics.knownCostUsd += call.estimatedCostUsd;
        this.analytics.promptTokens += call.usage?.promptTokens || 0;
        this.analytics.completionTokens += call.usage?.completionTokens || 0;
        this.analytics.cacheReadTokens += call.usage?.cacheReadTokens || 0;
        if (call.latencyMs !== null) { this.analytics.responseTimeMs += call.latencyMs; this.analytics.timedCalls++; }
        this.analytics.lastCall = { kind, ...call, failed: Boolean(failure), at: Date.now() };
      } else this.analytics.unknownUsage++;
      await this.ctx.storage.put('budget', this.budget);
      await this.persistAnalytics();
    }
  }

  async meteredDecision(kind, action) {
    const modelCalls = [];
    try {
      const result = await retryModelResponse(async retry => {
        try {
          const answer = await this.meteredCall(kind, () => action(retry));
          modelCalls.push(callTelemetry(answer, this.modelFallback || this.env.ZRO_MODEL));
          return answer;
        } catch (error) {
          if (error.metered) modelCalls.push({ ...callTelemetry(error.telemetry || {}, this.modelFallback || this.env.ZRO_MODEL), failed: true });
          throw error;
        }
      });
      return { ...result, modelCalls };
    } catch (error) {
      error.modelCalls = modelCalls;
      throw error;
    }
  }

  async startNewEvent(request) {
    let input;
    try { input = await request.json(); } catch { return json({ error: 'Invalid confirmation.' }, 400); }
    if (input?.confirm !== 'NEW EVENT') return json({ error: 'Type NEW EVENT to confirm.' }, 400);
    return this.ctx.blockConcurrencyWhile(async () => {
      try {
        if (input.expectedEventNumber !== this.eventNumber) return json({ error: 'This event has already changed. Refresh the dashboard before starting another.' }, 409);
        if (this.activeCalls || this.busySessions.size) return json({ error: 'A turn is still resolving. Wait for it to finish, then try again.' }, 409);
        await this.analyticsWrites;
        await this.browserTrackingQueue;
        const endedAt = Date.now();
        const nextNumber = this.eventNumber + 1;
        const nextAnalytics = freshAnalytics(endedAt);
        const nextBudget = { spent: 0, reserved: 0 };
        const archive = { eventNumber: this.eventNumber, endedAt, analytics: structuredClone(this.analytics), budget: structuredClone(this.budget) };
        await this.ctx.storage.put({
          [`eventArchive:${this.eventNumber}`]: archive,
          eventNumber: nextNumber,
          analytics: nextAnalytics,
          budget: nextBudget,
        });
        this.eventNumber = nextNumber;
        this.analytics = nextAnalytics;
        this.budget = nextBudget;
        return json({ ok: true, eventNumber: nextNumber, startedAt: endedAt });
      } catch {
        return json({ error: 'The new event could not be started. Nothing was reset; please try again.' }, 500);
      }
    });
  }

  async fetch(request) {
    await this.ready;
    const url = new URL(request.url);
    const path = url.pathname;
    if (path === '/api/operator/new-event') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      return this.startNewEvent(request);
    }
    if (path === '/api/operator/status' && request.method === 'GET') {
      const sessions = await this.ctx.storage.list({ prefix: this.eventKey('session', '') });
      const recent = [...sessions.values()].filter(value => Date.now() - value.lastActive < SESSION_TTL_MS);
      const previousEvent = this.eventNumber > 1 ? await this.ctx.storage.get(`eventArchive:${this.eventNumber - 1}`) : null;
      const qwen = request.headers.get('X-Duel-Provider') === 'qwen';
      return json({ eventNumber: this.eventNumber, analytics: this.analytics, previousEvent, budget: this.budget, budgetLimitUsd: Number(qwen ? this.env.DUEL_QWEN_BUDGET_USD || 3 : this.env.DUEL_GLOBAL_BUDGET_USD || 2), activeCalls: this.activeCalls, playersOnline: await this.onlinePlayerCount(), storedSessions: recent.length, storedPlayedSessions: recent.filter(value => value.game?.history?.length).length, model: qwen ? 'Qwen/Qwen3.8-27B' : this.env.ZRO_MODEL || 'glm-5.3-flash' });
    }
    if (path === '/api/operator/claim' && request.method === 'GET') {
      const reference = url.searchParams.get('reference') || '';
      if (!/^DM-\d+-[0-9a-f-]{36}$/.test(reference)) return json({ error: 'Enter a valid win reference.' }, 400);
      const claim = await this.ctx.storage.get(`claim:${reference}`);
      return claim ? json({ verified: true, claim }) : json({ verified: false, error: 'No eligible result matches this reference.' }, 404);
    }
    if (path === '/api/operator/claim/redeem') {
      if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
      let input;
      try { input = await request.json(); } catch { return json({ error: 'Invalid claim request.' }, 400); }
      const reference = input?.reference;
      if (typeof reference !== 'string' || !/^DM-\d+-[0-9a-f-]{36}$/.test(reference)) return json({ error: 'Enter a valid claim reference.' }, 400);
      return this.ctx.blockConcurrencyWhile(async () => {
        const key = `claim:${reference}`;
        const claim = await this.ctx.storage.get(key);
        const result = redemptionResult(claim);
        if (result.status === 200) await this.ctx.storage.put(key, result.body.claim);
        return json(result.body, result.status);
      });
    }
    const id = request.headers.get('X-Duel-Session');
    if (!id || !/^[0-9a-f-]{36}$/.test(id)) return json({ error: 'Invalid session.' }, 400);
    const { key, game } = await this.session(id);
    if (path === '/api/presence' && request.method === 'POST') {
      await this.save(key, game);
      await this.ctx.storage.put(this.eventKey('presence', id), Date.now());
      return json({ playersOnline: await this.onlinePlayerCount(), eventNumber: this.eventNumber });
    }
    const env = configuredModel(this.env, request.headers.get('X-Duel-Provider') === 'qwen' ? 'qwen' : 'zro');
    this.modelFallback = env.model;
    if (!env.apiKey) return json({ error: 'Live inference has not been configured.' }, 503);
    if (path === '/api/state' && request.method === 'GET') {
      await this.issueRewardClaim(game);
      await this.save(key, game);
      await this.trackBrowser(id);
      return json({ game, mode: 'live', model: env.model, provider: env.provider, eventNumber: this.eventNumber });
    }
    if (path === '/api/new' && request.method === 'POST') {
      if (this.busySessions.has(id)) return json({ error: 'A spell is still resolving.' }, 409);
      const fresh = newGame();
      await this.save(key, fresh);
      return json({ game: fresh, mode: 'live', eventNumber: this.eventNumber });
    }
    if (path !== '/api/next' && path !== '/api/defend') return json({ error: 'Unknown endpoint.' }, 404);
    if (request.method !== 'POST') return json({ error: 'Method not allowed.' }, 405);
    if (this.busySessions.has(id)) return json({ error: 'Wait for the previous action.' }, 409);
    this.busySessions.add(id);
    try {
      if (path === '/api/next') {
        if (game.pending || game.winner) return json({ game, mode: 'live', eventNumber: this.eventNumber });
        if (env.provider === 'tenstorrent') {
          const spell = chooseSpell(game.usedSpellIds || []);
          const updated = revealAttack(game, { id: spell.id, line: `I cast ${spell.name}!` });
          updated.inferenceCalls = inferenceCalls(game);
          await this.save(key, updated);
          return json({ game: updated, mode: 'live', eventNumber: this.eventNumber });
        }
        const attack = await this.meteredDecision('duck', retry => liveAttack(game, env, Math.random, retry));
        const updated = revealAttack(game, { ...attack, inference: callTelemetry(attack, env.model) });
        updated.inferenceCalls = [...inferenceCalls(game), ...attack.modelCalls];
        await this.save(key, updated);
        return json({ game: updated, mode: 'live', eventNumber: this.eventNumber });
      }
      const spell = await readSpell(request);
      if (game.winner) return json({ error: 'This duel is over. Start a new duel.', game, eventNumber: this.eventNumber }, 409);
      if (!game.pending) return json({ error: 'Wait for the duck to cast.', game, eventNumber: this.eventNumber }, 409);
      const verdict = await this.meteredDecision('referee', retry => liveJudge(game.pending, spell, env, retry, game.history));
      const result = resolveDefense(game, spell, verdict, { mode: 'live', latencyMs: verdict.latencyMs, usage: verdict.usage, judgeInference: callTelemetry(verdict, env.model), judgeInferenceCalls: verdict.modelCalls });
      result.state.inferenceCalls = [...inferenceCalls(game), ...verdict.modelCalls];
      await this.issueRewardClaim(result.state);
      await this.save(key, result.state);
      if (!game.history.length) this.analytics.playedDuels++;
      this.analytics.completedRounds++;
      if (result.state.winner) {
        this.analytics.finishedDuels++;
        this.analytics[result.state.winner === 'player' ? 'playerWins' : result.state.winner === 'duck' ? 'duckWins' : 'draws']++;
      }
      await this.trackBrowser(id, { played: true, won: result.state.winner === 'player' });
      await this.persistAnalytics();
      return json({ ...result, mode: 'live', servedModel: verdict.servedModel, eventNumber: this.eventNumber });
    } catch (error) {
      if (error.modelCalls?.length) {
        game.inferenceCalls = [...inferenceCalls(game), ...error.modelCalls];
        await this.save(key, game);
      }
      const message = errorMessage(error);
      const status = /Invalid request|Request too large|Spell must/.test(message) ? 400 : /allowance is exhausted|busy/.test(message) ? 429 : 502;
      return json({ error: message, game, eventNumber: this.eventNumber }, status);
    } finally {
      this.busySessions.delete(id);
    }
  }

  async alarm() {
    const now = Date.now();
    const sessions = await this.ctx.storage.list({ prefix: 'session:' });
    for (const [key, value] of sessions) {
      if (now - value.lastActive >= SESSION_TTL_MS) await this.ctx.storage.delete(key);
    }
    const presence = await this.ctx.storage.list({ prefix: 'presence:' });
    for (const [key, lastSeen] of presence) {
      if (now - lastSeen >= PRESENCE_WINDOW_MS) await this.ctx.storage.delete(key);
    }
    if ((await this.ctx.storage.list({ prefix: 'session:', limit: 1 })).size) {
      await this.ctx.storage.setAlarm(now + CLEANUP_INTERVAL_MS);
    }
  }
}

function safeEqual(left, right) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index++) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const qwenTrial = url.searchParams.get('qwen') === '1';
    if (url.pathname === '/operator' && request.method === 'GET') return env.ASSETS.fetch(new Request(new URL('/operator.html', url), request));
    if (url.pathname === '/share-card.png' && (request.method === 'GET' || request.method === 'HEAD')) return env.ASSETS.fetch(request);
    if (url.pathname === '/api/operator/status' || url.pathname === '/api/operator/new-event' || url.pathname === '/api/operator/claim' || url.pathname === '/api/operator/claim/redeem') {
      if (!env.DUEL_OPERATOR_TOKEN) return json({ error: 'Operator access is not configured.' }, 503);
      if (!safeEqual(request.headers.get('x-operator-token') || '', env.DUEL_OPERATOR_TOKEN)) return json({ error: 'Unauthorized.' }, 401);
      const object = env.DUEL_STATE.get(env.DUEL_STATE.idFromName(qwenTrial ? 'team-trial-qwen' : 'team-trial'));
      if (qwenTrial) request = new Request(request, { headers: new Headers([...request.headers, ['X-Duel-Provider', 'qwen']]) });
      return object.fetch(request);
    }
    const cookies = request.headers.get('Cookie') || '';
    if (url.pathname.startsWith('/api/')) {
      const cookieName = qwenTrial ? 'spell_session_qwen' : 'spell_session';
      const existing = new RegExp(`(?:^|;\\s*)${cookieName}=([0-9a-f-]{36})(?:;|$)`).exec(cookies)?.[1];
      const id = existing || crypto.randomUUID();
      const headers = new Headers(request.headers);
      headers.set('X-Duel-Session', id);
      if (qwenTrial) headers.set('X-Duel-Provider', 'qwen');
      const forwarded = new Request(request, { headers });
      const object = env.DUEL_STATE.get(env.DUEL_STATE.idFromName(qwenTrial ? 'team-trial-qwen' : 'team-trial'));
      const response = await object.fetch(forwarded);
      const result = new Response(response.body, response);
      result.headers.append('Set-Cookie', `${cookieName}=${id}; HttpOnly; Secure; SameSite=Lax; Path=/; Max-Age=31536000`);
      return result;
    }
    if (request.method !== 'GET' && request.method !== 'HEAD') return json({ error: 'Method not allowed.' }, 405);
    if (url.pathname === '/') return env.ASSETS.fetch(new Request(new URL('/index.html', url), request));
    return env.ASSETS.fetch(request);
  },
};
