@AGENTS.md

# Voxelheim

## AI Codex
At the start of every conversation, read all files in `.ai-codex/` to understand the current project structure (routes, components, lib, schema). These are auto-generated indexes — do not edit them manually.

## Compound Engineering Docs
At the start of every conversation, also read the compound engineering artifacts for this project:
- `docs/plans/` — active implementation plans
- `docs/solutions/` — documented solutions and learnings from past work
- `CONCEPTS.md` — shared domain vocabulary (entities, named processes, status concepts)

These contain institutional knowledge (resolved gotchas, architecture decisions, prevention strategies) that should inform implementation choices.

## Conventions
- Block ids are append-only (chunk data and hotbar saves store raw ids); never renumber. Wood blocks carry `wood: { species, part }`; recipes use the oak id to mean "any species of that part".
- Recipes must satisfy `src/tests/economy.test.ts` (value potential); price a new block id there before adding recipes.
- Atlas art is generated: edit `scripts/buildAtlas.ts` (or drop `public/textures/blocks/<name>.png` overrides), run `npx tsx scripts/buildAtlas.ts`, commit `atlas.png`, `items.png` and `src/data/atlasUVs.ts` together.
- Agent worktrees live under `.claude/worktrees/` (excluded from tsc, eslint, git); symlink `node_modules` there instead of installing.
- The in-app Browser pane refuses pointer lock (mouse-look needs it) and keypress-driven screens did not open there, so game screens are verified headless.
- Gameplay code reads **named intents**, never key codes or mouse buttons. Add to the vocabulary in `src/engine/input/intents.ts` and produce it from a source; do not reach for `isKeyDown`/`getMouseButton` at a call site, and do not add a `window` keydown listener in a component. Edges are read through per-consumer cursors — pass a stable consumer name — because a shared consume-on-read queue starves whichever consumer reads second, silently.
- Pointer lock is requested only through `src/engine/input/pointerLock.ts`. It returns a promise that rejects when denied (iframe without `allow="pointer-lock"`, unfocused document), and a denial is normal rather than an error — look and pause no longer depend on it.
- On-device testing needs an HTTPS origin: a Vercel PR preview, or `cloudflared tunnel --url http://localhost:3000` (binary at `~/.local/bin/cloudflared`, not on PATH). A dev server reached cross-origin must have its host listed in `allowedDevOrigins` in `next.config.ts` — otherwise Next rejects the HMR socket and **WebKit never finishes hydrating**, which looks like a fully painted page with every button dead. `/mobile-check` reports what a device actually supports.

## Common Commands
```bash
npx ai-codex            # regenerate .ai-codex/ indexes
npm run dev              # dev server
npm run build            # production build
npm run lint             # eslint
npx tsc --noEmit         # type check
npm test                 # vitest
```
