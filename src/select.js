/* ============================================================
   ESPORTS SELECT — custom listbox
   macOS (and iOS) draw the native <select> popup themselves and ignore
   `option { background }`, so the system accent highlight always leaks
   through. The only way to control the list is to stop using it.

   Each <select.select-esports> is upgraded into:
     - a styled <button> trigger
     - a listbox rendered into <body> (a "portal")
   The original <select> stays in the DOM, hidden, and remains the single
   source of truth: we write its .value and dispatch `change`, so every
   existing reader (updateLive, the submit handler) keeps working unchanged.
   If this module never runs, the native select is still there and usable.

   The listbox is portalled to <body> rather than positioned inside the
   card because the team cards are `overflow-hidden` — an in-card popup
   would be clipped.
============================================================ */

let open = null;   // { select, trigger, pop, options, active }

/* ---------- public API ---------- */

export function enhanceSelects(root = document) {
  root.querySelectorAll('select.select-esports:not([data-enhanced])').forEach(enhance);
}

/* Mirror validation state onto the trigger (the select is invisible). */
export function setSelectState(select, { error = false, empty = false } = {}) {
  select.classList.toggle('is-error', error);
  select.classList.toggle('is-empty', empty);
  const t = select.__trigger;
  if (t) {
    t.classList.toggle('is-error', error);
    t.classList.toggle('is-empty', empty);
  }
}

/* Call after changing select.value programmatically. */
export function syncSelect(select) {
  const t = select.__trigger;
  if (!t) return;
  const opt = select.selectedOptions[0];
  t.querySelector('.sel-label').textContent = opt ? opt.textContent : '';
}

/* ---------- internals ---------- */

function enhance(select) {
  select.dataset.enhanced = '1';

  const wrap = select.closest('.sel') || (() => {
    const w = document.createElement('div');
    w.className = 'sel';
    select.parentNode.insertBefore(w, select);
    w.appendChild(select);
    return w;
  })();

  select.classList.add('sel-native');
  select.tabIndex = -1;
  select.setAttribute('aria-hidden', 'true');

  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.className = 'sel-trigger';
  trigger.setAttribute('aria-haspopup', 'listbox');
  trigger.setAttribute('aria-expanded', 'false');
  const label = select.getAttribute('aria-label');
  if (label) trigger.setAttribute('aria-label', label);
  trigger.innerHTML = `<span class="sel-label"></span><span class="sel-chevron" aria-hidden="true"></span>`;
  wrap.appendChild(trigger);

  select.__trigger = trigger;
  trigger.__select = select;
  syncSelect(select);

  trigger.addEventListener('click', e => { e.preventDefault(); toggle(select); });
  trigger.addEventListener('keydown', e => onTriggerKey(e, select));

  // Keep the label honest if anything sets select.value programmatically and
  // dispatches change (our own picks are already synced in choose()).
  select.addEventListener('change', () => syncSelect(select));
}

function toggle(select) {
  if (open && open.select === select) closeList();
  else openList(select);
}

function openList(select) {
  closeList();
  const trigger = select.__trigger;

  const pop = document.createElement('div');
  pop.className = 'sel-pop';
  pop.setAttribute('role', 'listbox');
  if (select.getAttribute('aria-label')) pop.setAttribute('aria-label', select.getAttribute('aria-label'));

  const options = [...select.options].map((o, i) => {
    const el = document.createElement('div');
    el.className = 'sel-opt' + (o.selected ? ' is-selected' : '') + (o.value === '' ? ' is-placeholder' : '');
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(o.selected));
    el.id = `sel-opt-${Math.random().toString(36).slice(2, 8)}-${i}`;
    el.innerHTML = `<span class="sel-check" aria-hidden="true">✓</span><span>${o.textContent}</span>`;
    el.addEventListener('click', () => choose(select, i));
    el.addEventListener('mousemove', () => setActive(i));
    pop.appendChild(el);
    return el;
  });

  document.body.appendChild(pop);
  open = { select, trigger, pop, options, active: Math.max(0, select.selectedIndex) };

  position();
  setActive(open.active);
  trigger.setAttribute('aria-expanded', 'true');
  trigger.classList.add('is-open');

  // Deferred so the click that opened the list does not immediately close it.
  setTimeout(() => {
    document.addEventListener('pointerdown', onDocDown, true);
    window.addEventListener('resize', position, true);
    window.addEventListener('scroll', position, true);
  }, 0);
}

