import { create } from "zustand";
import { OAuthProvider } from "firebase/auth";
import {
  firebaseConfigured,
  auth,
  microsoftProvider,
  googleProvider,
  signInWithPopup,
  signInWithRedirect,
  signInWithCredential,
  getRedirectResult,
  EmailAuthProvider,
  signOut as firebaseSignOut,
  onAuthStateChanged,
  type User,
} from "@/lib/firebase";

interface MinecraftProfile {
  uuid: string;
  name: string;
  skinUrl: string | null;
}

interface AuthState {
  user: User | null;
  loading: boolean;
  configured: boolean;
  minecraftProfile: MinecraftProfile | null;
  setMinecraftProfile: (profile: MinecraftProfile | null) => void;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => Promise<void>;
}

// Call our REST API to avoid Firebase SDK iframe issues
async function authViaRest(
  action: string,
  email: string,
  password?: string
): Promise<{ email: string; idToken?: string; error?: string }> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg: string = data.error ?? "Auth failed";
    // Map Firebase REST error codes to friendly messages
    if (msg.includes("EMAIL_EXISTS")) throw new Error("An account with this email already exists");
    if (msg.includes("INVALID_LOGIN_CREDENTIALS") || msg.includes("INVALID_PASSWORD"))
      throw new Error("Invalid email or password");
    if (msg.includes("EMAIL_NOT_FOUND")) throw new Error("No account with that email");
    if (msg.includes("WEAK_PASSWORD")) throw new Error("Password must be at least 6 characters");
    if (msg.includes("INVALID_EMAIL")) throw new Error("Invalid email address");
    if (msg.includes("TOO_MANY_ATTEMPTS")) throw new Error("Too many attempts. Try again later.");
    throw new Error(msg);
  }
  return data;
}

// Singleton auth listener
let listenerInitialized = false;

function initAuthListener() {
  if (listenerInitialized) return;
  const a = auth();
  if (!a) {
    useAuthStore.setState({ loading: false });
    return;
  }
  listenerInitialized = true;

  getRedirectResult(a).catch(() => {});

  onAuthStateChanged(a, (user) => {
    useAuthStore.setState({ user, loading: false });
  });
}

async function oauthSignIn(provider: "google" | "microsoft") {
  const a = auth();
  if (!a) throw new Error("Firebase not configured");
  const p = provider === "google" ? googleProvider() : microsoftProvider();
  if (!p) throw new Error("Firebase not configured");

  try {
    const result = await signInWithPopup(a, p);
    if (provider === "microsoft" && result.user) {
      try {
        const credential = OAuthProvider.credentialFromResult(result);
        const msAccessToken = credential?.accessToken;
        if (msAccessToken) {
          const profile = await fetchMinecraftProfile(msAccessToken);
          useAuthStore.setState({ minecraftProfile: profile });
        }
      } catch {
        // Microsoft account may not have Minecraft
      }
    }
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : "";
    if (
      msg.includes("popup-blocked") ||
      msg.includes("popup-closed") ||
      msg.includes("Illegal url") ||
      msg.includes("cross-origin")
    ) {
      await signInWithRedirect(a, p);
    } else {
      throw err;
    }
  }
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: firebaseConfigured,
  configured: firebaseConfigured,
  minecraftProfile: null,

  setMinecraftProfile: (profile) => set({ minecraftProfile: profile }),

  signUp: async (email, password) => {
    // Use REST API to create user (bypasses iframe check)
    const data = await authViaRest("signUp", email, password);
    // Sign into the client SDK so onAuthStateChanged fires
    const a = auth();
    if (a && data.idToken) {
      const credential = EmailAuthProvider.credential(email, password);
      await signInWithCredential(a, credential);
    }
  },

  signIn: async (email, password) => {
    // Use REST API to verify credentials (bypasses iframe check)
    await authViaRest("signIn", email, password);
    // Sign into the client SDK
    const a = auth();
    if (a) {
      const credential = EmailAuthProvider.credential(email, password);
      await signInWithCredential(a, credential);
    }
  },

  signInWithGoogle: () => oauthSignIn("google"),
  signInWithMicrosoft: () => oauthSignIn("microsoft"),

  resetPassword: async (email) => {
    await authViaRest("resetPassword", email);
  },

  signOut: async () => {
    const a = auth();
    if (a) await firebaseSignOut(a);
    set({ user: null, minecraftProfile: null });
  },
}));

// Auto-initialize the listener on module load (client-side only)
if (typeof window !== "undefined") {
  initAuthListener();
}

async function fetchMinecraftProfile(msAccessToken: string): Promise<MinecraftProfile | null> {
  try {
    const resp = await fetch("/api/minecraft-profile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ accessToken: msAccessToken }),
    });
    if (!resp.ok) return null;
    return resp.json();
  } catch {
    return null;
  }
}
