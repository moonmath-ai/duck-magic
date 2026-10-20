export const MAX_HP = 24;
export const MAX_MP = 10;
const KINDS = new Set(['attack', 'guard', 'heal']);
const ELEMENTS = new Set(['fire', 'water', 'lightning', 'ice', 'earth', 'nature', 'arcane', 'food', 'shadow']);
const MOTIONS = new Set(['rain', 'wave', 'beam', 'burst', 'spiral', 'lob']);
const SHAPES = new Set(['circle', 'ellipse', 'rect', 'path', 'polygon']);
const NUMERIC = ['cx', 'cy', 'r', 'rx', 'ry', 'x', 'y', 'width', 'height', 'strokeWidth'];
const color = (value, fallback) => /^#[0-9a-fA-F]{6}$/.test(value) ? value : fallback;
const clamp = (value, low, high) => Math.min(high, Math.max(low, Number.isFinite(Number(value)) ? Number(value) : low));
const cleanText = (value, limit, fallback = '') => String(value ?? fallback).replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, limit) || fallback;

export function newGame() {
  return {
    turn: 0,
    player: { hp: MAX_HP, mp: MAX_MP },
    duck: { hp: MAX_HP, mp: MAX_MP },
    arena: 'clear',
    winner: null,
    history: [],
  };
}

export function sanitizeVisual(raw = {}, fallbackColor = '#2689df') {
  const shapes = Array.isArray(raw.shapes) ? raw.shapes.slice(0, 10) : [];
  const safeShapes = shapes.filter(shape => SHAPES.has(shape?.type)).map(shape => {
    const clean = { type: shape.type, fill: color(shape.fill, fallbackColor) };
    if (shape.stroke) clean.stroke = color(shape.stroke, '#132531');
    for (const key of NUMERIC) if (shape[key] !== undefined) clean[key] = clamp(shape[key], 0, 100);
    if (shape.type === 'path' && typeof shape.d === 'string' && /^[MmLlHhVvCcSsQqTtAaZz0-9,.\s+\-]*$/.test(shape.d)) clean.d = shape.d.slice(0, 700);
    if (shape.type === 'polygon' && typeof shape.points === 'string' && /^[0-9,.\s\-]*$/.test(shape.points)) clean.points = shape.points.slice(0, 400);
    return clean;
  }).filter(shape => shape.type !== 'path' || shape.d).filter(shape => shape.type !== 'polygon' || shape.points);
  return {
    motion: MOTIONS.has(raw.motion) ? raw.motion : 'lob',
    count: Math.round(clamp(raw.count, 1, 16)),
    color: color(raw.color, fallbackColor),
    shapes: safeShapes.length ? safeShapes : [{ type: 'circle', cx: 50, cy: 50, r: 32, fill: fallbackColor }],
  };
}

export function sanitizeSpell(raw, side) {
  if (!raw || typeof raw !== 'object') throw new Error(`Missing ${side} spell.`);
  const fallbackColor = side === 'duck' ? '#f6c73f' : '#2689df';
  return {
    name: cleanText(raw.name, 32, 'Unnamed spell'),
    kind: KINDS.has(raw.kind) ? raw.kind : 'attack',
    element: ELEMENTS.has(raw.element) ? raw.element : 'arcane',
    power: Math.round(clamp(raw.power, 1, 3)),
    line: cleanText(raw.line, 110, side === 'duck' ? 'Quack!' : 'Spell cast!'),
    visual: sanitizeVisual(raw.visual, fallbackColor),
  };
}

function costFor(power) { return 1 + power * 2; }
function ready(spell, availableMp) {
  const copy = { ...spell };
  while (copy.power > 1 && costFor(copy.power) > availableMp) copy.power--;
  copy.cost = costFor(copy.power) <= availableMp ? costFor(copy.power) : 0;
  copy.fizzled = copy.cost === 0;
  return copy;
}

