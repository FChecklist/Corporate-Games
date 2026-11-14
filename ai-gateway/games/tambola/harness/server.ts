// LOCAL TEST HARNESS SERVER for Corporate Tambola. Run with bun:  bun games/tambola/harness/server.ts --port 8799
// Serves the game's own /api and /ai routes from an in-memory database, and /__h/ helpers that act as a PERSON in a browser
// (sign up, add a Host, join guests, pay in TEST mode, move the clock). The AI gateway never calls /__h/. No internet, no Razorpay, no mail.
import { createWorld, GAME } from "./world.ts";

const W = createWorld();
const J = (o: unknown, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json" } });

async function helper(req: Request, path: string): Promise<Response> {
  const b: any = req.method === "POST" ? await req.json().catch(() => ({})) : {};
  if (path === "/__h/reset") { W.reset(); return J({ ok: true }); }
  if (path === "/__h/clock") { if (typeof b.advanceMs === "number") W.advance(b.advanceMs); return J({ now: W.now() }); }
  if (path === "/__h/organizer") return J(await W.organizer(b.email));
  if (path === "/__h/host") return J(await W.host(b.orgKey, b.label));
  if (path === "/__h/join") return J({ joined: await W.join(b.eid, b.count ?? 1, b.names) });
  if (path === "/__h/pay") return J(await W.pay(b.url));
  if (path === "/__h/sql") { const q = String(b.sql ?? ""); if (!/^\s*select\b/i.test(q) || /;\s*\S/.test(q)) return J({ error: "select only" }, 400); return J({ rows: W.sql(q, b.args ?? []) }); }
  if (path === "/__h/info") return J({ game: GAME, now: W.now() });
  return J({ error: "unknown helper" }, 404);
}

const port = (() => { const i = process.argv.indexOf("--port"); return i > 0 ? Number(process.argv[i + 1]) : Number(process.env.PORT ?? 0); })();
const server = Bun.serve({
  port, hostname: "127.0.0.1",
  async fetch(req) {
    const u = new URL(req.url);
    if (u.pathname.startsWith("/__h/")) return helper(req, u.pathname);
    if (u.pathname.startsWith("/api/") || u.pathname.startsWith("/ai/")) {
      const headers = new Headers(req.headers); headers.delete("content-length");
      const body = req.method === "GET" || req.method === "HEAD" ? undefined : await req.text();
      const r = await W.handle(new Request("http://game.local" + u.pathname + u.search, { method: req.method, headers, body }), false); // the REAL handler, no ticks added
      const h = new Headers(r.headers); h.set("date", new Date(W.now()).toUTCString());
      return new Response(await r.text(), { status: r.status, headers: h });
    }
    return new Response("harness: not found", { status: 404 });
  },
});
console.log(`HARNESS_READY http://127.0.0.1:${server.port}`);
