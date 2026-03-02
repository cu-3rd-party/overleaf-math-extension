// Background service worker — creates the offscreen document on demand
// and relays messages between content scripts and the offscreen page.

const OFFSCREEN_URL = "src/offscreen/offscreen.html";

let offscreenCreating: Promise<void> | null = null;

async function ensureOffscreen() {
  // Check if one already exists using runtime.getContexts (Chrome 116+)
  const contexts = await (
    chrome.runtime as unknown as {
      getContexts: (filter: object) => Promise<{ contextType: string }[]>;
    }
  )
    .getContexts({
      contextTypes: ["OFFSCREEN_DOCUMENT"],
      documentUrls: [chrome.runtime.getURL(OFFSCREEN_URL)],
    })
    .catch(() => [] as { contextType: string }[]);

  if (contexts.length > 0) return;

  // Avoid race: only one creation at a time
  if (offscreenCreating) return offscreenCreating;
  offscreenCreating = chrome.offscreen
    .createDocument({
      url: OFFSCREEN_URL,
      reasons: [chrome.offscreen.Reason.DOM_SCRAPING],
      justification: "Run Pyodide WASM for matrix computation",
    })
    .finally(() => {
      offscreenCreating = null;
    });
  return offscreenCreating;
}

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (message.target !== "background") return false;

  (async () => {
    try {
      await ensureOffscreen();
      // Relay to offscreen document
      const response = await chrome.runtime.sendMessage({
        ...message,
        target: "offscreen",
      });
      sendResponse(response);
    } catch (e) {
      sendResponse({ ok: false, error: String(e) });
    }
  })();

  return true;
});
