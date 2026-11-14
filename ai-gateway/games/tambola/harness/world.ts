// The in-memory Corporate Tambola world used by the harness server and the probe. Imports the game's OWN code (read only).
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

export const GAME = resolve(process.env.CT_GAME_TAMBOLA ?? resolve(import.meta.dir, "../../../../tambola"));
const imp = (p: string) => import(pathToFileURL(resolve(GAME, p)).href);
const worker: any = await imp("apps/edge/src/worker.ts");
const { makeD1 } = await imp("apps/edge/test/d1-sqlite.ts");
const withTerms: any = await imp("apps/edge/test/with-terms.ts");
const visits: any = await imp("apps/edge/src/visits.ts");

export function createWorld() {
  let raw: any, env: any, clockOffset = 0, ipN = 0;
  const now = () => Date.now() + clockOffset;
  const reset = () => {
    try { raw?.close(); } catch { /* none yet */ }
    const d = makeD1(); raw = d.raw; visits.resetRate?.(); clockOffset = 0;
    env = { DB: d.db, ORGANIZER_SECRET: "harness-platform-secret", DAILY_WRITE_BUDGET: "100000000", DATA_KEY: "harness-dk", PHONE_SALT: "harness-salt", TEST_MODE: "1", ONLY_12S: "1", PUBLIC_ORIGIN: "https://tambola.test" };
    raw.run("UPDATE mode SET mode='TEST', changed_ms=?, reason='harness' WHERE id=1", [Date.now()]);
  };
  reset();
  /** `terms`: act like a person ticking the boxes on the page (sign-up, payment). Gateway traffic uses terms=false: the REAL handler, nothing added. */
  const handle = (req: Request, terms = false) => (terms ? withTerms.handle(req, env, now()) : worker.handle(req, env, now()));
  const game = (method: string, path: string, body?: unknown, headers: Record<string, string> = {}, terms = true) =>
    handle(new Request("http://game.local" + path, { method, headers: { "content-type": "application/json", ...headers }, body: body === undefined ? undefined : JSON.stringify(body) }), terms);
  const j = async (r: Response) => ((await r.json().catch(() => ({}))) as any);

  const organizer = async (email?: string) => {
    email = email ?? `org${++ipN}x${Math.floor(Math.random() * 1e6)}@acme.example`;
    const r = await game("POST", "/api/start", { email }, { "cf-connecting-ip": `8.8.${Math.floor(ipN / 250)}.${(ipN % 250) + 1}` });
    const b = await j(r);
    return { key: b.token as string, aiKey: b.aiKey as string, email, status: r.status };
  };
  const host = async (orgKey: string, label = "Host One") => {
    const r = await game("POST", "/api/org/host", { label, email: `host${++ipN}@acme.example` }, { "x-organizer": orgKey });
    const b = await j(r);
    return { hostKey: b.hostKey as string, id: b.id as string, status: r.status };
  };
  const startRoundIn = async (ms: number) => {
    const r = await game("GET", "/api/z/schedule?at=" + encodeURIComponent(new Date(now() + ms).toISOString()), undefined, { "x-organizer": "harness-platform-secret" }, false);
    return (await j(r)).startRound as number;
  };
  /** A person pays the pay link in TEST mode (no money, no Razorpay). */
  const pay = async (url: string) => {
    const token = String(url).match(/t=([0-9a-f]{48})/)?.[1];
    const r = await game("POST", `/api/paylink/${token}/checkout`, { name: "Finance Person", email: "finance@acme.example", org: "Acme Ltd" }, { "cf-connecting-ip": `7.7.${Math.floor(++ipN / 250)}.${(ipN % 250) + 1}` });
    return { status: r.status, body: await j(r) };
  };
  const join = async (eid: string, count = 1, names?: string[]) => {
    const out: any[] = [];
    for (let i = 0; i < count; i++) {
      const phone = `9${String(800000000 + ++ipN * 7).slice(0, 9)}`, guestName = names?.[i] ?? `Canary Guest ${ipN}`, device = (phone + "0".repeat(32)).slice(0, 32);
      const r = await game("POST", `/api/z/${eid}/join`, { phone, name: guestName, device }, { "cf-connecting-ip": `9.9.${Math.floor(ipN / 250)}.${(ipN % 250) + 1}` });
      const b = await j(r);
      out.push({ status: r.status, phone, guestName, pid: b.pid });
    }
    return out;
  };
  const sql = (q: string, args: unknown[] = []) => raw.query(q).all(...args);
  const advance = (ms: number) => { clockOffset += ms; return now(); };
  return { reset, handle, game, j, organizer, host, startRoundIn, pay, join, sql, advance, now, platform: "harness-platform-secret" };
}
