import { estimateMagicCost } from './magic-preview.js?v=repeat-1';

const $ = id => document.getElementById(id);
const QWEN_TRIAL = new URLSearchParams(location.search).get('qwen') === '1';
const INFERENCE_CREDIT = QWEN_TRIAL ? 'Tenstorrent Qwen inference' : 'Zro inference';
if (QWEN_TRIAL) {
  document.title = 'Duck Magic — Qwen';
  document.querySelector('.brand-tag').innerHTML = 'DUCK MAGIC<br>POWERED BY TENSTORRENT';
  document.querySelector('.result-copy .eyebrow').textContent = 'DUEL COMPLETE · QWEN';
  document.querySelector('.metrics-card .card-heading .eyebrow').textContent = 'YOU · TENSTORRENT QWEN';
  document.querySelector('.metrics-panel-head .eyebrow').textContent = 'TENSTORRENT QWEN';
  document.querySelector('.latest-heading span').textContent = 'REFEREE + RETRIES';
  document.querySelectorAll('.metric-grid [title]').forEach(element => {
    element.title = element.title.replaceAll('duck-choice, ', '').replaceAll('duck-choice,', '');
  });
  document.querySelector('.footer span:first-child').innerHTML = 'POWERED BY TENSTORRENT QWEN · <a href="https://zro.moonmath.ai/" target="_blank" rel="noopener noreferrer">ABOUT ZRO ↗</a>';
  document.querySelector('#metrics-cost-note').textContent = 'Tenstorrent has not supplied pricing for this model. Requests and tokens are shown; cost is unavailable.';
}
let game = null;
let mode = 'simulated';
let busy = false;
let toastTimer;
let duckPoseTimer;
let playerPoseTimer;
let feedHistoryCount = 0;
let feedRun = 0;
let expandedMobileHeight = window.innerHeight;
let metricsReturnFocus = null;
let introReturnFocus = null;
let presenceTimer = null;
let activeEventNumber = null;
const INTRO_SEEN_KEY = 'duck-magic-intro-v1';
// Set this to your own inbox before offering rewards from a fork.
const CLAIM_EMAIL = 'your-email@example.com';
const PUBLIC_GAME_URL = `${location.origin}/${QWEN_TRIAL ? '?qwen=1' : ''}`;
const TYPEWRITER_CHAR_MS = 12;
const TYPEWRITER_PUNCTUATION_MS = 85;
const WIN_LINES = [
  'The duck has requested a rematch. I am considering its application.',
  'Somewhere, a wizard duck is rethinking its career.',
  'I came, I cast, I ruffled feathers.',
  'The feathers have settled. The spellbook has not.',
  'The duck says this outcome was statistically improbable.',
  'Please tell the duck I meant no personal offense.',
];
const SURVIVOR_LINES = [
  'The duck won the duel, but I made it work for every feather.',
  'Ten rounds later, the duck was still checking its spellbook.',
  'I did not defeat the duck. I did make it nervous.',
  'The duck says endurance is not a spell. I disagree.',
];
let claimLine = '';

function openIntro() {
  introReturnFocus = document.activeElement;
  $('intro-overlay').hidden = false;
  $('intro-close').focus();
}

function closeIntro() {
  if ($('intro-overlay').hidden) return;
  $('intro-overlay').hidden = true;
  try { localStorage.setItem(INTRO_SEEN_KEY, 'seen'); } catch {}
  if (introReturnFocus instanceof HTMLElement && introReturnFocus !== document.body) introReturnFocus.focus();
}

$('how-to-play').addEventListener('click', openIntro);
$('intro-close').addEventListener('click', closeIntro);
$('intro-start').addEventListener('click', closeIntro);
$('intro-overlay').addEventListener('click', event => {
  if (event.target === $('intro-overlay')) closeIntro();
});
try {
  if (localStorage.getItem(INTRO_SEEN_KEY) !== 'seen') openIntro();
} catch { openIntro(); }

function closeMetrics() {
  if ($('metrics-overlay').hidden) return;
  $('metrics-overlay').hidden = true;
  metricsReturnFocus?.focus();
}

