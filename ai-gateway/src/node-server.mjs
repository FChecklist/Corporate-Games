// LOCAL development server: node src/node-server.mjs   (env: PORT, GAME_ORIGIN_TAMBOLA, GATEWAY_SECRET)
import { createServer } from "node:http";
import bundle from "../generated/bundle.generated.mjs";
import { createGateway } from "./engine.mjs";
import { games } from "./games.mjs";

export function toNodeHandler(gw) {
  return async (req, res) => {
    const chunks = []; for await (const c of req) chunks.push(c);
    const body = chunks.length ? Buffer.concat(chunks) : undefined;
    const r = await gw.handle(new Request(`http://${req.headers.host ?? "localhost"}${req.url}`, { method: req.method, headers: req.headers, body: ["GET", "HEAD"].includes(req.method) ? undefined : body }));
    res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(Buffer.from(await r.arrayBuffer()));
  };
}
if (import.meta.url === `file://${process.argv[1].replace(/\\/g, "/")}` || process.argv[1]?.endsWith("node-server.mjs")) {
  const gw = createGateway({ bundle, games, secret: process.env.GATEWAY_SECRET, origins: { tambola: process.env.GAME_ORIGIN_TAMBOLA ?? "http://127.0.0.1:8799" }, audit: (e) => console.log(JSON.stringify(e)) });
  const port = Number(process.env.PORT ?? 8800);
  createServer(toNodeHandler(gw)).listen(port, "127.0.0.1", () => console.log(`Gateway (local only) on http://127.0.0.1:${port}  ->  game ${process.env.GAME_ORIGIN_TAMBOLA ?? "http://127.0.0.1:8799"}`));
}
