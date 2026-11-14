// THE AI HAND-OVER RULE (the owner's fixed rule), proven without starting any game:
//   1. before the game starts the AI does the work (except payment);
//   2. live steps (start, pause, resume, stop, next number, draw now, approve or decide a claim) are never pressed by the AI: it hands over the game's own page and says what to press;
//   3. the AI never pays; payment goes only through the game's own payment link and page;
//   4. human-only steps (publish consent, a new Host's e-mail and mobile, anything with paying) stay human.
// These tests FAIL if any AI-callable path presses a live action or pays.
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { bundle } from "./helpers.mjs";
import { handOver, say } from "../games/tambola/runtime.mjs";

const reg = bundle.registry;
const g = reg.games.tambola;
const read = (f) => fs.readFileSync(new URL(`../generated/${f}`, import.meta.url), "utf8");

// The only game routes the gateway may WRITE to (POST, PATCH...). Everything else it calls is a read.
// A new write route in an adapter must be added here on purpose, with the owner's rule in mind.
// Pairs of (action, route): another action may NOT quietly start calling a write route that was approved for a different action.
const WRITE_PAIRS_ALLOWED = {
  create_game: ["create"], change_settings: ["settings"], set_guest_invites: ["settings"], change_extra_settings: ["settings"], create_payment_link: ["paylink_create"], cancel_game: ["cancel"],
  mark_prize_given: ["prizegiven"], announce: ["announce"], erase_guest_data: ["erase"], clone_game: ["clone"], retire_team_member: ["team_retire"], reopen_game: ["reopen"], request_fresh_ai_key: ["ai_fresh"],
};
const LIVE_PATH = /\/(control|claim|claims|call|draw|start|pause|resume|stop|end|settle|override|rehearsal|rehearsalclose|bogey|won|over|vote|next)(\/|$|\?)/;
const PAY_PATH = /\/api\/(checkout|payments|credit|proforma)|pay-with-credit|\/pay(\/|$)|\/publish$|\/forget$/;

