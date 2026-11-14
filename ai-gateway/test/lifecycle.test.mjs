// LIFECYCLE TESTS against the real game code (local, in memory): a scripted assistant that knows no endpoint walks the GAME lifecycle,
// the ORGANIZER lifecycle and the HOST lifecycle end to end by following the served playbooks and `allowed_next_actions`; plus the two
// new actions (clone_game, retire_team_member) and the negative cases: wrong role, skipped confirmation, paying, personal data.
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { requireGame, startHarness, makeGateway, makeAccount, startAtIn, API, bundle, idem } from "./helpers.mjs";
import { ScriptedAgent, runLifecycle, paidGame } from "./agent.mjs";

const g_ = bundle.registry.games.tambola;
const lc = g_.lifecycle;
let H, G, all = [], gameCalls = [];
const canaries = [];
const HOUR = 3600_000;

before(async () => {
  if (!requireGame()) return;
  H = await startHarness();
  // every request the gateway makes to the game is written down, so the tests can prove which game routes were (never) called
  const fetchImpl = async (input, init) => { const u = new URL(typeof input === "string" ? input : input.url); gameCalls.push(`${(init?.method ?? input.method ?? "GET").toUpperCase()} ${u.pathname}`); return fetch(input, init); };
  const wide = { max: 100000, windowS: 60 }; // the rate limits have their own tests; these walks make many calls from one address
  G = makeGateway(H.origin, { fetchImpl, limits: { per_key_minute: wide, write_minute: wide, per_ip_minute: wide } });
  const origCall = G.call; G.call = async (...a) => { const r = await origCall(...a); all.push(r.text); return r; };
});
after(() => H?.stop());

const person = (answers, confirm = async (p) => p) => ({ answers, ask: async (f, ask) => { throw new Error(`The person was asked "${ask}" for ${f} but has no answer`); }, confirm });
const orgAnswers = () => ({
  name: "Annual Day Game", start_at: startAtIn(3 * HOUR), max_players: 100, calling_speed_seconds: 12, tickets: 1, rounds: 1,
  prizes: [{ house: "early5", place: 1, text: "Gift voucher worth Rs 500" }, { house: "full", place: 1, text: "Gift voucher worth Rs 1000" }],
  on: true, per_guest: 2, categories: ["colleagues"], text: "Welcome everyone. The game starts soon.", step: "start",
});
const hostAnswers = (extra = {}) => ({ text: "The next round starts in 5 minutes.", step: "pause", given: true, round: 1, house: "early5", place: 1, ticket: 1, ...extra });
const FORBIDDEN = /\/api\/(checkout|payments|proforma|invoice|credit-note|purge|owner|auth|lifecycle|inbound-email)|\/publish$|\/roster$|\/forget$|\/settle$|\/reopen$|\/reuse$|\/people$|\/waiting$|\/api\/org\/(close|keys|ai|host|cohost|role)/;

/** State changes seen between two answers about the same game must be transitions of the generated state machine. */
function assertFollowsStateMachine(done) {
  const last = {};
  for (const d of done) {
    if (!d.action || !d.game_id || !d.state) continue;
    const prev = last[d.game_id];
    if (prev && prev !== d.state) assert.ok(lc.state_machine[prev].transitions.some((t) => t.to === d.state), `${prev} -> ${d.state} (seen at step ${d.n}) is not in the state machine`);
    last[d.game_id] = d.state;
  }
}
const read = (key, id, query = {}) => G.call("GET", `${API}/tambola/actions/${id}`, { key, query });
const logOf = (agent, action) => agent.log.filter((l) => l.action === action);

