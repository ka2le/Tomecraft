import Matter from 'matter-js';

type Point = { x: number; y: number };
type Water = Point & { h: number; east: number; south: number };
type Tuft = Point & { born: number; seed: number; next: number };
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
  constructor(private world: Matter.World) { this.reset(); }
  reset() {
    this.tiles.clear(); this.water.clear(); this.grass.clear(); this.sources = [];
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
    for(const {x,y} of tiles) for(const [dx,dy] of directions) if(!this.tiles.has(key(x+dx,y+dy))) {
      this.walls.push(Matter.Bodies.rectangle(x*100+50+dx*55,y*100+50+dy*55,dx?10:110,dy?10:110,{isStatic:true}));
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
    this.grass.set(id,{...p,born:this.elapsed,seed:Math.random(),next:this.elapsed+1800+Math.random()*6500});
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
      if(this.blocked(source,bodies))continue;
      const x=Math.floor(source.x/CELL),y=Math.floor(source.y/CELL),id=key(x,y);
      const cell=this.water.get(id)||{x,y,h:0,east:0,south:0};
      const amount=Math.min(source.remaining,source.rate*step);cell.h+=amount;source.remaining-=amount;this.water.set(id,cell);
    }
    this.sources=this.sources.filter(s=>s.remaining>0);
    // Each shared edge transfers the same volume out of one cell and into its neighbor.
    // Inertial flux produces ripples; positivity limits keep sources and thin films stable.
    const blocked=new Map<string,boolean>();
    const isBlocked=(x:number,y:number)=>{const id=key(x,y);if(!blocked.has(id))blocked.set(id,this.blocked({x:x*CELL+5,y:y*CELL+5},bodies));return blocked.get(id)!;};
    for(const c of [...this.water.values()]) if(c.h>.002) for(const [dx,dy] of directions) {
      const x=c.x+dx,y=c.y+dy,id=key(x,y);
      if(!this.water.has(id)&&!isBlocked(x,y))this.water.set(id,{x,y,h:0,east:0,south:0});
    }
    for(const c of this.water.values()) for(const axis of ['east','south'] as const) {
      const n=this.water.get(key(c.x+(axis==='east'?1:0),c.y+(axis==='south'?1:0)));
      if(!n||isBlocked(c.x,c.y)||isBlocked(n.x,n.y)){c[axis]=0;continue;}
      const flow=c[axis]*.78+(c.h-n.h)*.12;
      const flux=Math.max(-n.h*.22,Math.min(c.h*.22,flow));
      c.h-=flux;n.h+=flux;c[axis]=flux;
    }
    // Moving obstacles displace their water into reachable adjacent cells.
    for(const c of this.water.values()) if(c.h>0 && isBlocked(c.x,c.y)) {
      const neighbors=directions.map(([dx,dy])=>this.water.get(key(c.x+dx,c.y+dy))).filter((n):n is Water=>!!n&&!isBlocked(n.x,n.y));
      if(neighbors.length){for(const n of neighbors)n.h+=c.h/neighbors.length;c.h=0;}
    }
    for(const [id,c] of this.water) if(c.h===0 && c.east===0 && c.south===0)this.water.delete(id);
    for(const tuft of [...this.grass.values()]) if(this.elapsed>=tuft.next) {
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
        pixels.data[i]=34+depth*7+shine;pixels.data[i+1]=116+depth*25+shine;pixels.data[i+2]=147+depth*25+shine;pixels.data[i+3]=Math.min(195,Math.max(0,c.h-.008)*330);
      }
      off.putImageData(pixels,0,0);ctx.save();ctx.imageSmoothingEnabled=true;
      ctx.drawImage(this.surface,b.minX,b.minY,w*CELL,h*CELL);
      ctx.strokeStyle='#caf4ec66';ctx.lineWidth=1;
      for(const c of this.water.values()) if(c.h>.06 && c.h<.25 && (c.x*17+c.y*31)%7===0) {
        const x=c.x*CELL+5,y=c.y*CELL+5;
        ctx.beginPath();ctx.ellipse(x,y,4,1.3,-.3,0,Math.PI);ctx.stroke();
      }
      ctx.restore();
    }
    for(const t of this.grass.values()) {
      const age=Math.min(1,(this.elapsed-t.born)/3000),seed=t.seed;
      const sway=reduced?0:Math.sin(this.elapsed/1200+t.x*.012+t.y*.007)*2;
      ctx.strokeStyle='#172d1d66';ctx.lineWidth=4;ctx.beginPath();ctx.moveTo(t.x-3,t.y+2);ctx.lineTo(t.x+4,t.y+2);ctx.stroke();
      for(let i=0;i<5;i++) {
        const s=(seed*123+i*.618)%1,len=(8+s*15)*age,x=t.x+(i-2)*1.6;
        ctx.strokeStyle=`hsl(${83+s*36} ${29+s*22}% ${22+s*24}%)`;ctx.lineWidth=.8+s*.8;
        ctx.beginPath();ctx.moveTo(x,t.y);ctx.quadraticCurveTo(x+(i-2)*2+sway*.4,t.y-len*.65,x+(i-2)*3+sway,t.y-len);ctx.stroke();
      }
    }
  }
}
