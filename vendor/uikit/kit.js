// DOM builders for the registry's components: the markup a skin styles.
// Tools adopting the kit build the same class names (by hand, in React, or
// with these helpers); the testbench builds everything with these.

// ---------- plumbing ----------

/** h('div', {class, text, style, on: {click}, ...attrs}, ...children) */
export function h (tag, props = {}, ...kids) {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(props ?? {})) {
    if (v == null || v === false) continue;
    if (k === 'class') el.className = Array.isArray(v) ? v.filter(Boolean).join(' ') : v;
    else if (k === 'text') el.textContent = v;
    else if (k === 'style' && typeof v === 'object') Object.assign(el.style, v);
    else if (k === 'vars') for (const [vk, vv] of Object.entries(v)) el.style.setProperty(vk, vv);
    else if (k === 'on') for (const [ev, fn] of Object.entries(v)) el.addEventListener(ev, fn);
    else el.setAttribute(k, v === true ? '' : v);
  }
  for (const kid of kids.flat(Infinity)) if (kid != null && kid !== false) el.append(kid instanceof Node ? kid : document.createTextNode(String(kid)));
  return el;
}

/** Classes for a component root: ui-name, ui-name--variant, is-state… */
export function cls (name, { variant, state } = {}) {
  return [`ui-${name}`, ...[].concat(variant ?? []).filter(Boolean).map((v) => `ui-${name}--${v}`),
    ...[].concat(state ?? []).filter(Boolean).map((s) => `is-${s}`)];
}
const part = (name, p, state) => [`ui-${name}__${p}`, ...[].concat(state ?? []).filter(Boolean).map((s) => `is-${s}`)];

// ---------- icons ----------

let iconSource = { url: () => null, tint: () => true, glyph: () => '?' };
/** url(id) -> URL or null; tint(id) -> paint in text colour?; glyph(id) -> fallback text. */
export function setIconSource (src) { iconSource = { ...iconSource, ...src }; }

export function icon (id, { size, label } = {}) {
  const url = iconSource.url(id);
  const vars = size ? { '--icon-size': `${size}px` } : {};
  if (url) {
    return h('span', { class: ['ui-icon', iconSource.tint(id) ? '' : 'is-img'], vars: { ...vars, '--icon': `url("${url}")` }, 'data-icon': id, role: label ? 'img' : null, 'aria-label': label });
  }
  return h('span', { class: ['ui-icon', 'ui-icon--missing', 'is-glyph'], vars, 'data-icon': id, title: `${id}: not drawn yet` }, iconSource.glyph(id));
}
const ic = (id) => (id ? icon(id) : null);

// ---------- buttons ----------

export const button = (label, { variant, state, icon: i, title } = {}) =>
  h('button', { class: cls('button', { variant, state }), disabled: [].concat(state ?? []).includes('disabled'), title },
    ic(i), label ? h('span', { class: 'ui-button__label' }, label) : null);

export const iconButton = (i, opts = {}) => button(null, { ...opts, icon: i, variant: ['icon', ...[].concat(opts.variant ?? [])], title: opts.title ?? i });

export const chip = (label, { variant, state, remove } = {}) =>
  h('span', { class: cls('chip', { variant, state }) }, label, remove ? h('span', { class: part('chip', 'remove') }, '×') : null);

export function seg (items, on = 0, { onPick } = {}) {
  const root = h('div', { class: cls('seg'), role: 'tablist' });
  items.forEach((label, i) => root.append(h('button', {
    class: part('seg', 'item', i === on ? 'on' : null),
    on: { click: () => { [...root.children].forEach((c, j) => c.classList.toggle('is-on', i === j)); onPick?.(i); } },
  }, label)));
  return root;
}

export function toggle (on = false, { state } = {}) {
  const el = h('button', { class: cls('switch', { state: [on ? 'on' : null, ...[].concat(state ?? [])] }), role: 'switch' },
    h('span', { class: 'ui-switch__thumb' }));
  el.addEventListener('click', () => el.classList.toggle('is-on'));
  return el;
}

export function mini (letter, variant, { state } = {}) {
  const el = h('button', { class: cls('mini', { variant, state }) }, letter);
  if (variant !== 'close') el.addEventListener('click', () => el.classList.toggle('is-on'));
  return el;
}

export const help = ({ state } = {}) => h('button', { class: cls('help', { state }) }, 'i');

// ---------- fields ----------

