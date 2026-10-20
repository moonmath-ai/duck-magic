import { sanitizeSpell } from './engine.mjs';

const circle = (cx, cy, r, fill, stroke = '#14232f') => ({ type: 'circle', cx, cy, r, fill, stroke, strokeWidth: 3 });
const ellipse = (cx, cy, rx, ry, fill, stroke = '#14232f') => ({ type: 'ellipse', cx, cy, rx, ry, fill, stroke, strokeWidth: 3 });
const path = (d, fill, stroke = '#14232f') => ({ type: 'path', d, fill, stroke, strokeWidth: 3 });

export function visualFor(text) {
  const lower = text.toLowerCase();
  if (/meatball|spaghetti|pasta/.test(lower)) return { motion: 'rain', count: 12, color: '#ad512c', shapes: [circle(50, 51, 33, '#a94e29'), circle(34, 38, 6, '#df8850', '#df8850'), circle(63, 55, 5, '#e78b4e', '#e78b4e'), ellipse(54, 71, 14, 5, '#d63728', '#d63728')] };
  if (/water|flood|wave|rain|puddle/.test(lower)) return { motion: 'wave', count: 7, color: '#2499dc', shapes: [path('M 15 65 C 22 39 42 72 52 33 C 67 56 76 41 87 67 Q 55 89 15 65 Z', '#58baf0', '#2878bd'), ellipse(55, 68, 30, 8, '#b8e8fc', '#b8e8fc')] };
  if (/lightning|thunder|electric|shock/.test(lower)) return { motion: 'beam', count: 4, color: '#f5cf40', shapes: [path('M 57 7 L 25 53 L 48 52 L 36 95 L 82 39 L 55 43 Z', '#ffe767', '#b98b18')] };
  if (/fire|flame|burn|meteor/.test(lower)) return { motion: 'burst', count: 8, color: '#ed6b36', shapes: [path('M 52 7 C 72 34 42 41 68 58 C 77 78 60 91 49 93 C 20 89 20 63 35 51 C 36 69 52 61 43 40 C 41 29 46 16 52 7 Z', '#ff7d36', '#ad3429'), path('M 49 47 Q 65 66 53 87 Q 31 81 42 62 Z', '#ffce55', '#ffce55')] };
  if (/ice|freeze|frost|snow/.test(lower)) return { motion: 'spiral', count: 7, color: '#78cbe6', shapes: [path('M 50 5 L 60 37 L 92 50 L 60 62 L 50 95 L 39 62 L 8 50 L 39 37 Z', '#a4e9f3', '#2384b8')] };
  if (/shield|wall|protect|mirror/.test(lower)) return { motion: 'spiral', count: 5, color: '#7b83d9', shapes: [path('M 50 6 L 85 24 L 81 62 Q 68 86 50 95 Q 28 85 19 62 L 15 24 Z', '#a0b8ff', '#3446ad')] };
  if (/heal|restore|recover/.test(lower)) return { motion: 'spiral', count: 6, color: '#61c98d', shapes: [path('M 37 11 L 63 11 L 63 37 L 89 37 L 89 63 L 63 63 L 63 89 L 37 89 L 37 63 L 11 63 L 11 37 L 37 37 Z', '#83daa3', '#289557')] };
  if (/noodle|rope|vine|snake/.test(lower)) return { motion: 'lob', count: 5, color: '#e6bc60', shapes: [path('M 20 13 C 85 3 8 40 70 40 C 95 48 14 67 77 75 C 87 83 61 91 36 87', '#e9c774', '#89633b')] };
  return { motion: 'lob', count: 6, color: '#826fe1', shapes: [circle(50, 50, 30, '#9a87ef'), circle(39, 39, 10, '#cfc0ff', '#cfc0ff')] };
}

