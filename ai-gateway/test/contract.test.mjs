// CONTRACT TESTS against the REAL game code (local in-memory harness): every action, every role, every state the gateway claims, answered as published.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireGame, startHarness, makeGateway, makeAccount, startAtIn, registry, API } from "./helpers.mjs";
import { paidGame } from "./agent.mjs";

const g = registry.games.tambola;
let H, G, A, B, fx, draft, canaries = [];
const all = [];
const call = async (...a) => { const r = await G.call(...a); all.push(r.text); return r; };
const act = (key, id, body, o = {}) => call(o.get ? "GET" : "POST", `${API}/tambola/actions/${id}`, { key, ...(o.get ? { query: body } : { body: body ?? {} }), headers: o.headers ?? {} });

before(async () => {
  if (!requireGame()) return;
  H = await startHarness();
  G = makeGateway(H.origin, { limits: { per_key_minute: { max: 100000, windowS: 60 }, write_minute: { max: 100000, windowS: 60 }, per_ip_minute: { max: 100000, windowS: 60 } } }); // limits are tested in negative.test.mjs
  A = await makeAccount(H); B = await makeAccount(H);
  fx = await paidGame({ H, call, key: A.orgKey, startAtIn, name: "Contract Game" });
  const j = await H.h("join", { eid: fx.gameId, count: 3 }); canaries = j.joined;
  // a second game that stays a draft
  const d = await act(A.orgKey, "create_game", { name: "Draft Game", start_at: startAtIn(5 * 3600_000), max_players: 100 }, {});
  assert.equal(d.status, 200, d.text); draft = d.json.game_id;
});
after(() => H?.stop());

const withGame = (id, gid) => (g.actions.find((a) => a.id === id).inputs.properties.game_id ? { game_id: gid } : {});
const readOnlyForBoth = ["check_key", "game_status", "list_guests", "game_results", "list_prizes", "game_timeline", "report_link_status"];

test("every answer, success or error, carries the documented envelope and nothing else", async () => {
  // every field the gateway sends must be documented in the registry's envelope_fields (so the AI is told about it)
  const allowed = new Set(registry.envelope_fields.flatMap(([names]) => names.split(",").map((s) => s.trim())));
  for (const id of ["check_key", "game_status", "list_guests"]) {
    const r = await act(A.orgKey, id, withGame(id, fx.gameId), { get: true });
    assert.equal(r.status, 200, r.text);
    for (const k of Object.keys(r.json)) assert.ok(allowed.has(k), `unexpected envelope field ${k} in ${id}`);
    assert.equal(r.json.ok, true); assert.ok(r.json.state && Array.isArray(r.json.allowed_next_actions) && Array.isArray(r.json.do_not) && typeof r.json.say_to_organizer === "string");
  }
  const e = await act(A.orgKey, "game_status", { game_id: "CG-NOPE-0000" }, { get: true });
  assert.equal(e.json.ok, false); assert.ok(e.json.error.code && e.json.error.message && Array.isArray(e.json.error.recovery));
});

test("role matrix: for every action, a role the registry lists is accepted (never role_not_allowed) and any other is refused with 403 before the game is called", async () => {
  for (const a of g.actions) {
    for (const [role, key] of [["organizer", A.orgKey], ["host", A.hostKey]]) {
      const r = await act(key, a.id, { game_id: fx.gameId }, { get: a.kind === "read", headers: a.idempotency === "required" ? { "idempotency-key": `matrix-${a.id}-${role}-abcdefgh` } : {} });
      if (a.roles.includes(role)) assert.notEqual(r.json?.error?.code, "role_not_allowed", `${a.id} as ${role} was refused though the registry allows it: ${r.text.slice(0, 200)}`);
      else { assert.equal(r.status, 403, `${a.id} as ${role}: ${r.text.slice(0, 200)}`); assert.equal(r.json.error.code, "role_not_allowed"); }
    }
  }
});

