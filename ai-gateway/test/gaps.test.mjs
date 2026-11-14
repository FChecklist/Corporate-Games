// THE SIX APPROVED GATEWAY-ONLY GAPS, against the real game code (local, in memory):
//   G08 extra settings (D15)   G50 reopen (D17)   G53 activity log (D28)   O04 the game's limited AI key + a fresh one (D16)   O20 key list (D18)   H05 a Host lists games (D30)
// plus the safety cases that belong to them: wrong key kind, wrong role, skipped confirmation, links, personal data, keys never shown.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireGame, startHarness, makeGateway, makeAccount, startAtIn, API, bundle, idem } from "./helpers.mjs";
import { paidGame } from "./agent.mjs";
import { runners } from "../games/tambola/runtime.mjs";

const reg = bundle.registry.games.tambola;
const HOUR = 3600_000;
const KEY_SHAPE = /\bct[kah]_[0-9a-f]{48}\b/;
let H, G, gameCalls = [], everything = [];

before(async () => {
  if (!requireGame()) return;
  H = await startHarness();
  const fetchImpl = async (input, init) => { const u = new URL(typeof input === "string" ? input : input.url); gameCalls.push(`${(init?.method ?? "GET").toUpperCase()} ${u.pathname}`); return fetch(input, init); };
  const wide = { max: 100000, windowS: 60 };
  G = makeGateway(H.origin, { fetchImpl, limits: { per_key_minute: wide, write_minute: wide, per_ip_minute: wide } });
  const orig = G.call; G.call = async (...a) => { const r = await orig(...a); everything.push(r.text); return r; };
});
after(() => H?.stop());

const read = (key, id, query = {}) => G.call("GET", `${API}/tambola/actions/${id}`, { key, query });
/** What a person does: the first call is refused with the sentence to type; the second call carries the sentence and the token. */
async function confirmed(key, id, input) {
  const h = { "idempotency-key": idem() };
  const first = await G.act(key, id, input, { headers: h });
  assert.equal(first.status, 409, first.text); assert.equal(first.json.error.code, "confirmation_required");
  const d = first.json.error.details;
  return G.act(key, id, { ...input, confirm: { phrase: d.confirm_phrase, token: d.confirmation_token } }, { headers: h });
}
const draft = async (key, name = "Gap Game") => {
  const r = await G.act(key, "create_game", { name, start_at: startAtIn(3 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(r.status, 200, r.text); return r.json.game_id;
};
const consoleSettings = async (key, gid, body) => (await fetch(`${H.origin}/api/z/${gid}/settings`, { method: "PATCH", headers: { "x-organizer": key, "content-type": "application/json" }, body: JSON.stringify(body) })).status; // a person in the console

test("G08 change_extra_settings: who can join, breaks, opening, closing, brand, Co-host limit; typed text is marked untrusted; links and logos cannot be sent", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const gid = await draft(acct.orgKey);
  const color = reg.game_rules.constants?.brand_colors?.[0] ?? "#0B3D91";
  const r = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, who_can_join: "list", cohost_limit: 50, brand_name: "Acme", brand_color: color,
    breaks: [{ kind: "speech", title: "Tea break", seconds: 60 }, { kind: "lucky", title: "Lucky draw", winners: 3, style: "scratch", after: 40, seconds: 60 }],
    opening: [{ kind: "speech", title: "Welcome all", seconds: 30 }], closing: [{ kind: "speech", title: "Thank you all" }] });
  assert.equal(r.status, 200, r.text);
  const x = r.json.result;
  assert.equal(x.whoCanJoin, "list"); assert.equal(x.coHostLimit, 50); assert.deepEqual(x.brand, { name: "Acme", color });
  assert.deepEqual(x.breaks.map((b) => b.kind).sort(), ["lucky", "speech"]); assert.equal(x.opening[0].title, "Welcome all"); assert.equal(x.closing[0].title, "Thank you all");
  assert.ok(r.json.untrusted_fields.includes("result.breaks[].title") && r.json.untrusted_fields.includes("result.brand.name"), "typed text is listed as untrusted");
  assert.ok(!/mediaUrl|logo/.test(JSON.stringify(x)), "no link and no logo in the answer");
  assert.equal(r.json.state, "draft");
  // the same call can clear them again (empty lists) and remove the brand
  const clear = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, breaks: [], opening: [], closing: [], remove_brand: true });
  assert.equal(clear.status, 200, clear.text); assert.deepEqual(clear.json.result.breaks, []); assert.ok(!clear.json.result.brand);
  // nothing that could carry a link, a video or a logo is accepted
  for (const bad of [
    { breaks: [{ kind: "youtube", title: "Video", seconds: 60 }] },
    { breaks: [{ kind: "speech", title: "Talk", seconds: 60, mediaUrl: "https://example.com/x" }] },
    { opening: [{ kind: "speech", title: "Hi there", seconds: 30, mediaUrl: "https://example.com/x" }] },
    { brand_logo: "data:image/png;base64,AAAA" }, { brand_name: "Acme", brand_color: "#123456" },
    { who_can_join: "everyone" }, { cohost_limit: 5 }, { cohost_limit: 100000 }, { call_mode: "robot" },
    { breaks: [{ kind: "speech", title: "See https://example.com now", seconds: 60 }] },
    { closing: [{ kind: "speech", title: "Call 98765 43210 for help" }] },
    { brand_name: "ask@acme.example", brand_color: color },
  ]) {
    const b = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, ...bad });
    assert.equal(b.status, 400, `${JSON.stringify(bad)} -> ${b.status} ${b.text.slice(0, 200)}`);
    assert.ok(["invalid_input", "personal_data_refused"].includes(b.json.error.code), b.json.error.code);
  }
  // a brand needs both a name and a colour; an empty change is refused
  const half = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, brand_name: "Acme" });
  assert.equal(half.status, 400); assert.equal(half.json.error.code, "invalid_input");
  const nothing = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, remove_brand: false });
  assert.equal(nothing.status, 400);
  const empty = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid });
  assert.equal(empty.status, 400, "at least one setting is needed");
  // too many breaks for any number of tickets
  const many = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, breaks: Array.from({ length: 7 }, (_, i) => ({ kind: "speech", title: `Break ${i + 1}`, seconds: 60 })) });
  assert.equal(many.status, 400);
});

