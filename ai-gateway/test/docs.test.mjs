// DOCUMENTATION TESTS: what the AI reads (/ai, /llms.txt, OpenAPI, FAQ, playbooks) follows the owner's wording rules and does not contradict the code.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { registry, readGenerated } from "./helpers.mjs";

const g = registry.games.tambola;
const allText = [readGenerated("ai.md"), readGenerated("llms.txt"), readGenerated("openapi.json")];
const strings = (v, out = []) => { if (typeof v === "string") out.push(v); else if (Array.isArray(v)) v.forEach((x) => strings(x, out)); else if (v && typeof v === "object") Object.values(v).forEach((x) => strings(x, out)); return out; };
// `routes` and `game_rules` are evidence copied from the game's code (its own error sentences, regexes): they are not the owner's wording and are not served as instructions.
const authored = { ...registry, games: { tambola: { ...registry.games.tambola, routes: undefined, game_rules: undefined } } };
const registryStrings = strings(authored);
const catalogCodes = new Set(registry.error_catalog.map((e) => e.code));
const actionIds = new Set(g.actions.map((a) => a.id));

test("wording (owner rule): the text says 'the system', never 'we', 'our' or 'us'", () => {
  for (const s of registryStrings) assert.ok(!/\b(we|We|our|Our|us)\b/.test(s), `uses we/our/us: ${s.slice(0, 120)}`);
  for (const t of allText) assert.ok(!/\b(we|We|our|Our|us)\b/.test(t.replace(/"[^"]*\bus\b[^"]*":/g, "")), "a generated page says we/our/us");
});

test("wording (owner rule): 'Corporate Tambola', never 'Tambola' alone; money as 'Rs', never the rupee sign or INR", () => {
  for (const t of [...allText, ...registryStrings]) {
    assert.ok(!/(?<!Corporate )\bTambola\b/.test(t), `says Tambola without Corporate: ${t.slice(0, 100)}`);
    assert.ok(!/₹|\bINR\b/.test(t), `money is not written as Rs: ${t.slice(0, 100)}`);
  }
});

test("wording: the owner-written texts in the source files follow the same rules", () => {
  for (const f of ["../games/tambola/content.mjs", "../games/tambola/runtime.mjs", "../tools/global-content.mjs", "../tools/render.mjs"]) {
    const t = readFileSync(new URL(f, import.meta.url), "utf8");
    for (const m of t.matchAll(/(?<!Corporate )\bTambola\b/g)) {
      const line = t.slice(0, m.index).split("\n").pop();
      assert.ok(line.trim().startsWith("//"), `${f}: "Tambola" without "Corporate": ${line.trim().slice(0, 100)}`);
    }
  }
});

test("every sentence of the game's own public facts is shown to the AI (only 'we' -> 'the system' is changed)", () => {
  const ai = readGenerated("ai.md");
  assert.ok(g.facts.length >= 8);
  for (const f of g.facts) assert.ok(ai.includes(f.say), `fact ${f.n} is missing from /ai`);
});

test("FAQ numbers equal the constants read from the game's code", () => {
  const c = g.game_rules.constants;
  const faq = (needle) => g.faq.find((f) => f.q.includes(needle)).a;
  assert.match(faq("How many drafts"), new RegExp(`At most ${c.max_drafts} unpublished drafts`));
  assert.match(faq("How many drafts"), new RegExp(`forgotten after ${c.draft_days} days`));
  assert.match(faq("How far ahead"), new RegExp(`At most ${c.max_ahead_days} days`));
  assert.match(faq("Can guests invite"), new RegExp(`up to ${c.max_invites_per_person} people`));
  assert.match(faq("How many people"), new RegExp(`Up to ${c.max_rounds} rounds`));
  assert.match(faq("How many people"), new RegExp(`up to ${c.demo_cap} people`));
  assert.match(faq("How do I pay"), new RegExp(`works for ${c.paylink_ttl_days} days`));
  assert.match(faq("What does a game cost"), c.gst_on ? /GST/ : /No GST is charged/);
  const speeds = g.game_rules.call_gaps_seconds;
  assert.match(faq("How many people"), new RegExp(`every ${speeds.slice(0, -1).join(", ")} or ${speeds.at(-1)} seconds`));
});