$('metrics-open').addEventListener('click', () => {
  metricsReturnFocus = document.activeElement;
  $('metrics-overlay').hidden = false;
  $('metrics-close').focus();
});
$('metrics-close').addEventListener('click', closeMetrics);
$('metrics-overlay').addEventListener('click', event => {
  if (event.target === $('metrics-overlay')) closeMetrics();
});
document.addEventListener('keydown', event => {
  if (event.key === 'Tab' && !$('intro-overlay').hidden) {
    const first = $('intro-close');
    const last = $('intro-start');
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }
  if (event.key === 'Escape') {
    if (!$('intro-overlay').hidden) closeIntro();
    else closeMetrics();
  }
});

function syncMobileViewport() {
  const root = document.documentElement;
  if (!window.matchMedia('(max-width: 800px)').matches) {
    root.classList.remove('keyboard-open');
    root.style.removeProperty('--mobile-vh');
    root.style.removeProperty('--mobile-top');
    return;
  }
  const viewport = window.visualViewport;
  const visibleHeight = viewport?.height || window.innerHeight;
  const inputFocused = document.activeElement === $('spell-input');
  if (!inputFocused) expandedMobileHeight = Math.max(expandedMobileHeight, window.innerHeight, visibleHeight);
  root.style.setProperty('--mobile-vh', `${Math.round(visibleHeight)}px`);
  const keyboardOpen = inputFocused && visibleHeight < expandedMobileHeight * 0.82;
  // iOS can pan the visual viewport after focus without resizing it again.
  // Align the fixed game shell with the actual visible area above the keyboard.
  root.style.setProperty('--mobile-top', `${Math.round(viewport?.offsetTop || 0)}px`);
  root.classList.toggle('keyboard-open', keyboardOpen);
}

window.addEventListener('resize', syncMobileViewport);
window.visualViewport?.addEventListener('resize', syncMobileViewport);
window.visualViewport?.addEventListener('scroll', syncMobileViewport);
$('spell-input').addEventListener('focus', syncMobileViewport);
$('spell-input').addEventListener('blur', () => requestAnimationFrame(syncMobileViewport));
syncMobileViewport();

function scrollFeed() {
  const feed = $('feed-entries');
  feed.scrollTop = feed.scrollHeight;
}

function resetFeed() {
  feedRun++;
  feedHistoryCount = 0;
  $('feed-entries').replaceChildren();
  const empty = document.createElement('p');
  empty.className = 'feed-empty';
  empty.textContent = 'Cast a counterspell. The outcome will unfold here.';
  $('feed-entries').append(empty);
}

async function typeLine(element, value, run) {
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    element.textContent = value;
    scrollFeed();
    return;
  }
  for (let index = 0; index < value.length; index++) {
    if (run !== feedRun) return;
    element.textContent += value[index];
    scrollFeed();
    await new Promise(resolve => setTimeout(resolve, /[.!?]/.test(value[index]) ? TYPEWRITER_PUNCTUATION_MS : TYPEWRITER_CHAR_MS));
  }
}

