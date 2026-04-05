---
title: "Vercel Header Configuration: Regex Path Matching for Nested Routes"
date: 2026-04-05
category: best-practices
module: build-configuration
problem_type: best_practice
component: tooling
symptoms:
  - "SharedArrayBuffer unavailable on nested game routes (/game/level, /game/settings)"
  - "COOP/COEP headers only applied to exact /game path, not sub-routes"
  - "Web Workers fail silently on nested routes while working on parent route"
root_cause: config_error
resolution_type: config_change
severity: high
tags:
  - vercel
  - next-js
  - coop-coep
  - sharedarraybuffer
  - web-workers
  - cross-origin-isolation
---

# Vercel Header Configuration: Regex Path Matching for Nested Routes

## Problem

Vercel's `source` field in vercel.json uses exact path matching, so `"/game"` only applies COOP/COEP headers to the `/game` route itself, not nested routes like `/game/level`. This silently breaks SharedArrayBuffer access for Web Workers in sub-routes.

## Symptoms

- SharedArrayBuffer unavailable on nested game routes but works on `/game`
- Three.js or Web Worker code fails silently in sub-routes
- No browser console error — SharedArrayBuffer is simply undefined
- Parent route works, child routes don't

## What Didn't Work

Using `"source": "/game"` — this applies headers only to the exact `/game` path. Nested App Router routes (`/game/level`, `/game/settings`) are different paths and don't receive the headers.

## Solution

Use a regex pattern to match the base route and all nested paths:

**Before (broken for nested routes):**
```json
{
  "source": "/game",
  "headers": [
    { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
    { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
  ]
}
```

**After (works for all /game/* routes):**
```json
{
  "source": "/game(.*)",
  "headers": [
    { "key": "Cross-Origin-Opener-Policy", "value": "same-origin" },
    { "key": "Cross-Origin-Embedder-Policy", "value": "require-corp" }
  ]
}
```

## Why This Works

Vercel supports regex patterns in the `source` field. The pattern `/game(.*)` matches `/game` plus anything after it — covering `/game`, `/game/`, `/game/level`, `/game/level/3`, etc. This ensures COOP/COEP headers apply to the entire route subtree, enabling SharedArrayBuffer across all game pages.

Scope the headers to `/game(.*)` rather than applying globally — COOP/COEP can break pages that load cross-origin resources (analytics, fonts, CDN embeds) without CORP headers.

## Prevention

- When configuring route-specific headers in Vercel, always use regex patterns like `(.*)` for routes with nested sub-paths
- Test nested routes, not just the base route, when verifying header configuration
- If cross-origin resources are needed under COEP, consider `credentialless` instead of `require-corp` to avoid requiring CORP headers on external resources

## Related Issues

- docs/solutions/best-practices/path-alias-syntax-typescript-vs-vite-2026-04-05.md (same project, different config topic)
