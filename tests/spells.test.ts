import { describe, expect, it, vi } from 'vitest';
import { parseSpell, spellSource, starterSpells } from '../src/spells';
import { SpellEngine } from '../src/engine';
import { loadLibrary, saveLibrary } from '../src/storage';

const legacyMetadata = (spell: typeof starterSpells[number]) => { const {code: _code, ...metadata}=spell; return {...metadata,version:1}; };
const step = (world: SpellEngine, frames = 90) => { for(let i=0;i<frames;i++)world.update(); };
describe('Living and persistent spells', () => {
  const spell = (id: string) => starterSpells.find(s => s.id === id)!;
  it('preserves gravity impulses on slimes and resizes independent light instances', () => {
    const w=new SpellEngine(false); w.cast(spell('hungry-slime'),{x:500,y:500});step(w,10);
    w.cast(spell('gravitic-grasp'),{x:700,y:500});step(w,1);expect(w.objects[0].velocity.x).toBeGreaterThan(5);
    step(w,10);w.cast(spell('rainbow-light'),{x:700,y:500});step(w,10);
    w.cast(spell('shrink'),{x:700,y:500});step(w,10);expect(w.lights[0].settings.radius).toBe(75);
    w.cast(spell('rainbow-light'),{x:1000,y:500});step(w,1);expect(w.lights[1].settings.radius).toBe(150);w.destroy();
  });
  it('freezes movement, melts ice with fire, chains half-damage hits, and conceals targets', () => {
    const w=new SpellEngine(false);
    for(const x of [600,800,1000]){w.cast(spell('hungry-slime'),{x,y:500});step(w,10);}
    w.cast(spell('chain-lightning'),{x:600,y:500});step(w,10);
    expect(w.objects.map(b=>b.plugin.creature.hp)).toEqual([75,75,75]);expect(w.arcs).toHaveLength(3);
    const body=w.objects[0];w.cast(spell('ice-prison'),{...body.position});step(w,10);const position={...body.position};
    step(w,30);expect(body.position).toEqual(position);expect(body.isStatic).toBe(true);
    w.cast(spell('fireball'),position);step(w,60);expect(body.plugin.frozen.remaining).toBeLessThan(5000);expect(body.plugin.creature.hp).toBe(75);
    step(w,240);expect(body.isStatic).toBe(false);
    w.cast(spell('black-mist'),{...body.position});step(w,10);expect(w.canSee({x:700,y:810},body.position)).toBe(false);
    step(w,730);expect(w.clouds).toHaveLength(0);expect(w.canSee({x:700,y:810},body.position)).toBe(true);w.destroy();
  });
  it('leaves a slime at half health after one fireball and kills it with two', () => {
    const w = new SpellEngine(false); w.cast(spell('hungry-slime'), {x:700,y:500}); step(w,10);
    w.cast(spell('fireball'), {...w.objects[0].position}); step(w,60);
    expect(w.objects).toHaveLength(1); expect(w.objects[0].plugin.creature.hp).toBe(50);
    w.cast(spell('fireball'), {...w.objects[0].position}); step(w,60);
    expect(w.objects).toHaveLength(0); w.destroy();
  });
  it('slides toward food and consumes it gradually', () => {
    const w = new SpellEngine(false); w.cast(spell('wooden-box'), {x:700,y:500}); step(w,30);
    const crate = w.objects[0]; w.cast(spell('hungry-slime'), {x:600,y:500}); step(w,120);
    expect(w.objects).toHaveLength(2); expect(crate.plugin.size).toBeLessThan(34);
    expect(w.objects[1].position.x).toBeGreaterThan(600);
    step(w,600); expect(w.objects).toHaveLength(1); expect(w.objects[0].plugin.creature).toBeDefined(); w.destroy();
  });
  it('creates a particle-free light that expires after five seconds', () => {
    const w = new SpellEngine(false); w.cast(spell('rainbow-light'), {x:700,y:500}); step(w,240);
    expect(w.lights).toHaveLength(1); expect(w.particles).toHaveLength(0);
    step(w,62); expect(w.lights).toHaveLength(0); w.destroy();
  });
  it('resizes physical geometry and creatures without changing their health', () => {
    const w = new SpellEngine(false); w.cast(spell('hungry-slime'), {x:700,y:500}); step(w,10);
    const body = w.objects[0], area = body.area;
    w.cast(spell('shrink'), {...body.position}); step(w,10);
    expect(body.area).toBeCloseTo(area / 4); expect(body.plugin.size).toBe(16);
    w.cast(spell('enlarge'), {...body.position}); step(w,10);
    expect(body.area).toBeCloseTo(area); expect(body.plugin.creature.hp).toBe(100); w.destroy();
  });
});
it('upgrades saved tomes to eight slots without replacing edits or restoring deleted additions', () => {
  const edited = {...starterSpells[0], title: 'My Fireball'};
  let saved = JSON.stringify({version:1, spells:[edited, ...starterSpells.slice(1,5)], slots:['iron-orbit','fireball','wooden-box','unmake']});
  vi.stubGlobal('localStorage', {getItem:()=>saved, setItem:(_:string, value:string)=>{saved=value;}});
  try {
    const library = loadLibrary();
    expect(library.spells).toHaveLength(starterSpells.length); expect(library.spells[0].title).toBe('My Fireball');
    expect(library.slots).toEqual(['iron-orbit','fireball','wooden-box','unmake','hungry-slime','rainbow-light','shrink','enlarge']);
    saveLibrary({...library, spells:library.spells.filter(s=>s.id!=='hungry-slime')});
    expect(loadLibrary().spells.some(s=>s.id==='hungry-slime')).toBe(false);
  } finally { vi.unstubAllGlobals(); }
});
describe('Spell import boundary',()=>{
  it('accepts every starter spell as a pasted JSON code fence',()=>{for(const spell of starterSpells)expect(parseSpell('```json\n'+JSON.stringify(spell)+'\n```')).toEqual(spell);});
  it('rejects missing spell headers, invalid legacy actions, and unsafe images',()=>{
    expect(()=>parseSpell('alert(1)')).toThrow();
    for(const action of [{type:'eval',code:'alert(1)'},{type:'burst',color:'#ffffff',count:999999}])expect(()=>parseSpell(JSON.stringify({...legacyMetadata(starterSpells[0]),actions:[action]}))).toThrow();
    expect(()=>parseSpell(JSON.stringify({...starterSpells[0],blocks:[{id:'x',kind:'image',content:'javascript:alert(1)',placement:'after'}]}))).toThrow();
  });
  it('round trips executable JavaScript without changing it',()=>{
    for (const spell of starterSpells) expect(parseSpell('```javascript\n'+spellSource(spell)+'\n```')).toEqual(spell);
  });
});
describe('Chamber behavior',()=>{
  it('conjures one crate and seven physical spheres',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);expect(w.objects).toHaveLength(1);w.cast(starterSpells[2],{x:800,y:500});step(w);expect(w.objects).toHaveLength(8);expect(w.objects.filter(b=>b.circleRadius)).toHaveLength(7);w.destroy();});
  it('pulls objects toward the selected point',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);w.cast(starterSpells[3],{x:700,y:500});step(w,1);expect(w.objects[0].velocity.x).toBeGreaterThan(0);w.destroy();});
  it('unmakes objects intersecting an area while preserving walls and distant objects',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);w.cast(starterSpells[1],{x:1100,y:500});step(w);w.cast(starterSpells[4],{x:500,y:500});step(w);expect(w.objects).toHaveLength(1);expect(w.objects[0].position.x).toBeGreaterThan(1000);expect(w.engine.world.bodies.filter(b=>b.isStatic)).toHaveLength(4);w.destroy();});
  it('fireballs ignite wood before it burns away',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:700,y:500});step(w);w.cast(starterSpells[0],{x:700,y:500});step(w);expect(w.projectiles).toHaveLength(0);expect(w.objects).toHaveLength(1);expect(w.objects[0].plugin.fuel.burning).toBe(true);step(w,600);expect(w.objects).toHaveLength(0);w.destroy();});
  it('enforces resource bounds and clears pending casts on reset',()=>{const w=new SpellEngine(false);const spell=parseSpell(JSON.stringify({...legacyMetadata(starterSpells[1]),actions:[{type:'spawn',count:20},{type:'burst',color:'#ffffff',count:160}]}));for(let i=0;i<25;i++){w.cast(spell,{x:700,y:500});step(w,10);}expect(w.objects.length).toBeLessThanOrEqual(250);expect(w.particles.length).toBeLessThanOrEqual(2000);w.cast(starterSpells[1],{x:700,y:500});w.clear();step(w);expect(w.objects).toHaveLength(0);expect(w.scripts.effects.size).toBe(0);w.destroy();});
  it('expires temporary objects and rejects casts outside the walls',()=>{const w=new SpellEngine(false);const spell=parseSpell(JSON.stringify({...legacyMetadata(starterSpells[1]),actions:[{type:'spawn',lifetime:200}]}));expect(w.cast(spell,{x:-10,y:500})).toBe(false);w.cast(spell,{x:700,y:500});step(w,2);expect(w.objects).toHaveLength(1);step(w,20);expect(w.objects).toHaveLength(0);w.destroy();});
});
