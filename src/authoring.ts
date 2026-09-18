import engineSource from './engine.ts?raw';
import terrainSource from './terrain.ts?raw';
import elementSource from './elements.ts?raw';
import runtimeSource from './spellRuntime.ts?raw';
import { spellSource, starterSpells } from './spells';

const customExample = `/* @spell
{
  "id": "clockwork-procession", "title": "Clockwork Procession",
  "subtitle": "The stones learn a new dance.", "school": "Kinesis",
  "icon": "orbs", "color": "#b99ddb",
  "description": "Nearby objects follow a rotating figure eight for eight seconds.",
  "notes": "Frozen objects hold still. Each casting remembers its own dancers.",
  "blocks": []
}
*/
export default function cast({ world, target, Matter, effect }) {
  const dancers = world.objects.filter(body => world.inRange(body, target, 220));
  effect({
    duration: 8000,
    update(dt, age) {
      const alive = new Set(world.objects);
      dancers.forEach((body, i) => {
        if (!alive.has(body) || body.isStatic) return;
        const phase = age / 900 + i * Math.PI * 2 / dancers.length;
        const destination = { x: target.x + Math.sin(phase) * 125,
          y: target.y + Math.sin(phase * 2) * 65 };
        if (!world.terrain.contains(destination, body.plugin.size + 5)) return;
        Matter.Sleeping.set(body, false);
        const blend = 1 - Math.exp(-dt / 120);
        Matter.Body.setVelocity(body, {
          x: body.velocity.x * (1 - blend) + (destination.x - body.position.x) * 0.05 * blend,
          y: body.velocity.y * (1 - blend) + (destination.y - body.position.y) * 0.05 * blend
        });
      });
    },
    draw(ctx, age, reducedMotion) {
      ctx.strokeStyle = '#b99ddb';
      ctx.globalAlpha = (1 - age / 8000) * 0.65;
      ctx.lineWidth = 2;
      ctx.beginPath();
      for (let i = 0; i <= 100; i++) {
        const t = i / 100 * Math.PI * 2;
        const x = target.x + Math.sin(t) * 125;
        const y = target.y + Math.sin(t * 2) * 65;
        if (i === 0) ctx.moveTo(x, y); else ctx.lineTo(x, y);
      }
      ctx.stroke();
      if (!reducedMotion) {
        ctx.fillStyle = '#ffffff';
        ctx.beginPath();
        ctx.arc(target.x + Math.sin(age / 900) * 125,
          target.y + Math.sin(age / 450) * 65, 4, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  });
}`;

export const AUTHORING_PROMPT = `Write an original Tomecraft spell matching my idea. Return ONE javascript code block containing a JSON metadata comment and executable JavaScript, in the exact format of the examples below. The JavaScript implements the spell; there is no action list, DSL, or fixed menu of allowed behaviors.

FORMAT
Start with /* @spell { JSON metadata } */ followed by export default function cast(api) { ... }.
Metadata: unique lowercase/hyphen id (max 64), title (80), subtitle (100), school (40), icon, six-digit hex color, description (3000), notes (3000), blocks (optional notes/images). Icons: flame, box, orbs, magnet, eraser, sparkles, wind, moon, snowflake, bolt, shield, leaf.
Use plain JavaScript, not TypeScript. No imports or other exports. Put helpers inside cast or declare functions after it. Each cast creates fresh local state; closures preserve it while effects live. Do not put work outside functions. Do not return a JSON string containing escaped JavaScript.

RUNTIME
cast receives { world, target, caster, Matter, elements, effect, after }.
world is the ACTUAL SpellEngine instance below, not a restricted wrapper. Matter is the full Matter.js 0.20 library. elements contains the shared functions below. target/caster are {x,y} world coordinates. The initial room is 1400 by 1000 with zero gravity; terrain can expand. Y increases downward. world.time, delays, durations, dt and age use milliseconds; physics velocities are per Matter step (about 16.67ms).
Use existing methods for shared interactions or implement completely new behavior with arbitrary JavaScript, new physics bodies/constraints, custom state, collision responses and Canvas 2D drawing. You do NOT need a new engine action or app release. All settings passed to engine helpers must be supplied explicitly: there is no schema injecting defaults into JavaScript.

effect({ duration, update(dt, age), draw(ctx, age, reducedMotion), collision(pairs), dispose() }) registers any combination of callbacks and returns a stop function. duration defaults to 10000; Infinity lasts until stopped or reset. Update runs before physics; collisions are Matter collisionStart pairs; draw uses world coordinates above objects and below concealing clouds. Each drawing callback has canvas save/restore. dispose runs once on expiry, stop, reset, or callback error. Do not leave unbalanced ctx.save calls. after(ms, callback) schedules a one-shot callback in simulation time and returns a cancel function. These hooks pause with the chamber and are canceled on reset/exit. Use them instead of setTimeout, requestAnimationFrame, or unmanaged Matter event listeners. At most 256 active callbacks/effects.

Use body.plugin = { material, color, size, shape, expires } on custom bodies so normal rendering and elemental interactions work (expires is an absolute world.time deadline, or 0; shape is circle or box). For custom visuals, use effect.draw. Use effect.dispose to remove custom constraints/resources. Check objects still exist before manipulating retained body references. Honor frozen/static bodies. world.objects includes dynamic and ice-frozen bodies; walls are excluded. Use Matter.Composite.allBodies for other custom static geometry. Avoid modifying engine methods globally. Maintain water/fire/ice interactions using the shared terrain and elemental routines. Keep per-frame work bounded and honor reducedMotion for purely decorative movement.

This is trusted JavaScript executed in the page when cast, not a security sandbox. Do not access the DOM, storage, network or browser globals; implement the spell using the supplied simulation API. Syntax is checked on import without executing code. Runtime exceptions are shown in the chamber. Infinite loops cannot be interrupted: always bound loops.

The following is the actual current application source, supplied as implementation reference. It is TypeScript; translate any snippets you use into JavaScript. Do not reproduce the application itself in your answer. You can read and modify the live simulation data and use the complete Matter library.

=== TRAINING ROOM: src/engine.ts ===
${engineSource}

=== TERRAIN: src/terrain.ts ===
${terrainSource}

=== SHARED ELEMENTAL RULES: src/elements.ts ===
${elementSource}

=== SCRIPT LIFECYCLE: src/spellRuntime.ts ===
${runtimeSource}

=== CURRENT SPELLS: contrasting working implementations ===
${starterSpells.filter(s => ['fireball', 'wooden-box', 'hungry-slime', 'ice-prison', 'chain-lightning', 'wellspring', 'unfold-chamber', 'wandering-meadow', 'rainbow-light'].includes(s.id)).map(spellSource).join('\n\n')}

=== NEW BEHAVIOR EXAMPLE: custom motion and rendering, no predefined effect ===
${customExample}

Now implement my spell idea. Return the complete metadata header and executable JavaScript together, ready to paste into Spell code.
`;
