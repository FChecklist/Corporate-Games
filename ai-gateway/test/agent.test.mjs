// SIMULATED AI AGENT TESTS: a scripted agent that knows no endpoints and no field names runs the full organizer and host playbooks
// against the real game code (local harness, in memory). Proves the served instructions lead from step to step with no hand-written help.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireGame, startHarness, makeGateway, makeAccount, startAtIn, API } from "./helpers.mjs";
import { ScriptedAgent } from "./agent.mjs";

let H, G, acct, allResponses = [];
const canaries = [];
before(async () => {
  if (!requireGame()) return;
  H = await startHarness();
  const audit = []; 
  G = makeGateway(H.origin, { audit: (e) => audit.push(e) });
  const origCall = G.call; G.call = async (...a) => { const r = await origCall(...a); allResponses.push(r.text); return r; };
  acct = await makeAccount(H);
});
after(() => H?.stop());

const person = (answers) => ({ answers, ask: async (f, ask) => { throw new Error(`The person was asked "${ask}" for ${f} but has no answer`); }, confirm: async (phrase) => phrase });

test("organizer playbook: create a game, set prizes, create and share the payment link, payment arrives, game is scheduled", async () => {
  const p = person({
    name: "Annual Day Game", start_at: startAtIn(3 * 3600_000), max_players: 100, calling_speed_seconds: 12, tickets: 1, rounds: 1,
    prizes: [{ house: "early5", place: 1, text: "Gift voucher worth Rs 500" }, { house: "full", place: 1, text: "Gift voucher worth Rs 1000" }],
    on: true, per_guest: 2, categories: ["colleagues"], text: "Welcome everyone. The game starts soon.", step: "start",
  });
  const agent = new ScriptedAgent({ call: G.call, key: acct.orgKey, person: p, name: "ChatGPT" });
  const done = await agent.runPlaybook("organizer_create_and_share_payment", {
    hooks: { 11: async (a) => { // a PERSON (finance) opens the payment link and pays, in TEST mode
      const pay = await H.h("pay", { url: a.results.create_payment_link.payment_link_url });
      assert.equal(pay.status, 200);
    } },
  });
  assert.deepEqual(done.map((d) => d.action), ["check_key", "list_games", "plan_start_time", "create_game", "change_settings", "set_guest_invites", "game_status", "create_payment_link", "share_payment_link", "payment_status", "announce", "live_handover"]);
  assert.equal(done.find((d) => d.action === "create_game").state, "draft");
  assert.equal(done.find((d) => d.action === "create_payment_link").state, "draft");
  assert.equal(done.at(-1).state, "scheduled", "after payment the game is scheduled and the announcement went out");
  assert.ok(agent.last.game_id);
  // the questions the agent asked all came from the API, never from the agent
  assert.ok(agent.asked.every((q) => q.ask), "every question had text supplied by the API");
  assert.equal(agent.log.filter((l) => l.code && !l.asked_confirmation).length, 0, JSON.stringify(agent.log.filter((l) => l.code)));
  assert.ok(agent.log.some((l) => l.code === "confirmation_required" && l.action === "create_payment_link"), "the payment link needed the person's confirmation first");
  global.__gameId = agent.last.game_id;
});

test("host playbook: the host watches the guests, is handed the pause page (the AI presses nothing) and finishes", async () => {
  const gameId = global.__gameId; assert.ok(gameId, "the organizer test must run first");
  const joined = await H.h("join", { eid: gameId, count: 3 }); assert.equal(joined.joined.length, 3); canaries.push(...joined.joined);
  const p = person({ game_id: gameId, text: "The next round starts in 5 minutes.", step: "pause", given: true, round: 1, house: "early5", place: 1, ticket: 1 });
  const agent = new ScriptedAgent({ call: G.call, key: acct.hostKey, person: p, name: "Gemini" });
  // answer the game_id question like the host would: the host knows the id
  const done = await agent.runPlaybook("host_runs_the_game", {
    answersByStep: { 2: { game_id: gameId } },
    hooks: { 4: async () => { await H.h("clock", { advanceMs: 120_000 }); }, 5: async () => { await H.h("clock", { advanceMs: 3 * 3600_000 + 5 * 60_000 }); } }, // time passes: the game has started
    expect: { 8: "game_refused" }, // nobody has won a prize yet (winners come from the guests' phones)
  });
  const acts = done.map((d) => d.action);
  assert.deepEqual(acts, ["check_key", "game_status", "list_guests", "announce", "game_results", "live_handover", "list_prizes", "mark_prize_given", "game_timeline"]);
  assert.equal(done.find((d) => d.action === "game_results").state, "running");
  assert.equal(agent.last.role, "host");
});

test("nothing the guests typed (names, numbers) ever came out of the gateway", async () => {
  const text = allResponses.join("\n");
  assert.ok(text.length > 1000);
  assert.equal(canaries.length, 3, "the canary guests were joined");
  for (const c of canaries) { assert.ok(!text.includes(c.guestName), "a guest name came out"); assert.ok(!text.includes(c.phone), "a guest phone number came out"); }
  assert.ok(!/Canary Guest/i.test(text), "guest names must never appear");
  assert.ok(!/\b9[0-9]{9}\b/.test(text), "no 10-digit mobile numbers");
  assert.ok(!/@acme\.example/.test(text), "no e-mail addresses");
  assert.ok(!/ct[kah]_[0-9a-f]{48}/.test(text), "no keys in any answer");
});
