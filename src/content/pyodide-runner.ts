// Content script side — sends computation requests to the offscreen document
// via the background service worker (message relay).
// Pyodide itself runs only in the offscreen page where WASM is allowed.

interface OffscreenResponse {
  ok: boolean;
  result?: string;
  error?: string;
  resultLatex?: string;
}

function sendToBackground(payload: object): Promise<OffscreenResponse> {
  return new Promise((resolve, reject) => {
    chrome.runtime.sendMessage(
      { target: "background", ...payload },
      (response: OffscreenResponse | undefined) => {
        if (chrome.runtime.lastError) {
          reject(new Error(chrome.runtime.lastError.message));
        } else {
          resolve(response!);
        }
      },
    );
  });
}

/** Warm up Pyodide in the offscreen document (fire and forget). */
export function getPyodide(): Promise<void> {
  return sendToBackground({ action: "ping" })
    .then(() => {})
    .catch(() => {});
}

export async function evaluateMultiply(selectedText: string): Promise<string> {
  const resp = await sendToBackground({
    action: "multiply",
    text: selectedText,
  });
  if (!resp.ok) throw new Error(resp.error ?? "Unknown error");
  return resp.result!;
}

/** Send LaTeX to the offscreen document for SymPy evaluation via lmat_cas_client. */
export async function evalLatex(latex: string): Promise<string> {
  const resp = await sendToBackground({ action: "eval", latex });
  if (!resp.ok) throw new Error(resp.error ?? "Unknown error");
  return resp.result!;
}
