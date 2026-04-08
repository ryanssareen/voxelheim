---
title: Firebase Auth SDK iframe failure on Vercel deployment
date: 2026-04-07
category: integration-issues
module: authentication
problem_type: integration_issue
component: authentication
symptoms:
  - "Illegal url for new iframe error on Vercel deployment blocking all Firebase Auth"
  - "Users not created in Firebase during signup on deployed environment"
  - "Auth state race condition causing redirect loop between worlds and login pages"
  - "Firebase SSR crash with auth/invalid-api-key during Next.js build"
root_cause: config_error
resolution_type: code_fix
severity: critical
tags:
  - firebase-auth
  - vercel-deployment
  - iframe-error
  - rest-api
  - oauth
  - localstorage-session
---

# Firebase Auth SDK iframe failure on Vercel deployment

## Problem

Firebase Auth SDK fails with "Illegal url for new iframe" on Vercel deployments, blocking all authentication operations. The SDK's internal iframe-based domain verification rejects `*.vercel.app` domains even when explicitly added to Firebase Console's authorized domains list.

## Symptoms

- `signInWithEmailAndPassword`, `createUserWithEmailAndPassword`, `signInWithRedirect`, and `signInWithCredential` all throw "Illegal url for new iframe" on Vercel
- Auth works on `localhost` during development but fails on deployed domain
- Users are silently not created in Firebase during signup
- `onAuthStateChanged` fires before auth state is resolved, causing redirect loops between protected pages and login
- Firebase SDK initialization during SSR crashes with "auth/invalid-api-key"

## What Didn't Work

1. **CSP headers in next.config.ts** — The error is Firebase SDK's own internal domain allowlist check, not a browser CSP block. Adding `frame-src` or `connect-src` directives has no effect.

2. **Setting authDomain to the Vercel domain** — `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=voxelheim.vercel.app` requires a Firebase Hosting auth handler served from that domain. Vercel does not host Firebase's `/__/auth/handler` endpoint, so this breaks OAuth redirect flows.

3. **signInWithRedirect fallback** — The redirect flow triggers the same internal iframe initialization and fails identically to the popup flow.

4. **signInWithCredential after REST token fetch** — Even with tokens obtained from the REST API, calling `signInWithCredential` still initializes the SDK's iframe machinery and fails.

## Solution

Hybrid auth architecture: REST API for email/password (bypasses SDK entirely), Firebase SDK popup for OAuth (popup flow sidesteps the iframe check), localStorage for session persistence.

### 1. Server-side REST API route (`src/app/api/auth/route.ts`)

Calls Firebase Identity Toolkit directly, no SDK involvement:

```typescript
const BASE = "https://identitytoolkit.googleapis.com/v1/accounts";

// POST handler switches on action:
// "signUp"         -> ${BASE}:signUp?key=${apiKey}
// "signIn"         -> ${BASE}:signInWithPassword?key=${apiKey}
// "resetPassword"  -> ${BASE}:sendOobCode?key=${apiKey}
```

### 2. Hybrid auth store (`src/store/useAuthStore.ts`)

```typescript
// Email/password: REST API (no Firebase SDK)
signIn: async (email, password) => {
  const user = await authViaRest("signIn", email, password);
  saveUser(user); // localStorage
  set({ user });
},

// Google OAuth: Firebase SDK popup (iframe check not triggered)
signInWithGoogle: async () => {
  const a = auth();
  const p = googleProvider();
  if (!a || !p) throw new Error("Firebase not configured");
  const result = await signInWithPopup(a, p);
  const fbUser = result.user;
  const token = await fbUser.getIdToken();
  const user: AuthUser = { email: fbUser.email ?? "", uid: fbUser.uid, idToken: token, refreshToken: fbUser.refreshToken };
  saveUser(user);
  set({ user });
},
```

### 3. Synchronous session persistence (replaces onAuthStateChanged)

```typescript
const STORAGE_KEY = "voxelheim_auth";
function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch { return null; }
}
// Zustand initial state loads synchronously — no race condition
user: typeof window !== "undefined" ? loadUser() : null,
```

### 4. Lazy Firebase SDK initialization (`src/lib/firebase.ts`)

```typescript
const isConfigured = !!firebaseConfig.apiKey;
// Getter functions return null when not configured (SSR safety)
function getFirebaseAuth(): Auth | null { if (!isConfigured) return null; /* lazy init */ }
```

## Why This Works

The Firebase Auth SDK embeds a hidden iframe to verify the hosting domain against an internal allowlist. This allowlist expects Firebase Hosting URLs or localhost — third-party hosts like Vercel fail regardless of the authorized domains console setting. By calling the Identity Toolkit REST API from a Next.js server route, email/password auth never touches the SDK or its iframe. OAuth via `signInWithPopup` works because the popup opens a Firebase-hosted page (accounts.google.com -> Firebase callback), sidestepping the iframe verification. Using localStorage instead of `onAuthStateChanged` eliminates the async SDK initialization dependency, preventing the auth state race condition that caused redirect loops.

## Prevention

- **Default to REST API for Firebase Auth on non-Firebase hosts.** If deploying to Vercel, Netlify, or any non-Firebase hosting, plan for Identity Toolkit REST API routes from the start rather than relying on the client SDK.
- **Test auth on the deployed domain early.** The iframe error only manifests on the actual deployment domain, not localhost. Deploy and test auth before building dependent features.
- **Isolate Firebase SDK usage behind lazy accessors.** Wrap all SDK calls in null-guarded getter functions to prevent SSR crashes and make it easy to swap between SDK and REST paths.
- **Avoid `onAuthStateChanged` in hybrid architectures.** When auth state is managed outside the SDK (REST + localStorage), mixing in SDK listeners creates race conditions. Use one source of truth for session state.
- **Use `window.location.href` for post-auth navigation.** Hard navigation ensures the new auth state from localStorage is picked up cleanly, avoiding stale Zustand state from client-side routing.

## Related Issues

- `docs/solutions/best-practices/vercel-headers-nested-route-matching-2026-04-05.md` — Related Vercel deployment configuration (different domain: COOP/COEP headers)
- Firebase docs: [Authenticate with Firebase using Password-Based Accounts (REST)](https://firebase.google.com/docs/reference/rest/auth)
