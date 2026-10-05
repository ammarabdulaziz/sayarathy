import { useEffect, useRef, type ReactNode } from 'react';
import { X, CarFront } from 'lucide-react';
export function Modal({ title, children, onClose, busy = false, wide = false }: { title: string; children: ReactNode; onClose: () => void; busy?: boolean; wide?: boolean }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose); closeRef.current = onClose;
  const busyRef = useRef(busy); busyRef.current = busy;
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const focus = ref.current?.querySelector<HTMLElement>('input,textarea,select') || ref.current?.querySelector<HTMLElement>('button'); focus?.focus();
    const key = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !busyRef.current) closeRef.current();
      if (event.key === 'Tab') {
        const nodes = [...(ref.current?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled),select:not(:disabled),textarea:not(:disabled),a[href]') || [])].filter(e => e.getClientRects().length);
        if (!nodes.length) { event.preventDefault(); return; }
        if (event.shiftKey && document.activeElement === nodes[0]) { event.preventDefault(); nodes[nodes.length - 1].focus(); }
        else if (!event.shiftKey && document.activeElement === nodes[nodes.length - 1]) { event.preventDefault(); nodes[0].focus(); }
      }
    };
    const oldOverflow = document.body.style.overflow; document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', key);
    return () => { document.body.style.overflow = oldOverflow; document.removeEventListener('keydown', key); previous?.focus(); };
  }, []);
  return <div className="modal-backdrop"><div className={`modal ${wide ? 'wide' : ''}`} ref={ref} role="dialog" aria-modal="true" aria-label={title}><div className="modal-heading"><h2>{title}</h2><button className="icon-button" aria-label="Close dialog" disabled={busy} onClick={onClose}><X size={20} /></button></div>{children}</div></div>;
}
export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return <div className="empty-state"><CarFront size={32} strokeWidth={1.4} /><h3>{title}</h3><p>{children}</p>{action}</div>;
}
export function Badge({ kind = '', children }: { kind?: string; children: ReactNode }) { return <span className={`badge ${kind}`}>{children}</span>; }
export function CarDrawing() {
  return <svg className="car-drawing" viewBox="0 0 430 155" fill="none" aria-hidden="true"><path d="M35 99 43 79l65-10 48-35h109l56 39 64 11 12 25-10 12h-36M35 99v21h31m48 0h174" stroke="currentColor" strokeWidth="3" strokeLinejoin="round"/><path d="m120 70 43-29h94l40 29H120Zm83-28v29m-68 13h19m68 0h19M47 88h31m276 7h29" stroke="currentColor" strokeWidth="2" strokeLinejoin="round"/><circle cx="90" cy="118" r="25" stroke="currentColor" strokeWidth="3"/><circle cx="90" cy="118" r="12" stroke="currentColor" strokeWidth="2"/><circle cx="318" cy="118" r="25" stroke="currentColor" strokeWidth="3"/><circle cx="318" cy="118" r="12" stroke="currentColor" strokeWidth="2"/><path d="M23 147h383" stroke="currentColor" opacity=".15" strokeWidth="2"/></svg>;
}
