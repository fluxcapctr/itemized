// Build a deploy-ready static bundle in ui/dist/.
// Compiles JSX -> JS with esbuild (drops Babel-CDN runtime, ~250KB + 1-2s parse off
// first paint) and copies the data files + bills.html alongside.
//
// Run: node scripts/build-ui-prod.mjs
// Deploy: ui/dist/

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as esbuild from "esbuild";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const UI_DIR = path.resolve(__dirname, "..", "ui");
const DIST_DIR = path.join(UI_DIR, "dist");

async function main() {
  if (fs.existsSync(DIST_DIR)) {
    fs.rmSync(DIST_DIR, { recursive: true });
  }
  fs.mkdirSync(DIST_DIR, { recursive: true });
  fs.mkdirSync(path.join(DIST_DIR, "data"), { recursive: true });

  // 1) Compile JSX -> JS. We don't bundle React (it's loaded from CDN) — we just
  // strip JSX and tweak ES2020 features. Output is ~the same size as the source.
  console.log("compiling JSX...");
  for (const file of ["app.jsx", "tweaks-panel.jsx"]) {
    const inPath = path.join(UI_DIR, file);
    const outPath = path.join(DIST_DIR, file.replace(/\.jsx$/, ".js"));
    await esbuild.build({
      entryPoints: [inPath],
      outfile: outPath,
      loader: { ".jsx": "jsx" },
      jsxFactory: "React.createElement",
      jsxFragment: "React.Fragment",
      bundle: false,
      minify: true,
      target: ["es2020"],
      legalComments: "none",
    });
    const size = (fs.statSync(outPath).size / 1024).toFixed(1);
    console.log(`  ${file} -> ${path.basename(outPath)} (${size}KB)`);
  }

  // 2) Build a prod-ready Itemized.html that:
  //    - drops the Babel-standalone CDN script (~250KB)
  //    - changes script tags from text/babel + .jsx to plain script + .js
  //    - keeps React + ReactDOM CDN
  console.log("rewriting Itemized.html for prod...");
  const html = fs.readFileSync(path.join(UI_DIR, "Itemized.html"), "utf8");
  const prodHtml = html
    // Drop Babel-standalone script tag
    .replace(/<script\s+src="https:\/\/unpkg\.com\/@babel\/standalone[^"]*"[^>]*><\/script>\s*/g, "")
    // Convert text/babel JSX scripts to regular JS
    .replace(/<script type="text\/babel" src="(app|tweaks-panel)\.jsx[^"]*"><\/script>/g, '<script src="$1.js"></script>')
    // Keep React/ReactDOM exactly as is
    ;
  fs.writeFileSync(path.join(DIST_DIR, "Itemized.html"), prodHtml);

  // 3) Copy static files (bills.html, data files)
  console.log("copying static files...");
  for (const file of ["bills.html", "data.real.js", "ratings.real.js"]) {
    const src = path.join(UI_DIR, file);
    if (fs.existsSync(src)) {
      fs.copyFileSync(src, path.join(DIST_DIR, file));
    }
  }
  // Per-procedure files in data/
  const dataSrcDir = path.join(UI_DIR, "data");
  if (fs.existsSync(dataSrcDir)) {
    for (const f of fs.readdirSync(dataSrcDir)) {
      fs.copyFileSync(path.join(dataSrcDir, f), path.join(DIST_DIR, "data", f));
    }
    console.log(`  data/ — ${fs.readdirSync(dataSrcDir).length} per-procedure files`);
  }

  // 4) vercel.json for SPA-friendly defaults (optional)
  const vercelConfig = {
    cleanUrls: true,
    headers: [
      {
        source: "/data/(.*)",
        headers: [{ key: "Cache-Control", value: "public, max-age=300, s-maxage=300" }],
      },
      {
        source: "/(app|tweaks-panel)\\.js",
        headers: [{ key: "Cache-Control", value: "public, max-age=3600" }],
      },
    ],
  };
  fs.writeFileSync(
    path.join(DIST_DIR, "vercel.json"),
    JSON.stringify(vercelConfig, null, 2),
  );

  // Summary
  function totalSize(dir) {
    let total = 0;
    for (const f of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, f.name);
      total += f.isDirectory() ? totalSize(p) : fs.statSync(p).size;
    }
    return total;
  }
  const total = (totalSize(DIST_DIR) / 1024 / 1024).toFixed(2);
  const indexSize = (fs.statSync(path.join(DIST_DIR, "data.real.js")).size / 1024).toFixed(1);
  console.log(`\nbuilt ui/dist/  total=${total}MB  first-paint-data=${indexSize}KB`);
  console.log(`deploy with: cd ui/dist && npx vercel --prod`);
}

main().catch((e) => {
  console.error("FATAL", e);
  process.exit(1);
});