export function field ({ value = '', placeholder = '', variant, state, icon: i, unit, options, rows } = {}) {
  let input;
  if (variant === 'code') input = h('textarea', { rows: rows ?? 4, spellcheck: 'false' });
  else if (options) input = h('select', {}, options.map((o) => h('option', {}, o)));
  else input = h('input', { placeholder });
  if (!options) input.value = value;
  const v = options ? ['select', ...[].concat(variant ?? [])] : variant;
  return h('label', { class: cls('field', { variant: v, state }) },
    i ? h('span', { class: 'ui-field__icon' }, icon(i)) : null, input,
    unit ? h('span', { class: 'ui-field__unit' }, unit) : null);
}

export function stepper (value, { unit, state } = {}) {
  const input = h('input', { class: 'ui-stepper__input', value });
  const step = (d) => { const n = parseFloat(input.value) || 0; input.value = String(Math.round((n + d) * 100) / 100); };
  return h('span', { class: cls('stepper', { state }) },
    h('button', { class: 'ui-stepper__step', on: { click: () => step(-1) } }, '−'), input,
    h('button', { class: 'ui-stepper__step', on: { click: () => step(1) } }, '+'),
    unit ? h('span', { class: 'ui-stepper__unit' }, unit) : null);
}

/** A slider row: label, track, readout. value 0..1; fmt(v) gives the readout. */
export function slider (label, value = 0.5, { fmt = (v) => `${Math.round(v * 100)}%`, idle = false, state, thumbState } = {}) {
  const fill = h('span', { class: 'ui-slider__fill' });
  const thumb = h('span', { class: part('slider', 'thumb', thumbState) });
  const track = h('span', { class: 'ui-slider__track' }, fill, thumb);
  const out = h('span', { class: 'ui-slider__value' });
  const lab = h('span', { class: part('slider', 'label', idle ? 'idle' : null) }, label);
  const set = (v) => { v = Math.max(0, Math.min(1, v)); fill.style.width = `${v * 100}%`; thumb.style.left = `${v * 100}%`; out.textContent = fmt(v); };
  set(value);
  track.addEventListener('pointerdown', (e) => {
    track.setPointerCapture(e.pointerId);
    const move = (ev) => { const r = track.getBoundingClientRect(); set((ev.clientX - r.left) / r.width); lab.classList.remove('is-idle'); };
    move(e);
    track.onpointermove = move;
    track.onpointerup = () => { track.onpointermove = null; };
  });
  return h('div', { class: cls('slider', { state }) }, lab, track, out);
}

export const colorwell = (color, { state } = {}) => h('button', { class: cls('colorwell', { state }), style: { background: color }, title: color });

export const key = (text, { state } = {}) => h('button', { class: cls('key', { state }) }, icon('action.keyboard', { size: 14 }), [].concat(state ?? []).includes('waiting') ? 'press a key… (Esc)' : text);

// ---------- containers ----------

export const card = (title, body, { sub, actions, variant } = {}) =>
  h('div', { class: cls('card', { variant }) },
    title ? h('div', { class: 'ui-card__head' }, h('div', { class: 'ui-card__title' }, title, sub ? h('div', { class: 'ui-card__sub' }, sub) : null), actions) : null,
    h('div', { class: 'ui-card__body' }, body));

export const section = (tone, title, body) =>
  h('div', { class: cls('section', { variant: tone }) }, h('div', { class: 'ui-section__head' }, title), h('div', { class: 'ui-section__body' }, body));

export function fold (title, body, { sub, open = false } = {}) {
  const root = h('div', { class: cls('fold', { state: open ? 'open' : null }) });
  root.append(
    h('button', { class: 'ui-fold__head', on: { click: () => root.classList.toggle('is-open') } },
      h('span', { class: 'ui-fold__chevron' }, '▸'), h('span', { class: 'ui-fold__title' }, title, sub ? h('div', { class: 'ui-fold__sub' }, sub) : null)),
    h('div', { class: 'ui-fold__body' }, body));
  return root;
}

export const heading = (text, i) => h('div', { class: cls('heading') }, i ? h('span', { class: 'ui-heading__icon' }, icon(i, { size: 14 })) : null, text);

export const row = ({ thumb, mark, name, sub, end, state } = {}) =>
  h('div', { class: cls('row', { state }) },
    thumb ? h('span', { class: 'ui-row__thumb', style: { background: thumb } }) : null,
    mark ? h('span', { class: 'ui-row__mark' }, icon(mark)) : null,
    h('span', { class: 'ui-row__text' }, h('span', { class: 'ui-row__name' }, name), sub ? h('span', { class: 'ui-row__sub' }, sub) : null),
    end !== undefined ? h('span', { class: 'ui-row__end' }, end ?? '›') : h('span', { class: 'ui-row__end' }, '›'));

export const tile = (caption, pic, { state } = {}) =>
  h('button', { class: cls('tile', { state }) }, h('span', { class: 'ui-tile__pic', style: { background: pic } }), h('span', { class: 'ui-tile__caption' }, caption));

