import { chooseSpell, spellById } from './spells.mjs';
import { visualFor } from './model.mjs';

export const MAX_HP = 30;
export const DUCK_HP = 24;
export const MAX_MP = 10;
export const MP_REGEN = 2;
const clamp = (n, low, high) => Math.max(low, Math.min(high, Number.isFinite(Number(n)) ? Math.round(Number(n)) : low));
const text = (value, max = 220) => String(value ?? '').replace(/[<>]/g, '').replace(/\s+/g, ' ').trim().slice(0, max);
function causalReason(value, reflected = 0) {
  const reason = text(value, 500);
  // The model prices a spell, but the server may enforce a higher minimum cost.
  // Keep only the model's causal explanation; the UI reports the authoritative cost.
  const sentences = reason.split(/(?<=[.!?])\s+/).filter(sentence => !/\b(?:cost|costs|costing|MP|stamina)\b|\b\d+\s+magic\b/i.test(sentence));
  if (reflected > 0) return sentences.join(' ') || 'The referee scored your counterspell against the locked attack.';
  const noDuckHarm = /(?:nothing|none of (?:it|this|the attack)|no (?:damage|harm))\s+(?:is\s+|was\s+|gets\s+)?(?:turned|sent|redirected|reflected|bounced|thrown)(?:\s+back)?\s+(?:on(?:to)?|at|to|towards?)\s+the duck|(?:the duck)\s+(?:takes|suffers|receives|gets)\s+(?:no|zero|0)\s+(?:damage|harm)|(?:you|your spell|this|it)\s+(?:do(?:es)?\s+not|doesn't|can't|cannot|never|fails?\s+to)\s+(?:hurt|harm|damage|hit|injure|strike|reach|affect)\s+the duck|(?:the duck|they|it|the attack)\s+(?:strike|strikes|hit|hits|hurt|hurts|damage|damages)\s+the duck/i;
  return sentences.map(sentence => {
    if (!noDuckHarm.test(sentence)) return sentence;
    const clause = /(?:,?\s+)(?:and|nor|but|while)\s+(?=(?:nothing|none of|no (?:damage|harm)|the duck|you|your spell|this|it)\b)/gi;
    for (const match of sentence.matchAll(clause)) {
      if (noDuckHarm.test(sentence.slice(match.index + match[0].length))) {
        return sentence.slice(0, match.index).replace(/[,;\s]+$/, '') + '.';
      }
    }
    return '';
  }).filter(Boolean).join(' ') || 'The referee scored your counterspell against the locked attack.';
}

export function newGame() {
  return { turn: 0, player: { hp: MAX_HP, mp: MAX_MP }, duck: { hp: DUCK_HP }, pending: null, usedSpellIds: [], winner: null, history: [], inferenceCalls: [] };
}

const positionExchange = defense => /\b(?:switch(?:ing)?|swap(?:ping)?|trad(?:e|ing)|exchang(?:e|ing))\s+(?:places|positions)\s+with\s+(?:the\s+)?(?:duck|him|her|it)\b/i.test(defense);
const magicalTravel = defense => /\b(?:teleport|teleports|teleportation|portal|portals)\b/i.test(defense) ||
  (/\b(?:magic(?:ally)?|cast|spell|instant(?:ly|aneous(?:ly)?)?)\b/i.test(defense) && positionExchange(defense));

export function spellCost(defense, verdict) {
  let cost = clamp(verdict.magicCost, 0, MAX_MP);
  // An unqualified exchange of positions is physical, not a free teleport spell.
  if (!magicalTravel(defense) && positionExchange(defense) && !/\b(?:conjure|summon|enchant|ward|barrier|shield|transform|transmute)\b/i.test(defense)) return 0;
  // A modest energy surcharge applies to magical effort, never to damage dealt or prevented.
  // Physical actions judged at zero magic remain free.
  if (cost > 0) cost = Math.min(MAX_MP, cost + 1);
  // Explicit magical travel costs magic regardless of its success or damage.
  if (magicalTravel(defense)) {
    cost = Math.max(cost, 8);
  }
  return cost;
}

export function tacticFamily(defense) {
  const action = String(defense).toLowerCase();
  if (/\b(?:portal|teleport|wormhole|gateway)\b/.test(action)) return 'portal';
  if (/\b(?:mirror|reflect|ricochet|rebound)\b/.test(action)) return 'reflection';
  if (/\b(?:grab\w*|grasp\w*|seiz\w*|tackl\w*|lift\w*|carr\w*|hold\w*|wrestl\w*|swap\w*|switch\w* places)\b.{0,60}\b(?:duck|him|her)\b/.test(action)) return 'duck-grab';
  if (/\b(?:dodge|sidestep|jump|dive|roll|crouch|duck beneath|run away|sprint away)\b/.test(action)) return 'dodge';
  if (/\b(?:roof|shield|wall|barrier|dome|cover)\b/.test(action)) return 'barrier';
  return null;
}

