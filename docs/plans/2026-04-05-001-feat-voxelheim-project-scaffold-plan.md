---
title: "feat: Scaffold voxelheim Next.js project"
type: feat
status: active
date: 2026-04-05
---

# feat: Scaffold voxelheim Next.js project

## Overview

Create a new Next.js 15+ project called `voxelheim` with TypeScript, Tailwind CSS, ESLint, and App Router. Install specified runtime and dev dependencies. Configure Vitest for testing. Do not modify any generated pages.

## Problem Frame

The project needs a properly configured Next.js foundation with 3D (Three.js), state management (Zustand), persistence (idb), procedural generation (simplex-noise), and a testing/formatting toolchain before feature work begins.

## Requirements Trace

- R1. Next.js 15+ project with TypeScript strict, Tailwind CSS, ESLint, App Router
- R2. Runtime deps: `three`, `@types/three`, `zustand`, `idb`, `simplex-noise`
- R3. Dev deps: `vitest`, `@vitest/ui`, `prettier`, `eslint-config-prettier`
- R4. Add `test` and `test:ui` scripts to package.json
- R5. Create `vitest.config.ts` with sensible defaults
- R6. Do not modify any generated pages (no changes to `app/page.tsx`, `app/layout.tsx`, etc.)

## Scope Boundaries

- No application code, components, or features
- No modifications to default pages or layout
- No CI/CD, Docker, or deployment config
- No `.prettierrc` or custom ESLint rule files (use defaults unless config is required for `eslint-config-prettier` integration)

## Key Technical Decisions

- **`create-next-app` with flags**: Use `--typescript --tailwind --eslint --app --src-dir` to get the canonical scaffold. This avoids manual config drift and matches Next.js 15 conventions.
- **`@types/three` as runtime dep**: User explicitly requested it alongside runtime deps. It's a type-only package but will be installed where specified.
- **Vitest over Jest**: User explicitly chose Vitest. Config will use `@vitejs/plugin-react` or Next.js-compatible setup depending on what `create-next-app` generates.
- **ESLint + Prettier integration**: Install `eslint-config-prettier` and extend the existing ESLint config to disable formatting rules that conflict with Prettier.

## Implementation Units

- [ ] **Unit 1: Scaffold Next.js project**

  **Goal:** Create the `voxelheim` project with TypeScript, Tailwind, ESLint, App Router, and src directory

  **Requirements:** R1

  **Dependencies:** None

  **Files:**
  - Create: `voxelheim/` (entire project scaffold)

  **Approach:**
  - Run `npx create-next-app@latest voxelheim --typescript --tailwind --eslint --app --src-dir --use-npm` (or `--use-pnpm` per user preference — npm is default)
  - Accept defaults for import alias (`@/*`)
  - Turbopack prompt: accept default (yes for dev)

  **Verification:**
  - `voxelheim/` directory exists with `tsconfig.json`, `tailwind.config.ts`, `next.config.ts`, `src/app/` structure

- [ ] **Unit 2: Install runtime dependencies**

  **Goal:** Add three, @types/three, zustand, idb, simplex-noise

  **Requirements:** R2

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `voxelheim/package.json`

  **Approach:**
  - Run `npm install three @types/three zustand idb simplex-noise` from within the project directory

  **Verification:**
  - All five packages appear in `dependencies` in `package.json`

- [ ] **Unit 3: Install dev dependencies and configure ESLint + Prettier**

  **Goal:** Add vitest, @vitest/ui, prettier, eslint-config-prettier. Wire eslint-config-prettier into ESLint config.

  **Requirements:** R3

  **Dependencies:** Unit 1

  **Files:**
  - Modify: `voxelheim/package.json`
  - Modify: `voxelheim/eslint.config.mjs` (or `.eslintrc.json` — depends on what `create-next-app` generates)

  **Approach:**
  - Run `npm install -D vitest @vitest/ui prettier eslint-config-prettier`
  - Extend the existing ESLint config to include `eslint-config-prettier` (append to the extends array or flat config array depending on format)

  **Verification:**
  - All four packages appear in `devDependencies`
  - ESLint config references `eslint-config-prettier`

- [ ] **Unit 4: Add test scripts and create vitest.config.ts**

  **Goal:** Add npm test scripts and a working Vitest config file

  **Requirements:** R4, R5

  **Dependencies:** Unit 3

  **Files:**
  - Modify: `voxelheim/package.json` (add scripts)
  - Create: `voxelheim/vitest.config.ts`

  **Approach:**
  - Add to `package.json` scripts: `"test": "vitest run"`, `"test:ui": "vitest --ui"`
  - Create `vitest.config.ts` with `defineConfig` from `vitest/config`, setting `test.globals: true`, `test.environment: 'node'`, and an `include` pattern targeting `src/**/*.test.{ts,tsx}`

  **Patterns to follow:**
  - Standard Vitest config from Vitest docs

  **Verification:**
  - `npm test` runs without error (exits cleanly with no tests found)
  - `vitest.config.ts` exists at project root

## Risks & Dependencies

| Risk | Mitigation |
|------|------------|
| `create-next-app` prompts interactively | Use `--` flags to pre-answer all prompts; pass `--yes` or pipe input if needed |
| ESLint config format varies by Next.js version (flat config vs legacy) | Inspect generated config before modifying |

## Sources & References

- Next.js `create-next-app` CLI docs
- Vitest configuration docs
- `eslint-config-prettier` README
