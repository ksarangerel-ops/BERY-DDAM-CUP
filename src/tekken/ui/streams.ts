/* ============================================================
   LIVE STREAMS — YouTube embeds that survive re-renders.

   Views re-render with innerHTML on every score change, and an iframe
   that leaves the DOM reloads (the video would restart on every tapped
   game). So views only draw an empty `.stream-slot`; the real iframes
   live in one layer next to the page and are laid over their slots.
   The iframe itself is created once and only moved.
============================================================ */

const EMBED_PARAMS = 'autoplay=1&mute=1&playsinline=1&rel=0';

/**
 * Accepts the links YouTube hands out and returns an embeddable URL, or null.
 *   youtube.com/watch?v=ID · youtu.be/ID · youtube.com/live/ID · youtube.com/embed/ID
 *   youtube.com/channel/UC…(/live) → that channel's current live stream
 * Videos start muted: browsers only allow muted autoplay.
 */
export function youtubeEmbed(input: string | undefined): string | null {
  if (!input) return null;
  let url: URL;
  try { url = new URL(input.trim()); } catch { return null; }
  const host = url.hostname.replace(/^(www|m)\./, '');

  let id: string | null = null;
  if (host === 'youtu.be') {
    id = url.pathname.split('/')[1] ?? null;
  } else if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const channel = url.pathname.match(/^\/channel\/(UC[\w-]{22})(?:\/live)?\/?$/);
    if (channel) return `https://www.youtube.com/embed/live_stream?channel=${channel[1]}&${EMBED_PARAMS}`;
    id = url.pathname === '/watch'
      ? url.searchParams.get('v')
      : url.pathname.match(/^\/(?:live|embed|shorts)\/([\w-]+)/)?.[1] ?? null;
  }
  return id && /^[\w-]{11}$/.test(id) ? `https://www.youtube.com/embed/${id}?${EMBED_PARAMS}` : null;
}

export interface StreamLayer {
  /** Create, keep or drop iframes to match the `.stream-slot`s currently inside the Tekken root. */
  sync(): void;
  destroy(): void;
}

/**
 * Iframes live in one layer inside `host` (the positioned .tk root) and are laid
 * over their slots in host coordinates, so the sticky sub-nav still covers them.
 */
export function createStreamLayer(host: HTMLElement): StreamLayer {
  const frames = new Map<string, HTMLIFrameElement>();
  const layer = document.createElement('div');
  layer.id = 'stream-layer';
  host.append(layer);

  const position = () => {
    const base = host.getBoundingClientRect();
    for (const [key, frame] of frames) {
      const slot = host.querySelector<HTMLElement>(`.stream-slot[data-stream="${key}"]`);
      if (!slot) continue;
      const r = slot.getBoundingClientRect();
      Object.assign(frame.style, {
        top: `${r.top - base.top}px`,
        left: `${r.left - base.left}px`,
        width: `${r.width}px`,
        height: `${r.height}px`,
      });
    }
  };

  const sync = () => {
    const wanted = new Map<string, string>();
    host.querySelectorAll<HTMLElement>('.stream-slot[data-stream][data-src]').forEach(slot => {
      wanted.set(slot.dataset.stream ?? '', slot.dataset.src ?? '');
    });
    for (const [key, frame] of frames) {
      if (wanted.get(key) !== frame.dataset.src) { frame.remove(); frames.delete(key); }
    }
    for (const [key, src] of wanted) {
      if (frames.has(key)) continue;
      const frame = document.createElement('iframe');
      frame.className = 'stream-frame';
      frame.dataset.src = src;
      frame.src = src;
      frame.title = `Live stream · station ${key.slice(1)}`;
      frame.allow = 'autoplay; encrypted-media; picture-in-picture; fullscreen';
      frame.allowFullscreen = true;
      frame.referrerPolicy = 'strict-origin-when-cross-origin';
      layer.append(frame);
      frames.set(key, frame);
    }
    position();
  };

  const observer = new ResizeObserver(position);
  observer.observe(host);
  window.addEventListener('resize', position);
  host.addEventListener('animationend', position);

  return {
    sync,
    destroy() {
      observer.disconnect();
      window.removeEventListener('resize', position);
      host.removeEventListener('animationend', position);
      layer.remove();
      frames.clear();
    },
  };
}
