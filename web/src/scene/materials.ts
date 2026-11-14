// Surface textures for the 3D schematic. All of them are drawn in code on a canvas (no image files),
// and they are illustrative: the stated material words pick the kind of surface, nothing more.
import * as THREE from 'three';
import type { Surface } from './spec';

function canvasTexture(size: number, draw: (g: CanvasRenderingContext2D, n: number) => void, repeat: [number, number] = [1, 1]): THREE.CanvasTexture {
  const canvas = document.createElement('canvas');
  canvas.width = canvas.height = size;
  draw(canvas.getContext('2d')!, size);
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.repeat.set(...repeat);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** A plain weave: warp and weft threads with a little shading and irregularity. */
function weave(repeat: [number, number]): THREE.CanvasTexture {
  return canvasTexture(256, (g, n) => {
    g.fillStyle = '#b9ab8f';
    g.fillRect(0, 0, n, n);
    const step = n / 16;
    for (let y = 0; y < 16; y++) {
      for (let x = 0; x < 16; x++) {
        const over = (x + y) % 2 === 0;
        const jitter = Math.floor(Math.random() * 14);
        const base = over ? 222 - jitter : 196 - jitter;
        g.fillStyle = `rgb(${base}, ${base - 12}, ${base - 40})`;
        if (over) g.fillRect(x * step + 1, y * step, step - 2, step);
        else g.fillRect(x * step, y * step + 1, step, step - 2);
        g.fillStyle = 'rgba(0,0,0,0.16)';
        if (over) g.fillRect(x * step + step - 2, y * step, 1, step);
        else g.fillRect(x * step, y * step + step - 2, step, 1);
      }
    }
  }, repeat);
}

function brushed(): THREE.CanvasTexture {
  return canvasTexture(256, (g, n) => {
    g.fillStyle = '#9aa3ad';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 900; i++) {
      const v = 120 + Math.floor(Math.random() * 110);
      g.fillStyle = `rgba(${v},${v + 4},${v + 10},0.22)`;
      g.fillRect(0, Math.random() * n, n, 1);
    }
  }, [2, 2]);
}

/** Charred fabric: near-black with cracks of ember. */
function char(repeat: [number, number]): THREE.CanvasTexture {
  return canvasTexture(256, (g, n) => {
    g.fillStyle = '#17110d';
    g.fillRect(0, 0, n, n);
    for (let i = 0; i < 2600; i++) {
      const v = 14 + Math.floor(Math.random() * 34);
      g.fillStyle = `rgb(${v + 6},${v},${v - 4})`;
      g.fillRect(Math.random() * n, Math.random() * n, 2 + Math.random() * 5, 2 + Math.random() * 3);
    }
    for (let i = 0; i < 70; i++) {
      g.fillStyle = `rgba(255,${90 + Math.floor(Math.random() * 90)},40,${0.25 + Math.random() * 0.5})`;
      g.fillRect(Math.random() * n, Math.random() * n, 1 + Math.random() * 3, 1);
    }
  }, repeat);
}

/** A soft radial glow, used to mark when a test was burning. */
export function glowTexture(): THREE.CanvasTexture {
  const tex = canvasTexture(256, (g, n) => {
    const r = g.createRadialGradient(n / 2, n / 2, 0, n / 2, n / 2, n / 2);
    r.addColorStop(0, 'rgba(255,244,214,1)');
    r.addColorStop(0.18, 'rgba(255,176,92,0.85)');
    r.addColorStop(0.5, 'rgba(255,110,40,0.28)');
    r.addColorStop(1, 'rgba(255,90,20,0)');
    g.fillStyle = r;
    g.fillRect(0, 0, n, n);
  });
  tex.wrapS = tex.wrapT = THREE.ClampToEdgeWrapping;
  return tex;
}

export function charMaterial(repeat: [number, number]): THREE.Material {
  return new THREE.MeshStandardMaterial({ map: char(repeat), roughness: 1, metalness: 0, emissive: 0xff5a1e, emissiveIntensity: 0.025 });
}

/** The material for a stated sample. hasFuel is false when the row states a sample but no fuel. */
export function sampleMaterial(surface: Surface, hasFuel: boolean, repeat: [number, number] = [5, 2.5]): THREE.Material {
  switch (surface) {
    case 'fabric': {
      const map = weave(repeat);
      return new THREE.MeshStandardMaterial({ map, bumpMap: map, bumpScale: 0.6, roughness: 0.95, metalness: 0, side: THREE.DoubleSide });
    }
    case 'polymer':
      return new THREE.MeshPhysicalMaterial({ color: 0xe6f1fb, transmission: 0.88, thickness: 0.5, ior: 1.49, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.05 });
    case 'liquid':
      return new THREE.MeshPhysicalMaterial({ color: 0xffe2b0, transmission: 0.72, thickness: 0.9, ior: 1.38, roughness: 0.02, clearcoat: 1, attenuationColor: new THREE.Color(0xffa040), attenuationDistance: 1.4 });
    case 'metal': {
      const map = brushed();
      return new THREE.MeshStandardMaterial({ map, color: 0xcfd6dd, metalness: 0.92, roughness: 0.34, side: THREE.DoubleSide });
    }
    default:
      return new THREE.MeshStandardMaterial({ color: hasFuel ? 0xff8a3d : 0xb9c4d0, emissive: hasFuel ? 0xff8a3d : 0x000000, emissiveIntensity: 0.22, roughness: 0.4, metalness: 0.15 });
  }
}

export function sensorMaterial(): THREE.Material {
  return new THREE.MeshStandardMaterial({ color: 0x2f9e6e, emissive: 0x4cc38a, emissiveIntensity: 0.35, metalness: 0.7, roughness: 0.3 });
}
export function probeMaterial(): THREE.Material {
  return new THREE.MeshPhysicalMaterial({ color: 0x5fb3ff, emissive: 0x5fb3ff, emissiveIntensity: 0.3, metalness: 0.2, roughness: 0.1, clearcoat: 1 });
}