test("G08 change_extra_settings: host-calling mode needs the person's typed sentence; links set in the console are never removed by the AI; a Host cannot; the limited AI key can", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const gid = await draft(acct.orgKey);
  const hm = await confirmed(acct.orgKey, "change_extra_settings", { game_id: gid, call_mode: "host" });
  assert.equal(hm.status, 200, hm.text); assert.equal(hm.json.result.callMode, "host");
  const back = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, call_mode: "auto" });
  assert.equal(back.status, 200, "switching back to the software needs no sentence"); assert.equal(back.json.result.callMode, "auto");
  // the organizer, in the console, puts a YouTube break on the game
  assert.equal(await consoleSettings(acct.orgKey, gid, { breaks: [{ kind: "youtube", title: "Company video", seconds: 60, after: 30, mediaUrl: "https://youtu.be/abc123" }] }), 200);
  const refused = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, breaks: [{ kind: "speech", title: "Tea break", seconds: 60 }] });
  assert.equal(refused.status, 409); assert.equal(refused.json.error.code, "console_only_content");
  const other = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, who_can_join: "list" }); // settings that do not touch the list are fine
  assert.equal(other.status, 200, other.text);
  assert.deepEqual(other.json.result.breaks.map((b) => b.kind), ["youtube"], "the console's video break is still there");
  assert.ok(!/mediaUrl|https?:\/\//.test(JSON.stringify([other.json.result.breaks, other.json.result.opening, other.json.result.closing, other.json.result.brand])), "the AI is not shown the link (only the kind of break is named)");
  // a Host cannot; the game's limited AI key can
  const host = await G.act(acct.hostKey, "change_extra_settings", { game_id: gid, who_can_join: "anyone" });
  assert.equal(host.status, 403); assert.equal(host.json.error.code, "role_not_allowed");
  const ai = await G.act(acct.aiKey, "change_extra_settings", { game_id: gid, who_can_join: "anyone" });
  assert.equal(ai.status, 200, ai.text); assert.equal(ai.json.result.whoCanJoin, "anyone");
  // another organizer's game
  const stranger = await makeAccount(H);
  const sr = await G.act(stranger.orgKey, "change_extra_settings", { game_id: gid, who_can_join: "list" });
  assert.ok(sr.status >= 400 && !sr.json.ok);
});

