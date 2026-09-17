import { z } from 'zod';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex color');
const delay = z.number().min(0).max(3000).default(0);
const radius = z.number().min(5).max(500);
const base = { delay };
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('creature'), color: color.default('#8fc86a'), size: z.number().min(10).max(65).default(32), hp: z.number().min(1).max(1000).default(100), speed: z.number().min(0).max(100).default(24), consumeRadius: z.number().min(0).max(100).default(18), consumeTime: z.number().min(500).max(30000).default(4000), lifetime: z.number().min(0).max(60000).default(0) }).strict(),
  z.object({ ...base, type: z.literal('light'), color: color.default('#ffb866'), rainbow: z.boolean().default(false), radius, duration: z.number().min(100).max(60000).default(5000), flicker: z.number().min(0).max(2000).default(650) }).strict(),
  z.object({ ...base, type: z.literal('resize'), radius, factor: z.number().min(0.25).max(3) }).strict(),
  z.object({ ...base, type: z.literal('spawn'), shape: z.enum(['box', 'circle']).default('box'), material: z.enum(['wood', 'metal', 'stone', 'crystal', 'ice']).default('wood'), count: z.number().int().min(1).max(20).default(1), size: z.number().min(5).max(65).default(28), spread: z.number().min(0).max(220).default(0), color: color.optional(), lifetime: z.number().min(0).max(60000).default(0) }).strict(),
  z.object({ ...base, type: z.literal('burst'), color, count: z.number().int().min(1).max(160).default(45), speed: z.number().min(0).max(12).default(3), size: z.number().min(1).max(20).default(3), lifetime: z.number().min(100).max(5000).default(900), gravity: z.number().min(-0.2).max(0.2).default(0) }).strict(),
  z.object({ ...base, type: z.literal('ring'), color, radius, duration: z.number().min(100).max(4000).default(700) }).strict(),
  z.object({ ...base, type: z.literal('force'), mode: z.enum(['pull', 'push', 'orbit']).default('pull'), radius, strength: z.number().min(0.1).max(3).default(1) }).strict(),
  z.object({ ...base, type: z.literal('remove'), radius }).strict(),
  z.object({ ...base, type: z.literal('projectile'), color, speed: z.number().min(2).max(20).default(8), radius: z.number().min(20).max(220).default(110), power: z.number().min(0.1).max(3).default(1), damage: z.number().min(0).max(1000).default(50), particles: z.number().int().min(10).max(160).default(75) }).strict(),
]);
export const iconNames = ['flame', 'box', 'orbs', 'magnet', 'eraser', 'sparkles', 'wind', 'moon', 'snowflake', 'bolt', 'shield', 'leaf'] as const;
const imageSource = z.string().max(1400000).refine(v => /^https?:\/\//i.test(v) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(v), 'Use an https image URL or upload a PNG, JPEG, WebP, or GIF');
export const blockSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().max(80), kind: z.literal('text'), content: z.string().min(1).max(3000), placement: z.enum(['before', 'after']) }).strict(),
  z.object({ id: z.string().max(80), kind: z.literal('image'), content: imageSource, caption: z.string().max(200).default(''), placement: z.enum(['before', 'after']) }).strict(),
]);
export const spellSchema = z.object({
  version: z.literal(1), id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Use lowercase letters, numbers, and hyphens for the ID'),
  title: z.string().min(1).max(80), subtitle: z.string().max(100).default('An unwritten possibility'),
  school: z.string().min(1).max(40), icon: z.enum(iconNames), color,
  description: z.string().min(1).max(3000), notes: z.string().max(3000).default(''),
  actions: z.array(actionSchema).min(1).max(24), blocks: z.array(blockSchema).max(8).default([]),
}).strict();
export type Spell = z.infer<typeof spellSchema>;
export type Action = z.infer<typeof actionSchema>;
export type Block = z.infer<typeof blockSchema>;

