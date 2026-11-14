// Draws the 3D schematic described by a SceneSpec. Loaded on demand, so the catalogue stays light.
// Honesty rules: stated parts are coloured, "Not stated" parts are grey wireframes, nothing is drawn
// that the row does not state (no flame is drawn: PSI gives no flame geometry). Not to scale.
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { charMaterial, glowTexture, probeMaterial, sampleMaterial, sensorMaterial } from './materials';
import type { PartKey, SceneSpec } from './spec';

export interface SceneHandle {
  dispose(): void;
  highlight(part: PartKey | null): void;
  /** Shows one test's values (labels, airflow speed, sample size), or restores the overview when step is null. */
  replay(step: SceneSpec | null, maxSampleSize?: number): void;
  /** One instant of a test: how strongly it glows (0 to 1), the sample scale, the burned share of a sheet, a state caption. */
  moment(m: { glow: number; scale?: number; burned?: number; state?: string } | null): void;
  setLabel(part: PartKey, text: string, stated?: boolean): void;
}

const FLAME = 0xff8a3d;
const COOL = 0x5fb3ff;
const OK = 0x4cc38a;
const GREY = 0x5b6778;
const BOX = { x: 3.2, y: 1.7, z: 1.7 };
const LABELS: Record<PartKey, string> = {
  type: 'Type', fuel: 'Fuel', sample: 'Sample', oxygen: 'Oxygen', pressure: 'Pressure',
  airflow: 'Airflow', hardware: 'Hardware', sensors: 'Sensor',
};
const short = (s: string, n = 44) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

