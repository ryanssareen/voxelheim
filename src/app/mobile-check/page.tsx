"use client";

/**
 * Device capability probe for mobile bring-up. Not linked from anywhere —
 * open it directly on a phone (see `npm run dev:lan`) to find out which of the
 * three fullscreen routes that device actually supports, and to watch the
 * viewport numbers change as the browser chrome collapses.
 */
import { useCallback, useEffect, useRef, useState } from "react";

type Row = { label: string; value: string; good?: boolean | null };

type WebkitDocument = Document & {
  webkitFullscreenEnabled?: boolean;
  webkitFullscreenElement?: Element | null;
};

type WebkitElement = HTMLElement & {
  webkitRequestFullscreen?: () => Promise<void> | void;
};

/**
 * Every value here comes from a browser global, so it is read after mount
 * rather than during render — reading them inline makes the server and client
 * markup disagree and trips hydration.
 */
function readRows(insets: string): Row[] {
  const doc = document as WebkitDocument;
  const nav = navigator as Navigator & { standalone?: boolean };
  const vv = window.visualViewport;
  const standalone =
    window.matchMedia("(display-mode: standalone)").matches || nav.standalone === true;

  return [
    {
      label: "Fullscreen API (standard)",
      value: String(Boolean(doc.fullscreenEnabled)),
      good: Boolean(doc.fullscreenEnabled),
    },
    {
      label: "Fullscreen API (webkit)",
      value: String(Boolean(doc.webkitFullscreenEnabled)),
      good: Boolean(doc.webkitFullscreenEnabled),
    },
    {
      label: "Currently fullscreen",
      value: String(Boolean(doc.fullscreenElement ?? doc.webkitFullscreenElement)),
      good: null,
    },
    { label: "Launched standalone (home screen)", value: String(standalone), good: standalone },
    {
      label: "Pointer Lock API",
      value: String("requestPointerLock" in document.documentElement),
      good: null,
    },
    { label: "Max touch points", value: String(nav.maxTouchPoints), good: null },
    { label: "devicePixelRatio", value: String(window.devicePixelRatio), good: null },
    { label: "window.inner (W×H)", value: `${window.innerWidth} × ${window.innerHeight}`, good: null },
    {
      label: "visualViewport (W×H)",
      value: vv ? `${Math.round(vv.width)} × ${Math.round(vv.height)}` : "unsupported",
      good: null,
    },
    { label: "screen (W×H)", value: `${screen.width} × ${screen.height}`, good: null },
    { label: "safe-area insets", value: insets, good: null },
    {
      label: "orientation",
      value: window.matchMedia("(orientation: landscape)").matches ? "landscape" : "portrait",
      good: null,
    },
    {
      label: "chrome eating (screen − viewport)",
      value: vv ? `${Math.max(0, Math.round(screen.height - vv.height))}px` : "unknown",
      good: null,
    },
  ];
}

export default function MobileCheckPage() {
  const boxRef = useRef<HTMLDivElement>(null);
  const [rows, setRows] = useState<Row[] | null>(null);
  const [fsNote, setFsNote] = useState("not attempted");

  // One loop drives everything: re-read the capability values, the live
  // viewport numbers, and the resolved safe-area padding — which changes when
  // the browser chrome collapses or the device rotates.
  useEffect(() => {
    const tick = () => {
      const el = boxRef.current;
      const cs = el ? getComputedStyle(el) : null;
      const insets = cs
        ? `T ${cs.paddingTop} · R ${cs.paddingRight} · B ${cs.paddingBottom} · L ${cs.paddingLeft}`
        : "unmeasured";
      setRows(readRows(insets));
    };
    tick();
    window.addEventListener("resize", tick);
    window.addEventListener("orientationchange", tick);
    window.addEventListener("scroll", tick, { passive: true });
    window.visualViewport?.addEventListener("resize", tick);
    window.visualViewport?.addEventListener("scroll", tick);
    const id = window.setInterval(tick, 500);
    return () => {
      window.removeEventListener("resize", tick);
      window.removeEventListener("orientationchange", tick);
      window.removeEventListener("scroll", tick);
      window.visualViewport?.removeEventListener("resize", tick);
      window.visualViewport?.removeEventListener("scroll", tick);
      window.clearInterval(id);
    };
  }, []);

  const tryFullscreen = useCallback(async () => {
    const el = document.documentElement as WebkitElement;
    const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
    if (typeof request !== "function") {
      setFsNote("no requestFullscreen on this device");
      return;
    }
    try {
      await request.call(el);
      setFsNote("granted");
    } catch (err) {
      setFsNote(`rejected: ${(err as Error)?.message ?? "unknown"}`);
    }
  }, []);

  return (
    <div
      ref={boxRef}
      className="min-h-screen bg-[#14120F] text-[#EFEAE0] font-mono text-[13px]"
      style={{
        paddingTop: "env(safe-area-inset-top)",
        paddingRight: "env(safe-area-inset-right)",
        paddingBottom: "env(safe-area-inset-bottom)",
        paddingLeft: "env(safe-area-inset-left)",
      }}
    >
      <div className="p-4">
        <h1 className="text-[#E6B23F] text-base font-bold mb-1">Voxelheim device check</h1>
        <p className="text-[#B9B2A4] mb-4 leading-relaxed">
          Numbers update live. Swipe up to collapse the browser toolbars and watch
          the viewport height change — that is the non-API route to fullscreen.
        </p>

        <table className="w-full border-collapse mb-4">
          <tbody>
            {(rows ?? []).map((r) => (
              <tr key={r.label} className="border-b border-[#2A2621]">
                <td className="py-1.5 pr-3 text-[#B9B2A4] align-top">{r.label}</td>
                <td
                  className={
                    "py-1.5 text-right align-top " +
                    (r.good === true ? "text-[#7FD24B]" : r.good === false ? "text-[#E0574F]" : "")
                  }
                >
                  {r.value}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {rows === null && <p className="text-[#B9B2A4] mb-4">reading device…</p>}

        <button
          onClick={tryFullscreen}
          className="w-full bg-[#E6B23F] text-[#14120F] font-bold py-3 rounded mb-2 active:opacity-80"
        >
          Try requestFullscreen()
        </button>
        <p className="text-[#B9B2A4] mb-6">
          result: <span className="text-[#EFEAE0]">{fsNote}</span>
        </p>

        {/* Tall spacer: makes the page scrollable so the swipe-to-collapse
            gesture is available. The real game cannot rely on this once
            touch-action is locked for the joystick. */}
        <div className="h-[120vh] flex items-start justify-center pt-8 text-[#B9B2A4]">
          keep scrolling — chrome should collapse
        </div>
      </div>
    </div>
  );
}
