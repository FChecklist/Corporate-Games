// LIFECYCLE COVERAGE (no game process needed): the generated state machine, coverage matrix, playbooks, FAQ and the docs agree with each other,
// with the hypermedia table and with the owner's rules. The generator already refuses most of this; these tests say it again from the outside.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { bundle, ROOT } from "./helpers.mjs";

const g = bundle.registry.games.tambola;
const lc = g.lifecycle;
const doc = (f) => readFileSync(resolve(ROOT, "docs", f), "utf8");
const actionIds = new Set(g.actions.map((a) => a.id));

test("the state machine covers every state, every transition leads to a known state, and every state can be reached from the start", () => {
  assert.deepEqual(Object.keys(lc.state_machine).sort(), Object.keys(g.states).sort());
  for (const [st, sm] of Object.entries(lc.state_machine)) {
    assert.ok(sm.transitions.length > 0, `${st} has transitions`);
    for (const t of sm.transitions) assert.ok(t.to in g.states, `${st} -> ${t.to}`);
    assert.ok(lc.stage_of_state[st], `${st} has a stage`);
  }
  const seen = new Set(["no_game"]); const todo = ["no_game"];
  while (todo.length) { const s = todo.pop(); for (const t of lc.state_machine[s].transitions) if (!seen.has(t.to)) { seen.add(t.to); todo.push(t.to); } }
  assert.deepEqual([...seen].sort(), Object.keys(g.states).sort(), "every state is reachable");
  for (const [st, sm] of Object.entries(lc.state_machine)) if (!sm.terminal) assert.ok(sm.transitions.some((t) => t.to !== st), `${st} is not final, so it must lead somewhere`);
});

test("every transition by this API is an action that the role is really offered in that state", () => {
  for (const [st, sm] of Object.entries(lc.state_machine)) for (const t of sm.transitions) {
    if (/^(human|system): /.test(t.via)) { assert.ok(t.via.startsWith(t.by + ":")); continue; }
    for (const role of Array.isArray(t.by) ? t.by : [t.by]) {
      assert.ok(actionIds.has(t.via), t.via);
      assert.ok(g.actions.find((a) => a.id === t.via).roles.includes(role), `${t.via} is not for ${role}`);
      const offered = (g.state_actions[st]?.[role] ?? []).includes(t.via) || (lc.always_actions[role] ?? []).includes(t.via);
      assert.ok(offered, `${st}: ${t.via} must be offered to the ${role}`);
    }
  }
});

test("the AI never pays, never publishes and never decides winners: those transitions are by a person or the system", () => {
  const byApi = lc.state_machine.draft.transitions.filter((t) => !/^(human|system): /.test(t.via)).map((t) => t.via);
  assert.ok(!byApi.some((v) => /pay$|publish|settle|winner/.test(v) && v !== "create_payment_link"), byApi.join());
  const pay = lc.state_machine.draft.transitions.find((t) => t.to === "scheduled");
  assert.equal(pay.by, "human");
  assert.ok(/pays/.test(pay.via));
  const stop = lc.state_machine.running.transitions.find((t) => t.to === "ended" && t.by === "human");
  assert.ok(stop, "stopping a running game is approved by a person");
});

test("the coverage matrix: every action, every stage, every role; every GAP says who solves it and names a decision", () => {
  for (const a of g.actions) assert.ok(lc.matrix.some((r) => r.action === a.id), `${a.id} is in the matrix`);
  for (const [l, stages] of Object.entries(lc.stages)) for (const s of stages) {
    assert.ok(lc.matrix.some((r) => r.lifecycle === l && r.stage === s.id), `${l}/${s.id} has rows`);
    assert.ok(lc.faq.some((f) => f.lifecycle === l && f.stage === s.id), `${l}/${s.id} has FAQ`);
  }
  const ids = lc.matrix.map((r) => r.id); assert.equal(new Set(ids).size, ids.length, "row ids are unique");
  for (const r of lc.matrix) {
    assert.ok(r.status in lc.statuses, r.id);
    if (r.status === "READY") assert.ok(r.action || r.via, `${r.id} READY needs an action`);
    else assert.ok(!r.action, `${r.id}: only READY rows name an action`);
    if (r.status === "GAP") { assert.ok(["gateway_only", "game_change"].includes(r.solve), r.id); assert.ok(lc.decisions[r.decision], `${r.id} names decision ${r.decision}`); }
    for (const role of r.roles.filter((x) => x === "organizer" || x === "host")) if (r.action && r.action !== "check_key") assert.ok(g.actions.find((a) => a.id === r.action).roles.includes(role), `${r.id}: ${r.action} for ${role}`);
  }
  // nothing invented: a gap the game itself could answer names a route that exists; a gap that needs a game change names no route
  for (const r of lc.matrix.filter((x) => x.status === "GAP" && x.solve === "game_change")) assert.ok(!r.game_route, `${r.id}: a game_change gap cannot have a route (the route would not be missing)`);
  for (const r of lc.matrix.filter((x) => x.status === "GAP" && x.solve === "gateway_only" && x.decision !== "D28")) assert.ok(r.game_route, `${r.id}: a gateway_only gap names the existing game route`);
  // routes of READY rows are routes the registry really calls
  for (const r of lc.matrix.filter((x) => x.action)) for (const route of r.routes) assert.ok(Object.values(g.routes).some((x) => `${x.method} ${x.path}` === route), `${r.id}: ${route}`);
});