test("G08 (unit): a logo the organizer set in the console is carried over to the game and never shown; names alone do not drop it", async () => {
  const sent = [];
  const io = { role: "organizer", keyKind: "master", refuse: (code, message, o) => Object.assign(new Error(message), { code, ...o }),
    must: async (name, a) => { if (name === "summary") return { json: { id: "G1", breaks: [], opening: [], closing: [], brand: { name: "Old", color: "#0B3D91", logo: "data:image/png;base64,QUJD" } } }; sent.push({ name, body: a.body }); return { json: { ok: true } }; } };
  await runners.change_extra_settings({ game_id: "GAME1234", brand_color: "#1B7F5C" }, io);
  assert.deepEqual(sent.find((c) => c.name === "settings").body.brand, { name: "Old", color: "#1B7F5C", logo: "data:image/png;base64,QUJD" });
});

test("G50 reopen_game: a cancelled PAID game comes back at a new date after the typed sentence; the AI never pays; an unpaid or running game, a limited key and a Host cannot", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn, name: "Reopen Me" });
  const calls0 = gameCalls.length;
  const early = await G.act(acct.orgKey, "reopen_game", { game_id: gameId, start_at: startAtIn(6 * HOUR) }, { headers: { "idempotency-key": idem() } });
  assert.equal(early.status, 409); assert.equal(early.json.error.code, "wrong_state", "a game that is not cancelled cannot be reopened");
  const c = await confirmed(acct.orgKey, "cancel_game", { game_id: gameId });
  assert.equal(c.status, 200, c.text); assert.equal(c.json.state, "cancelled");
  assert.ok(c.json.allowed_next_actions.some((a) => a.action === "reopen_game"), "a cancelled game offers reopen_game");
  assert.ok(c.json.lifecycle.may_become.some((m) => m.to === "scheduled" && m.via === "reopen_game"), "the state machine allows cancelled -> scheduled by reopen_game");
  assert.equal(c.json.lifecycle.terminal, false);
  // not for the limited key, not for a Host
  for (const [who, key] of [["limited AI key", acct.aiKey], ["Host", acct.hostKey]]) {
    const r = await G.act(key, "reopen_game", { game_id: gameId, start_at: startAtIn(6 * HOUR) }, { headers: { "idempotency-key": idem() } });
    assert.equal(r.status, 403, who); assert.equal(r.json.error.code, "role_not_allowed", who);
  }
  const t = startAtIn(6 * HOUR);
  const r = await confirmed(acct.orgKey, "reopen_game", { game_id: gameId, start_at: t });
  assert.equal(r.status, 200, r.text);
  assert.equal(r.json.state, "scheduled"); assert.equal(r.json.result.paid, true); assert.ok(!r.json.result.cancelled);
  assert.ok(Math.abs(r.json.result.startMs - Date.parse(t)) < 5000, "the new start time is the one given");
  assert.match(r.json.say_to_organizer, /nothing more is due/i);
  const used = gameCalls.slice(calls0);
  assert.ok(used.some((u) => u === `POST /api/z/${gameId}/reopen`), "the game's own reopen route was called");
  assert.ok(!used.some((u) => /paylink|checkout|payments|credit/.test(u) && !/paylink\/[0-9a-f]+$/.test(u)), "no payment route: " + used.join());
  // a game that was never paid: cancel it, then reopening is refused by the game and a new draft is offered instead
  const d = await draft(acct.orgKey, "Never Paid");
  const dc = await confirmed(acct.orgKey, "cancel_game", { game_id: d });
  assert.equal(dc.status, 200, dc.text);
  const un = await confirmed(acct.orgKey, "reopen_game", { game_id: d, start_at: startAtIn(5 * HOUR) });
  assert.ok(un.status >= 400 && !un.json.ok, un.text);
  assert.equal((await read(acct.orgKey, "game_status", { game_id: d })).json.state, "cancelled", "nothing changed");
  // someone else's game
  const stranger = await makeAccount(H);
  const sr = await G.act(stranger.orgKey, "reopen_game", { game_id: gameId, start_at: startAtIn(7 * HOUR) }, { headers: { "idempotency-key": idem() } });
  assert.ok(sr.status >= 400 && !sr.json.ok);
});

