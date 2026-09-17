import { spellSchema, starterSpells } from './spells';
import type { Spell } from './spells';
export const STORAGE_KEY = 'tomecraft-library-v1';
export type Library = { spells: Spell[]; slots: string[] };
export function loadLibrary(): Library & { warning?: string } {
  const fallback = { spells: starterSpells, slots: starterSpells.filter(s => s.id !== 'unmake').slice(0, 8).map(s => s.id) };
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const value = JSON.parse(raw);
    if (value.version !== 1 || !Array.isArray(value.spells) || value.spells.length > 100) throw new Error();
    const spells = value.spells.map((s: unknown) => spellSchema.parse(s));
    if (!spells.length || new Set(spells.map((s: Spell) => s.id)).size !== spells.length) throw new Error();
    const ids = new Set(spells.map((s: Spell) => s.id));
    if ((value.starterRevision || 1) < 2) {
      for (const spell of starterSpells.slice(5)) if (!ids.has(spell.id) && spells.length < 100) { spells.push(spell); ids.add(spell.id); }
    }
    const newSlots = starterSpells.slice(5).filter(s => ids.has(s.id));
    const slots = Array.from({length: 8}, (_, i) => typeof value.slots?.[i] === 'string' && ids.has(value.slots[i]) ? value.slots[i] : (i >= 4 ? newSlots[i - 4]?.id : undefined) || spells[i % spells.length].id);
    return { spells, slots };
  } catch { return { ...fallback, warning: 'Your saved tome could not be read. The starter spells are open; your original save has not been overwritten.' }; }
}
export function saveLibrary(library: Library): void {
  localStorage.setItem(STORAGE_KEY, JSON.stringify({ version: 1, starterRevision: 2, ...library }));
}
export function downloadLibrary(library: Library): void {
  const blob = new Blob([JSON.stringify({ version: 1, ...library }, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a'); a.href = url; a.download = 'tomecraft-grimoire.json'; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