export function parseSpell(source: string): Spell {
  const clean = source.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  if (clean.length > 6500000) throw new Error('This spell is too large. Use smaller images.');
  let value: unknown;
  try { value = JSON.parse(clean); } catch { throw new Error('The spell must be valid JSON. Check commas, quotes, and brackets.'); }
  const result = spellSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join('.') || 'spell'}: ${i.message}`).join('\n'));
  return result.data;
}

export const starterSpells: Spell[] = [
  {
    version: 1, id: 'fireball', title: 'Fireball', subtitle: 'A little sun, borrowed.', school: 'Evocation', icon: 'flame', color: '#cf7045',
    description: 'Gather a spark from the space between your hands. Give it a hunger, give it a heading, and let it go.\n\nUpon arrival, the ember blooms — a brief and rather impolite sun.',
    notes: 'A steady hand is useful. A stone room is wiser.\n\nWood remembers fire. Keep the good furniture out of reach.',
    actions: [{ type: 'projectile', color: '#f59245', speed: 9, radius: 130, power: 1.6, particles: 100 }], blocks: [],
  },
  {
    version: 1, id: 'wooden-box', title: 'Humble Crate', subtitle: 'Something from almost nothing.', school: 'Conjuration', icon: 'box', color: '#a7804e',
    description: 'Persuade the room that there has always been a small wooden crate exactly here.\n\nSturdy, a little crooked, and entirely unremarkable. The most useful magic usually is.',
    notes: 'Try a few together. A stack of crates makes an excellent argument for learning a fire spell.',
    actions: [{ type: 'ring', color: '#c5a76b', radius: 65, duration: 600 }, { type: 'spawn', shape: 'box', material: 'wood', size: 34, count: 1, delay: 180 }, { type: 'burst', color: '#d4b878', count: 28, speed: 2, delay: 180 }], blocks: [],
  },
  {
    version: 1, id: 'iron-orbit', title: 'Iron Choir', subtitle: 'Seven notes in solid metal.', school: 'Conjuration', icon: 'orbs', color: '#728b91',
    description: 'Call a handful of iron spheres into being. They arrive without ceremony and scatter with a satisfying clatter.\n\nEven a small thing carries considerable weight when properly encouraged.',
    notes: 'A fine companion to Gravitic Grasp. Pull the choir together, then send it singing across the chamber.',
    actions: [{ type: 'spawn', shape: 'circle', material: 'metal', size: 11, count: 7, spread: 65 }, { type: 'burst', color: '#a1c2c7', count: 40, speed: 3 }], blocks: [],
  },
  {
    version: 1, id: 'gravitic-grasp', title: 'Gravitic Grasp', subtitle: 'The world leans closer.', school: 'Kinesis', icon: 'magnet', color: '#8f7aa9',
    description: 'Tie an invisible thread to everything nearby. Pull.\n\nLoose objects rush toward the chosen point, drawn together by an insistence the world cannot quite refuse.',
    notes: 'Cast near the edge of a scattered collection. Distance is merely a suggestion, within a certain radius.',
    actions: [{ type: 'force', mode: 'pull', radius: 300, strength: 1.8 }, { type: 'ring', color: '#b5a0d9', radius: 300, duration: 1000 }, { type: 'burst', color: '#b5a0d9', count: 80, speed: 2, lifetime: 1300 }], blocks: [],
  },
  {
    version: 1, id: 'unmake', title: 'Unmake', subtitle: 'Let there be less.', school: 'Abjuration', icon: 'eraser', color: '#789a88',
    description: 'Quietly undo what has been done. Every conjured object within the circle loosens its hold on existence and returns to possibility.\n\nAn empty space is a kind of spell, too.',
    notes: 'The chamber itself is quite stubborn and will remain. Your conjurations are considerably more agreeable.',
    actions: [{ type: 'ring', color: '#9dc9ac', radius: 155, duration: 850 }, { type: 'remove', radius: 155, delay: 160 }, { type: 'burst', color: '#b9d5be', count: 65, speed: 2, lifetime: 1200, gravity: -0.015, delay: 160 }], blocks: [],
  },
  {
    version: 1, id: 'hungry-slime', title: 'Hungry Slime', subtitle: 'A small, patient appetite.', school: 'Conjuration', icon: 'leaf', color: '#8fc86a',
    description: 'Call a jelly-green companion into the chamber. It slides toward nearby objects and slowly digests whatever it touches.\n\nIts appetite extends to wood, metal, stone, crystal, and ice.',
    notes: 'The little bar is its health. One Fireball leaves it half alive; a second finishes the job. Fellow slimes are off the menu.', actions: [{ type: 'creature' }], blocks: [],
  },
  {
    version: 1, id: 'rainbow-light', title: 'Prismatic Wisp', subtitle: 'Five seconds of borrowed color.', school: 'Illumination', icon: 'sparkles', color: '#c39be9',
    description: 'Suspend a soft light in the air. Its glow flows through the rainbow, bathing the stone in shifting color.\n\nAfter five seconds, it flickers into darkness.',
    notes: 'A continuous glow, without a single wandering spark.', actions: [{ type: 'light', rainbow: true, radius: 150, duration: 5000, flicker: 650 }], blocks: [],
  },
  {
    version: 1, id: 'shrink', title: 'Diminish', subtitle: 'A little less of everything.', school: 'Transmutation', icon: 'moon', color: '#89bcd1',
    description: 'Halve the size of nearby conjurations, including slimes. Their physical shape shrinks along with them.',
    notes: 'Small creatures retain their health and appetite. Repeated casting has its limits.', actions: [{ type: 'resize', radius: 130, factor: 0.5 }, { type: 'ring', color: '#89bcd1', radius: 130, duration: 650 }], blocks: [],
  },
  {
    version: 1, id: 'enlarge', title: 'Magnify', subtitle: 'Make room for possibility.', school: 'Transmutation', icon: 'orbs', color: '#d4b574',
    description: 'Double the size of nearby conjurations, including slimes. What grows in appearance grows in physical presence, too.',
    notes: 'A larger slime is still two Fireballs away from oblivion. No conjuration can grow beyond the chamber’s limits.', actions: [{ type: 'resize', radius: 130, factor: 2 }, { type: 'ring', color: '#d4b574', radius: 130, duration: 650 }], blocks: [],
  },
].map(s => spellSchema.parse(s));

const runeAlphabet = 'ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃᛈᛇᛉᛊᛏᛒᛖᛗᛚᛜᛞᛟ';
export function runesFor(spell: Spell): string[] {
  return spell.actions.map(a => {
    const code = JSON.stringify(a);
    let hash = 0;
    for (let i = 0; i < code.length; i++) hash = ((hash << 5) - hash + code.charCodeAt(i)) | 0;
    const name = a.type.toUpperCase().split('').map(c => runeAlphabet[(c.charCodeAt(0) - 65) % runeAlphabet.length]).join('');
    const values = Object.values(a).filter(v => typeof v === 'number').map(v => `${v < 0 ? '−' : ''}${Math.round(Math.abs(v) * 1000).toString(24).split('').map(c => runeAlphabet[parseInt(c, 24)]).join('')}`).join(' · ');
    return `${name}  ⟡  ${values}  :  ${runeAlphabet[Math.abs(hash) % runeAlphabet.length]}`;
  });
}

export function newSpell(): Spell {
  return spellSchema.parse({ version: 1, id: `spell-${Date.now().toString(36)}`, title: 'A New Wonder', subtitle: 'Every great spell begins with a question.', school: 'Evocation', icon: 'sparkles', color: '#bb91c9', description: 'A scattering of violet starlight, called into the world by a curious hand.', notes: 'Make it your own.', actions: [{ type: 'burst', color: '#c5a0e5', count: 70, speed: 4 }, { type: 'ring', color: '#c5a0e5', radius: 100, duration: 900 }] });
}

export const AUTHORING_PROMPT = `You are a spellwright for Tomecraft, a static React spell-crafting game with a top-down, zero-gravity Matter.js arena. Write one original spell for the description I provide. Return ONLY one JSON code block that can be pasted into "Inscribe a spell → Spell code". This is a declarative spell language, NOT JavaScript. Do not use functions, HTML, imports, or unknown properties.

