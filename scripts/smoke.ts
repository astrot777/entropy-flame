// Written with Claude (Anthropic) as an SI coding assistant; reviewed by the team.
// Usage: npx tsx scripts/smoke.ts https://<app>.azurewebsites.net
export async function smoke(baseUrl: string): Promise<string[]> {
  const base = baseUrl.replace(/\/$/, '');
  const failed: string[] = [];
  const bodies: string[] = [];
  const check = async (name: string, fn: () => Promise<boolean>) => {
    try { if (!(await fn())) failed.push(name); } catch (e) { failed.push(`${name} (${(e as Error).message})`); }
  };
  await check('GET / is 200 without login', async () => {
    const r = await fetch(`${base}/`);
    bodies.push(await r.text());
    return r.status === 200;
  });
  await check('data file is JSON with rows', async () => {
    const r = await fetch(`${base}/investigations.json`);
    const t = await r.text();
    bodies.push(t);
    const j = JSON.parse(t) as { rows?: unknown[] };
    return r.ok && Array.isArray(j.rows) && j.rows.length > 0;
  });
  await check('POST /api/add bad id is 400 bad_id', async () => {
    const r = await fetch(`${base}/api/add`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: 'x' }) });
    const t = await r.text();
    bodies.push(t);
    return r.status === 400 && JSON.parse(t).code === 'bad_id';
  });
  await check('no key material in any response', async () => bodies.every((b) => !/sk-ant|x-api-key/i.test(b)));
  return failed;
}

const url = process.argv[2];
if (url) {
  const failed = await smoke(url);
  console.log(failed.length ? `FAILED:\n- ${failed.join('\n- ')}` : 'smoke: all checks passed');
  process.exit(failed.length ? 1 : 0);
}
