import { useEffect, useRef, useState } from 'react';
import type { PointerEvent as ReactPointerEvent } from 'react';

export function useMobile() {
  const [mobile, setMobile] = useState(() => matchMedia('(max-width: 760px)').matches);
  useEffect(() => { const query = matchMedia('(max-width: 760px)'); const update = () => setMobile(query.matches); query.addEventListener('change', update); return () => query.removeEventListener('change', update); }, []);
  return mobile;
}
export function useHold(callback: () => void, duration = 550) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const start = useRef({ x: 0, y: 0 });
  const held = useRef(false);
  const clear = () => { if (timer.current) clearTimeout(timer.current); timer.current = null; };
  useEffect(() => clear, []);
  return {
    held,
    handlers: {
      onPointerDown: (e: ReactPointerEvent) => { if (e.button !== 0) return; clear(); held.current = false; start.current = { x: e.clientX, y: e.clientY }; timer.current = setTimeout(() => { held.current = true; callback(); }, duration); },
      onPointerMove: (e: ReactPointerEvent) => { if (Math.hypot(e.clientX - start.current.x, e.clientY - start.current.y) > 9) clear(); },
      onPointerUp: clear, onPointerCancel: clear, onPointerLeave: clear,
      onContextMenu: (e: React.MouseEvent) => e.preventDefault(),
    },
  };
}