test("G53 list_activity: the gateway's own log of calls, with no keys, no inputs and no personal data; a game's log shows the calls that worked on it", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const gid = await draft(acct.orgKey, "Logged Game");
  await G.act(acct.orgKey, "announce", { game_id: gid, text: "Hello everyone" }, { headers: { "idempotency-key": idem() } }).catch(() => null);
  await G.act(acct.hostKey, "create_game", { name: "No", start_at: startAtIn(HOUR), max_players: 50 }); // refused: a Host cannot
  const bad = await G.act(acct.orgKey, "change_settings", { game_id: gid, tickets: 7 }); // refused: invalid input
  assert.equal(bad.status, 400);
  await read(acct.aiKey, "game_status", { game_id: gid });
  await G.call("GET", `${API}/tambola/actions/game_status`, { key: acct.hostKey, query: { game_id: gid }, agent: "Gemini" });
  const mine = await read(acct.orgKey, "list_activity", {});
  assert.equal(mine.status, 200, mine.text);
  const e = mine.json.result.entries;
  assert.ok(e.length >= 3 && mine.json.result.count === e.length);
  const acts = e.map((x) => x.action);
  assert.ok(acts.includes("create_game") && acts.includes("change_settings"), acts.join());
  assert.ok(!acts.includes("create_game") || e.filter((x) => x.action === "create_game").every((x) => x.key_kind === "master"), "only this key's own calls");
  const refused = e.find((x) => x.action === "change_settings"); assert.equal(refused.ok, false); assert.equal(refused.error_code, "invalid_input"); assert.equal(refused.game_id, null, "a refused call is not written into a game's log");
  const created = e.find((x) => x.action === "create_game"); assert.equal(created.ok, true); assert.equal(created.game_id, gid); assert.equal(created.role, "organizer");
  assert.equal(created.agent, "TestAI"); assert.ok(mine.json.untrusted_fields.includes("result.entries[].agent"), "the agent label is typed by the caller: untrusted");
  const text = JSON.stringify(mine.json);
  assert.ok(!KEY_SHAPE.test(text) && !text.includes(acct.orgKey) && !text.includes(acct.hostKey) && !text.includes("keyId"), "no key in the log answer");
  assert.ok(!/Hello everyone|Logged Game/.test(text), "no input values in the log");
  // the log of one game: calls that worked, by any key of the account or a Host
  const forGame = await read(acct.orgKey, "list_activity", { game_id: gid, limit: 100 });
  assert.equal(forGame.status, 200, forGame.text);
  const g = forGame.json.result.entries;
  assert.ok(g.every((x) => x.ok && x.game_id === gid), "only calls that worked on this game");
  assert.ok(g.some((x) => x.key_kind === "host" && x.agent === "Gemini"), "a Host's call shows up");
  assert.ok(g.some((x) => x.key_kind === "ai"), "a call of the limited AI key shows up");
  assert.ok(!g.some((x) => x.action === "change_settings"), "the refused call is not there");
  assert.equal((await read(acct.orgKey, "list_activity", { game_id: gid, limit: 1 })).json.result.entries.length, 1, "limit");
  // not for a Host; not for a stranger's game; not for a game that does not exist
  const host = await read(acct.hostKey, "list_activity", {});
  assert.equal(host.status, 403); assert.equal(host.json.error.code, "role_not_allowed");
  const stranger = await makeAccount(H);
  const sr = await read(stranger.orgKey, "list_activity", { game_id: gid });
  assert.ok(sr.status >= 400 && !sr.json.ok && !("result" in sr.json), "another organizer sees nothing of this game");
  assert.ok(!JSON.stringify(sr.json.error).includes(gid) || sr.json.error.code === "game_not_found", "and the refusal reveals nothing about it");
  const own = (await read(stranger.orgKey, "list_activity", {})).json.result.entries;
  assert.ok(own.every((x) => x.action === "list_activity" && x.game_id === null), "a stranger's own log holds only their own calls, none of this game's");
  // the log never holds calls of a key the game refused (a flood of bad keys cannot push real entries out)
  const before = (await read(acct.orgKey, "list_activity", {})).json.result.kept;
  for (let i = 0; i < 20; i++) await G.call("GET", `${API}/tambola/actions/check_key`, { key: "ctk_" + String(i).padStart(2, "0").repeat(24).slice(0, 48) });
  assert.equal((await read(acct.orgKey, "list_activity", {})).json.result.kept, before + 1, "only the one list_activity call was added");
});

