# Tomecraft

A mobile-first spellcrafting game: an ancient, editable grimoire and a physical practice chamber. Built with React, TypeScript, Vite, Matter.js, Zod, Lucide, and locally bundled fonts. Hosted as a static site on GitHub Pages.

## Play

- **Tome:** two facing leaves on desktop, one leaf on mobile. Swipe horizontally, use the arrow buttons, or press Left/Right to turn. Long-press inscriptions to edit; pencil buttons provide keyboard and mouse access. Overflowing inscriptions scroll within a leaf.
- **Craft:** open **Spellwright’s guide**, copy its instructions to an LLM with your spell idea, then paste the returned JavaScript spell into **Inscribe a spell → Spell code**. Add it to the grimoire and choose **Try this spell**.
- **Decorate:** edit title, icon, color, lore, and handwritten notes. Add and reorder text or image blocks before the description or after the incantation. Uploaded images must be PNG/JPEG/WebP/GIF and under 1 MB.
- **Chamber:** select a quick slot and tap the room to cast. Hold a slot, or use its chevron, to change its binding. Drag to pan, pinch/scroll to zoom, and use the fit/reset buttons. Keys 1–8 select slots. With the canvas focused, arrow keys aim and Enter/Space casts.
- **Save:** spell edits and quick slots persist in browser local storage. Contents imports JavaScript spells and JSON backups, and exports JSON backups. Imports preserve existing spells and give conflicting IDs a new suffix. Chamber objects are temporary; switching views preserves them during the session, reloading resets the chamber.

The starter collection spans fire, physical conjuration, gravity, creatures, light, ice, lightning, mist, flowing water, living grass, and room expansion. The chamber begins with three crates and seven iron balls for experimenting.

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

## Writing JavaScript spells

Copy the guide from the app, then paste a complete JavaScript spell into **Spell code**, optionally inside a javascript code fence. A spell has a JSON metadata comment followed by executable source:

```javascript
/* @spell
{"id":"violet-spark","title":"Violet Spark","school":"Evocation","icon":"sparkles","color":"#bb91c9","description":"A scattering of violet light."}
*/
export default function cast({ world, target, effect }) {
  world.burst(target, '#bb91c9', 70, 4);
  effect({
    duration: 2000,
    draw(ctx, age) {
      ctx.strokeStyle = '#bb91c9';
      ctx.beginPath();
      ctx.arc(target.x, target.y, 10 + age / 20, 0, Math.PI * 2);
      ctx.stroke();
    }
  });
}
```

`cast` receives the live `world`, `target`, `caster`, full `Matter` library, shared `elements`, `effect`, and `after`. Write arbitrary new algorithms, physical objects, constraints, collision responses, and canvas effects; no action schema or engine extension is required. `effect` accepts `duration`, `update(dt, age)`, `draw(ctx, age, reducedMotion)`, `collision(pairs)` and `dispose()`. It returns a stop function. `after(ms, callback)` returns a cancel function. All times are milliseconds in simulation time. Hooks stop on reset/exit and pause while the chamber is hidden.

`AUTHORING_PROMPT` in `src/authoring.ts` includes the actual engine, terrain, element and runtime source through Vite raw imports, plus contrasting current spells and a custom animation example. It stays synchronized with the implementation. The book displays the same JavaScript that executes. All starter spells use this runtime.

Version 2 saves store source as a string. Version 1 action-based saves/imports are converted to equivalent JavaScript without replacing metadata, IDs or user edits. Exported tomes remain JSON backups, with source preserved exactly. Importing and editing check syntax without running the spell; execution starts on cast. Runtime exceptions appear in the chamber and failed hooks are stopped.

Imported JavaScript is trusted page code, not sandboxed. Only cast code you trust: it can access browser globals and an infinite loop can freeze the page. Use bounded work and the managed hooks rather than browser timers or event listeners. Reset removes custom bodies and constraints as well as normal chamber content.

## Project layout

- `src/Book.tsx`: page layout, navigation, bookmarks, long-press editing.
- `src/Arena.tsx`: canvas lifecycle, pointer/pinch camera, spell slots.
- `src/engine.ts`: physics, shared simulation helpers, particle rendering.
- `src/Editor.tsx`: inscription, code, and extra content editor.
- `src/spells.ts`: metadata/source validation, JavaScript presets, and import/export format.
- `src/spellRuntime.ts`: JavaScript execution, managed callbacks, lifecycle and error handling.
- `src/authoring.ts`: copyable source-based LLM instructions.
- `src/legacySpells.ts`: compatibility conversion for version 1 saves.
- `src/storage.ts`: device-local library and export.
- `tests/spells.test.ts`: validation and meaningful engine behavior tests.

## Data and assets

No analytics, accounts, or cloud saves. Data stays in the current browser/origin; clearing site data removes it. Export before clearing storage or moving devices. Local preview and GitHub Pages have separate storage; export/import to carry spells between them. If browser storage is full or unavailable, the editor reports the failure and leaves the previous saved tome intact.

Fonts are self-hosted Fontsource distributions (their included open-font licenses apply). Lucide icons use the ISC license. The original manuscript illustration is in `public/fireball-study.png`; its generation prompt and provenance are in `docs/artwork.md`.

## Working with coding agents

See [AGENTS.md](AGENTS.md) for project preferences, the low-overhead spell workflow, and exact commit/publish commands. Completed changes are committed and pushed to `main` automatically; the GitHub Actions pipeline supplies the default test/build check.
