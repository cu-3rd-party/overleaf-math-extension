// Floating popup that appears near the selected text.
// Uses Shadow DOM to avoid style conflicts with Overleaf.

/** Evaluate the selection as-is. */
export type EvalAction = "eval";

/**
 * Wrap the selection with a LaTeX operation, then evaluate.
 * Each action wraps the raw selected LaTeX before sending it to SymPy.
 */
export type WrapAction =
  | "det" // \det <sel>
  | "trace" // \Tr <sel>
  | "inv" // {<sel>}^{-1}
  | "transpose" // {<sel>}^{T}
  | "adjoint" // {<sel>}^{H}  (conjugate transpose)
  | "adj" // \operatorname{adjugate} <sel>
  | "rref" // \operatorname{rref} <sel>
  | "gauss"; // \operatorname{gauss} <sel>  (step-by-step)

export type PopupAction = EvalAction | WrapAction;

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
    flex-wrap: wrap;
    gap: 6px;
    max-width: 520px;
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

  .linal-sep {
    width: 1px;
    height: 18px;
    background: #45455a;
    margin: 0 2px;
    flex-shrink: 0;
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

const WRAP_BUTTONS: [string, WrapAction][] = [
  ["Опр.", "det"], // определитель
  ["След", "trace"], // след матрицы
  ["Обр.", "inv"], // обратная матрица
  ["Трансп.", "transpose"], // транспонирование
  ["Эрм.", "adjoint"], // эрмитово сопряжение
  ["Адъюг.", "adj"], // адъюгат
  ["Гаусс", "rref"], // результат метода Гаусса
  ["Гаусс по шагам", "gauss"], // пошаговое исключение
];

export function showPopup(anchorRect: DOMRect, callbacks: PopupCallbacks) {
  ensureHost();

  // Remove existing popup content
  if (popupEl) {
    popupEl.remove();
    popupEl = null;
  }

  popupEl = document.createElement("div");
  popupEl.className = "linal-popup";

  // ── Evaluate as-is ───────────────────────────────────────────────────────
  const evalBtn = makeButton("f(x)  Вычислить", "eval", callbacks);
  popupEl.appendChild(evalBtn);

  // ── Separator ─────────────────────────────────────────────────────────────
  const sep = document.createElement("div");
  sep.className = "linal-sep";
  popupEl.appendChild(sep);

  // ── Wrap-then-evaluate buttons ────────────────────────────────────────────
  for (const [label, action] of WRAP_BUTTONS) {
    popupEl.appendChild(makeButton(label, action, callbacks));
  }

  // Hide while we compute real dimensions, then reposition
  popupEl.style.visibility = "hidden";
  shadow!.appendChild(popupEl);

  // Position dynamically after the browser has laid out the popup
  requestAnimationFrame(() => {
    if (!popupEl) return;
    const margin = 8;
    const bcrPopup = popupEl.getBoundingClientRect();
    const pw = bcrPopup.width || 420;
    const ph = bcrPopup.height || 36;

    let top = anchorRect.top - ph - margin;
    if (top < margin) top = anchorRect.bottom + margin;

    let left = anchorRect.left + anchorRect.width / 2 - pw / 2;
    left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

    popupEl.style.top = `${top}px`;
    popupEl.style.left = `${left}px`;
    popupEl.style.visibility = "visible";
  });
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