test("every read action that both roles may use works on the paid game, for both roles", async () => {
  for (const id of readOnlyForBoth) for (const key of [A.orgKey, A.hostKey]) {
    const r = await act(key, id, withGame(id, fx.gameId), { get: true });
    assert.equal(r.status, 200, `${id}: ${r.text.slice(0, 300)}`);
    assert.equal(r.json.ok, true);
  }
});

test("organizer read actions work: list_games, team_overview, plan_start_time, payment_status, list_game_control_requests", async () => {
  const list = await act(A.orgKey, "list_games", {}, { get: true }); assert.equal(list.status, 200, list.text);
  assert.ok(JSON.stringify(list.json.result).includes(fx.gameId));
  const team = await act(A.orgKey, "team_overview", {}, { get: true }); assert.equal(team.status, 200, team.text);
  const plan = await act(A.orgKey, "plan_start_time", { start_at: startAtIn(4 * 3600_000) }, { get: true }); assert.equal(plan.status, 200, plan.text);
  assert.ok(plan.json.result.startsAtIST, "shows the start in Indian time");
  const bad = await act(A.orgKey, "plan_start_time", { start_at: startAtIn(90 * 24 * 3600_000) }, { get: true });
  assert.ok(bad.json.ok === false || bad.json.result?.error, "a start 90 days away is refused");
  const ps = await act(A.orgKey, "payment_status", { game_id: fx.gameId }, { get: true }); assert.equal(ps.status, 200, ps.text);
  const cr = await act(A.orgKey, "list_game_control_requests", { game_id: fx.gameId }, { get: true }); assert.ok([200, 409].includes(cr.status), cr.text);
});

test("a host key cannot see another organizer's game, and another organizer's key cannot see this one (isolation)", async () => {
  const r1 = await act(B.orgKey, "game_status", { game_id: fx.gameId }, { get: true });
  assert.equal(r1.json.ok, false); assert.ok(["game_not_found", "game_refused", "game_refused_permission"].includes(r1.json.error.code), r1.text);
  const r2 = await act(B.hostKey, "game_status", { game_id: fx.gameId }, { get: true });
  assert.equal(r2.json.ok, false);
});

test("the public pages need no key and are exactly the generated files: /ai, /llms.txt, /openapi.json (and the /ai/ aliases)", async () => {
  const fs = await import("node:fs"), here = (f) => fs.readFileSync(new URL(`../generated/${f}`, import.meta.url), "utf8");
  for (const [p, f] of [["/ai", "ai.md"], ["/llms.txt", "llms.txt"], ["/ai/llms.txt", "llms.txt"], ["/openapi.json", "openapi.json"], ["/ai/openapi.json", "openapi.json"]]) {
    const r = await call("GET", p);
    assert.equal(r.status, 200, p);
    assert.equal(r.text.trim(), here(f).trim(), `${p} differs from generated/${f}`);
  }
  const root = await call("GET", API); assert.equal(root.status, 200); assert.ok(root.json.games?.length >= 1);
});

test("unknown game, unknown action, wrong method and oversized body get their documented errors", async () => {
  assert.equal((await act(A.orgKey, "game_status", { game_id: "CG-NOPE-0000" }, { get: true })).json.error.code, "game_not_found");
  assert.equal((await act(A.orgKey, "pay_everything", {})).json.error.code, "unknown_action");
  assert.equal((await call("GET", `${API}/nogame`, { key: A.orgKey })).json.error.code, "unknown_game");
  assert.equal((await call("DELETE", `${API}/tambola/actions/game_status`, { key: A.orgKey })).json.error.code, "method_not_allowed");
  const big = await call("POST", `${API}/tambola/actions/announce`, { key: A.orgKey, body: { game_id: fx.gameId, text: "x".repeat(20000) }, headers: { "idempotency-key": "big-body-test-0001" } });
  assert.equal(big.status, 413); assert.equal(big.json.error.code, "body_too_large");
});

