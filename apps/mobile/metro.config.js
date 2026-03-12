// Learn more https://docs.expo.dev/guides/customizing-metro
const { getDefaultConfig } = require("expo/metro-config");
const path = require("path");

const projectRoot = __dirname;
const monorepoRoot = path.resolve(projectRoot, "../..");

/** @type {import('expo/metro-config').MetroConfig} */
const config = getDefaultConfig(projectRoot);

// In a bun workspace, the workspace root becomes Metro's server root by default.
// This breaks entry point resolution since src/app/_layout is resolved from the
// monorepo root instead of the mobile app directory.
// Fix: set EXPO_NO_METRO_WORKSPACE_ROOT=1 and manually configure monorepo paths.

// Watch workspace packages so Metro can see changes in them
config.watchFolders = [
  path.resolve(monorepoRoot, "packages/shared"),
  path.resolve(monorepoRoot, "packages/ui"),
  path.resolve(monorepoRoot, "packages/config"),
  // Also watch root node_modules so bun-hoisted deps are visible
  path.resolve(monorepoRoot, "node_modules"),
];

// Let Metro know where to resolve node_modules from (both local and hoisted)
config.resolver.nodeModulesPaths = [
  path.resolve(projectRoot, "node_modules"),
  path.resolve(monorepoRoot, "node_modules"),
];

// Disable hierarchical lookup since bun uses flat .bun/ directory
config.resolver.disableHierarchicalLookup = false;

// Resolve .js imports to .ts files (ESM-style imports in workspace packages)
config.resolver.resolveRequest = (context, moduleName, platform) => {
  if (moduleName.endsWith(".js")) {
    const tsModuleName = moduleName.replace(/\.js$/, ".ts");
    try {
      return context.resolveRequest(context, tsModuleName, platform);
    } catch {
      // Fall through to default resolution
    }
  }
  return context.resolveRequest(context, moduleName, platform);
};

module.exports = config;
