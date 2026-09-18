import Matter from 'matter-js';
import type { Spell } from './spells';
import { SpellRuntime } from './spellRuntime';
import { Terrain } from './terrain';
import { burnFuel, drawFlame, drawIce, newFuel } from './elements';
import type { Fuel } from './elements';

const { Engine, Bodies, Body, Composite } = Matter;
export const ROOM = { width: 1400, height: 1000 };
export const CASTER = { x: 700, y: 810 };
export type Point = { x: number; y: number };
type SpawnSettings = { shape: 'box' | 'circle'; material: 'wood' | 'metal' | 'stone' | 'crystal' | 'ice'; count: number; size: number; spread: number; lifetime: number; color?: string };
type ProjectileSettings = { color: string; speed: number; radius: number; power: number; damage: number; particles: number };
type GlowSettings = { color: string; rainbow: boolean; radius: number; duration: number; flicker: number };
type LightningSettings = { radius: number; chainRadius: number; targets: number; damage: number; color: string };
type Particle = Point & { vx: number; vy: number; color: string; size: number; life: number; total: number; gravity: number };
type Ring = Point & { radius: number; life: number; total: number; color: string; inward: boolean };
type Projectile = Point & { target: Point; settings: ProjectileSettings };
type Creature = { hp: number; maxHp: number; speed: number; consumeRadius: number; consumeTime: number; meals: Map<number, { elapsed: number; size: number }> };
type ObjectData = { material: string; color: string; size: number; expires: number; shape: string; anchored?: boolean; creature?: Creature; fuel?: Fuel; frozen?: { remaining: number; total: number; color: string } };
type Glow = Point & { settings: GlowSettings; started: number };
type Cloud = Point & { radius: number; duration: number; started: number };
type Arc = { points: Point[]; color: string; life: number };
export const materialColors: Record<string, string> = { wood: '#90704a', metal: '#a5b0b1', stone: '#76766e', crystal: '#b28ed4', ice: '#92d2de' };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class SpellEngine {
  engine = Engine.create({ gravity: {x: 0, y: 0, scale: 0}, enableSleeping: true });
  terrain = new Terrain(this.engine.world);
  castError = '';
  particles: Particle[] = [];
  rings: Ring[] = [];
  projectiles: Projectile[] = [];
  scripts = new SpellRuntime(this);
  onScriptError?: (message: string) => void;
  lights: Glow[] = [];
  clouds: Cloud[] = [];
  arcs: Arc[] = [];
  time = 0;
  lastCast = -1000;
  casts = 0;
  private fireClock = 0;
  constructor(seed = true) {
    Matter.Events.on(this.engine, 'collisionStart', event => this.scripts.collision(event.pairs));
    if (seed) this.seed();
  }
  get objects() { return Composite.allBodies(this.engine.world).filter(b => !b.isStatic || (b.plugin as ObjectData).frozen); }
  seed() {
    const wood = { shape: 'box', material: 'wood', count: 1, size: 34, spread: 0, lifetime: 0 } as const;
    for (const p of [{x:520,y:410}, {x:596,y:420}, {x:550,y:486}]) this.spawn(wood,p);
    this.spawn({ ...wood, shape: 'circle', material: 'metal', count: 7, size: 11, spread: 55 }, {x:900,y:455});
  }
  clear() {
    this.scripts.clear();
    Composite.clear(this.engine.world, false);
    this.particles = []; this.rings = []; this.projectiles = []; this.lights = [];
    this.clouds = []; this.arcs = [];
    this.terrain.reset();
  }
  destroy() { this.clear(); Matter.Events.off(this.engine, 'collisionStart'); Engine.clear(this.engine); Composite.clear(this.engine.world, false); }
  cast(spell: Spell, target: Point): boolean {
    this.castError = '';
    if (this.time - this.lastCast < 140 || this.projectiles.length >= 24) return false;
    if (!this.terrain.contains(target, 5)) { this.castError = 'Aim inside the chamber walls.'; return false; }
    this.lastCast = this.time;
    const success = this.scripts.cast(spell.code, spell.title, target, CASTER);
    if (success) this.casts++;
    return success;
  }
  spawn(settings: SpawnSettings, target: Point) {
    const available = 250 - this.objects.length;
    for (let i = 0; i < Math.min(settings.count, available); i++) {
      const angle = i * Math.PI * 2 / settings.count + .3;
      const distance = settings.count === 1 ? 0 : Math.max(settings.spread, settings.size * Math.sqrt(settings.count));
      const b=this.terrain.bounds, margin=settings.size*1.5+5;
      const x = clamp(target.x + Math.cos(angle) * distance, b.minX+margin, b.maxX-margin);
      const y = clamp(target.y + Math.sin(angle) * distance, b.minY+margin, b.maxY-margin);
      if(!this.terrain.contains({x,y},margin)) continue;
      const options = { restitution: settings.material === 'metal' ? .72 : .4, frictionAir: .022, friction: .25, density: settings.material === 'metal' ? .006 : .001, angle: settings.shape === 'box' ? (Math.random() - .5) * .24 : 0 };
      const body = settings.shape === 'circle' ? Bodies.circle(x, y, settings.size, options) : Bodies.rectangle(x,y,settings.size * 2,settings.size * 2,{...options, chamfer: {radius: 3}});
      body.plugin = { material: settings.material, size: settings.size, color: settings.color || materialColors[settings.material], expires: settings.lifetime ? this.time + settings.lifetime : 0, shape: settings.shape } satisfies ObjectData;
      Composite.add(this.engine.world, body);
    }
  }
  burst(target: Point, color: string, count = 50, speed = 3, size = 3, lifetime = 900, gravity = 0) {
    count = Math.min(count, 2000 - this.particles.length);
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2, v = speed * (.25 + Math.random() * .75);
      const life = lifetime * (.45 + Math.random() * .55);
      this.particles.push({ ...target, vx: Math.cos(angle) * v, vy: Math.sin(angle) * v, color, size: size * (.3 + Math.random() * .7), life, total: life, gravity });
    }
  }
  force(target: Point, radius: number, strength: number, mode: 'pull' | 'push' | 'orbit') {
    this.terrain.force(target,radius,strength,mode);
    for (const body of this.objects) {
      if (body.isStatic || (body.plugin as ObjectData).anchored) continue;
      const dx = target.x - body.position.x, dy = target.y - body.position.y, distance = Math.hypot(dx, dy);
      if (distance > radius || distance < .1) continue;
      const power = strength * 9 * (.25 + .75 * (1 - distance / radius));
      const nx = dx / distance, ny = dy / distance;
      const vx = mode === 'orbit' ? -ny : nx * (mode === 'pull' ? 1 : -1);
      const vy = mode === 'orbit' ? nx : ny * (mode === 'pull' ? 1 : -1);
      Matter.Sleeping.set(body, false);
      Body.setVelocity(body, {x: clamp(body.velocity.x + vx * power, -20, 20), y: clamp(body.velocity.y + vy * power, -20, 20)});
    }
  }
  remove(target: Point, radius: number) {
    this.terrain.remove(target,radius);
    // Floor enchantments are chamber state rather than bodies, so Unmake must
    // clear them here as well. This also upgrades existing saved Unmake spells.
    const mosaic = (this.terrain as any).__mosaicFloorState;
    if (mosaic) for (const [id, tile] of mosaic.tiles)
      if (Math.hypot(tile.x * 100 + 50 - target.x, tile.y * 100 + 50 - target.y) <= radius)
        mosaic.tiles.delete(id);
    for (const body of this.objects) {
      const data = body.plugin as ObjectData;
      const nearest = { x: clamp(target.x, body.bounds.min.x, body.bounds.max.x), y: clamp(target.y, body.bounds.min.y, body.bounds.max.y) };
      if (Math.hypot(nearest.x - target.x, nearest.y - target.y) <= radius) {
        this.burst(body.position, data.color, 14, 2.5, 3, 800);
        Composite.remove(this.engine.world, body);
      }
    }
  }
  inRange(body: Matter.Body, target: Point, radius: number) {
    return Math.hypot(clamp(target.x, body.bounds.min.x, body.bounds.max.x) - target.x, clamp(target.y, body.bounds.min.y, body.bounds.max.y) - target.y) <= radius;
  }
  cloudRadius(cloud: Cloud) { return cloud.radius * Math.sqrt(Math.max(0, 1 - (this.time-cloud.started)/cloud.duration)); }
  cloudPuffs(cloud: Cloud, still = false) {
    const r=this.cloudRadius(cloud),age=still?0:(this.time-cloud.started)/1000;
    return Array.from({length:22},(_,i)=>{
      const seed=Math.sin(i*127.1+cloud.x*.13+cloud.y*.17)*43758.5453,n=seed-Math.floor(seed);
      const angle=i*2.39996,spread=i===0?0:Math.sqrt(i/22)*r*.77;
      return {x:cloud.x+Math.cos(angle)*spread+Math.sin(age*.28+i)*r*.045,y:cloud.y+Math.sin(angle)*spread*.78+Math.cos(age*.23+i*2)*r*.06,r:r*(.27+n*.22),n};
    });
  }
  canSee(from: Point, to: Point) {
    const dx=to.x-from.x, dy=to.y-from.y, length=dx*dx+dy*dy;
    return !this.clouds.some(cloud => this.cloudPuffs(cloud).some(p => {
      const t=length ? clamp(((p.x-from.x)*dx+(p.y-from.y)*dy)/length,0,1) : 0;
      return Math.hypot(from.x+t*dx-p.x,from.y+t*dy-p.y) < p.r*.72;
    }));
  }
  thaw(body: Matter.Body, amount: number) {
    const data=body.plugin as ObjectData;
    if (!data.frozen) return;
    data.frozen.remaining -= amount;
    if (data.frozen.remaining <= 0) { delete data.frozen; Body.setStatic(body,false); Matter.Sleeping.set(body,false); }
  }
  bodyWet(body: Matter.Body) {
    if(this.terrain.wet(body.position))return true;
    const vertices=body.vertices;
    for(let i=0;i<vertices.length;i++) {
      const a=vertices[i],b=vertices[(i+1)%vertices.length],steps=Math.ceil(Math.hypot(b.x-a.x,b.y-a.y)/8);
      for(let j=0;j<=steps;j++) {
        const x=a.x+(b.x-a.x)*j/steps,y=a.y+(b.y-a.y)*j/steps,dx=x-body.position.x,dy=y-body.position.y,d=Math.hypot(dx,dy)||1;
        if(this.terrain.wet({x:x+dx/d*6,y:y+dy/d*6}))return true;
      }
    }
    return false;
  }
  ignite(body: Matter.Body) {
    const data=body.plugin as ObjectData;
    if(data.material==='wood')burnFuel(data.fuel ||= newFuel(),600,1,this.bodyWet(body),!!data.frozen,9000);
    if(data.material==='ice'&&!data.frozen)this.melt(body,.3);
  }
  melt(body: Matter.Body, fraction: number) {
    const data=body.plugin as ObjectData,amount=data.size*data.size*fraction*.12;
    const p={...body.position};
    if(data.size*(1-fraction)<5)Composite.remove(this.engine.world,body);
    else this.resize(body,data.size*(1-fraction));
    // Meltwater forms just outside the remaining solid ice.
    this.terrain.addWater({x:p.x+data.size+8,y:p.y},Math.max(2,amount),500);
  }
  updateFire(dt: number) {
    this.fireClock+=dt;if(this.fireClock<100)return;
    const step=this.fireClock,objects=this.objects;this.fireClock=0;
    const sources=objects.filter(b=>(b.plugin as ObjectData).fuel?.burning&&!this.bodyWet(b)).map(b=>{
      const data=b.plugin as ObjectData;return {...b.position,radius:data.size+35,strength:data.frozen?.18:2};
    });
    this.terrain.updateFire(step,sources);
    for(const body of objects) {
      const data=body.plugin as ObjectData,heat=this.terrain.heatAt(body.position,data.size);
      if(data.frozen&&heat>0)this.thaw(body,heat*step);
      if(data.creature&&!data.frozen&&heat>0&&!this.bodyWet(body))this.damage(body,heat*step*.006);
      if(data.material==='ice'&&!data.frozen&&heat>0){this.melt(body,Math.min(.05,heat*step/25000));continue;}
      if(data.material!=='wood')continue;
      const fuel=data.fuel ||= newFuel();
      if(data.frozen&&fuel.burning)this.thaw(body,step*.5);
      burnFuel(fuel,step,heat,this.bodyWet(body),!!data.frozen,9000);
      if(fuel.consumed>=1){this.burst(body.position,'#84715c',18,1.2,3,1100);Composite.remove(this.engine.world,body);}
    }
  }
  damage(body: Matter.Body, amount: number) {
    const data=body.plugin as ObjectData;
    if (!data.creature) return;
    data.creature.hp -= amount;
    if (data.creature.hp <= 0) { this.burst(body.position,data.color,25,2,5,800); Composite.remove(this.engine.world,body); }
  }
  lightning(settings: LightningSettings, target: Point) {
    let origin: Point=CASTER, aim=target;
    const hit=new Set<number>();
    for (let i=0;i<settings.targets;i++) {
      const range=i===0?settings.radius:settings.chainRadius;
      const next=this.objects.filter(b=>!hit.has(b.id)&&this.inRange(b,aim,range)&&this.canSee(origin,b.position))
        .sort((a,b)=>Math.hypot(a.position.x-aim.x,a.position.y-aim.y)-Math.hypot(b.position.x-aim.x,b.position.y-aim.y))[0];
      if (!next) break;
      const end={...next.position}, points=[{...origin}];
      for(let j=1;j<8;j++) { const t=j/8; points.push({x:origin.x+(end.x-origin.x)*t+(Math.random()-.5)*22,y:origin.y+(end.y-origin.y)*t+(Math.random()-.5)*22}); }
      points.push(end); if(this.arcs.length<100)this.arcs.push({points,color:settings.color,life:400});
      hit.add(next.id); this.damage(next,settings.damage); origin=end; aim=end;
    }
  }
  resize(body: Matter.Body, size: number) {
    const data = body.plugin as ObjectData;
    const next = clamp(size, 4, 360);
    if (data.frozen) Body.setStatic(body,false);
    Body.scale(body, next / data.size, next / data.size); data.size = next;
    if (data.frozen) Body.setStatic(body,true);
    Matter.Sleeping.set(body, false);
    const margin = next * (data.shape === 'box' ? Math.SQRT2 : 1) + 10, b=this.terrain.bounds;
    Body.setPosition(body, { x: clamp(body.position.x, b.minX+margin, b.maxX-margin), y: clamp(body.position.y, b.minY+margin, b.maxY-margin) });
  }
  updateCreatures(dt: number) {
    const objects = this.objects;
    const food = objects.filter(b => !(b.plugin as ObjectData).creature);
    const removed = new Set<number>();
    for (const body of objects) {
      const data = body.plugin as ObjectData, creature = data.creature;
      if (!creature || data.frozen) continue;
      const candidates = food.filter(b => !removed.has(b.id) && !(b.plugin as ObjectData).frozen && this.canSee(body.position,b.position));
      const nearest = candidates.reduce<Matter.Body | undefined>((best, b) => !best || Math.hypot(b.position.x-body.position.x,b.position.y-body.position.y) < Math.hypot(best.position.x-body.position.x,best.position.y-body.position.y) ? b : best, undefined);
      const heading = nearest ? Math.atan2(nearest.position.y-body.position.y, nearest.position.x-body.position.x) : body.id * 2.4 + this.time / 5000;
      // Steering yields to spell impulses instead of replacing them every frame.
      const steer=1-Math.pow(.97,dt/(1000/60)), speed=creature.speed/60*5.5;
      Matter.Sleeping.set(body,false);
      Body.setVelocity(body, { x: body.velocity.x*(1-steer)+Math.cos(heading)*speed*steer, y: body.velocity.y*(1-steer)+Math.sin(heading)*speed*steer });
      const nearby = new Set<number>();
      for (const item of candidates) {
        if (!this.inRange(item, body.position, data.size + creature.consumeRadius)) continue;
        nearby.add(item.id);
        const itemData = item.plugin as ObjectData;
        const meal = creature.meals.get(item.id) || { elapsed: 0, size: itemData.size };
        meal.elapsed += dt; creature.meals.set(item.id, meal);
        if (meal.elapsed >= creature.consumeTime) { Composite.remove(this.engine.world, item); removed.add(item.id); creature.meals.delete(item.id); }
        else this.resize(item, Math.min(itemData.size, meal.size * (1 - .9 * meal.elapsed / creature.consumeTime)));
      }
      for (const id of creature.meals.keys()) if (!nearby.has(id)) creature.meals.delete(id);
    }
  }
  update(dt = 1000 / 60) {
    this.time += dt;
    for (const body of this.objects) this.thaw(body,dt);
    this.clouds=this.clouds.filter(c=>this.time-c.started<c.duration);
    for(const arc of this.arcs) arc.life-=dt;
    this.arcs=this.arcs.filter(a=>a.life>0);
    this.scripts.update(dt);
    this.updateCreatures(dt);
    Engine.update(this.engine, dt);
    this.terrain.update(dt,this.objects);
    this.updateFire(dt);
    this.lights = this.lights.filter(l => this.time - l.started < l.settings.duration);
    for (const body of this.objects) { const data = body.plugin as ObjectData; if (data.expires && this.time >= data.expires) { this.burst(body.position, data.color, 10, 1, 2, 500); Composite.remove(this.engine.world, body); } }
    for (const p of this.projectiles) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y, distance = Math.hypot(dx,dy), step = p.settings.speed * dt / 16.67;
      if (distance <= step) {
        p.x = p.target.x; p.y = p.target.y;
        this.burst(p.target, p.settings.color, p.settings.particles, 7, 6, 1100);
        this.burst(p.target, '#fff2b5', 18, 5, 3, 600);
        this.rings.push({...p.target, color:p.settings.color, radius:p.settings.radius, life:600, total:600, inward:false});
        this.force(p.target, p.settings.radius, p.settings.power, 'push');
        this.terrain.ignite(p.target,p.settings.radius);
        for (const body of this.objects) {
          const data = body.plugin as ObjectData;
          if (!this.inRange(body,p.target,p.settings.radius)) continue;
          this.thaw(body,5000);
          if (!data.frozen) this.damage(body,p.settings.damage);
          this.ignite(body);
        }
      } else { p.x += dx/distance * step; p.y += dy/distance * step; this.burst(p, p.settings.color, 3, .8, 5, 500); }
    }
    this.projectiles = this.projectiles.filter(p => Math.hypot(p.x-p.target.x,p.y-p.target.y) > .1);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt/16.67; p.y += p.vy * dt/16.67; p.vy += p.gravity; p.vx *= .993; p.vy *= .993; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
  }
  render(ctx: CanvasRenderingContext2D, target: Point | null, color: string, reducedMotion = false) {
    ctx.save();
    this.terrain.renderFloor(ctx);
    const light = ctx.createRadialGradient(700,470,100,700,470,900);light.addColorStop(0,'#b5b58b14');light.addColorStop(1,'#00000099');ctx.fillStyle=light;ctx.fillRect(0,0,1400,1000);
    ctx.strokeStyle='#a3a27c26';ctx.lineWidth=1.5;
    for (const radius of [210,225,260]) {ctx.beginPath();ctx.arc(700,490,radius,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();for(let i=0;i<=6;i++){const a=i*Math.PI/3-Math.PI/2;const x=700+Math.cos(a)*210,y=490+Math.sin(a)*210;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    ctx.beginPath();ctx.moveTo(700,280);ctx.lineTo(882,595);ctx.lineTo(518,595);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(700,700);ctx.lineTo(518,385);ctx.lineTo(882,385);ctx.closePath();ctx.stroke();
    ctx.font='21px "Noto Sans Runic",serif';ctx.fillStyle='#adac854a';ctx.textAlign='center';
    const symbols='ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.save();ctx.translate(700+Math.cos(a)*242,490+Math.sin(a)*242);ctx.rotate(a+Math.PI/2);ctx.fillText(symbols[i],0,7);ctx.restore();}
    this.terrain.renderLife(ctx,reducedMotion);
    for(const body of this.objects) {
      const data=body.plugin as ObjectData;ctx.save();ctx.translate(body.position.x,body.position.y);ctx.rotate(body.angle);
      ctx.shadowColor='#0009';ctx.shadowBlur=8;ctx.shadowOffsetY=6;ctx.fillStyle=data.color;ctx.strokeStyle='#151c18';ctx.lineWidth=2;
      if(data.creature){
        const s=data.size, wobble=reducedMotion||data.frozen?0:Math.sin(this.time/250+body.id)*.04;
        ctx.rotate(-body.angle);ctx.fillStyle=data.color;ctx.globalAlpha=.82;ctx.beginPath();ctx.ellipse(0,0,s*(1+wobble),s*(1-wobble),0,0,Math.PI*2);ctx.fill();ctx.stroke();ctx.globalAlpha=1;ctx.shadowBlur=0;ctx.shadowOffsetY=0;
        ctx.fillStyle='#e8ffd988';ctx.beginPath();ctx.ellipse(-s*.3,-s*.35,s*.3,s*.16,-.5,0,Math.PI*2);ctx.fill();
        ctx.fillStyle='#193523';for(const x of [-.28,.28]){ctx.beginPath();ctx.arc(s*x,-s*.08,Math.max(2,s*.09),0,Math.PI*2);ctx.fill();}
        ctx.strokeStyle='#315c37';ctx.lineWidth=2;ctx.beginPath();ctx.arc(0,s*.1,s*.16,0,Math.PI);ctx.stroke();
        const width=Math.max(48,s*1.5);ctx.fillStyle='#111b16';ctx.fillRect(-width/2,-s-18,width,7);ctx.fillStyle=data.creature.hp/data.creature.maxHp>.5?'#a5dc7b':'#e6b365';ctx.fillRect(-width/2+1,-s-17,(width-2)*Math.max(0,data.creature.hp/data.creature.maxHp),5);
      }
      else if(data.shape==='circle'){const g=ctx.createRadialGradient(-data.size*.35,-data.size*.4,1,0,0,data.size);g.addColorStop(0,'#f2f1da');g.addColorStop(.3,data.color);g.addColorStop(1,'#424d4a');ctx.fillStyle=g;ctx.beginPath();ctx.arc(0,0,data.size,0,Math.PI*2);ctx.fill();ctx.stroke();}
      else if(data.shape==='plane'){const s=data.size;ctx.fillStyle='#9ab8c5';ctx.beginPath();ctx.moveTo(s*1.5,0);ctx.lineTo(-s*.9,-s*.48);ctx.lineTo(-s*.55,0);ctx.lineTo(-s*.9,s*.48);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#dbe5dd';ctx.beginPath();ctx.moveTo(s*.25,0);ctx.lineTo(-s*.55,-s*1.35);ctx.lineTo(-s*.3,0);ctx.lineTo(-s*.55,s*1.35);ctx.closePath();ctx.fill();ctx.stroke();ctx.fillStyle='#3d6573';ctx.beginPath();ctx.arc(s*.35,0,s*.28,0,Math.PI*2);ctx.fill();}
      else {const s=data.size;ctx.fillRect(-s,-s,s*2,s*2);ctx.strokeRect(-s,-s,s*2,s*2);ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#372b1e88';ctx.lineWidth=1;for(let i=-s+7;i<s;i+=12){ctx.beginPath();ctx.moveTo(i,-s);ctx.lineTo(i,s);ctx.stroke();}ctx.strokeStyle=data.material==='wood'?'#b2996d':'#dddbce55';ctx.lineWidth=5;ctx.strokeRect(-s+5,-s+5,s*2-10,s*2-10);if(data.material==='wood'){ctx.beginPath();ctx.moveTo(-s+6,-s+6);ctx.lineTo(s-6,s-6);ctx.stroke();}}
      if(data.fuel?.consumed){
        ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=`rgba(24,20,17,${Math.min(.88,data.fuel.consumed)})`;
        if(data.shape==='circle'){ctx.beginPath();ctx.arc(0,0,data.size,0,Math.PI*2);ctx.fill();}
        else ctx.fillRect(-data.size,-data.size,data.size*2,data.size*2);
      }
      if(data.frozen||data.material==='ice'){
        const a=data.creature?0:-body.angle,cos=Math.cos(a),sin=Math.sin(a);
        const vertices=body.vertices.map(v=>{const x=v.x-body.position.x,y=v.y-body.position.y;return{x:x*cos-y*sin,y:x*sin+y*cos};});
        drawIce(ctx,vertices,data.frozen?data.frozen.remaining/data.frozen.total:1,body.id);
      }
      ctx.restore();
      if(data.fuel?.burning){
        const scale=data.frozen?.3:1;
        for(let i=0;i<3;i++)drawFlame(ctx,body.position.x+(i-1)*data.size*.6,body.position.y+data.size*.25,Math.max(8,data.size*.95)*scale,this.time,body.id+i*.3,reducedMotion);
      }
    }
    for(const r of this.rings){const progress=1-r.life/r.total;const radius=r.radius*(r.inward?1-progress:Math.sin(progress*Math.PI/2));ctx.globalAlpha=(1-progress)*.7;ctx.strokeStyle=r.color;ctx.lineWidth=2+4*(1-progress);ctx.beginPath();ctx.arc(r.x,r.y,Math.max(1,radius),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.05*(1-progress);ctx.fillStyle=r.color;ctx.fill();}ctx.globalAlpha=1;
    ctx.globalCompositeOperation='lighter';
    for(const glow of this.lights){
      const {settings}=glow, age=this.time-glow.started, remaining=settings.duration-age;
      const tail=Math.min(settings.flicker,settings.duration), fading=tail>0&&remaining<tail;
      const alpha=fading?(remaining/tail)*(reducedMotion?1:(.3+.7*Math.pow(Math.sin(age/55),2))):1;
      const hue=(age/5000*360)%360, tint=settings.rainbow?`hsl(${hue} 90% 65%)`:settings.color;
      ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(glow.x,glow.y,0,glow.x,glow.y,settings.radius);g.addColorStop(0,tint);g.addColorStop(.15,tint);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.globalAlpha=alpha*.42;ctx.beginPath();ctx.arc(glow.x,glow.y,settings.radius,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=alpha;ctx.shadowColor=tint;ctx.shadowBlur=25;ctx.fillStyle='#fff8eb';ctx.beginPath();ctx.arc(glow.x,glow.y,Math.max(2,settings.radius*.045),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    for(let i=0;i<this.particles.length;i++){if(reducedMotion && i%3)continue;const p=this.particles[i];const fade=p.life/p.total;ctx.globalAlpha=fade;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.2,p.size*fade),0,Math.PI*2);ctx.fill();}
    for(const p of this.projectiles){ctx.globalAlpha=1;ctx.shadowColor=p.settings.color;ctx.shadowBlur=reducedMotion?0:25;ctx.fillStyle='#fff3b9';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    for(const arc of this.arcs){ctx.save();ctx.globalAlpha=arc.life/400;ctx.strokeStyle=arc.color;ctx.lineWidth=3;ctx.shadowColor=arc.color;ctx.shadowBlur=reducedMotion?0:14;ctx.beginPath();arc.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}
    this.scripts.draw(ctx, reducedMotion);
    // Opaque smoke is drawn over objects, health bars, lights, and spell effects.
    for(const cloud of this.clouds){
      const puffs=this.cloudPuffs(cloud,reducedMotion);
      for(const p of puffs){
        if(p.r<=0)continue;
        const g=ctx.createRadialGradient(p.x,p.y,p.r*.45,p.x,p.y,p.r);
        g.addColorStop(0,'#090b0d');g.addColorStop(.5,'#090b0d');g.addColorStop(.8,'#11141bcc');g.addColorStop(1,'#12151b00');
        ctx.fillStyle=g;ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);ctx.fill();
      }
      // Soft, offset highlights reveal rolling folds without a spherical outer outline.
      for(const p of puffs){
        if(p.r<=0)continue;
        const x=p.x-p.r*.2,y=p.y-p.r*.3,r=p.r*.8;
        const g=ctx.createRadialGradient(x,y,0,x,y,r);g.addColorStop(0,`rgba(83,88,100,${.12+p.n*.14})`);g.addColorStop(.4,'#363c4918');g.addColorStop(1,'#242b3500');
        ctx.fillStyle=g;ctx.beginPath();ctx.ellipse(x,y,r,r*.68,p.n*3,0,Math.PI*2);ctx.fill();
      }
    }
    // The caster's location is the source of all projectiles.
    ctx.strokeStyle='#c7b47c';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(CASTER.x,CASTER.y,23,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#dfc98f';ctx.beginPath();ctx.moveTo(CASTER.x,CASTER.y-14);ctx.lineTo(CASTER.x+9,CASTER.y+9);ctx.lineTo(CASTER.x,CASTER.y+5);ctx.lineTo(CASTER.x-9,CASTER.y+9);ctx.closePath();ctx.fill();ctx.font='12px Georgia';ctx.fillStyle='#b7b697';ctx.fillText('YOU',CASTER.x,CASTER.y+48);
    if(target){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(target.x,target.y,18,0,Math.PI*2);ctx.moveTo(target.x-25,target.y);ctx.lineTo(target.x-11,target.y);ctx.moveTo(target.x+11,target.y);ctx.lineTo(target.x+25,target.y);ctx.moveTo(target.x,target.y-25);ctx.lineTo(target.x,target.y-11);ctx.moveTo(target.x,target.y+11);ctx.lineTo(target.x,target.y+25);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
  }
}
