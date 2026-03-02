// Offscreen document — runs as an extension page, NOT a content script.
// Has no host-page CSP restrictions, so WASM compiles freely.
import { loadPyodide, type PyodideInterface } from "pyodide";
import sympyOpsCode from "../content/sympy_ops.py?raw";

// ── Python files to mount in Pyodide's virtual FS under /app ────────────────
// These are served from python/ in the built extension package.
const LMAT_FILES = [
  "evaluate_wrapper.py",
  "lmat_cas_client/__init__.py",
  "lmat_cas_client/LmatLatexPrinter.py",
  "lmat_cas_client/LmatEnvironment.py",
  "lmat_cas_client/compiling/__init__.py",
  "lmat_cas_client/compiling/Compiler.py",
  "lmat_cas_client/compiling/Definitions.py",
  "lmat_cas_client/compiling/DefinitionStore.py",
  "lmat_cas_client/compiling/parsing/__init__.py",
  "lmat_cas_client/compiling/parsing/LatexParser.py",
  "lmat_cas_client/compiling/parsing/Parser.py",
  "lmat_cas_client/compiling/parsing/greek_symbols.lark",
  "lmat_cas_client/compiling/parsing/latex_math_grammar.lark",
  "lmat_cas_client/compiling/transforming/__init__.py",
  "lmat_cas_client/compiling/transforming/ConstantsTransformer.py",
  "lmat_cas_client/compiling/transforming/DependenciesTransformer.py",
  "lmat_cas_client/compiling/transforming/FunctionsTransformer.py",
  "lmat_cas_client/compiling/transforming/LatexMatrix.py",
  "lmat_cas_client/compiling/transforming/PropositionsTransformer.py",
  "lmat_cas_client/compiling/transforming/SympyTransformer.py",
  "lmat_cas_client/compiling/transforming/SystemOfExpr.py",
  "lmat_cas_client/compiling/transforming/TransformerRunner.py",
  "lmat_cas_client/compiling/transforming/UndefinedAtomsTransformer.py",
  "lmat_cas_client/math_lib/__init__.py",
  "lmat_cas_client/math_lib/Functions.py",
  "lmat_cas_client/math_lib/MatrixUtils.py",
  "lmat_cas_client/math_lib/setup.py",
  "lmat_cas_client/math_lib/StandardDefinitionStore.py",
  "lmat_cas_client/math_lib/SymbolUtils.py",
  "lmat_cas_client/math_lib/units/__init__.py",
  "lmat_cas_client/math_lib/units/UnitDefinitions.py",
  "lmat_cas_client/math_lib/units/UnitUtils.py",
];

let pyodide: PyodideInterface | null = null;
let lmatReady: Promise<void> | null = null;

// ── Pyodide bootstrap ────────────────────────────────────────────────────────

async function initPyodide(): Promise<PyodideInterface> {
  if (pyodide) return pyodide;
  const localURL = chrome.runtime.getURL("assets/");
  console.log("[linal/offscreen] Loading Pyodide runtime from", localURL);
  pyodide = await loadPyodide({ indexURL: localURL });

  // Load packages from locally bundled wheels (no CDN needed)
  const pkgBase = chrome.runtime.getURL("pyodide-packages/");
  await pyodide.loadPackage([
    pkgBase + "mpmath-1.3.0-py3-none-any.whl",
    pkgBase + "sympy-1.13.3-py3-none-any.whl",
    // Pyodide-compiled regex (needed by lmat_cas_client's LatexParser)
    pkgBase + "regex-2024.11.6-cp313-cp313-pyodide_2025_0_wasm32.whl",
    // Pure-Python lark parser (needed by lmat_cas_client)
    pkgBase + "lark-1.2.2-py3-none-any.whl",
  ]);

  // Also prepare the legacy sympy_ops.py (matrix multiply feature)
  await pyodide.runPythonAsync(sympyOpsCode);

  console.log("[linal/offscreen] Pyodide + SymPy + lark + regex ready");
  return pyodide;
}

