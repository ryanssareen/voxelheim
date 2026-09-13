import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { AuthHydrator } from "./AuthHydrator";
import { DevErrorOverlay } from "./DevErrorOverlay";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Voxelheim",
  description: "A voxel sandbox survival game in your browser",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Voxelheim",
    statusBarStyle: "black-translucent",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
  // Next emits only the standardised `mobile-web-app-capable`. iOS before 17
  // reads the Apple-prefixed name, and without it those devices open the
  // home-screen shortcut in a normal Safari tab instead of standalone.
  other: {
    "apple-mobile-web-app-capable": "yes",
  },
};

// viewportFit "cover" is load-bearing, not cosmetic: env(safe-area-inset-*)
// resolves to 0 without it, so every notch/home-indicator inset the touch HUD
// relies on would silently collapse. Zoom stays enabled deliberately: iOS
// ignores user-scalable=no anyway, and disabling it would only cost pinch-zoom
// on the forms. Unwanted zoom during play is handled with touch-action instead.
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#14120F",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        {process.env.NODE_ENV !== "production" && (
          // Plain ES5, inline, no bundler, no React. Runs before any chunk
          // loads, so it still reports when the bundle itself is what fails.
          // Capture-phase listener is required: resource load errors (a script
          // that 404s or fails to parse) do not bubble.
          <script
            dangerouslySetInnerHTML={{
              __html: `(function(){try{
var log=[],box=null;
function paint(){if(!box||!document.body)return;
box.textContent=log.join("\\n");
box.style.background=log.join("").indexOf("[err")>-1?"rgba(150,20,20,.97)":"rgba(20,90,35,.95)";}
function add(m){log.push(m);paint();}
window.addEventListener("error",function(e){
if(e.target&&e.target!==window&&e.target.tagName){add("[err] failed to load "+e.target.tagName+": "+(e.target.src||e.target.href||"?"));}
else{add("[err] "+e.message+" @ "+(e.filename||"?")+":"+(e.lineno||"?"));}},true);
window.addEventListener("unhandledrejection",function(e){
var r=e.reason;add("[err-promise] "+((r&&r.message)||String(r)));});
function mount(){if(!document.body){setTimeout(mount,30);return;}
box=document.createElement("div");
box.style.cssText="position:fixed;left:0;right:0;bottom:0;z-index:2147483647;color:#fff;font:11px/1.45 ui-monospace,Menlo,monospace;padding:8px 10px;max-height:45vh;overflow:auto;white-space:pre-wrap;word-break:break-word;-webkit-overflow-scrolling:touch";
document.body.appendChild(box);
add("inline script ran");
var t0=Date.now(),status="waiting for React...";
log.push(status);
function refresh(){
var el=Date.now()-t0;
if(window.__reactMounted){status="React hydrated: YES after "+(el/1000).toFixed(1)+"s";}
else{status="React hydrated: NO ("+(el/1000).toFixed(0)+"s elapsed) | rsc:"+
((self.__next_f&&self.__next_f.length)||0)+" scripts:"+document.querySelectorAll("script[src]").length;}
log[log.length-1]=status;paint();
if(!window.__reactMounted&&el<120000)setTimeout(refresh,500);}
refresh();}
if(document.readyState==="loading"){document.addEventListener("DOMContentLoaded",mount);}else{mount();}
}catch(err){}})();`,
            }}
          />
        )}
      </head>
      <body className="min-h-full flex flex-col">
        <AuthHydrator />
        {process.env.NODE_ENV !== "production" && <DevErrorOverlay />}
        {children}
      </body>
    </html>
  );
}
