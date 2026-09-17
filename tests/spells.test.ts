import { describe, expect, it } from 'vitest';
import { parseSpell, runesFor, starterSpells } from '../src/spells';
import { SpellEngine } from '../src/engine';

const step = (world: SpellEngine, frames = 90) => { for(let i=0;i<frames;i++)world.update(); };
describe('Spellscript boundary',()=>{
  it('accepts every starter spell as a pasted JSON code fence',()=>{for(const spell of starterSpells)expect(parseSpell('```json\n'+JSON.stringify(spell)+'\n```')).toEqual(spell);});
  it('rejects arbitrary code, unknown actions, excessive particles, and unsafe images',()=>{
    expect(()=>parseSpell('alert(1)')).toThrow();
    for(const action of [{type:'eval',code:'alert(1)'},{type:'burst',color:'#ffffff',count:999999}])expect(()=>parseSpell(JSON.stringify({...starterSpells[0],actions:[action]}))).toThrow();
    expect(()=>parseSpell(JSON.stringify({...starterSpells[0],blocks:[{id:'x',kind:'image',content:'javascript:alert(1)',placement:'after'}]}))).toThrow();
  });
  it('encodes signed and fractional parameters without invalid glyphs',()=>{
    const spell=starterSpells[4];const runes=runesFor(spell);expect(runes.join('')).not.toMatch(/undefined|NaN/);expect(runes).toEqual(runesFor(structuredClone(spell)));
    expect(runesFor({...spell,actions:spell.actions.map(a=>a.type==='burst'?{...a,gravity:-.02}:a)})).not.toEqual(runes);
  });
});
describe('Chamber behavior',()=>{
  it('conjures one crate and seven physical spheres',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);expect(w.objects).toHaveLength(1);w.cast(starterSpells[2],{x:800,y:500});step(w);expect(w.objects).toHaveLength(8);expect(w.objects.filter(b=>b.circleRadius)).toHaveLength(7);w.destroy();});
  it('pulls objects toward the selected point',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);w.cast(starterSpells[3],{x:700,y:500});step(w,1);expect(w.objects[0].velocity.x).toBeGreaterThan(0);w.destroy();});
  it('unmakes objects intersecting an area while preserving walls and distant objects',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:500,y:500});step(w);w.cast(starterSpells[1],{x:1100,y:500});step(w);w.cast(starterSpells[4],{x:500,y:500});step(w);expect(w.objects).toHaveLength(1);expect(w.objects[0].position.x).toBeGreaterThan(1000);expect(w.engine.world.bodies.filter(b=>b.isStatic)).toHaveLength(4);w.destroy();});
  it('fireballs reach the target and destroy wood',()=>{const w=new SpellEngine(false);w.cast(starterSpells[1],{x:700,y:500});step(w);w.cast(starterSpells[0],{x:700,y:500});step(w);expect(w.projectiles).toHaveLength(0);expect(w.objects).toHaveLength(0);w.destroy();});
  it('enforces resource bounds and clears pending casts on reset',()=>{const w=new SpellEngine(false);const spell=parseSpell(JSON.stringify({...starterSpells[1],actions:[{type:'spawn',count:20},{type:'burst',color:'#ffffff',count:160}]}));for(let i=0;i<25;i++){w.cast(spell,{x:700,y:500});step(w,10);}expect(w.objects.length).toBeLessThanOrEqual(250);expect(w.particles.length).toBeLessThanOrEqual(2000);w.cast(starterSpells[1],{x:700,y:500});w.clear();step(w);expect(w.objects).toHaveLength(0);expect(w.pending).toHaveLength(0);w.destroy();});
  it('expires temporary objects and rejects casts outside the walls',()=>{const w=new SpellEngine(false);const spell=parseSpell(JSON.stringify({...starterSpells[1],actions:[{type:'spawn',lifetime:200}]}));expect(w.cast(spell,{x:-10,y:500})).toBe(false);w.cast(spell,{x:700,y:500});step(w,2);expect(w.objects).toHaveLength(1);step(w,20);expect(w.objects).toHaveLength(0);w.destroy();});
});