export function resolveTurn(state, prompt, rawPlan, meta = {}) {
  if (state.winner) throw new Error('This duel is over. Start a new duel.');
  if (!prompt || !String(prompt).trim()) throw new Error('Type a spell first.');
  const playerSpell = ready(sanitizeSpell(rawPlan.player, 'player'), state.player.mp);
  const duckSpell = ready(sanitizeSpell(rawPlan.duck, 'duck'), state.duck.mp);
  const playerGuard = !playerSpell.fizzled && playerSpell.kind === 'guard' ? 2 + 2 * playerSpell.power : 0;
  const duckGuard = !duckSpell.fizzled && duckSpell.kind === 'guard' ? 2 + 2 * duckSpell.power : 0;
  const bonus = (spell) => !spell.fizzled && spell.kind === 'attack' && state.arena === 'wet' && spell.element === 'lightning' ? 2 : 0;
  const rawToDuck = !playerSpell.fizzled && playerSpell.kind === 'attack' ? 1 + 2 * playerSpell.power + bonus(playerSpell) : 0;
  const rawToPlayer = !duckSpell.fizzled && duckSpell.kind === 'attack' ? 1 + 2 * duckSpell.power + bonus(duckSpell) : 0;
  const toDuck = Math.max(0, rawToDuck - duckGuard);
  const toPlayer = Math.max(0, rawToPlayer - playerGuard);
  const playerHeal = !playerSpell.fizzled && playerSpell.kind === 'heal' ? 1 + 2 * playerSpell.power : 0;
  const duckHeal = !duckSpell.fizzled && duckSpell.kind === 'heal' ? 1 + 2 * duckSpell.power : 0;
  const next = structuredClone(state);
  next.player.hp = clamp(next.player.hp - toPlayer + playerHeal, 0, MAX_HP);
  next.duck.hp = clamp(next.duck.hp - toDuck + duckHeal, 0, MAX_HP);
  next.player.mp = clamp(next.player.mp - playerSpell.cost + 2, 0, MAX_MP);
  next.duck.mp = clamp(next.duck.mp - duckSpell.cost + 2, 0, MAX_MP);
  next.turn++;
  if (!playerSpell.fizzled && playerSpell.kind === 'attack' && playerSpell.element === 'water') next.arena = 'wet';
  else if (!duckSpell.fizzled && duckSpell.kind === 'attack' && duckSpell.element === 'water') next.arena = 'wet';
  else if (next.arena === 'wet' && (playerSpell.element === 'lightning' || duckSpell.element === 'lightning')) next.arena = 'clear';
  if (next.player.hp <= 0 || next.duck.hp <= 0) next.winner = next.player.hp === next.duck.hp ? 'draw' : next.duck.hp <= 0 ? 'player' : 'duck';
  const note = [
    playerSpell.fizzled ? 'Your spell fizzled: not enough MP.' : `${playerSpell.name} ${playerSpell.kind === 'attack' ? `dealt ${toDuck} damage` : playerSpell.kind === 'heal' ? `restored ${playerHeal} HP` : `blocked ${Math.min(playerGuard, rawToPlayer)} damage`}.`,
    duckSpell.fizzled ? 'The duck ran out of MP.' : `${duckSpell.name} ${duckSpell.kind === 'attack' ? `dealt ${toPlayer} damage` : duckSpell.kind === 'heal' ? `restored ${duckHeal} HP` : `blocked ${Math.min(duckGuard, rawToDuck)} damage`}.`,
  ];
  // Keep narration plain and derived from game state, not model-authoritative damage claims.
  const event = {
    round: next.turn,
    prompt: cleanText(prompt, 180),
    playerSpell,
    duckSpell,
    toPlayer,
    toDuck,
    playerHeal,
    duckHeal,
    notes: note,
    mode: meta.mode || 'simulated',
    latencyMs: Number(meta.latencyMs) || 0,
    usage: meta.usage || null,
  };
  next.history.unshift(event);
  next.history = next.history.slice(0, 16);
  return { state: next, event };
}
