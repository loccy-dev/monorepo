import { build, context } from "esbuild";
import { chmodSync, readFileSync } from "node:fs";

const isDev = process.argv.includes("--watch");
// The plugin ships `plugin/bin/loccy-tool` committed, so a src change that never got rebuilt would
// install as-is. --check builds in memory and compares, without touching the committed file. It runs
// as part of `lint`, which must not rebuild first or the comparison is against its own output.
const isCheck = process.argv.includes("--check");

// `plugin/` is what gets installed; everything beside it is source that never ships.
const outfile = "plugin/bin/loccy-tool";

// Claude Code puts `bin/` on the Bash tool's PATH, so the agent runs `loccy-tool` as a bare
// command. Everything is bundled: the plugin ships this file, target projects install nothing.
const buildConfig = {
  entryPoints: ["src/cli.ts"],
  outfile,
  platform: "node",
  target: "node20",
  format: "esm",
  bundle: true,
  // watch emits the same bytes as a one-off build, so `dev` never dirties the committed file
  minify: true,
  // bundled CJS deps still call require() at runtime
  banner: {
    js: "#!/usr/bin/env node\nimport { createRequire } from 'module'; const require = createRequire(import.meta.url);",
  },
  plugins: [
    {
      name: "chmod-executable",
      setup(build) {
        build.onEnd((result) => {
          if (result.errors.length === 0) chmodSync(outfile, 0o755);
        });
      },
    },
  ],
};

if (isCheck) {
  const { outputFiles } = await build({
    ...buildConfig,
    outfile: undefined,
    outdir: undefined,
    write: false,
    plugins: [],
  });
  const built = outputFiles[0].text;
  const committed = readFileSync(outfile, "utf-8");
  if (built !== committed) {
    console.error(`${outfile} is stale: run \`pnpm build\` and commit it alongside the src change.`);
    process.exit(1);
  }
  console.log(`${outfile} matches src`);
} else if (isDev) {
  const ctx = await context(buildConfig);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(buildConfig);
  console.log(`Built ${outfile}`);
}