function explicitReturn(defense) {
  const action = String(defense).toLowerCase();
  const target = /\b(?:the duck|duck wizard|at him|at her|toward him|toward her|onto him|onto her|over him|over her)\b/.test(action);
  const redirect = /\b(?:back|return\w*|redirect\w*|reflect\w*|rebound\w*|send\w*|aim\w*|angl\w*|exit\w*|emerg\w*|blow\w*|fling\w*|hurl\w*|kick\w*|sling\w*|driv\w*|pour\w*|drop\w*|hit\w*|strik\w*|slam\w*|switch\w*|swap\w*|throw\w*)\b/.test(action);
  const moveIntoHazard = /\b(?:grab\w*|lift\w*|mov\w*|carr\w*|hold\w*)\b.{0,60}\b(?:the duck|him|her)\b.{0,60}\b(?:into|through|under|beneath|in the path of)\b/.test(action);
  return (target && redirect) || moveIntoHazard;
}

export function revealAttack(state, rawAttack, random = Math.random) {
  if (state.winner) throw new Error('The duel is over.');
  if (state.pending) return state;
  const spell = spellById(rawAttack?.id);
  const valid = spell && !state.usedSpellIds.includes(spell.id) ? spell : chooseSpell(state.usedSpellIds, random);
  return { ...state, pending: { ...valid, line: text(rawAttack?.line, 110) || 'Try to stop this one.', visual: visualFor(`${valid.name} ${valid.facts}`), inference: rawAttack?.inference || null, inferenceCalls: rawAttack?.modelCalls || (rawAttack?.inference ? [rawAttack.inference] : []) } };
}

export function resolveDefense(state, defense, rawVerdict, meta = {}) {
  if (state.winner || !state.pending) throw new Error('There is no attack to answer.');
  const action = text(defense, 180);
  if (!action) throw new Error('Describe your defense first.');
  if (!rawVerdict || typeof rawVerdict !== 'object') throw new Error('The judge returned no verdict.');
  const availableMp = clamp(state.player.mp ?? MAX_MP, 0, MAX_MP);
  const magicCost = spellCost(action, rawVerdict);
  const insufficientMagic = magicCost > availableMp;
  const fizzled = insufficientMagic;
  const blocked = fizzled ? 0 : clamp(rawVerdict.blocked, 0, 10);
  const tactic = tacticFamily(action);
  const repeatCount = tactic ? (state.history || []).slice(0, 6).filter(event => (event.tactic || tacticFamily(event.defense)) === tactic).length : 0;
  const proposedReflection = fizzled || !explicitReturn(action) ? 0 : clamp(rawVerdict.reflected, 0, 10);
  // Reusing a visible setup lets the duck evade the return path, but never weakens a valid block.
  const reflected = repeatCount && proposedReflection ? Math.min(proposedReflection, repeatCount === 1 ? 4 : 2) : proposedReflection;
  const taken = 10 - blocked;
  const next = structuredClone(state);
  next.player.hp = Math.max(0, next.player.hp - taken);
  next.player.mp = Math.min(MAX_MP, availableMp - (fizzled ? 0 : magicCost) + MP_REGEN);
  delete next.player.stamina;
  next.duck.hp = Math.max(0, next.duck.hp - reflected);
  next.turn++;
  next.usedSpellIds.push(state.pending.id);
  if (next.usedSpellIds.length >= 100) next.usedSpellIds = [];
  next.pending = null;
  if (next.player.hp === 0 && next.duck.hp === 0) next.winner = 'draw';
  else if (next.duck.hp === 0) next.winner = 'player';
  else if (next.player.hp === 0) next.winner = 'duck';
  const event = {
    round: next.turn,
    attack: state.pending,
    defense: action,
    defenseVisual: visualFor(action),
    blocked,
    taken,
    reflected,
    tactic,
    repeatCount,
    magicCost,
    mpBefore: availableMp,
    mpAfter: next.player.mp,
    fizzled,
    reason: fizzled
      ? `Your counter needed ${magicCost} magic (you had ${availableMp}). You could not complete it before ${state.pending.name} hit, so you take the full 10 HP.`
      : proposedReflection > reflected
        ? `${causalReason(rawVerdict.reason, 0)} The duck recognizes your repeated ${tactic} setup and evades most of the return path.`
        : proposedReflection === 0 && rawVerdict.reflected > 0
          ? causalReason(rawVerdict.reason, 0)
          : causalReason(rawVerdict.reason, reflected),
    mode: meta.mode || 'simulated',
    latencyMs: Number(meta.latencyMs) || 0,
    usage: meta.usage || null,
    calls: [...(state.pending.inferenceCalls || [state.pending.inference].filter(Boolean)), ...(meta.judgeInferenceCalls || [meta.judgeInference].filter(Boolean))],
  };
  next.history.unshift(event);
  return { state: next, event };
}
