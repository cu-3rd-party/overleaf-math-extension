import { captureSelection, type SelectionHandle } from "./editor";
import { formatLatex } from "./latex-format";
import { hidePopup, showError, showPopup, type PopupAction, type WrapAction } from "./popup";
import { evalLatex, getPyodide } from "./pyodide-runner";

// ─── Wrap-action definitions ──────────────────────────────────────────────────
// Each entry defines how to wrap the raw selected LaTeX before evaluating.
// The result is then evaluated by SymPy and inserted as " = <result>".
const WRAP_ACTIONS: Record<WrapAction, (sel: string) => string> = {
  det: (sel) => `\\det${sel}`,
  trace: (sel) => `\\Tr${sel}`,
  inv: (sel) => `{${sel}}^{-1}`,
  transpose: (sel) => `{${sel}}^{T}`,
  adjoint: (sel) => `{${sel}}^{H}`,
  adj: (sel) => `\\operatorname{adjugate}${sel}`,
  rref: (sel) => `\\operatorname{rref}${sel}`,
  gauss: (sel) => `\\operatorname{gauss}${sel}`,
};

// ─── Regex helpers ───────────────────────────────────────────────────────────

// Any selection that looks like LaTeX (contains a backslash command or $ sign)
const LATEX_RE = /[\\$]/;

// ─── State ───────────────────────────────────────────────────────────────────
let currentHandle: SelectionHandle | null = null;

// ─── Selection listener ───────────────────────────────────────────────────────
let _lastMouseX = 0;
let _lastMouseY = 0;

document.addEventListener("mouseup", onMouseUp);
document.addEventListener("keyup", onKeyUp);
document.addEventListener("mousemove", (e) => {
  _lastMouseX = e.clientX;
  _lastMouseY = e.clientY;
});

// Hide popup on click outside
document.addEventListener("mousedown", (e) => {
  const host = document.getElementById("linal-extension-popup-host");
  if (host && !host.contains(e.target as Node)) {
    hidePopup();
    currentHandle = null;
  }
});

function onMouseUp(e: MouseEvent) {
  _lastMouseX = e.clientX;
  _lastMouseY = e.clientY;
  // Short delay so the selection is finalised
  setTimeout(checkSelection, 50);
}

function onKeyUp(e: KeyboardEvent) {
  // Only react to selection-extending keys
  const selectionKeys = ["Shift", "ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
  if (selectionKeys.includes(e.key)) {
    setTimeout(checkSelection, 50);
  }
}

function checkSelection() {
  const handle = captureSelection();

  if (!handle) {
    console.log("[linal] No selection captured");
    hidePopup();
    currentHandle = null;
    return;
  }

  console.log("[linal] Selection text:", JSON.stringify(handle.text.slice(0, 120)));
  console.log("[linal] Rect:", handle.rect);

  if (!LATEX_RE.test(handle.text)) {
    console.log("[linal] No LaTeX found in selection");
    hidePopup();
    currentHandle = null;
    return;
  }

  currentHandle = handle;

  // Use mouse position as fallback if the range rect is degenerate (CM6)
  const rect =
    handle.rect.width > 0 || handle.rect.height > 0
      ? handle.rect
      : new DOMRect(_lastMouseX, _lastMouseY, 0, 0);

  console.log("[linal] Showing popup at", rect);
  showPopup(rect, {
    onAction: (action: PopupAction) => handleAction(action),
  });

  // Warm up Pyodide in the background so the first click is fast
  getPyodide().catch(() => {
    /* ignore pre-warm errors */
  });
}

// ─── Action handler ───────────────────────────────────────────────────────────
async function handleAction(action: PopupAction) {
  if (!currentHandle) {
    showError("Lost selection — please select text again");
    return;
  }

  // Snapshot the handle so async work uses the right selection
  const handle = currentHandle;

  try {
    let result: string;

    if (action === "eval") {
      const raw = await evalLatex(handle.text);
      let formatted = raw;
      try {
        formatted = (await formatLatex(raw)).trimEnd();
      } catch {
        // If prettier can't parse it (e.g. raw math snippets), use as-is
      }
      result = "\n= " + formatted;
    } else if (action in WRAP_ACTIONS) {
      // Wrap the selection with the operation's LaTeX, then evaluate
      const wrapFn = WRAP_ACTIONS[action as WrapAction];
      const wrapped = wrapFn(handle.text);
      const raw = await evalLatex(wrapped);
      let formatted = raw;
      try {
        formatted = (await formatLatex(raw)).trimEnd();
      } catch {
        /* use raw if prettier can't parse */
      }
      result = "\n= " + formatted;
    } else {
      throw new Error(`Unknown action: ${action}`);
    }

    // Insert result immediately after the selected region
    handle.insert(result);
    hidePopup();
    currentHandle = null;
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    showError(msg);
  }
}

console.log("[linal] Overleaf matrix extension loaded.");
