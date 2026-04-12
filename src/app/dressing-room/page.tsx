"use client";

import { useEffect, useRef, useState, useCallback } from "react";
import { useRouter } from "next/navigation";
import { useSkinStore, SKIN_PRESETS, type SkinColors } from "@store/useSkinStore";

const MC_BTN =
  "block text-center py-2.5 text-white font-mono tracking-wide hover:brightness-125 active:brightness-90 transition-all select-none cursor-pointer";
const MC_BTN_STYLE: React.CSSProperties = {
  background:
    "linear-gradient(to bottom, #7a7a7a 0%, #5a5a5a 40%, #484848 60%, #3a3a3a 100%)",
  border: "3px solid #1a1a1a",
  boxShadow:
    "inset 0 2px 0 rgba(255,255,255,0.15), inset 0 -2px 0 rgba(0,0,0,0.3), 0 3px 6px rgba(0,0,0,0.4)",
  textShadow: "2px 2px 0 #2a2a2a",
};

const numToHex = (n: number) => `#${n.toString(16).padStart(6, "0")}`;
const hexToNum = (s: string) => parseInt(s.replace("#", ""), 16);

const COLOR_FIELDS: Array<{ key: keyof SkinColors; label: string }> = [
  { key: "skinColor", label: "Skin" },
  { key: "hairColor", label: "Hair" },
  { key: "shirtColor", label: "Shirt" },
  { key: "pantsColor", label: "Pants" },
  { key: "shoeColor", label: "Shoes" },
];

