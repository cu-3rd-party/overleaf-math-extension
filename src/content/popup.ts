// Floating popup that appears near the selected text.
// Uses Shadow DOM to avoid style conflicts with Overleaf.

export type PopupAction = "eval";

export interface PopupCallbacks {
  onAction: (action: PopupAction) => void;
}

let host: HTMLElement | null = null;
let shadow: ShadowRoot | null = null;
let popupEl: HTMLElement | null = null;

const STYLES = `
  :host { all: initial; }

  .linal-popup {
    position: fixed;
    z-index: 2147483647;
    background: #1e1e2e;
    border: 1px solid #45455a;
    border-radius: 8px;
    padding: 6px 8px;
    display: flex;
    align-items: center;
    gap: 6px;
    box-shadow: 0 4px 20px rgba(0,0,0,0.45);
    font-family: 'Inter', system-ui, sans-serif;
    font-size: 13px;
    user-select: none;
    transition: opacity 0.1s;
  }

  .linal-label {
    color: #7c7c9c;
    font-size: 11px;
    padding-right: 4px;
    border-right: 1px solid #45455a;
    margin-right: 2px;
    white-space: nowrap;
  }

  .linal-btn {
    background: #313147;
    color: #cdd6f4;
    border: 1px solid #45455a;
    border-radius: 5px;
    padding: 3px 10px;
    cursor: pointer;
    font-size: 12px;
    font-family: inherit;
    white-space: nowrap;
    display: flex;
    align-items: center;
    gap: 4px;
    transition: background 0.15s, border-color 0.15s;
  }

  .linal-btn:hover {
    background: #4a4a6a;
    border-color: #7c7cff;
  }

  .linal-btn:active {
    background: #5a5a8a;
  }

  .linal-btn.loading {
    opacity: 0.6;
    cursor: default;
    pointer-events: none;
  }

  .linal-spinner {
    width: 10px;
    height: 10px;
    border: 2px solid #7c7c9c;
    border-top-color: #cdd6f4;
    border-radius: 50%;
    animation: spin 0.7s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
`;

function ensureHost() {
  if (host) return;

  host = document.createElement("div");
  host.id = "linal-extension-popup-host";
  // Prevent clicks on popup from dismissing the selection via document listener
  host.addEventListener("mousedown", (e) => e.preventDefault());
  document.body.appendChild(host);

  shadow = host.attachShadow({ mode: "open" });

  const style = document.createElement("style");
  style.textContent = STYLES;
  shadow.appendChild(style);
}

export function showPopup(anchorRect: DOMRect, callbacks: PopupCallbacks) {
  ensureHost();

  // Remove existing popup content
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }

  popupEl = document.createElement("div");
  popupEl.className = "linal-popup";

  const evalBtn = makeButton("f(x)  Evaluate", "eval", callbacks);
  popupEl.appendChild(evalBtn);

  shadow!.appendChild(popupEl);

  // Position above the selection (or below if near top)
  const popupHeight = 36;
  const margin = 8;
  let top = anchorRect.top - popupHeight - margin;
  if (top < margin) top = anchorRect.bottom + margin;

  let left = anchorRect.left + anchorRect.width / 2 - 90;
  left = Math.max(margin, Math.min(left, window.innerWidth - 200));

  popupEl.style.top = `${top}px`;
  popupEl.style.left = `${left}px`;
}

function makeButton(
  label: string,
  action: PopupAction,
  callbacks: PopupCallbacks,
): HTMLButtonElement {
  const btn = document.createElement("button");
  btn.className = "linal-btn";
  btn.textContent = label;
  btn.addEventListener("click", () => {
    setLoading(btn);
    callbacks.onAction(action);
  });
  return btn;
}

function setLoading(btn: HTMLButtonElement) {
  btn.classList.add("loading");
  btn.textContent = "";
  const spinner = document.createElement("div");
  spinner.className = "linal-spinner";
  const text = document.createElement("span");
  text.textContent = "Computing…";
  btn.appendChild(spinner);
  btn.appendChild(text);
}

export function hidePopup() {
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }
}

export function showError(message: string) {
  if (!popupEl || !shadow) return;
  popupEl.querySelectorAll(".linal-btn").forEach((b) => b.remove());

  const err = document.createElement("span");
  err.style.cssText =
    "color:#f38ba8;font-size:12px;max-width:240px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;";
  err.textContent = `⚠ ${message}`;
  popupEl.appendChild(err);

  setTimeout(() => hidePopup(), 4000);
}
