# Tomecraft project instructions

## User preferences and working style

The user values speed, creative iteration, and low token consumption. They want to generate many new spells without spending most of the work on testing, screenshots, repeated checks, or deployment ceremony. Their stated attitude: "do less testing and just trust it". Make sensible implementation decisions and ship; keep explanations short.

After implementing requested changes, commit and publish automatically unless the user explicitly asks otherwise. The user has authorized this workflow; do not ask again whether to commit, push, or publish. Tool-enforced permissions still apply. Include only relevant task files in commits and preserve unrelated work.

## Minimal validation

- For routine spell additions, copy/lore changes, styling, and documentation, inspect the relevant code, make the change, and publish. Do not run a local full test suite, build, or browser tour by default.
- GitHub's deployment workflow already runs `npm test` and `npm run build`; rely on that single automated gate instead of repeating it locally.
- For changes to the spell interpreter, schema, storage/migrations, or a concrete suspected bug, use the smallest targeted check that answers the actual concern. Add a test only when it protects meaningful behavior.
- Do not add tests that mirror simple content or styling. Do not repeatedly validate an unchanged result, run broad test matrices, or take screenshots just for reassurance.
- If a check fails, fix the actual failure and rerun only what is needed. Never report unrun checks as passing.

## Publish commands

Repository: `https://github.com/ka2le/Tomecraft`
Live site: `https://ka2le.github.io/Tomecraft/`
Branch: `main`
Workflow: `.github/workflows/deploy.yml` (Build and deploy Tomecraft)

There is no npm publish/deploy script. A push to `main` publishes through GitHub Actions:

```sh
git add <explicit files changed for this task>
git commit -m "Describe the completed change"
git push origin main
```

Check the resulting run once, matching `headSha` to the pushed commit:

```sh
gh run list --repo ka2le/Tomecraft --workflow deploy.yml --limit 1 --json databaseId,status,conclusion,headSha,url
gh run watch <databaseId> --repo ka2le/Tomecraft --exit-status --interval 10
```

If the latest run still belongs to an older commit, wait briefly and list once more. Use one watch rather than repeated manual polling. The workflow installs dependencies, tests, builds `dist/`, and deploys GitHub Pages. A successful deployment is sufficient; no extra browser inspection or live-site crawl is needed by default. If deployment fails, inspect its failed logs with `gh run view <databaseId> --repo ka2le/Tomecraft --log-failed` and resolve it.

To republish already committed remote code without new changes:

```sh
gh workflow run deploy.yml --repo ka2le/Tomecraft --ref main
```

Do not use `npm publish`, switch hosting providers, or introduce another deployment system. On this Windows machine, sandboxed Git can incorrectly report unsafe repository ownership and Vite can fail with parent-directory access denied. Use the normal execution escalation when required; avoid changing global Git configuration to work around it.

## Adding spells efficiently

- `src/spells.ts` contains `starterSpells`, `spellSchema`, `actionSchema`, `starterRevision`, `starterReleases`, and the copyable `AUTHORING_PROMPT` contract. Read the relevant current definitions rather than rediscovering the whole project.
- Compose existing actions whenever they express the requested spell. Each spell needs a unique stable lowercase/hyphen ID, evocative title/subtitle, school, supported icon, hex color, lore, notes, actions, and blocks.
- When shipping new starter spells, increment `starterRevision` and append a `starterReleases` entry containing the new IDs. `src/storage.ts` uses these releases to add missing spells to existing saved libraries, up to the 100-spell limit. Adding only to `starterSpells` will not reliably deliver spells to returning users.
- Preserve user-edited spells and existing IDs; do not reset browser storage. Existing starter spells are not overwritten by the additive migration.
- For a new action type, update its schema, `src/engine.ts` execution/rendering as needed, and `AUTHORING_PROMPT`. Use a focused behavioral check for the new capability.
- Saves belong to each browser origin. Local preview and GitHub Pages have separate libraries.

## UI and project map

The book and practice chamber fill the viewport. Avoid adding page titles, explanatory banners, surrounding headers, or footers. Workspace actions are icon overlays at the top right; chamber slots float over the canvas. Keep accessible button labels and tooltips.

- `src/App.tsx`: library state, workspace icons, dialogs, view switching.
- `src/Book.tsx`: book leaves, navigation, bookmarks, editing.
- `src/Arena.tsx`: canvas, camera, casting input, eight quick slots (keys 1-8).
- `src/engine.ts`: Matter.js simulation and spell effects.
- `src/spells.ts`: spell data, schema, runes, authoring instructions.
- `src/storage.ts`: local saves, starter migrations, import/export support.
- `src/styles.css`, `src/panels.css`: styling; immersive layout overrides are at the end of panels.css.
- `tests/spells.test.ts`: existing schema/engine tests.

Local preview when actually needed: `npm run dev` at `http://127.0.0.1:5173/Tomecraft/`. Reuse an existing server instead of starting duplicates. Vite base path is `/Tomecraft/`.
