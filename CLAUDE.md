@AGENTS.md

# Voxelheim

## AI Codex
At the start of every conversation, read all files in `.ai-codex/` to understand the current project structure (routes, components, lib, schema). These are auto-generated indexes — do not edit them manually.

## Compound Engineering Docs
At the start of every conversation, also read the compound engineering artifacts for this project:
- `docs/plans/` — active implementation plans
- `docs/solutions/` — documented solutions and learnings from past work

These contain institutional knowledge (resolved gotchas, architecture decisions, prevention strategies) that should inform implementation choices.

## Common Commands
```bash
npx ai-codex            # regenerate .ai-codex/ indexes
npm run dev              # dev server
npm run build            # production build
npm run lint             # eslint
npx tsc --noEmit         # type check
npm test                 # vitest
```
