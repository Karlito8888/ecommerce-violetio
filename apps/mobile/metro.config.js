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
// Also forces singleton packages that use React Context to resolve to a single
// instance — prevents "No QueryClient set" errors caused by Bun hoisting the
// same semver version into two different .bun/ content-hash directories.
const SINGLETON_MODULES = ["@tanstack/react-query"];
config.resolver.resolveRequest = (context, moduleName, platform) => {
  // Force all react-query imports to resolve from the mobile app's own
  // node_modules, so the same React Context object is shared everywhere.
  if (SINGLETON_MODULES.includes(moduleName)) {
    return context.resolveRequest(
      { ...context, originModulePath: path.resolve(projectRoot, "package.json") },
      moduleName,
      platform,
    );
  }
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
