import { createApp } from "./app.js";

// Cloudflare Worker entry point. Static assets (the web app) are served by
// Workers Assets; only /api/* requests reach this code (see wrangler.jsonc).
export default createApp();
