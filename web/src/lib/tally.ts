// SPDX-License-Identifier: Apache-2.0
//
// The artwork itself: a fist, and one half of a split tally. The lender kept the *stock*, the
// buyer the *foil*; notch widths recorded the amount and the two halves had to fit. Here the
// notches are cut from a record's commitment hash, so a record always draws itself the same way
// and two halves of the same record are exact complements.
import { grey, notches, type Notch, type View } from './press.js';

/** The hero plate's own record, so the caption can name the commitment its notches came from. */
export const HERO_HASH = '0x31e5a8c07f4d2b96e10ac3587bd6f42e9a05c7d3148be6f20d9a7c51e38b46f7';
const HERO_NOTCHES: Notch[] = notches(HERO_HASH);

const FIST = new Path2D(
  'M-70,-232 C-76,-160 -84,-100 -80,-58 L-80,44 Q-80,70 -60,70 Q-44,70 -41,54 Q-38,72 -21,72 Q-4,72 -2,56 Q2,74 18,74 Q34,74 36,58 Q40,76 56,74 Q76,72 76,44 L78,-20 C96,-12 114,-16 112,-34 C110,-56 86,-74 64,-86 C58,-140 54,-190 50,-236 Z',
);
const CREASES = new Path2D(
  'M-41,-40 C-43,0 -42,30 -41,54 M-2,-44 C-3,0 -2,30 -2,56 M36,-44 C37,-4 36,30 36,58 M-78,-56 C-30,-72 20,-74 70,-66 M62,-62 C80,-44 92,-34 108,-32',
);

export function fist(o: CanvasRenderingContext2D): void {
  o.fillStyle = grey(0.2);
  o.beginPath();
  o.moveTo(-98, -262);
  o.lineTo(-150, -1100);
  o.lineTo(120, -1100);
  o.lineTo(78, -268);
  o.closePath();
  o.fill();
  o.strokeStyle = grey(0.55);
  o.lineWidth = 3;
  for (let i = 1; i < 6; i++) {
    o.beginPath();
    o.moveTo(-98 - i * 9, -262 - i * 150);
    o.lineTo(78 + i * 7, -268 - i * 150);
    o.stroke();
  }
  o.fillStyle = grey(0.92);
  o.beginPath();
  o.moveTo(-86, -232);
  o.lineTo(-98, -268);
  o.lineTo(80, -274);
  o.lineTo(66, -236);
  o.closePath();
  o.fill();
  o.fillStyle = grey(0.46);
  o.fill(FIST);
  o.save();
  o.clip(FIST);
  o.fillStyle = grey(0.66);
  o.beginPath();
  o.ellipse(-86, -40, 44, 200, 0, 0, Math.PI * 2);
  o.fill();
  o.fillStyle = grey(0.6);
  o.fillRect(-90, 40, 200, 60);
  o.fillStyle = grey(0.24);
  o.beginPath();
  o.ellipse(0, -150, 26, 64, 0.08, 0, Math.PI * 2);
  o.fill();
  o.fillStyle = grey(0.3);
  o.beginPath();
  o.ellipse(70, -44, 20, 14, -0.4, 0, Math.PI * 2);
  o.fill();
  o.restore();
  o.strokeStyle = grey(0.95);
  o.lineWidth = 4;
  o.lineCap = 'round';
  o.stroke(CREASES);
}

export type Half = 'stock' | 'foil';

/** `k` scales ink density: 1 is freshly printed, .72 a worn record that has been settled. */
export function stick(o: CanvasRenderingContext2D, which: Half, N: readonly Notch[], k = 1): void {
  const stock = which === 'stock';
  o.fillStyle = grey(0.44 * k);
  o.beginPath();
  if (stock) {
    o.roundRect(-420, -32, 120, 64, [8, 0, 0, 8]);
    o.rect(-302, -32, 604, 32);
  } else {
    o.rect(-302, 0, 604, 32);
    o.roundRect(300, -32, 120, 64, [0, 8, 8, 0]);
  }
  o.fill();
  o.strokeStyle = grey(0.8 * k);
  o.lineWidth = 2.2;
  for (const y of stock ? [-23, -10] : [10, 23]) {
    o.beginPath();
    o.moveTo(stock ? -410 : -290, y);
    o.bezierCurveTo(-120, y - 3, 120, y + 3, stock ? 290 : 410, y - 1);
    o.stroke();
  }
  for (const [x, w] of N) {
    o.fillStyle = grey(1 * k);
    if (stock) o.fillRect(x - 2, -26, w + 4, 44);
    else o.fillRect(x - 2, -18, w + 4, 44);
    o.fillStyle = '#fff';
    o.beginPath();
    if (stock) {
      o.moveTo(x - 4, -33);
      o.lineTo(x + w + 4, -33);
      o.lineTo(x + w / 2, -19);
    } else {
      o.moveTo(x - 4, 33);
      o.lineTo(x + w + 4, 33);
      o.lineTo(x + w / 2, 19);
    }
    o.fill();
  }
}

/** Both hands exchanging one split tally: the hero plate. */
export function exchange(half: Half, phone: boolean): (o: CanvasRenderingContext2D) => void {
  return (o) => {
    const C = [1000, 350] as const;
    const TH = -0.2;
    const HL = phone ? 250 : 362;
    const KX = phone ? 0.66 : 1;
    o.save();
    o.translate(C[0], C[1]);
    o.rotate(TH);
    o.scale(KX, 1);
    stick(o, half, HERO_NOTCHES);
    o.restore();
    o.save();
    o.translate(C[0], C[1]);
    o.rotate(TH);
    if (half === 'stock') o.translate(-HL, 0);
    else {
      o.translate(HL, 0);
      o.rotate(Math.PI);
    }
    fist(o);
    o.restore();
  };
}

/** Foreshortened so the notches stay legible in a small window; also scales annotations. */
export const SX = 0.74;

export const BAR_VIEW: View = { x: -330, y: -104, w: 660, h: 224 };
export const STRIP_VIEW: View = { x: -330, y: -58, w: 660, h: 116 };
export const HERO_VIEW: View = { x: 458, y: 126, w: 1042, h: 444 };
export const HERO_VIEW_PHONE: View = { x: 600, y: 130, w: 800, h: 440 };

export const bar =
  (half: Half, N: readonly Notch[], k = 1) =>
  (o: CanvasRenderingContext2D): void => {
    o.save();
    o.scale(SX, 1);
    stick(o, half, N, k);
    o.restore();
  };