export const strip = (pics, sel = 0) =>
  h('div', { class: cls('strip') }, pics.map((p, i) => h('button', { class: part('strip', 'item', i === sel ? 'selected' : null), style: { background: p } })));

// ---------- navigation ----------

/** items: [{icon, label, badge, on}] or 'sep' */
export const rail = (items, { variant } = {}) =>
  h('nav', { class: cls('rail', { variant }) }, items.map((it) => it === 'sep' ? h('div', { class: 'ui-rail__sep' })
    : it === 'gap' ? h('div', { style: { flex: '1' } })
    : h('button', { class: part('rail', 'item', it.on ? 'on' : null), title: it.label }, icon(it.icon), h('span', { class: 'ui-rail__label' }, it.label),
      it.badge ? h('span', { class: cls('badge', { variant: 'error' }).concat('ui-rail__badge') }, it.badge) : null)));

export const topbar = (title, { sub, left = [], right = [] } = {}) =>
  h('header', { class: cls('topbar') }, left, h('div', { style: { flex: '1', minWidth: '0' } }, h('div', { class: 'ui-topbar__title' }, title), sub ? h('div', { class: 'ui-topbar__sub' }, sub) : null), right);

export function tabs (labels, on = 0) {
  const root = h('div', { class: cls('tabs') });
  labels.forEach((l, i) => root.append(h('button', { class: part('tabs', 'tab', i === on ? 'on' : null), on: { click: () => [...root.children].forEach((c, j) => c.classList.toggle('is-on', i === j)) } }, l)));
  return root;
}

export const bottomtabs = (items, on = 0) =>
  h('nav', { class: cls('bottomtabs') }, items.map((it, i) => h('button', { class: part('bottomtabs', 'tab', i === on ? 'on' : null) }, icon(it.icon), h('span', { class: 'ui-bottomtabs__label' }, it.label))));

export function toolbar (items, on = 0) {
  const root = h('div', { class: cls('toolbar') });
  items.forEach((it, i) => root.append(h('button', { class: part('toolbar', 'tool', i === on ? 'on' : null), on: { click: () => [...root.children].forEach((c, j) => c.classList.toggle('is-on', i === j)) } },
    icon(it.icon), it.label ? h('span', { class: 'ui-toolbar__label' }, it.label) : null)));
  return root;
}

export const sheet = (title, body, { variant, close = true } = {}) =>
  h('section', { class: cls('sheet', { variant }) },
    variant === 'side' ? null : h('span', { class: 'ui-sheet__grip' }),
    h('div', { class: 'ui-sheet__head' }, h('span', { class: 'ui-sheet__title' }, title), close ? mini('✕', 'close') : null),
    h('div', { class: 'ui-sheet__body' }, body));

export const drawer = (title, body) => h('section', { class: cls('drawer') }, h('div', { class: 'ui-drawer__head' }, title), h('div', { class: 'ui-drawer__body' }, body));

// ---------- overlays ----------

export const dialog = (title, body, buttons, { variant } = {}) =>
  h('div', { class: cls('dialog', { variant }), role: 'dialog' },
    h('div', { class: 'ui-dialog__head' }, h('div', { class: 'ui-dialog__title' }, title)),
    h('div', { class: 'ui-dialog__body' }, body),
    h('div', { class: 'ui-dialog__foot' }, buttons));

/** items: [{label, shortcut, icon, danger, state}] | 'sep' | {group} */
export const menu = (items) =>
  h('div', { class: cls('menu'), role: 'menu' }, items.map((it) => it === 'sep' ? h('div', { class: 'ui-menu__sep' })
    : it.group ? h('div', { class: 'ui-menu__group' }, it.group)
    : h('button', { class: part('menu', 'item', it.state), disabled: it.state === 'disabled' }, it.icon ? icon(it.icon, { size: 16 }) : null,
      h('span', { class: ['ui-menu__label', it.danger ? 'ui-menu__danger' : ''] }, it.label), it.shortcut ? h('span', { class: 'ui-menu__shortcut' }, it.shortcut) : null)));

export const toast = (text, { variant, close = true } = {}) =>
  h('div', { class: cls('toast', { variant }) }, variant ? icon(variant === 'ok' ? 'status.ok' : variant === 'warn' ? 'status.warning' : 'status.error', { size: 16 }) : null,
    h('span', {}, text), close ? h('span', { class: 'ui-toast__close' }, '✕') : null);

export const tooltip = (text) => h('div', { class: cls('tooltip') }, text);

// ---------- feedback ----------

export const pill = (text, { variant, i } = {}) => h('span', { class: cls('pill', { variant }) }, i ? icon(i, { size: 14 }) : null, text);

