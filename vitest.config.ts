import path from "node:path";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    // Mirrors the "@/*" path in tsconfig.json so tests import modules by the
    // same specifier the app does. Done by hand rather than with
    // vite-tsconfig-paths: that package is ESM-only, this config is loaded as
    // CJS (no "type": "module" in package.json), and one alias isn't worth a
    // dependency. If tsconfig gains more paths, they need adding here too.
    alias: { "@": path.resolve(__dirname, "src") },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
    env: {
      // checkinAuth throws without it. A fixed value keeps signatures
      // deterministic; it is not the production secret.
      CHECKIN_SESSION_SECRET: "test-secret-for-unit-tests-only",
    },
  },
});
