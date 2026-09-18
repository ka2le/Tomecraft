import { z } from 'zod';
const color = z.string().regex(/^#[0-9a-f]{6}$/i, 'Use a six-digit hex color');
const delay = z.number().min(0).max(3000).default(0);
const radius = z.number().min(5).max(500);
const base = { delay };
export const actionSchema = z.discriminatedUnion('type', [
  z.object({ ...base, type: z.literal('water'), amount: z.number().min(100).max(3000).default(1100), duration: z.number().min(500).max(10000).default(3500) }).strict(),
  z.object({ ...base, type: z.literal('expand'), depth: z.number().int().min(1).max(3).default(2) }).strict(),
  z.object({ ...base, type: z.literal('grass'), radius: z.number().min(10).max(100).default(35) }).strict(),
  z.object({ ...base, type: z.literal('freeze'), radius, duration: z.number().min(500).max(60000).default(10000), color: color.default('#9cdeef') }).strict(),
  z.object({ ...base, type: z.literal('lightning'), radius: radius.default(140), chainRadius: radius.default(240), targets: z.number().int().min(1).max(20).default(5), damage: z.number().min(0).max(1000).default(25), color: color.default('#b9caff') }).strict(),
  z.object({ ...base, type: z.literal('cloud'), radius, duration: z.number().min(500).max(60000).default(12000) }).strict(),
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

export type Action = z.infer<typeof actionSchema>;

const implementations: Record<Action['type'], string> = {
  "water": "world.terrain.addWater(target,action.amount,action.duration); return;",
  "expand": "if (!world.terrain.edge(target)) throw new Error('Aim within half a floor square of an exposed edge.'); world.terrain.expand(target,action.depth); return;",
  "grass": "world.terrain.plant(target,action.radius,world.objects); return;",
  "freeze": "world.terrain.freeze(target,action.radius,action.duration);\n        for (const body of world.objects) if (world.inRange(body, target, action.radius)) {\n          (body.plugin).frozen = { remaining: action.duration, total: action.duration, color: action.color };\n          if (!body.isStatic) Body.setStatic(body, true);\n        }\n        return;",
  "cloud": "if (world.clouds.length < 24) world.clouds.push({ ...target, radius: action.radius, duration: action.duration, started: world.time }); return;",
  "lightning": "world.lightning(action, target); return;",
  "creature": "if (world.objects.length >= 250) return;\n        if(!world.terrain.contains(target,action.size+5)) return;\n        const body = Bodies.circle(target.x, target.y, action.size, { frictionAir: .12, restitution: .1, inertia: Infinity });\n        body.plugin = { material: 'slime', color: action.color, size: action.size, shape: 'circle', expires: action.lifetime ? world.time + action.lifetime : 0, creature: { hp: action.hp, maxHp: action.hp, speed: action.speed, consumeRadius: action.consumeRadius, consumeTime: action.consumeTime, meals: new Map() } };\n        Composite.add(world.engine.world, body); return;",
  "light": "if (world.lights.length < 32) world.lights.push({ ...target, action: { ...action }, started: world.time }); return;",
  "resize": "for (const body of world.objects) if (world.inRange(body, target, action.radius)) world.resize(body, (body.plugin).size * action.factor);\n        for (const light of world.lights) if (Math.hypot(light.x-target.x, light.y-target.y) <= action.radius + light.action.radius) light.action.radius = clamp(light.action.radius * action.factor, 5, 500);\n        return;",
  "spawn": "world.spawn(action, target); return;",
  "burst": "world.burst(target, action.color, action.count, action.speed, action.size, action.lifetime, action.gravity); return;",
  "ring": "if (world.rings.length < 100) world.rings.push({...target, color:action.color, radius:action.radius, life:action.duration, total:action.duration, inward:inward}); return;",
  "force": "world.force(target, action.radius, action.strength, action.mode); return;",
  "remove": "world.remove(target, action.radius); return;",
  "projectile": "if (world.projectiles.length < 24) world.projectiles.push({...CASTER, target, action}); return;"
};

export function legacyCode(actions: Action[]): string {
  const inward = actions.some(a => a.type === 'force' && a.mode === 'pull');
  const statements = actions.map(action => {
    const {type, delay, ...options} = action;
    const settings = options as Record<string, unknown>;
    const body = implementations[type].replace(/return;\s*$/, '').trim()
      .replace('target, action}', 'target, action: action}')
      .replace('...action', '...' + JSON.stringify(options))
      .replace(/(?<!\.)\baction\.(\w+)/g, (_, key: string) => JSON.stringify(settings[key]))
      .replace(/(?<!\.)\baction\b(?!\s*:)/g, JSON.stringify(options))
      .replace(/inward:inward/g, `inward:${inward}`)
      .replace(/\b(Bodies|Body|Composite)\b/g, 'Matter.$1')
      .replace(/\bCASTER\b/g, 'caster')
      .replace(/\baction\b/g, 'settings');
    return delay ? `after(${delay}, () => {\n${body}\n});` : `{\n${body}\n}`;
  });
  return `export default function cast({ world, target, caster, Matter, after }) {
  const clamp = (v, min, max) => Math.min(max, Math.max(min, v));
${statements.join('\n').split('\n').map(line => '  ' + line).join('\n')}
}`;
}
