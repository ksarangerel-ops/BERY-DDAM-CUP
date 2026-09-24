/* ============================================================
   MOBILE LEGENDS MEDIA — small, safe image assets for team logos and players.
   Online boards keep public Supabase Storage URLs; local/offline boards
   keep a compressed data URL in the existing local cache.
============================================================ */

export const MAX_ASSET_CHARS = 110_000;

export function assetUrl(value) {
  if (typeof value !== 'string') return null;
  if (value.startsWith('https://')) return value;
  if (/^data:image\/(webp|jpeg|jpg|png);base64,/.test(value) && value.length <= MAX_ASSET_CHARS) return value;
  return null;
}

export function pickImage() {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    const done = file => { input.remove(); resolve(file || null); };
    input.addEventListener('change', () => done(input.files?.[0]));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}

function loadImage(file) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(file);
    const img = new Image();
    img.onload = () => { URL.revokeObjectURL(url); resolve(img); };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Could not read image')); };
    img.src = url;
  });
}

function encode(canvas) {
  for (const quality of [0.86, 0.74, 0.62, 0.5, 0.38]) {
    const webp = canvas.toDataURL('image/webp', quality);
    if (webp.startsWith('data:image/webp') && webp.length <= MAX_ASSET_CHARS) return webp;
    const jpeg = canvas.toDataURL('image/jpeg', quality);
    if (jpeg.length <= MAX_ASSET_CHARS) return jpeg;
  }
  const fallback = canvas.toDataURL('image/webp', 0.3);
  if (fallback.startsWith('data:image/webp')) return fallback;
  return canvas.toDataURL('image/jpeg', 0.3);
}

/** Prepare an uploaded image for storage. Player photos are square; logos keep their ratio. */
export async function prepareImage(file, kind = 'photo') {
  if (!file?.type?.startsWith('image/')) throw new Error('Please choose an image file');
  const img = await loadImage(file);
  const sourceWidth = img.naturalWidth || img.width;
  const sourceHeight = img.naturalHeight || img.height;
  if (!sourceWidth || !sourceHeight) throw new Error('Image has no readable dimensions');

  const isPhoto = kind === 'photo';
  const size = isPhoto ? 420 : Math.min(720, Math.max(sourceWidth, sourceHeight));
  const canvas = document.createElement('canvas');
  let sx = 0, sy = 0, sw = sourceWidth, sh = sourceHeight;
  let width = size, height = size;

  if (isPhoto) {
    const side = Math.min(sourceWidth, sourceHeight);
    sx = (sourceWidth - side) / 2;
    sy = Math.max(0, (sourceHeight - side) * 0.22);
    sw = sh = side;
  } else {
    const scale = Math.min(1, size / Math.max(sourceWidth, sourceHeight));
    width = Math.max(1, Math.round(sourceWidth * scale));
    height = Math.max(1, Math.round(sourceHeight * scale));
  }

  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Image processing is unavailable');
  if (!isPhoto) {
    context.clearRect(0, 0, width, height);
  }
  context.imageSmoothingQuality = 'high';
  context.drawImage(img, sx, sy, sw, sh, 0, 0, width, height);
  return encode(canvas);
}
