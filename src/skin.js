//
// THE STUDIO'S SKIN (docs/STUDIO_SKINS.md): which look the studio wears, and
// the handle everything that draws asks for its colours.
//
// The skins are uikit's, baked into vendor/uikit/ by `node uikit/vendor.js
// studio/vendor/uikit` -- never edited here. Only the chosen bundle is loaded.
// The choice is the person's, not the module's: three prefs on this device,
// never written into a module.
//
//   skin           claude | paper | 90s | ps1 | aero  (vendor/uikit/skins/index.json)
//   skin.mode      auto | one of the skin's modes      (auto follows the system)
//   skin.pointer   touch | mouse | auto                (touch: the studio is touch-first)
//
import { applySkin, colorParts } from '../vendor/uikit/runtime.js'

export const DEFAULT_SKIN = 'claude'
export const DEFAULT_MODE = 'auto'
// Touch everywhere by default: mouse sizes (32px controls) would shrink the
// studio on a desktop. Changing this default is the user's call.
export const DEFAULT_POINTER = 'touch'

const SKINS = new URL('../vendor/uikit/skins/', import.meta.url)

let catalog = null
/** The icon catalog: every id, and the glyph shown where a skin draws none. */
export async function iconCatalog () {
  if (!catalog) catalog = fetch(new URL('../vendor/uikit/catalog/icons.json', import.meta.url)).then((r) => (r.ok ? r.json() : { groups: [] })).catch(() => ({ groups: [] }))
  return catalog
}

let listing = null
/** The shipped skins: [{ id, name, about, modes, pointers, file }]. */
export async function skinList () {
  if (!listing) listing = fetch(new URL('index.json', SKINS)).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return listing
}

/** One baked bundle, by id; the default skin when that id is not shipped. */
export async function loadBundle (id) {
  const list = await skinList()
  const hit = list.find((s) => s.id === id) ?? list.find((s) => s.id === DEFAULT_SKIN) ?? list[0]
  const file = hit?.file ?? `${DEFAULT_SKIN}.skin.js`
  return (await import(new URL(file, SKINS).href)).default
}

/** What this device chose, with the defaults filled in. */
export function chosen (prefs) {
  return {
    skin: prefs?.get('skin') || DEFAULT_SKIN,
    mode: prefs?.get('skin.mode') || DEFAULT_MODE,
    pointer: prefs?.get('skin.pointer') || DEFAULT_POINTER
  }
}

/**
 * Wear the chosen skin. Returns uikit's handle (canvas, palette, token,
 * onChange, setMode, setPointer, replace) plus `id` and `use()`, which
 * switches skin/mode/pointer and remembers the choice.
 */
export async function wearSkin (prefs, root = document.documentElement) {
  const want = chosen(prefs)
  const bundle = await loadBundle(want.skin)
  const skin = applySkin(bundle, { root, mode: want.mode, pointer: want.pointer })
  skin.id = bundle.id
  skin.want = want
  // The page's own colour scheme and the browser chrome follow the skin: a
  // light skin gets light native controls and scrollbars.
  const follow = () => {
    const bg = skin.token('color.bg.app')
    root.style.colorScheme = isLight(bg) ? 'light' : 'dark'
    const meta = root.ownerDocument.querySelector('meta[name="theme-color"]')
    if (meta && bg) meta.setAttribute('content', bg)
  }
  skin.onChange(follow)
  follow()
  // The canvas colours as CSS variables too, for the boards drawn in DOM and SVG.
  skin.onChange(() => canvasVars(skin, root.ownerDocument))
  canvasVars(skin, root.ownerDocument)
  /** Switch any of skin / mode / pointer, and remember it on this device. */
  skin.use = async ({ skin: id, mode, pointer } = {}) => {
    if (id && id !== skin.id) {
      const next = await loadBundle(id)
      skin.id = next.id
      want.skin = next.id
      prefs?.set('skin', next.id)
      // A mode the new skin lacks falls back to auto, so it shows its own first.
      if (want.mode !== 'auto' && !next.modes.includes(want.mode)) { want.mode = 'auto'; prefs?.set('skin.mode', 'auto') }
      skin.setMode(want.mode)
      skin.replace(next)
    }
    if (mode && mode !== want.mode) { want.mode = mode; prefs?.set('skin.mode', mode); skin.setMode(mode) }
    if (pointer && pointer !== want.pointer) { want.pointer = pointer; prefs?.set('skin.pointer', pointer); skin.setPointer(pointer) }
    return skin
  }
  return skin
}

/** Is a CSS colour light (relative luminance over one half)? */
export function isLight (css) {
  const m = /^#([0-9a-f]{6})/i.exec(String(css ?? '').trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  const L = 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255)
  return L > 0.5
}

/**
 * THE CANVAS KEYS AS CSS VARIABLES. The graph board, the state graph and the
 * panels/screens designers are drawn in DOM and SVG, not on a canvas: they
 * ask the skin through these, written on every change of skin or mode.
 *
 *   --cv-<group>-<key>          the entry's colour (dots in the key become dashes)
 *   --cv-<group>-<key>-fill     its fill
 *   --cv-<group>-<key>-width    its line width, px
 *   --cv-<group>-<key>-radius   its corner radius, px
 *   --cv-<group>-<key>-size     its size, px
 *   --cv-<group>-<key>-font     its font
 *   --cv-note-<name>            a graph note colour (palette 'notes'), and
 *   --cv-note-<name>-head       the same at graph.note.alpha, for its title strip
 *   --cv-note-<name>-body       and at a third of that, for its body
 */
export const CANVAS_VAR_GROUPS = ['common', 'map', 'graph', 'preview', 'designer']
export function canvasVars (skin, doc = document) {
  const all = skin.view.compiled.canvas?.[skin.view.key] ?? {}
  const out = []
  const name = (g, k) => `--cv-${g}-${k.replace(/\./g, '-')}`
  for (const g of CANVAS_VAR_GROUPS) {
    for (const [k, spec] of Object.entries(all[g] ?? {})) {
      const n = name(g, k)
      if (spec.color !== undefined) out.push(`${n}:${spec.color}`)
      if (spec.fill !== undefined) out.push(`${n}-fill:${spec.fill}`)
      for (const p of ['width', 'radius', 'size']) if (typeof spec[p] === 'number') out.push(`${n}-${p}:${spec[p]}px`)
      if (spec.font) out.push(`${n}-font:${spec.font}`)
    }
  }
  const alpha = skin.canvas('graph', 'note.alpha').alpha ?? 0.28
  for (const [n, c] of Object.entries(skin.palette('notes') ?? {})) out.push(`--cv-note-${n}:${c}`, `--cv-note-${n}-head:${withAlpha(c, alpha)}`, `--cv-note-${n}-body:${withAlpha(c, alpha / 3)}`)
  let el = doc.getElementById('dnp-canvas-vars')
  if (!el) { el = doc.createElement('style'); el.id = 'dnp-canvas-vars'; doc.head.append(el) }
  el.textContent = `:root{${out.join(';')}}`
}

/** A skin colour at `a` times its own opacity, as rgba(): for fades drawn on a canvas. */
export function withAlpha (css, a = 1) {
  const c = colorParts(css)
  return `rgba(${c.hex >> 16},${(c.hex >> 8) & 255},${c.hex & 255},${+(c.alpha * a).toFixed(3)})`
}