function closeList() {
  if (!open) return;
  const { pop, trigger } = open;
  document.removeEventListener('pointerdown', onDocDown, true);
  window.removeEventListener('resize', position, true);
  window.removeEventListener('scroll', position, true);
  pop.remove();
  trigger.setAttribute('aria-expanded', 'false');
  trigger.classList.remove('is-open');
  trigger.removeAttribute('aria-activedescendant');
  open = null;
}

function onDocDown(e) {
  if (!open) return;
  if (open.pop.contains(e.target) || open.trigger.contains(e.target)) return;
  closeList();
}

/* Fixed positioning against the trigger's viewport rect; flips above when
   there is not enough room below. */
function position() {
  if (!open) return;
  const { trigger, pop } = open;
  const r = trigger.getBoundingClientRect();
  const gap = 6;
  // innerWidth/innerHeight can be 0 in a backgrounded or non-compositing view;
  // fall back so the popup never collapses into the corner.
  const vw = window.innerWidth  || document.documentElement.clientWidth  || 1024;
  const vh = window.innerHeight || document.documentElement.clientHeight || 768;

  const width = Math.max(r.width, 178);
  pop.style.width = `${width}px`;

  // measure at natural height before deciding direction
  pop.style.maxHeight = '';
  const h = pop.offsetHeight;
  const below = vh - r.bottom - gap;
  const above = r.top - gap;
  const flip = h > below && above > below;

  pop.style.maxHeight = `${Math.max(120, (flip ? above : below) - 8)}px`;
  pop.style.top = flip
    ? `${Math.max(8, r.top - Math.min(h, above) - gap)}px`
    : `${r.bottom + gap}px`;

  let left = r.right - width;                        // right-aligned to the trigger
  left = Math.min(left, vw - width - 8);
  pop.style.left = `${Math.max(8, left)}px`;
}

function setActive(i) {
  if (!open) return;
  open.active = Math.max(0, Math.min(i, open.options.length - 1));
  open.options.forEach((el, n) => el.classList.toggle('is-active', n === open.active));
  const el = open.options[open.active];
  if (el) {
    open.trigger.setAttribute('aria-activedescendant', el.id);
    el.scrollIntoView({ block: 'nearest' });
  }
}

function choose(select, i) {
  const prev = select.value;
  select.selectedIndex = i;
  syncSelect(select);
  closeList();
  select.__trigger.focus();
  if (select.value !== prev) {
    select.dispatchEvent(new Event('input',  { bubbles: true }));
    select.dispatchEvent(new Event('change', { bubbles: true }));
  }
}

function onTriggerKey(e, select) {
  const isOpen = open && open.select === select;
  switch (e.key) {
    case 'ArrowDown':
    case 'ArrowUp':
      e.preventDefault();
      if (!isOpen) return openList(select);
      return setActive(open.active + (e.key === 'ArrowDown' ? 1 : -1));
    case 'Home': if (isOpen) { e.preventDefault(); setActive(0); } return;
    case 'End':  if (isOpen) { e.preventDefault(); setActive(open.options.length - 1); } return;
    case 'Enter':
    case ' ':
      e.preventDefault();
      if (!isOpen) return openList(select);
      return choose(select, open.active);
    case 'Escape':
      if (isOpen) { e.preventDefault(); closeList(); }
      return;
    case 'Tab':
      if (isOpen) closeList();
      return;
    default:
      // type-ahead: jump to the first option starting with the typed character
      if (isOpen && e.key.length === 1) {
        const k = e.key.toLowerCase();
        const i = open.options.findIndex(o => o.textContent.trim().toLowerCase().startsWith(k));
        if (i >= 0) setActive(i);
      }
  }
}
