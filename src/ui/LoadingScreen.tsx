"use client";

/**
 * Full-screen loading overlay shown while the engine initializes.
 */
export function LoadingScreen({ visible }: { visible: boolean }) {
  if (!visible) return null;

  return (
    <div className="absolute inset-0 flex items-center justify-center bg-black z-20 transition-opacity duration-500">
      <p className="text-white text-xl font-mono animate-pulse">
        Generating Island...
      </p>
    </div>
  );
}