// ── lmat_cas_client FS mount ─────────────────────────────────────────────────

async function mountLmatPackage(py: PyodideInterface): Promise<void> {
  const base = chrome.runtime.getURL("python/");

  // 1. Derive the unique intermediate directories from the file list.
  const dirs = new Set<string>();
  for (const f of LMAT_FILES) {
    const parts = f.split("/");
    for (let d = 1; d < parts.length; d++) {
      dirs.add(parts.slice(0, d).join("/"));
    }
  }

  // 2. Create /app and all sub-directories in Pyodide's virtual FS.
  const mkdir = (p: string) => {
    try {
      py.FS.mkdir(p);
    } catch {
      /* already exists */
    }
  };
  mkdir("/app");
  for (const d of dirs) mkdir(`/app/${d}`);

  // 3. Fetch each file and write it to Pyodide's FS.
  console.log("[linal/offscreen] Fetching", LMAT_FILES.length, "Python files…");
  await Promise.all(
    LMAT_FILES.map(async (relPath) => {
      const url = base + relPath;
      const resp = await fetch(url);
      if (!resp.ok)
        throw new Error(`Failed to fetch ${url}: HTTP ${resp.status}`);
      let text = await resp.text();

      // Pyodide's `regex` engine doesn't support (?-1) recursive group references
      // (PCRE extension).  The grammar uses it in the _TEXT token to match nested
      // braces.  Replace with a 2-level-deep equivalent — sufficient for all
      // practical \text{...} / \textcolor{...}{...} arguments in LaTeX.
      if (relPath.endsWith(".lark")) {
        text = text.split("(?-1)").join("{[^{}]*}");
      }

      // Disable lark's disk cache (patched grammar must not be cached under the
      // original grammar's fingerprint and Pyodide's FS doesn't persist anyway).
      if (relPath === "lmat_cas_client/compiling/parsing/LatexParser.py") {
        text = text.replace("cache=True", "cache=False");
      }

      py.FS.writeFile(`/app/${relPath}`, text);
    }),
  );

  // 4. Add /app to sys.path and initialise the evaluate_wrapper module.
  await py.runPythonAsync(`
import sys
sys.path.insert(0, "/app")
import evaluate_wrapper
evaluate_wrapper.init()
print("[linal] lmat_cas_client mounted and ready")
`);
  console.log("[linal/offscreen] lmat_cas_client pipeline ready");
}

// ── Lazy initialisation helpers ──────────────────────────────────────────────

async function ensureLmat(): Promise<PyodideInterface> {
  const py = await initPyodide();
  if (!lmatReady) {
    lmatReady = mountLmatPackage(py).catch((err) => {
      // Reset so the next call retries
      lmatReady = null;
      throw err;
    });
  }
  await lmatReady;
  return py;
}

// Pre-warm: start both Pyodide and lmat loading immediately when the offscreen
// document is created.  This way the first user action won't block.
ensureLmat().catch(console.error);

// ── Message handler ──────────────────────────────────────────────────────────

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "offscreen") return false;

  (async () => {
    try {
      if (message.action === "ping") {
        // Just ensure Pyodide itself is loaded (fast path, no lmat needed)
        await initPyodide();
        sendResponse({ ok: true });
      } else if (message.action === "multiply") {
        // Legacy matrix-multiply path (uses sympy_ops.py, no lark needed)
        const py = await initPyodide();
        py.globals.set("_linal_input", message.text as string);
        const result = await py.runPythonAsync(
          "evaluate_multiply(_linal_input)",
        );
        sendResponse({ ok: true, result: String(result) });
      } else if (message.action === "eval") {
        // Full lmat_cas_client evaluate path
        const py = await ensureLmat();
        py.globals.set("_linal_latex", message.latex as string);
        const result = await py.runPythonAsync(
          "evaluate_wrapper.evaluate(_linal_latex)",
        );
        sendResponse({ ok: true, result: String(result) });
      } else {
        sendResponse({ ok: false, error: `Unknown action: ${message.action}` });
      }
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true; // keep message channel open for async response
});
