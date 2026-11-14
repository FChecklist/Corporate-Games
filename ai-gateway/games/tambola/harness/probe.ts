// ACCESS PROBE (run with bun). For every game route the adapter uses, it calls the REAL game code with each kind of key and records
// the status the game answers. The result ("who may really call what") goes into the registry, so a change in the game's permission
// rules shows up as drift. Everything is in memory; no network, no money, no mail. Output: JSON on stdout.
import adapter from "../adapter.mjs";
import { createWorld } from "./world.ts";

const W = createWorld();
const CREDS = ["anon", "organizer", "host_link", "host_console", "game_ai_key", "other_organizer"] as const;
type Cred = (typeof CREDS)[number];

type Sample = (c: { id: string; startRound: number; token: string; payUrl: string; hostId: string }) => { query?: Record<string, string>; body?: unknown };
const samples: Record<string, Sample> = {
  whoami: () => ({}),
  schedule: () => ({ query: { at: new Date(Date.now() + 5 * 3600_000).toISOString() } }),
  create: (c) => ({ body: { id: c.id + "N", startRound: c.startRound, callSeconds: 12, cap: 100, name: "Probe" } }),
  history: () => ({}),
  team: () => ({}),
  summary: () => ({}),
  settings: () => ({ body: { callSeconds: 12 } }),
  paylink_create: () => ({ body: {} }),
  paylink_read: () => ({}),
  cancel_preview: () => ({}),
  cancel: () => ({ body: { confirmations: 3 } }),
  control_request: () => ({ body: { action: "pause" } }),
  control_requests: () => ({}),
  participants: () => ({ query: { limit: "5", offset: "0" } }),
  results: () => ({}),
  prizes: () => ({}),
  prizegiven: () => ({ body: { round: 1, pattern: "early5", ordinal: 1, seat: 1, given: true } }),
  announce: () => ({ body: { text: "hello" } }),
  life: () => ({}),
  reportlink: () => ({}),
  erase: () => ({ body: {} }),
  clone: () => ({ body: {} }),
  team_retire: (c) => ({ body: { id: c.hostId } }),
  reopen: (c) => ({ body: { startRound: c.startRound } }), // the probe game is not cancelled: an allowed caller gets 409 "not cancelled", a refused one 403
  keys: () => ({}),
  ai_fresh: () => ({ body: {} }), // the harness has no mail key: the mail only lands in the game's own outbox
};
// routes that make sense on a fresh DRAFT only (everything else is probed on a paid game, so the call can really succeed)
const DRAFT_ONLY = new Set(["create", "paylink_create"]);

async function fresh(draftOnly: boolean) {
  const org = await W.organizer(); const other = await W.organizer(); const host = await W.host(org.key);
  const startRound = await W.startRoundIn(5 * 3600_000);
  const id = "PROBE" + Math.random().toString(36).slice(2, 9).toUpperCase();
  const mk = await W.game("POST", "/api/z", { id, startRound, callSeconds: 12, cap: 100, name: "Probe" }, { "x-organizer": org.key }, false);
  if (mk.status !== 200) throw new Error("probe setup: create failed " + mk.status);
  const pl = await W.j(await W.game("POST", `/api/z/${id}/paylink`, {}, { "x-organizer": org.key }));
  let payUrl: string = pl.url;
  if (!draftOnly) { const p = await W.pay(pl.url); if (p.status !== 200) throw new Error("probe setup: pay failed"); }
  return { org, other, host, id, startRound, token: String(pl.url).match(/t=([0-9a-f]{48})/)![1], payUrl };
}

const out: Record<string, Record<string, number>> = {};
for (const [name, route] of Object.entries<any>(adapter.routes)) {
  out[name] = {};
  for (const cred of CREDS) {
    const w = await fresh(DRAFT_ONLY.has(name));
    const headers: Record<string, string> =
      cred === "anon" ? {} :
      cred === "organizer" ? { "x-organizer": w.org.key } :
      cred === "host_link" ? { "x-organizer": w.host.hostKey, "x-ct-link": "1" } :
      cred === "host_console" ? { "x-organizer": w.host.hostKey } :
      cred === "game_ai_key" ? { "x-organizer": w.org.aiKey } :
      { "x-organizer": w.other.key };
    const s = samples[name]({ id: w.id, startRound: w.startRound, token: w.token, payUrl: w.payUrl, hostId: String(w.host.id).slice(0, 10) });
    let path = String(route.path).replace("{game_id}", w.id).replace("{token}", w.token);
    if (s.query) path += "?" + new URLSearchParams(s.query).toString();
    const r = await W.game(route.method, path, s.body, headers, false);
    out[name][cred] = r.status;
  }
}
console.log(JSON.stringify(out, null, 2));
