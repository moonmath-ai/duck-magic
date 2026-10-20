import http from 'node:http';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { newGame, revealAttack, resolveDefense } from './lib/counterspell.mjs';
import { liveAttack, liveJudge, mockJudge, isRetryableModelResponse, retryModelResponse } from './lib/judge.mjs';
import { callTelemetry } from './lib/telemetry.mjs';
import { redemptionResult } from './lib/claims.mjs';

const root = path.dirname(fileURLToPath(import.meta.url));
const publicDir = path.join(root, 'public');

function readLocalEnv() {
  try {
    for (const line of readFileSync(path.join(root, '.env'), 'utf8').split(/\r?\n/)) {
      const match = line.match(/^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/);
      if (!match || process.env[match[1]] !== undefined) continue;
      let value = match[2];
      if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) value = value.slice(1, -1);
      process.env[match[1]] = value;
    }
  } catch (err) { if (err.code !== 'ENOENT') throw err; }
}
readLocalEnv();
if (!(process.env.ZRO_API_KEY || '').trim() && process.env.ZRO_API_KEY_SOURCE) {
  // Reuse a local .env credential without copying the secret into this project.
  const source = readFileSync(process.env.ZRO_API_KEY_SOURCE, 'utf8');
  const match = source.match(/^\s*ZRO_API_KEY\s*=\s*(.*?)\s*$/m);
  if (!match || !match[1]) throw new Error('ZRO_API_KEY_SOURCE has no ZRO_API_KEY.');
  const value = match[1].trim();
  process.env.ZRO_API_KEY = ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) ? value.slice(1, -1) : value;
}
const env = {
  apiKey: (process.env.ZRO_API_KEY || '').trim(),
  model: process.env.ZRO_MODEL || 'glm-5.3-flash',
  baseUrl: process.env.ZRO_BASE_URL || 'https://zro.moonmath.ai/v1',
  port: Number(process.env.PORT || 8793),
};
const live = Boolean(env.apiKey);
const sessions = new Map();
const operatorToken = process.env.DUEL_OPERATOR_TOKEN || '';
const freshAnalytics = (now = Date.now()) => ({ startedAt: now, uniqueTrackingStartedAt: now, uniqueVisitors: 0, uniquePlayers: 0, uniqueWinners: 0, requests: 0, failedRequests: 0, malformedResponses: 0, unknownUsage: 0, promptTokens: 0, completionTokens: 0, cacheReadTokens: 0, knownCostUsd: 0, responseTimeMs: 0, timedCalls: 0, duckChoices: 0, refereeCalls: 0, playedDuels: 0, finishedDuels: 0, playerWins: 0, duckWins: 0, draws: 0, completedRounds: 0, lastCall: null });
let analytics = freshAnalytics();
let eventNumber = 1;
let previousEvent = null;
const browserMarkers = new Map();
const winClaims = new Map();
function issueRewardClaim(game) {
  if ((!game.winner || (game.winner !== 'player' && game.turn < 10)) || game.claimReference) return;
  const reference = `DM-${eventNumber}-${randomUUID()}`;
  winClaims.set(reference, { reference, eventNumber, rounds: game.turn, outcome: game.winner, earnedAt: Date.now() });
  game.claimReference = reference;
}
function trackBrowser(id, { played = false, won = false } = {}) {
  const previous = browserMarkers.get(id) || { visited: false, played: false, won: false };
  if (!previous.visited) analytics.uniqueVisitors++;
  if (played && !previous.played) analytics.uniquePlayers++;
  if (won && !previous.won) analytics.uniqueWinners++;
  browserMarkers.set(id, { visited: true, played: previous.played || played, won: previous.won || won });
}
function recordCall(kind, result, failed = false) {
  if (!live) return;
  analytics.requests++;
  analytics[kind === 'duck' ? 'duckChoices' : 'refereeCalls']++;
  if (failed) analytics.failedRequests++;
  if (!result) { analytics.unknownUsage++; return; }
  const call = callTelemetry(result, env.model);
  if (call.estimatedCostUsd === null) analytics.unknownUsage++;
  else analytics.knownCostUsd += call.estimatedCostUsd;
  analytics.promptTokens += call.usage?.promptTokens || 0;
  analytics.completionTokens += call.usage?.completionTokens || 0;
  analytics.cacheReadTokens += call.usage?.cacheReadTokens || 0;
  if (call.latencyMs !== null) { analytics.responseTimeMs += call.latencyMs; analytics.timedCalls++; }
  analytics.lastCall = { kind, ...call, failed, at: Date.now() };
}
async function modelDecision(kind, action) {
  const modelCalls = [];
  const result = await retryModelResponse(async retry => {
    try {
      const result = await action(retry);
      recordCall(kind, result);
      modelCalls.push(callTelemetry(result, env.model));
      return result;
    } catch (error) {
      recordCall(kind, error.telemetry, true);
      modelCalls.push({ ...callTelemetry(error.telemetry || {}, env.model), failed: true });
      if (isRetryableModelResponse(error)) analytics.malformedResponses++;
      throw error;
    }
  });
  return { ...result, modelCalls };
}
const mime = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.png': 'image/png' };