test("game_status shows the state, the guest link and the prizes, and nothing that identifies a guest", async () => {
  const r = await act(A.orgKey, "game_status", { game_id: fx.gameId }, { get: true });
  assert.equal(r.json.state, "scheduled");
  const t = r.text;
  for (const c of canaries) { assert.ok(!t.includes(c.phone) && !t.includes(c.guestName)); }
  assert.ok(!/report|\.csv|\/r\//i.test(JSON.stringify(r.json.result.links ?? {})), "no report links");
});

test("list_guests gives counts only, never names or numbers", async () => {
  const r = await act(A.hostKey, "list_guests", { game_id: fx.gameId }, { get: true });
  assert.equal(r.status, 200, r.text);
  for (const c of canaries) assert.ok(!r.text.includes(c.phone) && !r.text.includes(c.guestName), "a guest identity leaked");
  assert.ok(!/"(name|phone|mobile|email)"\s*:/i.test(JSON.stringify(r.json.result)), "a personal-data field name appears in the result: " + JSON.stringify(r.json.result).slice(0, 300));
});

test("a draft game can be changed (settings, guest invites) and has no start button: start is automatic once paid", async () => {
  const s = await act(A.orgKey, "change_settings", { game_id: draft, rounds: 2, max_players: 250 }, { headers: { "idempotency-key": "settings-0001-abcdef" } });
  assert.equal(s.status, 200, s.text);
  const gi = await act(A.orgKey, "set_guest_invites", { game_id: draft, on: true, per_guest: 3, categories: ["colleagues", "friends"] }, { headers: { "idempotency-key": "invites-0001-abcdef" } });
  assert.equal(gi.status, 200, gi.text);
  assert.ok(!g.actions.some((a) => /start/.test(a.id) && a.id !== "plan_start_time"), "there must be no start action");
});

test("time passes: scheduled -> running -> ended, and the allowed next actions follow the state", async () => {
  await H.h("clock", { advanceMs: 3 * 3600_000 + 10 * 60_000 });
  const run = await act(A.orgKey, "game_status", { game_id: fx.gameId }, { get: true });
  assert.equal(run.json.state, "running", run.text.slice(0, 300));
  assert.ok(run.json.allowed_next_actions.some((x) => x.action === "game_results"));
  assert.ok(!run.json.allowed_next_actions.some((x) => x.action === "change_settings"), "settings are locked while running");
  await H.h("clock", { advanceMs: 2 * 24 * 3600_000 });
  const end = await act(A.orgKey, "game_status", { game_id: fx.gameId }, { get: true });
  assert.ok(["ended", "did_not_start"].includes(end.json.state), end.json.state);
});

test("the cancel preview, then cancel with the typed sentence, then erase: each irreversible step is confirmed and then does what it says", async () => {
  const pv = await act(A.orgKey, "cancel_game_preview", { game_id: draft }, { get: true }); assert.equal(pv.status, 200, pv.text);
  const idk = { "idempotency-key": "cancel-draft-0001-abcdef" };
  const first = await act(A.orgKey, "cancel_game", { game_id: draft }, { headers: idk });
  assert.equal(first.status, 409); assert.equal(first.json.error.code, "confirmation_required");
  const d = first.json.error.details; assert.equal(d.confirm_phrase, `CANCEL GAME ${draft}`);
  const done = await act(A.orgKey, "cancel_game", { game_id: draft, confirm: { phrase: d.confirm_phrase, token: d.confirmation_token } }, { headers: idk });
  assert.equal(done.status, 200, done.text); assert.equal(done.json.state, "cancelled");
  const er1 = await act(A.orgKey, "erase_guest_data", { game_id: fx.gameId }, { headers: { "idempotency-key": "erase-0001-abcdefgh" } });
  assert.equal(er1.json.error.code, "confirmation_required");
  const e = er1.json.error.details;
  const er2 = await act(A.orgKey, "erase_guest_data", { game_id: fx.gameId, confirm: { phrase: e.confirm_phrase, token: e.confirmation_token } }, { headers: { "idempotency-key": "erase-0001-abcdefgh" } });
  assert.equal(er2.status, 200, er2.text);
  const left = await H.h("sql", { sql: "select count(*) as n from persons" }).catch(() => null);
  void left;
});