test("the three lifecycle playbooks are linked, numbered, and name a stage that exists; human and system steps have no call", () => {
  const byId = Object.fromEntries(g.playbooks.map((p) => [p.id, p]));
  for (const id of ["game_lifecycle", "organizer_lifecycle", "host_lifecycle"]) {
    const pb = byId[id]; assert.ok(pb, id);
    assert.ok(pb.related.length >= 2 && pb.related.every((r) => byId[r]), `${id} links to playbooks that exist`);
    pb.steps.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      assert.ok(lc.stages[pb.lifecycle].some((x) => x.id === s.stage), `${id} step ${s.n} stage ${s.stage}`);
      assert.ok(["organizer", "host", "human", "system"].includes(s.by), `${id} step ${s.n} by`);
      if (s.by === "human" || s.by === "system") { assert.equal(s.action, null); assert.ok(s.key, `${id} step ${s.n} needs a key`); } else assert.ok(s.action, `${id} step ${s.n}`);
    });
  }
  assert.ok(byId.game_lifecycle.steps.some((s) => s.by === "human" && s.key === "pay"), "paying is a human step");
  assert.ok(!byId.game_lifecycle.steps.some((s) => s.action && /pay$/.test(s.action) && s.action !== "create_payment_link"), "no step makes a payment");
  const stages = new Set(byId.game_lifecycle.steps.map((s) => s.stage));
  for (const s of ["create", "configure", "invite", "payment", "ready", "start", "live", "finish", "post_game", "close", "rerun", "status_audit"]) assert.ok(stages.has(s), `the game lifecycle walks the stage ${s}`);
});

test("the owner's wording and the engine freeze hold for the lifecycle text", () => {
  const text = JSON.stringify(lc);
  assert.ok(!/\b(we|our|ours|us)\b/i.test(text.replace(/"routes"[^\]]*\]/g, "")), "no 'we/our/us'");
  assert.ok(!/(?<!Corporate )Tambola/.test(text), "Corporate Tambola, never Tambola alone");
  assert.ok(!/\$\s?\d|USD|dollar/i.test(text), "money is Rs");
  assert.ok(!/INR\s?\d/.test(text), "money is Rs");
  assert.ok(lc.gap_summary.game_change.length > 0);
});

test("the readiness report and the decisions list contain the generated lifecycle blocks, row by row", () => {
  const ready = doc("GAME_READINESS.md"), dec = doc("OWNER_DECISIONS_AND_RISKS.md");
  assert.ok(ready.includes("<!-- GENERATED:LIFECYCLE-MATRIX:START") && ready.includes("<!-- GENERATED:LIFECYCLE-MATRIX:END -->"));
  for (const r of lc.matrix) assert.ok(ready.includes(`| ${r.id} |`), `readiness report lists ${r.id}`);
  for (const id of Object.keys(lc.decisions)) assert.ok(new RegExp(`\\| ${id} \\|`).test(dec), `decisions list explains ${id}`);
  for (const r of lc.matrix.filter((x) => x.status === "GAP")) assert.ok(dec.includes(r.decision), r.id);
  assert.ok(/inside the gateway only/.test(ready) && /needs a game change/.test(ready));
});

test("the /ai page and /openapi.json show the lifecycles", () => {
  const ai = readFileSync(resolve(ROOT, "generated/ai.md"), "utf8");
  for (const id of ["game_lifecycle", "organizer_lifecycle", "host_lifecycle"]) assert.ok(ai.includes("`" + id + "`"), id);
  assert.ok(ai.includes("State machine") && ai.includes("Coverage matrix: game lifecycle") && ai.includes("Questions at each stage"));
  const api = bundle.openapi.paths;
  assert.ok(api["/api/ai/v1/tambola/lifecycle"], "lifecycle path in OpenAPI");
  assert.ok(bundle.openapi.components.schemas.Envelope.properties.lifecycle && bundle.openapi.components.schemas.Envelope.properties.say_to_host);
});

