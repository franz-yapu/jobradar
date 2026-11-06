// Production bundle (SDD-012): one file, dependencies stay external (installed in the image) except the workspace
// package @jobradar/shared, which ships as TypeScript source and must be inlined.
import { readFileSync } from "node:fs";
import { build } from "esbuild";

const { dependencies } = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf8"));
const external = Object.keys(dependencies).filter((name) => !name.startsWith("@jobradar/"));

await build({
  entryPoints: ["src/main.ts"],
  outfile: "dist/main.mjs",
  bundle: true,
  platform: "node",
  format: "esm",
  target: "node22",
  sourcemap: true,
  // Subpaths of external packages (e.g. @aws-sdk/client-sqs/...) are external too.
  external: [...external, ...external.map((name) => `${name}/*`)],
  tsconfig: "tsconfig.json",
  logLevel: "info",
});
