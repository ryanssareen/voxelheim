"use client";

import { useState } from "react";
import Link from "next/link";
import { useAuthStore } from "@store/useAuthStore";
import { AuthLayout, MC_BTN, BTN_STYLE, INPUT_STYLE } from "@ui/AuthLayout";

export default function ForgotPasswordPage() {
  const { resetPassword } = useAuthStore();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await resetPassword(email);
      setSent(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Failed to send reset email");
    } finally {
      setLoading(false);
    }
  };

  return (
    <AuthLayout title="Reset Password">
      {sent ? (
        <div className="flex flex-col items-center gap-4">
          <p className="text-[#8a8a8a] font-mono text-sm text-center">
            Password reset link sent to <span className="text-white">{email}</span>. Check your inbox.
          </p>
          <Link
            href="/login"
            className={MC_BTN + " w-full text-sm"}
            style={BTN_STYLE}
          >
            Back to Sign In
          </Link>
        </div>
      ) : (
        <>
          <p className="text-[#8a8a8a] font-mono text-xs text-center mb-4">
            Enter your email and we&apos;ll send you a reset link
          </p>
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

            {error && (
              <p className="text-red-400 font-mono text-xs text-center">
                {error}
              </p>
            )}

            <button
              type="submit"
              disabled={loading}
              className={MC_BTN + " w-full text-sm"}
              style={BTN_STYLE}
            >
              {loading ? "Sending..." : "Send Reset Link"}
            </button>
          </form>

          <div className="flex flex-col items-center mt-5">
            <Link
              href="/login"
              className="text-[12px] font-mono text-[#8a8a8a] hover:text-white transition-colors"
            >
              Back to Sign In
            </Link>
          </div>
        </>
      )}
    </AuthLayout>
  );
}
