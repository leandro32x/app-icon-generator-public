/**
 * Import of user-supplied foreground images.
 *
 * Raster files (PNG/JPEG/WebP) are decoded, capped to `MAX_IMAGE_DIMENSION`
 * on their longest side and stored as a data URL. SVG files are sanitized and
 * kept as vector data (also as a data URL) so they stay crisp at 1024 px.
 *
 * Only `data:` URLs ever reach a canvas, so exports never taint.
 */

export const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
export const MAX_IMAGE_DIMENSION = 1024;

/** `accept` attribute for the file input (MIME types + extensions for picky OS dialogs). */
export const IMAGE_ACCEPT_ATTR =
  '.png,.jpg,.jpeg,.webp,.svg,image/png,image/jpeg,image/webp,image/svg+xml';

const RASTER_MIMES = new Set(['image/png', 'image/jpeg', 'image/webp']);

export interface ImportedImage {
  dataUrl: string;
  name: string;
  width: number;
  height: number;
  hasAlpha: boolean;
  mime: string;
}

function detectMime(file: File): string {
  const type = (file.type || '').toLowerCase();
  if (type === 'image/svg+xml' || RASTER_MIMES.has(type)) return type;
  if (type === 'image/jpg') return 'image/jpeg';
  const ext = file.name.toLowerCase().split('.').pop() ?? '';
  switch (ext) {
    case 'svg':
      return 'image/svg+xml';
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    default:
      return type;
  }
}

function readAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error('The file could not be read.'));
    reader.readAsDataURL(file);
  });
}

function decodeImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('The image could not be decoded.'));
    img.src = src;
  });
}

/** True when any sampled pixel is not fully opaque. */
function scanAlpha(img: HTMLImageElement, width: number, height: number): boolean {
  const scale = Math.min(1, 256 / Math.max(width, height, 1));
  const w = Math.max(1, Math.round(width * scale));
  const h = Math.max(1, Math.round(height * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return true;
  ctx.drawImage(img, 0, 0, w, h);
  const data = ctx.getImageData(0, 0, w, h).data;
  for (let i = 3; i < data.length; i += 4) {
    if (data[i] < 255) return true;
  }
  return false;
}

function parseSvgLength(value: string | null): number | null {
  if (!value) return null;
  const trimmed = value.trim();
  if (trimmed.endsWith('%')) return null;
  const n = parseFloat(trimmed);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Remove scripting/external references from an SVG document and normalize
 * its sizing so every browser decodes it with an intrinsic size.
 *
 * Note: SVG rendered through `<img>`/canvas cannot load external resources
 * anyway; stripping them just keeps the persisted markup clean.
 */
export function sanitizeSvg(text: string): { svg: string; width: number; height: number } {
  const doc = new DOMParser().parseFromString(text, 'image/svg+xml');
  if (doc.getElementsByTagName('parsererror').length > 0) {
    throw new Error('The SVG file could not be parsed.');
  }
  const root = doc.documentElement;
  if (!root || root.nodeName.toLowerCase() !== 'svg') {
    throw new Error('The file is not an SVG image.');
  }

  root.querySelectorAll('script, foreignObject').forEach((el) => el.remove());

  const elements = [root, ...Array.from(root.querySelectorAll('*'))];
  for (const el of elements) {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase();
      if (name.startsWith('on')) {
        el.removeAttribute(attr.name);
      } else if (name === 'href' || name === 'xlink:href') {
        const v = attr.value.trim();
        if (!(v.startsWith('#') || v.startsWith('data:'))) {
          el.remove();
          break;
        }
      }
    }
  }

  root.querySelectorAll('style').forEach((style) => {
    const css = style.textContent ?? '';
    if (/@import|url\(\s*['"]?\s*(?:https?:)?\/\//i.test(css)) style.remove();
  });

  // Sizing: make sure both a viewBox and explicit width/height exist so the
  // image has an intrinsic size everywhere (Firefox decodes size-less SVGs as 0×0).
  const viewBox = root.getAttribute('viewBox');
  let width = parseSvgLength(root.getAttribute('width'));
  let height = parseSvgLength(root.getAttribute('height'));
  let vbW: number | null = null;
  let vbH: number | null = null;
  if (viewBox) {
    const parts = viewBox.split(/[\s,]+/).map(Number);
    if (parts.length === 4 && parts[2] > 0 && parts[3] > 0) {
      vbW = parts[2];
      vbH = parts[3];
    }
  }
  if (!vbW && width && height) {
    root.setAttribute('viewBox', `0 0 ${width} ${height}`);
  } else if (vbW && vbH && !(width && height)) {
    width = vbW;
    height = vbH;
    root.setAttribute('width', String(vbW));
    root.setAttribute('height', String(vbH));
  } else if (!vbW && !(width && height)) {
    width = 512;
    height = 512;
    root.setAttribute('width', '512');
    root.setAttribute('height', '512');
    root.setAttribute('viewBox', '0 0 512 512');
  }
  if (!root.getAttribute('xmlns')) root.setAttribute('xmlns', 'http://www.w3.org/2000/svg');

  return {
    svg: new XMLSerializer().serializeToString(root),
    width: width ?? vbW ?? 512,
    height: height ?? vbH ?? 512,
  };
}

/**
 * Read, validate and normalize a user-picked image file.
 * Rejects with a user-facing `Error` message on any problem.
 */
export async function importImageFile(file: File): Promise<ImportedImage> {
  if (file.size > MAX_IMAGE_BYTES) {
    throw new Error(`Image is too large (max ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)} MB).`);
  }
  const mime = detectMime(file);

  if (mime === 'image/svg+xml') {
    const { svg, width, height } = sanitizeSvg(await file.text());
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
    const img = await decodeImage(dataUrl);
    return {
      dataUrl,
      name: file.name,
      width: img.naturalWidth || width,
      height: img.naturalHeight || height,
      hasAlpha: true,
      mime,
    };
  }

  if (!RASTER_MIMES.has(mime)) {
    throw new Error('Unsupported file type. Use PNG, JPEG, WebP or SVG.');
  }

  const originalDataUrl = await readAsDataUrl(file);
  const img = await decodeImage(originalDataUrl);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (!srcW || !srcH) throw new Error('The image has no pixels.');

  const isJpeg = mime === 'image/jpeg';
  const scale = Math.min(1, MAX_IMAGE_DIMENSION / Math.max(srcW, srcH));

  if (scale >= 1) {
    // Small enough: keep the original bytes (smaller than any re-encode).
    return {
      dataUrl: originalDataUrl,
      name: file.name,
      width: srcW,
      height: srcH,
      hasAlpha: isJpeg ? false : scanAlpha(img, srcW, srcH),
      mime,
    };
  }

  const width = Math.max(1, Math.round(srcW * scale));
  const height = Math.max(1, Math.round(srcH * scale));
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('Canvas is not available in this browser.');
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, width, height);

  const hasAlpha = isJpeg ? false : scanAlpha(img, srcW, srcH);
  const dataUrl = hasAlpha ? canvas.toDataURL('image/png') : canvas.toDataURL('image/jpeg', 0.92);
  return {
    dataUrl,
    name: file.name,
    width,
    height,
    hasAlpha,
    mime: hasAlpha ? 'image/png' : 'image/jpeg',
  };
}
