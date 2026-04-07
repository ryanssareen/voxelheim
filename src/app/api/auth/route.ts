import { NextResponse } from "next/server";

const API_KEY = process.env.NEXT_PUBLIC_FIREBASE_API_KEY;
const BASE = "https://identitytoolkit.googleapis.com/v1/accounts";

interface FirebaseAuthResponse {
  idToken: string;
  email: string;
  refreshToken: string;
  expiresIn: string;
  localId: string;
}

interface FirebaseAuthError {
  error: { message: string; code: number };
}

async function firebaseAuthRequest(
  endpoint: string,
  body: Record<string, unknown>
): Promise<NextResponse> {
  const res = await fetch(`${BASE}:${endpoint}?key=${API_KEY}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  const data = await res.json();

  if (!res.ok) {
    const err = data as FirebaseAuthError;
    const msg = err.error?.message ?? "Unknown error";
    return NextResponse.json({ error: msg }, { status: 400 });
  }

  const authData = data as FirebaseAuthResponse;
  return NextResponse.json({
    idToken: authData.idToken,
    refreshToken: authData.refreshToken,
    email: authData.email,
    localId: authData.localId,
    expiresIn: authData.expiresIn,
  });
}

export async function POST(req: Request) {
  const { action, email, password } = await req.json();

  if (!API_KEY) {
    return NextResponse.json({ error: "Firebase not configured" }, { status: 500 });
  }

  switch (action) {
    case "signUp":
      return firebaseAuthRequest("signUp", {
        email,
        password,
        returnSecureToken: true,
      });

    case "signIn":
      return firebaseAuthRequest("signInWithPassword", {
        email,
        password,
        returnSecureToken: true,
      });

    case "resetPassword": {
      const res = await fetch(
        `${BASE}:sendOobCode?key=${API_KEY}`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ requestType: "PASSWORD_RESET", email }),
        }
      );
      if (!res.ok) {
        const data = await res.json();
        return NextResponse.json(
          { error: data.error?.message ?? "Failed to send reset email" },
          { status: 400 }
        );
      }
      return NextResponse.json({ success: true });
    }

    default:
      return NextResponse.json({ error: "Invalid action" }, { status: 400 });
  }
}
