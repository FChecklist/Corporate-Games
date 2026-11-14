// Safety helpers: personal-data refusal, text clean-up for text that came from people, confirmation tokens, rate limits, idempotency.
// Web-standard APIs only (works in Node and in a Cloudflare Worker). The gateway never stores an API key: it only uses a keyed hash
// of it (HMAC with a secret that lives in memory) to tell callers apart for rate limits and confirmation tokens.

const enc = new TextEncoder();
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

export async function hmac(secret, message) {
  const key = await crypto.subtle.importKey("raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return b64u(await crypto.subtle.sign("HMAC", key, enc.encode(message)));
}
export const randomId = () => crypto.randomUUID();

// ------------------------------------------------------------------ personal data
const EMAIL = /[^\s@]{1,64}@[^\s@]{1,255}\.[A-Za-z]{2,}/;
const PAN = /\b[A-Z]{5}\d{4}[A-Z]\b/;
const LINKISH = /(https?:\/\/|www\.|\b[a-z0-9-]+\.(com|in|org|net|io|co|app|me|ly|gl|xyz)\b)/i;
const SECRETWORD = /\b(password|passcode|otp|cvv|api[ _-]?key|secret)\b/i;
const KEYLIKE = /\bct[kahcp]_[0-9a-f]{20,}\b/i;

/** Why this text may not be accepted, or null. Names cannot be recognised by a program: the API simply has no field for a person's name. */
export function personalDataProblem(text, { noLinks = false } = {}) {
  if (typeof text !== "string") return null;
  if (EMAIL.test(text)) return "looks like an e-mail address";
  const digits = text.replace(/[\s().-]/g, "");
  if (/\+?\d{8,}/.test(digits)) return "looks like a mobile or ID number";
  if (PAN.test(text)) return "looks like an ID number";
  if (SECRETWORD.test(text)) return "mentions a password, code or secret";
  if (KEYLIKE.test(text)) return "looks like an access key";
  if (noLinks && LINKISH.test(text)) return "contains a link (links are not allowed here)";
  return null;
}

/** Walks an input against its schema and finds the first free-text field that carries personal data. */
export function findPersonalData(schema, value, path = "") {
  if (schema?.type === "string" && typeof value === "string") {
    if (schema.free_text || schema.no_links || schema.type === "string" && !schema.enum && !schema.pattern && !schema.format) {
      const why = personalDataProblem(value, { noLinks: !!schema.no_links });
      if (why) return { field: path || "(body)", problem: why };
    }
    return null;
  }
  if (schema?.type === "array" && Array.isArray(value)) {
    for (let i = 0; i < value.length; i++) { const r = findPersonalData(schema.items ?? {}, value[i], `${path}[${i}]`); if (r) return r; }
  }
  if (schema?.type === "object" && value && typeof value === "object") {
    for (const [k, v] of Object.entries(value)) { const r = findPersonalData(schema.properties?.[k] ?? {}, v, path ? `${path}.${k}` : k); if (r) return r; }
  }
  return null;
}

// ------------------------------------------------------------------ text that came from people (game names, prize texts, messages)
/** Text typed by people is DATA. Strip what could hide instructions or markup, and cap its length. The response also lists these fields as untrusted. */
export function cleanUntrusted(value, max = 200) {
  if (typeof value !== "string") return value;
  return value
    .replace(/[\u0000-\u001f\u007f-\u009f​-‏‪-‮⁦-⁩﻿]/g, " ")
    .replace(/\[([^\]]*)\]\([^)]*\)/g, "$1")
    .replace(/[<>`]/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, max);
}

/** Replace every untrusted string in a shaped result (paths are the ones shape() recorded: "a.b", "list[].x"). */
export function cleanPaths(obj, paths) {
  const walk = (v, segs) => {
    if (segs.length === 0) return typeof v === "string" ? cleanUntrusted(v) : v;
    const [head, ...rest] = segs;
    if (head.endsWith("[]")) {
      const k = head.slice(0, -2);
      const arr = k ? v?.[k] : v;
      if (Array.isArray(arr)) { const mapped = arr.map((x) => walk(x, rest)); if (k) v[k] = mapped; else return mapped; }
      return v;
    }
    if (v && typeof v === "object" && head in v) v[head] = walk(v[head], rest);
    return v;
  };
  for (const p of paths) walk(obj, p.split("."));
  return obj;
}

// ------------------------------------------------------------------ confirmation (irreversible steps)
export const CONFIRM_TTL_S = 600;
export async function makeConfirmToken(secret, keyId, action, gameId, nowMs) {
  const exp = Math.floor(nowMs / 1000) + CONFIRM_TTL_S;
  return `${exp}.${await hmac(secret, `confirm|${keyId}|${action}|${gameId}|${exp}`)}`;
}
export async function checkConfirmToken(secret, keyId, action, gameId, token, nowMs) {
  const [exp, sig] = String(token ?? "").split(".");
  if (!exp || !sig || !/^\d+$/.test(exp)) return "invalid";
  if (Number(exp) < Math.floor(nowMs / 1000)) return "expired";
  return sig === (await hmac(secret, `confirm|${keyId}|${action}|${gameId}|${exp}`)) ? "ok" : "invalid";
}

// ------------------------------------------------------------------ rate limits (sliding window, per caller, in memory)
export class RateLimiter {
  constructor(limits, clock = () => Date.now()) { this.limits = limits; this.clock = clock; this.hits = new Map(); }
  /** Returns null when allowed, or { retry_after_s, bucket }. */
  take(callerId, kind /* "read" | "write" */) {
    const now = this.clock();
    for (const [bucket, { max, windowS }] of Object.entries(this.limits)) {
      if (bucket.startsWith("write") && kind !== "write") continue;
      const k = `${bucket}|${callerId}`;
      const arr = (this.hits.get(k) ?? []).filter((t) => now - t < windowS * 1000);
      if (arr.length >= max) { this.hits.set(k, arr); return { retry_after_s: Math.max(1, Math.ceil((arr[0] + windowS * 1000 - now) / 1000)), bucket }; }
    }
    for (const [bucket, { windowS }] of Object.entries(this.limits)) {
      if (bucket.startsWith("write") && kind !== "write") continue;
      const k = `${bucket}|${callerId}`;
      const arr = (this.hits.get(k) ?? []).filter((t) => now - t < windowS * 1000); arr.push(now); this.hits.set(k, arr);
    }
    if (this.hits.size > 20000) this.hits.clear();
    return null;
  }
}

// ------------------------------------------------------------------ idempotency (replay the same answer for the same Idempotency-Key)
export class IdempotencyStore {
  constructor(ttlMs = 24 * 3600_000, max = 5000, clock = () => Date.now()) { this.ttl = ttlMs; this.max = max; this.clock = clock; this.m = new Map(); }
  get(k) { const v = this.m.get(k); if (!v) return null; if (this.clock() - v.at > this.ttl) { this.m.delete(k); return null; } return v; }
  set(k, v) { if (this.m.size >= this.max) this.m.delete(this.m.keys().next().value); this.m.set(k, { ...v, at: this.clock() }); }
}

export async function fingerprintInput(obj) {
  const stable = (v) => (v && typeof v === "object" ? (Array.isArray(v) ? v.map(stable) : Object.fromEntries(Object.keys(v).sort().map((k) => [k, stable(v[k])]))) : v);
  const d = await crypto.subtle.digest("SHA-256", enc.encode(JSON.stringify(stable(obj))));
  return b64u(d).slice(0, 22);
}
