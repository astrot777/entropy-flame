// Written with an LLM coding assistant (SI); reviewed by the team.
export interface LimitStore { incr(key: string, ttlSeconds: number): Promise<number> }

/** In-memory counter store (one server process). Expired keys are dropped on access. */
export function memoryStore(now: () => number = Date.now): LimitStore {
  const map = new Map<string, { n: number; until: number }>();
  return {
    async incr(key, ttlSeconds) {
      const t = now();
      const cur = map.get(key);
      if (!cur || cur.until <= t) {
        map.set(key, { n: 1, until: t + ttlSeconds * 1000 });
        return 1;
      }
      cur.n += 1;
      return cur.n;
    },
  };
}

/** Daily request cap per visitor IP and overall, keyed by the UTC date so it resets at midnight UTC. */
export function createLimiter(opts: { store: LimitStore; perIpPerDay: number; globalPerDay: number; now?: () => number }) {
  const now = opts.now ?? Date.now;
  return {
    async allow(ip: string): Promise<boolean> {
      const day = new Date(now()).toISOString().slice(0, 10);
      const ttl = 26 * 3600;
      const ipCount = await opts.store.incr(`ip:${day}:${ip}`, ttl);
      if (ipCount > opts.perIpPerDay) return false;
      const all = await opts.store.incr(`all:${day}`, ttl);
      return all <= opts.globalPerDay;
    },
  };
}
