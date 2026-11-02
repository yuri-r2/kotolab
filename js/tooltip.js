// Small, unobtrusive tooltips for any element with a data-tip attribute.
//  * mouse: shows after resting on a control; ⓘ info buttons show quickly
//  * keyboard: shows on keyboard focus
//  * touch: tap an ⓘ button, or press and hold any other tipped control
// The bubble never takes clicks, and it gets out of the way as soon as you
// click, drag, type or scroll. Touch tips fade on their own.

const HOVER_DELAY = 700;   // ordinary controls: only when you pause on them
const INFO_DELAY = 120;    // ⓘ buttons exist to be read
const TOUCH_HOLD = 550;
const TOUCH_SHOW = 2600;   // touch tips hide themselves

let bubble = null;
let current = null;
let showTimer = null;
let pressTimer = null;
let autoHide = null;
let quiet = null;          // element just clicked: no tip until the pointer leaves it

function ensureBubble() {
  if (bubble) return bubble;
  bubble = document.createElement('div');
  bubble.className = 'tooltip';
  bubble.id = 'kotolab-tooltip';
  bubble.setAttribute('role', 'tooltip');
  bubble.hidden = true;
  document.body.appendChild(bubble);
  return bubble;
}

function place(target) {
  const b = ensureBubble();
  const r = target.getBoundingClientRect();
  b.style.left = '0px';
  b.style.top = '0px';
  b.hidden = false;
  const bw = b.offsetWidth, bh = b.offsetHeight;
  const margin = 6, gap = 6;
  let left = r.left + r.width / 2 - bw / 2;
  left = Math.max(margin, Math.min(window.innerWidth - bw - margin, left));
  let top = r.bottom + gap;
  let below = true;
  if (top + bh > window.innerHeight - margin) { top = r.top - bh - gap; below = false; }
  b.style.left = `${left}px`;
  b.style.top = `${top}px`;
  b.dataset.side = below ? 'below' : 'above';
  b.style.setProperty('--arrow-x', `${Math.max(10, Math.min(bw - 10, r.left + r.width / 2 - left))}px`);
}

export function showTip(target, { touch = false } = {}) {
  const text = target.dataset.tip;
  if (!text) return;
  const b = ensureBubble();
  b.textContent = text;
  current = target;
  target.setAttribute('aria-describedby', b.id);
  // the bubble can sit inside a modal dialog's top layer only if it is in it
  const host = target.closest('dialog[open]') || document.body;
  if (b.parentNode !== host) host.appendChild(b);
  place(target);
  clearTimeout(autoHide);
  if (touch) autoHide = setTimeout(hideTip, TOUCH_SHOW);
}

export function hideTip() {
  clearTimeout(showTimer);
  clearTimeout(autoHide);
  if (current) current.removeAttribute('aria-describedby');
  current = null;
  if (bubble) bubble.hidden = true;
}

export function initTooltips(root = document) {
  root.addEventListener('pointerover', (e) => {
    if (e.pointerType === 'touch' || e.buttons) return; // not while dragging
    const t = e.target.closest('[data-tip]');
    if (!t || t === current || t === quiet) return;
    clearTimeout(showTimer);
    showTimer = setTimeout(() => showTip(t), t.classList.contains('tip') ? INFO_DELAY : HOVER_DELAY);
  });
  root.addEventListener('pointerout', (e) => {
    if (e.pointerType === 'touch') return;
    const t = e.target.closest('[data-tip]');
    if (!t || t.contains(e.relatedTarget)) return;
    if (t === quiet) quiet = null;
    clearTimeout(showTimer);
    if (t === current) hideTip();
  });
  root.addEventListener('focusin', (e) => {
    const t = e.target.closest('[data-tip]');
    if (t && t !== quiet && t.matches(':focus-visible')) showTip(t);
  });
  root.addEventListener('focusout', () => hideTip());
  // ⓘ buttons toggle on click/tap; any other click hides the tip and keeps it away
  root.addEventListener('click', (e) => {
    const t = e.target.closest('.tip');
    if (!t) return;
    e.preventDefault();
    e.stopPropagation();
    if (current === t) hideTip(); else showTip(t, { touch: e.pointerType === 'touch' });
  }, true);
  root.addEventListener('pointerdown', (e) => {
    const info = e.target.closest('.tip');
    if (!info) {
      hideTip();
      quiet = e.target.closest('[data-tip]');
    }
    clearTimeout(pressTimer);
    // touch: press and hold a tipped control to see what it does
    if (e.pointerType !== 'touch' || info) return;
    const t = e.target.closest('[data-tip]');
    if (t) pressTimer = setTimeout(() => showTip(t, { touch: true }), TOUCH_HOLD);
  }, true);
  const cancelPress = () => clearTimeout(pressTimer);
  root.addEventListener('pointerup', cancelPress);
  root.addEventListener('pointercancel', cancelPress);
  root.addEventListener('pointermove', (e) => { if (e.pointerType === 'touch') cancelPress(); });
  window.addEventListener('scroll', hideTip, { passive: true, capture: true });
  window.addEventListener('resize', hideTip);
  document.addEventListener('keydown', (e) => {
    if (!current) return;
    // keep a tip that keyboard focus just opened when tabbing between controls
    if (e.key === 'Tab') return;
    hideTip();
  });
}
