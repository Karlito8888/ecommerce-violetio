import path from "path";
import { fileURLToPath } from "url";
import { defineConfig } from "vite";
import { devtools } from "@tanstack/devtools-vite";
import tsconfigPaths from "vite-tsconfig-paths";

import { tanstackStart } from "@tanstack/react-start/plugin/vite";

import viteReact from "@vitejs/plugin-react";

// Resolve react and react-dom to absolute symlink paths so Bun/Vite uses a single
// module instance in tests (avoids the react@version vs react-dom@version+hash split).
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const reactAlias = path.resolve(__dirname, "node_modules/react");
const reactDomAlias = path.resolve(__dirname, "node_modules/react-dom");

const config = defineConfig({
  plugins: [
    devtools(),
    tsconfigPaths({ projects: ["./tsconfig.json"] }),
    tanstackStart(),
    viteReact(),
  ],
  resolve: {
    dedupe: ["react", "react-dom"],
    alias: {
      react: reactAlias,
      "react-dom": reactDomAlias,
    },
  },
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: ["./src/__tests__/setup.ts"],
  },
});

export default config;
