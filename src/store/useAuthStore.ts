import { create } from "zustand";
import {
  auth,
  googleProvider,
  microsoftProvider,
  signInWithPopup,
} from "@/lib/firebase";

interface AuthUser {
  email: string;
  uid: string;
  idToken: string;
  refreshToken: string;
}

interface MinecraftProfile {
  uuid: string;
  name: string;
  skinUrl: string | null;
}

interface AuthState {
  user: AuthUser | null;
  loading: boolean;
  minecraftProfile: MinecraftProfile | null;
  hydrate: () => void;
  signUp: (email: string, password: string) => Promise<void>;
  signIn: (email: string, password: string) => Promise<void>;
  signInWithGoogle: () => Promise<void>;
  signInWithMicrosoft: () => Promise<void>;
  resetPassword: (email: string) => Promise<void>;
  signOut: () => void;
}

const STORAGE_KEY = "voxelheim_auth";

function saveUser(user: AuthUser | null) {
  if (user) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(user));
  } else {
    localStorage.removeItem(STORAGE_KEY);
  }
}

function loadUser(): AuthUser | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

async function authViaRest(
  action: string,
  email: string,
  password?: string
): Promise<AuthUser> {
  const res = await fetch("/api/auth", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, email, password }),
  });
  const data = await res.json();
  if (!res.ok) {
    const msg: string = data.error ?? "Auth failed";
    if (msg.includes("EMAIL_EXISTS")) throw new Error("An account with this email already exists");
    if (msg.includes("INVALID_LOGIN_CREDENTIALS") || msg.includes("INVALID_PASSWORD"))
      throw new Error("Invalid email or password");
    if (msg.includes("EMAIL_NOT_FOUND")) throw new Error("No account with that email");
    if (msg.includes("WEAK_PASSWORD")) throw new Error("Password must be at least 6 characters");
    if (msg.includes("INVALID_EMAIL")) throw new Error("Invalid email address");
    if (msg.includes("TOO_MANY_ATTEMPTS")) throw new Error("Too many attempts. Try again later.");
    throw new Error(msg);
  }
  return {
    email: data.email,
    uid: data.localId,
    idToken: data.idToken,
    refreshToken: data.refreshToken,
  };
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  loading: true,
  minecraftProfile: null,

  hydrate: () => {
    const user = loadUser();
    set({ user, loading: false });
  },

  signUp: async (email, password) => {
    const user = await authViaRest("signUp", email, password);
    saveUser(user);
    set({ user });
  },

  signIn: async (email, password) => {
    const user = await authViaRest("signIn", email, password);
    saveUser(user);
    set({ user });
  },

  signInWithGoogle: async () => {
    const a = auth();
    const p = googleProvider();
    if (!a || !p) throw new Error("Firebase not configured");
    const result = await signInWithPopup(a, p);
    const fbUser = result.user;
    const token = await fbUser.getIdToken();
    const user: AuthUser = {
      email: fbUser.email ?? "",
      uid: fbUser.uid,
      idToken: token,
      refreshToken: fbUser.refreshToken,
    };
    saveUser(user);
    set({ user });
  },

  signInWithMicrosoft: async () => {
    const a = auth();
    const p = microsoftProvider();
    if (!a || !p) throw new Error("Firebase not configured");
    const result = await signInWithPopup(a, p);
    const fbUser = result.user;
    const token = await fbUser.getIdToken();
    const user: AuthUser = {
      email: fbUser.email ?? "",
      uid: fbUser.uid,
      idToken: token,
      refreshToken: fbUser.refreshToken,
    };
    saveUser(user);
    set({ user });
  },

  resetPassword: async (email) => {
    const res = await fetch("/api/auth", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "resetPassword", email }),
    });
    const data = await res.json();
    if (!res.ok) {
      const msg: string = data.error ?? "Failed to send reset email";
      if (msg.includes("EMAIL_NOT_FOUND")) throw new Error("No account with that email");
      throw new Error(msg);
    }
  },

  signOut: () => {
    saveUser(null);
    set({ user: null, minecraftProfile: null });
  },
}));
