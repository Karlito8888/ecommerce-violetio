/** Minimal process.env declaration for cross-platform code (Node / Vite / React Native). */
declare const process: { env: Record<string, string | undefined> } | undefined;