async function appendVerdict(event, animated = false) {
  $('feed-entries').querySelector('.feed-empty')?.remove();
  $('feed-entries').querySelector('.feed-pending')?.remove();
  const run = feedRun;
  const entry = document.createElement('article');
  entry.className = 'feed-entry';
  const heading = document.createElement('div');
  heading.className = 'feed-entry-heading';
  const roundCalls = Array.isArray(event.calls) ? event.calls : [];
  const roundCost = roundCalls.reduce((sum, call) => sum + (Number(call.estimatedCostUsd) || 0), 0);
  const roundCostLabel = roundCalls.length && roundCalls.every(call => call.estimatedCostUsd !== null) ? ` · ${cents(roundCost)} AI` : '';
  heading.textContent = `ROUND ${event.round} · ${event.attack.name} · ${event.blocked} HP BLOCKED${roundCostLabel}`;
  const yourSpell = document.createElement('p');
  yourSpell.className = 'feed-your-spell';
  yourSpell.textContent = `You: “${event.defense}”`;
  const reason = document.createElement('p');
  reason.className = 'feed-reason';
  const impact = document.createElement('p');
  impact.className = 'feed-impact';
  const outcomes = [];
  if (event.taken > 0) outcomes.push({ text: `You take ${event.taken} HP.`, className: 'feed-damage-player' });
  if (event.reflected > 0) outcomes.push({ text: `The duck takes ${event.reflected} HP.`, className: 'feed-damage-duck' });
  if (!outcomes.length) outcomes.push({ text: 'No damage dealt.', className: 'feed-neutral' });
  if (event.magicCost !== undefined) outcomes.push({ text: event.fizzled ? `COUNTER FAILED · ${event.magicCost} magic needed` : `MAGIC −${event.magicCost} · ${event.mpAfter}/10 after recovery`, className: event.fizzled ? 'feed-damage-player' : 'feed-neutral' });
  entry.append(heading, yourSpell, reason, impact);
  $('feed-entries').append(entry);
  scrollFeed();
  if (animated) await typeLine(reason, event.reason, run);
  else reason.textContent = event.reason;
  if (run !== feedRun) return;
  for (const outcome of outcomes) {
    const line = document.createElement('span');
    line.className = outcome.className;
    impact.append(line);
    if (animated) await typeLine(line, outcome.text, run);
    else line.textContent = outcome.text;
  }
  scrollFeed();
}

function setDuckPose(pose, duration = 0) {
  clearTimeout(duckPoseTimer);
  const duck = $('duck-avatar');
  duck.dataset.pose = pose;
  duck.setAttribute('aria-label', pose === 'cast' ? 'Duck wizard casting a spell' : pose === 'hurt' ? 'Duck wizard recoiling from a hit' : pose === 'defeated' ? 'Duck wizard knocked out' : 'Duck wizard standing ready');
  if (duration) duckPoseTimer = setTimeout(() => setDuckPose('idle'), duration);
}

function setPlayerPose(pose, duration = 0) {
  clearTimeout(playerPoseTimer);
  const player = $('player-avatar');
  player.dataset.pose = pose;
  player.setAttribute('aria-label', pose === 'cast' ? 'Your pixel wizard casting' : pose === 'hurt' ? 'Your pixel wizard recoiling' : pose === 'defeated' ? 'Your pixel wizard knocked out' : pose === 'victory' ? 'Your pixel wizard celebrating' : 'Your pixel wizard ready');
  if (duration) playerPoseTimer = setTimeout(() => setPlayerPose('idle'), duration);
}

async function request(path, options = {}) {
  const response = await fetch(QWEN_TRIAL ? `${path}${path.includes('?') ? '&' : '?'}qwen=1` : path, { credentials: 'same-origin', ...options, headers: { 'Content-Type': 'application/json', ...(options.headers || {}) } });
  const data = await response.json();
  if (!response.ok) {
    const error = new Error(data.error || 'That turn did not resolve.');
    error.game = data.game;
    error.eventNumber = data.eventNumber;
    throw error;
  }
  return data;
}

function toast(message) {
  $('toast').textContent = message;
  $('toast').classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => $('toast').classList.remove('show'), 4600);
}

function setMode(nextMode, model) {
  mode = nextMode;
  const simulated = mode !== 'live';
  $('mode').textContent = simulated ? 'SIMULATED' : QWEN_TRIAL ? 'LIVE · QWEN' : 'LIVE · ZRO';
  $('mode').classList.toggle('simulated', simulated);
  $('mode-note').textContent = simulated
    ? 'Scripted judge for offline preview—not proof of how live Zro would score a spell. Add ZRO_API_KEY to .env and restart.'
    : QWEN_TRIAL
      ? `Attacks are selected evenly from 100 spells. Referee decisions use Tenstorrent · ${model || 'configured model'}. Token counts are provider-reported. Provider pricing is not configured, so cost estimates are unavailable.`
      : `Duck choices and referee decisions use Zro · ${model || 'configured model'}. Token counts are provider-reported.`;
  $('metrics-mode-note').textContent = $('mode-note').textContent;
}

