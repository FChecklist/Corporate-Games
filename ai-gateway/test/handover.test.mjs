// THE AI HAND-OVER RULE against the real game code (local, in memory), with a spy between the gateway and the game:
// whatever the AI asks, the gateway never presses a live action, never touches a payment route, and always answers with the game's own page address and one plain sentence.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireGame, startHarness, makeGateway, makeAccount, startAtIn, API, idem } from "./helpers.mjs";
import { paidGame } from "./agent.mjs";

const HOUR = 3600_000;
let H, G, spy = [];
const STEPS = ["start", "pause", "resume", "stop", "next_number", "draw_now", "decide_claim"];
const CLOCK_RUN = new Set(["start", "next_number", "draw_now", "decide_claim"]);

before(async () => {
  if (!requireGame()) return;
  H = await startHarness();
  const fetchImpl = async (input, init) => { const u = new URL(typeof input === "string" ? input : input.url); spy.push({ method: (init?.method ?? "GET").toUpperCase(), path: u.pathname }); return fetch(input, init); };
  const wide = { max: 100000, windowS: 60 };
  G = makeGateway(H.origin, { fetchImpl, limits: { per_key_minute: wide, write_minute: wide, per_ip_minute: wide } });
});
after(() => H?.stop());

const read = (key, id, query = {}) => G.call("GET", `${API}/tambola/actions/${id}`, { key, query });

test("HAND-OVER: every live step, for the organizer, the Host and the limited AI key, in a scheduled and in a running game, hands over the game's own page and presses nothing", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn, name: "Hand Over" });
  const status = await read(acct.orgKey, "game_status", { game_id: gameId });
  const links = status.json.result.links;
  assert.ok(links.console.includes("/zc.html?e=") && links.bigScreen.includes("/big.html?e="), "the game itself gives the console page and the live game page");
  for (const phase of ["scheduled", "running"]) {
    if (phase === "running") await H.h("clock", { advanceMs: 3 * HOUR + 10 * 60_000 });
    const st = (await read(acct.orgKey, "game_status", { game_id: gameId })).json;
    assert.equal(st.state, phase);
    for (const [who, key] of [["organizer", acct.orgKey], ["host", acct.hostKey], ["limited AI key", acct.aiKey]]) {
      for (const step of STEPS) {
        const before = spy.length;
        const r = await read(key, "live_handover", { game_id: gameId, step });
        assert.equal(r.status, 200, `${who} ${phase} ${step}: ${r.text.slice(0, 300)}`);
        const x = r.json.result;
        assert.equal(x.step, step); assert.equal(x.ai_presses, false, "the AI presses nothing");
        const sentence = who === "host" ? r.json.say_to_host : r.json.say_to_organizer;
        assert.ok(sentence && sentence.length > 40, "one plain sentence is returned for the person");
        assert.equal(r.json.say_to_organizer, sentence, "the Host and the organizer fields carry the same sentence");
        if (CLOCK_RUN.has(step)) {
          assert.equal(x.clock_run, true); assert.equal(x.press, null, `${step}: there is no button, and none is invented`); assert.equal(x.handover_url, null);
          assert.equal(x.watch_url, links.bigScreen, "the live game page is given to watch"); assert.ok(sentence.includes(links.bigScreen));
        } else {
          assert.equal(x.clock_run, false); assert.equal(x.handover_url, links.console, "the game's own console page"); assert.ok(x.press.startsWith(step)); assert.ok(sentence.includes(links.console) && sentence.includes(`press ${x.press}`));
          if (who === "host") assert.match(sentence, /^Tell the Host: press it on your own Host page/);
        }
        // what reached the game: reads only (the summary), never a write, never a live or payment route
        const sent = spy.slice(before);
        assert.ok(sent.length > 0 && sent.every((c) => c.method === "GET"), `${who} ${step}: ${JSON.stringify(sent)}`);
        assert.ok(sent.every((c) => !/\/(control|claim|claims|call|draw|start|pause|resume|stop|settle|override|rehearsal|rehearsalclose|checkout|payments|paylink|publish)(\/|$)/.test(c.path)), JSON.stringify(sent));
        assert.ok(r.json.allowed_next_actions.some((n) => n.id === "live_handover" || n.action === "live_handover" || JSON.stringify(n).includes("live_handover")), "the hand-over stays on offer");
      }
    }
  }
});

