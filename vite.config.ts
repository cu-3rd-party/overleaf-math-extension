import path from "node:path";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { crx } from "@crxjs/vite-plugin";
import { defineConfig, normalizePath } from "vite"; // <-- добавили normalizePath
import { viteStaticCopy } from "vite-plugin-static-copy";
import zip from "vite-plugin-zip-pack";
import manifest from "./manifest.config.js";
import { name, version } from "./package.json";

// Copy Pyodide runtime files (wasm, js, stdlib) — but NOT .whl packages
// (those are bundled separately in public/pyodide-packages/).
const PYODIDE_EXCLUDE =[
  "!**/*.{md,html}",
  "!**/*.d.ts",
  "!**/*.whl",
  "!**/node_modules",
];

function viteStaticCopyPyodide() {
  const pyodideDir = dirname(fileURLToPath(import.meta.resolve("pyodide")));
  return viteStaticCopy({
    targets:[
      {
        // <-- обернули join() в normalizePath()
        src:[normalizePath(join(pyodideDir, "*")), ...PYODIDE_EXCLUDE],
        dest: "assets",
      },
    ],
  });
}
// Copy the lmat_cas_client Python package and our wrapper into the extension
// so the offscreen document can mount them into Pyodide's virtual FS at runtime.
function viteStaticCopyPython() {
  return viteStaticCopy({
    targets:[
      {
        // Produces: python/lmat_cas_client/**
        src: "obsidian-latex-math/lmat-cas-client/lmat_cas_client",
        dest: "python",
      },
      {
        // Produces: python/evaluate_wrapper.py
        src: "py/evaluate_wrapper.py",
        dest: "python",
      },
    ],
  });
}
export default defineConfig({
  resolve: {
    alias: {
      "@": `${path.resolve(__dirname, "src")}`,
    },
  },
  // Pyodide must not be pre-bundled — it manages its own loading
  optimizeDeps: { exclude: ["pyodide"] },
  build: {
    rollupOptions: {
      input: {
        offscreen: "src/offscreen/offscreen.html",
      },
    },
  },
  plugins:[
    crx({ manifest }),
    viteStaticCopyPyodide(),
    viteStaticCopyPython(),
    zip({ outDir: "release", outFileName: `crx-${name}-${version}.zip` }),
  ],
  server: {
    cors: {
      origin: [/chrome-extension:\/\//],
    },
  },
});