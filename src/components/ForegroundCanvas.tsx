import { useEffect, useRef } from 'react';
import { foregroundKey, glyphFillKey, type GlyphFill, type RasterForeground } from '../utils/foreground';
import { rasterizeForeground } from '../utils/foregroundRenderer';

interface ForegroundCanvasProps {
  fg: RasterForeground;
  /** CSS size of the glyph box in px. */
  size: number;
  fill: GlyphFill;
}

/**
 * Live-preview renderer for image/text foregrounds. Draws through the same
 * rasterizer the export pipeline uses (at device pixel ratio) so the preview
 * is pixel-for-pixel what gets exported.
 *
 * Deliberately holds no React state: the async rasterization (image decode /
 * font load) resolves straight into the canvas under a cancellation flag, so
 * a late font can never trigger a re-render loop. Defined at module level so
 * its identity is stable across parent re-renders.
 */
export function ForegroundCanvas({ fg, size, fill }: ForegroundCanvasProps) {
  const ref = useRef<HTMLCanvasElement>(null);
  const dpr = typeof window !== 'undefined' ? Math.min(window.devicePixelRatio || 1, 2) : 1;
  const px = Math.max(1, Math.round(size * dpr));
  const fgKey = foregroundKey(fg);
  const fillKey = glyphFillKey(fill);

  useEffect(() => {
    let cancelled = false;
    rasterizeForeground(fg, px, { fill })
      .then((glyph) => {
        if (cancelled) return;
        const canvas = ref.current;
        const ctx = canvas?.getContext('2d');
        if (!canvas || !ctx) return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        ctx.drawImage(glyph, 0, 0);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
    // `fg`/`fill` are re-created on every parent render; depend on their string keys.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fgKey, fillKey, px]);

  return (
    <canvas
      ref={ref}
      width={px}
      height={px}
      style={{ width: size, height: size, display: 'block' }}
      aria-hidden="true"
    />
  );
}
