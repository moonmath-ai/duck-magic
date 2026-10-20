// Each line is a locked, visible attack. The model may choose and narrate it,
// but may not change its material, scale, timing, target, or special behavior.
const rows = `
Fireball|classic|A wagon-sized ball of fire flies straight at your chest and bursts on contact in two seconds.
Tidal Wave|classic|A wall of seawater three stories high advances across the arena toward you over five seconds.
Chain Lightning|classic|Three electrical arcs jump from metal posts toward you over two seconds; each seeks a conductive path.
Ice Spear|classic|A spear of solid ice shoots toward your torso at arrow speed.
Meteor Shower|classic|Six fist-sized burning rocks fall onto the patch of ground around you over four seconds.
Earthquake|classic|A three-meter patch of ground beneath your starting position shakes hard enough to throw you down for five seconds; the rest of the arena stays still.
Wind Blade|classic|A sharp horizontal gust of compressed air crosses the arena at waist height.
Acid Rain|classic|Corrosive droplets fall over your entire side of the arena for six seconds.
Stone Golem|classic|A stone figure strides toward you and swings one heavy fist at your position.
Shadow Bind|classic|Dark ropes rise from your own shadow and tighten around your legs for four seconds.
Frost Nova|classic|A ring of freezing air expands from the duck and reaches you in three seconds.
Lava Line|classic|A narrow crack of molten rock opens across the ground between you and the duck, then widens toward your feet.
Thorn Wall|classic|A wall of thorny vines grows around your side of the arena, closing inward for five seconds.
Arcane Missiles|classic|Five glowing bolts curve toward your torso one after another over three seconds.
Gravity Well|classic|A small point beside you pulls loose objects and your body toward it for four seconds.
Sandstorm|classic|A dense cloud of abrasive sand sweeps across the arena and obscures your sight for six seconds.
Poison Fog|classic|A low green fog rolls toward you and becomes harmful if breathed for more than two seconds.
Crystal Shards|classic|A cluster of sharp crystals bursts from the floor around your ankles.
Thunderclap|classic|A focused shockwave of sound strikes your ears and balance in one second.
Water Whip|classic|A thick stream of water snaps sideways toward your chest once.
Fire Ring|classic|A circle of flames rises around you, leaving one narrow gap behind you for four seconds.
Snow Squall|classic|Blinding snow and hard ice pellets blow toward your face for five seconds.
Mud Trap|classic|The ground under your shoes turns into deep sticky mud for six seconds.
Mirror Beam|classic|A bright beam reflects from three fixed mirrors before reaching your chest in two seconds.
Iron Rain|classic|Dozens of small iron nails fall over your position for three seconds.
Smoke Serpent|classic|A snake of hot smoke coils toward your face and eyes for four seconds.
Clockwork Claw|classic|A mechanical claw extends from the duck's side and tries to grab your wand.
Solar Flare|classic|A sudden flash of light and heat erupts above your head for one second.
Glass Hail|classic|Twenty marble-sized glass spheres fall toward your head and shoulders for three seconds.
Vine Snare|classic|Two vines snake along the floor and try to bind both of your ankles.
Magnetic Pull|classic|A magnetic pulse drags every ordinary metal item you carry toward the duck for three seconds.
Steam Burst|classic|A cloud of hot steam jets from a pipe at your left side for two seconds.
Quicksand Patch|classic|A two-meter circle of floor beneath you becomes loose sinking sand.
Phantom Charge|classic|Three solid-looking magical horse silhouettes gallop at you in a straight line.
Comet Tail|classic|A ribbon of burning dust sweeps from the ceiling down across your side of the arena.
Meatball Monsoon|silly|Twelve hot, bowling-ball-sized meatballs fall toward your position over four seconds.
Baguette Barrage|silly|Ten stale baguettes launch point-first at your torso in a two-second volley.
Spaghetti Net|silly|A sticky net of cooked spaghetti drops over your head and arms.
Custard Cannon|silly|A cannon fires one bathtub-sized blob of hot custard toward you.
Popcorn Volcano|silly|A geyser of hard, hot popcorn erupts beneath your feet for five seconds.
Pancake Press|silly|Three giant pancakes descend one at a time and try to pin you to the floor.
Pickle Spears|silly|Six sharp pickle spears fly toward you in a fan-shaped spread.
Soup Tsunami|silly|A waist-high wave of boiling tomato soup crosses the arena in four seconds.
Cheese Avalanche|silly|A heap of heavy cheese wheels rolls down a ramp toward your legs.
Eggshell Shrapnel|silly|A huge egg pops overhead, scattering hard shell fragments downward.
Rubber Duck Stampede|silly|Twenty enchanted rubber ducks rush across the floor and try to knock you down.
Feather Tornado|silly|A dense spinning column of feathers lifts loose objects and blows grit toward your face.
Honking Shockwave|silly|The duck lets out one amplified honk that sends a visible pressure wave toward your chest.
Bubble Prison|silly|A thick transparent bubble grows around you and starts shrinking over five seconds.
Syrup Rain|silly|Sticky syrup falls over your side of the arena and slows your movement for six seconds.
Giant Teacup|silly|A ceramic teacup as tall as you drops upside down over your position.
Noodle Lasso|silly|A stiff enchanted noodle whips toward your wrists and tries to tie them together.
Flying Toasters|silly|Four heavy toasters fly from separate directions toward your head and shoulders.
Banana Peel Blitz|silly|The floor around you fills with slippery banana peels as a gust pushes you forward.
Disco Ball Drop|silly|A heavy mirrored disco ball swings down from above toward your head.
Moon Cheese Beam|silly|A beam turns the patch of floor beneath you into soft cheese for five seconds.
Sock Puppet Swarm|silly|Ten enchanted sock puppets leap toward your face and try to cover your eyes.
Umbrella Reversal|silly|A giant umbrella catches a gust and tips toward you with its pointed handle first.
Marmalade Mist|silly|A sticky orange mist condenses over your face and hands for four seconds.
Waffle Iron Wall|silly|A huge hot waffle iron closes from either side around your position in three seconds.
Marshmallow Meteor|silly|One giant flaming marshmallow falls from directly above you in four seconds.
Mustard Fountain|silly|A pressurized fountain of mustard sprays across your path and obscures your vision.
Potato Parade|silly|Armored potatoes march in a line and shoulder-check your knees one by one.
Confetti Guillotine|silly|A curtain of sharp paper confetti sweeps horizontally at face height.
Pretzel Knot|silly|A giant warm pretzel twists around your arms and tightens for four seconds.
Jelly Floor|silly|Your half of the floor becomes wobbling jelly that throws off your balance for five seconds.
Soup Spoon Catapult|silly|A spoon launches a heavy iron cooking pot toward your chest.
Pillow Pummeling|silly|Eight enchanted pillows slam into you from alternating sides over four seconds.
Screaming Kettle|silly|A giant kettle emits a piercing whistle beside your ear for three seconds.
Tumbleweed of Toast|silly|A burning ball of toast rolls at your legs and leaves crumbs of fire behind it.
Expelliarmus|homage|A crimson flash targets the wand in your hand and tries to yank it away without harming your body.
Wingardium Leviosa|homage|Three wooden chairs rise into the air and fly toward you in sequence.
Stupefy|homage|A red stunning bolt flies straight toward your torso and reaches you in two seconds.
Force Push|homage|An invisible shove hits your whole body from the duck's direction in one second.
Laser-Sword Sweep|homage|A humming blade of light sweeps across the space in front of you at waist height.
Tractor Beam|homage|A cone of blue light pulls you toward the duck for five seconds.
Lightning Fingers|homage|Forked electricity streams continuously from the duck's wingtips toward your chest for three seconds.
Stasis Field|homage|A shimmering field spreads from your feet upward, slowing movement for four seconds.
Portal Drop|homage|A circular opening appears beneath your feet and leads to a shallow pit two meters below.
Time-Loop Snare|homage|For three seconds, each step you take returns you to the spot where the spell began.
Origami Dragon|strange|A dragon made of sharp folded paper glides toward your face and hands.
Reverse Waterfall|strange|A column of water rises from the floor beneath you and lifts you toward the ceiling.
Clock Hand Swipe|strange|A giant clock hand sweeps across the floor at knee height in three seconds.
Ink Eclipse|strange|A dark ink cloud spreads overhead and drips into your eyes and onto the floor.
Doorway Chase|strange|Three doors appear around you; one falls forward toward your body after two seconds.
Whisper Curse|strange|The duck's amplified whisper pulls your attention and makes nearby objects sound farther away for five seconds.
Paper Moon|strange|A heavy paper moon unfolds overhead and drops toward your position.
Magnetized Stars|strange|Five glowing metal stars orbit you, then dart inward at shoulder height.
Pocket Blizzard|strange|A tiny storm cloud follows above your head and pelts only you with ice for five seconds.
Living Chalk|strange|Chalk lines on the floor rise as solid bars and close around your ankles.
Reflection Swap|strange|Your mirror image steps from a mirror and shoves you once from behind.
Silent Bell|strange|A bell rings without sound, sending a visible vibration through the ground beneath you.
Lantern Moths|strange|A swarm of hot glowing moths flutters toward your eyes and exposed skin for four seconds.
Gravity Marbles|strange|Six black marbles roll near your feet and tug your shoes toward them for five seconds.
Cloud Stair Collapse|strange|The cloud steps beneath you vanish one at a time from back to front over four seconds.
Moonlight Lasso|strange|A bright cord of moonlight loops toward your waist and pulls sideways for three seconds.
Hourglass Sandfall|strange|A glass hourglass cracks above you and dumps a heavy stream of sand onto your position.
Compass Curse|strange|Four floating compass needles dart toward your shoulders from north, south, east, and west.
Echo Hammer|strange|The duck strikes an invisible bell, and a blunt sound-wave hammer falls toward your head.
Upside-Down Rain|strange|Cold rain rises from the floor beneath you, pushing upward and making footing slippery for five seconds.
`.trim().split('\n');

export const SPELLS = rows.map((row, index) => {
  const [name, category, facts] = row.split('|');
  if (!name || !category || !facts) throw new Error(`Invalid spell ${index + 1}`);
  return Object.freeze({ id: index + 1, name, category, facts, damage: 10 });
});
if (SPELLS.length !== 100) throw new Error(`Expected 100 spells, got ${SPELLS.length}`);

export function spellById(id) { return SPELLS.find(spell => spell.id === Number(id)) || null; }

export function chooseSpell(usedIds = [], random = Math.random) {
  const used = new Set(usedIds);
  const available = SPELLS.filter(spell => !used.has(spell.id));
  const pool = available.length ? available : SPELLS;
  return pool[Math.min(pool.length - 1, Math.floor(random() * pool.length))];
}
