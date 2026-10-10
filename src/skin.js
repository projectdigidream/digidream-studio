//
// THE STUDIO'S SKIN (docs/STUDIO_SKINS.md): which look the studio wears, and
// the handle everything that draws asks for its colours.
//
// The skins are uikit's, baked into vendor/uikit/ by `node uikit/vendor.js
// studio/vendor/uikit` -- never edited here. Only the chosen bundle is loaded.
// The choice is the person's, not the module's: three prefs on this device,
// never written into a module.
//
//   skin           claude | paper | 90s | ps1         (vendor/uikit/skins/index.json)
//   skin.mode      auto | one of the skin's modes      (auto follows the system)
//   skin.pointer   touch | mouse | auto                (touch: the studio is touch-first)
//
import { applySkin } from '../vendor/uikit/runtime.js'

export const DEFAULT_SKIN = 'claude'
export const DEFAULT_MODE = 'auto'
// Touch everywhere by default: mouse sizes (32px controls) would shrink the
// studio on a desktop. Changing this default is the user's call.
export const DEFAULT_POINTER = 'touch'

const SKINS = new URL('../vendor/uikit/skins/', import.meta.url)

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
