import Matter from 'matter-js';
import * as elements from './elements';
import type { SpellEngine, Point } from './engine';

export type SpellEffect = {
  duration?: number;
  update?: (dt: number, age: number) => void;
  draw?: (ctx: CanvasRenderingContext2D, age: number, reducedMotion: boolean) => void;
  collision?: (pairs: Matter.Pair[]) => void;
  dispose?: () => void;
};
type LiveEffect = SpellEffect & { started: number; duration: number; stop: () => void; title: string };
export type SpellAPI = {
  world: SpellEngine;
  target: Point;
  caster: Point;
  Matter: typeof Matter;
  elements: typeof elements;
  effect: (effect: SpellEffect) => () => void;
  after: (delay: number, callback: () => void) => () => void;
};

// Compilation checks syntax without executing imported code. Execution happens only on cast.
// This is trusted local JavaScript, not a security sandbox.
export function compileSpell(code: string): (api: SpellAPI) => void {
  if (!/^\s*export\s+default\s+function\s+cast\s*\(/.test(code)) {
    throw new Error('Start the JavaScript with export default function cast(api) { … }.');
  }
  return new Function('api', '"use strict";\n' + code.replace(/export\s+default\s+/, '') + '\nreturn cast(api);') as (api: SpellAPI) => void;
}

export class SpellRuntime {
  effects = new Set<LiveEffect>();
  constructor(private world: SpellEngine) {}

  private fail(title: string, error: unknown) {
    this.world.castError = `${title}: ${error instanceof Error ? error.message : String(error)}`;
    this.world.onScriptError?.(this.world.castError);
  }

  cast(code: string, title: string, target: Point, caster: Point) {
    const owned = new Set<() => void>();
    const effect = (spec: SpellEffect) => {
      if (this.effects.size >= 256) throw new Error('Too many active spell effects. Reset the chamber.');
      const duration = spec.duration ?? 10000;
      if (!(duration >= 0)) throw new Error('Effect duration must be nonnegative milliseconds.');
      const item: LiveEffect = { ...spec, duration, title, started: this.world.time, stop: () => {
        if (!this.effects.delete(item)) return;
        owned.delete(item.stop);
        try { spec.dispose?.(); } catch (error) { this.fail(title, error); }
      } };
      owned.add(item.stop);
      this.effects.add(item);
      return item.stop;
    };
    const after = (delay: number, callback: () => void) => {
      if (!Number.isFinite(delay) || delay < 0) throw new Error('Delay must be finite, nonnegative milliseconds.');
      const stop = effect({ duration: Infinity, update: (_dt, age) => {
        if (age >= delay) { stop(); callback(); }
      } });
      return stop;
    };
    try {
      compileSpell(code)({ world: this.world, target: { ...target }, caster: { ...caster }, Matter, elements, effect, after });
      return true;
    } catch (error) {
      for (const stop of [...owned]) stop();
      this.fail(title, error);
      return false;
    }
  }

  private invoke(item: LiveEffect, callback: () => void) {
    try { callback(); } catch (error) { item.stop(); this.fail(item.title, error); }
  }
  update(dt: number) {
    for (const item of [...this.effects]) {
      if (!this.effects.has(item)) continue;
      const age = this.world.time - item.started;
      if (age >= item.duration) item.stop();
      else this.invoke(item, () => item.update?.(dt, age));
    }
  }
  draw(ctx: CanvasRenderingContext2D, reducedMotion: boolean) {
    for (const item of [...this.effects]) {
      if (!item.draw || !this.effects.has(item)) continue;
      ctx.save();
      this.invoke(item, () => item.draw!(ctx, this.world.time - item.started, reducedMotion));
      ctx.restore();
    }
  }
  collision(pairs: Matter.Pair[]) {
    for (const item of [...this.effects]) if (this.effects.has(item) && item.collision) this.invoke(item, () => item.collision!(pairs));
  }
  clear() { for (const item of [...this.effects]) item.stop(); }
}