test("O20 list_signin_keys: ids, kinds and dates only, never a key; only the organizer key", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const r = await read(acct.orgKey, "list_signin_keys", {});
  assert.equal(r.status, 200, r.text);
  const keys = r.json.result.keys;
  assert.ok(keys.length >= 2, "the organizer key and the AI work key");
  for (const k of keys) { assert.match(k.id, /^[0-9a-f]{10}$/); assert.equal(typeof k.revoked, "boolean"); assert.ok(Number.isFinite(k.created_ms) && k.created_at.startsWith("20")); }
  assert.equal(keys.filter((k) => k.thisOne).length, 1, "the key in use is marked");
  assert.ok(keys.some((k) => k.kind === "master") && keys.some((k) => k.kind === "ai"));
  const text = r.text;
  assert.ok(!KEY_SHAPE.test(text) && !text.includes(acct.orgKey) && !text.includes(acct.aiKey) && !text.includes(acct.hostKey), "no key in the answer");
  assert.ok(r.json.allowed_next_actions.some((a) => a.action === "request_fresh_ai_key"), "offered from the start");
  for (const [who, key] of [["limited AI key", acct.aiKey], ["Host", acct.hostKey]]) { const x = await read(key, "list_signin_keys", {}); assert.equal(x.status, 403, who); assert.equal(x.json.error.code, "role_not_allowed"); }
  // nothing retires or replaces a key: there is no such action, and the game's revoke, replace and show-link routes are never called
  assert.ok(!reg.actions.some((a) => /revoke|replace|rotate|show_ai_link/.test(a.id)));
});