async function sendPresence() {
  if (document.visibilityState !== 'visible' || busy) return;
  try {
    const { playersOnline, eventNumber } = await request('/api/presence', { method: 'POST', body: '{}' });
    if (activeEventNumber !== null && eventNumber !== activeEventNumber) {
      await restartForEvent(eventNumber);
      return;
    }
    if (!Number.isInteger(playersOnline) || playersOnline < 0) return;
    $('online-count').textContent = `${playersOnline} ${playersOnline === 1 ? 'player' : 'players'} online`;
    $('online-count').hidden = false;
  } catch { /* Presence is decorative and must never interrupt a duel. */ }
}

async function restartForEvent(eventNumber) {
  if (!Number.isInteger(eventNumber) || eventNumber === activeEventNumber) return;
  try {
    const fresh = await request('/api/state');
    activeEventNumber = fresh.eventNumber ?? eventNumber;
    game = fresh.game;
    claimLine = '';
    resetFeed();
    setDuckPose('idle');
    setPlayerPose('idle');
    $('spell-input').value = '';
    $('magic-preview').hidden = true;
    render();
    toast('A new event started. Your duel has restarted.');
    if (!game.pending && !game.winner) await getNextAttack();
  } catch (error) { toast(error.message); }
}

function startPresence() {
  if (presenceTimer) return;
  void sendPresence();
  presenceTimer = window.setInterval(sendPresence, 25_000);
  document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') void sendPresence(); });
}

function bar(id, value, max) {
  $(id).style.width = `${Math.max(0, Math.min(100, value / max * 100))}%`;
}

function cents(usd) {
  if (usd === 0) return '0¢';
  const value = usd * 100;
  if (value < 0.01) return '<0.01¢';
  return value < 1 ? `${Number(value.toFixed(3))}¢` : `${Number(value.toFixed(2))}¢`;
}

function dollars(usd) {
  if (usd === 0) return '$0.000000';
  const digits = Math.min(8, Math.max(5, Math.ceil(-Math.log10(usd)) + 2));
  return `$${usd.toFixed(digits)}`;
}

function gameTelemetry() {
  const calls = Array.isArray(game.inferenceCalls)
    ? game.inferenceCalls
    : [...game.history.flatMap(event => Array.isArray(event.calls) ? event.calls : []), ...(game.pending?.inferenceCalls || [game.pending?.inference].filter(Boolean))];
  const expected = game.turn * 2 + Number(Boolean(game.pending));
  const unknown = calls.some(call => call.estimatedCostUsd === null) || (mode === 'live' && expected > calls.length);
  const cost = calls.reduce((sum, call) => sum + (Number(call.estimatedCostUsd) || 0), 0);
  const cached = calls.reduce((sum, call) => sum + (call.usage?.cacheReadTokens || 0), 0);
  return { calls: Math.max(expected, calls.length), cost, cached, unknown };
}

function latestCounterTelemetry() {
  const calls = game.history[0]?.calls;
  if (!Array.isArray(calls) || calls.length < 2) return null;
  const timedCalls = calls.filter(call => call?.latencyMs > 0);
  const turnMs = timedCalls.reduce((sum, call) => sum + call.latencyMs, 0);
  const responseMs = timedCalls.length ? turnMs / timedCalls.length : null;
  const outputTokens = calls.reduce((sum, call) => sum + (call.usage?.completionTokens || 0), 0);
  const timedOutputTokens = timedCalls.reduce((sum, call) => sum + (call.usage?.completionTokens || 0), 0);
  const speed = turnMs > 0 && timedOutputTokens > 0
    ? Math.round(timedOutputTokens * 1000 / turnMs) : null;
  return { responseMs, outputTokens, turnMs, speed };
}

function gameUrl() {
  return PUBLIC_GAME_URL;
}

