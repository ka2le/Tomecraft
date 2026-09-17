import Matter from 'matter-js';
import type { Action, Spell } from './spells';

const { Engine, Bodies, Body, Composite } = Matter;
export const ROOM = { width: 1400, height: 1000 };
export const CASTER = { x: 700, y: 810 };
export type Point = { x: number; y: number };
type Particle = Point & { vx: number; vy: number; color: string; size: number; life: number; total: number; gravity: number };
type Ring = Point & { radius: number; life: number; total: number; color: string; inward: boolean };
type Projectile = Point & { target: Point; action: Extract<Action, {type: 'projectile'}> };
type ScheduledCast = { target: Point; spell: Spell; started: number; remaining: Action[] };
type Creature = { hp: number; maxHp: number; speed: number; consumeRadius: number; consumeTime: number; meals: Map<number, { elapsed: number; size: number }> };
type ObjectData = { material: string; color: string; size: number; expires: number; shape: string; creature?: Creature; frozen?: { remaining: number; total: number; color: string } };
type Glow = Point & { action: Extract<Action, {type: 'light'}>; started: number };
type Cloud = Point & { radius: number; duration: number; started: number };
type Arc = { points: Point[]; color: string; life: number };
export const materialColors: Record<string, string> = { wood: '#90704a', metal: '#a5b0b1', stone: '#76766e', crystal: '#b28ed4', ice: '#92d2de' };
const clamp = (v: number, min: number, max: number) => Math.min(max, Math.max(min, v));

