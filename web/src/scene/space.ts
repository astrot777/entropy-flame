// The space map: Earth beneath the viewer, the Moon far away, and the project's markers above the globe.
// Same pipeline as the experiment view (view.ts): one WebGLRenderer with ACES tone mapping, a CSS2D label
// layer, one requestAnimationFrame loop, and the glow texture from materials.ts. Loaded on demand.
// Marker positions are a layout, not locations. Every value a panel shows comes from mapdata.ts.
import * as THREE from 'three';
import { TrackballControls } from 'three/addons/controls/TrackballControls.js';
import { CSS2DObject, CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { glowTexture } from './materials';
import type { MapMarker } from './mapdata';

export interface SpaceHandle {
  dispose(): void;
  setTab(tab: string): void;
  /** Closes the open panel; false when none was open. */
  closePanel(): boolean;
  resetView(): void;
  /** Moves the camera out to look at the Moon. */
  viewMoon(): void;
  /** Read-only state for checks: what exists in the scene right now. */
  state(): { tab: string; markers: number; panel: boolean; cameraDistance: number; fps: number; flying: boolean };
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  /** Opens the panel of a marker as a click would. */
  pick(id: string): void;
}

const EARTH_R = 100;
const MOON = { position: new THREE.Vector3(-1400, 520, -1800), radius: 27 };
const MARKER = 0x16c784;
const HOME = new THREE.Vector3(0, 110, 300);
const FLIGHT_MS = 1400;
const FADE_MS = 250;
const easeInOutCubic = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

function onGlobe(lat: number, lon: number, r: number): THREE.Vector3 {
  const phi = (lat * Math.PI) / 180;
  const theta = (lon * Math.PI) / 180;
  return new THREE.Vector3(r * Math.cos(phi) * Math.sin(theta), r * Math.sin(phi), r * Math.cos(phi) * Math.cos(theta));
}

function drawPanel(marker: MapMarker): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = 960;
  canvas.height = 600;
  const g = canvas.getContext('2d')!;
  g.fillStyle = 'rgba(11, 19, 43, 0.94)';
  g.beginPath();
  g.roundRect(4, 4, 952, 592, 26);
  g.fill();
  g.lineWidth = 4;
  g.strokeStyle = '#d8a844';
  g.stroke();
  const fit = (text: string, width: number) => {
    if (g.measureText(text).width <= width) return text;
    let t = text;
    while (t.length > 1 && g.measureText(`${t}...`).width > width) t = t.slice(0, -1);
    return `${t}...`;
  };
  g.textBaseline = 'alphabetic';
  g.fillStyle = '#d8a844';
  g.font = '600 24px Orbitron, Raleway, sans-serif';
  g.fillText(marker.tab.toUpperCase(), 44, 62);
  g.fillStyle = '#ffffff';
  g.font = '700 44px Raleway, sans-serif';
  g.fillText(fit(marker.label, 872), 44, 118);
  const rows = marker.fields.slice(0, 9);
  const step = Math.min(50, 380 / Math.max(rows.length, 1));
  rows.forEach((f, i) => {
    const y = 172 + i * step;
    g.fillStyle = '#16c784';
    g.font = '600 24px Raleway, sans-serif';
    g.fillText(fit(f.name, 220), 44, y);
    g.fillStyle = '#eef1f8';
    g.font = '500 26px Raleway, sans-serif';
    g.fillText(fit(f.value, 640), 280, y);
  });
  const sources = [...new Set(marker.fields.map((f) => f.source))].join(', ');
  g.fillStyle = '#a3acc4';
  g.font = '400 20px "IBM Plex Mono", monospace';
  g.fillText(fit(`Source: ${sources}`, 872), 44, 566);
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

export function mountSpace(container: HTMLElement, markers: MapMarker[], firstTab: string, onTab?: (tab: string) => void): SpaceHandle {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(45, 1, 1, 30000);
  camera.position.copy(HOME);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.0;
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  renderer.setClearColor(0x02040a, 1);
  container.append(renderer.domElement);
  const labels = new CSS2DRenderer();
  labels.domElement.className = 's3d-labels';
  container.append(labels.domElement);

  // Free camera: orbit from any angle (no pitch clamp), pan, zoom, with inertia.
  const controls = new TrackballControls(camera, labels.domElement);
  controls.rotateSpeed = 2.4;
  controls.zoomSpeed = 1.1;
  controls.panSpeed = 0.5;
  controls.dynamicDampingFactor = 0.1536; // rotation keeps 0.92 of its speed each frame
  controls.minDistance = 130;
  controls.maxDistance = 3000;
  let dragging = false;
  controls.addEventListener('start', () => { dragging = true; });
  controls.addEventListener('end', () => { dragging = false; });

  // Light: one sun, a dim fill, no fog.
  const sun = new THREE.DirectionalLight(0xfff6e5, 2.4);
  sun.position.set(400, 180, 300);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  Object.assign(sun.shadow.camera, { left: -180, right: 180, top: 180, bottom: -180, near: 50, far: 1200 });
  scene.add(sun, new THREE.AmbientLight(0x22304a, 0.12));

  const loader = new THREE.TextureLoader();
  const map = (file: string) => {
    const t = loader.load(`assets/${file}`);
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 8;
    return t;
  };

  // Earth, with the markers as its children so they turn with it.
  const earthGroup = new THREE.Group();
  const earth = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R, 128, 96), new THREE.MeshStandardMaterial({ map: map('earth-blue-marble-4k.jpg'), roughness: 0.92, metalness: 0 }));
  earth.name = 'earth';
  earth.castShadow = true;
  earth.receiveShadow = true;
  earthGroup.add(earth);
  scene.add(earthGroup);

  // Atmosphere: a Fresnel rim.
  const rim = new THREE.Mesh(new THREE.SphereGeometry(EARTH_R * 1.035, 96, 72), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { tint: { value: new THREE.Color(0x4fa3ff) } },
    vertexShader: 'varying vec3 vN; varying vec3 vV; void main(){ vec4 mv = modelViewMatrix * vec4(position,1.0); vN = normalize(normalMatrix * normal); vV = normalize(-mv.xyz); gl_Position = projectionMatrix * mv; }',
    fragmentShader: 'uniform vec3 tint; varying vec3 vN; varying vec3 vV; void main(){ float f = pow(1.0 - max(dot(vN, vV), 0.0), 3.0); gl_FragColor = vec4(tint, min(f, 0.55)); }',
  }));
  rim.name = 'atmosphere';
  scene.add(rim);

  const moon = new THREE.Mesh(new THREE.SphereGeometry(MOON.radius, 64, 48), new THREE.MeshStandardMaterial({ map: map('moon-lroc-2k.jpg'), roughness: 1, metalness: 0 }));
  moon.name = 'moon';
  moon.position.copy(MOON.position);
  moon.castShadow = true;
  moon.receiveShadow = true;
  scene.add(moon);

  // Stars: NASA's star map far behind, and a 12,000-point additive cloud in front of it.
  const sky = new THREE.Mesh(new THREE.SphereGeometry(14000, 48, 32), new THREE.MeshBasicMaterial({ map: map('stars-svs-1k.jpg'), side: THREE.BackSide, transparent: true, opacity: 0.55, toneMapped: false, depthWrite: false }));
  sky.name = 'sky';
  scene.add(sky);
  const starPos = new Float32Array(12000 * 3);
  for (let i = 0; i < 12000; i++) {
    const v = new THREE.Vector3().randomDirection().multiplyScalar(9000 + Math.random() * 3000);
    starPos.set([v.x, v.y, v.z], i * 3);
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  const stars = new THREE.Points(starGeo, new THREE.PointsMaterial({ color: 0xffffff, size: 1.7, sizeAttenuation: false, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending, depthWrite: false }));
  stars.name = 'starfield';
  scene.add(stars);

  // Markers: a glowing sphere on a beam, one set per tab.
  interface Built { data: MapMarker; group: THREE.Group; ball: THREE.Mesh; hit: THREE.Mesh; label: CSS2DObject; mats: (THREE.Material & { opacity: number })[]; scale: number }
  const glow = glowTexture();
  const ballGeo = new THREE.SphereGeometry(3.2, 24, 16);
  const hitGeo = new THREE.SphereGeometry(7, 12, 8);
  const built: Built[] = markers.filter((m) => m.kind === 'earth').map((data) => {
    const group = new THREE.Group();
    group.name = `marker:${data.id}`;
    const base = onGlobe(data.lat, data.lon, EARTH_R);
    const up = base.clone().normalize();
    const beamMat = new THREE.MeshBasicMaterial({ color: MARKER, transparent: true, opacity: 0.75 });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.4, data.radiusFromEarth, 8), beamMat);
    beam.position.copy(up.clone().multiplyScalar(EARTH_R + data.radiusFromEarth / 2));
    beam.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), up);
    const ballMat = new THREE.MeshStandardMaterial({ color: MARKER, emissive: MARKER, emissiveIntensity: 1.6, roughness: 0.4, transparent: true });
    const ball = new THREE.Mesh(ballGeo, ballMat);
    ball.position.copy(up.clone().multiplyScalar(EARTH_R + data.radiusFromEarth));
    const haloMat = new THREE.SpriteMaterial({ map: glow, color: MARKER, transparent: true, opacity: 0.8, blending: THREE.AdditiveBlending, depthWrite: false });
    const halo = new THREE.Sprite(haloMat);
    halo.scale.setScalar(16);
    ball.add(halo);
    const hit = new THREE.Mesh(hitGeo, new THREE.MeshBasicMaterial({ visible: false }));
    hit.position.copy(ball.position);
    hit.userData.id = data.id;
    const el = document.createElement('div');
    el.className = 's3d-label map-label';
    el.textContent = data.label;
    el.hidden = true;
    const label = new CSS2DObject(el);
    label.position.copy(up.clone().multiplyScalar(EARTH_R + data.radiusFromEarth + 9));
    group.add(beam, ball, hit, label);
    group.visible = false;
    earthGroup.add(group);
    return { data, group, ball, hit, label, mats: [beamMat, ballMat, haloMat], scale: 1 };
  });
  const baseOpacity = [0.75, 1, 0.8];

  let tab = firstTab;
  let fade = 1;
  let fadeFrom: { start: number; next: string } | null = null;
  let fadeIn = 0;
  const visible = () => built.filter((b) => b.data.tab === tab);
  const show = () => { for (const b of built) b.group.visible = b.data.tab === tab; };
  show();

  // The in-scene panel: one at a time, a textured plane that always faces the camera.
  let panel: THREE.Mesh | null = null;
  let panelOf: Built | null = null;
  function closePanel(): boolean {
    if (!panel) return false;
    scene.remove(panel);
    (panel.material as THREE.MeshBasicMaterial).map?.dispose();
    (panel.material as THREE.Material).dispose();
    panel.geometry.dispose();
    panel = null;
    panelOf = null;
    return true;
  }
  function openPanel(b: Built) {
    closePanel();
    panel = new THREE.Mesh(new THREE.PlaneGeometry(48, 30), new THREE.MeshBasicMaterial({ map: drawPanel(b.data), transparent: true, toneMapped: false, depthTest: false }));
    panel.name = 'panel';
    panel.renderOrder = 10;
    panelOf = b;
    scene.add(panel);
  }

  // Camera flight: 1.4 s, eased, along the sphere so it never cuts through the Earth.
  let flight: { start: number; fromDir: THREE.Vector3; toDir: THREE.Vector3; fromR: number; toR: number; fromTarget: THREE.Vector3 } | null = null;
  function flyTo(b: Built) {
    const world = b.ball.getWorldPosition(new THREE.Vector3());
    flight = {
      start: performance.now(), fromDir: camera.position.clone().normalize(), toDir: world.clone().normalize(),
      fromR: camera.position.length(), toR: 215, fromTarget: controls.target.clone(),
    };
    controls.enabled = false;
  }
  function pickBuilt(b: Built) {
    openPanel(b);
    flyTo(b);
  }

  const ray = new THREE.Raycaster();
  const pointer = new THREE.Vector2(2, 2);
  let hovered: Built | null = null;
  let down: { x: number; y: number } | null = null;
  const toNdc = (e: PointerEvent) => {
    const r = container.getBoundingClientRect();
    pointer.set(((e.clientX - r.left) / r.width) * 2 - 1, -((e.clientY - r.top) / r.height) * 2 + 1);
  };
  const under = (): Built | null => {
    ray.setFromCamera(pointer, camera);
    const hits = ray.intersectObjects([earth, ...visible().map((b) => b.hit)], false);
    const first = hits[0]?.object;
    return first && first !== earth ? built.find((b) => b.hit === first) ?? null : null;
  };
  const onMove = (e: PointerEvent) => { toNdc(e); };
  const onDown = (e: PointerEvent) => { down = { x: e.clientX, y: e.clientY }; };
  const onUp = (e: PointerEvent) => {
    if (!down || Math.hypot(e.clientX - down.x, e.clientY - down.y) > 5 || flight) return;
    toNdc(e);
    const b = under();
    if (b) pickBuilt(b);
  };
  labels.domElement.addEventListener('pointermove', onMove);
  labels.domElement.addEventListener('pointerdown', onDown);
  labels.domElement.addEventListener('pointerup', onUp);
  labels.domElement.addEventListener('contextmenu', (e) => e.preventDefault());

  function resetView() {
    flight = null;
    controls.enabled = true;
    controls.reset();
    camera.position.copy(HOME);
    controls.target.set(0, 0, 0);
    camera.up.set(0, 1, 0);
  }
  const onKey = (e: KeyboardEvent) => {
    if ((e.key === 'r' || e.key === 'R') && !(e.target as HTMLElement).closest?.('input, textarea')) resetView();
  };
  window.addEventListener('keydown', onKey);

  function resize() {
    const w = container.clientWidth || 1;
    const h = container.clientHeight || 1;
    camera.aspect = w / h;
    // The picture is shifted down so the globe sits low in the frame, like ground beneath the viewer.
    camera.setViewOffset(w, h, 0, -Math.round(h * 0.2), w, h);
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
    labels.setSize(w, h);
    controls.handleResize();
  }
  const observer = new ResizeObserver(resize);
  observer.observe(container);
  resize();

  const clock = new THREE.Clock();
  let frame = 0;
  let fps = 60;
  const loop = () => {
    frame = requestAnimationFrame(loop);
    const raw = clock.getDelta();
    const dt = Math.min(raw, 0.05);
    if (raw > 0) fps += (1 / raw - fps) * 0.05;
    const now = performance.now();

    // Earth turns at 0.05 rad/s; it holds still while the user drags, a panel is open or the camera flies.
    if (!dragging && !panel && !flight) earthGroup.rotation.y += 0.05 * dt;

    if (flight) {
      const t = Math.min(1, (now - flight.start) / FLIGHT_MS);
      const k = easeInOutCubic(t);
      const q = new THREE.Quaternion().setFromUnitVectors(flight.fromDir, flight.toDir);
      const dir = flight.fromDir.clone().applyQuaternion(new THREE.Quaternion().slerp(q, k));
      camera.position.copy(dir.multiplyScalar(flight.fromR + (flight.toR - flight.fromR) * k));
      controls.target.copy(flight.fromTarget).multiplyScalar(1 - k);
      camera.lookAt(controls.target);
      if (t >= 1) { flight = null; controls.enabled = true; }
    } else {
      controls.update();
    }

    // Tab change: fade the old set out, swap, fade the new set in. The camera is not touched.
    if (fadeFrom) {
      fade = Math.max(0, 1 - (now - fadeFrom.start) / FADE_MS);
      if (fade === 0) { tab = fadeFrom.next; fadeFrom = null; fadeIn = now; show(); onTab?.(tab); }
    } else if (fadeIn) {
      fade = Math.min(1, (now - fadeIn) / FADE_MS);
      if (fade === 1) fadeIn = 0;
    }

    const over = flight || fadeFrom ? null : under();
    if (over !== hovered) {
      if (hovered) hovered.label.element.hidden = true;
      hovered = over;
      if (hovered) hovered.label.element.hidden = false;
      labels.domElement.style.cursor = hovered ? 'pointer' : '';
    }
    for (const b of built) {
      if (!b.group.visible) continue;
      const target = b === hovered || b === panelOf ? 1.35 : 1;
      b.scale += (target - b.scale) * Math.min(1, dt * 14);
      b.ball.scale.setScalar(b.scale);
      b.mats.forEach((m, i) => { m.opacity = baseOpacity[i] * fade; });
    }

    if (panel && panelOf) {
      const world = panelOf.ball.getWorldPosition(new THREE.Vector3());
      const side = new THREE.Vector3().crossVectors(camera.up, world.clone().sub(camera.position)).normalize();
      panel.position.copy(world).addScaledVector(world.clone().normalize(), 10).addScaledVector(side, -30).addScaledVector(camera.up, 12);
      panel.quaternion.copy(camera.quaternion);
    }

    renderer.render(scene, camera);
    labels.render(scene, camera);
  };
  loop();

  return {
    scene,
    camera,
    setTab(next) {
      if (next === tab || fadeFrom) return;
      closePanel();
      fadeIn = 0;
      fadeFrom = { start: performance.now(), next };
    },
    closePanel,
    resetView,
    viewMoon() {
      closePanel();
      flight = null;
      controls.enabled = true;
      controls.target.copy(MOON.position);
      camera.position.copy(MOON.position).add(new THREE.Vector3(70, 25, 150));
      camera.up.set(0, 1, 0);
    },
    pick(id) {
      const b = built.find((x) => x.data.id === id);
      if (b) { if (b.data.tab !== tab) { tab = b.data.tab; show(); onTab?.(tab); } pickBuilt(b); }
    },
    state: () => ({ tab, markers: visible().length, panel: !!panel, cameraDistance: camera.position.length(), fps: Math.round(fps), flying: !!flight }),
    dispose() {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener('keydown', onKey);
      controls.dispose();
      closePanel();
      scene.traverse((o) => {
        const m = o as THREE.Mesh;
        m.geometry?.dispose?.();
        for (const mat of ([] as THREE.Material[]).concat(m.material ?? [])) {
          (mat as THREE.MeshStandardMaterial).map?.dispose?.();
          mat.dispose?.();
        }
      });
      renderer.dispose();
      renderer.domElement.remove();
      labels.domElement.remove();
    },
  };
}
