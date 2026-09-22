import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import path from "node:path";

export default defineConfig({
  plugins: [react()],
  resolve: { alias: { "@": path.resolve(__dirname, "."), "server-only": path.resolve(__dirname, "tests/stubs/server-only.ts") } },
  test: {
    environment: "jsdom",
    include: ["tests/**/*.test.ts", "tests/**/*.test.tsx"],
  },
});