function resultLine() {
  const rounds = game.turn;
  const count = `${rounds} ${rounds === 1 ? 'round' : 'rounds'}`;
  if (game.winner === 'player') return `I beat the Duck Wizard in ${count} in Duck Magic. Can you outspell it?`;
  if (game.winner === 'duck') return `The Duck Wizard beat me after ${count} in Duck Magic. Can you last longer?`;
  return `The Duck Wizard and I knocked each other out after ${count} in Duck Magic. Can you do better?`;
}

function qualifiesForClaim() {
  return game?.winner === 'player' || (Boolean(game?.winner) && game.turn >= 10);
}

function claimNote() {
  if (!game?.claimReference) return '';
  if (!claimLine) {
    const lines = game.winner === 'player' ? WIN_LINES : SURVIVOR_LINES;
    claimLine = lines[Math.floor(Math.random() * lines.length)];
  }
  const rounds = `${game.turn} ${game.turn === 1 ? 'round' : 'rounds'}`;
  const result = game.winner === 'player' ? `I won the Duck Magic game in ${rounds}.` : `I lasted ${rounds} in Duck Magic.`;
  return `${result}\n${claimLine}\n\nClaim reference: ${game.claimReference}\nDuck Magic: ${gameUrl()}`;
}

async function copyChallenge() {
  const challenge = `${resultLine()}\n\nPowered by ${INFERENCE_CREDIT}.\n${gameUrl()}`;
  try {
    await navigator.clipboard.writeText(challenge);
    toast('Result and game link copied. Paste it anywhere.');
  } catch {
    window.prompt('Copy your challenge and game link:', challenge);
  }
}

async function copyGameLink() {
  try {
    await navigator.clipboard.writeText(gameUrl());
    toast('Game link copied.');
  } catch {
    window.prompt('Copy the game link:', gameUrl());
  }
}

function renderResult(telemetry) {
  const finished = Boolean(game.winner);
  document.querySelector('.app').classList.toggle('duel-ended', finished);
  $('spell-form').hidden = finished;
  $('result-card').hidden = !finished;
  if (!finished) return;
  const rounds = `${game.turn} ${game.turn === 1 ? 'round' : 'rounds'}`;
  const eligible = qualifiesForClaim();
  $('result-card').dataset.outcome = game.winner;
  $('result-card').dataset.eligible = String(eligible);
  $('result-title').textContent = game.winner === 'player' ? 'You solved it.' : game.winner === 'duck' ? 'The duck beat you.' : 'A magical draw.';
  $('result-summary').textContent = game.winner === 'player'
    ? `You knocked out the Duck Wizard in ${rounds}. Copy your note and email it to us.`
    : game.winner === 'duck'
      ? eligible ? `You lasted ${rounds}. Copy your note and email it to us.` : `You lasted ${rounds}. Try again—you can make it to 10.`
      : eligible ? `You and the duck went down together after ${rounds}. Copy your note and email it to us.` : `You and the duck went down together after ${rounds}. Try again—you can make it to 10.`;
  $('result-metrics').textContent = mode === 'live'
    ? QWEN_TRIAL ? `${telemetry.calls} model calls · provider cost unavailable` : `${telemetry.calls} model calls · ${cents(telemetry.cost)}${telemetry.unknown ? '+ known' : ' estimated'} inference`
    : `${rounds} · simulated preview`;
  $('reward-claim').hidden = !eligible;
  if (eligible) {
    $('claim-eyebrow').textContent = game.winner === 'player' ? 'YOU SOLVED IT · CLAIM YOUR WIN' : 'TEN-ROUND SURVIVOR · CLAIM YOUR RUN';
    const note = claimNote();
    $('claim-text').textContent = note || 'Preparing your claim reference… Reload this page to complete your claim.';
    $('copy-claim').disabled = !note;
    const email = $('email-claim');
    email.hidden = !note;
    $('claim-email-address').textContent = CLAIM_EMAIL;
    if (note) {
      const subject = game.winner === 'player' ? 'I won the duck magic game' : `I lasted ${game.turn} rounds`;
      email.href = `mailto:${CLAIM_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(note)}`;
    }
  }
  const xUrl = new URL('https://twitter.com/intent/tweet');
  xUrl.searchParams.set('text', `${resultLine()}\n\nPowered by ${INFERENCE_CREDIT}.`);
  xUrl.searchParams.set('url', gameUrl());
  $('share-x').href = xUrl.href;
}

