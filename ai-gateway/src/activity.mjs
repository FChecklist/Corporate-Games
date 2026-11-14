// THE GATEWAY'S OWN ACTIVITY LOG (owner decision D28): what the AI did through this gateway, for the organizer to read.
// Kept in the memory of the running gateway ONLY: it is bounded, never written to disk, and is lost when the gateway restarts. A lasting store
// (a database or a key-value store at the host) is a separate, owner-approved step because it can cost money; the engine accepts any store with this shape.
// What an entry holds: time, action, game id (only for a call that WORKED, so a refused call cannot write into somebody else's game), role, kind of key,
// the HTTP status and the error code. Never the key, never what was sent, never an address, never a name or a number.
export class MemoryActivityStore {
  constructor({ max = 2000, perKey = 200, clock = () => Date.now() } = {}) { this.max = max; this.perKey = perKey; this.clock = clock; this.items = []; }
  /** One entry for one finished call. `keyId` is only for finding the caller's own calls again: it is never returned. */
  add(e) {
    const entry = { at: new Date(this.clock()).toISOString(), keyId: e.keyId, action: e.action, game_id: e.game_id ?? null, role: e.role, key_kind: e.key_kind, status: e.status, ok: e.status < 400, error_code: e.error_code ?? null, agent: e.agent ?? "unknown", replay: e.replay ? true : null };
    this.items.push(entry);
    const mine = this.items.filter((x) => x.keyId === e.keyId);
    if (mine.length > this.perKey) this.items.splice(this.items.indexOf(mine[0]), 1);
    if (this.items.length > this.max) this.items.shift();
  }
  size() { return this.items.length; }
  #out(list, limit) { return list.slice(-limit).reverse().map(({ keyId, ...rest }) => rest); }
  forKey(keyId, limit = 50) { return this.#out(this.items.filter((x) => x.keyId === keyId), limit); }
  forGame(game_id, limit = 50) { return this.#out(this.items.filter((x) => x.game_id === game_id && x.ok), limit); }
}
