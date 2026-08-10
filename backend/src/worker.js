/* ============================================================
   Einstieg für Cloudflare Workers
   ------------------------------------------------------------
   Bindings (DB, ASSETS) und Variablen kommen aus wrangler.toml.
   Die eigentliche Anwendung steht in app.js und ist mit der
   Node-Variante identisch.
   ============================================================ */

import app, { cleanup } from "./app.js";

export default {
  fetch: app.fetch,

  /* Täglich aufräumen: abgelaufene Sitzungen, alte Zähler, altes Protokoll. */
  async scheduled(event, env, ctx) {
    ctx.waitUntil(cleanup(env, Date.now()));
  },
};
