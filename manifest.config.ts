import { defineManifest } from "@crxjs/vite-plugin";
import pkg from "./package.json";

export default defineManifest({
  manifest_version: 3,
  name: "Overleaf Math Extension",
  description:
    "Select LaTeX matrices in Overleaf to instantly compute products and more via SymPy.",
  version: pkg.version,
  icons: {
    48: "public/logo.png",
  },
  action: {
    default_icon: {
      48: "public/logo.png",
    },
    default_popup: "src/popup/index.html",
  },
  background: {
    service_worker: "src/background/service-worker.ts",
    type: "module",
  },
  content_scripts: [
    {
      js: ["src/content/main.ts"],
      matches: ["https://www.overleaf.com/*", "https://overleaf.com/*"],
    },
  ],
  host_permissions: ["https://www.overleaf.com/*"],
  permissions: ["scripting", "offscreen"],
  content_security_policy: {
    extension_pages: "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
  },
  web_accessible_resources: [
    {
      resources: ["assets/*", "pyodide-packages/*", "python/**"],
      matches: ["https://www.overleaf.com/*", "https://overleaf.com/*"],
    },
  ],
});
