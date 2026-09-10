/* ============================================================
   INLINE SVG ICONS
   Kept inline (no icon font, no remote asset) so they render
   identically in the PNG export and on the live board.
============================================================ */
const svg = (body, cls='ico') => `<svg class="${cls}" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">${body}</svg>`;

export const ICONS = {
  trophy: cls => svg(`<path d="M5 3h14v1.4h3.2a.9.9 0 0 1 .9.9v1.4A4.9 4.9 0 0 1 18.2 12h-.9a6.1 6.1 0 0 1-4.3 3.8v2.1h3.3a1 1 0 0 1 1 1V21H6.7v-2.1a1 1 0 0 1 1-1H11v-2.1A6.1 6.1 0 0 1 6.7 12h-.9A4.9 4.9 0 0 1 .9 6.7V5.3a.9.9 0 0 1 .9-.9H5V3Zm0 3.2H2.7v.5a3.1 3.1 0 0 0 3 3.1A9.3 9.3 0 0 1 5 6.9v-.7Zm14 0v.7a9.3 9.3 0 0 1-.7 2.9 3.1 3.1 0 0 0 3-3.1v-.5H19Z"/>`, cls),
  medal:  cls => svg(`<path d="M6.6 1.8H3.4l4.3 8.1 2.9-1.6-4-6.5Zm10.8 0h3.2l-4.3 8.1-2.9-1.6 4-6.5Z" opacity=".85"/><circle cx="12" cy="16.3" r="5.9"/><circle cx="12" cy="16.3" r="3.3" fill="#0f172a" opacity=".45"/>`, cls),
  crown:  cls => svg(`<path d="M2.6 6.8 6.7 10.6 12 3.2l5.3 7.4 4.1-3.8L19.7 18H4.3L2.6 6.8Z"/><rect x="4.3" y="19.2" width="15.4" height="2.4" rx="1.1"/>`, cls),
  skull:  cls => svg(`<path d="M12 2C7.3 2 3.6 5.5 3.6 9.9c0 2.5 1.2 4.5 3 5.8v2.6a1.4 1.4 0 0 0 1.4 1.4h1.3v1.1a1 1 0 0 0 1 1h3.4a1 1 0 0 0 1-1v-1.1H16a1.4 1.4 0 0 0 1.4-1.4v-2.6c1.8-1.3 3-3.3 3-5.8C20.4 5.5 16.7 2 12 2Zm-3.3 9.9a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Zm6.6 0a1.9 1.9 0 1 1 0-3.8 1.9 1.9 0 0 1 0 3.8Z"/>`, cls),
  map:    cls => svg(`<path d="M8.6 2.3 2.9 4.5A1.4 1.4 0 0 0 2 5.8v14.3a.9.9 0 0 0 1.2.8l5.4-2.1 6.8 2.9 5.7-2.2a1.4 1.4 0 0 0 .9-1.3V3.9a.9.9 0 0 0-1.2-.8l-5.4 2.1-6.8-2.9Zm.4 2.4 6 2.6v12.1l-6-2.6V4.7Z"/>`, cls),
  crate:  cls => svg(`<path d="M12 1.6C7.1 1.6 3 5 2.1 9.4h19.8C21 5 16.9 1.6 12 1.6Z"/><path d="M2.6 9.4 8 13.4M21.4 9.4 16 13.4M12 9.4v4" stroke="currentColor" stroke-width="1.3" stroke-linecap="round" fill="none"/><rect x="7.2" y="13.4" width="9.6" height="8.4" rx="1.3"/><path d="M12 13.4v8.4M7.2 17.6h9.6" stroke="#0f172a" stroke-width="1.5"/>`, cls),
};

/* Gold trophy for #1, silver / bronze medals for #2 and #3. */
export function rankMedal(rank){
  if(rank === 1) return `<span class="text-gold ico-trophy" title="Champion">${ICONS.trophy('ico w-[1.15em] h-[1.15em]')}</span>`;
  if(rank === 2) return `<span class="text-slate-300" title="2nd place">${ICONS.medal('ico')}</span>`;
  if(rank === 3) return `<span class="text-amber-600" title="3rd place">${ICONS.medal('ico')}</span>`;
  return '';
}