function send(res, status, data, headers = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...headers });
  res.end(JSON.stringify(data));
}
function cookieId(req) {
  const match = /(?:^|;\s*)spell_session=([0-9a-f-]{36})(?:;|$)/.exec(req.headers.cookie || '');
  return match?.[1] || null;
}
function getSession(req, res) {
  const id = cookieId(req);
  if (id && sessions.has(id)) return sessions.get(id);
  const freshId = id || randomUUID();
  const fresh = { id: freshId, game: newGame(), busy: false };
  sessions.set(freshId, fresh);
  res.setHeader('Set-Cookie', `spell_session=${freshId}; HttpOnly; SameSite=Lax; Path=/; Max-Age=31536000`);
  return fresh;
}
async function readJson(req) {
  let body = '';
  for await (const chunk of req) {
    body += chunk;
    if (body.length > 4000) throw new Error('Request too large.');
  }
  try { return JSON.parse(body || '{}'); }
  catch { throw new Error('Invalid request.'); }
}
async function serveFile(pathname, res) {
  const name = pathname === '/' ? '/index.html' : pathname;
  const full = path.resolve(publicDir, `.${name}`);
  if (!full.startsWith(`${publicDir}${path.sep}`)) return send(res, 403, { error: 'Forbidden.' });
  try {
    const data = await readFile(full);
    res.writeHead(200, { 'Content-Type': mime[path.extname(full)] || 'application/octet-stream', 'Cache-Control': 'no-cache', 'X-Content-Type-Options': 'nosniff' });
    res.end(data);
  } catch (err) { send(res, err.code === 'ENOENT' ? 404 : 500, { error: 'File unavailable.' }); }
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  try {
    if (url.pathname === '/operator' && req.method === 'GET') return serveFile('/operator.html', res);
    if (url.pathname === '/api/operator/status' && req.method === 'GET') {
      if (!operatorToken) return send(res, 503, { error: 'Operator access is not configured.' });
      if (req.headers['x-operator-token'] !== operatorToken) return send(res, 401, { error: 'Unauthorized.' });
      return send(res, 200, { eventNumber, analytics, previousEvent, budget: null, budgetLimitUsd: null, activeCalls: [...sessions.values()].filter(session => session.busy).length, playersOnline: [...sessions.values()].filter(session => Date.now() - (session.presenceAt || 0) < 90_000).length, storedSessions: sessions.size, storedPlayedSessions: [...sessions.values()].filter(session => session.game.history.length).length, model: live ? env.model : 'simulated' });
    }
    if (url.pathname === '/api/operator/claim' && req.method === 'GET') {
      if (!operatorToken) return send(res, 503, { error: 'Operator access is not configured.' });
      if (req.headers['x-operator-token'] !== operatorToken) return send(res, 401, { error: 'Unauthorized.' });
      const reference = url.searchParams.get('reference') || '';
      if (!/^DM-\d+-[0-9a-f-]{36}$/.test(reference)) return send(res, 400, { error: 'Enter a valid win reference.' });
      const claim = winClaims.get(reference);
      return claim ? send(res, 200, { verified: true, claim }) : send(res, 404, { verified: false, error: 'No eligible result matches this reference.' });
    }
    if (url.pathname === '/api/operator/claim/redeem') {
      if (req.method !== 'POST') return send(res, 405, { error: 'Method not allowed.' });
      if (!operatorToken) return send(res, 503, { error: 'Operator access is not configured.' });
      if (req.headers['x-operator-token'] !== operatorToken) return send(res, 401, { error: 'Unauthorized.' });
      const input = await readJson(req);
      const reference = input.reference;
      if (typeof reference !== 'string' || !/^DM-\d+-[0-9a-f-]{36}$/.test(reference)) return send(res, 400, { error: 'Enter a valid claim reference.' });
      const claim = winClaims.get(reference);
      const result = redemptionResult(claim);
      if (result.status === 200) winClaims.set(reference, result.body.claim);
      return send(res, result.status, result.body);
    }
    if (url.pathname === '/api/operator/new-event' && req.method === 'POST') {
      if (!operatorToken) return send(res, 503, { error: 'Operator access is not configured.' });
      if (req.headers['x-operator-token'] !== operatorToken) return send(res, 401, { error: 'Unauthorized.' });
      const input = await readJson(req);
      if (input.confirm !== 'NEW EVENT') return send(res, 400, { error: 'Type NEW EVENT to confirm.' });
      if (input.expectedEventNumber !== eventNumber) return send(res, 409, { error: 'This event has already changed. Refresh the dashboard before starting another.' });
      if ([...sessions.values()].some(session => session.busy)) return send(res, 409, { error: 'A turn is still resolving. Wait for it to finish, then try again.' });
      const endedAt = Date.now();
      previousEvent = { eventNumber, endedAt, analytics: structuredClone(analytics), budget: null };
      eventNumber++;
      analytics = freshAnalytics(endedAt);
      sessions.clear();
      browserMarkers.clear();
      return send(res, 200, { ok: true, eventNumber, startedAt: endedAt });
    }
    if (url.pathname === '/api/state' && req.method === 'GET') {
      const session = getSession(req, res);
      issueRewardClaim(session.game);
      trackBrowser(session.id);
      return send(res, 200, { game: session.game, mode: live ? 'live' : 'simulated', model: live ? env.model : null, eventNumber });
    }
    if (url.pathname === '/api/presence' && req.method === 'POST') {
      const session = getSession(req, res);
      session.presenceAt = Date.now();
      const playersOnline = [...sessions.values()].filter(value => Date.now() - (value.presenceAt || 0) < 90_000).length;
      return send(res, 200, { playersOnline, eventNumber });
    }
    if (url.pathname === '/api/new' && req.method === 'POST') {
      const session = getSession(req, res);
      if (session.busy) return send(res, 409, { error: 'A spell is still resolving.' });
      session.game = newGame();
      return send(res, 200, { game: session.game, mode: live ? 'live' : 'simulated', eventNumber });
    }
    if (url.pathname === '/api/next' && req.method === 'POST') {
      const session = getSession(req, res);
      if (session.busy) return send(res, 409, { error: 'The duck is still thinking.' });
      if (session.game.pending || session.game.winner) return send(res, 200, { game: session.game, mode: live ? 'live' : 'simulated', eventNumber });
      session.busy = true;
      try {
        const attack = live ? await modelDecision('duck', retry => liveAttack(session.game, env, Math.random, retry)) : null;
        session.game = revealAttack(session.game, live ? { ...attack, inference: callTelemetry(attack, env.model) } : attack);
        return send(res, 200, { game: session.game, mode: live ? 'live' : 'simulated', eventNumber });
      } finally { session.busy = false; }
    }
    if (url.pathname === '/api/defend' && req.method === 'POST') {
      const session = getSession(req, res);
      if (session.busy) return send(res, 409, { error: 'Wait for the previous verdict.' });
      const input = await readJson(req);
      const spell = String(input.spell || '').trim();
      if (!spell || spell.length > 180) return send(res, 400, { error: 'Spell must be 1–180 characters.' });
      if (session.game.winner) return send(res, 409, { error: 'This duel is over. Start a new duel.', game: session.game, eventNumber });
      if (!session.game.pending) return send(res, 409, { error: 'Wait for the duck to cast.', game: session.game, eventNumber });
      session.busy = true;
      try {
        const start = performance.now();
        const verdict = live ? await modelDecision('referee', retry => liveJudge(session.game.pending, spell, env, retry, session.game.history)) : mockJudge(session.game.pending, spell);
        const result = resolveDefense(session.game, spell, verdict, {
          mode: live ? 'live' : 'simulated',
          latencyMs: verdict.latencyMs ?? Math.round(performance.now() - start),
          usage: verdict.usage,
          judgeInference: live ? callTelemetry(verdict, env.model) : null,
          judgeInferenceCalls: live ? verdict.modelCalls : [],
        });
        issueRewardClaim(result.state);
        if (!session.game.history.length) analytics.playedDuels++;
        analytics.completedRounds++;
        if (result.state.winner) {
          analytics.finishedDuels++;
          analytics[result.state.winner === 'player' ? 'playerWins' : result.state.winner === 'duck' ? 'duckWins' : 'draws']++;
        }
        trackBrowser(session.id, { played: true, won: result.state.winner === 'player' });
        session.game = result.state;
        return send(res, 200, { ...result, mode: live ? 'live' : 'simulated', servedModel: live ? verdict.servedModel : null, eventNumber });
      } finally { session.busy = false; }
    }
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'Unknown endpoint.' });
    if (req.method !== 'GET') return send(res, 405, { error: 'Method not allowed.' });
    return serveFile(decodeURIComponent(url.pathname), res);
  } catch (err) {
    const message = err?.name === 'AbortError' ? 'Zro timed out. This turn was not applied.' : err?.message || 'Something went wrong.';
    console.error('[duel]', message);
    send(res, /Invalid request|Request too large|Spell must/.test(message) ? 400 : 502, { error: message });
  }
});

server.listen(env.port, '127.0.0.1', () => {
  console.log(`Duck Spell Duel: http://127.0.0.1:${env.port}/`);
  console.log(`Mode: ${live ? `LIVE · ZRO (${env.model})` : 'SIMULATED · add ZRO_API_KEY to .env for live inference'}`);
});
