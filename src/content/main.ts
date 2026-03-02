import { captureSelection, type SelectionHandle } from "./editor";
import { hidePopup, showError, showPopup, type PopupAction } from "./popup";
import { evalLatex, getPyodide } from "./pyodide-runner";

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
  const selectionKeys = [
    "Shift",
    "ArrowLeft",
    "ArrowRight",
    "ArrowUp",
    "ArrowDown",
    "Home",
    "End",
  ];
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

  console.log(
    "[linal] Selection text:",
    JSON.stringify(handle.text.slice(0, 120)),
  );
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
      result = " = " + (await evalLatex(handle.text));
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