test("O04 the game's limited AI key (cta_): accepted as the organizer role with fewer rights; every step the game refuses it is refused by the gateway first", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const chk = await read(acct.aiKey, "check_key");
  assert.equal(chk.status, 200, chk.text); assert.equal(chk.json.role, "organizer"); assert.equal(chk.json.result.key_kind, "ai"); assert.equal(chk.json.result.limited, true);
  const ids = chk.json.allowed_next_actions.map((a) => a.action);
  for (const never of ["create_payment_link", "share_payment_link", "cancel_game", "cancel_game_preview", "erase_guest_data", "clone_game", "retire_team_member", "reopen_game", "list_signin_keys", "request_fresh_ai_key"]) assert.ok(!ids.includes(never), `${never} is not offered to the limited key`);
  assert.ok(ids.includes("create_game") && ids.includes("list_activity") && ids.includes("team_overview"));
  const master = await read(acct.orgKey, "check_key");
  assert.equal(master.json.result.key_kind, "master"); assert.equal(master.json.result.limited, false);
  // every organizer action that the registry does not mark for the limited key is refused with a clear message, and nothing reaches the game
  const refusedActions = reg.actions.filter((a) => a.roles.includes("organizer") && !a.ai_key);
  assert.ok(refusedActions.length >= 10);
  const gid = await draft(acct.orgKey, "Limited Key Game");
  const before = gameCalls.length;
  for (const a of refusedActions) {
    const r = a.kind === "read" ? await read(acct.aiKey, a.id, { game_id: gid }) : await G.act(acct.aiKey, a.id, a.id === "retire_team_member" ? { team_ref: "0123456789" } : { game_id: gid, start_at: startAtIn(5 * HOUR) }, { headers: { "idempotency-key": idem() } });
    assert.equal(r.status, 403, `${a.id}: ${r.status} ${r.text.slice(0, 160)}`); assert.equal(r.json.error.code, "role_not_allowed", a.id);
    assert.match(r.json.error.message, /limited AI work key/);
  }
  assert.ok(!gameCalls.slice(before).some((u) => u !== "GET /api/whoami"), "the gateway refused them before calling the game (only the key check went out)");
  // what it may do, it can: a draft, settings, invitations, messages, reading
  const make = await G.act(acct.aiKey, "create_game", { name: "By AI Key", start_at: startAtIn(4 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(make.status, 200, make.text);
  assert.equal((await G.act(acct.aiKey, "set_guest_invites", { game_id: make.json.game_id, on: true, per_guest: 2, categories: ["colleagues"] })).status, 200);
  assert.equal((await G.act(acct.aiKey, "change_settings", { game_id: make.json.game_id, prizes: [{ house: "full", place: 1, text: "Gift voucher worth Rs 500" }] })).status, 200);
  // a made-up AI key is refused by the game; a retired one stops at once
  const fake = await read("cta_" + "a".repeat(48), "check_key");
  assert.equal(fake.status, 401);
  const fakeText = JSON.stringify(fake.json);
  assert.ok(!fakeText.includes("cta_" + "a".repeat(48)), "a refused key is never repeated");
});

test("O04 request_fresh_ai_key: typed sentence first; the new key is e-mailed to the organizer and never shown, even when the game could not send the mail", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const list0 = (await read(acct.orgKey, "list_signin_keys", {})).json.result.keys.length;
  const r = await confirmed(acct.orgKey, "request_fresh_ai_key", {});
  assert.equal(r.status, 200, r.text);
  assert.deepEqual(Object.keys(r.json.result).sort(), ["expiresMs", "ok", "sent"].sort());
  assert.ok(!KEY_SHAPE.test(r.text) && !/aiMessage|Authorization|paste this|your key is/i.test(r.text), "no key and no paste text in the answer (in the test setup the game cannot send mail and hands the key back: it is dropped)");
  assert.equal(typeof r.json.result.sent, "boolean"); // in the test setup the game usually cannot send mail (its allow-list is for the owner) and hands the key back: it is dropped
  assert.match(r.json.say_to_organizer, r.json.result.sent ? /e-mailed a fresh AI key/i : /could not e-mail/i);
  assert.equal((await read(acct.orgKey, "list_signin_keys", {})).json.result.keys.length, list0 + 1, "the game made one key (it is not shown anywhere)");
  // refused for the limited key and a Host; needs the Idempotency-Key; a wrong sentence does nothing
  for (const key of [acct.aiKey, acct.hostKey]) { const x = await G.act(key, "request_fresh_ai_key", {}, { headers: { "idempotency-key": idem() } }); assert.equal(x.status, 403); assert.equal(x.json.error.code, "role_not_allowed"); }
  const noKey = await G.act(acct.orgKey, "request_fresh_ai_key", {}); assert.equal(noKey.status, 400); assert.equal(noKey.json.error.code, "idempotency_key_required");
  const h = { "idempotency-key": idem() };
  const ask = await G.act(acct.orgKey, "request_fresh_ai_key", {}, { headers: h });
  const wrong = await G.act(acct.orgKey, "request_fresh_ai_key", { confirm: { phrase: "YES PLEASE", token: ask.json.error.details.confirmation_token } }, { headers: h });
  assert.equal(wrong.status, 409); assert.equal(wrong.json.error.code, "confirmation_required");
  assert.equal((await read(acct.orgKey, "list_signin_keys", {})).json.result.keys.length, list0 + 1, "nothing was made by the wrong sentence");
});

test("O04 request_fresh_ai_key (unit, a stubbed game): when the mail is sent the answer says so; when it is not, the key the game hands back is dropped", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const SECRET = "cta_" + "ab".repeat(24);
  for (const [reply, sent] of [[{ ok: true, mailed: true, expiresMs: 1234567 }, true], [{ ok: true, mailed: false, expiresMs: 1234567, aiMessage: `Use this key: ${SECRET}` }, false]]) {
    const fetchImpl = async (input, init) => { const u = new URL(typeof input === "string" ? input : input.url); return u.pathname === "/api/org/ai/fresh" ? new Response(JSON.stringify(reply), { status: 200, headers: { "content-type": "application/json" } }) : fetch(input, init); };
    const S = makeGateway(H.origin, { fetchImpl });
    const h = { "idempotency-key": idem() };
    const a = await S.act(acct.orgKey, "request_fresh_ai_key", {}, { headers: h });
    const r = await S.act(acct.orgKey, "request_fresh_ai_key", { confirm: { phrase: a.json.error.details.confirm_phrase, token: a.json.error.details.confirmation_token } }, { headers: h });
    assert.equal(r.status, 200, r.text); assert.equal(r.json.result.sent, sent); assert.equal(r.json.result.expiresMs, 1234567);
    assert.ok(!r.text.includes(SECRET) && !r.text.includes("aiMessage"), "the key is never passed on");
    const replay = await S.act(acct.orgKey, "request_fresh_ai_key", { confirm: { phrase: a.json.error.details.confirm_phrase, token: a.json.error.details.confirmation_token } }, { headers: h });
    assert.equal(replay.headers.get("idempotent-replay"), "true"); assert.ok(!replay.text.includes(SECRET));
  }
});

