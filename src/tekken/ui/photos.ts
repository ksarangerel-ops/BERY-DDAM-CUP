/* ============================================================
   PLAYER PHOTOS — pick, crop into the slanted frame, compress, store.

   Online, the 360×360 WebP/JPEG goes to Supabase Storage (bucket
   `tekken-photos`) and the board only keeps its public URL, so the
   board row stays small enough for Supabase Realtime messages.
   In local mode (no Supabase) the photo stays inline as a data: URL.

   For display, an inline data: URL is turned into a blob: URL once, so
   re-rendering on every score change doesn't re-parse the image.
============================================================ */
import type { SupabaseClient } from '@supabase/supabase-js';
import { MAX_PHOTO_CHARS } from '../engine/state';
import { PHOTO_BUCKET, TEKKEN_BOARD_ID } from '../config';
import { actions, type Ctx, save } from './app';
import { esc, toast } from './dom';
import { ICONS } from './icons';

const OUTPUT = 360;

/* ---------- display ---------- */
const urls = new Map<string, { data: string; url: string }>();

function toBlob(data: string): Blob | null {
  const m = data.match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!m?.[1] || !m[2]) return null;
  try {
    const bin = atob(m[2]);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return new Blob([bytes], { type: m[1] });
  } catch {
    return null;
  }
}

/** Image URL for a player's photo, or null when they have none. */
export function photoUrl(pid: string, data: string | undefined): string | null {
  if (data?.startsWith('https://')) return data;
  const hit = urls.get(pid);
  if (hit && hit.data === data) return hit.url;
  if (hit) { URL.revokeObjectURL(hit.url); urls.delete(pid); }
  const blob = data ? toBlob(data) : null;
  if (!data || !blob) return null;
  const url = URL.createObjectURL(blob);
  urls.set(pid, { data, url });
  return url;
}

/* ---------- Supabase Storage ---------- */
/** Upload a cropped photo and return its public URL. Unique names, so browsers never show a cached old photo. */
export async function storePhoto(client: SupabaseClient, pid: string, data: string): Promise<string> {
  const blob = toBlob(data);
  if (!blob) throw new Error('Invalid image data');
  const path = `${TEKKEN_BOARD_ID}/${pid}-${Date.now()}.${blob.type === 'image/webp' ? 'webp' : 'jpg'}`;
  const { error } = await client.storage.from(PHOTO_BUCKET).upload(path, blob, { contentType: blob.type, cacheControl: '31536000', upsert: false });
  if (error) throw error;
  return client.storage.from(PHOTO_BUCKET).getPublicUrl(path).data.publicUrl;
}

/** Best-effort removal of a replaced photo file; a leftover file is harmless. */
async function deleteStoredPhoto(client: SupabaseClient, url: string | undefined) {
  const marker = `/object/public/${PHOTO_BUCKET}/`;
  const at = url?.indexOf(marker) ?? -1;
  if (!url || at < 0) return;
  await client.storage.from(PHOTO_BUCKET).remove([decodeURIComponent(url.slice(at + marker.length))]).catch(() => undefined);
}

/* ---------- upload flow ---------- */
function pickFile(): Promise<File | null> {
  return new Promise(resolve => {
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*';
    input.hidden = true;
    const done = (file: File | null) => { input.remove(); resolve(file); };
    input.addEventListener('change', () => done(input.files?.[0] ?? null));
    input.addEventListener('cancel', () => done(null));
    document.body.append(input);
    input.click();
  });
}

function loadImage(file: File): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => { URL.revokeObjectURL(img.src); reject(new Error('unreadable image')); };
    img.src = URL.createObjectURL(file);
  });
}

/** WebP where the browser can encode it, JPEG otherwise; lower quality until it fits. */
function encode(canvas: HTMLCanvasElement): string {
  let data = '';
  for (const q of [0.86, 0.76, 0.64, 0.5]) {
    data = canvas.toDataURL('image/webp', q);
    if (!data.startsWith('data:image/webp')) data = canvas.toDataURL('image/jpeg', q);
    if (data.length <= MAX_PHOTO_CHARS) break;
  }
  return data;
}

interface Crop { x: number; y: number; k: number; size: number }

function draw(target: HTMLCanvasElement, img: HTMLImageElement, c: Crop) {
  const g = target.getContext('2d');
  if (!g) return;
  g.fillStyle = '#111';
  g.fillRect(0, 0, target.width, target.height);
  g.imageSmoothingQuality = 'high';
  g.drawImage(img, -c.x / c.k, -c.y / c.k, c.size / c.k, c.size / c.k, 0, 0, target.width, target.height);
}

