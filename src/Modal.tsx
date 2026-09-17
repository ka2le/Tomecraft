import { useEffect, useRef } from 'react';
import { X } from 'lucide-react';
export default function Modal({ title, subtitle, onClose, children, wide = false }: { title: string; subtitle?: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const closeRef = useRef(onClose); closeRef.current=onClose;
  useEffect(()=>{const el=dialog.current!;el.showModal();const cancel=(e:Event)=>{e.preventDefault();closeRef.current();};el.addEventListener('cancel',cancel);return()=>{el.removeEventListener('cancel',cancel);el.close();};},[]);
  return <dialog ref={dialog} className={`modal ${wide?'modal-wide':''}`} aria-labelledby="modal-title" onClick={e=>{if(e.target===dialog.current){const r=dialog.current!.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)onClose();}}}><div className="modal-heading"><div><span className="eyebrow">TOMECRAFT · THE SCRIBE’S DESK</span><h2 id="modal-title">{title}</h2>{subtitle&&<p>{subtitle}</p>}</div><button className="icon-button" aria-label="Close dialog" onClick={onClose}><X size={21}/></button></div>{children}</dialog>;
}
