import { z } from 'zod';
import { actionSchema, legacyCode } from './legacySpells';
import { compileSpell } from './spellRuntime';

const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex color');
export const iconNames = ['flame', 'box', 'orbs', 'magnet', 'eraser', 'sparkles', 'wind', 'moon', 'snowflake', 'bolt', 'shield', 'leaf'] as const;
const imageSource = z.string().max(1400000).refine(v => /^https?:\/\//i.test(v) || /^data:image\/(png|jpeg|webp|gif);base64,/i.test(v), 'Use an https image URL or upload a PNG, JPEG, WebP, or GIF');
export const blockSchema = z.discriminatedUnion('kind', [
  z.object({ id: z.string().max(80), kind: z.literal('text'), content: z.string().min(1).max(3000), placement: z.enum(['before', 'after']) }).strict(),
  z.object({ id: z.string().max(80), kind: z.literal('image'), content: imageSource, caption: z.string().max(200).default(''), placement: z.enum(['before', 'after']) }).strict(),
]);
const metadataSchema = z.object({
  id: z.string().regex(/^[a-z0-9-]{1,64}$/, 'Use lowercase letters, numbers, and hyphens for the ID'),
  title: z.string().min(1).max(80), subtitle: z.string().max(100).default('An unwritten possibility'),
  school: z.string().min(1).max(40), icon: z.enum(iconNames), color,
  description: z.string().min(1).max(3000), notes: z.string().max(3000).default(''),
  blocks: z.array(blockSchema).max(8).default([]),
});
const javascriptSpellSchema = metadataSchema.extend({
  version: z.literal(2),
  code: z.string().min(1).max(200000).superRefine((code, ctx) => {
    try { compileSpell(code); } catch (error) { ctx.addIssue({ code: 'custom', message: String(error instanceof Error ? error.message : error) }); }
  }),
}).strict();
const legacySpellSchema = metadataSchema.extend({ version: z.literal(1), actions: z.array(actionSchema).min(1).max(24) }).strict();
export const spellSchema = z.union([javascriptSpellSchema, legacySpellSchema.transform(({actions, ...spell}) => ({ ...spell, version: 2 as const, code: legacyCode(actions) }))]);
export type Spell = z.infer<typeof javascriptSpellSchema>;
export type Block = z.infer<typeof blockSchema>;

export function parseSpell(source: string): Spell {
  const clean = source.trim().replace(/^```(?:javascript|js|json)?\s*/i, '').replace(/\s*```$/, '');
  if (clean.length > 6500000) throw new Error('This spell is too large. Use smaller images.');
  let value: unknown;
  if (clean.startsWith('{')) {
    try { value = JSON.parse(clean); } catch { throw new Error('Invalid JSON backup. Paste the complete JavaScript spell, including its /* @spell … */ header.'); }
  } else {
    const match = clean.match(/^\/\*\s*@spell\s+([\s\S]*?)\*\/\s*([\s\S]+)$/);
    if (!match) throw new Error('Paste a complete JavaScript spell: /* @spell { metadata } */ followed by export default function cast(api) { … }.');
    try { value = { ...JSON.parse(match[1]), version: 2, code: match[2].trim() }; }
    catch { throw new Error('The @spell header must contain valid JSON metadata. The JavaScript belongs after the closing */.'); }
  }
  const result = spellSchema.safeParse(value);
  if (!result.success) throw new Error(result.error.issues.map(i => `${i.path.join('.') || 'spell'}: ${i.message}`).join('\n'));
  return result.data;
}

export function spellSource(spell: Spell): string {
  const { code, version: _version, ...metadata } = spell;
  return `/* @spell\n${JSON.stringify(metadata, null, 2).replace(/\*\//g, '\\u002a/')}\n*/\n${code}`;
}

export const starterSpells: Spell[] = [
  {
    "version": 2,
    "id": "fireball",
    "title": "Fireball",
    "subtitle": "A little sun, borrowed.",
    "school": "Evocation",
    "icon": "flame",
    "color": "#cf7045",
    "description": "Gather a spark from the space between your hands. Give it a hunger, give it a heading, and let it go.\n\nUpon arrival, the ember blooms — a brief and rather impolite sun.",
    "notes": "A steady hand is useful. A stone room is wiser.\n\nWood remembers fire. Keep the good furniture out of reach.",
    "blocks": [],
    code: `export default function cast({ world, target, caster, effect }) {
    const ember = { ...caster };
    const color = '#f59245';
    const stop = effect({
        duration: Math.hypot(target.x - caster.x, target.y - caster.y) / 9 * 16.67 + 100,
        update(dt) {
            const dx = target.x - ember.x, dy = target.y - ember.y;
            const distance = Math.hypot(dx, dy), step = 9 * dt / 16.67;
            if (distance > step) {
                ember.x += dx / distance * step;
                ember.y += dy / distance * step;
                world.burst(ember, color, 3, 0.8, 5, 500);
                return;
            }
            world.burst(target, color, 100, 7, 6, 1100);
            world.burst(target, '#fff2b5', 18, 5, 3, 600);
            world.rings.push({ ...target, color, radius: 130, life: 600, total: 600, inward: false });
            world.force(target, 130, 1.6, 'push');
            world.terrain.ignite(target, 130);
            for (const body of world.objects) {
                if (!world.inRange(body, target, 130)) continue;
                world.thaw(body, 5000);
                if (!body.plugin.frozen) world.damage(body, 50);
                world.ignite(body);
            }
            stop();
        },
        draw(ctx, _age, reducedMotion) {
            ctx.shadowColor = color;
            ctx.shadowBlur = reducedMotion ? 0 : 25;
            ctx.fillStyle = '#fff3b9';
            ctx.beginPath();
            ctx.arc(ember.x, ember.y, 7, 0, Math.PI * 2);
            ctx.fill();
        }
    });
}`
  },
  {
    "version": 2,
    "id": "wooden-box",
    "title": "Humble Crate",
    "subtitle": "Something from almost nothing.",
    "school": "Conjuration",
    "icon": "box",
    "color": "#a7804e",
    "description": "Persuade the room that there has always been a small wooden crate exactly here.\n\nSturdy, a little crooked, and entirely unremarkable. The most useful magic usually is.",
    "notes": "Try a few together. A stack of crates makes an excellent argument for learning a fire spell.",
    "blocks": [],
    code: `export default function cast({ world, target, after }) {
    if (world.rings.length < 100)
        world.rings.push({ ...target, color: "#c5a76b", radius: 65, life: 600, total: 600, inward: false });
    after(180, () => {
        world.spawn({ "shape": "box", "material": "wood", "count": 1, "size": 34, "spread": 0, "lifetime": 0 }, target);
    });
    after(180, () => {
        world.burst(target, "#d4b878", 28, 2, 3, 900, 0);
    });
}`
  },
  {
    "version": 2,
    "id": "iron-orbit",
    "title": "Iron Choir",
    "subtitle": "Seven notes in solid metal.",
    "school": "Conjuration",
    "icon": "orbs",
    "color": "#728b91",
    "description": "Call a handful of iron spheres into being. They arrive without ceremony and scatter with a satisfying clatter.\n\nEven a small thing carries considerable weight when properly encouraged.",
    "notes": "A fine companion to Gravitic Grasp. Pull the choir together, then send it singing across the chamber.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    world.spawn({ "shape": "circle", "material": "metal", "count": 7, "size": 11, "spread": 65, "lifetime": 0 }, target);
    world.burst(target, "#a1c2c7", 40, 3, 3, 900, 0);
}`
  },
  {
    "version": 2,
    "id": "gravitic-grasp",
    "title": "Gravitic Grasp",
    "subtitle": "The world leans closer.",
    "school": "Kinesis",
    "icon": "magnet",
    "color": "#8f7aa9",
    "description": "Tie an invisible thread to everything nearby. Pull.\n\nLoose objects rush toward the chosen point, drawn together by an insistence the world cannot quite refuse.",
    "notes": "Cast near the edge of a scattered collection. Distance is merely a suggestion, within a certain radius.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    world.force(target, 300, 1.8, "pull");
    if (world.rings.length < 100)
        world.rings.push({ ...target, color: "#b5a0d9", radius: 300, life: 1000, total: 1000, inward: true });
    world.burst(target, "#b5a0d9", 80, 2, 3, 1300, 0);
}`
  },
  {
    "version": 2,
    "id": "unmake",
    "title": "Unmake",
    "subtitle": "Let there be less.",
    "school": "Abjuration",
    "icon": "eraser",
    "color": "#789a88",
    "description": "Quietly undo what has been done. Every conjured object within the circle loosens its hold on existence and returns to possibility.\n\nAn empty space is a kind of spell, too.",
    "notes": "The chamber itself is quite stubborn and will remain. Your conjurations are considerably more agreeable.",
    "blocks": [],
    code: `export default function cast({ world, target, after }) {
    if (world.rings.length < 100)
        world.rings.push({ ...target, color: "#9dc9ac", radius: 155, life: 850, total: 850, inward: false });
    after(160, () => {
        world.remove(target, 155);
    });
    after(160, () => {
        world.burst(target, "#b9d5be", 65, 2, 3, 1200, -0.015);
    });
}`
  },
  {
    "version": 2,
    "id": "hungry-slime",
    "title": "Hungry Slime",
    "subtitle": "A small, patient appetite.",
    "school": "Conjuration",
    "icon": "leaf",
    "color": "#8fc86a",
    "description": "Call a jelly-green companion into the chamber. It slides toward nearby objects and slowly digests whatever it touches.\n\nIts appetite extends to wood, metal, stone, crystal, and ice.",
    "notes": "The little bar is its health. One Fireball leaves it half alive; a second finishes the job. Fellow slimes are off the menu.",
    "blocks": [],
    code: `export default function cast({ world, target, Matter }) {
    if (world.objects.length >= 250)
        return;
    if (!world.terrain.contains(target, 32 + 5))
        return;
    const body = Matter.Bodies.circle(target.x, target.y, 32, { frictionAir: .12, restitution: .1, inertia: Infinity });
    body.plugin = { material: 'slime', color: "#8fc86a", size: 32, shape: 'circle', expires: 0, creature: { hp: 100, maxHp: 100, speed: 24, consumeRadius: 18, consumeTime: 4000, meals: new Map() } };
    Matter.Composite.add(world.engine.world, body);
}`
  },
  {
    "version": 2,
    "id": "rainbow-light",
    "title": "Prismatic Wisp",
    "subtitle": "Five seconds of borrowed color.",
    "school": "Illumination",
    "icon": "sparkles",
    "color": "#c39be9",
    "description": "Suspend a soft light in the air. Its glow flows through the rainbow, bathing the stone in shifting color.\n\nAfter five seconds, it flickers into darkness.",
    "notes": "A continuous glow, without a single wandering spark.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    if (world.lights.length >= 32)
        return;
    world.lights.push({ ...target, started: world.time, settings: {
            color: '#ffb866', rainbow: true, radius: 150,
            duration: 5000, flicker: 650
        } });
}`
  },
  {
    "version": 2,
    "id": "shrink",
    "title": "Diminish",
    "subtitle": "A little less of everything.",
    "school": "Transmutation",
    "icon": "moon",
    "color": "#89bcd1",
    "description": "Halve the size of nearby conjurations, including slimes and glowing lights. Physical objects shrink in substance; lights draw their glow inward.",
    "notes": "Small creatures retain their health and appetite. Repeated casting has its limits.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    {
        for (const body of world.objects)
            if (world.inRange(body, target, 130))
                world.resize(body, body.plugin.size * 0.5);
        for (const light of world.lights)
            if (Math.hypot(light.x - target.x, light.y - target.y) <= 130 + light.settings.radius)
                light.settings.radius = clamp(light.settings.radius * 0.5, 5, 500);
    }
    {
        if (world.rings.length < 100)
            world.rings.push({ ...target, color: "#89bcd1", radius: 130, life: 650, total: 650, inward: false });
    }
}`
  },
  {
    "version": 2,
    "id": "enlarge",
    "title": "Magnify",
    "subtitle": "Make room for possibility.",
    "school": "Transmutation",
    "icon": "orbs",
    "color": "#d4b574",
    "description": "Double the size of nearby conjurations, including slimes and glowing lights. Physical objects grow in substance; lights spread their glow farther.",
    "notes": "A larger slime is still two Fireballs away from oblivion. No conjuration can grow beyond the chamber’s limits.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
    {
        for (const body of world.objects)
            if (world.inRange(body, target, 130))
                world.resize(body, body.plugin.size * 2);
        for (const light of world.lights)
            if (Math.hypot(light.x - target.x, light.y - target.y) <= 130 + light.settings.radius)
                light.settings.radius = clamp(light.settings.radius * 2, 5, 500);
    }
    {
        if (world.rings.length < 100)
            world.rings.push({ ...target, color: "#d4b574", radius: 130, life: 650, total: 650, inward: false });
    }
}`
  },
  {
    "version": 2,
    "id": "ice-prison",
    "title": "Ice Prison",
    "subtitle": "Hold that thought.",
    "school": "Abjuration",
    "icon": "snowflake",
    "color": "#9cdeef",
    "description": "Seal nearby objects and creatures in still, crystalline ice. For ten seconds, nothing within can move or feed.\n\nThe prison thins as it thaws. Fire melts it faster.",
    "notes": "Each Fireball melts five seconds of ice. A surviving shell shields its contents from that blast.",
    "blocks": [],
    code: `export default function cast({ world, target, Matter }) {
    world.terrain.freeze(target, 155, 10000);
    for (const body of world.objects)
        if (world.inRange(body, target, 155)) {
            body.plugin.frozen = { remaining: 10000, total: 10000, color: "#9cdeef" };
            if (!body.isStatic)
                Matter.Body.setStatic(body, true);
        }
}`
  },
  {
    "version": 2,
    "id": "chain-lightning",
    "title": "Chain Lightning",
    "subtitle": "One bright thought leads to another.",
    "school": "Evocation",
    "icon": "bolt",
    "color": "#b9caff",
    "description": "A bolt leaps to the nearest visible target, then arcs through as many as four more nearby objects or creatures.\n\nEach creature takes twenty-five damage: half a Fireball’s bite.",
    "notes": "Each target is struck once per cast. Four hits defeat a healthy slime. The chain cannot see through black mist.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    world.lightning({ "radius": 140, "chainRadius": 240, "targets": 5, "damage": 25, "color": "#b9caff" }, target);
}`
  },
  {
    "version": 2,
    "id": "black-mist",
    "title": "Black Mist",
    "subtitle": "Let the room forget.",
    "school": "Illusion",
    "icon": "wind",
    "color": "#777184",
    "description": "Gather a dense, black gaseous cloud. It hides what lies inside and blocks a creature’s view through it.\n\nOver twelve seconds, its curling edges slowly dissolve.",
    "notes": "Slimes lose sight of concealed food. Chain Lightning loses its path; an aimed Fireball can still pass through.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    if (world.clouds.length < 24)
        world.clouds.push({ ...target, radius: 190, duration: 12000, started: world.time });
}`
  },
  {
    "version": 2,
    "id": "wellspring",
    "title": "Wellspring",
    "subtitle": "The stone remembers the river.",
    "school": "Conjuration",
    "icon": "wind",
    "color": "#65b9cf",
    "description": "Open a spring beneath the floor. Clear water wells up and spreads into a rippling pool, dividing around crates and finding its way through narrow gaps.",
    "notes": "A finite spring feeds a slow, shallow flood, then closes. Water dries over time, extinguishes fire, and freezes under Ice Prison. Cast again to replenish it.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    world.terrain.addWater(target, 1100, 3500);
}`
  },
  {
    "version": 2,
    "id": "unfold-chamber",
    "title": "Unfold the Chamber",
    "subtitle": "There is always another room.",
    "school": "Transmutation",
    "icon": "box",
    "color": "#c2ae7c",
    "description": "Touch the inside of a chamber wall and persuade the space beyond it to exist. Six new floor squares unfold outwards, opening a small alcove exactly where you cast.",
    "notes": "Aim within half a floor square of an exposed edge. Works on new alcoves too. Reset restores the original room. The chamber accepts up to 240 extra squares.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    if (!world.terrain.edge(target)) {
        throw new Error('Aim within half a floor square of an exposed edge.');
    }
    world.terrain.expand(target, 2);
}`
  },
  {
    "version": 2,
    "id": "wandering-meadow",
    "title": "Wandering Meadow",
    "subtitle": "Give the wilderness a foothold.",
    "school": "Verdancy",
    "icon": "leaf",
    "color": "#8bb15d",
    "description": "Wake a handful of seeds between the stones. Fine blades unfurl, sway, and send runners into the neighboring cracks. Left alone, the meadow slowly claims more of the chamber in ragged, branching patches.",
    "notes": "Growth follows open floor around obstacles. Fire runs through dry grass; water quenches it and ice arrests its growth. Unmake clears roots and blades.",
    "blocks": [],
    code: `export default function cast({ world, target }) {
    world.terrain.plant(target, 35, world.objects);
}`
  }
].map(s => spellSchema.parse(s));

// Add release entries here so saved tomes receive new spells without restoring deleted ones.
export const starterReleases = [
  { revision: 2, ids: ['hungry-slime', 'rainbow-light', 'shrink', 'enlarge'] },
  { revision: 3, ids: ['ice-prison', 'chain-lightning', 'black-mist'] },
  { revision: 4, ids: ['wellspring', 'unfold-chamber', 'wandering-meadow'] },
];
export const starterRevision = starterReleases.at(-1)!.revision;

export function newSpell(): Spell {
  return spellSchema.parse({ version: 2, id: `spell-${Date.now().toString(36)}`, title: 'A New Wonder', subtitle: 'Every great spell begins with a question.', school: 'Evocation', icon: 'sparkles', color: '#bb91c9', description: 'A scattering of violet starlight, called into the world by a curious hand.', notes: 'Make it your own.', code: `export default function cast({ world, target }) {
  world.burst(target, '#c5a0e5', 70, 4);
  world.rings.push({ ...target, color: '#c5a0e5', radius: 100,
    life: 900, total: 900, inward: false });
}` });
}
