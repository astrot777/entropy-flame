import { describe, it, expect } from 'vitest';
import { createLimiter, memoryStore } from '../../src/api/limit';

describe('createLimiter', () => {
  it('resets on the next UTC day', async () => {
    let t = Date.UTC(2026, 10, 14, 12);
    const limiter = createLimiter({ store: memoryStore(() => t), perIpPerDay: 1, globalPerDay: 100, now: () => t });
    expect(await limiter.allow('1.1.1.1')).toBe(true);
    expect(await limiter.allow('1.1.1.1')).toBe(false);
    t += 24 * 3600 * 1000;
    expect(await limiter.allow('1.1.1.1')).toBe(true);
  });
  it('enforces the global cap across visitors', async () => {
    const limiter = createLimiter({ store: memoryStore(), perIpPerDay: 10, globalPerDay: 2 });
    expect(await limiter.allow('a')).toBe(true);
    expect(await limiter.allow('b')).toBe(true);
    expect(await limiter.allow('c')).toBe(false);
  });
});
