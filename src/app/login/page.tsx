"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@store/useAuthStore";
import { AuthLayout, MC_BTN, BTN_STYLE, INPUT_STYLE } from "@ui/AuthLayout";

export default function LoginPage() {
  const router = useRouter();
  const { signIn, signInWithGoogle, signInWithMicrosoft } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signIn(email, password);
      window.location.href = "/worlds";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to sign in");
    } finally {
      setLoading(false);
    }
  };

  const handleOAuth = async (provider: "google" | "microsoft") => {
    setError("");
    setLoading(true);
    try {
      if (provider === "google") {
        await signInWithGoogle();
      } else {
        await signInWithMicrosoft();
      }
      window.location.href = "/worlds";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : `${provider} sign-in failed`);
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Sign In">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/15 rounded-sm focus:border-white/20 transition-colors"
          style={INPUT_STYLE}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2.5 font-mono text-sm outline-none placeholder:text-white/15 rounded-sm focus:border-white/20 transition-colors"
          style={INPUT_STYLE}
        />

        {error && (
          <p className="text-red-400 font-mono text-xs text-center">{error}</p>
        )}

        <button
          type="submit"
          disabled={loading}
          className={MC_BTN + " w-full text-sm"}
          style={BTN_STYLE}
        >
          {loading ? "Signing in..." : "Sign In"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-white/10" />
        <span className="text-white/25 font-mono text-xs">or</span>
        <div className="flex-1 h-px bg-white/10" />
      </div>

      <div className="flex flex-col gap-2">
        <button
          onClick={() => handleOAuth("google")}
          disabled={loading}
          className={MC_BTN + " w-full text-sm flex items-center justify-center gap-2 rounded-sm"}
          style={{
            ...BTN_STYLE,
            background: "rgba(255,255,255,0.04)",
            border: "2px solid rgba(255,255,255,0.08)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 24 24">
            <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
            <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
            <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
            <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
          </svg>
          Sign in with Google
        </button>

        <button
          onClick={() => handleOAuth("microsoft")}
          disabled={loading}
          className={MC_BTN + " w-full text-sm flex items-center justify-center gap-2 rounded-sm"}
          style={{
            ...BTN_STYLE,
            background: "rgba(255,255,255,0.04)",
            border: "2px solid rgba(255,255,255,0.08)",
          }}
        >
          <svg width="16" height="16" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#f25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7fba00" />
            <rect x="1" y="11" width="9" height="9" fill="#00a4ef" />
            <rect x="11" y="11" width="9" height="9" fill="#ffb900" />
          </svg>
          Sign in with Microsoft
        </button>

        <p className="text-[11px] font-mono text-white/25 mt-1 text-center">
          Microsoft links your Mojang account to import your Minecraft skin
        </p>
      </div>

      <div className="flex flex-col items-center gap-2 mt-5">
        <Link
          href="/forgot-password"
          className="text-[12px] font-mono text-white/30 hover:text-white/70 transition-colors"
        >
          Forgot password?
        </Link>
        <Link
          href="/signup"
          className="text-[12px] font-mono text-white/30 hover:text-white/70 transition-colors"
        >
          Don&apos;t have an account? Sign up
        </Link>
      </div>
    </AuthLayout>
  );
}
