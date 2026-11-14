// Test helpers: start the LOCAL game harness (bun, in memory), build a gateway pointed at it, make people-things (sign up, add a Host, pay in TEST mode).
import { spawn, spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { readFileSync, existsSync } from "node:fs";
import bundle from "../generated/bundle.generated.mjs";
import { createGateway, API } from "../src/engine.mjs";
import { games } from "../src/games.mjs";
import { findBun } from "../tools/generate.mjs";
import { gameRoot } from "../games/tambola/extract.mjs";

export const ROOT = resolve(fileURLToPath(import.meta.url), "../..");
export { bundle, API };
export const registry = bundle.registry;

export function gameAvailable() { return existsSync(resolve(gameRoot(), "apps/edge/src/worker.ts")); }
export function requireGame() {
  if (!gameAvailable() && process.env.GATEWAY_ALLOW_NO_GAME !== "1") throw new Error(`The Corporate Tambola checkout is missing at ${gameRoot()}. Set CT_GAME_TAMBOLA, or GATEWAY_ALLOW_NO_GAME=1 to skip game-dependent tests (not allowed in CI).`);
  return gameAvailable();
}

/** Starts the bun harness on a free port. Returns { origin, h(path, body), stop() }. */
export async function startHarness() {
  const bun = findBun();
  const child = spawn(bun, ["games/tambola/harness/server.ts", "--port", "0"], { cwd: ROOT, shell: true, stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, CT_GAME_TAMBOLA: gameRoot() } });
  const origin = await new Promise((res, rej) => {
    let buf = "";
    const t = setTimeout(() => rej(new Error("harness did not start: " + buf)), 60000);
    child.stdout.on("data", (d) => { buf += d; const m = buf.match(/HARNESS_READY (http:\/\/127\.0\.0\.1:\d+)/); if (m) { clearTimeout(t); res(m[1]); } });
    child.stderr.on("data", (d) => { buf += d; });
    child.on("exit", (c) => rej(new Error("harness exited " + c + ": " + buf)));
  });
  const h = async (path, body) => (await fetch(origin + "/__h/" + path, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body ?? {}) })).json();
  const stop = () => { try { child.stdout.destroy(); child.stderr.destroy(); } catch { /* ignore */ } try { spawnSync("taskkill", ["/pid", String(child.pid), "/T", "/F"], { shell: true, stdio: "ignore" }); } catch { /* ignore */ } try { child.kill(); } catch { /* ignore */ } child.unref(); };
  return { origin, h, stop };
}

/** A gateway wired to the harness. `now` lets a test move the gateway's own clock (confirmation expiry). */
export function makeGateway(origin, { audit = () => {}, clock, limits, fetchImpl } = {}) {
  const b = limits ? { ...bundle, registry: { ...bundle.registry, limits: { ...bundle.registry.limits, ...limits } } } : bundle;
  const gw = createGateway({ ...(fetchImpl ? { fetchImpl } : {}), bundle: b, games, origins: { tambola: origin }, secret: "test-secret-test-secret-test-secret", audit, clock });
  const call = async (method, path, { key, body, headers = {}, query, agent = "TestAI" } = {}) => {
    const url = new URL("http://gateway.test" + path); for (const [k, v] of Object.entries(query ?? {})) url.searchParams.set(k, String(v));
    const r = await gw.handle(new Request(url, { method, headers: { ...(key ? { authorization: `Bearer ${key}` } : {}), "x-ai-agent": agent, ...(body !== undefined ? { "content-type": "application/json" } : {}), ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }));
    const text = await r.text(); let json = null; try { json = JSON.parse(text); } catch { /* not json */ }
    return { status: r.status, json, text, headers: r.headers };
  };
  return { gw, call, act: (key, id, body, o = {}) => call(body === undefined && o.get ? "GET" : "POST", `${API}/tambola/actions/${id}`, { key, body: o.get ? undefined : body ?? {}, query: o.get ? body : undefined, ...o }) };
}

let n = 0;
export const idem = () => `test-key-${Date.now()}-${++n}-abcdef`;

/** Someone signs up, adds a Host (human steps in the console). Returns keys. */
export async function makeAccount(harness) {
  const org = await harness.h("organizer", {});
  const host = await harness.h("host", { orgKey: org.key });
  return { orgKey: org.key, aiKey: org.aiKey, hostKey: host.hostKey, host };
}
export const startAtIn = (ms) => new Date(Date.now() + ms).toISOString().replace("Z", "+00:00");
export const readGenerated = (f) => readFileSync(resolve(ROOT, "generated", f), "utf8");
