// Prints the game's OWN constants and texts as JSON (run with bun). The generator reads this, so every number and every sentence in the
// gateway's documents comes from the game's code and cannot be typed wrongly. Read only: nothing in the game checkout is changed.
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const GAME = resolve(process.env.CT_GAME_TAMBOLA ?? resolve(import.meta.dir, "../../../../tambola"));
const imp = (p: string) => import(pathToFileURL(resolve(GAME, p)).href);

const facts: any = await imp("apps/edge/src/ai-facts.ts");
const link: any = await imp("apps/edge/src/ai-link.ts");
const cfg: any = await imp("packages/beacon/src/config.ts");
const pricing: any = await imp("packages/shared/src/pricing.ts");
const pay: any = await imp("apps/edge/src/pay.ts");
const paylink: any = await imp("apps/edge/src/paylink.ts");
const life: any = await imp("apps/edge/src/lifecycle.ts");
const people: any = await imp("apps/edge/src/people.ts");
const control: any = await imp("packages/beacon/src/control.ts");
const worker: any = await imp("apps/edge/src/worker.ts");

const out = {
  facts: facts.FACTS,
  fact_rules: facts.FACT_RULES,
  ai_cannot: link.AI_CANNOT.map((c: any) => ({ what: c.what, ask: c.ask })),
  get_body_max: link.GET_BODY_MAX,
  packs: pricing.PACKS.map((p: any) => ({ people: p[0], price_inr: p[1], price_usd: p[2] })),
  gst_on: pricing.GST_ON,
  prize_houses: cfg.PRIZE_HOUSES.map((h: any) => ({ id: h.id, label: h.label, how: h.how, max: h.max, kind: h.kind, scope: h.scope ?? null })),
  invite_categories: cfg.INVITE_CATEGORIES.map((c: any) => c.id),
  max_invites_per_person: cfg.MAX_INVITES_PER_PERSON,
  max_rounds: cfg.MAX_ROUNDS,
  demo_cap: cfg.DEMO_CAP,
  grace_rounds: cfg.GRACE_ROUNDS,
  max_reward_lines: cfg.MAX_REWARD_LINES,
  max_winners_per_house: cfg.MAX_WINNERS_PER_HOUSE,
  max_mid_per_ticket: cfg.MAX_MID_PER_TICKET,
  free_cap: pay.FREE_CAP,
  max_drafts: pay.MAX_DRAFTS,
  payer_roles: pay.PAYER,
  paylink_ttl_days: paylink.PAYLINK_TTL_MS / 86_400_000,
  max_ahead_days: life.MAX_AHEAD_MS / 86_400_000,
  draft_days: worker.DRAFT_DAYS,
  cohost_limit_default: people.COHOST_LIMIT_DEFAULT,
  cohost_limit_min: people.COHOST_LIMIT_MIN,
  cohost_limit_max: people.COHOST_LIMIT_MAX,
  brand_colors: cfg.BRAND_COLORS,
  brand_name_max: cfg.BRAND_NAME_MAX,
  opening_window_seconds: cfg.OPENING_WINDOW_SECONDS,
  lucky_winners: cfg.LUCKY_WINNERS,
  max_breaks: cfg.maxMidFor(2), // the most with 2 tickets per person; the game itself checks the real limit for the game's tickets
  max_edge_moments: cfg.maxEdgeFor(2),
  pause_max_participants: control.PAUSE_MAX_PARTICIPANTS,
};
console.log(JSON.stringify(out, null, 2));