test("ORGANIZER lifecycle: key, team, games, clone, erase, retire, clean-up, with persons doing the human parts", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const org = new ScriptedAgent({ call: G.call, key: acct.orgKey, person: person(orgAnswers()), name: "ChatGPT" });
  const done = await runLifecycle("organizer_lifecycle", {
    agents: { organizer: org },
    answers: { 13: { start_at: null }, 15: (a) => ({ team_ref: a.results.team_overview.hosts[0].id }) },
  });
  const acts = done.filter((d) => d.action).map((d) => d.action);
  assert.deepEqual(acts, ["check_key", "team_overview", "list_games", "plan_start_time", "create_game", "change_settings", "cancel_game_preview", "cancel_game", "erase_guest_data", "clone_game", "payment_status", "retire_team_member"]);
  assert.deepEqual(done.filter((d) => d.by === "human").map((d) => d.key), ["signin", "give_key", "add_host", "key_care", "close", "help"], "the person does these; the agent calls nothing for them");
  const st = (a) => done.find((d) => d.action === a).state;
  assert.equal(st("create_game"), "draft"); assert.equal(st("cancel_game"), "cancelled"); assert.equal(st("clone_game"), "draft");
  const clone = done.find((d) => d.action === "clone_game");
  assert.notEqual(clone.game_id, done.find((d) => d.action === "create_game").game_id, "the clone has a new game id");
  assert.equal(clone.result.needs_start_time, true, "without a start time the clone waits for one");
  assert.ok(!clone.result.paid, "a clone is never paid");
  assert.deepEqual(clone.result.rewards, done.find((d) => d.action === "change_settings").result.rewards, "the prizes of the cancelled game are copied");
  assert.equal(clone.result.rewards.length, 2);
  for (const a of ["cancel_game", "erase_guest_data", "retire_team_member"]) assert.ok(logOf(org, a).some((l) => l.asked_confirmation), `${a} asked the person to type the sentence first`);
  assert.equal(logOf(org, "create_game").filter((l) => l.asked_confirmation).length, 0, "creating a draft needs no sentence");
  assert.ok(org.log.filter((l) => l.code && !l.asked_confirmation).length === 0, JSON.stringify(org.log.filter((l) => l.code)));
  // the retired Host key stopped working at once
  const chk = await G.act(acct.hostKey, "check_key", {});
  assert.equal(chk.status, 401, "the retired host key is refused");
  // every answer told where the game stands in its life
  assert.equal(org.last.lifecycle.stage, lc.stage_of_state[org.last.state], "every answer carries the stage of its state");
  assert.ok(org.last.lifecycle.playbooks.includes("organizer_lifecycle"));
  assertFollowsStateMachine(done);
});

test("GAME lifecycle: organizer, Host, a person and the system, from the first idea to erased data and a rerun", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const org = new ScriptedAgent({ call: G.call, key: acct.orgKey, person: person(orgAnswers()), name: "ChatGPT" });
  const host = new ScriptedAgent({ call: G.call, key: acct.hostKey, person: person(hostAnswers()), name: "Gemini" });
  let gameId;
  const done = await runLifecycle("game_lifecycle", {
    agents: { organizer: org, host },
    hooks: {
      pay: async (s, ag) => { // a PERSON (finance) opens the payment link and pays on the payment page, in TEST mode
        const r = await H.h("pay", { url: ag.organizer.results.create_payment_link.payment_link_url }); assert.equal(r.status, 200);
        gameId = ag.organizer.last.game_id;
        const joined = await H.h("join", { eid: gameId, count: 3 }); canaries.push(...joined.joined);
      },
      17: async () => { await H.h("clock", { advanceMs: 3 * HOUR + 12 * 60_000 }); }, // the game starts by itself (nobody presses a start button)
      end: async () => { await H.h("clock", { advanceMs: 2 * 24 * HOUR }); },
    },
    answers: { 13: () => ({ game_id: gameId }), 16: { step: "start" }, 17: { step: "next_number" }, 18: { step: "pause" }, 28: { start_at: null } },
    expect: { 24: "game_refused" }, // nobody has won a prize: the winners come from the guests' phones
  });
  const acts = done.filter((d) => d.action).map((d) => `${d.by}:${d.action}`);
  assert.deepEqual(acts, [
    "organizer:check_key", "organizer:plan_start_time", "organizer:create_game", "organizer:change_settings", "organizer:set_guest_invites", "organizer:game_status",
    "organizer:create_payment_link", "organizer:share_payment_link", "organizer:payment_status", "organizer:game_status",
    "host:check_key", "host:game_status", "host:list_guests", "host:announce", "host:live_handover", "host:live_handover", "host:live_handover", "organizer:list_game_control_requests", "host:game_results",
    "host:list_prizes", "host:mark_prize_given", "organizer:report_link_status", "organizer:game_timeline", "organizer:erase_guest_data", "organizer:clone_game", "organizer:game_status",
  ]);
  assert.deepEqual(done.filter((d) => !d.action).map((d) => d.key), ["pay", "approve", "end"], "payment, the person pressing a live button and the end are never done by an agent");
  const at = (n) => done.find((d) => d.n === n);
  assert.equal(at(3).state, "draft"); assert.equal(at(10).state, "scheduled", "paid and scheduled"); assert.equal(at(11).state, "scheduled");
  assert.equal(at(21).state, "running", "the game started by itself"); assert.equal(at(23).state, "ended");
  assert.equal(at(20).result.requests.length, 0, "the AI filed no pause request: nothing was paused or stopped by the AI");
  assert.equal(at(16).result.clock_run, true); assert.equal(at(16).result.press, null, "there is no start button to press"); assert.equal(at(17).result.clock_run, true);
  assert.equal(at(18).result.ai_presses, false); assert.equal(at(18).result.press, "pause"); assert.ok(at(18).result.handover_url.includes("/zc.html?e="), "the console page address comes from the game");
  assert.equal(at(28).state, "draft"); assert.equal(at(28).result.needs_start_time, true); assert.notEqual(at(28).game_id, gameId, "the rerun is a new game");
  assert.equal(at(29).game_id, at(28).game_id);
  assert.equal(host.last.role, "host");
  assert.ok(host.last.say_to_host && host.last.say_to_host === host.last.say_to_organizer, "a Host gets say_to_host");
  assert.equal(org.last.say_to_host, undefined, "an organizer does not");
  assert.ok(host.last.lifecycle && ["live", "post_game", "ready"].includes(host.last.lifecycle.stage));
  assertFollowsStateMachine(done);
  assert.ok(logOf(org, "create_payment_link").some((l) => l.asked_confirmation) && logOf(org, "erase_guest_data").some((l) => l.asked_confirmation));
  assert.equal(org.log.filter((l) => l.code && !l.asked_confirmation).length, 0, JSON.stringify(org.log.filter((l) => l.code)));
});