export class SpellEngine {
  engine = Engine.create({ gravity: {x: 0, y: 0, scale: 0}, enableSleeping: true });
  particles: Particle[] = [];
  rings: Ring[] = [];
  projectiles: Projectile[] = [];
  pending: ScheduledCast[] = [];
  lights: Glow[] = [];
  clouds: Cloud[] = [];
  arcs: Arc[] = [];
  time = 0;
  lastCast = -1000;
  casts = 0;
  constructor(seed = true) {
    Composite.add(this.engine.world, [
      Bodies.rectangle(700, -15, 1440, 40, {isStatic: true}), Bodies.rectangle(700, 1015, 1440, 40, {isStatic: true}),
      Bodies.rectangle(-15, 500, 40, 1040, {isStatic: true}), Bodies.rectangle(1415, 500, 40, 1040, {isStatic: true}),
    ]);
    if (seed) this.seed();
  }
  get objects() { return Composite.allBodies(this.engine.world).filter(b => !b.isStatic || (b.plugin as ObjectData).frozen); }
  seed() {
    const wood = { type: 'spawn', shape: 'box', material: 'wood', count: 1, size: 34, spread: 0, lifetime: 0, delay: 0 } as const;
    for (const p of [{x:520,y:410}, {x:596,y:420}, {x:550,y:486}]) this.spawn(wood,p);
    this.spawn({ ...wood, shape: 'circle', material: 'metal', count: 7, size: 11, spread: 55 }, {x:900,y:455});
  }
  clear() {
    for (const body of this.objects) Composite.remove(this.engine.world, body);
    this.particles = []; this.rings = []; this.projectiles = []; this.pending = []; this.lights = [];
    this.clouds = []; this.arcs = [];
  }
  destroy() { this.clear(); Engine.clear(this.engine); Composite.clear(this.engine.world, false); }
  cast(spell: Spell, target: Point): boolean {
    if (this.time - this.lastCast < 140 || this.pending.length >= 12 || this.projectiles.length >= 24) return false;
    if (target.x < 15 || target.x > ROOM.width - 15 || target.y < 15 || target.y > ROOM.height - 15) return false;
    this.lastCast = this.time; this.casts++;
    this.pending.push({ target, spell, started: this.time, remaining: [...spell.actions] });
    return true;
  }
  spawn(action: Extract<Action, {type: 'spawn'}>, target: Point) {
    const available = 250 - this.objects.length;
    for (let i = 0; i < Math.min(action.count, available); i++) {
      const angle = i * Math.PI * 2 / action.count + .3;
      const distance = action.count === 1 ? 0 : Math.max(action.spread, action.size * Math.sqrt(action.count));
      const x = clamp(target.x + Math.cos(angle) * distance, action.size + 10, ROOM.width - action.size - 10);
      const y = clamp(target.y + Math.sin(angle) * distance, action.size + 10, ROOM.height - action.size - 10);
      const options = { restitution: action.material === 'metal' ? .72 : .4, frictionAir: .022, friction: .25, density: action.material === 'metal' ? .006 : .001, angle: action.shape === 'box' ? (Math.random() - .5) * .24 : 0 };
      const body = action.shape === 'circle' ? Bodies.circle(x, y, action.size, options) : Bodies.rectangle(x,y,action.size * 2,action.size * 2,{...options, chamfer: {radius: 3}});
      body.plugin = { material: action.material, size: action.size, color: action.color || materialColors[action.material], expires: action.lifetime ? this.time + action.lifetime : 0, shape: action.shape } satisfies ObjectData;
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
    for (const body of this.objects) {
      if (body.isStatic) continue;
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
  remove(target: Point, radius: number, woodOnly = false) {
    for (const body of this.objects) {
      const data = body.plugin as ObjectData;
      const nearest = { x: clamp(target.x, body.bounds.min.x, body.bounds.max.x), y: clamp(target.y, body.bounds.min.y, body.bounds.max.y) };
      if (Math.hypot(nearest.x - target.x, nearest.y - target.y) <= radius && (!woodOnly || (data.material === 'wood' && !data.frozen))) {
        this.burst(body.position, woodOnly ? '#df9858' : data.color, 14, 2.5, 3, 800);
        Composite.remove(this.engine.world, body);
      }
    }
  }
  run(action: Action, target: Point, spell: Spell) {
    switch (action.type) {
      case 'freeze':
        for (const body of this.objects) if (this.inRange(body, target, action.radius)) {
          (body.plugin as ObjectData).frozen = { remaining: action.duration, total: action.duration, color: action.color };
          if (!body.isStatic) Body.setStatic(body, true);
        }
        break;
      case 'cloud': if (this.clouds.length < 24) this.clouds.push({ ...target, radius: action.radius, duration: action.duration, started: this.time }); break;
      case 'lightning': this.lightning(action, target); break;
      case 'creature': {
        if (this.objects.length >= 250) break;
        const body = Bodies.circle(clamp(target.x, action.size + 10, ROOM.width - action.size - 10), clamp(target.y, action.size + 10, ROOM.height - action.size - 10), action.size, { frictionAir: .12, restitution: .1, inertia: Infinity });
        body.plugin = { material: 'slime', color: action.color, size: action.size, shape: 'circle', expires: action.lifetime ? this.time + action.lifetime : 0, creature: { hp: action.hp, maxHp: action.hp, speed: action.speed, consumeRadius: action.consumeRadius, consumeTime: action.consumeTime, meals: new Map() } } satisfies ObjectData;
        Composite.add(this.engine.world, body); break;
      }
      case 'light': if (this.lights.length < 32) this.lights.push({ ...target, action: { ...action }, started: this.time }); break;
      case 'resize':
        for (const body of this.objects) if (this.inRange(body, target, action.radius)) this.resize(body, (body.plugin as ObjectData).size * action.factor);
        for (const light of this.lights) if (Math.hypot(light.x-target.x, light.y-target.y) <= action.radius + light.action.radius) light.action.radius = clamp(light.action.radius * action.factor, 5, 500);
        break;
      case 'spawn': this.spawn(action, target); break;
      case 'burst': this.burst(target, action.color, action.count, action.speed, action.size, action.lifetime, action.gravity); break;
      case 'ring': if (this.rings.length < 100) this.rings.push({...target, color:action.color, radius:action.radius, life:action.duration, total:action.duration, inward:spell.actions.some(a => a.type === 'force' && a.mode === 'pull')}); break;
      case 'force': this.force(target, action.radius, action.strength, action.mode); break;
      case 'remove': this.remove(target, action.radius); break;
      case 'projectile': if (this.projectiles.length < 24) this.projectiles.push({...CASTER, target, action}); break;
    }
  }
  inRange(body: Matter.Body, target: Point, radius: number) {
    return Math.hypot(clamp(target.x, body.bounds.min.x, body.bounds.max.x) - target.x, clamp(target.y, body.bounds.min.y, body.bounds.max.y) - target.y) <= radius;
  }
  cloudRadius(cloud: Cloud) { return cloud.radius * Math.sqrt(Math.max(0, 1 - (this.time-cloud.started)/cloud.duration)); }
  canSee(from: Point, to: Point) {
    const dx=to.x-from.x, dy=to.y-from.y, length=dx*dx+dy*dy;
    return !this.clouds.some(cloud => {
      const t=length ? clamp(((cloud.x-from.x)*dx+(cloud.y-from.y)*dy)/length,0,1) : 0;
      return Math.hypot(from.x+t*dx-cloud.x,from.y+t*dy-cloud.y) < this.cloudRadius(cloud)*.85;
    });
  }
  thaw(body: Matter.Body, amount: number) {
    const data=body.plugin as ObjectData;
    if (!data.frozen) return;
    data.frozen.remaining -= amount;
    if (data.frozen.remaining <= 0) { delete data.frozen; Body.setStatic(body,false); Matter.Sleeping.set(body,false); }
  }
  damage(body: Matter.Body, amount: number) {
    const data=body.plugin as ObjectData;
    if (!data.creature) return;
    data.creature.hp -= amount;
    if (data.creature.hp <= 0) { this.burst(body.position,data.color,25,2,5,800); Composite.remove(this.engine.world,body); }
  }
  lightning(action: Extract<Action, {type: 'lightning'}>, target: Point) {
    let origin: Point=CASTER, aim=target;
    const hit=new Set<number>();
    for (let i=0;i<action.targets;i++) {
      const range=i===0?action.radius:action.chainRadius;
      const next=this.objects.filter(b=>!hit.has(b.id)&&this.inRange(b,aim,range)&&this.canSee(origin,b.position))
        .sort((a,b)=>Math.hypot(a.position.x-aim.x,a.position.y-aim.y)-Math.hypot(b.position.x-aim.x,b.position.y-aim.y))[0];
      if (!next) break;
      const end={...next.position}, points=[{...origin}];
      for(let j=1;j<8;j++) { const t=j/8; points.push({x:origin.x+(end.x-origin.x)*t+(Math.random()-.5)*22,y:origin.y+(end.y-origin.y)*t+(Math.random()-.5)*22}); }
      points.push(end); if(this.arcs.length<100)this.arcs.push({points,color:action.color,life:400});
      hit.add(next.id); this.damage(next,action.damage); origin=end; aim=end;
    }
  }
  resize(body: Matter.Body, size: number) {
    const data = body.plugin as ObjectData;
    const next = clamp(size, 4, 120);
    if (data.frozen) Body.setStatic(body,false);
    Body.scale(body, next / data.size, next / data.size); data.size = next;
    if (data.frozen) Body.setStatic(body,true);
    Matter.Sleeping.set(body, false);
    const margin = next * (data.shape === 'box' ? Math.SQRT2 : 1) + 10;
    Body.setPosition(body, { x: clamp(body.position.x, margin, ROOM.width - margin), y: clamp(body.position.y, margin, ROOM.height - margin) });
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
    for (const cast of this.pending) {
      const due = cast.remaining.filter(a => this.time - cast.started >= a.delay);
      cast.remaining = cast.remaining.filter(a => this.time - cast.started < a.delay);
      for (const action of due) this.run(action, cast.target, cast.spell);
    }
    this.pending = this.pending.filter(c => c.remaining.length);
    this.updateCreatures(dt);
    Engine.update(this.engine, dt);
    this.lights = this.lights.filter(l => this.time - l.started < l.action.duration);
    for (const body of this.objects) { const data = body.plugin as ObjectData; if (data.expires && this.time >= data.expires) { this.burst(body.position, data.color, 10, 1, 2, 500); Composite.remove(this.engine.world, body); } }
    for (const p of this.projectiles) {
      const dx = p.target.x - p.x, dy = p.target.y - p.y, distance = Math.hypot(dx,dy), step = p.action.speed * dt / 16.67;
      if (distance <= step) {
        p.x = p.target.x; p.y = p.target.y;
        this.burst(p.target, p.action.color, p.action.particles, 7, 6, 1100);
        this.burst(p.target, '#fff2b5', 18, 5, 3, 600);
        this.rings.push({...p.target, color:p.action.color, radius:p.action.radius, life:600, total:600, inward:false});
        this.force(p.target, p.action.radius, p.action.power, 'push');
        for (const body of this.objects) {
          const data = body.plugin as ObjectData;
          if (!this.inRange(body,p.target,p.action.radius)) continue;
          this.thaw(body,5000);
          if (!data.frozen) this.damage(body,p.action.damage);
        }
        this.remove(p.target, p.action.radius * .85, true);
      } else { p.x += dx/distance * step; p.y += dy/distance * step; this.burst(p, p.action.color, 3, .8, 5, 500); }
    }
    this.projectiles = this.projectiles.filter(p => Math.hypot(p.x-p.target.x,p.y-p.target.y) > .1);
    for (const p of this.particles) { p.life -= dt; p.x += p.vx * dt/16.67; p.y += p.vy * dt/16.67; p.vy += p.gravity; p.vx *= .993; p.vy *= .993; }
    this.particles = this.particles.filter(p => p.life > 0);
    for (const r of this.rings) r.life -= dt;
    this.rings = this.rings.filter(r => r.life > 0);
  }
  render(ctx: CanvasRenderingContext2D, target: Point | null, color: string, reducedMotion = false) {
    ctx.save();
    ctx.shadowColor = '#0009'; ctx.shadowBlur = 50; ctx.fillStyle = '#262c29'; ctx.fillRect(-28,-28,1456,1056);ctx.shadowBlur=0;
    ctx.fillStyle = '#303733'; ctx.fillRect(0,0,1400,1000);
    for (let row=0;row<10;row++) for(let col=0;col<14;col++) {
      const v = ((col * 17 + row * 31) % 9) + 37;
      ctx.fillStyle=`rgb(${v},${v+7},${v+3})`;ctx.fillRect(col*100+2,row*100+2,96,96);
      ctx.strokeStyle='#ffffff05';ctx.strokeRect(col*100+4,row*100+4,92,92);
    }
    const light = ctx.createRadialGradient(700,470,100,700,470,900);light.addColorStop(0,'#b5b58b14');light.addColorStop(1,'#00000099');ctx.fillStyle=light;ctx.fillRect(0,0,1400,1000);
    ctx.strokeStyle='#b3ae7a30';ctx.lineWidth=2;ctx.strokeRect(24,24,1352,952);ctx.strokeRect(32,32,1336,936);
    ctx.strokeStyle='#a3a27c26';ctx.lineWidth=1.5;
    for (const radius of [210,225,260]) {ctx.beginPath();ctx.arc(700,490,radius,0,Math.PI*2);ctx.stroke();}
    ctx.beginPath();for(let i=0;i<=6;i++){const a=i*Math.PI/3-Math.PI/2;const x=700+Math.cos(a)*210,y=490+Math.sin(a)*210;if(!i)ctx.moveTo(x,y);else ctx.lineTo(x,y);}ctx.stroke();
    ctx.beginPath();ctx.moveTo(700,280);ctx.lineTo(882,595);ctx.lineTo(518,595);ctx.closePath();ctx.stroke();ctx.beginPath();ctx.moveTo(700,700);ctx.lineTo(518,385);ctx.lineTo(882,385);ctx.closePath();ctx.stroke();
    ctx.font='21px "Noto Sans Runic",serif';ctx.fillStyle='#adac854a';ctx.textAlign='center';
    const symbols='ᚠᚢᚦᚨᚱᚲᚷᚹᚺᚾᛁᛃ';for(let i=0;i<12;i++){const a=i*Math.PI/6;ctx.save();ctx.translate(700+Math.cos(a)*242,490+Math.sin(a)*242);ctx.rotate(a+Math.PI/2);ctx.fillText(symbols[i],0,7);ctx.restore();}
    // Functional room boundary and corner pillars.
    for(const p of [{x:20,y:20},{x:1330,y:20},{x:20,y:930},{x:1330,y:930}]) {ctx.fillStyle='#171f1b';ctx.fillRect(p.x-4,p.y+6,58,58);ctx.fillStyle='#555b4d';ctx.fillRect(p.x,p.y,50,50);ctx.strokeStyle='#92947944';ctx.strokeRect(p.x+6,p.y+6,38,38);}
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
      else {const s=data.size;ctx.fillRect(-s,-s,s*2,s*2);ctx.strokeRect(-s,-s,s*2,s*2);ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.strokeStyle='#372b1e88';ctx.lineWidth=1;for(let i=-s+7;i<s;i+=12){ctx.beginPath();ctx.moveTo(i,-s);ctx.lineTo(i,s);ctx.stroke();}ctx.strokeStyle=data.material==='wood'?'#b2996d':'#dddbce55';ctx.lineWidth=5;ctx.strokeRect(-s+5,-s+5,s*2-10,s*2-10);if(data.material==='wood'){ctx.beginPath();ctx.moveTo(-s+6,-s+6);ctx.lineTo(s-6,s-6);ctx.stroke();}}
      if(data.frozen){
        const ice=data.frozen, fraction=ice.remaining/ice.total, s=data.size+4+10*fraction;
        ctx.shadowBlur=0;ctx.shadowOffsetY=0;ctx.fillStyle=ice.color;ctx.globalAlpha=.15+.35*fraction;
        ctx.beginPath();ctx.moveTo(-s,-s*.7);ctx.lineTo(-s*.6,-s);ctx.lineTo(s*.7,-s);ctx.lineTo(s,-s*.5);ctx.lineTo(s,s*.7);ctx.lineTo(s*.5,s);ctx.lineTo(-s*.7,s);ctx.lineTo(-s,s*.5);ctx.closePath();ctx.fill();ctx.globalAlpha=.4+.5*fraction;ctx.strokeStyle=ice.color;ctx.lineWidth=2;ctx.stroke();
        ctx.beginPath();ctx.moveTo(-s*.6,-s);ctx.lineTo(-s*.25,-s*.2);ctx.lineTo(-s,s*.5);ctx.moveTo(s,-s*.5);ctx.lineTo(s*.15,s*.15);ctx.lineTo(s*.5,s);ctx.stroke();ctx.globalAlpha=1;
      }
      ctx.restore();
    }
    for(const r of this.rings){const progress=1-r.life/r.total;const radius=r.radius*(r.inward?1-progress:Math.sin(progress*Math.PI/2));ctx.globalAlpha=(1-progress)*.7;ctx.strokeStyle=r.color;ctx.lineWidth=2+4*(1-progress);ctx.beginPath();ctx.arc(r.x,r.y,Math.max(1,radius),0,Math.PI*2);ctx.stroke();ctx.globalAlpha=.05*(1-progress);ctx.fillStyle=r.color;ctx.fill();}ctx.globalAlpha=1;
    ctx.globalCompositeOperation='lighter';
    for(const glow of this.lights){
      const {action}=glow, age=this.time-glow.started, remaining=action.duration-age;
      const tail=Math.min(action.flicker,action.duration), fading=tail>0&&remaining<tail;
      const alpha=fading?(remaining/tail)*(reducedMotion?1:(.3+.7*Math.pow(Math.sin(age/55),2))):1;
      const hue=(age/5000*360)%360, tint=action.rainbow?`hsl(${hue} 90% 65%)`:action.color;
      ctx.globalAlpha=alpha;const g=ctx.createRadialGradient(glow.x,glow.y,0,glow.x,glow.y,action.radius);g.addColorStop(0,tint);g.addColorStop(.15,tint);g.addColorStop(1,'transparent');ctx.fillStyle=g;ctx.globalAlpha=alpha*.42;ctx.beginPath();ctx.arc(glow.x,glow.y,action.radius,0,Math.PI*2);ctx.fill();
      ctx.globalAlpha=alpha;ctx.shadowColor=tint;ctx.shadowBlur=25;ctx.fillStyle='#fff8eb';ctx.beginPath();ctx.arc(glow.x,glow.y,Math.max(2,action.radius*.045),0,Math.PI*2);ctx.fill();ctx.shadowBlur=0;
    }
    for(let i=0;i<this.particles.length;i++){if(reducedMotion && i%3)continue;const p=this.particles[i];const fade=p.life/p.total;ctx.globalAlpha=fade;ctx.fillStyle=p.color;ctx.beginPath();ctx.arc(p.x,p.y,Math.max(.2,p.size*fade),0,Math.PI*2);ctx.fill();}
    for(const p of this.projectiles){ctx.globalAlpha=1;ctx.shadowColor=p.action.color;ctx.shadowBlur=reducedMotion?0:25;ctx.fillStyle='#fff3b9';ctx.beginPath();ctx.arc(p.x,p.y,7,0,Math.PI*2);ctx.fill();}ctx.shadowBlur=0;ctx.globalAlpha=1;ctx.globalCompositeOperation='source-over';
    for(const arc of this.arcs){ctx.save();ctx.globalAlpha=arc.life/400;ctx.strokeStyle=arc.color;ctx.lineWidth=3;ctx.shadowColor=arc.color;ctx.shadowBlur=reducedMotion?0:14;ctx.beginPath();arc.points.forEach((p,i)=>i?ctx.lineTo(p.x,p.y):ctx.moveTo(p.x,p.y));ctx.stroke();ctx.restore();}
    // Opaque smoke is drawn over objects, health bars, lights, and spell effects.
    for(const cloud of this.clouds){
      const r=this.cloudRadius(cloud);if(r<=0)continue;
      const g=ctx.createRadialGradient(cloud.x,cloud.y,r*.65,cloud.x,cloud.y,r);g.addColorStop(0,'#08090c');g.addColorStop(.57,'#08090c');g.addColorStop(1,'#08090c00');ctx.fillStyle=g;ctx.beginPath();ctx.arc(cloud.x,cloud.y,r,0,Math.PI*2);ctx.fill();
      for(let i=0;i<7;i++){const a=i*Math.PI*2/7+(reducedMotion?0:(this.time-cloud.started)/4500),x=cloud.x+Math.cos(a)*r*.55,y=cloud.y+Math.sin(a)*r*.55;const puff=ctx.createRadialGradient(x,y,0,x,y,r*.35);puff.addColorStop(0,'#20202788');puff.addColorStop(1,'#08090c00');ctx.fillStyle=puff;ctx.beginPath();ctx.arc(x,y,r*.35,0,Math.PI*2);ctx.fill();}
    }
    // The caster's location is the source of all projectiles.
    ctx.strokeStyle='#c7b47c';ctx.lineWidth=1.5;ctx.beginPath();ctx.arc(CASTER.x,CASTER.y,23,0,Math.PI*2);ctx.stroke();ctx.fillStyle='#dfc98f';ctx.beginPath();ctx.moveTo(CASTER.x,CASTER.y-14);ctx.lineTo(CASTER.x+9,CASTER.y+9);ctx.lineTo(CASTER.x,CASTER.y+5);ctx.lineTo(CASTER.x-9,CASTER.y+9);ctx.closePath();ctx.fill();ctx.font='12px Georgia';ctx.fillStyle='#b7b697';ctx.fillText('YOU',CASTER.x,CASTER.y+48);
    if(target){ctx.strokeStyle=color;ctx.lineWidth=1.5;ctx.globalAlpha=.7;ctx.beginPath();ctx.arc(target.x,target.y,18,0,Math.PI*2);ctx.moveTo(target.x-25,target.y);ctx.lineTo(target.x-11,target.y);ctx.moveTo(target.x+11,target.y);ctx.lineTo(target.x+25,target.y);ctx.moveTo(target.x,target.y-25);ctx.lineTo(target.x,target.y-11);ctx.moveTo(target.x,target.y+11);ctx.lineTo(target.x,target.y+25);ctx.stroke();ctx.globalAlpha=1;}
    ctx.restore();
  }
}
