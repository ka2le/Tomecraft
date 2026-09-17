export type Fuel = { heat: number; consumed: number; burning: boolean; wet: number };
export type HeatSource = { x: number; y: number; radius: number; strength: number };
export const newFuel = (): Fuel => ({ heat: 0, consumed: 0, burning: false, wet: 0 });

// Shared rules for living grass and timber: heat accumulates, moisture quenches,
// ice insulates, and fuel survives extinguishing with its previous charring.
export function burnFuel(fuel: Fuel, dt: number, heat: number, wet: boolean, frozen: boolean, lifetime: number) {
  if(wet) { fuel.wet=1800; fuel.heat=0; fuel.burning=false; }
  else fuel.wet=Math.max(0,fuel.wet-dt);
  if(fuel.wet>0)return;
  fuel.heat=Math.max(0,fuel.heat+dt*(heat*(frozen?.12:1)-(heat>0?0:.6)));
  if(fuel.heat>=450)fuel.burning=true;
  if(fuel.burning)fuel.consumed+=dt*(frozen?.08:1)/lifetime;
}

export function drawFlame(ctx: CanvasRenderingContext2D, x: number, y: number, size: number, time: number, seed: number, reduced: boolean) {
  const wave=reduced?0:Math.sin(time/130+seed*9),lean=wave*size*.17;
  ctx.save();
  const glow=ctx.createRadialGradient(x,y,0,x,y,size*1.8);glow.addColorStop(0,'#ff9d343d');glow.addColorStop(1,'#ed681000');
  ctx.fillStyle=glow;ctx.fillRect(x-size*1.8,y-size*1.8,size*3.6,size*3.6);
  for(let i=0;i<3;i++) {
    const h=size*(1.1+Math.sin(seed*13+i*2)*.22),w=size*(.32-i*.055),px=x+(i-1)*size*.22;
    const flame=ctx.createLinearGradient(px,y,px,y-h);flame.addColorStop(0,'#ffe7a6');flame.addColorStop(.35,'#ffb337');flame.addColorStop(.8,'#ec541ac0');flame.addColorStop(1,'#a8341100');
    ctx.fillStyle=flame;ctx.beginPath();ctx.moveTo(px-w,y);ctx.bezierCurveTo(px-w*1.4,y-h*.35,px+lean-w,y-h*.65,px+lean,y-h);ctx.bezierCurveTo(px+lean+w*.3,y-h*.55,px+w*1.8,y-h*.3,px+w,y);ctx.closePath();ctx.fill();
  }
  ctx.restore();
}

export function drawIce(ctx: CanvasRenderingContext2D, vertices: {x:number;y:number}[], fraction: number, seed: number) {
  const xs=vertices.map(p=>p.x),ys=vertices.map(p=>p.y),left=Math.min(...xs)-4,right=Math.max(...xs)+4,top=Math.min(...ys)-4,bottom=Math.max(...ys)+4;
  ctx.save();ctx.shadowBlur=0;ctx.shadowOffsetY=0;
  ctx.beginPath();vertices.forEach((p,i)=>i?ctx.lineTo(p.x*1.08,p.y*1.08):ctx.moveTo(p.x*1.08,p.y*1.08));ctx.closePath();
  const glass=ctx.createLinearGradient(left,top,right,bottom);glass.addColorStop(0,'#efffffaa');glass.addColorStop(.18,'#99d5e44d');glass.addColorStop(.48,'#407e9a38');glass.addColorStop(.6,'#daffff70');glass.addColorStop(.68,'#75afcd33');glass.addColorStop(1,'#b2edf58c');
  ctx.globalAlpha=.35+.65*fraction;ctx.fillStyle=glass;ctx.fill();ctx.strokeStyle='#d9ffffbb';ctx.lineWidth=1.4;ctx.stroke();ctx.clip();
  for(let i=0;i<5;i++) {
    const n=(Math.sin(seed*7+i*32.1)*43758.5)%1,x=left+(right-left)*Math.abs(n),y=top+(bottom-top)*(i+.3)/5;
    ctx.strokeStyle=i%2?'#e6ffff70':'#325f7955';ctx.lineWidth=.7;ctx.beginPath();ctx.moveTo(x,top);ctx.lineTo(x+(right-left)*.13,y);ctx.lineTo(x-(right-left)*.08,bottom);ctx.moveTo(x+(right-left)*.13,y);ctx.lineTo(right,y-(bottom-top)*.17);ctx.stroke();
  }
  ctx.restore();
}