function render() {
  if (!game) return;
  const latest = game.history[0];
  // Keep the cast being answered on stage through the verdict and next-choice pause.
  const shownAttack = game.pending || latest?.attack;
  $('player-hp-text').textContent = `${game.player.hp} / 30 HP`;
  $('player-mp-text').textContent = `${game.player.mp ?? 10} / 10`;
  $('duck-hp-text').textContent = `${game.duck.hp} / 24 HP`;
  bar('player-hp-fill', game.player.hp, 30);
  bar('player-mp-fill', game.player.mp ?? 10, 10);
  bar('duck-hp-fill', game.duck.hp, 24);
  $('round').textContent = game.winner ? 'DUEL OVER' : game.pending ? `ROUND ${game.turn + 1}` : latest ? `ROUND ${game.turn} RESULT` : 'ROUND 1';
  $('duck-spell-name').textContent = shownAttack ? `“I cast ${shownAttack.name}!”` : '“Let me choose…”';
  $('duck-spell-facts').textContent = shownAttack ? shownAttack.facts : 'My spell will appear here before you answer.';
  $('form-target').textContent = game.pending ? `Against ${game.pending.name}` : 'Wait for the duck’s next spell';
  $('retry-attack').hidden = busy || Boolean(game.pending) || Boolean(game.winner);
  $('new-game').disabled = busy;
  $('cast-btn').disabled = busy || Boolean(game.winner) || !game.pending;
  $('check-magic').disabled = busy || Boolean(game.winner) || !game.pending;
  $('spell-input').disabled = busy || Boolean(game.winner) || !game.pending;
  $('cast-btn').innerHTML = busy ? 'JUDGING…' : game.winner ? 'DUEL OVER' : 'COUNTER <span>✦</span>';

  if (latest) {
    $('player-line').hidden = Boolean(game.pending);
    $('player-line').textContent = `“${latest.defense}”`;
  } else {
    $('player-line').hidden = true;
  }
  if (game.history.length < feedHistoryCount) resetFeed();
  if (game.history.length > feedHistoryCount) {
    const unseen = game.history.slice(0, game.history.length - feedHistoryCount).reverse();
    feedHistoryCount = game.history.length;
    for (const event of unseen) appendVerdict(event);
  }
  $('feed-state').textContent = game.winner ? 'DUEL OVER' : busy ? 'RESOLVING…' : game.pending ? 'AWAITING YOUR COUNTER' : 'DUCK IS CASTING…';
  const telemetry = gameTelemetry();
  const live = mode === 'live';
  const latestCounter = live ? latestCounterTelemetry() : null;
  renderResult(telemetry);
  const costLabel = QWEN_TRIAL ? '—' : live ? `${cents(telemetry.cost)}${telemetry.unknown ? '*' : ''}` : 'SIMULATED';
  $('call-count').textContent = live ? `${telemetry.calls} MODEL ${telemetry.calls === 1 ? 'CALL' : 'CALLS'}` : 'SIMULATED';
  $('cost-cents').textContent = costLabel;
  $('cost-usd').textContent = QWEN_TRIAL ? 'Provider cost unavailable' : live ? `${dollars(telemetry.cost)} estimated${telemetry.unknown ? ' · partial' : ''}` : 'No live cost';
  $('latency').textContent = latestCounter?.responseMs > 0 ? `${(latestCounter.responseMs / 1000).toFixed(2)}s` : '—';
  $('speed').textContent = latestCounter?.speed !== null && latestCounter?.speed !== undefined ? `${latestCounter.speed} tok/s` : '—';
  $('turn-time').textContent = latestCounter?.turnMs > 0 ? `${(latestCounter.turnMs / 1000).toFixed(2)}s` : '—';
  $('tokens').textContent = latestCounter?.outputTokens > 0 ? latestCounter.outputTokens.toLocaleString() : '—';
  const completedCalls = Array.isArray(latest?.calls) ? latest.calls : [];
  const exchangeCost = completedCalls.reduce((sum, call) => sum + (Number(call.estimatedCostUsd) || 0), 0);
  const exchangeKnown = completedCalls.length >= 2 && completedCalls.every(call => call.estimatedCostUsd !== null);
  $('cost-note').textContent = QWEN_TRIAL ? 'Tenstorrent model pricing is not configured; tokens and latency remain visible.' : telemetry.unknown
    ? 'Some calls lack usage; total shows known costs only.'
    : !latestCounter
      ? 'Latest-attempt stats appear after your first answer. The duck’s opening choice is included in the duel cost.'
      : `${exchangeKnown ? `Last exchange ${cents(exchangeCost)} · ` : ''}Duck choice, referee and retries counted. Excludes hosting.`;
  $('mobile-call-count').textContent = live ? `${telemetry.calls} model ${telemetry.calls === 1 ? 'call' : 'calls'}` : 'Simulated';
  $('mobile-cost').textContent = QWEN_TRIAL ? 'Cost unavailable' : live ? `${costLabel} est.` : 'No live cost';
  $('metrics-cost-cents').textContent = costLabel;
  $('metrics-cost-usd').textContent = $('cost-usd').textContent;
  $('metrics-call-count').textContent = live ? String(telemetry.calls) : 'Simulated';
  $('metrics-latency').textContent = $('latency').textContent;
  $('metrics-speed').textContent = $('speed').textContent;
  $('metrics-turn-time').textContent = $('turn-time').textContent;
  $('metrics-tokens').textContent = $('tokens').textContent;
  $('metrics-cache').textContent = live ? telemetry.cached.toLocaleString() : '—';
  $('metrics-cost-note').textContent = `${$('cost-note').textContent} Effective output speed uses the whole non-streaming response time; first-token time is not measured here.`;
}