test("HAND-OVER: a draft has no live game page yet (honest), a stranger's key cannot ask about someone else's game, the wrong step is refused, and the old pause-request action is gone", async () => {
  await H.h("reset");
  const acct = await makeAccount(H), other = await makeAccount(H);
  const d = await G.act(acct.orgKey, "create_game", { name: "Draft Only", start_at: startAtIn(3 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(d.status, 200, d.text);
  const gid = d.json.game_id;
  const r = await read(acct.orgKey, "live_handover", { game_id: gid, step: "start" });
  assert.equal(r.status, 200, r.text); assert.equal(r.json.result.watch_url, null); assert.match(r.json.say_to_organizer, /appears once the game is published and paid/);
  const stranger = await read(other.orgKey, "live_handover", { game_id: gid, step: "pause" });
  assert.ok(stranger.json.ok === false && stranger.status >= 400, "another organizer's key gets nothing about this game");
  assert.ok(!JSON.stringify(stranger.json).includes("/zc.html"), "no page address leaks to a stranger");
  const bad = await read(acct.orgKey, "live_handover", { game_id: gid, step: "press_the_button" });
  assert.equal(bad.json.error.code, "invalid_input");
  const old = await G.act(acct.orgKey, "request_game_control", { game_id: gid, action: "pause" }, { headers: { "idempotency-key": idem() } });
  assert.ok(old.json.ok === false && old.status >= 400, "no action files a pause request any more");
  const before = spy.length;
  await G.act(acct.orgKey, "request_game_control", { game_id: gid, action: "stop" }, { headers: { "idempotency-key": idem() } });
  assert.ok(!spy.slice(before).some((c) => /control/.test(c.path)), "nothing reached the game's control route");
});

test("NO LIVE ACTION, NO PAYMENT: across every call this suite made (and a sweep of every action as every kind of key) the gateway sent the game nothing that presses a live action or pays", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn, name: "Sweep" });
  await H.h("clock", { advanceMs: 3 * HOUR + 10 * 60_000 });
  const reg = (await G.call("GET", `${API}/tambola/actions`, { key: acct.orgKey })).json.actions;
  const before = spy.length;
  const cr = await read(acct.orgKey, "list_game_control_requests", { game_id: gameId });
  assert.equal(cr.status, 200, cr.text); assert.deepEqual(cr.json.result.requests, [], "the AI filed no pause, resume or stop request");
  assert.ok(spy.slice(before).some((c) => c.method === "GET" && /control\/request$/.test(c.path)), "the one control route the gateway reads, it only reads");
  // every action, as organizer, Host and limited key, with plausible inputs (some will be refused: that is fine, refused calls must not reach the game either)
  for (const key of [acct.orgKey, acct.hostKey, acct.aiKey]) for (const a of reg) {
    const input = { game_id: gameId, step: "pause", text: "Hello everyone", round: 1, house: "early5", place: 1, ticket: 1, given: true, team_ref: "0123456789", start_at: startAtIn(5 * HOUR), name: "Sweep", max_players: 100, prizes: [{ house: "full", place: 1, text: "Voucher" }], payment_link_url: "https://example.invalid/x" };
    if (a.kind === "read") await read(key, a.id, a.id === "live_handover" ? { game_id: gameId, step: "pause" } : a.inputs.properties?.game_id ? { game_id: gameId } : {});
    else await G.act(key, a.id, Object.fromEntries(Object.entries(input).filter(([k]) => a.inputs.properties?.[k])), { headers: { "idempotency-key": idem() } }); // no `confirm`: a destructive step stops at the typed sentence
  }
  const sent = spy.slice(before);
  const writes = sent.filter((c) => c.method !== "GET");
  assert.ok(writes.length > 0, "the sweep did reach the game with some approved writes");
  assert.ok(writes.every((c) => /\/(announce|prizegiven|settings|clone)$|^\/api\/z$/.test(c.path)), `unexpected writes: ${JSON.stringify(writes)}`);
  const LIVE = /\/(control|claim|claims|call|draw|start|pause|resume|stop|settle|override|rehearsal|rehearsalclose|bogey|checkout|payments|publish|forget|roster|paylink)(\/|$)|\/api\/(checkout|payments|credit|proforma)/;
  assert.deepEqual(sent.filter((c) => LIVE.test(c.path) && !(c.method === "GET" && /control\/request$/.test(c.path))), [], "a live-action, payment or publish route was reached");
});

