import js from "@eslint/js";
import tseslint from "typescript-eslint";

export default tseslint.config(
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    ignores: [
      "**/node_modules/",
      "**/dist/",
      "**/.output/",
      "**/.expo/",
      "**/.vinxi/",
      "**/routeTree.gen.ts",
      "_bmad/",
      "_bmad-output/",
      "**/scripts/",
      "**/metro.config.js",
      "**/babel.config.js",
      "**/android/",
      "**/ios/",
    ],
  },
  {
    rules: {
      "no-console": "warn",
      "no-debugger": "error",
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
    },
  },
  {
    files: ["apps/mobile/**/*.{ts,tsx}"],
    rules: {
      "@typescript-eslint/no-require-imports": "off",
    },
  },
);
