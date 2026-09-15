/* Small DOM helpers shared by every view. */

export const esc = (v: unknown): string =>
  String(v ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);

export const cx = (...classes: (string | false | null | undefined)[]): string => classes.filter(Boolean).join(' ');

export const plural = (n: number, one: string, many = `${one}s`): string => `${n} ${n === 1 ? one : many}`;

export const signed = (n: number): string => (n > 0 ? `+${n}` : String(n));

export function toast(message: string, tone: 'ok' | 'bad' | 'info' = 'ok'): void {
  const host = document.getElementById('tk-toasts');
  if (!host) return;
  const el = document.createElement('div');
  el.className = `toast toast--${tone}`;
  el.textContent = message;
  host.append(el);
  setTimeout(() => el.classList.add('is-leaving'), 2600);
  setTimeout(() => el.remove(), 3000);
}