export function mountScene(container: HTMLElement, spec: SceneSpec, onPick: (part: PartKey) => void): SceneHandle {
  const reduceMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  camera.position.set(6.7, 3.4, 8.0);

  const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  container.append(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 's3d-labels';
  container.append(labels.domElement);

  const controls = new OrbitControls(camera, labels.domElement);
  controls.enableDamping = true;
  controls.minDistance = 4;
  controls.maxDistance = 16;
  controls.autoRotate = !reduceMotion;
  controls.autoRotateSpeed = 1.5;
  controls.addEventListener('start', () => { controls.autoRotate = false; });

  // A neutral studio environment gives the glass, liquid and metal surfaces something to reflect.
  const pmrem = new THREE.PMREMGenerator(renderer);
  const envMap = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;
  scene.environmentIntensity = 0.55;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  scene.add(new THREE.AmbientLight(0xffffff, 0.45));
  const sun = new THREE.DirectionalLight(0xffffff, 1.4);
  sun.position.set(3, 5, 4);
  scene.add(sun);
  const grid = new THREE.GridHelper(16, 16, 0x243042, 0x18202b);
  grid.position.y = -BOX.y - 0.02;
  scene.add(grid);

  const pickables: THREE.Object3D[] = [];
  const labelEls = new Map<PartKey, HTMLElement[]>();
  const tick: ((t: number, dt: number) => void)[] = [];
  let replaying = false;
  let scaleTarget = 1;
  const burn = { glow: 0, frontX: 0, sheetLen: 0, char: null as THREE.Mesh | null };
  const flow = { lo: spec.airflow.min ?? 10, hi: spec.airflow.max ?? spec.airflow.min ?? 10, streaks: null as THREE.LineSegments | null };

  function tag(obj: THREE.Object3D, part: PartKey) {
    obj.userData.part = part;
    pickables.push(obj);
    return obj;
  }
  function label(part: PartKey, text: string, at: THREE.Vector3, isStated = spec.parts[part].stated) {
    const div = document.createElement('button');
    div.type = 'button';
    div.className = `s3d-label${isStated ? '' : ' ns'}`;
    div.dataset.part = part;
    div.textContent = text;
    div.addEventListener('click', () => onPick(part));
    labelEls.set(part, [...(labelEls.get(part) ?? []), div]);
    const o = new CSS2DObject(div);
    o.position.copy(at);
    scene.add(o);
  }
  const solid = (color: number) => new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 0.28, roughness: 0.45, metalness: 0.1 });
  const ghost = () => new THREE.MeshBasicMaterial({ color: GREY, wireframe: true, transparent: true, opacity: 0.55 });
  const partLabel = (p: PartKey) => `${LABELS[p]} · ${short(spec.parts[p].text)}`;

  // Hardware: the enclosure the experiment ran in.
  {
    const hw = spec.parts.hardware.stated;
    const geo = new THREE.BoxGeometry(BOX.x * 2, BOX.y * 2, BOX.z * 2);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      hw ? new THREE.LineBasicMaterial({ color: COOL, transparent: true, opacity: 0.85 })
         : new THREE.LineDashedMaterial({ color: GREY, dashSize: 0.18, gapSize: 0.14 }),
    );
    edges.computeLineDistances();
    scene.add(edges);
    const faces = new THREE.Mesh(geo, new THREE.MeshBasicMaterial({ color: hw ? COOL : GREY, transparent: true, opacity: 0.035, side: THREE.BackSide, depthWrite: false }));
    scene.add(tag(faces, 'hardware'));
    label('hardware', partLabel('hardware'), new THREE.Vector3(0, BOX.y + 0.6, 0));
  }

  // Oxygen and pressure: the stated atmosphere, shown as two probes on the enclosure.
  for (const [part, x] of [['oxygen', -BOX.x], ['pressure', BOX.x]] as [PartKey, number][]) {
    const on = spec.parts[part].stated;
    const probe = new THREE.Mesh(new THREE.OctahedronGeometry(0.13), on ? probeMaterial() : ghost());
    probe.position.set(x, BOX.y, BOX.z);
    scene.add(tag(probe, part));
    if (on && !reduceMotion) tick.push((t) => { probe.rotation.y = t * 0.9; });
    label(part, partLabel(part), new THREE.Vector3(x, BOX.y + 0.3, BOX.z));
  }

  // Sample and fuel: what burned, in the form NASA states.
  const sample = buildSample();
  scene.add(sample);
  label('sample', partLabel('sample'), new THREE.Vector3(0, -1.05, 0));
  label('fuel', partLabel('fuel'), new THREE.Vector3(0, 0.82, 0));

  function buildSample(): THREE.Object3D {
    const s = spec.sample;
    const fuelOn = spec.parts.fuel.stated;
    const sizes = [...s.sizes].sort((a, b) => b - a);
    const mat = (repeat?: [number, number]) => (s.stated ? sampleMaterial(s.surface, fuelOn, repeat) : ghost());
    const group = new THREE.Group();
    let mesh: THREE.Object3D;
    if (!s.stated) {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.55, 1), ghost());
    } else if (s.shape === 'sheet') {
      const aspect = sizes.length >= 2 ? clamp(sizes[0] / sizes[1], 1, 4.5) : 2;
      const len = 2.6;
      const h = len / aspect;
      mesh = new THREE.Mesh(new THREE.BoxGeometry(len, h, 0.04), mat([6, 6 / aspect]));
      // The burned part of the sheet grows from the upstream edge as a test plays.
      const charGeo = new THREE.BoxGeometry(len, h * 1.004, 0.052);
      charGeo.translate(len / 2, 0, 0);
      const charred = new THREE.Mesh(charGeo, charMaterial([6, 6 / aspect]));
      charred.position.x = -len / 2;
      charred.visible = false;
      group.add(charred);
      burn.char = charred;
      burn.sheetLen = len;
    } else if (s.shape === 'rod') {
      mesh = new THREE.Mesh(new THREE.CylinderGeometry(0.11, 0.11, 2.2, 32), mat([4, 1]));
      mesh.rotation.z = Math.PI / 2;
    } else if (s.shape === 'burner') {
      const g = new THREE.Group();
      const tube = new THREE.Mesh(new THREE.CylinderGeometry(0.32, 0.32, 1.1, 48, 1, true), mat([2, 1]));
      const top = new THREE.Mesh(new THREE.CircleGeometry(0.32, 48), mat([1, 1]));
      top.rotation.x = -Math.PI / 2;
      top.position.y = 0.55;
      g.add(tube, top);
      g.position.y = -0.55;
      mesh = g;
    } else if (s.shape === 'particles') {
      const n = 420;
      const pos = new Float32Array(n * 3);
      for (let i = 0; i < n; i++) {
        const v = new THREE.Vector3().randomDirection().multiplyScalar(0.25 + Math.random() * 0.75);
        pos.set([v.x, v.y, v.z], i * 3);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      mesh = new THREE.Points(geo, new THREE.PointsMaterial({ color: FLAME, size: 0.05, transparent: true, opacity: 0.9 }));
      if (!reduceMotion) tick.push((t) => { mesh.rotation.y = t * 0.25; });
    } else if (s.shape === 'sphere') {
      mesh = new THREE.Mesh(new THREE.SphereGeometry(0.55, 64, 48), mat([3, 2]));
    } else {
      mesh = new THREE.Mesh(new THREE.IcosahedronGeometry(0.5, 0), mat([1, 1]));
    }
    // A stated size range (for example droplet diameters 1.5 to 5 mm) sweeps between its smallest and largest value.
    if (s.stated && sizes.length >= 2 && (s.shape === 'sphere' || s.shape === 'burner') && !reduceMotion) {
      const lo = clamp(sizes[sizes.length - 1] / sizes[0], 0.3, 1);
      tick.push((t) => { if (!replaying) scaleTarget = lo + (1 - lo) * (0.5 + 0.5 * Math.sin(t * 0.9)); });
    }
    group.add(mesh);
    mesh.traverse((o) => { if ((o as THREE.Mesh).isMesh || (o as THREE.Points).isPoints) tag(o, 'sample'); });
    // Invisible, generous pick target so thin samples are easy to click.
    tag(group.add(new THREE.Mesh(new THREE.SphereGeometry(0.7), new THREE.MeshBasicMaterial({ visible: false }))).children.at(-1)!, 'sample');
    return group;
  }

  // Airflow: tracer particles move at a speed set by the stated value; a range sweeps from its minimum to its maximum.
  {
    const a = spec.airflow;
    const arrow = new THREE.ArrowHelper(new THREE.Vector3(1, 0, 0), new THREE.Vector3(-BOX.x - 1.5, -BOX.y + 0.35, 0), 1.3, a.stated ? COOL : GREY, 0.3, 0.16);
    scene.add(arrow);
    arrow.traverse((o) => tag(o, 'airflow'));
    label('airflow', partLabel('airflow'), new THREE.Vector3(-BOX.x - 0.85, -BOX.y + 0.75, 0));
    if (a.stated && !a.quiescent) {
      const n = 420;
      const xs = new Float32Array(n);
      const home = new Float32Array(n * 2);
      for (let i = 0; i < n; i++) {
        xs[i] = (Math.random() * 2 - 1) * BOX.x;
        home[i * 2] = (Math.random() * 2 - 1) * (BOX.y - 0.1);
        home[i * 2 + 1] = (Math.random() * 2 - 1) * (BOX.z - 0.1);
      }
      const pos = new Float32Array(n * 6);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
      const streaks = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: COOL, transparent: true, opacity: 0.55, blending: THREE.AdditiveBlending, depthWrite: false }));
      scene.add(streaks);
      flow.streaks = streaks;
      const visual = (v: number) => (v <= 0 ? 0 : 0.3 + 0.6 * Math.log10(1 + v));
      const place = (t: number, dt: number) => {
        const speed = visual(flow.lo + (flow.hi - flow.lo) * (0.5 + 0.5 * Math.sin(t * 0.5)));
        const tail = 0.08 + speed * 0.22;
        for (let i = 0; i < n; i++) {
          let x = xs[i] + speed * dt;
          if (x > BOX.x) x = -BOX.x;
          xs[i] = x;
          const y0 = home[i * 2];
          const z0 = home[i * 2 + 1];
          // Tracers bend around the sample; a schematic deflection, not a flow simulation.
          const r = Math.hypot(y0, z0) || 0.001;
          const bend = (px: number) => Math.max(0, 0.75 - r) * Math.exp(-(px * px) / 0.9);
          const x1 = Math.max(-BOX.x, x - tail);
          pos.set([x, y0 + (y0 / r) * bend(x), z0 + (z0 / r) * bend(x), x1, y0 + (y0 / r) * bend(x1), z0 + (z0 / r) * bend(x1)], i * 6);
        }
        geo.attributes.position.needsUpdate = true;
      };
      place(0, 0);
      // The tracers always animate while a test is replayed, so each test's speed is visible.
      tick.push((t, dt) => { if (!reduceMotion || replaying) place(t, dt); });
    }
  }

  // Sensors: one device per instrument NASA names, aimed at the sample.
  {
    const items = spec.sensors.length ? spec.sensors : ['Not stated'];
    const on = spec.sensors.length > 0;
    items.forEach((name, i) => {
      const x = items.length === 1 ? -1.7 : -2.3 + (4.6 * i) / (items.length - 1);
      const at = new THREE.Vector3(x, 1.25, i % 2 ? 1.3 : -1.3);
      const cone = new THREE.Mesh(new THREE.ConeGeometry(0.13, 0.36, 28), on ? sensorMaterial() : ghost());
      cone.position.copy(at);
      cone.lookAt(0, 0, 0);
      cone.rotateX(-Math.PI / 2);
      scene.add(tag(cone, 'sensors'));
      const sight = new THREE.Line(
        new THREE.BufferGeometry().setFromPoints([at, new THREE.Vector3(0, 0, 0)]),
        new THREE.LineDashedMaterial({ color: on ? OK : GREY, dashSize: 0.1, gapSize: 0.1, transparent: true, opacity: 0.35 }),
      );
      sight.computeLineDistances();
      scene.add(sight);
      label('sensors', `${LABELS.sensors} · ${short(name, 34)}`, at.clone().add(new THREE.Vector3(0, 0.34, 0)), on);
    });
  }

  // Type: a ground study gets a gravity arrow; a microgravity study gets none.
  {
    const at = spec.gravity === 'ground' ? new THREE.Vector3(BOX.x + 0.55, 0.85, 0) : new THREE.Vector3(BOX.x, BOX.y + 0.3, -BOX.z);
    if (spec.gravity === 'ground') {
      const g = new THREE.ArrowHelper(new THREE.Vector3(0, -1, 0), new THREE.Vector3(BOX.x + 0.55, 0.6, 0), 1.3, 0xe5b454, 0.3, 0.16);
      scene.add(g);
      g.traverse((o) => tag(o, 'type'));
    }
    label('type', spec.gravity === 'ground' ? `1 g · ${short(spec.parts.type.text, 30)}` : partLabel('type'), at);
  }

  // Burning: a glow and a warm light mark when a test was burning (its stated burn time). The glow says "when",
  // not "what shape": PSI gives no flame geometry.
  const haloMat = new THREE.SpriteMaterial({ map: glowTexture(), color: 0xffffff, transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(2.4);
  scene.add(halo);
  const fire = new THREE.PointLight(FLAME, 0, 7, 1.6);
  scene.add(fire);
  const stateEl = document.createElement('div');
  stateEl.className = 's3d-state';
  stateEl.hidden = true;
  const stateObj = new CSS2DObject(stateEl);
  stateObj.position.set(0, -1.5, 0);
  scene.add(stateObj);
  tick.push((t, dt) => {
    const k = Math.min(1, dt * 9);
    sample.scale.setScalar(sample.scale.x + (scaleTarget - sample.scale.x) * k);
    const flicker = 0.86 + 0.14 * Math.sin(t * 19) * Math.sin(t * 7.3);
    haloMat.opacity += (burn.glow * flicker * 0.95 - haloMat.opacity) * k;
    halo.position.x += (burn.frontX - halo.position.x) * k;
    halo.scale.setScalar((1.5 + 1.3 * burn.glow) * (0.6 + 0.4 * sample.scale.x) * flicker);
    fire.position.set(halo.position.x, 0.2, 0.6);
    fire.intensity = haloMat.opacity * 9;
  });

  // Picking: a click (not a drag) on a part selects it; the enclosure is chosen only when nothing else is hit.
  const ray = new THREE.Raycaster();
  ray.params.Points = { threshold: 0.08 };
  let down: { x: number; y: number } | null = null;
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || (e.target as HTMLElement).closest('.s3d-label')) return;
    const r = container.getBoundingClientRect();
    ray.setFromCamera(new THREE.Vector2(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1), camera);
    const hits = ray.intersectObjects(pickables, false).map((h) => h.object.userData.part as PartKey);
    const part = hits.find((p) => p !== 'hardware') ?? hits[0];
    if (part) onPick(part);
  };
  labels.domElement.addEventListener('pointerdown', onDown);
  labels.domElement.addEventListener('pointerup', onUp);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;
    for (const f of tick) f(t, dt);
    controls.update();
    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  loop();

  const REPLAYED: PartKey[] = ['fuel', 'sample', 'oxygen', 'pressure', 'airflow'];
  function showParts(from: SceneSpec) {
    for (const p of REPLAYED) {
      const elp = labelEls.get(p)?.[0];
      if (!elp) continue;
      elp.textContent = `${LABELS[p]} · ${short(from.parts[p].text)}`;
      elp.classList.toggle('ns', !from.parts[p].stated);
    }
  }

  return {
    replay(step, maxSampleSize) {
      replaying = step !== null;
      const shown = step ?? spec;
      showParts(shown);
      flow.lo = shown.airflow.min ?? 10;
      flow.hi = shown.airflow.max ?? flow.lo;
      if (flow.streaks) flow.streaks.visible = shown.airflow.stated && !shown.airflow.quiescent;
      const size = step?.sample.sizes.length ? Math.max(...step.sample.sizes) : 0;
      scaleTarget = size && maxSampleSize ? clamp(size / maxSampleSize, 0.25, 1) : 1;
    },
    moment(m) {
      burn.glow = m?.glow ?? 0;
      if (m?.scale !== undefined) scaleTarget = m.scale;
      const burned = m?.burned;
      if (burn.char) {
        burn.char.visible = burned !== undefined && burned > 0.002;
        if (burn.char.visible) burn.char.scale.x = burned!;
      }
      burn.frontX = burned !== undefined && burn.sheetLen ? -burn.sheetLen / 2 + burned * burn.sheetLen : 0;
      stateEl.textContent = m?.state ?? '';
      stateEl.hidden = !m?.state;
    },
    setLabel(part, text, stated = true) {
      const e = labelEls.get(part)?.[0];
      if (!e) return;
      e.textContent = `${LABELS[part]} · ${short(text)}`;
      e.classList.toggle('ns', !stated);
    },
    highlight(part) {
      for (const [p, els] of labelEls) for (const e of els) e.classList.toggle('active', p === part);
    },
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      controls.dispose();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
          (mat as THREE.MeshStandardMaterial).map?.dispose?.();
          mat.dispose?.();
        }
      });
      envMap.dispose();
      pmrem.dispose();
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
