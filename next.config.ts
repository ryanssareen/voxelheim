import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Dev-only. Next 16 refuses cross-origin requests to dev endpoints, and the
  // refusal for the HMR WebSocket is a bare "Unauthorized" line rather than a
  // 101. Safari/WebKit never finishes hydrating the app tree when that socket
  // fails (Chromium shrugs it off), so phone testing through a tunnel shows
  // fully painted SSR HTML with every button dead. Listing the tunnel hosts
  // lets the socket connect and hydration proceeds.
  allowedDevOrigins: [
    "*.trycloudflare.com",
    "*.ngrok-free.app",
    "*.ngrok.io",
    "*.loca.lt",
  ],
};

export default nextConfig;
