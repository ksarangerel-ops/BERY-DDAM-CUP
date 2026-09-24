/* Shared image storage for every non-Tekken game board. */
import { supabase } from './supabase-client.ts';
export { assetUrl, pickImage, prepareImage } from '../dota2/assets.js';

export const MEDIA_BUCKET = 'cup-assets';

export async function uploadMedia(gameId, path, data) {
  if (!supabase) throw new Error('Supabase is not configured');
  const match = String(data || '').match(/^data:(image\/[\w.+-]+);base64,(.+)$/);
  if (!match) throw new Error('Invalid image data');
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  const type = match[1];
  const extension = type === 'image/webp' ? 'webp' : type === 'image/png' ? 'png' : 'jpg';
  const finalPath = `${gameId}/${path}-${Date.now()}.${extension}`;
  const { error } = await supabase.storage.from(MEDIA_BUCKET).upload(finalPath, new Blob([bytes], { type }), {
    contentType: type,
    cacheControl: '31536000',
    upsert: false,
  });
  if (error) throw error;
  return supabase.storage.from(MEDIA_BUCKET).getPublicUrl(finalPath).data.publicUrl;
}

export async function removeMedia(url) {
  if (!supabase || typeof url !== 'string') return;
  const marker = `/object/public/${MEDIA_BUCKET}/`;
  const at = url.indexOf(marker);
  if (at < 0) return;
  await supabase.storage.from(MEDIA_BUCKET).remove([decodeURIComponent(url.slice(at + marker.length))]).catch(() => undefined);
}
