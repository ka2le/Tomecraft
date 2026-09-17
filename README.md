# Tomecraft

A mobile-first spellcrafting game: an ancient, editable grimoire and a physical practice chamber. Built with React, TypeScript, Vite, Matter.js, Zod, Lucide, and locally bundled fonts. Hosted as a static site on GitHub Pages.

## Play

- **Tome:** two facing leaves on desktop, one leaf on mobile. Swipe horizontally, use the arrow buttons, or press Left/Right to turn. Long-press inscriptions to edit; pencil buttons provide keyboard and mouse access. Overflowing inscriptions scroll within a leaf.
- **Craft:** open **Spellwright’s guide**, copy its instructions to an LLM with your spell idea, then paste the returned JSON into **Inscribe a spell → Spell code**. Add it to the grimoire and choose **Try this spell**.
- **Decorate:** edit title, icon, color, lore, and handwritten notes. Add and reorder text or image blocks before the description or after the incantation. Uploaded images must be PNG/JPEG/WebP/GIF and under 1 MB.
- **Chamber:** select a quick slot and tap the room to cast. Hold a slot, or use its chevron, to change its binding. Drag to pan, pinch/scroll to zoom, and use the fit/reset buttons. Keys 1–4 select slots. With the canvas focused, arrow keys aim and Enter/Space casts.
- **Save:** spell edits and quick slots persist in browser local storage. Contents includes JSON export and import. Imports preserve existing spells and give conflicting IDs a new suffix. Chamber objects are temporary; switching views preserves them during the session, reloading resets the chamber.

The five initial spells are Fireball, Humble Crate, Iron Choir, Gravitic Grasp, and Unmake. The chamber begins with three crates and seven iron balls for experimenting.

## Development

Requires Node 22.12+ (or 24+) and npm.

```sh
npm ci
npm run dev
npm test
npm run build
npm run preview
```

Development URL: `http://127.0.0.1:5173/Tomecraft/`. Vite's base is `/Tomecraft/`; adjust `vite.config.ts` if the repository name or deployment path changes.

## Deployment

GitHub repository **Settings → Pages → Source** must be **GitHub Actions**. Pushing to `main` runs schema/physics tests, builds the static site, and deploys `dist/`. No API key, backend, paid service, or build-time secret is required. See the [Vite deployment guide](https://vite.dev/guide/static-deploy#github-pages) and [GitHub Pages documentation](https://docs.github.com/en/pages/getting-started-with-github-pages/creating-a-github-pages-site).

## Extending the spell language

The complete copyable LLM contract is `AUTHORING_PROMPT` in `src/spells.ts`. This is a constrained JSON language, not executable JavaScript. Supported actions:

| Action | Effect |
| --- | --- |
| `spawn` | Physical wood, metal, stone, crystal, or ice objects; box/circle, color, count, spread, optional lifetime |
| `burst` | Particles with color, count, speed, size, lifetime, and gravity |
| `ring` | Expanding or contracting colored sigil |
| `force` | Pull, push, or orbit impulse in an area |
| `remove` | Delete conjured objects intersecting an area |
| `projectile` | Travel from the caster, burst at the target, push objects, and destroy wood |

Actions may have a delay of 0–3000 ms from casting. The Zod schema is the source of truth. To add an operation, extend `actionSchema`, its execution in `SpellEngine.run`, the guide, and the behavior tests. Objects are capped at 250, particles at 2000, queued casts at 12, and projectiles at 24. Simulation runs at a fixed 60 Hz and pauses when the chamber is hidden. Reduced-motion preferences reduce particles and disable page animation.

`runesFor` transforms each action into a manuscript line: letters in the uppercase operation map by alphabet index to the 24-rune alphabet, numeric values scale by 1000 and encode in base 24, and the final rune is a checksum of the complete action JSON. Negative values retain a minus sign. This is a decorative representation; edit mode always shows the original JSON. No `eval`, scripts, or HTML from imported spells executes.

## Project layout

- `src/Book.tsx`: page layout, navigation, bookmarks, long-press editing.
- `src/Arena.tsx`: canvas lifecycle, pointer/pinch camera, spell slots.
- `src/engine.ts`: physics, bounded spell interpreter, particle rendering.
- `src/Editor.tsx`: inscription, code, and extra content editor.
- `src/spells.ts`: validation, presets, runes, and LLM instructions.
- `src/storage.ts`: device-local library and export.
- `tests/spells.test.ts`: validation and meaningful engine behavior tests.

## Data and assets

No analytics, accounts, or cloud saves. Data stays in the current browser/origin; clearing site data removes it. Export before clearing storage or moving devices. Local preview and GitHub Pages have separate storage; export/import to carry spells between them. If browser storage is full or unavailable, the editor reports the failure and leaves the previous saved tome intact.

Fonts are self-hosted Fontsource distributions (their included open-font licenses apply). Lucide icons use the ISC license. The original manuscript illustration is in `public/fireball-study.png`; its generation prompt and provenance are in `docs/artwork.md`.