export default function DressingRoomPage() {
  const router = useRouter();
  const store = useSkinStore();
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const threeRef = useRef<{
    renderer: import("three").WebGLRenderer;
    scene: import("three").Scene;
    camera: import("three").PerspectiveCamera;
    model: import("@engine/player/PlayerModel").PlayerModel;
    animId: number;
    rotationY: number;
    isDragging: boolean;
    lastMouseX: number;
    autoRotate: boolean;
    walkTime: number;
  } | null>(null);
  const [toast, setToast] = useState("");

  // Set up Three.js preview scene
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    let disposed = false;

    (async () => {
      const THREE = await import("three");
      const { PlayerModel } = await import("@engine/player/PlayerModel");

      if (disposed) return;

      const width = canvas.clientWidth;
      const height = canvas.clientHeight;

      const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
      renderer.setSize(width, height);
      renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

      const scene = new THREE.Scene();
      scene.background = new THREE.Color(0x1a1a2e);

      const camera = new THREE.PerspectiveCamera(30, width / height, 0.1, 100);
      camera.position.set(0, 1.2, 4.5);
      camera.lookAt(0, 0.85, 0);

      const ambient = new THREE.AmbientLight(0xffffff, 0.7);
      scene.add(ambient);
      const dir = new THREE.DirectionalLight(0xffffff, 0.9);
      dir.position.set(3, 4, 2);
      scene.add(dir);

      // Floor disc
      const floor = new THREE.Mesh(
        new THREE.CircleGeometry(1.2, 32),
        new THREE.MeshLambertMaterial({ color: 0x2a2a3e })
      );
      floor.rotation.x = -Math.PI / 2;
      floor.position.y = 0;
      scene.add(floor);

      const skinState = useSkinStore.getState();
      const model = new PlayerModel({
        syncArmor: false,
        skinColor: skinState.skinColor,
        hairColor: skinState.hairColor,
        shirtColor: skinState.shirtColor,
        pantsColor: skinState.pantsColor,
        shoeColor: skinState.shoeColor,
      });
      scene.add(model.group);

      const state = {
        renderer,
        scene,
        camera,
        model,
        animId: 0,
        rotationY: 0,
        isDragging: false,
        lastMouseX: 0,
        autoRotate: true,
        walkTime: 0,
      };
      threeRef.current = state;

      const animate = () => {
        if (disposed) return;
        state.animId = requestAnimationFrame(animate);

        if (state.autoRotate && !state.isDragging) {
          state.rotationY += 0.008;
        }

        state.walkTime += 0.016;
        const swing = Math.sin(state.walkTime * 3) * 0.25;
        model.update(
          { x: 0, y: 0, z: 0 },
          state.rotationY,
          true,
          false,
          0.016
        );
        // Override the group rotation so update() walk anim works but rotation is manual
        model.group.rotation.y = state.rotationY;
        model.group.position.set(0, 0, 0);

        renderer.render(scene, camera);
      };
      animate();

      // Handle resize
      const onResize = () => {
        const w = canvas.clientWidth;
        const h = canvas.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
      };
      window.addEventListener("resize", onResize);

      // Cleanup will be handled in the return
      canvas.dataset.resizeCleanup = "true";
      (canvas as unknown as Record<string, () => void>).__cleanupResize = () => {
        window.removeEventListener("resize", onResize);
      };
    })();

    return () => {
      disposed = true;
      const state = threeRef.current;
      if (state) {
        cancelAnimationFrame(state.animId);
        state.renderer.dispose();
        state.model.dispose();
        threeRef.current = null;
      }
      if (canvas && (canvas as unknown as Record<string, () => void>).__cleanupResize) {
        (canvas as unknown as Record<string, () => void>).__cleanupResize();
      }
    };
  }, []);

  // Sync colors to preview model when store changes
  useEffect(() => {
    const state = threeRef.current;
    if (!state) return;
    state.model.updateColors({
      skinColor: store.skinColor,
      hairColor: store.hairColor,
      shirtColor: store.shirtColor,
      pantsColor: store.pantsColor,
      shoeColor: store.shoeColor,
    });
  }, [store.skinColor, store.hairColor, store.shirtColor, store.pantsColor, store.shoeColor]);

  // Mouse drag rotation
  const onPointerDown = useCallback((e: React.PointerEvent) => {
    const state = threeRef.current;
    if (!state) return;
    state.isDragging = true;
    state.autoRotate = false;
    state.lastMouseX = e.clientX;
  }, []);

  const onPointerMove = useCallback((e: React.PointerEvent) => {
    const state = threeRef.current;
    if (!state || !state.isDragging) return;
    const dx = e.clientX - state.lastMouseX;
    state.rotationY += dx * 0.01;
    state.lastMouseX = e.clientX;
  }, []);

  const onPointerUp = useCallback(() => {
    const state = threeRef.current;
    if (state) state.isDragging = false;
  }, []);

  const handleExport = () => {
    const skin: SkinColors = {
      skinColor: store.skinColor,
      hairColor: store.hairColor,
      shirtColor: store.shirtColor,
      pantsColor: store.pantsColor,
      shoeColor: store.shoeColor,
    };
    const data = JSON.stringify({
      name: "Voxelheim Skin",
      version: 1,
      colors: Object.fromEntries(
        Object.entries(skin).map(([k, v]) => [k, v.toString(16).padStart(6, "0")])
      ),
    }, null, 2);
    const blob = new Blob([data], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "voxelheim-skin.json";
    a.click();
    URL.revokeObjectURL(url);
    showToast("Skin exported!");
  };

  const handleImport = () => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const data = JSON.parse(text);
        if (data.colors) {
          const colors: Partial<SkinColors> = {};
          for (const [key, val] of Object.entries(data.colors)) {
            if (key in store && typeof val === "string") {
              (colors as Record<string, number>)[key] = parseInt(val, 16);
            }
          }
          store.setSkinColors(colors);
          showToast("Skin imported!");
        }
      } catch {
        showToast("Invalid skin file");
      }
    };
    input.click();
  };

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(""), 2000);
  };

  return (
    <main className="relative flex min-h-screen flex-col items-center overflow-hidden select-none bg-[#1a1a1a]">
      {/* Background */}
      <div className="absolute inset-0" style={{
        background: "linear-gradient(180deg, #0b0e2a 0%, #1a1a2e 30%, #1a1a1a 60%)",
      }} />
      <div className="absolute inset-0 opacity-10" style={{
        background:
          "repeating-linear-gradient(90deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px), repeating-linear-gradient(0deg, #6b4226 0px, #7a4f2d 4px, #5c3a1e 8px, #6b4226 12px)",
        backgroundSize: "12px 12px",
        imageRendering: "pixelated",
      }} />

      <div className="relative z-10 w-full max-w-[720px] px-4 pt-8 pb-8 animate-fadeIn">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <button
            onClick={() => router.push("/worlds")}
            className="text-white/40 hover:text-white/70 font-mono text-sm transition-colors cursor-pointer"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            &larr; Back
          </button>
          <h1
            className="text-2xl font-mono font-bold text-white"
            style={{ textShadow: "2px 2px 0 #000" }}
          >
            Dressing Room
          </h1>
          <div className="w-12" />
        </div>

        {/* Main layout: preview + controls */}
        <div className="flex gap-6 mb-6" style={{ minHeight: 380 }}>
          {/* 3D Preview */}
          <div
            className="flex-1 rounded-sm overflow-hidden relative"
            style={{
              border: "3px solid rgba(255,255,255,0.08)",
              background: "#1a1a2e",
              minWidth: 300,
            }}
          >
            <canvas
              ref={canvasRef}
              style={{ position: "absolute", inset: 0, width: "100%", height: "100%", cursor: "grab", display: "block" }}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
            />
          </div>

          {/* Color pickers */}
          <div
            className="w-52 flex flex-col gap-3 p-4 rounded-sm"
            style={{
              background: "rgba(255,255,255,0.03)",
              border: "3px solid rgba(255,255,255,0.08)",
            }}
          >
            <p
              className="text-xs font-mono text-white/50 uppercase tracking-wider mb-1"
              style={{ textShadow: "1px 1px 0 #000" }}
            >
              Colors
            </p>
            {COLOR_FIELDS.map(({ key, label }) => (
              <div key={key} className="flex items-center gap-3">
                <label
                  className="text-sm font-mono text-white/70 flex-1"
                  style={{ textShadow: "1px 1px 0 #000" }}
                >
                  {label}
                </label>
                <div className="relative">
                  <input
                    type="color"
                    value={numToHex(store[key])}
                    onChange={(e) => store.setSkinColors({ [key]: hexToNum(e.target.value) })}
                    className="w-10 h-8 cursor-pointer rounded-sm border-2 border-white/10"
                    style={{
                      background: numToHex(store[key]),
                      WebkitAppearance: "none",
                      padding: 0,
                    }}
                  />
                </div>
              </div>
            ))}

            <div className="flex-1" />

            {/* Randomize */}
            <button
              onClick={() => {
                const rand = () => Math.floor(Math.random() * 0xffffff);
                store.setSkinColors({
                  skinColor: 0xc8a882 + Math.floor(Math.random() * 0x202020) - 0x101010,
                  hairColor: rand(),
                  shirtColor: rand(),
                  pantsColor: rand(),
                  shoeColor: rand(),
                });
              }}
              className={MC_BTN + " text-xs py-1.5"}
              style={{
                ...MC_BTN_STYLE,
                background: "linear-gradient(to bottom, #8a5a9a 0%, #6a3a7a 40%, #5a2a6a 60%, #4a1a5a 100%)",
              }}
            >
              Randomize
            </button>

            {/* Reset */}
            <button
              onClick={() => store.resetSkin()}
              className={MC_BTN + " text-xs py-1.5"}
              style={MC_BTN_STYLE}
            >
              Reset
            </button>
          </div>
        </div>

        {/* Presets */}
        <div
          className="mb-6 p-4 rounded-sm"
          style={{
            background: "rgba(255,255,255,0.03)",
            border: "3px solid rgba(255,255,255,0.08)",
          }}
        >
          <p
            className="text-xs font-mono text-white/50 uppercase tracking-wider mb-3"
            style={{ textShadow: "1px 1px 0 #000" }}
          >
            Presets
          </p>
          <div className="flex flex-wrap gap-2">
            {Object.entries(SKIN_PRESETS).map(([name, colors]) => (
              <button
                key={name}
                onClick={() => store.setSkinColors(colors)}
                className="flex items-center gap-2 px-3 py-2 font-mono text-xs text-white/70 hover:text-white hover:brightness-125 transition-all cursor-pointer rounded-sm"
                style={{
                  background: "rgba(255,255,255,0.04)",
                  border: "2px solid rgba(255,255,255,0.08)",
                }}
              >
                {/* Color preview dots */}
                <span className="flex gap-0.5">
                  {[colors.shirtColor, colors.pantsColor, colors.hairColor].map((c, i) => (
                    <span
                      key={i}
                      className="w-3 h-3 rounded-full"
                      style={{ background: numToHex(c) }}
                    />
                  ))}
                </span>
                {name}
              </button>
            ))}
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex gap-2.5">
          <button
            onClick={() => router.push("/worlds")}
            className={MC_BTN + " flex-1 text-base"}
            style={{
              ...MC_BTN_STYLE,
              background: "linear-gradient(to bottom, #5a9a4a 0%, #3a7a2a 40%, #2a6a1a 60%, #1a5a0a 100%)",
            }}
          >
            Done
          </button>
          <button
            onClick={handleExport}
            className={MC_BTN + " w-28 text-sm"}
            style={{
              ...MC_BTN_STYLE,
              background: "linear-gradient(to bottom, #3a6a8a 0%, #2a5a7a 40%, #1a4a6a 60%, #0a3a5a 100%)",
            }}
          >
            Export
          </button>
          <button
            onClick={handleImport}
            className={MC_BTN + " w-28 text-sm"}
            style={{
              ...MC_BTN_STYLE,
              background: "linear-gradient(to bottom, #8a7a3a 0%, #7a6a2a 40%, #6a5a1a 60%, #5a4a0a 100%)",
            }}
          >
            Import
          </button>
        </div>
      </div>

      {/* Toast */}
      {toast && (
        <div
          className="fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 font-mono text-sm text-white rounded-sm z-50"
          style={{
            background: "rgba(0,0,0,0.85)",
            border: "2px solid rgba(255,255,255,0.15)",
            textShadow: "1px 1px 0 #000",
          }}
        >
          {toast}
        </div>
      )}
    </main>
  );
}
