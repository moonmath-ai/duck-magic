// A free, deliberately broad guide to spell style. The referee sets the actual cost.
function estimateBaseMagicCost(spell) {
  const words = String(spell || '').toLowerCase().trim();
  if (!words) return null;
  const exchange = /\b(?:switch(?:ing)?|swap(?:ping)?|trad(?:e|ing)|exchang(?:e|ing)) (?:places|positions) with (?:the )?(?:duck|him|her|it)\b/.test(words);
  if (/\b(?:teleport(?:ation)?|portal)\b/.test(words) || (exchange && /\b(?:magic(?:ally)?|cast|spell|instant(?:ly|aneous(?:ly)?)?)\b/.test(words))) {
    return { min: 7, max: 10, style: 'Space-bending spell' };
  }
  if (exchange) {
    return { min: 0, max: 0, style: 'Physical position change' };
  }
  if (/\b(?:rewind|reverse time|stop time|freeze time|time loop|reality|dimension)\b/.test(words)) {
    return { min: 7, max: 10, style: 'Reality-bending spell' };
  }
  if (/\b(?:hold|lift|grab|carry)\b.*\bduck\b|\bduck\b.*\b(?:shield|over my head|above my head)\b|\b(?:angle|tilt)\b.*\b(?:mirror|shield)\b/.test(words)) {
    return { min: 0, max: 2, style: 'Mostly physical action' };
  }
  if (/\b(?:thick stone|solid stone|steel|concrete|fortress|dome|bunker)\b/.test(words)) {
    return { min: 4, max: 7, style: 'Heavy protection' };
  }
  if (/\b(?:summon|conjure|enchant|ward|barrier|shield|wall|roof|force field)\b/.test(words)) {
    return { min: 2, max: 6, style: 'Magical protection' };
  }
  if (/\b(?:cast|spell|magic|transform|transmute|freeze|melt|dispel)\b/.test(words)) {
    return { min: 3, max: 8, style: 'Other magic' };
  }
  if (/\b(?:run|jump|dodge|duck|crouch|sidestep|hide|roll|grab|hold|lift|angle|catch|throw|cover|move|step)\b/.test(words)) {
    return { min: 0, max: 2, style: 'Mostly physical action' };
  }
  return { min: 1, max: 8, style: 'Unclear spell style' };
}

export function estimateMagicCost(spell) {
  const estimate = estimateBaseMagicCost(spell);
  if (!estimate) return null;
  const increase = cost => cost > 0 ? Math.min(10, cost + 1) : 0;
  const magicalTravel = estimate.style === 'Space-bending spell';
  return {
    ...estimate,
    min: magicalTravel ? Math.max(8, increase(estimate.min)) : increase(estimate.min),
    max: increase(estimate.max),
  };
}
