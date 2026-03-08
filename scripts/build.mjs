import { build, context } from "esbuild";
import { cp, mkdir } from "node:fs/promises";

const watch = process.argv.includes("--watch");

await mkdir("dist", { recursive: true });

const commonConfig = {
  entryPoints: {
    background: "src/background/index.ts",
    content: "src/content/index.ts",
    popup: "src/popup/index.ts",
    options: "src/options/index.ts"
  },
  bundle: true,
  outdir: "dist",
  format: "esm",
  target: "chrome120",
  sourcemap: true,
  logLevel: "info",
  define: {
    "process.env.NODE_ENV": JSON.stringify(watch ? "development" : "production")
  }
};

await cp("src/manifest.json", "dist/manifest.json");
await cp("src/popup/index.html", "dist/popup.html");
await cp("src/options/index.html", "dist/options.html");

if (watch) {
  const ctx = await context(commonConfig);
  await ctx.watch();
  console.log("Watching for changes...");
} else {
  await build(commonConfig);
}
