import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@engine": path.resolve(__dirname, "src/engine"),
      "@systems": path.resolve(__dirname, "src/systems"),
      "@ui": path.resolve(__dirname, "src/ui"),
      "@store": path.resolve(__dirname, "src/store"),
      "@lib": path.resolve(__dirname, "src/lib"),
      "@data": path.resolve(__dirname, "src/data"),
      "@hooks": path.resolve(__dirname, "src/hooks"),
      "@": path.resolve(__dirname, "src"),
    },
  },
  test: {
    globals: true,
    environment: "node",
    include: ["src/**/*.test.{ts,tsx}"],
  },
});
