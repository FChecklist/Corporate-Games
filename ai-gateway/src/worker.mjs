// CLOUDFLARE WORKER entry (a SEPARATE worker from the marketing site: see docs/HOSTING_PLAN.md). Not deployed by this project.
// Secrets/vars: GATEWAY_SECRET (required, random 32+ characters), GAME_ORIGIN_TAMBOLA (for example https://corporatetambola.com).
import bundle from "../generated/bundle.generated.mjs";
import { createGateway } from "./engine.mjs";
import { games } from "./games.mjs";

let gw = null;
export default {
  async fetch(request, env) {
    if (!env.GATEWAY_SECRET || String(env.GATEWAY_SECRET).length < 32) return new Response("Gateway is not configured (GATEWAY_SECRET).", { status: 503 });
    gw ??= createGateway({
      bundle, games, secret: env.GATEWAY_SECRET,
      origins: { tambola: env.GAME_ORIGIN_TAMBOLA },
      audit: (e) => console.log(JSON.stringify(e)), // one line per call: no keys, no inputs, no personal data
    });
    return gw.handle(request);
  },
};
