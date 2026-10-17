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
//   skin.pointer   touch | mouse | auto                (auto: follows the device)
//
import { applySkin, colorParts } from '../vendor/uikit/runtime.js'

export const DEFAULT_SKIN = 'claude'
export const DEFAULT_MODE = 'auto'
// Follows the device by default (the playtest of 2026-10-17: a Mac came up
// finger-sized). Touch and mouse are still a choice on the Style page.
export const DEFAULT_POINTER = 'auto'

const SKINS = new URL('../vendor/uikit/skins/', import.meta.url)

let catalog = null
/** The icon catalog: every id, and the glyph shown where a skin draws none. */
export async function iconCatalog () {
  if (!catalog) catalog = fetch(new URL('../vendor/uikit/catalog/icons.json', import.meta.url)).then((r) => (r.ok ? r.json() : { groups: [] })).catch(() => ({ groups: [] }))
  return catalog
}

let listing = null
/** The shipped skins: [{ id, name, about, modes, pointers, file }]. */
async function shipped () {
  if (!listing) listing = fetch(new URL('index.json', SKINS)).then((r) => (r.ok ? r.json() : [])).catch(() => [])
  return listing
}

/** Every skin this device can wear: the shipped ones, then those imported here ({ imported: true }). */
export async function skinList () {
  const own = await importedSkins().catch(() => [])
  return [...await shipped(), ...own.map(({ bundle }) => ({ ...summary(bundle), imported: true }))]
}

/** One bundle, by id: shipped, else imported; the default skin when there is no such id. */
export async function loadBundle (id) {
  const list = await shipped()
  const hit = list.find((s) => s.id === id)
  if (!hit) {
    const own = (await importedSkins().catch(() => [])).find((r) => r.id === id)
    if (own) return own.bundle
  }
  const file = (hit ?? list.find((s) => s.id === DEFAULT_SKIN) ?? list[0])?.file ?? `${DEFAULT_SKIN}.skin.js`
  return (await import(new URL(file, SKINS).href)).default
}

// --- skins imported from outside ------------------------------------------------------
// A skin made with uikit (node uikit/build.js <name>, or the testbench's "Bake
// bundle") is one baked file: its JSON, or the same as an ES module
// (`export default {...}`, a .skin.js). Imported ones are kept on this device
// in their own IndexedDB, never in a module.
const SKIN_DB = 'dnp-studio-skins'
function skinDb () {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(SKIN_DB, 1)
    req.onupgradeneeded = () => req.result.createObjectStore('skins', { keyPath: 'id' })
    req.onsuccess = () => resolve(req.result)
    req.onerror = () => reject(req.error)
  })
}
async function tx (mode, fn) {
  const db = await skinDb()
  return new Promise((resolve, reject) => {
    const t = db.transaction('skins', mode)
    const out = fn(t.objectStore('skins'))
    t.oncomplete = () => { db.close(); resolve(out.result ?? out) }
    t.onerror = () => { db.close(); reject(t.error) }
  })
}
/** The skins imported on this device: [{ id, bundle, at }]. */
export const importedSkins = () => tx('readonly', (st) => st.getAll())

const summary = (b) => ({ id: b.id, name: b.name ?? b.id, about: b.about ?? '', modes: b.modes ?? [], pointers: b.pointers ?? [] })

/**
 * A baked skin from a file's text: the bundle, or an Error saying what is
 * wrong with it. Pure (the import test runs it under Node).
 */
export function parseSkinFile (text) {
  let src = String(text ?? '').trim()
  // A .skin.js: `// comment` lines, then `export default {...};`
  src = src.replace(/^(\s*\/\/[^\n]*\n)*/, '').replace(/^export\s+default\s+/, '').replace(/;\s*$/, '')
  let b
  try { b = JSON.parse(src) } catch { return new Error('this is not a baked skin: neither a .skin.json nor a .skin.js from uikit') }
  if (b?.format !== 'dnp-skin') return new Error('this file is not a dnp-skin (no "format": "dnp-skin")')
  for (const k of ['id', 'css', 'tokens', 'canvas', 'modes']) if (!b[k]) return new Error(`this skin has no ${k}: bake it with node uikit/build.js, not the skin.json source`)
  if (!Array.isArray(b.modes) || !b.modes.length || !Object.keys(b.css).length) return new Error('this skin has no modes')
  if (!/^[\w-]+$/.test(b.id)) return new Error(`the skin's id "${b.id}" is not letters, digits, _ and -`)
  return b
}

/**
 * Keep a skin from a file on this device. A shipped skin's id is never
 * replaced: an import that takes one is filed as <id>-own.
 * Returns its summary, or throws with what is wrong.
 */
export async function importSkin (text) {
  const b = parseSkinFile(text)
  if (b instanceof Error) throw b
  if ((await shipped()).some((s) => s.id === b.id)) b.id = `${b.id}-own`
  await tx('readwrite', (st) => st.put({ id: b.id, bundle: b, at: Date.now() }))
  return summary(b)
}

/** Forget an imported skin. */
export const removeSkin = (id) => tx('readwrite', (st) => st.delete(id))

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
