// SPDX-License-Identifier: Apache-2.0
//
// The halftone press. Every illustration in Stock & Foil is drawn once in greyscale and then
// screened into dots of a single ink at a fixed angle, so two canvases multiplied over each other
// give a real two-colour overprint. Nothing is an image file: the artwork is drawn from a record's
// own commitment hash, so the same record always prints the same tally.

/** Deterministic PRNG over a string seed — the same commitment always cuts the same notches. */
function xmur3(s: string): () => number {
  let h = 1779033703 ^ s.length;
  for (let i = 0; i < s.length; i++) {
    h = Math.imul(h ^ s.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return () => {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^= h >>> 16) >>> 0;
  };
}

function mulberry32(a: number): () => number {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export const rng = (seed: string): (() => number) => mulberry32(xmur3(seed)());

/** Greyscale value for an ink density in [0, 1]; the press turns density into dot radius. */
export const grey = (d: number): string => {
  const v = Math.round(255 * (1 - Math.max(0, Math.min(1, d))));
  return `rgb(${v},${v},${v})`;
};

/** A notch: its position along the stick and its width, which is the amount it records. */
export type Notch = [x: number, w: number];

/**
 * Exchequer notch widths, in the medieval scale: a palm's thickness for the largest unit, then
 * thumb, little finger, barleycorn, and a bare nick. How many and how wide comes from the hash.
 */
export function notches(hash: string): Notch[] {
  const r = rng(hash);
  const widths = [34, 22, 14, 9, 5];
  const out: Notch[] = [];
  let x = -270;
  const n = 7 + Math.floor(r() * 2);
  for (let i = 0; i < n; i++) {
    const w = widths[Math.floor(r() * widths.length)]!;
    x += 30 + r() * 42;
    if (x + w > 270) break;
    out.push([x, w]);
    x += w;
  }
  return out;
}

/** Notches cut into one half after the fact: they land in the gaps, with nothing beneath them. */
export function inflate(base: Notch[], k: number, seed: string): { all: Notch[]; extra: Notch[] } {
  const r = rng(seed);
  const all: Notch[] = base.map((n) => [n[0], n[1]]);
  const extra: Notch[] = [];
  for (let i = 0; i < k; i++) {
    all.sort((a, b) => a[0] - b[0]);
    let bi = -1;
    let bg = 0;
    for (let j = 0; j < all.length - 1; j++) {
      const gap = all[j + 1]![0] - (all[j]![0] + all[j]![1]);
      if (gap > bg) {
        bg = gap;
        bi = j;
      }
    }
    if (bi < 0 || bg < 36) break;
    const w = [9, 14, 22][Math.floor(r() * 3)]!;
    const x = all[bi]![0] + all[bi]![1] + (bg - w) / 2;
    all.push([x, w]);
    extra.push([x, w]);
  }
  all.sort((a, b) => a[0] - b[0]);
  return { all, extra };
}

/** The window of artwork space a layer prints: width is exact, height centres. */
export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Layer {
  color: string;
  angle?: number;
  cell?: number;
  seed?: string;
  view: View | (() => View);
  draw: (o: CanvasRenderingContext2D) => void;
}

/**
 * Renders one ink onto one canvas. The artwork is drawn into an offscreen greyscale buffer, then
 * sampled on a rotated lattice: each sample becomes a dot whose radius is the ink density there.
 */
export function press(canvas: HTMLCanvasElement, layer: Layer): void {
  const W = canvas.clientWidth;
  const H = canvas.clientHeight;
  if (!W || !H) return;
  const { color, angle = 15, cell = 4.4, seed = 's', draw } = layer;
  const view = typeof layer.view === 'function' ? layer.view() : layer.view;

  const off = document.createElement('canvas');
  off.width = W;
  off.height = H;
  const o = off.getContext('2d');
  if (!o) return;
  o.fillStyle = '#fff';
  o.fillRect(0, 0, W, H);
  const s = W / view.w;
  o.setTransform(s, 0, 0, s, -view.x * s, H / 2 - (view.y + view.h / 2) * s);
  draw(o);

  const bl = document.createElement('canvas');
  bl.width = W;
  bl.height = H;
  const b = bl.getContext('2d');
  if (!b) return;
  b.filter = 'blur(.8px)';
  b.drawImage(off, 0, 0);
  const data = b.getImageData(0, 0, W, H).data;

  const dpr = Math.min(2, window.devicePixelRatio || 1);
  canvas.width = Math.round(W * dpr);
  canvas.height = Math.round(H * dpr);
  const c = canvas.getContext('2d');
  if (!c) return;
  c.setTransform(dpr, 0, 0, dpr, 0, 0);
  c.fillStyle = color;
  c.beginPath();
  const r = rng(seed);
  const a = (angle * Math.PI) / 180;
  const ca = Math.cos(a);
  const sa = Math.sin(a);
  const R = Math.hypot(W, H) / 2 + cell;
  for (let v = -R; v <= R; v += cell) {
    for (let u = -R; u <= R; u += cell) {
      const x = W / 2 + u * ca - v * sa;
      const y = H / 2 + u * sa + v * ca;
      const j = r();
      if (x < 0 || y < 0 || x >= W || y >= H) continue;
      const d = 1 - data[((y | 0) * W + (x | 0)) * 4]! / 255;
      if (d < 0.06) continue;
      const rad = cell * 0.5 * Math.sqrt(d) * 1.2 * (0.95 + j * 0.1);
      c.moveTo(x + rad, y);
      c.arc(x, y, rad, 0, Math.PI * 2);
    }
  }
  c.fill();
}
