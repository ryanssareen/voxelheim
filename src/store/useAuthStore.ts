import { create } from "zustand";

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

// Google OAuth via popup — opens Firebase's OAuth handler directly
async function googleOAuthPopup(): Promise<AuthUser> {
  const apiKey = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
  const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
  if (!apiKey || !authDomain) throw new Error("Firebase not configured");

  return new Promise((resolve, reject) => {
    const width = 500;
    const height = 600;
    const left = window.screenX + (window.outerWidth - width) / 2;
    const top = window.screenY + (window.outerHeight - height) / 2;

    // Use Google's OAuth2 endpoint directly
    const redirectUri = window.location.origin + "/api/auth/google-callback";
    const clientId = process.env.NEXT_PUBLIC_GOOGLE_CLIENT_ID;

    // Fall back to signInWithPopup via Firebase REST approach
    // Use the accounts.google.com OAuth flow
    const state = crypto.randomUUID();
    sessionStorage.setItem("oauth_state", state);

    const googleAuthUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
      `client_id=${encodeURIComponent(apiKey)}.apps.googleusercontent.com&` +
      `redirect_uri=${encodeURIComponent(redirectUri)}&` +
      `response_type=code&` +
      `scope=email+profile&` +
      `state=${state}`;

    // Actually, the simplest approach: use Firebase's signInWithIdp REST endpoint
    // But that requires an OAuth token we don't have yet.
    // Let's use a simpler approach - redirect to our own API endpoint

    // For now, throw a clear error - Google OAuth needs more server setup
    if (!clientId) {
      reject(new Error("Google sign-in requires additional server configuration. Use email/password for now."));
      return;
    }

    const popup = window.open(googleAuthUrl, "google-signin", `width=${width},height=${height},left=${left},top=${top}`);
    if (!popup) {
      reject(new Error("Popup was blocked. Please allow popups for this site."));
      return;
    }

    const interval = setInterval(() => {
      if (popup.closed) {
        clearInterval(interval);
        reject(new Error("Sign-in cancelled"));
      }
    }, 500);
  });
}

export const useAuthStore = create<AuthState>((set) => ({
  user: typeof window !== "undefined" ? loadUser() : null,
  loading: false,
  minecraftProfile: null,

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
    throw new Error("Google sign-in coming soon. Use email/password for now.");
  },

  signInWithMicrosoft: async () => {
    throw new Error("Microsoft sign-in coming soon. Use email/password for now.");
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
