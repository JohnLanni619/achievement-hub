import { createApp, createContext } from "./app.js";
import { loadConfig } from "./config.js";

const config = loadConfig();
const ctx = createContext(config);
const app = createApp(ctx);

app.listen(config.port, () => {
  const providers = ctx.providers.list().map((p) => p.name).join(", ");
  console.log(`Achievement Hub API listening on http://localhost:${config.port} (providers: ${providers})`);
});
