import { defineConfig } from "vitest/config";
import path from "path";

export default defineConfig({
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "src"),
      "@/assets": path.resolve(__dirname, "assets"),
    },
  },
  test: {
    globals: true,
  },
});
