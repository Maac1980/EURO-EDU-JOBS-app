import path from "path";
import { fileURLToPath } from "url";
import { build as esbuild } from "esbuild";
import { rm, readFile } from "fs/promises";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// server deps to bundle to reduce openat(2) syscalls
// which helps cold start times without risking some
// packages that are not bundle compatible
const allowlist = [
  "@google/generative-ai",
  "axios",
  "connect-pg-simple",
  "cors",
  "date-fns",
  "drizzle-orm",
  "drizzle-zod",
  "express",
  "express-rate-limit",
  "express-session",
  "jsonwebtoken",
  "memorystore",
  "multer",
  "nanoid",
  "nodemailer",
  "openai",
  "passport",
  "passport-local",
  "pg",
  "stripe",
  "uuid",
  "ws",
  "xlsx",
  "zod",
  "zod-validation-error",
];

async function buildAll() {
  const distDir = path.resolve(__dirname, "dist");
  await rm(distDir, { recursive: true, force: true });

  console.log("building server...");
  const pkgPath = path.resolve(__dirname, "package.json");
  const pkg = JSON.parse(await readFile(pkgPath, "utf-8"));
  const allDeps = [
    ...Object.keys(pkg.dependencies || {}),
    ...Object.keys(pkg.devDependencies || {}),
  ];
  const externals = allDeps.filter(
    (dep) =>
      !allowlist.includes(dep) &&
      !(pkg.dependencies?.[dep]?.startsWith("workspace:")),
  );

  await esbuild({
    entryPoints: [path.resolve(__dirname, "src/index.ts")],
    platform: "node",
    bundle: true,
    format: "cjs",
    outfile: path.resolve(distDir, "index.cjs"),
    define: {
      // NODE_ENV must NOT be statically replaced — runtime value is read via
      // process.env in index.ts (staging fence, Sentry environment, etc.).
      // Replacing it at build time would dead-code-eliminate the staging fence
      // and mislabel Sentry events from non-prod environments.
      // import.meta.url is undefined in CJS bundles — polyfill it so that
      // fileURLToPath(import.meta.url) works at runtime.
      "import.meta.url": "importMetaUrl",
    },
    banner: {
      // In dev (ESM), each source file sits at src/routes/*.ts or src/lib/*.ts,
      // so "../../data" resolves to artifacts/api-server/data/ ✓
      // In prod the entire codebase is merged into dist/index.cjs, so
      // "../../data" from dist/ would land at artifacts/data/ — wrong.
      // Faking the URL as if the bundle lives at src/lib/ makes every
      // "../../data" resolve correctly to artifacts/api-server/data/ ✓
      js: 'const importMetaUrl = require("url").pathToFileURL(require("path").join(__dirname, "../src/lib/bundle.js")).href;',
    },
    minify: true,
    external: externals,
    logLevel: "info",
  });
}

buildAll().catch((err) => {
  console.error(err);
  process.exit(1);
});
