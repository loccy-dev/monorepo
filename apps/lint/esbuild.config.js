import { build, context } from "esbuild";
import { chmodSync } from "node:fs";

const isDev = process.argv.includes("--watch");

const baseConfig = {
  platform: "node",
  target: "node18",
  format: "esm",
  entryPoints: ["src/cli/index.ts"],
  bundle: true,
  banner: { js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
};

const chmodExecutablePlugin = {
  name: "chmod-executable",
  setup(build) {
    build.onEnd((result) => {
      if (result.errors.length === 0) chmodSync("dist/cli/index.js", 0o755);
    });
  },
};

// Main build: externalizes npm deps, requires node_modules at runtime.
const cliBuildConfig = {
  ...baseConfig,
  sourcemap: true,
  minify: !isDev,
  outfile: "dist/cli/index.js",
  external: ["commander", "chalk", "ora"],
  plugins: [chmodExecutablePlugin],
};

async function main() {
  if (isDev) {
    const ctx = await context(cliBuildConfig);
    await ctx.watch();
    console.log("Watching for changes...");
    process.on("SIGINT", async () => {
      await ctx.dispose();
      process.exit(0);
    });
    setInterval(() => {}, 1000);
  } else {
    await build(cliBuildConfig);
    console.log("Build complete!");
  }
}

main().catch((error) => {
  console.error("Build failed:", error);
  process.exit(1);
});
