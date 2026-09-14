---
title: "WebKit never hydrates when Next refuses the HMR socket cross-origin"
module: app
category: developer-experience
date: 2026-09-14
problem_type: developer_experience
component: development_workflow
severity: high
applies_when:
  - "testing a next dev server on a phone or another machine through a tunnel, proxy, or LAN address"
  - "an iOS/Safari page renders perfectly but every button is dead, while plain links still navigate, with no console error"
  - "the same build works in Chrome and fails only in Safari, or works in production and fails only in dev"
tags:
  - nextjs
  - hmr
  - hydration
  - webkit
  - safari
  - ios
  - tunnel
  - dev-server
  - allowed-dev-origins
---

## Context

Voxelheim's touch support could not be tested without running the game on a real phone, which meant serving the dev server through a Cloudflare tunnel. The page loaded and looked perfect on iOS — full world, full HUD, correct layout — but **every button was dead**. Plain `<a href>` links navigated fine. There were no console errors, no failed requests, and no visible difference from a working page.

The same URL worked in Chromium. The same code worked in a production build. That combination made it look like an application bug, and several plausible-sounding theories burned hours: bundle size (dev serves ~24 MB of unminified JS for one route), a hydration mismatch, module-scope browser APIs, Firebase or IndexedDB throwing during init, unsupported syntax in the emitted chunks. All were wrong.

The give-away was in the tunnel's own log the whole time:

```
malformed HTTP response "Unauthorized" ... /_next/webpack-hmr ... type=ws
```

## Guidance

**Next 16 blocks cross-origin requests to dev endpoints unless the host is listed in `allowedDevOrigins`.** For the HMR WebSocket it does not refuse with a `403` — it answers the upgrade with a bare, non-HTTP `Unauthorized` line instead of a `101 Switching Protocols`.

**WebKit does not finish hydrating the React tree when that dev socket fails. Chromium shrugs off the identical failure and hydrates normally.**

So the fix is one config entry:

```ts
// next.config.ts
const nextConfig: NextConfig = {
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.loca.lt",
  ],
};
```

Add whatever host actually serves the dev bundle — tunnel domain, LAN IP, or hostname.

## Why This Matters

The failure presents as an application bug and is not one. Server-rendered HTML paints completely, so the page looks finished; `<a href>` links work because the browser navigates them without JavaScript; and buttons do nothing because nothing React wired up ever attached. Nothing is logged, because from the page's point of view no error occurred.

Two properties make it expensive to diagnose:

- **It is browser-divergent.** Testing in Chrome — including a mobile-emulated Chrome — will not reproduce it. Only WebKit does, which is exactly the browser you reach for when testing on an iPhone.
- **It is dev-only.** Production has no HMR socket, so a production build of the same commit works. That strongly suggests "something about the dev bundle," which sends the investigation toward size, source maps, and transforms — all dead ends.

The general lesson beyond this bug: **when a page renders but nothing interactive works, the question is not "which handler is broken" but "did hydration complete at all."** Those have completely different suspect lists, and the symptom does not distinguish them.

## When to Apply

- Before the first attempt to run `next dev` against a phone, another machine, a tunnel, or any non-`localhost` origin.
- When a page is visually correct but non-interactive, particularly if links work and buttons do not.
- When behaviour differs between Safari and Chrome, or between dev and production, on the same commit.

## Examples

**A diagnostic that does not depend on React.** A React error overlay cannot report that React failed to mount — it would have to mount first. An inline `<script>` in the document head runs before any bundle and survives a bundle that never executes:

```html
<script>
  (function () {
    window.addEventListener("error", function (e) { /* capture, render to DOM */ }, true);
    // capture phase: resource load failures do not bubble
    setTimeout(function () {
      render(window.__reactMounted ? "React hydrated: YES" : "React hydrated: NO");
    }, 4000);
  })();
</script>
```

Pair it with a flag set from a `useEffect` in the root layout. `inline script ran` plus `React hydrated: NO` isolates the failure to hydration in one page load, with no cable and no Mac-side setup.

**Isolating it without a tunnel.** A local reverse proxy in front of `next dev`, identical in every respect except the WebSocket upgrade, is a controlled A/B:

- proxy forwards `Upgrade` → the app hydrates
- same proxy answers `403` to the upgrade → the app does not, with zero console errors

That single-variable experiment is what separates this from the size and syntax theories, none of which survive it.

**Protocol-level confirmation:**

```
Host: localhost:3011          → HTTP/1.1 101 Switching Protocols
Host: abc.trycloudflare.com   → Unauthorized          # before the fix
Host: abc.trycloudflare.com   → HTTP/1.1 101 …        # after
```

## Related

- `docs/solutions/developer-experience/fast-refresh-hook-order-error-on-always-mounted-ui-during-branch-merge.md` — the other dev-server-only failure in this project that looks like application breakage.
- `src/app/mobile-check/page.tsx` — device capability probe; reports fullscreen support, visual viewport, safe-area insets, and standalone mode for a given device.
