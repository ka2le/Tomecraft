import { describe, expect, it, vi } from 'vitest';
import Matter from 'matter-js';
import { SpellEngine } from '../src/engine';
import { parseSpell, spellSource, starterSpells, spellSchema } from '../src/spells';
import { actionSchema } from '../src/legacySpells';
import { loadLibrary, saveLibrary } from '../src/storage';

const custom = (code: string) => ({ ...starterSpells[0], id: 'new-behavior', code });
describe('JavaScript spell runtime', () => {
  it('imports without execution, saves exact code and reports syntax errors', () => {
    const code = 'export default function cast() { globalThis.spellExecuted = true; }';
    const spell = parseSpell('```javascript\n'+spellSource(custom(code))+'\n```');
    expect(Reflect.get(globalThis, 'spellExecuted')).toBeUndefined();
    expect(spell.code).toBe(code);
    let saved: string | null = null;
    vi.stubGlobal('localStorage', { getItem: () => saved, setItem: (_key: string, value: string) => { saved=value; } });
    try { saveLibrary({spells:[spell],slots:[spell.id]}); expect(loadLibrary().spells[0]).toEqual(spell); }
    finally { vi.unstubAllGlobals(); }
    expect(() => parseSpell(spellSource(custom('export default function cast() { broken syntax }')))).toThrow();
    expect(parseSpell(spellSource({...spell,notes:'Preserve */ in metadata'})).notes).toBe('Preserve */ in metadata');
  });

  it('executes new physics, timed callbacks, collision and custom drawing with reset cleanup', () => {
    const world = new SpellEngine(false);
    const code = `export default function cast({world, target, Matter, effect, after}) {
      const body = Matter.Bodies.polygon(target.x, target.y, 5, 20);
      body.plugin = { material: 'metal', color: '#abcdef', size: 20, shape: 'box', expires: 0 };
      Matter.Composite.add(world.engine.world, body);
      effect({duration: 1000,
        update(dt) { Matter.Body.setAngularVelocity(body, dt / 1000); },
        draw(ctx) { ctx.fillRect(target.x, target.y, 17, 23); },
        collision(pairs) { body.plugin.contacts = pairs.length; },
        dispose() { Matter.Composite.remove(world.engine.world, body); }
      });
      after(30, () => { body.plugin.custom = 'a wholly new behavior'; });
      after(500, () => { throw new Error('should be canceled'); });
    }`;
    expect(world.cast(parseSpell(spellSource(custom(code))),{x:500,y:500})).toBe(true);
    const body = world.objects[0];
    world.update(); world.update();
    expect(body.angularVelocity).toBeGreaterThan(0);
    expect(body.plugin.custom).toBe('a wholly new behavior');
    Matter.Events.trigger(world.engine, 'collisionStart', {pairs:[{}]});
    expect(body.plugin.contacts).toBe(1);
    const ctx = {save:vi.fn(),restore:vi.fn(),fillRect:vi.fn()};
    world.scripts.draw(ctx as unknown as CanvasRenderingContext2D, false);
    expect(ctx.fillRect).toHaveBeenCalledWith(500,500,17,23);
    world.clear();
    for(let i=0;i<40;i++)world.update();
    expect(world.objects).toHaveLength(0);
    expect(world.scripts.effects.size).toBe(0);
    expect(world.castError).toBe('');
    world.destroy();
  });

  it('cleans expired and failed effects and lets other spells continue', () => {
    const world=new SpellEngine(false), error=vi.fn();world.onScriptError=error;
    world.cast(custom(`export default function cast({world,effect}) {
      effect({duration: 20, dispose() { world.rings.push({x:0,y:0,color:'#ffffff',radius:10,life:1000,total:1000,inward:false,cleaned:true}); }});
      effect({update() { throw new Error('broken spell'); }});
    }`),{x:500,y:500});
    world.update();world.update();
    expect(world.scripts.effects.size).toBe(0);
    expect(error).toHaveBeenCalledWith(expect.stringContaining('broken spell'));
    expect(world.rings[0]).toMatchObject({cleaned:true});
    world.destroy();
  });

  it('migrates every old effect type into executable source and preserves edited metadata', () => {
    const {code: _code,...metadata}=starterSpells[0];
    const actions = [
      {type:'water'}, {type:'expand'}, {type:'grass'}, {type:'freeze',radius:100},
      {type:'lightning'}, {type:'cloud',radius:100}, {type:'creature'},
      {type:'light',radius:100}, {type:'resize',radius:100,factor:2},
      {type:'spawn'}, {type:'burst',color:'#ffffff'}, {type:'ring',color:'#ffffff',radius:100},
      {type:'force',radius:100}, {type:'remove',radius:100}, {type:'projectile',color:'#ffffff'}
    ];
    for(const input of actions){
      const spell=spellSchema.parse({...metadata,version:1,title:'My edited spell',actions:[actionSchema.parse(input)]});
      expect(spell.title).toBe('My edited spell');expect(spell.version).toBe(2);
      const world=new SpellEngine(false);
      const target=input.type==='expand'?{x:30,y:500}:{x:500,y:500};
      expect(world.cast(spell,target),`${input.type}: ${world.castError}`).toBe(true);
      world.update();expect(world.castError).toBe('');world.destroy();
    }
  });
});