export function mockPlan(prompt, state) {
  const lower = prompt.toLowerCase();
  const kind = /heal|restore|recover/.test(lower) ? 'heal' : /shield|wall|protect|mirror/.test(lower) ? 'guard' : 'attack';
  const element = /meatball|spaghetti|pasta|bread/.test(lower) ? 'food' : /water|flood|wave|rain|puddle/.test(lower) ? 'water' : /lightning|thunder|electric|shock/.test(lower) ? 'lightning' : /fire|flame|burn|meteor/.test(lower) ? 'fire' : /ice|freeze|frost|snow/.test(lower) ? 'ice' : 'arcane';
  const short = /meatball|spaghetti|pasta/.test(lower) ? 'Meatball Storm' : /water|flood|wave|rain/.test(lower) ? 'Water Wall' : /noodle/.test(lower) ? 'Wet Noodle Wand' : /lightning|thunder/.test(lower) ? 'Lightning Strike' : /fire|flame|meteor/.test(lower) ? 'Fire Spell' : /heal|restore/.test(lower) ? 'Healing Charm' : prompt.replace(/^(i\s+)?(cast|summon|conjure|create)\s+/i, '').replace(/[.!?]+$/, '').trim().slice(0, 30);
  const player = { name: short || 'Wild magic', kind, element, power: /huge|giant|flood|storm|meteor|massive/.test(lower) ? 3 : 2, line: 'Let the magic fly!', visual: visualFor(prompt) };
  const duckIsLow = state.duck.hp < 10;
  const duck = duckIsLow && state.duck.mp >= 3
    ? { name: 'Golden Recovery', kind: 'heal', element: 'nature', power: 1, line: 'A royal duck needs a royal recovery!', visual: visualFor('heal') }
    : element === 'water' || state.arena === 'wet'
      ? { name: 'Thunder Quack', kind: 'attack', element: 'lightning', power: 2, line: 'A puddle? How thoughtful. THUNDER QUACK!', visual: visualFor('lightning') }
      : state.turn % 3 === 1
        ? { name: 'Feather Shield', kind: 'guard', element: 'arcane', power: 1, line: 'Your tricks bounce off my royal feathers!', visual: visualFor('shield') }
        : { name: 'Breadbolt', kind: 'attack', element: 'food', power: 2, line: 'Catch this stale baguette!', visual: { motion: 'lob', count: 5, color: '#dfac5d', shapes: [ellipse(50, 50, 36, 14, '#dba454'), path('M 35 40 L 40 60 M 50 37 L 55 62 M 64 40 L 69 60', '#8f5d2c')] } };
  return { player: sanitizeSpell(player, 'player'), duck: sanitizeSpell(duck, 'duck') };
}

const system = `You are the single creative director AND duck opponent in a whimsical, fair, 2D wizard duel. A human types an arbitrary spell. Return a JSON object with two spells: player and duck. The duck sees the player's new spell, and deliberately chooses a witty legal response based on current battle state. Do not ignore the user's idea. A novel noun should become a recognizable drawn object. For example, "flood of meatballs" needs a little meatball made from circle/ellipse/path shapes, motion "rain", count 10-16, and sauce-colored details. Make the visuals specific to the spell, not generic orbs. Keep both spells short and charming.
Each spell MUST have: name (<=32 chars), kind (attack|guard|heal), element (fire|water|lightning|ice|earth|nature|arcane|food|shadow), power (integer 1-3), line (<=110 chars spoken by caster), visual {motion (rain|wave|beam|burst|spiral|lob), count (1-16), color (#RRGGBB), shapes (3-8 objects)}. Shapes may use only: circle {type,cx,cy,r,fill,stroke,strokeWidth}; ellipse {type,cx,cy,rx,ry,fill,stroke,strokeWidth}; rect {type,x,y,width,height,fill,stroke,strokeWidth}; path {type,d,fill,stroke,strokeWidth}; polygon {type,points,fill,stroke,strokeWidth}. Use a 100x100 coordinate system. Colors must be #RRGGBB. Paths should use normal SVG commands and numbers. No SVG markup, HTML, CSS, JavaScript, external URLs, additional fields or markdown. The browser animates your shape recipe. The rules engine, not you, computes actual MP cost, damage and HP. Never claim an instant win or change stats in narration. Be visually inventive but keep the shapes simple enough to draw quickly. Return JSON only.`;

export async function livePlan(prompt, state, env) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 45000);
  const started = performance.now();
  try {
    const res = await fetch(`${env.baseUrl.replace(/\/$/, '')}/chat/completions`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${env.apiKey}` },
      body: JSON.stringify({
        model: env.model,
        temperature: 0.8,
        reasoning_effort: 'none',
        max_tokens: 2200,
        response_format: { type: 'json_object' },
        messages: [
          { role: 'system', content: system },
          { role: 'user', content: JSON.stringify({ playerCast: prompt, turn: state.turn + 1, player: state.player, duck: state.duck, arena: state.arena, recent: state.history.slice(0, 3).map(h => ({ player: h.playerSpell.name, duck: h.duckSpell.name })) }) },
        ],
      }),
      signal: controller.signal,
    });
    if (!res.ok) throw new Error(`Zro returned HTTP ${res.status}. Check the key, model, and account limits.`);
    const body = await res.json();
    const content = body?.choices?.[0]?.message?.content;
    if (typeof content !== 'string') throw new Error('Zro returned no spell design.');
    let data;
    try { data = JSON.parse(content); }
    catch { throw new Error('Zro returned an incomplete spell design. Please retry; this turn was not applied.'); }
    return {
      player: sanitizeSpell(data.player, 'player'),
      duck: sanitizeSpell(data.duck, 'duck'),
      latencyMs: Math.round(performance.now() - started),
      usage: body.usage ? { promptTokens: body.usage.prompt_tokens || 0, completionTokens: body.usage.completion_tokens || 0 } : null,
      servedModel: String(body.model || env.model).slice(0, 80),
    };
  } finally { clearTimeout(timer); }
}
