import { useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight, Pencil, WandSparkles, BookOpen } from 'lucide-react';
import { SpellIcon } from './Icons';
import { useHold, useMobile } from './hooks';
import { runesFor } from './spells';
import type { Block, Spell } from './spells';

export type EditSection = 'details' | 'code' | 'extras';
const roman = (n: number) => ['I', 'II', 'III', 'IV', 'V', 'VI', 'VII', 'VIII', 'IX', 'X'][n - 1] || n.toString();
function Extra({ block }: { block: Block }) {
  return block.kind === 'text' ? <p className="extra-note">{block.content}</p> : <figure className="extra-image"><img src={block.content} alt={block.caption || 'Spell illustration'} loading="lazy" />{block.caption && <figcaption>{block.caption}</figcaption>}</figure>;
}
function Editable({ children, onEdit, label, className = '' }: { children: React.ReactNode; onEdit: () => void; label: string; className?: string }) {
  const { handlers } = useHold(onEdit);
  return <div {...handlers} className={`editable ${className}`}><button className="edit-corner" aria-label={label} onClick={onEdit}><Pencil size={13} /></button>{children}</div>;
}
function Leaf({ spell, side, index, onEdit }: { spell: Spell; side: 'lore' | 'formula'; index: number; onEdit: (section: EditSection) => void }) {
  const lines = runesFor(spell);
  return <article className={`paper-leaf ${side}`} data-testid={`${side}-page`}>
    <div className="page-topline"><span>{side === 'lore' ? 'ARS ARCANA' : 'FORMULAE & OBSERVATIONS'}</span><span>{roman(index + 1)} · {spell.school}</span></div>
    <div className="leaf-scroll">
      {side === 'lore' ? <>
        <Editable label="Edit spell title and description" onEdit={() => onEdit('details')}>
          <div className="spell-heading"><div><span className="eyebrow">{spell.school}</span><h1>{spell.title}</h1></div><div className="spell-seal" style={{ color: spell.color }}><SpellIcon spell={spell} size={30} /></div></div>
          <p className="spell-subtitle">{spell.subtitle}</p>
        </Editable>
        {spell.blocks.filter(b => b.placement === 'before').map(b => <Editable key={b.id} label="Edit additional content" onEdit={() => onEdit('extras')}><Extra block={b} /></Editable>)}
        <div className={`spell-illustration ${spell.id === 'fireball' ? 'fire-study' : ''}`} aria-hidden="true">
          {spell.id === 'fireball' ? <img src={`${import.meta.env.BASE_URL}fireball-study.png`} alt="" /> : <div className="alchemical-diagram" style={{ color: spell.color }}><div className="diagram-ring" /><div className="diagram-diamond" /><SpellIcon spell={spell} size={76} /><span className="rune-north">ᚷ ᚨ ᛚ</span><span className="rune-south">ᛏ ⟡ ᛒ</span></div>}
          <span className="figure-label">Fig. {roman(index + 1)} — {spell.school.toLowerCase()} study</span>
        </div>
        <Editable label="Edit spell description" onEdit={() => onEdit('details')}><div className="spell-description">{spell.description.split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div></Editable>
      </> : <>
        <div className="formula-heading"><span className="little-star">✧</span><h2>The incantation</h2><span className="little-star">✧</span></div>
        <p className="formula-subtitle">An arrangement of intent.</p>
        <Editable label="Edit spell code" onEdit={() => onEdit('code')} className="rune-edit">
          <div className="rune-manuscript" aria-label="Spell code written in runes">
            <div className="rune-dedication">ᚠ ᚨ ᛚ ᛖ ᚾ &nbsp; ⟡ &nbsp; ᛊ ᛈ ᛁ ᚱ ᚨ</div>
            {lines.map((line, i) => <div className="rune-line" key={i}><span className="rune-number">{roman(i + 1)}</span><span>{line}</span></div>)}
            <div className="rune-closing">⸻ &nbsp; ᛖᛊᛏ &nbsp; ⟡ &nbsp; ᚠᛁᚨᛏ &nbsp; ⸻</div>
          </div>
          <div className="code-caption"><span>{spell.actions.length} {spell.actions.length === 1 ? 'binding' : 'bindings'} · Spellscript v1</span><span><Pencil size={12} /> Hold to decipher</span></div>
        </Editable>
        <div className="manuscript-divider"><span>✧</span></div>
        <Editable label="Edit spell notes" onEdit={() => onEdit('details')}><h3 className="notes-heading">Notes in the margin</h3><div className="spell-notes">{(spell.notes || 'There is still much to discover.').split('\n\n').map((p, i) => <p key={i}>{p}</p>)}</div></Editable>
        {spell.blocks.filter(b => b.placement === 'after').map(b => <Editable key={b.id} label="Edit additional content" onEdit={() => onEdit('extras')}><Extra block={b} /></Editable>)}
        <div className="author-mark"><span>Per aspera, ad arcana.</span><span>ᛟ</span></div>
      </>}
    </div>
    <div className="page-footer"><span>{side === 'lore' ? 'THE FIRST GRIMOIRE' : 'TOMECRAFT'}</span><span>{roman(index * 2 + (side === 'lore' ? 1 : 2))}</span></div>
  </article>;
}

export default function Book({ spells, selected, setSelected, onEdit, onCast }: { spells: Spell[]; selected: number; setSelected: (i: number) => void; onEdit: (s: EditSection) => void; onCast: () => void }) {
  const mobile = useMobile();
  const [leaf, setLeaf] = useState(0);
  const [turn, setTurn] = useState<'next' | 'previous' | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const internalNavigation = useRef(false);
  const touch = useRef<{x: number; y: number; time: number} | null>(null);
  const spell = spells[selected];
  useEffect(() => { if (!internalNavigation.current) setLeaf(0); internalNavigation.current = false; }, [selected]);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  const page = selected * 2 + (mobile ? leaf : 0);
  const move = (direction: number) => {
    if (turn) return;
    const next = page + direction * (mobile ? 1 : 2);
    if (next < 0 || next >= spells.length * 2) return;
    setTurn(direction > 0 ? 'next' : 'previous');
    timer.current = setTimeout(() => {
      const nextSpell = Math.floor(next / 2);
      internalNavigation.current = nextSpell !== selected;
      setSelected(nextSpell);
      setLeaf(next % 2);
      setTurn(null);
    }, 220);
  };
  useEffect(() => {
    const keyboard = (e: KeyboardEvent) => { if (document.querySelector('dialog[open]') || (e.target instanceof HTMLElement && /INPUT|TEXTAREA|SELECT/.test(e.target.tagName))) return; if (e.key === 'ArrowRight') move(1); if (e.key === 'ArrowLeft') move(-1); };
    window.addEventListener('keydown', keyboard); return () => window.removeEventListener('keydown', keyboard);
  });
  return <section className="tome-view" aria-label="Your spellbook">
    <div className="book-wrapper">
      <div className={`book-shell ${turn ? `turn-${turn}` : ''}`} onDragStart={e => e.preventDefault()} onPointerDown={e => { if (e.button === 0 && !(e.target as HTMLElement).closest('button')) touch.current = {x: e.clientX, y: e.clientY, time: Date.now()}; }} onPointerUp={e => {
        const start = touch.current; touch.current = null;
        if (!start || Date.now() - start.time > 1800) return;
        const dx = e.clientX - start.x, dy = e.clientY - start.y;
        if (Math.abs(dx) > 55 && Math.abs(dx) > Math.abs(dy) * 1.5) move(dx < 0 ? 1 : -1);
      }} onPointerCancel={() => { touch.current = null; }}>
        <div className="book-pages" key={`${spell.id}-${mobile ? leaf : 'spread'}`}>
          {(!mobile || leaf === 0) && <Leaf spell={spell} side="lore" index={selected} onEdit={onEdit} />}
          {(!mobile || leaf === 1) && <Leaf spell={spell} side="formula" index={selected} onEdit={onEdit} />}
        </div>
        {!mobile && <div className="book-gutter" />}
      </div>
      <nav className="book-ribbons" aria-label="Spell bookmarks">{spells.slice(0, 7).map((s, i) => <button key={s.id} title={s.title} aria-label={`Open ${s.title}`} aria-current={selected === i ? 'page' : undefined} className={selected === i ? 'active' : ''} style={{ '--ribbon-color': s.color } as React.CSSProperties} onClick={() => { setSelected(i); setLeaf(0); }}><SpellIcon spell={s} size={21} /></button>)}</nav>
    </div>
    <div className="book-navigation"><span className="hold-hint"><Pencil size={13} /> Hold any inscription to edit</span><div className="page-navigation"><button onClick={() => move(-1)} disabled={page === 0} aria-label="Previous page"><ChevronLeft size={19} /></button><span aria-live="polite">{String(page + 1).padStart(2, '0')}{!mobile && ` — ${String(page + 2).padStart(2, '0')}`}<i>/</i>{String(spells.length * 2).padStart(2, '0')}</span><button onClick={() => move(1)} disabled={page >= spells.length * 2 - (mobile ? 1 : 2)} aria-label="Next page"><ChevronRight size={19} /></button></div><button className="practice-link" onClick={onCast}><WandSparkles size={16} /> Try this spell <ChevronRight size={14} /></button></div>
    <p className="mobile-book-hint"><BookOpen size={13} /> Swipe to turn · Hold an inscription to edit</p>
  </section>;
}
