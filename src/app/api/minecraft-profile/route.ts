import { NextResponse } from "next/server";

interface XboxAuthResponse {
  Token: string;
  DisplayClaims: { xui: Array<{ uhs: string }> };
}

export async function POST(req: Request) {
  try {
    const { accessToken } = await req.json();
    if (!accessToken) {
      return NextResponse.json({ error: "No access token" }, { status: 400 });
    }

    // Step 1: Authenticate with Xbox Live
    const xblRes = await fetch("https://user.auth.xboxlive.com/user/authenticate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Properties: {
          AuthMethod: "RPS",
          SiteName: "user.auth.xboxlive.com",
          RpsTicket: `d=${accessToken}`,
        },
        RelyingParty: "http://auth.xboxlive.com",
        TokenType: "JWT",
      }),
    });
    if (!xblRes.ok) {
      return NextResponse.json({ error: "Xbox Live auth failed" }, { status: 401 });
    }
    const xbl: XboxAuthResponse = await xblRes.json();
    const xblToken = xbl.Token;
    const userHash = xbl.DisplayClaims.xui[0].uhs;

    // Step 2: Get XSTS token
    const xstsRes = await fetch("https://xsts.auth.xboxlive.com/xsts/authorize", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        Properties: { SandboxId: "RETAIL", UserTokens: [xblToken] },
        RelyingParty: "rp://api.minecraftservices.com/",
        TokenType: "JWT",
      }),
    });
    if (!xstsRes.ok) {
      return NextResponse.json({ error: "XSTS auth failed" }, { status: 401 });
    }
    const xsts: XboxAuthResponse = await xstsRes.json();

    // Step 3: Login to Minecraft with Xbox
    const mcRes = await fetch("https://api.minecraftservices.com/authentication/login_with_xbox", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        identityToken: `XBL3.0 x=${userHash};${xsts.Token}`,
      }),
    });
    if (!mcRes.ok) {
      return NextResponse.json({ error: "Minecraft auth failed" }, { status: 401 });
    }
    const mcAuth: { access_token: string } = await mcRes.json();

    // Step 4: Get Minecraft profile (name + skin)
    const profileRes = await fetch("https://api.minecraftservices.com/minecraft/profile", {
      headers: { Authorization: `Bearer ${mcAuth.access_token}` },
    });
    if (!profileRes.ok) {
      return NextResponse.json(
        { error: "No Minecraft profile found (game not owned?)" },
        { status: 404 }
      );
    }
    const profile: {
      id: string;
      name: string;
      skins: Array<{ url: string; variant: string }>;
    } = await profileRes.json();

    const skinUrl = profile.skins?.[0]?.url ?? null;

    return NextResponse.json({
      uuid: profile.id,
      name: profile.name,
      skinUrl,
    });
  } catch {
    return NextResponse.json({ error: "Internal error" }, { status: 500 });
  }
}
