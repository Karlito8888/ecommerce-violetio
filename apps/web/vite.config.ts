import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";

// Resolve react and react-dom to absolute paths so Bun/Vite uses a single
// module instance in tests (avoids the react@version vs react-dom@version+hash split).
// Only applied during tests — in CI builds, node_modules/react may be hoisted to root.
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const isTest = !!process.env.VITEST;

const config = defineConfig({
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    ...(isTest
      ? {
          alias: {
            react: path.resolve(__dirname, "node_modules/react"),
            "react-dom": path.resolve(__dirname, "node_modules/react-dom"),
          },
        }
      : {}),
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});

export default config;
