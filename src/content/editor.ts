// Handles text insertion into Overleaf's CodeMirror 6 editor.
//
// Strategy: we save the DOM Selection range BEFORE any async work.
// Popup uses preventDefault on mousedown so the editor's selection is
// never lost. After computation we re-focus the editor, restore the
// selection collapsed to its end, then insert via execCommand (which
// CodeMirror 6 intercepts and applies as a proper transaction).

/** A handle that lets you insert text after the original selection. */
export interface SelectionHandle {
  /** Text content of the selection (for SymPy). */
  readonly text: string;
  /** Insert `toInsert` immediately after the selection end. */
  insert(toInsert: string): void;
  /** Bounding rect of the selection (for popup positioning). */
  readonly rect: DOMRect;
}

/** Returns a handle for the current DOM selection, or null if nothing useful is selected. */
export function captureSelection(): SelectionHandle | null {
  const sel = window.getSelection();
  if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return null;

  const range = sel.getRangeAt(0);
  const text = sel.toString().trim();
  if (!text) return null;

  // Clone so that subsequent DOM events don't mutate it
  const frozen = range.cloneRange();
  const rect = range.getBoundingClientRect();

  // Detect the CodeMirror editor element that contains the selection
  const cmContent = findCmContent(range.commonAncestorContainer);

  return {
    text,
    rect,
    insert(toInsert: string) {
      insertAfterRange(frozen, cmContent, toInsert);
    },
  };
}

// ---------------------------------------------------------------------------
// Internal helpers
// ---------------------------------------------------------------------------

function findCmContent(node: Node): HTMLElement | null {
  let el: Node | null =
    node.nodeType === Node.ELEMENT_NODE
      ? (node as HTMLElement)
      : node.parentElement;
  while (el) {
    if (
      el instanceof HTMLElement &&
      (el.classList.contains("cm-content") ||
        el.getAttribute("role") === "textbox")
    )
      return el;
    el = el.parentElement;
  }
  return null;
}

function insertAfterRange(
  range: Range,
  cmContent: HTMLElement | null,
  toInsert: string,
) {
  // Focus the editor first
  if (cmContent) {
    cmContent.focus();
  }

  const sel = window.getSelection();
  if (!sel) return;

  // Restore the original selection collapsed to its END
  sel.removeAllRanges();
  const collapsed = range.cloneRange();
  collapsed.collapse(false); // false = collapse to end
  sel.addRange(collapsed);

  // execCommand is intercepted by CM6's contenteditable handling
  // and gets translated into a proper editor transaction.
  const ok = document.execCommand("insertText", false, toInsert);

  if (!ok) {
    // Fallback: dispatch an InputEvent (works in most modern browsers)
    const inputEvent = new InputEvent("input", {
      inputType: "insertText",
      data: toInsert,
      bubbles: true,
      cancelable: true,
    });
    (cmContent ?? document.activeElement)?.dispatchEvent(inputEvent);
  }
}
