"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { useAuthStore } from "@store/useAuthStore";
import { AuthLayout, MC_BTN, BTN_STYLE, INPUT_STYLE } from "@ui/AuthLayout";

export default function SignUpPage() {
  const router = useRouter();
  const { signUp, signInWithGoogle } = useAuthStore();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (password !== confirmPassword) {
      setError("Passwords do not match");
      return;
    }
    if (password.length < 6) {
      setError("Password must be at least 6 characters");
      return;
    }

    setLoading(true);
    try {
      await signUp(email, password);
      window.location.href = "/worlds";
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to create account");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Create Account">
      <form onSubmit={handleSubmit} className="flex flex-col gap-3">
        <input
          type="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
          className="w-full px-3 py-2.5 font-mono text-sm outline-none placeholder:text-[#555]"
          style={INPUT_STYLE}
        />
        <input
          type="password"
          placeholder="Password"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
          className="w-full px-3 py-2.5 font-mono text-sm outline-none placeholder:text-[#555]"
          style={INPUT_STYLE}
        />
        <input
          type="password"
          placeholder="Confirm Password"
          value={confirmPassword}
          onChange={(e) => setConfirmPassword(e.target.value)}
          required
          className="w-full px-3 py-2.5 font-mono text-sm outline-none placeholder:text-[#555]"
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
          {loading ? "Creating account..." : "Create Account"}
        </button>
      </form>

      <div className="flex items-center gap-3 my-4">
        <div className="flex-1 h-px bg-[#555]" />
        <span className="text-[#777] font-mono text-xs">or</span>
        <div className="flex-1 h-px bg-[#555]" />
      </div>

      <button
        onClick={async () => {
          setError("");
          setLoading(true);
          try {
            await signInWithGoogle();
            window.location.href = "/worlds";
          } catch (err: unknown) {
            setError(err instanceof Error ? err.message : "Google sign-up failed");
          } finally {
            setLoading(false);
          }
        }}
        disabled={loading}
        className={MC_BTN + " w-full text-sm flex items-center justify-center gap-2"}
        style={{
          ...BTN_STYLE,
          background:
            "linear-gradient(to bottom, #4a4a4a 0%, #3a3a3a 40%, #2e2e2e 60%, #222 100%)",
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24">
          <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 01-2.2 3.32v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.1z" fill="#4285F4"/>
          <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
          <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" fill="#FBBC05"/>
          <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
        </svg>
        Sign up with Google
      </button>

      <div className="flex flex-col items-center gap-2 mt-5">
        <Link
          href="/login"
          className="text-[12px] font-mono text-[#8a8a8a] hover:text-white transition-colors"
        >
          Already have an account? Sign in
        </Link>
      </div>
    </AuthLayout>
  );
}
