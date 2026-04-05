"use client";

import { useEffect, useRef, useState } from "react";

interface EngineState {
  isLoading: boolean;
  isReady: boolean;
  error: string | null;
}

/**
 * Manages Engine lifecycle with SSR-safe dynamic import.
 * Engine and Three.js are loaded only in the browser.
 */
export function useEngine(canvasRef: React.RefObject<HTMLCanvasElement | null>) {
  const [state, setState] = useState<EngineState>({
    isLoading: false,
    isReady: false,
    error: null,
  });
  const engineRef = useRef<any>(null);
  const initCalled = useRef(false);

  const start = () => {
    if (initCalled.current) return;
    initCalled.current = true;
    setState({ isLoading: true, isReady: false, error: null });

    const canvas = canvasRef.current;
    if (!canvas) {
      setState({ isLoading: false, isReady: false, error: "Canvas not found" });
      return;
    }

    // Dynamic import to avoid SSR — Three.js accesses `window` at module level
    import("@engine/Engine")
      .then(async ({ Engine }) => {
        const engine = new Engine(canvas);
        engineRef.current = engine;
        await engine.init();
        setState({ isLoading: false, isReady: true, error: null });
      })
      .catch((err) => {
        setState({
          isLoading: false,
          isReady: false,
          error: err instanceof Error ? err.message : String(err),
        });
      });
  };

  useEffect(() => {
    return () => {
      engineRef.current?.dispose();
      engineRef.current = null;
    };
  }, []);

  return { ...state, start, engineRef };
}
