// Opens the Map view in a real browser, clicks three markers, and checks that each shows an in-scene panel
// whose facts open the source quote and the PSI link. Also measures FPS, takes screenshots, and reloads
// with every other host blocked. Playwright is not a project dependency: run it where it is installed.
// Usage: node scripts/map-check.cjs http://localhost:4179/ <output-folder>
const { chromium } = require('playwright');
const path = require('path');
const [base, out] = process.argv.slice(2);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const fail = [];
const check = (name, ok, detail = '') => { console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? '  ' + detail : ''}`); if (!ok) fail.push(name); };

(async () => {
  const b = await chromium.launch({ executablePath: process.env.CHROME_PATH || undefined, headless: true, args: ['--headless=new', '--use-angle=d3d11', '--ignore-gpu-blocklist', '--enable-gpu'] });
  const ctx = await b.newContext({ viewport: { width: 1920, height: 1080 } });
  const p = await ctx.newPage();
  const errors = [];
  p.on('pageerror', (e) => errors.push('pageerror: ' + e.message));
  p.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  const fps = (ms) => p.evaluate((ms) => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; performance.now() - t0 < ms ? requestAnimationFrame(f) : res(Math.round((n * 1000) / (performance.now() - t0))); }; requestAnimationFrame(f); }), ms);
  const state = () => p.evaluate(() => window.entropyMap.state());
  const open = async () => { await p.click('#open-map'); await p.waitForFunction(() => window.entropyMap && window.entropyMap.state().markers > 0, null, { timeout: 30000 }); await sleep(2500); };
  // Screen position of a visible marker on the near side of the Earth, skipping ones already used.
  const marker = (skip) => p.evaluate((skip) => {
    const m = window.entropyMap; const V = m.camera.position.constructor; let best = null;
    m.scene.traverse((o) => {
      if (!o.name.startsWith('marker:') || !o.visible || skip.includes(o.name)) return;
      const w = o.children[1].getWorldPosition(new V());
      const facing = w.clone().normalize().dot(m.camera.position.clone().normalize());
      if (facing < 0.3) return;
      const v = w.clone().project(m.camera); const r = document.querySelector('.map-stage').getBoundingClientRect();
      const pt = { name: o.name, x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height, facing };
      if (!best || facing > best.facing) best = pt;
    });
    return best;
  }, skip);
  // Screen position of fact row i on the open panel.
  const rowPoint = (i) => p.evaluate((i) => {
    const m = window.entropyMap; const panel = m.scene.getObjectByName('panel'); const V = m.camera.position.constructor;
    const local = new V((400 / 960 - 0.5) * 48, (0.5 - (160 + 34 * i - 8) / 600) * 30, 0);
    const v = panel.localToWorld(local).project(m.camera); const r = document.querySelector('.map-stage').getBoundingClientRect();
    return { x: r.left + ((v.x + 1) / 2) * r.width, y: r.top + ((1 - v.y) / 2) * r.height };
  }, i);

  await p.goto(base, { waitUntil: 'networkidle' });
  await open();
  const s0 = await state();
  check('map opens with one marker per investigation', s0.markers === 19, `markers=${s0.markers} groups=${s0.groups}`);
  const graph = await p.evaluate(() => { const s = window.entropyMap.scene; const tex = (n) => { const o = s.getObjectByName(n); return !!(o && o.material.map && o.material.map.image && o.material.map.image.width); }; return { earth: tex('earth'), moon: tex('moon'), sky: tex('sky'), stars: s.getObjectByName('starfield').geometry.attributes.position.count, moonAt: s.getObjectByName('moon').position.toArray() }; });
  check('Earth, Moon and stars exist with local textures', graph.earth && graph.moon && graph.sky && graph.stars === 12000, JSON.stringify(graph));
  await p.screenshot({ path: path.join(out, 'map-1-default.png') });

  const used = [];
  for (let n = 0; n < 3; n++) {
    const t = await marker(used);
    if (!t) { check(`marker ${n + 1} found`, false); break; }
    used.push(t.name);
    const d0 = (await state()).cameraDistance;
    await p.mouse.click(t.x, t.y);
    if (n === 0) { await sleep(700); await p.screenshot({ path: path.join(out, 'map-2-flight.png') }); await sleep(850); } else await sleep(1550);
    const s1 = await state();
    check(`marker ${n + 1} (${t.name}): in-scene panel after a 1.4 s flight`, s1.panel && !s1.flying, `distance ${Math.round(d0)} -> ${Math.round(s1.cameraDistance)}`);
    const pt = await rowPoint(10); // row 10 is Hardware, which every investigation states
    await p.mouse.click(pt.x, pt.y);
    await sleep(400);
    const src = await p.evaluate(() => { const el = document.querySelector('#panel'); if (!el || el.hidden) return null; const a = [...el.querySelectorAll('a')].find((x) => /PSI record/.test(x.textContent)); return { title: el.querySelector('h2')?.textContent, quote: el.querySelector('blockquote')?.textContent?.slice(0, 70), link: a ? a.href : null }; });
    check(`marker ${n + 1}: a fact opens its source quote and PSI link`, !!src && !!src.quote && /psi\.nasa\.gov/.test(src.link || ''), JSON.stringify(src));
    if (n === 0) await p.screenshot({ path: path.join(out, 'map-3-panel-and-source.png') });
    await p.keyboard.press('Escape');
    await sleep(200);
    check(`marker ${n + 1}: Esc closes the source panel first, the scene panel stays`, (await p.evaluate(() => document.querySelector('#panel').hidden)) && (await state()).panel);
    await p.keyboard.press('Escape');
    await sleep(200);
    check(`marker ${n + 1}: Esc then closes the scene panel, the map stays open`, !(await state()).panel && (await p.evaluate(() => !!document.querySelector('.xp.map'))));
  }

  const before = await p.evaluate(() => window.entropyMap.camera.position.toArray().map((v) => Math.round(v * 100) / 100));
  await p.click('.map-tabs button:has-text("Prevention")');
  await sleep(700);
  const afterTab = await p.evaluate(() => ({ s: window.entropyMap.state(), pos: window.entropyMap.camera.position.toArray().map((v) => Math.round(v * 100) / 100) }));
  check('a tab swaps the marker set and leaves the camera alone', afterTab.s.tab === 'Prevention' && afterTab.s.markers < 19 && JSON.stringify(before) === JSON.stringify(afterTab.pos), `markers=${afterTab.s.markers} camera ${JSON.stringify(before)} -> ${JSON.stringify(afterTab.pos)}`);
  await p.click('.map-tabs button:has-text("All")');
  await p.keyboard.press('r');
  await sleep(900);

  console.log('FPS idle 5 s:', await fps(5000));
  await p.mouse.move(900, 400);
  await p.mouse.down();
  const drag = (async () => { for (let i = 0; i < 150; i++) { await p.mouse.move(900 + Math.sin(i / 12) * 320, 400 + Math.cos(i / 9) * 110); await sleep(30); } })();
  const dragFps = await fps(4500);
  await drag;
  await p.mouse.up();
  console.log('FPS while dragging ~5 s:', dragFps);

  await p.click('.map-tabs button:has-text("Moon view")');
  await sleep(1200);
  await p.screenshot({ path: path.join(out, 'map-4-moon.png') });

  const blocked = [];
  await ctx.route('**/*', (route) => { const u = route.request().url(); if (u.startsWith(base)) return route.continue(); blocked.push(new URL(u).host); return route.abort(); });
  errors.length = 0;
  await p.reload({ waitUntil: 'domcontentloaded' });
  await open();
  const off = await p.evaluate(() => { const s = window.entropyMap.scene; const ok = (n) => { const o = s.getObjectByName(n); return !!(o.material.map.image && o.material.map.image.width); }; return { earth: ok('earth'), moon: ok('moon'), sky: ok('sky'), markers: window.entropyMap.state().markers }; });
  check('with every other host blocked, the scene still renders', off.earth && off.moon && off.sky && off.markers === 19, `blocked=${JSON.stringify([...new Set(blocked)])} ${JSON.stringify(off)}`);
  await p.screenshot({ path: path.join(out, 'map-5-offline.png') });
  check('no console errors (font requests blocked on purpose are ignored)', errors.filter((e) => !/ERR_FAILED|fonts\./.test(e)).length === 0, JSON.stringify(errors.slice(0, 3)));
  await b.close();
  console.log(fail.length ? `\n${fail.length} check(s) FAILED` : '\nAll checks passed.');
  process.exit(fail.length ? 1 : 0);
})().catch((e) => { console.error('FAILED', e.message); process.exit(1); });