test("HOST lifecycle: receive the key, open the game, check, run, finish, and the organizer retires the key", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn });
  const joined = await H.h("join", { eid: gameId, count: 3 }); canaries.push(...joined.joined);
  const host = new ScriptedAgent({ call: G.call, key: acct.hostKey, person: person(hostAnswers()), name: "Grok" });
  let retired = false;
  const done = await runLifecycle("host_lifecycle", {
    agents: { host },
    hooks: {
      6: async () => { await H.h("clock", { advanceMs: 120_000 }); }, // the game spaces two messages
      7: async () => { await H.h("clock", { advanceMs: 3 * HOUR + 10 * 60_000 }); }, // the game starts by itself
      end: async () => { await H.h("clock", { advanceMs: 2 * 24 * HOUR }); },
      retire: async () => { // the organizer's own AI retires the Host (a person types the sentence)
        const o = new ScriptedAgent({ call: G.call, key: acct.orgKey, person: person({}), name: "ChatGPT" });
        await o.runStep({ n: 0, action: "check_key" });
        await o.runStep({ n: 0, action: "team_overview" });
        await o.runStep({ n: 0, action: "retire_team_member" }, { answers: { team_ref: o.results.team_overview.hosts[0].id } });
        assert.ok(logOf(o, "retire_team_member").some((l) => l.asked_confirmation));
        retired = true;
      },
    },
    answers: { 3: { game_id: gameId }, 7: { step: "start" }, 9: { step: "pause" } },
    expect: { 15: "game_refused" },
  });
  assert.deepEqual(done.filter((d) => d.action).map((d) => d.action), ["check_key", "game_status", "list_guests", "game_timeline", "announce", "live_handover", "game_status", "live_handover", "game_results", "list_prizes", "mark_prize_given", "report_link_status", "game_timeline"]);
  assert.deepEqual(done.filter((d) => !d.action).map((d) => d.key), ["host_added", "approve", "dispute", "end", "handover", "retire"]);
  assert.equal(done.find((d) => d.n === 3).state, "scheduled");
  assert.equal(done.find((d) => d.n === 8).state, "running");
  assert.equal(done.find((d) => d.n === 14).state, "ended");
  assert.equal(host.last.role, "host");
  assert.ok(retired);
  const after = await G.act(acct.hostKey, "check_key", {});
  assert.equal(after.status, 401, "the Host key stopped working");
  assertFollowsStateMachine(done);
});