test("H05 list_games for a Host: only the published games, with id, time and head-count; no drafts; offered in every state; a Host still cannot create or see more", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const d = await draft(acct.orgKey, "Still A Draft");
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn, name: "Published Game" });
  const org = await read(acct.orgKey, "list_games", {});
  assert.ok(org.json.result.engagements.some((e) => e.id === d) && org.json.result.engagements.some((e) => e.id === gameId), "the organizer sees both");
  const r = await read(acct.hostKey, "list_games", {});
  assert.equal(r.status, 200, r.text); assert.equal(r.json.role, "host");
  const ids = r.json.result.engagements.map((e) => e.id);
  assert.ok(ids.includes(gameId) && !ids.includes(d), "no draft for a Host");
  for (const e of r.json.result.engagements) assert.deepEqual(Object.keys(e).sort(), ["call_seconds", "closed", "id", "participants", "start_round", "startsAtIST"].sort());
  assert.ok(r.json.say_to_host, "a Host is spoken to in say_to_host");
  assert.ok(!KEY_SHAPE.test(r.text));
  // offered at every Host step, and the Host can open what it sees
  const st = await read(acct.hostKey, "game_status", { game_id: gameId });
  assert.ok(st.json.allowed_next_actions.some((a) => a.action === "list_games"), "list_games is offered to the Host in every state");
  assert.equal(st.json.state, "scheduled");
  const mk = await G.act(acct.hostKey, "create_game", { name: "No", start_at: startAtIn(HOUR), max_players: 50 });
  assert.equal(mk.status, 403);
  const other = await makeAccount(H);
  const mine = await read(other.hostKey, "list_games", {});
  assert.deepEqual(mine.json.result.engagements, [], "another account's Host sees none of these games");
});

test("the six gaps never made a payment, never published, never called a key-changing route; nothing typed by a person or a key leaked", async () => {
  const bad = gameCalls.filter((u) => /\/api\/(checkout|payments|credit|proforma|org\/(close|keys\/|ai(?!\/fresh$)))|\/publish$|\/settle$|\/forget$|\/roster$|\/reuse$/.test(u.split(" ")[1]));
  assert.deepEqual(bad, [], "forbidden game routes were called");
  assert.ok(gameCalls.some((u) => u === "GET /api/org/keys") && gameCalls.some((u) => u === "POST /api/org/ai/fresh") && gameCalls.some((u) => /\/reopen$/.test(u)), "the three approved routes were exercised");
  for (const t of everything) assert.ok(!/"?aiMessage"?/.test(t));
});
