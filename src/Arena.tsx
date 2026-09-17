import { useEffect, useRef, useState } from 'react';
import { ChevronDown, Maximize, Minus, Plus, RotateCcw } from 'lucide-react';
import { SpellEngine, ROOM } from './engine';
import type { Point } from './engine';
import type { Spell } from './spells';
import { SpellIcon } from './Icons';
import { useHold } from './hooks';

type Camera = { x: number; y: number; zoom: number };
function QuickSlot({ spell, index, active, onSelect, onAssign }: { spell: Spell; index: number; active: boolean; onSelect: () => void; onAssign: () => void }) {
  const {handlers, held} = useHold(onAssign);
  return <div className={`quick-slot ${active ? 'selected' : ''}`} style={{'--spell-color': spell.color} as React.CSSProperties}><button className="slot-main" {...handlers} title={`${spell.title} · ${index+1}`} aria-pressed={active} aria-label={`Select ${spell.title}, quick slot ${index+1}`} onClick={() => { if(!held.current) onSelect(); }}><span className="slot-number">{index+1}</span><SpellIcon spell={spell} size={26}/></button><button className="slot-assign" aria-label={`Assign quick slot ${index+1}`} onClick={onAssign}><ChevronDown size={13}/></button></div>;
}

export default function Arena({ spells, slots, onSlots, activeId, onActive, visible, notify }: { spells: Spell[]; slots: string[]; onSlots: (slots: string[]) => void; activeId: string; onActive: (id: string) => void; visible: boolean; notify: (text: string) => void }) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const game = useRef<SpellEngine | null>(null);
  const camera = useRef<Camera>({x:700,y:500,zoom:1});
  const frame = useRef(0);
  const dimensions = useRef({width:1000,height:650,fit:1});
  const target = useRef<Point | null>(null);
  const active = spells.find(s=>s.id===activeId) || spells[0];
  const activeRef = useRef(active); activeRef.current = active;
  const notifyRef = useRef(notify); notifyRef.current = notify;
  const [count,setCount] = useState(10);
  const [castCount,setCastCount] = useState(0);
  const [zoom,setZoom] = useState(100);
  const [assign,setAssign] = useState<number | null>(null);
  const pointers = useRef(new Map<number,Point>());
  const drag = useRef({start:{x:0,y:0},last:{x:0,y:0},moved:false,pinched:false,distance:0,mid:{x:0,y:0}});
  const toWorld = (p: Point): Point => { const d=dimensions.current,c=camera.current,scale=d.fit*c.zoom;return{x:(p.x-d.width/2)/scale+c.x,y:(p.y-d.height/2)/scale+c.y}; };
  const local = (e: {clientX:number;clientY:number}) => {const rect=canvas.current!.getBoundingClientRect();return{x:e.clientX-rect.left,y:e.clientY-rect.top};};
  const boundCamera = () => { const b=game.current?.terrain.bounds; if(!b)return; camera.current.x=Math.min(b.maxX+150,Math.max(b.minX-150,camera.current.x));camera.current.y=Math.min(b.maxY+100,Math.max(b.minY-100,camera.current.y)); };
  const zoomAt = (amount: number, position?: Point) => { const d=dimensions.current, p=position || {x:d.width/2,y:d.height/2}, before=toWorld(p); camera.current.zoom=Math.min(4,Math.max(.65,camera.current.zoom*amount)); const after=toWorld(p);camera.current.x+=before.x-after.x;camera.current.y+=before.y-after.y;boundCamera();setZoom(Math.round(camera.current.zoom*100)); };
  const castAt = (point:Point) => { if(game.current?.cast(activeRef.current,point)) setCastCount(game.current.casts); else if(game.current?.castError) notifyRef.current(game.current.castError); };

  useEffect(()=>{
    game.current = new SpellEngine();
    return ()=>{game.current?.destroy();game.current=null;};
  },[]);
  useEffect(()=>{
    if(!visible || !canvas.current) return;
    const element=canvas.current, ctx=element.getContext('2d')!;
    const resize=()=>{const r=element.getBoundingClientRect();const dpr=Math.min(window.devicePixelRatio||1,2);element.width=r.width*dpr;element.height=r.height*dpr;dimensions.current={width:r.width,height:r.height,fit:Math.min(r.width/(ROOM.width+140),r.height/(ROOM.height+140))};};
    const observer=new ResizeObserver(resize);observer.observe(element);resize();
    const reduced=matchMedia('(prefers-reduced-motion: reduce)');
    let last=0,accumulator=0,stats=0;
    const loop=(time:number)=>{
      const elapsed=last?Math.min(time-last,50):16.67;last=time;const world=game.current;
      if(world && !document.hidden){accumulator+=elapsed;while(accumulator>=1000/60){world.update();accumulator-=1000/60;}
        const d=dimensions.current,c=camera.current,dpr=Math.min(window.devicePixelRatio||1,2),scale=d.fit*c.zoom;
        ctx.setTransform(dpr,0,0,dpr,0,0);ctx.fillStyle='#151d19';ctx.fillRect(0,0,d.width,d.height);ctx.save();ctx.translate(d.width/2,d.height/2);ctx.scale(scale,scale);ctx.translate(-c.x,-c.y);world.render(ctx,target.current,activeRef.current.color,reduced.matches);ctx.restore();
        if(time-stats>250){setCount(world.objects.length);stats=time;}
      }frame.current=requestAnimationFrame(loop);
    };frame.current=requestAnimationFrame(loop);
    const wheel=(e:WheelEvent)=>{e.preventDefault();zoomAt(Math.exp(-e.deltaY*.0015),local(e));};element.addEventListener('wheel',wheel,{passive:false});
    return()=>{cancelAnimationFrame(frame.current);observer.disconnect();element.removeEventListener('wheel',wheel);pointers.current.clear();};
  },[visible]);
  useEffect(()=>{
    if(!visible)return;
    const onKey=(e:KeyboardEvent)=>{if(e.target instanceof HTMLElement&&/INPUT|TEXTAREA|SELECT/.test(e.target.tagName))return;if(/^[1-8]$/.test(e.key)){onActive(slots[Number(e.key)-1]);setAssign(null);}if(e.key==='Escape')setAssign(null);};
    window.addEventListener('keydown',onKey);return()=>window.removeEventListener('keydown',onKey);
  },[visible,slots,onActive]);
  return <section className="arena-view" aria-label="Practice chamber" hidden={!visible}>
    <span className="sr-only"><span data-testid="object-count">{count}</span> objects · {castCount} casts</span>
    <div className="arena-window">
      <canvas ref={canvas} aria-label="Spell practice arena. Tap to cast, drag to pan, pinch or scroll to zoom. Arrow keys aim; Enter casts." tabIndex={0}
        onPointerDown={e=>{if(e.button!==0)return;setAssign(null);const p=local(e);canvas.current!.setPointerCapture(e.pointerId);pointers.current.set(e.pointerId,p);if(pointers.current.size===1)drag.current={start:p,last:p,moved:false,pinched:false,distance:0,mid:p};if(pointers.current.size===2){const [a,b]=[...pointers.current.values()];drag.current.pinched=true;drag.current.distance=Math.hypot(a.x-b.x,a.y-b.y);drag.current.mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};}}}
        onPointerMove={e=>{const p=local(e);target.current=toWorld(p);if(!pointers.current.has(e.pointerId))return;pointers.current.set(e.pointerId,p);const d=drag.current,scale=dimensions.current.fit*camera.current.zoom;
          if(pointers.current.size>=2){const[a,b]=[...pointers.current.values()],distance=Math.hypot(a.x-b.x,a.y-b.y),mid={x:(a.x+b.x)/2,y:(a.y+b.y)/2};if(d.distance>0)zoomAt(distance/d.distance,mid);camera.current.x-=(mid.x-d.mid.x)/scale;camera.current.y-=(mid.y-d.mid.y)/scale;d.distance=distance;d.mid=mid;d.moved=true;}
          else{if(Math.hypot(p.x-d.start.x,p.y-d.start.y)>7)d.moved=true;if(d.moved){camera.current.x-=(p.x-d.last.x)/scale;camera.current.y-=(p.y-d.last.y)/scale;}}d.last=p;boundCamera();}}
        onPointerUp={e=>{const d=drag.current;if(pointers.current.size===1&&!d.moved&&!d.pinched)castAt(toWorld(local(e)));pointers.current.delete(e.pointerId);if(pointers.current.size===1)d.last=[...pointers.current.values()][0];if(canvas.current!.hasPointerCapture(e.pointerId))canvas.current!.releasePointerCapture(e.pointerId);}}
        onPointerCancel={e=>{pointers.current.delete(e.pointerId);drag.current.moved=true;drag.current.pinched=true;}}
        onPointerLeave={()=>{if(!pointers.current.size)target.current=null;}}
        onKeyDown={e=>{const directions:Record<string,Point>={ArrowLeft:{x:-30,y:0},ArrowRight:{x:30,y:0},ArrowUp:{x:0,y:-30},ArrowDown:{x:0,y:30}};if(directions[e.key]){e.preventDefault();const p=target.current||{x:700,y:490},b=game.current?.terrain.bounds;if(b){target.current={x:Math.max(b.minX+5,Math.min(b.maxX-5,p.x+directions[e.key].x)),y:Math.max(b.minY+5,Math.min(b.maxY-5,p.y+directions[e.key].y))};camera.current.x=target.current.x;camera.current.y=target.current.y;}}if(e.key==='Enter'||e.key===' '){e.preventDefault();castAt(target.current||{x:700,y:490});}}}/>
      <div className="arena-tools"><button aria-label="Zoom in" onClick={()=>zoomAt(1.2)}><Plus size={17}/></button><span data-testid="zoom-level">{zoom}%</span><button aria-label="Zoom out" onClick={()=>zoomAt(1/1.2)}><Minus size={17}/></button><span className="tool-divider"/><button aria-label="Fit chamber to view" onClick={()=>{const b=game.current?.terrain.bounds;if(!b)return;const d=dimensions.current;const fit=Math.min(d.width/(b.maxX-b.minX+140),d.height/(b.maxY-b.minY+140))/d.fit;camera.current={x:(b.minX+b.maxX)/2,y:(b.minY+b.maxY)/2,zoom:fit};setZoom(Math.round(fit*100));}}><Maximize size={16}/></button><button aria-label="Reset chamber" title="Reset chamber" onClick={()=>{game.current?.clear();game.current?.seed();setCount(game.current?.objects.length||0);notify('The chamber has been restored.');}}><RotateCcw size={16}/></button></div>
      <div className="arena-vignette"/>
    </div>
    <div className="arena-bottom"><div className="quickbar" aria-label="Quick spell slots">{slots.map((id,i)=><QuickSlot key={i} spell={spells.find(s=>s.id===id)||spells[0]} index={i} active={active.id===id} onSelect={()=>{onActive(id);setAssign(null);}} onAssign={()=>setAssign(assign===i?null:i)}/>)}</div></div>
    {assign!==null&&<><button className="picker-backdrop" aria-label="Close spell picker" onClick={()=>setAssign(null)}/><div className="spell-picker" role="dialog" aria-label={`Choose a spell for slot ${assign+1}`}><div className="picker-heading">Bind to slot {assign+1}<button onClick={()=>setAssign(null)} aria-label="Close spell picker">×</button></div>{spells.map(s=><button key={s.id} className={slots[assign]===s.id?'bound':''} onClick={()=>{const next=[...slots];next[assign]=s.id;onSlots(next);onActive(s.id);setAssign(null);}}><span style={{color:s.color}}><SpellIcon spell={s} size={22}/></span><span>{s.title}<small>{s.school}</small></span>{slots[assign]===s.id&&<span className="bound-mark">✓</span>}</button>)}</div></>}
  </section>;
}
