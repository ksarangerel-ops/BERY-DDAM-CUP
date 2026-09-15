/* Inline SVG icons — stroke icons inherit currentColor. */
const svg = (body: string, cls = '', fill = false) =>
  `<svg class="ico ${cls}" viewBox="0 0 24 24" aria-hidden="true" ${fill
    ? 'fill="currentColor"'
    : 'fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"'}>${body}</svg>`;

export const ICONS = {
  arena: (c = '') => svg('<path d="M3 20h18M5 20V9l7-5 7 5v11"/><path d="M9 20v-6h6v6"/>', c),
  groups: (c = '') => svg('<rect x="3" y="3" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="3" width="7.5" height="7.5" rx="1"/><rect x="3" y="13.5" width="7.5" height="7.5" rx="1"/><rect x="13.5" y="13.5" width="7.5" height="7.5" rx="1"/>', c),
  bracket: (c = '') => svg('<path d="M3 5h5v6H3M3 13h5v6H3M8 8h4v8H8M12 12h5M17 7h4v10h-4z"/>', c),
  fighters: (c = '') => svg('<circle cx="9" cy="7" r="3.5"/><path d="M2.5 20a6.5 6.5 0 0 1 13 0"/><path d="M16 4a3.5 3.5 0 0 1 0 7M18 14a6 6 0 0 1 3.5 6"/>', c),
  rules: (c = '') => svg('<path d="M5 3h11l3 3v15H5z"/><path d="M9 9h6M9 13h6M9 17h4"/>', c),
  lock: (c = '') => svg('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 8 0v3.5"/>', c),
  unlock: (c = '') => svg('<rect x="4" y="10.5" width="16" height="10.5" rx="2"/><path d="M8 10.5V7a4 4 0 0 1 7.7-1.5"/>', c),
  trophy: (c = '') => svg('<path d="M7 4h10v5a5 5 0 0 1-10 0z"/><path d="M7 6H4v1a3 3 0 0 0 3 3M17 6h3v1a3 3 0 0 1-3 3M12 14v3M8 21h8M9.5 17h5l.5 4h-6z"/>', c),
  crown: (c = '') => svg('<path d="M3 8l4.5 4L12 5l4.5 7L21 8l-2 11H5z"/>', c),
  bolt: (c = '') => svg('<path d="M13 2 4 14h7l-1 8 9-12h-7z"/>', c, true),
  clock: (c = '') => svg('<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>', c),
  shuffle: (c = '') => svg('<path d="M16 3h5v5M4 20 21 3M21 16v5h-5M15 15l6 6M4 4l5 5"/>', c),
  swap: (c = '') => svg('<path d="M7 4 3 8l4 4M3 8h14M17 20l4-4-4-4M21 16H7"/>', c),
  undo: (c = '') => svg('<path d="M9 14 4 9l5-5"/><path d="M4 9h10.5a5.5 5.5 0 0 1 0 11H11"/>', c),
  play: (c = '') => svg('<path d="M7 4v16l13-8z"/>', c, true),
  stop: (c = '') => svg('<rect x="6" y="6" width="12" height="12" rx="1.5"/>', c, true),
  flag: (c = '') => svg('<path d="M5 21V4M5 4h11l-2 4 2 4H5"/>', c),
  check: (c = '') => svg('<path d="m4 12 5 5L20 6"/>', c),
  x: (c = '') => svg('<path d="M6 6l12 12M18 6 6 18"/>', c),
  gear: (c = '') => svg('<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>', c),
  list: (c = '') => svg('<path d="M9 6h12M9 12h12M9 18h12M4 6h.01M4 12h.01M4 18h.01"/>', c),
  users: (c = '') => svg('<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>', c),
  download: (c = '') => svg('<path d="M12 3v12M7 10l5 5 5-5M4 21h16"/>', c),
  upload: (c = '') => svg('<path d="M12 21V9M7 14l5-5 5 5M4 3h16"/>', c),
  arrowRight: (c = '') => svg('<path d="M5 12h14M13 6l6 6-6 6"/>', c),
  arrowUp: (c = '') => svg('<path d="M12 19V5M6 11l6-6 6 6"/>', c),
  arrowDown: (c = '') => svg('<path d="M12 5v14M6 13l6 6 6-6"/>', c),
  controller: (c = '') => svg('<path d="M6 9h4M8 7v4M15 10h.01M18 8h.01"/><path d="M17.3 5H6.7a4 4 0 0 0-4 3.6l-.6 6A3 3 0 0 0 5 18c1 0 1.9-.5 2.5-1.3L9 15h6l1.5 1.7A3 3 0 0 0 19 18a3 3 0 0 0 3-3.4l-.7-6A4 4 0 0 0 17.3 5z"/>', c),
  camera: (c = '') => svg('<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', c),
  alert: (c = '') => svg('<path d="M12 3 2 21h20z"/><path d="M12 10v5M12 18h.01"/>', c),
  info: (c = '') => svg('<circle cx="12" cy="12" r="9"/><path d="M12 11v6M12 7.5h.01"/>', c),
  fist: (c = '') => svg('<path d="M6.5 9.5V6.8a1.8 1.8 0 0 1 3.6 0v2.4-3.6a1.8 1.8 0 0 1 3.6 0v3.4-2.6a1.8 1.8 0 0 1 3.6 0V13a7 7 0 0 1-7 7h-.6A5.7 5.7 0 0 1 4 14.3V11a1.8 1.8 0 0 1 2.5-1.5z"/><path d="M6.5 9.5V12M9.5 13.5c1.5-1 3.5-1 5 0"/>', c),
};

/** Brand emblem: a cracked steel shield with a lightning strike. */
export const EMBLEM = `
<svg class="emblem" viewBox="0 0 64 64" aria-hidden="true">
  <defs>
    <linearGradient id="emb-a" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#ff5468"/><stop offset=".55" stop-color="#d0122b"/><stop offset="1" stop-color="#5c0613"/>
    </linearGradient>
    <linearGradient id="emb-b" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="#fff6d6"/><stop offset="1" stop-color="#ffc23a"/>
    </linearGradient>
  </defs>
  <path d="M32 3 57 12v18c0 16-11 27-25 31C18 57 7 46 7 30V12z" fill="url(#emb-a)"/>
  <path d="M32 3 57 12v18c0 16-11 27-25 31" fill="#000" opacity=".22"/>
  <path d="M32 8.5 52 15.6V30c0 12.8-8.4 22-20 25.6C20.4 52 12 42.8 12 30V15.6z" fill="none" stroke="#fff" stroke-opacity=".25" stroke-width="1.4"/>
  <path d="M36.5 12 21 35h9.5L26 52l17.5-25H33.6z" fill="url(#emb-b)"/>
</svg>`;