Spell format (all fields shown except blocks are required):
{ "version": 1, "id": "unique-kebab-case", "title": "Spell name", "subtitle": "A short poetic line", "school": "Evocation", "icon": "flame", "color": "#cf7045", "description": "Readable lore and what this spell does. Use \\n for paragraphs.", "notes": "A handwritten observation", "actions": [], "blocks": [] }

Icons: flame, box, orbs, magnet, eraser, sparkles, wind, moon, snowflake, bolt, shield, leaf. Colors MUST be six-digit hex. School may be any short name. Use 1–24 actions. Every action has optional delay in milliseconds, 0–3000, measured from the moment of casting. Actions with equal delays run in array order. Every action is centered at the point the player taps, except projectiles which travel there from the caster near the chamber's south wall. The room is 1400 × 1000 world units.

Actions (include "type" and only the listed properties):
• creature: summons a physical slime with a health bar. Optional color (default #8fc86a), size 10–65 (default 32), hp 1–1000 (default 100), speed 0–100 world units/second (default 24), consumeRadius 0–100 beyond its body (default 18), consumeTime 500–30000 ms per object (default 4000), lifetime 0–60000 ms (0 persists). Seeks the nearest non-creature object, slowly shrinks and consumes nearby objects of any material, and wanders if none remain. Does not eat creatures or walls. Projectile damage reduces health; zero health removes it. No regeneration. Default slime survives exactly one default Fireball and dies to the second hit.
• light: optional color (default #ffb866), rainbow boolean (default false), required radius 5–500, duration 100–60000 ms (default 5000), flicker 0–2000 ms (default 650, included in duration). A stationary continuous glow, not particles. Rainbow cycles through all hues in five seconds; flicker fades it out at the end. At most 32 active lights. Unmake and resize affect physical objects, not lights.
• resize: required radius 5–500 and factor 0.25–3. Immediately scales all physical objects intersecting the area, including creatures. Factors below 1 shrink, above 1 enlarge. Both collision geometry and appearance change; final size is clamped to 4–120 world units. Health, speed, and consumption settings stay unchanged. Repeated casts compound; changes persist.
• spawn: shape "box" | "circle" (default box), material "wood" | "metal" | "stone" | "crystal" | "ice", count 1–20, size 5–65 (circle radius / half box width), spread 0–220, optional color, lifetime 0–60000 ms (0 persists). All spawned objects have physical collisions; wood burns on fireball impact.
• burst: required color; count 1–160, speed 0–12, size 1–20, lifetime 100–5000 ms, gravity -0.2–0.2. Creates glowing particles.
• ring: required color and radius 5–500; duration 100–4000 ms. Animated circle; contracts when this spell contains a pull force, otherwise expands.
• force: mode "pull" | "push" | "orbit"; required radius 5–500; strength 0.1–3. Applies an impulse to existing objects in the area.
• remove: required radius 5–500. Removes all conjured objects intersecting the area; never the walls.
• projectile: required color; speed 2–20, radius 20–220 (explosion), power 0.1–3, damage 0–1000 (default 50, applied once to each creature in the blast), particles 10–160. Travels to target, explodes, pushes objects and destroys wooden objects in the blast. Other actions are delayed from cast time, NOT projectile arrival.

Optional blocks, at most 8, render before or after the main content:
{ "id": "unique-note", "kind": "text", "content": "Extra observation", "placement": "before" | "after" }
{ "id": "unique-image", "kind": "image", "content": "https://an-actual-image-url", "caption": "Caption", "placement": "before" | "after" }
Omit images unless I supply a real URL. User can upload images later.

Keep lore elegant and concise, describe only supported behavior, and combine several actions for distinctive effects. Constraints: 250 physical objects, 2000 particles, and 12 pending casts per chamber. No arbitrary code executes. Runes are rendered automatically from action names and numeric parameters; never supply a rune field.

Example actions: [{"type":"spawn","material":"ice","shape":"circle","size":16,"count":8,"spread":85,"lifetime":15000},{"type":"burst","color":"#a2dcf5","count":70,"speed":3},{"type":"force","mode":"push","radius":120,"strength":1.2,"delay":250}]

Create this spell: [describe your spell here]`;
