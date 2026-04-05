---
title: "Path Alias Syntax: TypeScript Glob vs Vite Prefix Matching"
date: 2026-04-05
category: best-practices
module: build-configuration
problem_type: best_practice
component: tooling
symptoms:
  - "Code review false positive flagging path alias 'mismatch' between tsconfig.json and vitest.config.ts"
  - "Suggestion to add /* glob suffix to Vite resolve.alias keys"
root_cause: config_error
resolution_type: config_change
severity: low
tags:
  - typescript
  - vite
  - vitest
  - path-aliases
  - resolve-alias
  - tsconfig
  - next-js
---

# Path Alias Syntax: TypeScript Glob vs Vite Prefix Matching

## Problem

When configuring path aliases in both tsconfig.json and vitest.config.ts, the syntactic difference between TypeScript's glob patterns and Vite's prefix string matching can be misidentified as a configuration error, leading to a "fix" that actually breaks module resolution.

## Symptoms

- Code reviewer flags a P1 "path alias mismatch" between tsconfig.json (`@engine/*`) and vitest.config.ts (`@engine`)
- Suggestion to add `/*` to Vite alias keys to "match" TypeScript syntax
- No actual runtime or test failures despite the flagged difference

## What Didn't Work

- Adding `/*` to Vite alias keys (`"@engine/*"` instead of `"@engine"`) — Vite interprets this as a literal string prefix, so it would try to match imports starting with `@engine/*`, which no import ever does. This breaks all alias resolution.

## Solution

Keep the syntax different. Each tool uses the correct syntax for its own resolution algorithm:

```typescript
// tsconfig.json — glob pattern syntax (correct)
{
  "compilerOptions": {
    "paths": {
      "@/*": ["./src/*"],
      "@engine/*": ["./src/engine/*"],
      "@systems/*": ["./src/systems/*"]
    }
  }
}
```

```typescript
// vitest.config.ts — prefix string matching (correct)
export default defineConfig({
  resolve: {
    alias: {
      "@engine": path.resolve(__dirname, "src/engine"),
      "@systems": path.resolve(__dirname, "src/systems"),
      "@": path.resolve(__dirname, "src"),  // catch-all MUST be last
    },
  },
});
```

Both resolve `@engine/foo` to `src/engine/foo`.

## Why This Works

**TypeScript `paths`** uses glob pattern syntax where `*` is a capture group. `"@engine/*": ["./src/engine/*"]` captures whatever follows `@engine/` and substitutes it into the target path.

**Vite `resolve.alias`** uses prefix string matching. `"@engine": path.resolve(...)` checks if the import starts with `@engine`, strips that prefix, and appends the remainder to the replacement path.

Different syntax, identical behavior. The difference exists because TypeScript and Vite have different internal resolution mechanisms.

**Ordering matters in Vite:** Aliases are checked in insertion order. The catch-all `@` alias must be listed last — otherwise `@engine/foo` would match `@` first. (It would resolve correctly by coincidence in this case, but the behavior is fragile.)

## Prevention

- Validate aliases functionally (`npx tsc --noEmit` for TypeScript, `npm test` for Vite) rather than comparing syntax across tools
- When reviewing path alias configs across different tools, understand each tool's matching semantics before flagging differences
- Never add glob characters (`*`) to Vite `resolve.alias` keys — Vite treats them literally
- Always list more specific aliases before less specific ones in Vite config

## Related Issues

- No prior docs found in docs/solutions/ on this topic