function showDamage(event) {
  const duck = $('duck-avatar');
  const playerPop = $('player-damage');
  const duckPop = $('duck-damage');
  setPlayerPose(event.taken > 0 ? 'hurt' : 'guard', 1000);
  duck.classList.toggle('hit', event.reflected > 0);
  if (event.reflected > 0) setDuckPose('hurt', game.winner === 'player' ? 0 : 1150);
  if (game.winner === 'player') setTimeout(() => setDuckPose('defeated'), 520);
  if (game.winner === 'duck') setTimeout(() => setPlayerPose('defeated'), 520);
  if (game.winner === 'player') setTimeout(() => setPlayerPose('victory'), 520);
  playerPop.textContent = event.taken ? `−${event.taken}` : 'BLOCKED!';
  duckPop.textContent = event.reflected ? `−${event.reflected}` : '';
  playerPop.classList.add('show');
  if (event.reflected) duckPop.classList.add('show');
  setTimeout(() => {
    duck.classList.remove('hit');
    playerPop.classList.remove('show');
    duckPop.classList.remove('show');
  }, 1150);
}

async function getNextAttack() {
  busy = true;
  render();
  try {
    const next = await request('/api/next', { method: 'POST', body: '{}' });
    if (activeEventNumber !== null && next.eventNumber !== activeEventNumber) {
      activeEventNumber = next.eventNumber;
      resetFeed();
      toast('A new event started. Your duel has restarted.');
    }
    game = next.game;
    if (game.pending) setDuckPose('cast', 950);
  } catch (error) {
    if (error.game) game = error.game;
    if (error.eventNumber && error.eventNumber !== activeEventNumber) queueMicrotask(() => void restartForEvent(error.eventNumber));
    else toast(error.message);
  }
  finally { busy = false; render(); }
}