test("the six gateway-only gaps approved by the owner are READY, with the decisions marked done; the twelve game-change gaps are still held", () => {
  const row = (id) => lc.matrix.find((r) => r.id === id);
  const six = { G08: ["change_extra_settings", "D15"], G50: ["reopen_game", "D17"], G53: ["list_activity", "D28"], O04: ["request_fresh_ai_key", "D16"], O20: ["list_signin_keys", "D18"], H05: ["list_games", "D30"] };
  for (const [id, [action, decision]] of Object.entries(six)) {
    assert.equal(row(id).status, "READY", id); assert.equal(row(id).action, action, id); assert.equal(row(id).decision, decision, id);
    assert.equal(lc.decisions[decision].kind, "done", decision);
    assert.ok(actionIds.has(action), action);
  }
  assert.deepEqual(lc.gap_summary.gateway_only, [], "no gateway-only gap is left");
  assert.deepEqual([...lc.gap_summary.game_change].sort(), ["G07", "G13", "G18", "G32", "G40", "G41", "G52", "H11", "H15", "H18", "H25", "O05", "O08", "O18", "O23", "O27"].sort(), "the game-change gaps are unchanged: the engine is frozen");
});

test("the game's limited AI key (cta_): the registry says which actions it may use, and never money, cancel, erase, copy, reopen, keys or the team", () => {
  assert.equal(g.credentials.ai.prefix, "cta_"); assert.equal(g.credentials.ai.role, "organizer");
  const never = ["create_payment_link", "share_payment_link", "cancel_game", "cancel_game_preview", "erase_guest_data", "clone_game", "retire_team_member", "reopen_game", "list_signin_keys", "request_fresh_ai_key"];
  for (const a of g.actions) {
    if (never.includes(a.id)) assert.equal(a.ai_key, false, `${a.id} must not be offered to the limited key`);
    if (!a.roles.includes("organizer")) assert.equal(a.ai_key, false, `${a.id} is not an organizer action`);
  }
  const mayUse = g.actions.filter((a) => a.ai_key).map((a) => a.id);
  for (const id of ["check_key", "create_game", "change_settings", "change_extra_settings", "set_guest_invites", "announce", "list_activity", "game_status", "live_handover"]) assert.ok(mayUse.includes(id), `${id} should be usable with the limited key`);
  // the access probe says what the game really answers the limited key
  for (const a of g.actions.filter((x) => x.ai_key)) for (const c of a.calls) assert.ok(![401, 403].includes(g.routes[c].observed_access.game_ai_key), `${a.id}: the game refuses the limited key on ${c}`);
});

test("the new routes are the approved ones and nothing else: the key list is READ-only, the fresh AI key is typed-confirmed, reopen moves existing credit only", () => {
  assert.equal(g.routes.keys.method, "GET"); assert.equal(g.routes.keys.path, "/api/org/keys");
  assert.equal(g.routes.ai_fresh.method, "POST"); assert.equal(g.routes.ai_fresh.path, "/api/org/ai/fresh");
  const fresh = g.actions.find((a) => a.id === "request_fresh_ai_key"); assert.ok(fresh.confirm && fresh.idempotency === "required");
  const reopen = g.actions.find((a) => a.id === "reopen_game"); assert.ok(reopen.confirm && reopen.idempotency === "required"); assert.deepEqual(reopen.enforce_states, ["cancelled"]);
  assert.ok(g.actions.find((a) => a.id === "change_extra_settings").confirm.when.call_mode === "host", "host-calling mode needs the typed sentence");
  // no other organizer, key or payment route is used
  const used = Object.values(g.routes).map((r) => `${r.method} ${r.path}`);
  for (const bad of ["POST /api/org/keys/revoke", "POST /api/org/ai", "POST /api/org/ai/replace", "GET /api/org/ai/link", "POST /api/org/close"]) assert.ok(!used.includes(bad), bad);
  const props = g.actions.find((a) => a.id === "change_extra_settings").inputs.properties;
  const fieldNames = []; const walk = (o) => { if (o && typeof o === "object") for (const [k, v] of Object.entries(o)) { if (k === "properties") Object.keys(v).forEach((n) => fieldNames.push(n)); walk(v); } }; walk(props);
  assert.ok(fieldNames.length > 10 && !fieldNames.some((n) => /mediaUrl|logo|url|link|video|image/i.test(n)), `no field that could carry a link, a video or a logo: ${fieldNames}`);
  assert.deepEqual(props.breaks.items.properties.kind.enum, ["speech", "lucky"]); assert.deepEqual(props.opening.items.properties.kind.enum, ["speech"]);
});