/** Modal cropper: drag to position, zoom with slider or wheel. Resolves to a data: URL or null. */
function cropper(name: string, color: string, img: HTMLImageElement): Promise<string | null> {
  return new Promise(resolve => {
    const size = Math.min(320, window.innerWidth - 72);
    // The wrapper carries the .tk scope: the modal lives on <body>, outside the Tekken tab.
    const scope = document.createElement('div');
    scope.className = 'tk';
    const root = document.createElement('div');
    root.className = 'modal';
    scope.append(root);
    root.innerHTML = `
      <div class="modal__card" role="dialog" aria-modal="true" aria-label="Crop photo for ${esc(name)}">
        <div class="ph"><div class="ph__titles"><span class="ph__kicker">${ICONS.camera()} Player photo</span><h2 class="ph__title">${esc(name)}</h2></div></div>
        <div class="crop" style="--team:${esc(color)}; --crop:${size}px">
          <div class="crop__stage">
            <img class="crop__img" alt="" draggable="false">
            <svg class="crop__mask" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
              <path fill-rule="evenodd" d="M0 0H100V100H0Z M14 0H100L86 100H0Z"/>
              <path class="crop__edge" d="M14 0H100L86 100H0Z"/>
            </svg>
          </div>
          <div class="crop__preview">
            <span class="portrait portrait--lg has-photo" style="--team:${esc(color)}"><canvas class="portrait__img" width="184" height="184"></canvas></span>
            <span class="portrait portrait--sm has-photo" style="--team:${esc(color)}"><canvas class="portrait__img" width="76" height="76"></canvas></span>
            <span class="crop__hint">Preview</span>
          </div>
        </div>
        <label class="field crop__zoom"><span>Zoom</span><input type="range" min="1" max="4" step="0.01" value="1"></label>
        <p class="fineprint">Drag the photo so the face sits inside the frame. Scroll or use the slider to zoom.</p>
        <div class="toolbar">
          <span class="toolbar__spacer"></span>
          <button class="btn btn--ghost" data-crop="cancel">Cancel</button>
          <button class="btn btn--red" data-crop="save">${ICONS.check()} Save photo</button>
        </div>
      </div>`;
    document.body.append(scope);

    const stage = root.querySelector<HTMLElement>('.crop__stage')!;
    const view = root.querySelector<HTMLImageElement>('.crop__img')!;
    const zoom = root.querySelector<HTMLInputElement>('.crop__zoom input')!;
    const previews = [...root.querySelectorAll<HTMLCanvasElement>('.crop__preview canvas')];
    view.src = img.src;

    const w = img.naturalWidth, h = img.naturalHeight;
    const cover = size / Math.min(w, h);
    let z = 1;
    let x = (size - w * cover) / 2;
    let y = (size - h * cover) * 0.22;   // tall photos: keep the top, where faces usually are
    const k = () => cover * z;
    const clamp = () => {
      x = Math.min(0, Math.max(size - w * k(), x));
      y = Math.min(0, Math.max(size - h * k(), y));
    };
    const render = () => {
      clamp();
      Object.assign(view.style, { width: `${w * k()}px`, height: `${h * k()}px`, transform: `translate(${x}px, ${y}px)` });
      for (const c of previews) draw(c, img, { x, y, k: k(), size });
    };
    const setZoom = (next: number) => {
      const cx = (size / 2 - x) / k(), cy = (size / 2 - y) / k();
      z = Math.min(4, Math.max(1, next));
      x = size / 2 - cx * k();
      y = size / 2 - cy * k();
      zoom.value = String(z);
      render();
    };

    let drag: { px: number; py: number; x: number; y: number } | null = null;
    stage.addEventListener('pointerdown', e => { drag = { px: e.clientX, py: e.clientY, x, y }; stage.setPointerCapture(e.pointerId); });
    stage.addEventListener('pointermove', e => {
      if (!drag) return;
      x = drag.x + e.clientX - drag.px;
      y = drag.y + e.clientY - drag.py;
      render();
    });
    const endDrag = () => { drag = null; };
    stage.addEventListener('pointerup', endDrag);
    stage.addEventListener('pointercancel', endDrag);
    stage.addEventListener('wheel', e => { e.preventDefault(); setZoom(z * (1 - e.deltaY * 0.0015)); }, { passive: false });
    zoom.addEventListener('input', () => setZoom(Number(zoom.value)));

    const close = (value: string | null) => {
      document.removeEventListener('keydown', onKey);
      scope.remove();
      resolve(value);
    };
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') close(null); };
    document.addEventListener('keydown', onKey);
    root.addEventListener('click', e => {
      const btn = (e.target as Element).closest<HTMLElement>('[data-crop]');
      if (btn?.dataset.crop === 'cancel' || e.target === root) close(null);
      if (btn?.dataset.crop === 'save') {
        const out = document.createElement('canvas');
        out.width = out.height = OUTPUT;
        draw(out, img, { x, y, k: k(), size });
        close(encode(out));
      }
    });

    render();
    root.querySelector<HTMLButtonElement>('[data-crop="save"]')?.focus();
  });
}

actions({
  'photo-upload': async (el, ctx: Ctx) => {
    const pid = el.dataset.pid ?? '';
    const player = ctx.state.players[pid];
    if (!player) return;
    const file = await pickFile();
    if (!file) return;
    let img: HTMLImageElement;
    try {
      img = await loadImage(file);
    } catch {
      toast('Could not open that image. Use JPG or PNG — iPhone HEIC photos need to be exported as JPG first.', 'bad');
      return;
    }
    const color = ctx.state.teams[player.team]?.color ?? '#555';
    const data = await cropper(player.name, color, img);
    URL.revokeObjectURL(img.src);
    if (!data) return;

    const previous = player.photo;
    let photo = data;
    if (ctx.supabase) {
      try {
        photo = await storePhoto(ctx.supabase, pid, data);
      } catch (err) {
        console.error('[tekken] photo upload failed', err);
        toast(`Photo not uploaded — ${(err as Error).message || 'Supabase Storage refused it'}`, 'bad');
        return;
      }
    }
    const saved = await save(ctx, { [`players/${pid}/photo`]: photo }, `Photo saved for ${player.name}`);
    if (ctx.supabase) void deleteStoredPhoto(ctx.supabase, saved ? previous : photo);
  },

  'photo-remove': async (el, ctx) => {
    const pid = el.dataset.pid ?? '';
    const name = ctx.state.players[pid]?.name ?? 'this player';
    if (!confirm(`Remove the photo of ${name}?`)) return;
    const previous = ctx.state.players[pid]?.photo;
    if (await save(ctx, { [`players/${pid}/photo`]: null }, 'Photo removed', 'info') && ctx.supabase) {
      void deleteStoredPhoto(ctx.supabase, previous);
    }
  },
});