test("RULE TEXT: the four-point rule is in the registry, the first-read page, the short index, the OpenAPI file, every game's do_not and the FAQ", () => {
  assert.equal(reg.hand_over_rule.name, "AI hand-over rule");
  assert.equal(reg.hand_over_rule.points.length, 4);
  const [before, live, pay, human] = reg.hand_over_rule.points;
  assert.match(before, /BEFORE the game starts/); assert.match(before, /except payment/);
  assert.match(live, /LIVE actions/); for (const w of ["start the game", "pause", "next number", "draw now", "claim"]) assert.ok(live.includes(w), `live rule names ${w}`);
  assert.match(live, /never pressed by the AI/); assert.match(live, /no button to press/);
  assert.match(pay, /never pays/); assert.match(pay, /home site/);
  assert.match(human, /publishing consent/); assert.match(human, /Host's e-mail and mobile/);
  const ai = read("ai.md"), llms = read("llms.txt"), openapi = JSON.parse(read("openapi.json"));
  for (const [name, text] of [["/ai", ai], ["/llms.txt", llms]]) { assert.ok(text.includes("AI hand-over rule"), `${name} names the rule`); for (const p of reg.hand_over_rule.points) assert.ok(text.includes(p), `${name} carries every point of the rule`); }
  assert.ok(ai.indexOf("AI hand-over rule") < ai.indexOf("The rules that never change"), "the rule comes before the other rules");
  assert.ok(llms.indexOf("AI hand-over rule") < llms.indexOf("Rules in one breath"));
  assert.ok(openapi.info.description.includes("AI HAND-OVER RULE") && openapi.info["x-ai-hand-over-rule"].length === 4);
  assert.match(reg.do_not_global[0], /^AI HAND-OVER RULE/); assert.match(g.do_not[0], /^AI HAND-OVER RULE/, "the game's own do_not list starts with the rule: every answer carries it");
  assert.ok(g.faq.some((f) => /hand-over rule/.test(f.q)), "the FAQ explains the rule");
  assert.ok(!/we |\bus\b| our /i.test(JSON.stringify([reg.hand_over_rule, g.do_not[0]])), "the system, not 'we'");
});

test("NO LIVE ACTION: no AI-callable action presses start, pause, resume, stop, next number, draw now or a claim, and the old pause-request action is gone", () => {
  assert.ok(!g.actions.some((a) => a.id === "request_game_control"), "the AI no longer files a pause, resume or stop request");
  assert.ok(!g.routes.control_request, "the route that files a request is not used at all");
  for (const a of g.actions) {
    assert.ok(!/^(start|pause|resume|stop|end_game|next_number|draw|approve|reject|decide|call_|claim|settle|bogey)/.test(a.id), `${a.id} sounds like a live action`);
    for (const c of a.calls) {
      const r = g.routes[c];
      if (r.method === "GET") continue;
      assert.ok(WRITE_PAIRS_ALLOWED[a.id]?.includes(c), `${a.id} writes to ${c} (${r.method} ${r.path}), which is not an approved (action, route) pair`);
      assert.ok(!LIVE_PATH.test(r.path.replace("{game_id}", "X")), `${a.id}: ${r.path} looks like a live action`);
    }
  }
  for (const [id, routes] of Object.entries(WRITE_PAIRS_ALLOWED)) { const a = g.actions.find((x) => x.id === id); assert.ok(a, id); for (const c of routes) assert.ok(a.calls.includes(c), `${id} should call ${c}`); }
});

test("NO PAYMENT: no action calls a payment, checkout, credit or publish route; the payment link needs a typed sentence; nothing is named pay", () => {
  for (const a of g.actions) {
    assert.ok(!/^pay_|^make_payment|^checkout|^charge|^publish/.test(a.id), `${a.id} sounds like a payment or a publish`);
    for (const c of a.calls) assert.ok(!PAY_PATH.test(g.routes[c].path.replace("{game_id}", "X").replace("{token}", "0".repeat(48))) || c === "paylink_read", `${a.id} calls ${g.routes[c].path}`);
  }
  const create = g.actions.find((a) => a.id === "create_payment_link");
  assert.ok(create.confirm?.phrase && create.idempotency === "required", "creating the pay link needs the person's typed sentence and an Idempotency-Key");
  assert.equal(create.ai_key, false, "the limited AI key cannot even make the payment link");
  assert.match(JSON.stringify(g.common_actions), /The AI never pays/);
});

test("HAND-OVER ACTION: live_handover is read-only, needs no confirmation, calls only reads, and is offered to the organizer and the Host before the start and while the game runs", () => {
  const a = g.actions.find((x) => x.id === "live_handover");
  assert.ok(a, "live_handover exists");
  assert.equal(a.kind, "read"); assert.ok(!a.confirm); assert.deepEqual(a.roles.slice().sort(), ["host", "organizer"]);
  for (const c of a.calls) assert.equal(g.routes[c].method, "GET");
  assert.deepEqual(a.inputs.properties.step.enum, ["start", "pause", "resume", "stop", "next_number", "draw_now", "decide_claim"], "every live step the owner named can be asked about");
  for (const st of ["scheduled", "running"]) for (const role of ["organizer", "host"]) assert.ok(g.state_actions[st][role].includes("live_handover"), `live_handover is offered to the ${role} when the game is ${st}`);
  assert.equal(a.ai_key, true, "even the limited AI key may ask for the hand-over: it presses nothing");
});

test("LIFECYCLES: every live step of the playbooks and the state machine is a hand-over (no action that presses), and a step that is the person's own stays human", () => {
  const lc = g.lifecycle;
  for (const pb of g.playbooks) for (const s of pb.steps) {
    if (!s.action) continue;
    assert.ok(!/control|pause|resume|stop|start_game|draw|claim|settle/.test(s.action) || s.action === "list_game_control_requests", `playbook ${pb.id} step ${s.n} calls ${s.action}`);
  }
  const liveSteps = g.playbooks.flatMap((pb) => pb.steps.filter((s) => s.action === "live_handover"));
  assert.ok(liveSteps.length >= 6, "the game, host and organizer playbooks all hand over live steps");
  for (const s of liveSteps) { assert.ok(s.ask?.some((q) => /live step/i.test(q)), "the step asks which live step it is"); assert.ok(/press|watch|page/i.test(s.say), `step ${s.n} tells the AI to hand over the page`); }
  for (const [state, sm] of Object.entries(lc.state_machine)) for (const t of sm.transitions) assert.ok(t.via !== "request_game_control", `${state} still uses the old pause request`);
  const running = lc.state_machine.running.transitions;
  assert.ok(running.some((t) => t.via === "live_handover" && t.to === "running"), "while running, the hand-over changes nothing");
  assert.ok(running.some((t) => t.by === "human" && /presses stop/.test(t.via)), "a person presses stop");
  for (const id of ["G25", "G26", "G27"]) assert.ok(lc.matrix.find((r) => r.id === id), id);
  for (const id of ["G28", "H12", "H17"]) assert.equal(lc.matrix.find((r) => r.id === id).action, "live_handover", `${id} is a hand-over`);
  assert.equal(lc.matrix.find((r) => r.id === "G29").status, "HUMAN", "pressing pause, resume or stop is a human step");
  for (const id of ["G16", "G19"]) assert.equal(lc.matrix.find((r) => r.id === id).status, "HUMAN", `${id} (pay, publish) stays human`);
  assert.ok(lc.matrix.find((r) => r.id === "G27").status === "NOT_APPLICABLE" || lc.matrix.find((r) => r.id === "G27").status === "AUTOMATIC", "a claim is decided by the guests' phones, not approved by anyone");
});

test("handOver (pure): it never invents a button and never denies one: host-calling mode hands over the Host's Next number; a game above the pause limit has no pause", () => {
  const urls = { consoleUrl: "https://game.example/zc.html?e=ABC", watchUrl: "https://game.example/big.html?e=ABC" };
  const host = handOver("next_number", { role: "organizer", ...urls, callMode: "host" });
  assert.equal(host.result.ai_presses, false); assert.equal(host.result.clock_run, false); assert.equal(host.result.press, "next number"); assert.match(host.say, /host-calling mode/); assert.ok(!/There is no next-number button/.test(host.say), host.say);
  assert.match(host.say, /^Tell the organizer: this game is in host-calling mode, so you or a Host press Next number/, "the organizer can press it too: the game's own console says so"); assert.ok(host.say.includes(urls.consoleUrl));
  assert.match(handOver("next_number", { role: "host", ...urls, callMode: "host" }).say, /^Tell the Host: this game is in host-calling mode, so you press Next number yourself/);
  assert.match(handOver("start", { ...urls, callMode: "host" }).say, /Host presses Next number for every number/, "start is still by the clock, but the text does not hide the Host's button");
  for (const step of ["pause", "resume", "stop"]) {
    const big = handOver(step, { ...urls, limit: 2500, pauseMax: 2000 });
    assert.equal(big.result.press, null, "no pause button exists for a game this size"); assert.equal(big.result.handover_url, null); assert.match(big.say, /no pause, resume or stop/); assert.ok(!/press (pause|resume|stop)/.test(big.say));
    const small = handOver(step, { ...urls, limit: 2000, pauseMax: 2000 }); assert.ok(small.result.press.startsWith(step), "exactly at the limit the game still has them");
    const unknown = handOver(step, { ...urls, limit: NaN, pauseMax: NaN }); assert.ok(unknown.result.press.startsWith(step), "an unknown size does not remove a button");
  }
  assert.ok(reg.games.tambola.game_rules.constants.pause_max_participants >= 1000, "the pause limit comes from the game's own code, not from a number typed here");
});

test("CONFLICTS: the game's public fact 'cannot pause or stop' no longer conflicts with the gateway, because the AI neither pauses nor stops", () => {
  const phrases = (g.fact_conflicts ?? []).map((c) => c.phrase);
  assert.ok(!phrases.includes("pause or stop the game"), JSON.stringify(phrases));
  assert.ok(!/file a request to pause or stop/.test(JSON.stringify(g.faq)), "the FAQ no longer says the AI files a pause request");
});

test("handOver (pure): clock-run steps have no button, no address to press and a page to watch; pause, resume and stop point to the console and say what to press", () => {
  const urls = { consoleUrl: "https://game.example/zc.html?e=ABC", watchUrl: "https://game.example/big.html?e=ABC" };
  for (const step of ["start", "next_number", "draw_now", "decide_claim"]) {
    const h = handOver(step, { role: "organizer", ...urls });
    assert.equal(h.result.ai_presses, false); assert.equal(h.result.clock_run, true); assert.equal(h.result.press, null, `${step}: no button is invented`); assert.equal(h.result.handover_url, null);
    assert.equal(h.result.watch_url, urls.watchUrl); assert.ok(h.say.includes(urls.watchUrl)); assert.match(h.say, /There is no /); assert.match(h.say, /presses nothing and invents no button/);
    assert.ok(!/press (the|a) /.test(h.say.replace("presses nothing", "")), `${step}: ${h.say}`);
  }
  // Start by hand: a person presses Start (organizer or Host), the AI never does, and nothing says "there is no start button"
  for (const role of ["organizer", "host"]) {
    const h = handOver("start", { role, ...urls, startMode: "manual" });
    assert.equal(h.result.ai_presses, false); assert.equal(h.result.clock_run, false); assert.equal(h.result.press, "Start"); assert.equal(h.result.handover_url, urls.consoleUrl);
    assert.match(h.say, /Start by hand/); assert.match(h.say, /cannot and does not press it/); assert.ok(!/There is no start button/.test(h.say), h.say);
  }
  for (const step of ["pause", "resume", "stop"]) {
    const o = handOver(step, { role: "organizer", ...urls }), hs = handOver(step, { role: "host", ...urls });
    assert.equal(o.result.ai_presses, false); assert.equal(o.result.clock_run, false); assert.equal(o.result.handover_url, urls.consoleUrl); assert.ok(o.result.press.startsWith(step));
    assert.ok(o.say.includes(urls.consoleUrl) && o.say.includes(`press ${o.result.press}`) && /files nothing/.test(o.say), o.say);
    assert.match(hs.say, /^Tell the Host: press it on your own Host page/); assert.ok(hs.say.includes(urls.consoleUrl)); assert.ok(!/only the organizer can/.test(hs.say), "a Host's own browser can press it too");
  }
  assert.match(handOver("stop", urls ? { consoleUrl: urls.consoleUrl } : {}).result.press, /cannot be undone/);
  const draft = handOver("start", { consoleUrl: urls.consoleUrl }); assert.equal(draft.result.watch_url, null); assert.match(draft.say, /appears once the game is published and paid/);
  const noPage = handOver("pause", {}); assert.equal(noPage.result.handover_url, null); assert.match(noPage.say, /ask the organizer to open their console/);
  for (const h of [handOver("start", urls), handOver("pause", urls), handOver("pause", { role: "host", ...urls })]) assert.ok(!/\bwe\b|\bour\b|\bus\b/i.test(h.say), "the system, not 'we'");
  assert.equal(say("live_handover", "running", { say_text: "x" }), "x");
});
