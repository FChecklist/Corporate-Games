// STATIC CHECKS (plain Node, no bun, no game process): the committed generated/* files agree with each other, with the renderers and with the game's source text.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readGenerated, bundle, registry, requireGame } from "./helpers.mjs";
import { renderOpenApi, renderAiPage, renderLlmsTxt } from "../tools/render.mjs";
import { gameRoot, loadSources, fingerprintRoute, extractGlobals, extractRouteInventory } from "../games/tambola/extract.mjs";
import adapter from "../games/tambola/adapter.mjs";

const g = registry.games.tambola;

test("the worker bundle holds exactly the committed registry and pages", () => {
  assert.deepEqual(JSON.parse(readGenerated("actions.generated.json")), bundle.registry);
  assert.deepEqual(JSON.parse(readGenerated("openapi.json")), bundle.openapi);
  assert.equal(readGenerated("ai.md"), bundle.ai_md + "\n");
  assert.equal(readGenerated("llms.txt"), bundle.llms_txt);
});

test("openapi.json, /ai and /llms.txt are exactly what the renderers make from the registry (nobody hand-edited them)", () => {
  assert.deepEqual(renderOpenApi(registry), JSON.parse(readGenerated("openapi.json")));
  assert.equal(renderAiPage(registry) + "\n", readGenerated("ai.md"));
  assert.equal(renderLlmsTxt(registry), readGenerated("llms.txt"));
});

test("every action has a path in openapi.json and every openapi path is under the API base", () => {
  const api = JSON.parse(readGenerated("openapi.json"));
  const paths = Object.keys(api.paths);
  for (const a of g.actions) assert.ok(paths.some((p) => p.endsWith(`/actions/${a.id}`)), `no OpenAPI path for ${a.id}`);
  for (const p of paths) assert.ok(p.startsWith("/api/ai/v1") || api.servers?.length, p);
  assert.ok(api.openapi.startsWith("3."));
});

test("the registry's action list matches the adapter and every route the game exposes is used or consciously excluded", () => {
  assert.deepEqual(g.actions.map((a) => a.id), adapter.actions.map((a) => a.id));
  const inv = g.game_rules.inventory;
  for (const [k, v] of Object.entries({ ...inv.exact, ...inv.patterns, ...inv.engagement_actions })) assert.ok(v && v !== "UNCLASSIFIED", `unclassified game route ${k}`);
});

test("generated pages contain no unresolved placeholders and never contain anything that looks like a key", () => {
  for (const f of ["ai.md", "llms.txt", "openapi.json"]) {
    const t = readGenerated(f);
    assert.ok(!/\{\{|\}\}/.test(t), `${f} has an unresolved {{placeholder}}`);
    assert.ok(!/ct[kahc]_[0-9a-f]{20,}/.test(t), `${f} contains something that looks like a key`);
  }
});

test("the game's source text still has every block the committed fingerprints were made from (static drift, no game process)", (t) => {
  if (!requireGame()) return t.skip("game checkout not present");
  const S = loadSources(gameRoot());
  for (const [name, r] of Object.entries(g.routes)) {
    const fresh = fingerprintRoute(S[r.source.file], { start: r.source.start, back: r.source.back });
    assert.equal(fresh.fingerprint, r.fingerprint, `the game's code for route "${name}" changed since generation: run npm run drift`);
  }
  const now = extractGlobals(S);
  assert.deepEqual(now.action_list, g.game_rules.action_list);
  assert.deepEqual(now.host_actions, g.game_rules.host_actions);
  assert.equal(extractRouteInventory(S).exact.length, Object.keys(g.game_rules.inventory.exact).length);
});
