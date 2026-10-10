//
// AN EDITOR WEARS THE STUDIO'S SKIN (docs/PLUGINS.md, "Wearing the studio's
// skin"). Self-contained -- no imports -- so a plugin carries it as its own
// copy, suite-skin.js, the way it carries suite-sdk.js.
//
// A plugin's shim gives the skin message to wearSkin with a map from the
// editor's own CSS variables to skin tokens:
//
//   import { wearSkin } from './suite-skin.js'
//   connectSuite({ …, onSkin: (bundle, mode, pointer) => wearSkin(bundle, mode, pointer, {
//     vars: { '--bg': 'color.bg.app', '--text': 'color.text.primary', '--accent': 'color.accent' }
//   }) })
//
// The editor's own stylesheet is not touched: its variables are given the
// skin's values over it (!important, so its own light/dark rules lose too),
// the page's colour scheme follows the skin, and the skin's fonts and
// --dnp-* tokens are on the page for anything that asks for them.
//

/** The CSS variable a token is: 'color.bg.app' -> 'var(--dnp-color-bg-app)'. */
export const tokenVar = (path) => `var(--dnp-${String(path).replace(/\./g, '-')})`

/**
 * Wear `bundle` (a baked uikit skin) in `mode` / `pointer` on this page.
 * @param vars   { '--editor-var': 'token.path' | 'raw CSS value' }: a value
 *               with no space and a dot in it is a token path, else it is used as written
 * @param font   true: the page's text in the skin's UI font
 * @param mono   selectors whose text is the skin's monospace (code, numbers)
 * @param css    any further CSS the editor needs, written after the map
 */
export function wearSkin (bundle, mode, pointer, { vars = {}, font = true, mono = [], css = '', doc = document } = {}) {
  if (!bundle?.css) return false
  const root = doc.documentElement
  put(doc, 'dnp-skin-css', [bundle.fontCss ?? '', ...Object.values(bundle.css)].join('\n'))
  root.dataset.dnpMode = mode
  root.dataset.dnpPointer = pointer
  const key = bundle.tokens?.[`${mode}/${pointer}`] ? `${mode}/${pointer}` : Object.keys(bundle.tokens ?? {})[0]
  const tokens = bundle.tokens?.[key] ?? {}
  const value = (v) => (/^[a-zA-Z][\w]*(\.[\w]+)+$/.test(v) ? tokenVar(v) : v)
  const decl = Object.entries(vars).map(([k, v]) => `${k}:${value(v)} !important`)
  decl.push(`color-scheme:${isLight(tokens['color.bg.app']) ? 'light' : 'dark'} !important`)
  const rules = [`:root{${decl.join(';')}}`]
  if (font) rules.push(`html,body{font-family:${tokenVar('font.ui')} !important}`)
  if (mono.length) rules.push(`${mono.join(',')}{font-family:${tokenVar('font.mono')} !important}`)
  if (css) rules.push(css)
  put(doc, 'dnp-skin-map', rules.join('\n'))
  return true
}

function put (doc, id, text) {
  let el = doc.getElementById(id)
  if (!el) { el = doc.createElement('style'); el.id = id }
  el.textContent = text
  // Last in the head, after the editor's own styles, so the map wins ties.
  doc.head.appendChild(el)
}

function isLight (css) {
  const m = /^#([0-9a-f]{6})/i.exec(String(css ?? '').trim())
  if (!m) return false
  const n = parseInt(m[1], 16)
  const lin = (c) => { c /= 255; return c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4 }
  return 0.2126 * lin(n >> 16) + 0.7152 * lin((n >> 8) & 255) + 0.0722 * lin(n & 255) > 0.5
}
