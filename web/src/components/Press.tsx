// SPDX-License-Identifier: Apache-2.0
//
// A printed plate: one canvas per ink, multiplied together. Re-prints on resize and whenever the
// artwork changes, and nothing else: the press is expensive enough that it should not run on
// every React render.
import { useEffect, useRef, type CSSProperties } from 'react';
import { press, type Layer } from '../lib/press.js';

export interface PressProps {
  layers: Layer[];
  /** CSS aspect ratio of the plate, e.g. `660/224`. */
  aspect: string;
  /** Alternative text for the first layer; the rest are decorative. */
  label?: string;
  className?: string;
  style?: CSSProperties;
  /** Redraw key: change it when the artwork should be re-pressed. */
  revision?: string | number;
  children?: React.ReactNode;
}

export function Press({ layers, aspect, label, className, style, revision, children }: PressProps) {
  const host = useRef<HTMLDivElement>(null);
  const spec = useRef(layers);
  spec.current = layers;

  useEffect(() => {
    const el = host.current;
    if (!el) return;
    let frame = 0;
    const paint = () => {
      const canvases = el.querySelectorAll<HTMLCanvasElement>('canvas.lay');
      canvases.forEach((canvas, i) => {
        const layer = spec.current[i];
        if (layer) press(canvas, layer);
      });
    };
    paint();
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(paint);
    });
    observer.observe(el);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [revision, layers.length]);

  return (
    <div ref={host} className={className} style={{ aspectRatio: aspect, ...style }}>
      {layers.map((_, i) => (
        <canvas
          key={i}
          className="lay"
          {...(i === 0 && label ? { role: 'img', 'aria-label': label } : { 'aria-hidden': true })}
        />
      ))}
      {children}
    </div>
  );
}
