import { useCallback, useEffect, useRef, useState } from 'react';
import { BookOpen, Plus, ScrollText, Swords, Feather, Check, List, Copy, Download, Upload, ChevronRight, X, Sparkles } from 'lucide-react';
import Book from './Book';
import type { EditSection } from './Book';
import Arena from './Arena';
import Editor, { copyText } from './Editor';
import Modal from './Modal';
import { SpellIcon } from './Icons';
import { AUTHORING_PROMPT, newSpell, spellSchema } from './spells';
import type { Spell } from './spells';
import { downloadLibrary, loadLibrary, saveLibrary } from './storage';
import type { Library } from './storage';

export default function App() {
  const [library,setLibrary] = useState(loadLibrary);
  const [selected,setSelected] = useState(0);
  const [view,setView] = useState<'tome'|'arena'>('tome');
  const [activeId,setActiveId] = useState(library.spells[0].id);
  const [modal,setModal] = useState<'guide'|'contents'|null>(null);
  const [editor,setEditor] = useState<{spell:Spell;section:EditSection;isNew:boolean}|null>(null);
  const [toast,setToast] = useState(library.warning||'');
  const [importError,setImportError] = useState('');
  const [saveError,setSaveError] = useState(false);
  const toastTimer = useRef<ReturnType<typeof setTimeout>|null>(null);
  const importInput = useRef<HTMLInputElement>(null);
  const notify = useCallback((message:string)=>{setToast(message);if(toastTimer.current)clearTimeout(toastTimer.current);toastTimer.current=setTimeout(()=>setToast(''),6500);},[]);
  useEffect(()=>()=>{if(toastTimer.current)clearTimeout(toastTimer.current);},[]);
  const commit=(next:Library):string|null=>{try{saveLibrary(next);setLibrary(next);setSaveError(false);return null;}catch{setSaveError(true);return 'The device could not save this change. Storage may be full or disabled. Export your current tome, reduce image sizes, and try again.';}};
  const saveSpell=(spell:Spell):string|null=>{
    if(library.spells.some(s=>s.id===spell.id&&(editor?.isNew||s.id!==editor?.spell.id)))return 'A spell with this ID already exists. Change the id in Spell code to make it unique.';
    if(editor?.isNew&&library.spells.length>=100)return 'This tome holds up to 100 spells. Export a volume before starting another.';
    const spells=editor?.isNew?[...library.spells,spell]:library.spells.map(s=>s.id===editor?.spell.id?spell:s);
    const slots=library.slots.map(id=>id===editor?.spell.id&&!editor.isNew?spell.id:id);
    const problem=commit({spells,slots});if(problem)return problem;
    if(activeId===editor?.spell.id)setActiveId(spell.id);setSelected(spells.findIndex(s=>s.id===spell.id));setEditor(null);notify(`${spell.title} has been inscribed.`);return null;
  };
  const deleteSpell=()=>{if(!editor||library.spells.length===1)return;const spells=library.spells.filter(s=>s.id!==editor.spell.id);const slots=library.slots.map(id=>id===editor.spell.id?spells[0].id:id);const problem=commit({spells,slots});if(problem){notify(problem);return;}setSelected(Math.min(selected,spells.length-1));if(activeId===editor.spell.id)setActiveId(spells[0].id);setEditor(null);notify('The spell has been removed.');};
  const importTome=async(file:File)=>{
    setImportError('');try{
      if(file.size>8000000)throw new Error('Choose a tome smaller than 8 MB.');
      const value=JSON.parse(await file.text());if(value.version!==1)throw new Error('This file uses an unsupported tome version.');
      const incoming:Spell[]=(Array.isArray(value.spells)?value.spells:[value]).map((s:unknown)=>spellSchema.parse(s));
      if(!incoming.length||incoming.length>100)throw new Error('Import between 1 and 100 spells.');
      const spells=[...library.spells];let added=0;
      for(const candidate of incoming){if(spells.some(s=>JSON.stringify(s)===JSON.stringify(candidate)))continue;let id=candidate.id;let suffix=2;while(spells.some(s=>s.id===id))id=`${candidate.id.slice(0,54)}-${suffix++}`;spells.push({...candidate,id});added++;}
      if(spells.length>100)throw new Error('The combined tome would exceed 100 spells.');
      const problem=commit({spells,slots:library.slots});if(problem)throw new Error(problem);notify(`${added} ${added===1?'spell':'spells'} added to your tome. Existing spells were kept.`);
    }catch(e){setImportError(e instanceof Error?e.message:'This tome could not be read.');}
  };
  const openEdit=(section:EditSection)=>setEditor({spell:library.spells[selected],section,isNew:false});
  const anyModal=!!modal||!!editor;
  return <div className={`app ${view==='arena'?'is-arena':''}`}>
    <header className="masthead"><a href="./" onClick={e=>{e.preventDefault();setView('tome');}} className="brand" aria-label="Tomecraft home"><BookOpen size={26}/><span>TOMECRAFT</span></a><div className="masthead-center"><span>✧</span> AN EVER-GROWING GRIMOIRE <span>✧</span></div><span className={`save-status ${saveError?'has-error':''}`} title={saveError?'A change could not be saved':'Your tome is saved in this browser. Export it from Contents for a backup.'}><Check size={13}/>{saveError?'Save needs attention':'Saved on this device'}</span></header>
    <main><div className="workspace-toolbar"><div className="volume-label">{view==='tome'?<Feather size={17}/>:<Swords size={17}/>}<span>{view==='tome'?'My grimoire':'Practice chamber'}</span><span className="volume-divider">/</span><small>{view==='tome'?'Volume I':'Experiment freely'}</small></div><div className="toolbar-actions"><button className="quiet-button" aria-label="Contents" onClick={()=>{setImportError('');setModal('contents');}}><List size={16}/><span>Contents</span></button><button className="quiet-button" aria-label="Spellwright’s guide" onClick={()=>setModal('guide')}><ScrollText size={16}/><span>Spellwright’s guide</span></button><button className="gold-button" onClick={()=>setEditor({spell:newSpell(),section:'details',isNew:true})}><Plus size={16}/> Inscribe a spell</button></div></div>
      {view==='tome'&&<Book spells={library.spells} selected={selected} setSelected={setSelected} onEdit={openEdit} onCast={()=>{setActiveId(library.spells[selected].id);setView('arena');}}/>}
      <Arena spells={library.spells} slots={library.slots} activeId={activeId} onActive={setActiveId} onSlots={slots=>{const problem=commit({spells:library.spells,slots});if(problem)notify(problem);}} visible={view==='arena'&&!anyModal} notify={notify}/>
    </main>
    <footer className="app-footer"><span className="footer-ornament">✧</span><span>{library.spells.length} spells inscribed <span className="footer-dot">·</span><span>A lifetime of discoveries ahead</span></span></footer><button className="view-toggle" onClick={()=>setView(v=>v==='tome'?'arena':'tome')}>{view==='tome'?<Swords size={18}/>:<BookOpen size={18}/>}<span>{view==='tome'?'Practice chamber':'Return to grimoire'}</span><span className="key-hint">{view==='tome'?'↗':'↙'}</span></button>
    {toast&&<div className="toast" role="status"><Sparkles size={17}/><span>{toast}</span><button onClick={()=>setToast('')} aria-label="Dismiss message"><X size={16}/></button></div>}
    {editor&&<Editor spell={editor.spell} initialSection={editor.section} isNew={editor.isNew} onSave={saveSpell} onClose={()=>setEditor(null)} onDelete={!editor.isNew&&library.spells.length>1?deleteSpell:undefined} notify={notify}/>}
    {modal==='guide'&&<Modal title="The spellwright’s guide" subtitle="Give your imagination a language the tome understands." onClose={()=>setModal(null)} wide><div className="guide-body"><ol className="guide-steps"><li><span>01</span><div><h3>Borrow a little intelligence</h3><p>Copy the instructions below and send them to your favorite LLM, together with the spell you imagine.</p></div></li><li><span>02</span><div><h3>Bring the words back</h3><p>Choose “Inscribe a spell”, open “Spell code”, and replace the example with the returned JSON code block.</p></div></li><li><span>03</span><div><h3>See what you have made</h3><p>Add it to your grimoire. Try it in the chamber, then refine its words, symbols, and effects.</p></div></li></ol><div className="guide-copy-heading"><h3>Instructions for your LLM</h3><button className="gold-button" onClick={async()=>notify(await copyText(AUTHORING_PROMPT)?'Spellwright instructions copied. Add your spell idea and send them to your LLM.':'Clipboard unavailable. Select the instructions below and copy them manually.')}><Copy size={16}/> Copy instructions</button></div><label className="sr-only" htmlFor="authoring-prompt">Copyable LLM instructions</label><textarea id="authoring-prompt" className="prompt-textarea" readOnly value={AUTHORING_PROMPT}/><div className="guide-note"><Feather size={22}/><p>The language supports conjuration, living slimes, glowing lights, resizing, particles, projectiles, forces, and unmaking. Effects run in the chamber; the tome renders their bindings as runes. Your spells stay in this browser. Export a backup from Contents.</p></div></div></Modal>}
    {modal==='contents'&&<Modal title="Within these pages" subtitle={`${library.spells.length} spells, and room for many more.`} onClose={()=>setModal(null)}><div className="contents-list">{library.spells.map((s,i)=><button key={s.id} className={i===selected?'current':''} onClick={()=>{setSelected(i);setView('tome');setModal(null);}}><span className="contents-icon" style={{color:s.color}}><SpellIcon spell={s} size={24}/></span><span className="contents-title">{s.title}<small>{s.school}</small></span><span className="contents-page">{String(i*2+1).padStart(2,'0')}</span><ChevronRight size={16}/></button>)}</div><div className="contents-footer"><p>Your tome lives on this device. Carry a copy with you.</p><div className="button-row"><button className="gold-button" onClick={()=>{downloadLibrary(library);notify('Your tome has been exported. Keep the JSON file as a backup.');}}><Download size={16}/> Export tome</button><button className="quiet-button" onClick={()=>importInput.current?.click()}><Upload size={16}/> Import spells</button><input ref={importInput} type="file" className="sr-only" accept=".json,application/json" aria-label="Import tome file" onChange={e=>{if(e.target.files?.[0])void importTome(e.target.files[0]);e.target.value='';}}/></div><p className="field-help">Imports add to your tome. Existing spells are kept.</p>{importError&&<pre className="form-error" role="alert">{importError}</pre>}</div></Modal>}
  </div>;
}