async function cast(spell) {
  if (busy || game?.winner || !game?.pending) return;
  busy = true;
  setPlayerPose('cast', 850);
  render();
  $('player-line').hidden = false;
  $('player-line').textContent = `“${spell}”`;
  $('feed-entries').querySelector('.feed-empty')?.remove();
  const pending = document.createElement('p');
  pending.className = 'feed-pending';
  pending.textContent = `${QWEN_TRIAL ? 'Qwen' : 'Zro'} is judging your counterspell…`;
  $('feed-entries').append(pending);
  scrollFeed();
  try {
    const result = await request('/api/defend', { method: 'POST', body: JSON.stringify({ spell }) });
    game = result.state;
    $('spell-input').value = '';
    $('magic-preview').hidden = true;
    feedHistoryCount = game.history.length;
    render();
    showDamage(result.event);
    await appendVerdict(result.event, true);
    await new Promise(resolve => setTimeout(resolve, 450));
    if (!game.winner) await getNextAttack();
  } catch (error) {
    if (error.game) game = error.game;
    $('feed-entries').querySelector('.feed-pending')?.remove();
    if (error.eventNumber && error.eventNumber !== activeEventNumber) queueMicrotask(() => void restartForEvent(error.eventNumber));
    else toast(error.message);
  }
  finally { busy = false; render(); }
}

$('spell-form').addEventListener('submit', event => {
  event.preventDefault();
  cast($('spell-input').value.trim());
});
$('check-magic').addEventListener('pointerdown', event => {
  if (document.activeElement === $('spell-input')) event.preventDefault();
});
$('check-magic').addEventListener('click', () => {
  const preview = $('magic-preview');
  const magic = estimateMagicCost($('spell-input').value);
  if (!magic) {
    preview.textContent = 'Write a counterspell first.';
  } else {
    const availableMagic = game?.player?.mp ?? 10;
    const tooCostly = availableMagic < magic.min;
    const uncertain = availableMagic < magic.max;
    const affordability = tooCostly ? 'Likely too costly.' : uncertain ? 'May fail.' : 'Likely affordable.';
    preview.textContent = `Magic ~${magic.min}–${magic.max} (you have ${availableMagic}/10). ${affordability} Free check; the referee sets the final cost.`;
  }
  preview.hidden = false;
});
$('spell-input').addEventListener('input', () => { $('magic-preview').hidden = true; });
$('spell-input').addEventListener('keydown', event => {
  if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
    event.preventDefault();
    if (!$('cast-btn').disabled) $('spell-form').requestSubmit();
  }
});
$('retry-attack').addEventListener('click', getNextAttack);
$('share-result').addEventListener('click', () => { if (game?.winner) void copyChallenge(); });
$('copy-result').addEventListener('click', copyGameLink);
$('copy-claim').addEventListener('click', async () => {
  const note = claimNote();
  if (!note) return;
  try {
    await navigator.clipboard.writeText(note);
    toast('Claim note copied. Email it to us.');
  } catch {
    window.prompt('Copy your claim note:', note);
  }
});
$('play-again').addEventListener('click', () => $('new-game').click());
$('new-game').addEventListener('click', async () => {
  if (busy) return;
  busy = true;
  render();
  try {
    const result = await request('/api/new', { method: 'POST', body: '{}' });
    activeEventNumber = result.eventNumber ?? activeEventNumber;
    game = result.game;
    claimLine = '';
    resetFeed();
    setDuckPose('idle');
    setPlayerPose('idle');
    $('spell-input').value = '';
    $('magic-preview').hidden = true;
    render();
    await getNextAttack();
  } catch (error) { toast(error.message); }
  finally { busy = false; render(); }
});

try {
  const initial = await request('/api/state');
  game = initial.game;
  activeEventNumber = initial.eventNumber ?? null;
  setMode(initial.mode, initial.model);
  render();
  startPresence();
  if (game.winner === 'player') { setDuckPose('defeated'); setPlayerPose('victory'); }
  if (game.winner === 'duck') setPlayerPose('defeated');
  if (!game.pending && !game.winner) await getNextAttack();
} catch (error) { toast(error.message); $('mode').textContent = 'OFFLINE'; }