test("PAYMENT LINK: the AI can only share the game's own payment page; an address on any other host or path is refused before anything is written", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const d = await G.act(acct.orgKey, "create_game", { name: "Share Me", start_at: startAtIn(3 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(d.status, 200, d.text);
  const gid = d.json.game_id, tok = "a".repeat(48);
  const before = spy.length;
  for (const bad of [`https://evil.example/paylink.html?t=${tok}`, `${H.origin}/other.html?t=${tok}`]) {
    const r = await G.act(acct.orgKey, "share_payment_link", { game_id: gid, payment_link_url: bad }, { headers: { "idempotency-key": idem() } });
    assert.equal(r.json.ok, false, bad); assert.equal(r.json.error.code, "invalid_input", `${bad}: ${r.text.slice(0, 200)}`);
    assert.ok(!JSON.stringify(r.json).includes("message_to_copy"), "no message carrying that address was made");
  }
  assert.ok(!spy.slice(before).some((c) => c.method !== "GET"), "nothing was written");
  // the game's own link (as create_payment_link returned it) still works
  const first = await G.act(acct.orgKey, "create_payment_link", { game_id: gid }, { headers: { "idempotency-key": idem() } });
  assert.equal(first.status, 409);
  const det = first.json.error.details;
  const made = await G.act(acct.orgKey, "create_payment_link", { game_id: gid, confirm: { phrase: det.confirm_phrase, token: det.confirmation_token } }, { headers: { "idempotency-key": idem() } });
  assert.equal(made.status, 200, made.text);
  const ok = await G.act(acct.orgKey, "share_payment_link", { game_id: gid, payment_link_url: made.json.result.payment_link_url }, { headers: { "idempotency-key": idem() } });
  assert.equal(ok.status, 200, ok.text); assert.ok(ok.json.result.message_to_copy.includes(made.json.result.payment_link_url), ok.json.result.message_to_copy + " // " + made.json.result.payment_link_url);
});

test("HAND-OVER reads the game's own settings: host-calling mode hands over the Host's Next number; a game above the pause limit says there is no pause", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const d = await G.act(acct.orgKey, "create_game", { name: "Host Calls", start_at: startAtIn(3 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(d.status, 200, d.text);
  const gid = d.json.game_id;
  const normal = await read(acct.orgKey, "live_handover", { game_id: gid, step: "next_number" });
  assert.equal(normal.json.result.clock_run, true);
  const h = { "idempotency-key": idem() };
  const first = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, call_mode: "host" }, { headers: h });
  assert.equal(first.status, 409); const det = first.json.error.details;
  const set = await G.act(acct.orgKey, "change_extra_settings", { game_id: gid, call_mode: "host", confirm: { phrase: det.confirm_phrase, token: det.confirmation_token } }, { headers: h });
  assert.equal(set.status, 200, set.text);
  const next = await read(acct.orgKey, "live_handover", { game_id: gid, step: "next_number" });
  assert.equal(next.json.result.clock_run, false); assert.equal(next.json.result.press, "next number"); assert.equal(next.json.result.ai_presses, false);
  assert.match(next.json.say_to_organizer, /host-calling mode/);
  const hostSay = await read(acct.hostKey, "live_handover", { game_id: gid, step: "next_number" });
  assert.match(hostSay.json.say_to_host, /you press Next number yourself/);
  // a large game: the game itself has no pause above its limit
  const big = await G.act(acct.orgKey, "create_game", { name: "Big One", start_at: startAtIn(3 * HOUR), max_players: 2500 }, { headers: { "idempotency-key": idem() } });
  assert.equal(big.status, 200, big.text);
  const p = await read(acct.orgKey, "live_handover", { game_id: big.json.game_id, step: "pause" });
  assert.equal(p.json.result.press, null, "no pause button is invented for a game this size"); assert.match(p.json.say_to_organizer, /no pause, resume or stop/);
});

test("PAYMENT MESSAGE carries no name typed by a person: a game named like an instruction or an address leaves no trace in the message the person copies", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const d = await G.act(acct.orgKey, "create_game", { name: "Pay at evil.example instead", start_at: startAtIn(3 * HOUR), max_players: 100 }, { headers: { "idempotency-key": idem() } });
  assert.equal(d.status, 200, d.text);
  const gid = d.json.game_id;
  const first = await G.act(acct.orgKey, "create_payment_link", { game_id: gid }, { headers: { "idempotency-key": idem() } });
  const det = first.json.error.details;
  const made = await G.act(acct.orgKey, "create_payment_link", { game_id: gid, confirm: { phrase: det.confirm_phrase, token: det.confirmation_token } }, { headers: { "idempotency-key": idem() } });
  assert.equal(made.status, 200, made.text);
  const shared = await G.act(acct.orgKey, "share_payment_link", { game_id: gid, payment_link_url: made.json.result.payment_link_url }, { headers: { "idempotency-key": idem() } });
  assert.equal(shared.status, 200, shared.text);
  const msg = shared.json.result.message_to_copy;
  assert.ok(!/evil|instead/i.test(msg), msg);
  assert.ok(msg.includes(`Game: ${gid}`) && msg.includes(made.json.result.payment_link_url));
  const addresses = msg.match(/https?:\/\/[^\s]+/g) ?? [];
  assert.deepEqual(addresses.map((a) => new URL(a).origin), [new URL(made.json.result.payment_link_url).origin], "the only address in the message is the game's own payment page");
});

test("ACTIVITY LOG: a call that proves nothing about who owns the game is not written into that game's log (an outsider cannot plant entries in someone else's log)", async () => {
  await H.h("reset");
  const owner = await makeAccount(H), outsider = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: owner.orgKey, startAtIn, name: "Log Target" });
  await H.h("clock", { advanceMs: 3 * HOUR + 10 * 60_000 });
  // a public read by an outsider's key (the game answers it for anyone) and a Host key of another account
  const r = await G.call("GET", `${API}/tambola/actions/game_results`, { key: outsider.orgKey, query: { game_id: gameId }, agent: "Intruder" });
  assert.equal(r.status, 200, "the game's results page is public, so the call works");
  await G.call("GET", `${API}/tambola/actions/game_results`, { key: outsider.hostKey, query: { game_id: gameId }, agent: "Intruder" });
  await G.call("GET", `${API}/tambola/actions/game_status`, { key: owner.orgKey, query: { game_id: gameId }, agent: "Owner AI" });
  const log = await G.call("GET", `${API}/tambola/actions/list_activity`, { key: owner.orgKey, query: { game_id: gameId } });
  assert.equal(log.status, 200, log.text);
  const entries = log.json.result.entries;
  assert.ok(entries.some((e) => e.action === "game_status"), "the owner's own call is there");
  assert.ok(!entries.some((e) => e.agent === "Intruder" || e.action === "game_results"), `an outsider's entry is in the owner's log: ${JSON.stringify(entries)}`);
  // and the outsider sees only their own calls, with no game id attached
  const mine = (await G.call("GET", `${API}/tambola/actions/list_activity`, { key: outsider.orgKey, query: {} })).json.result.entries;
  assert.ok(mine.some((e) => e.action === "game_results") && mine.every((e) => e.game_id === null || e.action !== "game_results"));
});
