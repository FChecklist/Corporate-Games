// THE DRIFT GUARD, proven. (1) With the game as it is now, generated/* is up to date. (2) When the game changes in any way that matters,
// the generator FAILS or the output CHANGES. Each mutation below edits a COPY of the game's source text in memory (the game's files are never touched).
import { test, before } from "node:test";
import assert from "node:assert/strict";
import { requireGame, registry } from "./helpers.mjs";
import { collect, generateAll, FILES, OUT } from "../tools/generate.mjs";
import { buildRegistry } from "../tools/build.mjs";
import adapter from "../games/tambola/adapter.mjs";
import * as content from "../games/tambola/content.mjs";
import { readFileSync } from "node:fs";
import { join } from "node:path";

let C, base;
const build = (over = {}) => buildRegistry({ adapter, content, sources: C.sources, facts: C.facts, probe: C.probe, ...over });
const src = (fn) => { const s = { ...C.sources }; fn(s); return s; };
const expectFail = (over, re) => assert.throws(() => build(over), (e) => re.test(e.message), `expected generation to fail with ${re}`);

before(() => { if (requireGame()) { C = collect(); base = build(); } });

test("with the game as it is now, nothing has drifted: generated/* is byte-for-byte what the generator makes", () => {
  const files = generateAll({ collected: C });
  for (const f of FILES) assert.equal(readFileSync(join(OUT, f), "utf8"), files[f], `${f} is out of date: run npm run drift to see why, then npm run generate`);
});

test("a game route the gateway uses is renamed -> generation FAILS", () => {
  expectFail({ sources: src((s) => { s.worker = s.worker.replace('p === "/api/z") {', 'p === "/api/zz") {'); }) }, /BLOCK NOT FOUND/);
});

test("the game adds a new engagement action -> generation FAILS until someone decides what the AI may do with it", () => {
  expectFail({ sources: src((s) => { s.worker = s.worker.replace(/(const m = p\.match\(\/\^\\\/api\\\/z\\\/\(\[A-Za-z0-9_-\]\{4,40\}\)\\\/\([^)]*)\)\$\/\);/, "$1|brandnew)$/);"); }) }, /NEW GAME ACTION not classified: \/api\/z\/\{id\}\/brandnew/);
});

test("the game adds a new route -> generation FAILS until it is classified", () => {
  expectFail({ sources: src((s) => { s.worker += '\n  if (req.method === "GET" && p === "/api/ai-new-thing") { return json({}); }\n'; }) }, /NEW GAME ROUTE not classified: GET \/api\/ai-new-thing/);
});

test("a route's code changes -> the fingerprint and the readable facts CHANGE, so the diff shows it", () => {
  const changed = build({ sources: src((s) => { s.worker = s.worker.replaceAll("Pick the day and time the game starts.", "Pick the day and time."); }) });
  assert.notEqual(changed.games.tambola.routes.create.fingerprint, base.games.tambola.routes.create.fingerprint);
  assert.ok(changed.games.tambola.routes.create.errors.includes("Pick the day and time."));
});

test("the game changes who may call a route (access probe) -> generation FAILS", () => {
  const act = adapter.actions.find((a) => a.id === "cancel_game");
  const route = act.calls.at(-1);
  const probe = JSON.parse(JSON.stringify(C.probe)); probe[route].host_link = 200;
  expectFail({ probe }, /organizer-only|host/i);
});

test("the game's public facts and the gateway disagree differently than recorded -> generation FAILS (a conflict appears or disappears)", () => {
  expectFail({ content: { ...content, knownFactConflicts: [] } }, /NEW CONFLICT/);
  expectFail({ content: { ...content, knownFactConflicts: [...content.knownFactConflicts, { fact: 8, phrase: "send an e-mail", action: "announce", decision: "D9" }] } }, /no longer/);
});

test("the game adds or renames a status text -> generation FAILS until it is mapped to a state", () => {
  expectFail({ sources: src((s) => { s.worker = s.worker.replace('"did not start', '"missed start'); }) }, /status text|mapping/);
});

test("the game's game-id rule changes -> generation FAILS", () => {
  expectFail({ sources: src((s) => { s.worker = s.worker.split("\n").map((l) => (l.startsWith("const ID =") ? l.replace("4,40", "4,64") : l)).join("\n"); }) }, /game id rule changed/);
});

test("the committed registry is what this build produces", () => {
  assert.deepEqual(JSON.parse(JSON.stringify(build())), registry);
});