test("FAQ and playbooks name only actions and error codes that exist (no stale names after a change)", () => {
  const known = new Set([...actionIds, ...catalogCodes]);
  for (const f of g.faq) for (const m of f.a.matchAll(/\(([a-z]+(?:_[a-z]+)+)\)/g)) assert.ok(known.has(m[1]), `FAQ "${f.q}" mentions (${m[1]}), which is no action or error code`);
  for (const pb of g.playbooks) {
    assert.ok(["organizer", "host"].includes(pb.who));
    pb.steps.forEach((s, i) => {
      assert.equal(s.n, i + 1);
      if (s.action) { const a = g.actions.find((x) => x.id === s.action); assert.ok(a, `${pb.id} step ${s.n}: unknown action ${s.action}`); assert.ok(a.roles.includes(pb.who) || s.action === "check_key", `${pb.id} step ${s.n}: ${s.action} is not for ${pb.who}`); }
      for (const e of s.on_error ?? []) assert.ok(catalogCodes.has(e.code), `${pb.id} step ${s.n}: error ${e.code} is not in the catalog`);
    });
  }
});

test("FAQ does not contradict the actions: what it says the AI can never do is not an action; what it says the AI can do is", () => {
  const never = g.faq.find((f) => f.q === "What can the AI assistant never do?").a;
  for (const forbidden of ["pay", "publish", "winners", "numbers"]) assert.ok(never.includes(forbidden), `the never-list lost "${forbidden}"`);
  for (const a of g.actions) assert.ok(!/(^|_)(pay|publish|checkout|claim|call_number|choose_winner)(_|$)/.test(a.id) || a.id === "create_payment_link" || a.id === "share_payment_link" || a.id === "payment_status", `action ${a.id} sounds like something the AI must never do`);
  const can = g.faq.find((f) => f.q === "What can the AI assistant do through this gateway?").a;
  assert.ok(can.includes("payment link"), "the can-do list must mention the payment link");
  const payFaq = g.faq.find((f) => f.q.startsWith("How do I pay")).a;
  assert.match(payFaq, /AI can never pay/);
  assert.match(payFaq, /IT Services by Rajat Agarwal/);
  assert.match(payFaq, /Razorpay/);
});

test("the game's known conflict with its own public fact 8 is stated openly in the FAQ", () => {
  assert.ok(g.fact_conflicts.length >= 1);
  const a = g.faq.find((f) => f.q.startsWith("Does the game's own public facts page agree")).a;
  assert.match(a, /Not completely/);
  for (const c of g.fact_conflicts) assert.ok(a.toLowerCase().includes(c.phrase.split(" ").slice(-2).join(" ").toLowerCase()) || a.includes("fact 8"), `FAQ does not explain the conflict "${c.phrase}"`);
});

test("/llms.txt and /ai list every playbook and every action, and point to the OpenAPI file", () => {
  const llms = readGenerated("llms.txt"), ai = readGenerated("ai.md");
  for (const pb of g.playbooks) { assert.ok(ai.includes(pb.id) || ai.includes(pb.title), `/ai lacks playbook ${pb.id}`); }
  for (const a of g.actions) assert.ok(ai.includes(a.id), `/ai lacks action ${a.id}`);
  assert.ok(llms.includes("/openapi.json") && llms.includes("/ai"), "llms.txt must point to /ai and /openapi.json");
  assert.ok(/organizer/i.test(llms) && /host/i.test(llms));
});

test("every irreversible action says so and needs confirmation; every write that can be repeated needs an Idempotency-Key", () => {
  for (const a of g.actions.filter((x) => x.confirm)) assert.ok(a.confirm.phrase && /\{|[A-Za-z]/.test(a.confirm.phrase));
  const must = ["create_payment_link", "cancel_game", "erase_guest_data", "announce"];
  for (const id of must) assert.equal(g.actions.find((a) => a.id === id).idempotency, "required", `${id} must require an Idempotency-Key`);
  for (const id of ["create_payment_link", "cancel_game", "erase_guest_data"]) assert.ok(g.actions.find((a) => a.id === id).confirm, `${id} must need a typed confirmation`);
});

test("no input of any action can carry a person's name, e-mail, mobile number or ID", () => {
  const walk = (schema, path) => { for (const [k, v] of Object.entries(schema?.properties ?? {})) { assert.ok(!/(^|_)(phone|mobile|email|e_mail|name_of|first_name|last_name|surname|aadhaar|pan|employee_id|member_id|person)(_|$)/i.test(k), `${path}.${k} looks like a personal-data field`); walk(v, `${path}.${k}`); if (v.items) walk(v.items, `${path}.${k}[]`); } };
  for (const a of g.actions) walk(a.inputs, a.id);
});