test("clone_game: a new draft with the same settings and prizes; payment, date and guests are not copied; a Host cannot; another organizer's game is refused", async () => {
  await H.h("reset");
  const acct = await makeAccount(H), other = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn, name: "Clone Source" });
  const src = await read(acct.orgKey, "game_status", { game_id: gameId });
  assert.equal(src.json.state, "scheduled");
  const c1 = await G.act(acct.orgKey, "clone_game", { game_id: gameId }, { headers: { "idempotency-key": idem() } });
  assert.equal(c1.status, 200, c1.text);
  assert.equal(c1.json.state, "draft"); assert.notEqual(c1.json.game_id, gameId);
  assert.equal(c1.json.result.cloned_from, gameId); assert.equal(c1.json.result.needs_start_time, true); assert.equal(c1.json.result.startPending, true);
  assert.deepEqual(c1.json.result.rewards, src.json.result.rewards, "prizes are copied");
  assert.equal(c1.json.result.name, "Clone Source"); assert.equal(c1.json.result.limit, src.json.result.limit);
  assert.ok(!c1.json.result.paid, "payment is never copied");
  assert.ok(c1.json.say_to_organizer.includes("start time"), c1.json.say_to_organizer);
  assert.ok(c1.json.allowed_next_actions.some((a) => a.action === "change_settings"));
  assert.ok(!JSON.stringify(c1.json).includes("openUrl"), "no game link beyond the whitelisted fields");
  // with a start time the clone is ready to be paid
  const c2 = await G.act(acct.orgKey, "clone_game", { game_id: gameId, start_at: startAtIn(5 * HOUR) }, { headers: { "idempotency-key": idem() } });
  assert.equal(c2.status, 200, c2.text); assert.equal(c2.json.result.needs_start_time, false); assert.ok(!c2.json.result.startPending);
  // the same Idempotency-Key does not make a second draft
  const k = idem(), t6 = startAtIn(6 * HOUR);
  const r1 = await G.act(acct.orgKey, "clone_game", { game_id: gameId, start_at: t6 }, { headers: { "idempotency-key": k } });
  const r2 = await G.act(acct.orgKey, "clone_game", { game_id: gameId, start_at: t6 }, { headers: { "idempotency-key": k } });
  assert.equal(r1.status, 200, r1.text); assert.equal(r2.status, 200, r2.text);
  assert.equal(r2.headers.get("idempotent-replay"), "true"); assert.equal(r2.json.game_id, r1.json.game_id);
  // a Host cannot (the game itself refuses a Host key behind an AI link too), and the guest list cannot ride along
  const hostTry = await G.act(acct.hostKey, "clone_game", { game_id: gameId });
  assert.equal(hostTry.status, 403); assert.equal(hostTry.json.error.code, "role_not_allowed");
  const people = await G.act(acct.orgKey, "clone_game", { game_id: gameId, with_people: true });
  assert.equal(people.status, 400); assert.equal(people.json.error.code, "invalid_input");
  const people2 = await G.act(acct.orgKey, "clone_game", { game_id: gameId, withPeople: true });
  assert.equal(people2.status, 400);
  // somebody else's game
  const theirs = await G.act(other.orgKey, "clone_game", { game_id: gameId });
  assert.ok(theirs.status >= 400 && !theirs.json.ok, "another organizer cannot clone this game");
  const list = await read(other.orgKey, "list_games", {});
  assert.equal((list.json.result.engagements ?? []).length, 0, "nothing was made for the other organizer");
});

test("retire_team_member: typed sentence first, then the key stops at once; wrong role, wrong sentence, wrong token and bad input are refused", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const team = await read(acct.orgKey, "team_overview", {});
  const ref = team.json.result.hosts[0].id;
  assert.match(ref, /^[0-9a-f]{10}$/, "team_overview gives the id that retire needs");
  assert.ok(!JSON.stringify(team.json).includes("@"), "no e-mail address in the team answer");
  // a host may not retire anybody
  const hostTry = await G.act(acct.hostKey, "retire_team_member", { team_ref: ref }, { headers: { "idempotency-key": idem() } });
  assert.equal(hostTry.status, 403); assert.equal(hostTry.json.error.code, "role_not_allowed");
  // bad input: not a team id (an e-mail address is refused as personal data or as a bad value)
  const bad = await G.act(acct.orgKey, "retire_team_member", { team_ref: "host1@acme.example" }, { headers: { "idempotency-key": idem() } });
  assert.equal(bad.status, 400); assert.ok(["invalid_input", "personal_data_refused"].includes(bad.json.error.code));
  // skipped confirmation
  const first = await G.act(acct.orgKey, "retire_team_member", { team_ref: ref }, { headers: { "idempotency-key": idem() } });
  assert.equal(first.status, 409); assert.equal(first.json.error.code, "confirmation_required");
  assert.equal(first.json.error.details.confirm_phrase, `RETIRE TEAM MEMBER ${ref}`);
  assert.equal((await G.act(acct.hostKey, "check_key", {})).status, 200, "nothing was retired yet");
  const wrong = await G.act(acct.orgKey, "retire_team_member", { team_ref: ref, confirm: { phrase: "yes", token: first.json.error.details.confirmation_token } }, { headers: { "idempotency-key": idem() } });
  assert.equal(wrong.status, 409);
  const forged = await G.act(acct.orgKey, "retire_team_member", { team_ref: ref, confirm: { phrase: first.json.error.details.confirm_phrase, token: "0".repeat(40) } }, { headers: { "idempotency-key": idem() } });
  assert.equal(forged.status, 409); assert.equal(forged.json.error.code, "confirmation_invalid");
  assert.equal((await G.act(acct.hostKey, "check_key", {})).status, 200, "still not retired");
  // the real thing
  const ok = await G.act(acct.orgKey, "retire_team_member", { team_ref: ref, confirm: { phrase: first.json.error.details.confirm_phrase, token: first.json.error.details.confirmation_token } }, { headers: { "idempotency-key": idem() } });
  assert.equal(ok.status, 200, ok.text); assert.equal(ok.json.result.revoked, 1);
  assert.equal((await G.act(acct.hostKey, "check_key", {})).status, 401, "the Host key stopped at once");
  const again = await G.act(acct.orgKey, "retire_team_member", { team_ref: ref, confirm: { phrase: first.json.error.details.confirm_phrase, token: first.json.error.details.confirmation_token } }, { headers: { "idempotency-key": idem() } });
  assert.ok(again.status >= 400 && !again.json.ok, "a retired member cannot be retired twice");
});