export const callout = (variant, title, text, actions) =>
  h('div', { class: cls('callout', { variant }) }, h('span', { class: 'ui-callout__icon' }, icon(variant === 'error' ? 'status.error' : variant === 'warn' ? 'status.warning' : 'status.info')),
    h('div', { style: { flex: '1', display: 'flex', flexDirection: 'column', gap: '6px' } }, title ? h('div', { class: 'ui-callout__title' }, title) : null, text ? h('div', {}, text) : null,
      actions ? h('div', { style: { display: 'flex', gap: '6px' } }, actions) : null));

export const badge = (n, { variant } = {}) => h('span', { class: cls('badge', { variant }) }, n);
export const dot = ({ variant } = {}) => h('span', { class: cls('dot', { variant }) });

export const progress = (v, { label, variant } = {}) =>
  h('div', { class: cls('progress', { variant }) },
    h('div', { class: 'ui-progress__track' }, h('div', { class: 'ui-progress__fill', style: { width: `${v * 100}%` } })),
    label ? h('div', { class: 'ui-progress__label' }, label) : null);

export const boot = (title, v, status, lines = []) =>
  h('div', { class: cls('boot') }, h('div', { class: 'ui-boot__title' }, title),
    h('div', { class: 'ui-boot__track' }, h('div', { class: 'ui-boot__fill', style: { width: `${v * 100}%` } })),
    h('div', { class: 'ui-boot__status' }, status),
    h('div', { class: 'ui-boot__log' }, lines.map((l) => h('div', { class: 'ui-boot__line' }, l))));

/** lines: strings; a leading '!' marks a bad line, '+' an ok one. */
export const log = (lines) =>
  h('div', { class: cls('log') }, lines.map((l) => h('div', { class: ['ui-log__line', l[0] === '!' ? 'ui-log__bad' : l[0] === '+' ? 'ui-log__ok' : ''] }, l.replace(/^[!+]/, ''))));

export const empty = (i, text) => h('div', { class: cls('empty') }, h('span', { class: 'ui-empty__icon' }, icon(i)), h('div', { class: 'ui-empty__text' }, text));
export const kbd = (text) => h('kbd', { class: cls('kbd') }, text);

// ---------- audio ----------

export const transport = ({ playing = false, rec = false, display = '1.1.000' } = {}) =>
  h('div', { class: cls('transport') },
    h('button', { class: part('transport', 'button', playing ? 'on' : null) }, icon('transport.play')),
    h('button', { class: 'ui-transport__button' }, icon('transport.stop')),
    h('button', { class: ['ui-transport__button', 'ui-transport__rec', rec ? 'is-on' : ''] }, icon('transport.record')),
    h('button', { class: 'ui-transport__button' }, icon('transport.loop')),
    h('span', { class: 'ui-transport__display' }, display));

export function meter (v, { peak, variant, width = 160, label } = {}) {
  const fill = h('span', { class: 'ui-meter__fill', style: { width: `${v * 100}%` }, vars: { '--meter-w': `${100 / Math.max(v, 0.01)}%` } });
  const m = h('span', { class: cls('meter', { variant }), style: { width: `${width}px`, display: 'inline-block' } }, fill,
    peak != null ? h('span', { class: 'ui-meter__peak', style: { left: `${peak * 100}%` } }) : null);
  return label ? h('span', { style: { display: 'inline-flex', gap: '8px', alignItems: 'center' } }, m, h('span', { class: 'ui-meter__value' }, label)) : m;
}

/** A piano: `octaves` octaves from C; `pressed` = semitone indexes held, `lit` = sounding. */
export function keys (octaves = 2, { pressed = [], lit = [] } = {}) {
  const root = h('div', { class: cls('keys') });
  const whites = [0, 2, 4, 5, 7, 9, 11];
  const blacks = { 1: 0, 3: 1, 6: 3, 8: 4, 10: 5 };
  const n = octaves * 7;
  const st = (semi) => (pressed.includes(semi) ? 'pressed' : lit.includes(semi) ? 'lit' : null);
  for (let o = 0; o < octaves; o++) for (const w of whites) root.append(h('span', { class: part('keys', 'white', st(o * 12 + w)) }));
  for (let o = 0; o < octaves; o++) {
    for (const [semi, after] of Object.entries(blacks)) {
      const left = ((o * 7 + after + 1) / n) * 100;
      root.append(h('span', { class: part('keys', 'black', st(o * 12 + +semi)), style: { left: `calc(${left}% - ${(100 / n) * 0.3}%)`, width: `${(100 / n) * 0.6}%` } }));
    }
  }
  return root;
}

export const pad = (label, sub, { state } = {}) => h('button', { class: cls('pad', { state }) }, label, h('span', { class: 'ui-pad__sub' }, sub));
