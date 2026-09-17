import Matter from 'matter-js';
import { burnFuel, drawFlame, newFuel } from './elements';
import type { Fuel, HeatSource } from './elements';

type Point = { x: number; y: number };
type Water = Point & { h: number; east: number; south: number; ice?: number };
type Tuft = Point & { born: number; seed: number; next: number; ice: number; fuel: Fuel };
const key = (x: number, y: number) => `${x},${y}`;
const directions = [[1, 0], [-1, 0], [0, 1], [0, -1]];
const CELL = 10;

/** Tile topology plus a conservative, damped shallow-water height field. */
export class Terrain {
  tiles = new Map<string, Point>();
  water = new Map<string, Water>();
  grass = new Map<string, Tuft>();
  sources: (Point & { remaining: number; rate: number })[] = [];
  walls: Matter.Body[] = [];
  bounds = { minX: 0, minY: 0, maxX: 1400, maxY: 1000 };
  elapsed = 0;
  private accumulator = 0;
  private surface?: HTMLCanvasElement;
  private heat = new Map<string, HeatSource[]>();
  constructor(private world: Matter.World) { this.reset(); }
  reset() {
    this.tiles.clear(); this.water.clear(); this.grass.clear(); this.sources = [];this.heat.clear();
    for (let y = 0; y < 10; y++) for (let x = 0; x < 14; x++) this.tiles.set(key(x,y), {x,y});
    this.rebuild();
  }
  contains(p: Point, margin = 0) {
    return [[0,0],[-margin,-margin],[margin,-margin],[-margin,margin],[margin,margin]].every(([dx,dy]) => this.tiles.has(key(Math.floor((p.x+dx)/100),Math.floor((p.y+dy)/100))));
  }
  edge(p: Point) {
    if (!this.contains(p) || this.tiles.size >= 380) return;
    const x = Math.floor(p.x/100), y = Math.floor(p.y/100);
    return directions.map(([dx,dy]) => ({x,y,dx,dy,d: dx ? Math.abs(p.x-(x+(dx>0?1:0))*100) : Math.abs(p.y-(y+(dy>0?1:0))*100)}))
      .filter(e => e.d <= 50 && !this.tiles.has(key(x+e.dx,y+e.dy))).sort((a,b) => a.d-b.d)[0];
  }
  expand(p: Point, depth: number) {
    const e = this.edge(p); if (!e) return;
    for (let d=1; d<=depth; d++) for (let w=-1; w<=1; w++) {
      const x=e.x+e.dx*d+e.dy*w, y=e.y+e.dy*d+e.dx*w;
      if(this.tiles.size<380) this.tiles.set(key(x,y),{x,y});
    }
    this.rebuild();
  }
  rebuild() {
    for(const wall of this.walls) Matter.Composite.remove(this.world,wall);
    this.walls=[];
    const tiles=[...this.tiles.values()];
    this.bounds={minX:Math.min(...tiles.map(t=>t.x))*100,minY:Math.min(...tiles.map(t=>t.y))*100,maxX:(Math.max(...tiles.map(t=>t.x))+1)*100,maxY:(Math.max(...tiles.map(t=>t.y))+1)*100};
    const edges=new Map<string,{vertical:boolean;line:number;starts:number[]}>();
    for(const {x,y} of tiles) for(const [dx,dy] of directions) if(!this.tiles.has(key(x+dx,y+dy))) {
      const vertical=dx!==0,line=vertical?x*100+50+dx*55:y*100+50+dy*55,id=`${dx},${dy},${line}`;
      const edge=edges.get(id)||{vertical,line,starts:[]};edge.starts.push((vertical?y:x)*100);edges.set(id,edge);
    }
    // Merge collinear tile edges into solid walls, avoiding seams and needless bodies.
    for(const edge of edges.values()) {
      const starts=edge.starts.sort((a,b)=>a-b);
      for(let i=0;i<starts.length;i++) {
        const start=starts[i];let end=start+100;
        while(starts[i+1]===end){i++;end+=100;}
        const center=(start+end)/2,length=end-start+10;
        this.walls.push(Matter.Bodies.rectangle(edge.vertical?edge.line:center,edge.vertical?center:edge.line,edge.vertical?10:length,edge.vertical?length:10,{isStatic:true}));
      }
    }
    Matter.Composite.add(this.world,this.walls);
  }
  blocked(p: Point, bodies: Matter.Body[]) {
    return !this.contains(p,2) || bodies.some(b => p.x>=b.bounds.min.x-3 && p.x<=b.bounds.max.x+3 && p.y>=b.bounds.min.y-3 && p.y<=b.bounds.max.y+3 && Matter.Vertices.contains(b.vertices,p));
  }
  addWater(p: Point, amount: number, duration: number) {
    const total=[...this.water.values()].reduce((s,c)=>s+c.h,0)+this.sources.reduce((s,c)=>s+c.remaining,0);
    if(this.sources.length<16 && total<12000) this.sources.push({...p,remaining:Math.min(amount,12000-total),rate:amount/duration});
  }
  plant(p: Point, radius: number, bodies: Matter.Body[]) {
    for(let y=-radius;y<=radius;y+=12) for(let x=-radius;x<=radius;x+=12) if(Math.hypot(x,y)<radius*(.65+Math.random()*.35)) this.tuft({x:p.x+x,y:p.y+y},bodies);
  }
  tuft(p: Point, bodies: Matter.Body[]) {
    const id=key(Math.floor(p.x/12),Math.floor(p.y/12));
    if(this.grass.size>=8000 || this.grass.has(id) || this.blocked(p,bodies)) return;
    this.grass.set(id,{...p,born:this.elapsed,seed:Math.random(),next:this.elapsed+1800+Math.random()*6500,ice:0,fuel:newFuel()});
  }
  wet(p: Point) { const c=this.water.get(key(Math.floor(p.x/CELL),Math.floor(p.y/CELL)));return !!c && c.h>.035 && !c.ice; }
  force(p: Point, radius: number, strength: number, mode: 'push'|'pull'|'orbit') {
    for(const c of this.water.values()) {
      const dx=c.x*CELL+5-p.x,dy=c.y*CELL+5-p.y,d=Math.hypot(dx,dy);
      if(c.ice||d<1||d>radius)continue;
      const impulse=Math.min(c.h*.3,strength*.2)*(1-d/radius),sign=mode==='pull'?-1:1;
      c.east+=(mode==='orbit'?-dy:dx*sign)/d*impulse;c.south+=(mode==='orbit'?dx:dy*sign)/d*impulse;
    }
  }
  freeze(p: Point, radius: number, duration: number) {
    for(const c of this.water.values()) if(Math.hypot(c.x*CELL+5-p.x,c.y*CELL+5-p.y)<=radius){c.ice=duration;c.east=0;c.south=0;}
    for(const t of this.grass.values()) if(Math.hypot(t.x-p.x,t.y-p.y)<=radius)t.ice=duration;
  }
  ignite(p: Point, radius: number) {
    for(const c of this.water.values()) if(Math.hypot(c.x*CELL+5-p.x,c.y*CELL+5-p.y)<=radius)c.ice=Math.max(0,(c.ice||0)-5000);
    for(const t of this.grass.values()) if(Math.hypot(t.x-p.x,t.y-p.y)<=radius) {
      t.ice=Math.max(0,t.ice-5000);burnFuel(t.fuel,600,1,this.wet(t),t.ice>0,6500);
    }
  }
  heatPath(from: Point, to: Point) {
    const steps=Math.max(1,Math.ceil(Math.hypot(to.x-from.x,to.y-from.y)/6));
    let insulation=1;
    for(let i=0;i<=steps;i++) {
      const p={x:from.x+(to.x-from.x)*i/steps,y:from.y+(to.y-from.y)*i/steps};
      if(!this.contains(p)||this.wet(p))return 0;
      const c=this.water.get(key(Math.floor(p.x/CELL),Math.floor(p.y/CELL)));
      if(c?.ice)insulation=.12;
    }
    return insulation;
  }
  heatAt(p: Point, radius = 0) {
    if(!this.heat.size)return 0;
    let value=0;
    const reach=radius+160;
    for(let y=Math.floor((p.y-reach)/80);y<=Math.floor((p.y+reach)/80);y++)for(let x=Math.floor((p.x-reach)/80);x<=Math.floor((p.x+reach)/80);x++) {
      for(const source of this.heat.get(key(x,y))||[]) {
        const distance=Math.hypot(source.x-p.x,source.y-p.y),range=source.radius+radius;
        if(distance<.1||distance>range)continue;
        value+=source.strength*Math.max(.25,1-distance/range)*this.heatPath(source,p);
      }
    }
    return Math.min(4,value);
  }
  updateFire(dt: number, sources: HeatSource[]) {
    this.heat.clear();
    for(const t of this.grass.values())if(t.fuel.burning && !this.wet(t))sources.push({x:t.x,y:t.y,radius:32,strength:t.ice?.15:1.6});
    for(const s of sources){const id=key(Math.floor(s.x/80),Math.floor(s.y/80)),bucket=this.heat.get(id)||[];bucket.push(s);this.heat.set(id,bucket);}
    for(const [id,t] of this.grass) {
      const heat=this.heatAt(t);
      if(t.ice && (heat>0||t.fuel.burning))t.ice=Math.max(0,t.ice-dt*(heat+(t.fuel.burning?1:0)));
      burnFuel(t.fuel,dt,heat,this.wet(t),t.ice>0,6500);
      if(t.fuel.consumed>=1)this.grass.delete(id);
    }
    for(const c of this.water.values())if(c.ice)c.ice=Math.max(0,c.ice-this.heatAt({x:c.x*CELL+5,y:c.y*CELL+5})*dt*2);
  }
  remove(p: Point, radius: number) {
    for(const [id,c] of this.water) if(Math.hypot(c.x*CELL+5-p.x,c.y*CELL+5-p.y)<radius)this.water.delete(id);
    for(const [id,c] of this.grass) if(Math.hypot(c.x-p.x,c.y-p.y)<radius)this.grass.delete(id);
    this.sources=this.sources.filter(c=>Math.hypot(c.x-p.x,c.y-p.y)>radius);
  }
  update(dt: number, bodies: Matter.Body[]) {
    this.elapsed+=dt;this.accumulator+=dt;
    if(this.accumulator<1000/30)return;
    const step=this.accumulator;this.accumulator=0;
    for(const source of this.sources) {
      const amount=Math.min(source.remaining,source.rate*step);source.remaining-=amount;
      if(this.blocked(source,bodies))continue;
      const x=Math.floor(source.x/CELL),y=Math.floor(source.y/CELL),id=key(x,y);
      const cell=this.water.get(id)||{x,y,h:0,east:0,south:0};
      cell.h+=amount;this.water.set(id,cell);
    }
    this.sources=this.sources.filter(s=>s.remaining>0);
    // Each shared edge transfers the same volume out of one cell and into its neighbor.
    // Inertial flux produces ripples; positivity limits keep sources and thin films stable.
    const blocked=new Map<string,boolean>();
    const isBlocked=(x:number,y:number)=>{const id=key(x,y);if(!blocked.has(id))blocked.set(id,this.blocked({x:x*CELL+5,y:y*CELL+5},bodies));return blocked.get(id)!;};
    for(const c of this.water.values())c.ice=Math.max(0,(c.ice||0)-step);
    for(const c of [...this.water.values()]) if(c.h>.012 && !c.ice) for(const [dx,dy] of directions) {
      const x=c.x+dx,y=c.y+dy,id=key(x,y);
      if(!this.water.has(id)&&!isBlocked(x,y))this.water.set(id,{x,y,h:0,east:0,south:0});
    }
    for(const c of this.water.values()) for(const axis of ['east','south'] as const) {
      const n=this.water.get(key(c.x+(axis==='east'?1:0),c.y+(axis==='south'?1:0)));
      if(!n||c.ice||n.ice||isBlocked(c.x,c.y)||isBlocked(n.x,n.y)){c[axis]=0;continue;}
      const flow=c[axis]*.58+(c.h-n.h)*.028;
      const flux=Math.max(-n.h*.09,Math.min(c.h*.09,flow));
      c.h-=flux;n.h+=flux;c[axis]=flux;
    }
    // Moving obstacles displace their water into reachable adjacent cells.
    for(const c of this.water.values()) if(c.h>0 && !c.ice && isBlocked(c.x,c.y)) {
      const neighbors=directions.map(([dx,dy])=>this.water.get(key(c.x+dx,c.y+dy))).filter((n):n is Water=>!!n&&!n.ice&&!isBlocked(n.x,n.y));
      if(neighbors.length){for(const n of neighbors)n.h+=c.h/neighbors.length;c.h=0;}
    }
    for(const [id,c] of this.water) {
      if(!c.ice)c.h=Math.max(0,c.h*Math.exp(-step/14000)-step*.0000008);
      if(c.h<.004)this.water.delete(id);
    }
    for(const tuft of [...this.grass.values()]) {
      tuft.ice=Math.max(0,tuft.ice-step);
      if(tuft.ice||tuft.fuel.burning||tuft.fuel.consumed>.3){tuft.next=Math.max(tuft.next,this.elapsed+1000);continue;}
      if(this.elapsed<tuft.next)continue;
      tuft.next=this.elapsed+2500+Math.random()*9000;
      const a=Math.random()*Math.PI*2,d=12+Math.random()*13;
      this.tuft({x:tuft.x+Math.cos(a)*d,y:tuft.y+Math.sin(a)*d},bodies);
    }
  }
  renderFloor(ctx: CanvasRenderingContext2D) {
    for(const {x,y} of this.tiles.values()) {
      const v=((x*17+y*31)%9+9)%9+37;
      ctx.fillStyle='#303733';ctx.fillRect(x*100,y*100,100,100);
      ctx.fillStyle=`rgb(${v},${v+7},${v+3})`;ctx.fillRect(x*100+2,y*100+2,96,96);
      ctx.strokeStyle='#ffffff05';ctx.strokeRect(x*100+4,y*100+4,92,92);
      for(const [dx,dy] of directions) if(!this.tiles.has(key(x+dx,y+dy))) {
        ctx.strokeStyle='#97977788';ctx.lineWidth=6;ctx.beginPath();
        const cx=x*100+50+dx*48,cy=y*100+50+dy*48;
        ctx.moveTo(cx-dy*50,cy-dx*50);ctx.lineTo(cx+dy*50,cy+dx*50);ctx.stroke();
      }
    }
  }
  renderLife(ctx: CanvasRenderingContext2D, reduced: boolean) {
    if(this.water.size) {
      this.surface ||= document.createElement('canvas');
      const b=this.bounds,w=(b.maxX-b.minX)/CELL,h=(b.maxY-b.minY)/CELL;
      if(this.surface.width!==w||this.surface.height!==h){this.surface.width=w;this.surface.height=h;}
      const off=this.surface.getContext('2d')!,pixels=off.createImageData(w,h);
      for(const c of this.water.values()) {
        const i=((c.y-b.minY/CELL)*w+c.x-b.minX/CELL)*4;
        const depth=Math.min(1,c.h),ripple=reduced?0:Math.sin(c.x*.7+c.y*.4-this.elapsed/500)*Math.min(.12,Math.abs(c.east)+Math.abs(c.south));
        const slope=(this.water.get(key(c.x-1,c.y))?.h||0)-(this.water.get(key(c.x+1,c.y))?.h||0);
        const shine=Math.min(55,Math.max(0,slope)*65)+ripple*100;
        const frost=c.ice?Math.min(1,c.ice/1200):0;
        const vein=Math.sin(c.x*.17+c.y*.12+Math.sin(c.y*.22))*Math.sin(c.y*.27-c.x*.08);
        pixels.data[i]=34+depth*7+shine+frost*(104+vein*17);pixels.data[i+1]=116+depth*25+shine+frost*(64+vein*13);pixels.data[i+2]=147+depth*25+shine+frost*55;pixels.data[i+3]=Math.min(195+frost*35,Math.max(0,c.h-.008)*(330+frost*230));
      }
      off.putImageData(pixels,0,0);ctx.save();ctx.imageSmoothingEnabled=true;
      ctx.drawImage(this.surface,b.minX,b.minY,w*CELL,h*CELL);
      ctx.restore();
    }
    for(const t of this.grass.values()) {
      const age=Math.min(1,(this.elapsed-t.born)/3000),seed=t.seed;
      const sway=reduced||t.ice?0:Math.sin(this.elapsed/1200+t.x*.012+t.y*.007)*2;
      ctx.strokeStyle='#172d1d66';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(t.x-3,t.y+2);ctx.lineTo(t.x+4,t.y+2);ctx.stroke();
      for(let i=0;i<5;i++) {
        const s=(seed*123+i*.618)%1,len=(8+s*15)*age*(1-t.fuel.consumed*.7),x=t.x+(i-2)*1.6;
        ctx.strokeStyle=t.ice?`hsl(${185+s*20} 28% ${65+s*23}%)`:`hsl(${83+s*36-t.fuel.consumed*50} ${29+s*22-t.fuel.consumed*20}% ${(22+s*24)*(1-t.fuel.consumed*.75)}%)`;ctx.lineWidth=.8+s*.8;
        ctx.beginPath();ctx.moveTo(x,t.y);ctx.quadraticCurveTo(x+(i-2)*2+sway*.4,t.y-len*.65,x+(i-2)*3+sway,t.y-len);ctx.stroke();
      }
      if(t.fuel.burning)drawFlame(ctx,t.x,t.y, t.ice?4:12+seed*7,this.elapsed,seed,reduced);
    }
  }
}