test("NEGATIVE: wrong role. A Host key is refused for every organizer-only step; no action exists to pay, publish or settle", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn });
  const organizerOnly = g_.actions.filter((a) => !a.roles.includes("host")).map((a) => a.id);
  assert.ok(organizerOnly.includes("clone_game") && organizerOnly.includes("retire_team_member") && organizerOnly.includes("team_overview"));
  for (const id of organizerOnly) {
    const r = await G.act(acct.hostKey, id, { game_id: gameId, team_ref: "0123456789", name: "X", start_at: startAtIn(HOUR), max_players: 10 }, { headers: { "idempotency-key": idem() } });
    assert.ok([400, 403].includes(r.status), `${id} with a host key answered ${r.status}`);
    if (r.status === 403) assert.equal(r.json.error.code, "role_not_allowed", id);
  }
  for (const id of ["pay", "pay_game", "checkout", "publish", "publish_game", "settle", "call_number", "claim", "approve_claim", "request_game_control", "start_game", "pause_game", "resume_game", "stop_game", "next_number", "draw_now", "close_account", "revoke_key", "add_host", "load_guests"]) {
    const r = await G.act(acct.orgKey, id, {}, {});
    assert.equal(r.status, 404, `${id} must not exist`); assert.equal(r.json.error.code, "unknown_action");
  }
  const noKey = await G.call("POST", `${API}/tambola/actions/game_status`, { body: { game_id: gameId } });
  assert.equal(noKey.status, 401);
});

test("NEGATIVE: skipped confirmation. The person who declines stops the step; nothing happens without the typed sentence", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const org = new ScriptedAgent({ call: G.call, key: acct.orgKey, person: person(orgAnswers(), async () => null), name: "ChatGPT" });
  await org.runStep({ n: 1, action: "check_key" });
  await org.runStep({ n: 2, action: "create_game" });
  const gameId = org.last.game_id;
  await org.runStep({ n: 3, action: "cancel_game" }, { expect: "confirmation_required" });
  assert.ok(logOf(org, "cancel_game").some((l) => l.person_declined), "the person declined");
  const s = await read(acct.orgKey, "game_status", { game_id: gameId });
  assert.equal(s.json.state, "draft", "the game was not cancelled");
  // erase and payment link need the sentence too
  for (const id of ["cancel_game", "erase_guest_data", "create_payment_link"]) {
    const r = await G.act(acct.orgKey, id, { game_id: gameId }, { headers: { "idempotency-key": idem() } });
    assert.equal(r.status, 409, id); assert.equal(r.json.error.code, "confirmation_required", id);
  }
  assert.equal((await read(acct.orgKey, "game_status", { game_id: gameId })).json.state, "draft");
});

test("NEGATIVE: personal data. Names, numbers and e-mails are refused wherever they could go, and the guest list never rides along", async () => {
  await H.h("reset");
  const acct = await makeAccount(H);
  const { gameId } = await paidGame({ H, call: G.call, key: acct.orgKey, startAtIn });
  const k = () => ({ headers: { "idempotency-key": idem() } });
  const cases = [
    ["announce", { game_id: gameId, text: "Call Asha Rao on 9876543210" }],
    ["announce", { game_id: gameId, text: "Mail asha.rao@acme.example now" }],
    ["change_settings", { game_id: gameId, prizes: [{ house: "full", place: 1, text: "Voucher for asha.rao@acme.example" }] }],
    ["create_game", { name: "Game for 9876543210", start_at: startAtIn(5 * HOUR), max_players: 10 }],
  ];
  for (const [id, body] of cases) { const r = await G.act(acct.orgKey, id, body, k()); assert.equal(r.status, 400, `${id}: ${r.text.slice(0, 200)}`); assert.equal(r.json.error.code, "personal_data_refused", id); }
  for (const [id, body] of [["clone_game", { game_id: gameId, with_people: true }], ["clone_game", { game_id: gameId, withPeople: true }], ["clone_game", { game_id: gameId, guests: ["Asha"] }], ["set_guest_invites", { game_id: gameId, on: true, per_guest: 1, categories: ["colleagues"], people: ["Asha"] }], ["mark_prize_given", { game_id: gameId, round: 1, house: "early5", place: 1, ticket: 1, given: true, winner_name: "Asha" }]]) {
    const r = await G.act(acct.orgKey, id, body, k()); assert.equal(r.status, 400, `${id} ${JSON.stringify(body)}`); assert.equal(r.json.error.code, "invalid_input");
  }
});

test("NEGATIVE: paying. No step pays; the only payment is the human hook; the gateway never called a payment, publishing, guest-list or account route", async () => {
  const calls = gameCalls.filter((c) => !c.includes("/__h/"));
  assert.ok(calls.length > 100, `the walks made game calls (${calls.length})`);
  const bad = calls.filter((c) => FORBIDDEN.test(c.split(" ")[1]));
  assert.deepEqual(bad, [], "forbidden game routes called by the gateway");
  assert.ok(!calls.some((c) => /\/paylink\//.test(c) && c.startsWith("POST")), "the pay page of the game is never posted to by the gateway");
  const only = new Set(calls.filter((c) => c.startsWith("POST")).map((c) => c.split(" ")[1].replace(/^(\/api\/z\/)[A-Za-z0-9_-]{3,40}/, "$1{id}")));
  const allowedPosts = new Set(["/api/z", "/api/z/{id}/settings", "/api/z/{id}/paylink", "/api/z/{id}/cancel", "/api/z/{id}/erase", "/api/z/{id}/announce", "/api/z/{id}/prizegiven", "/api/z/{id}/clone", "/api/org/team/retire"]);
  for (const p of only) assert.ok(allowedPosts.has(p), `unexpected POST to the game: ${p}`);
  const pay = lc.state_machine.draft.transitions.find((t) => t.to === "scheduled");
  assert.equal(pay.by, "human");
});

test("nothing the guests typed (names, numbers) and no key ever came out of the gateway during the lifecycle walks", () => {
  const text = all.join("\n");
  assert.ok(text.length > 20000);
  assert.equal(canaries.length, 6, "canary guests were joined in two walks");
  for (const c of canaries) { assert.ok(!text.includes(c.guestName), "a guest name came out"); assert.ok(!text.includes(c.phone), "a guest phone number came out"); }
  assert.ok(!/@acme\.example/.test(text), "no e-mail addresses");
  assert.ok(!/ct[kah]_[0-9a-f]{24,}/.test(text), "no keys in any answer");
});

test("the lifecycle address and the stage FAQ are served", async () => {
  const r = await G.call("GET", `${API}/tambola/lifecycle`);
  assert.equal(r.status, 200); assert.equal(r.json.lifecycle.matrix.length, lc.matrix.length);
  assert.ok(r.json.lifecycle.state_machine.running && r.json.lifecycle.gap_summary.game_change.length);
  const f = await G.call("GET", `${API}/tambola/faq`);
  assert.ok(f.json.stage_faq.length >= 30 && f.json.stage_faq.every((x) => x.stage && x.role && x.q && x.a));
  const pb = await G.call("GET", `${API}/tambola/playbooks`);
  assert.deepEqual(pb.json.playbooks.filter((p) => p.lifecycle).map((p) => p.id).sort(), ["game_extras_and_recovery", "game_lifecycle", "host_lifecycle", "organizer_lifecycle", "organizer_safer_key"]);
});
