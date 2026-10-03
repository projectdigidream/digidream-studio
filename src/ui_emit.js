//
// The module's screens as files: assets/ui/index.json and the layouts it names
// (docs/UI_LAYOUT.md 3).
//
// The module document keeps ONE layout, `module.ui`, for every map; a map that
// needs its own keeps a complete one of its own in `doc.ui`. Complete, not a
// patch: the client never merges layouts, it picks one file per level -- by the
// level's NAME, else the default (engine/client/src/render/layout.js,
// layoutFileFor) -- so what the studio shows for a map is exactly the file the
// game draws from.
//
// A module that never opened the Screens window writes nothing here, and the
// client draws its built-in default.
//

export const UI_DIR = 'assets/ui'
export const DEFAULT_FILE = 'hud.json'

/** The file a map's own layout is written to. */
export const mapFile = (name) => `map_${name}.json`

/**
 * A layout to start editing from: a deep copy of `base` (the client's
 * DEFAULT_LAYOUT, which reproduces what was hard-coded), so a module begins
 * from exactly what the game already draws.
 */
export function newLayout (base) {
  return JSON.parse(JSON.stringify(base))
}

/** Every file the module's screens need, [{ path, bytes }]; empty when it has none. */
export function uiFiles (module, docs) {
  if (!module.ui) return []
  const index = { version: 1, default: DEFAULT_FILE, maps: {} }
  const files = [{ path: `${UI_DIR}/${DEFAULT_FILE}`, bytes: JSON.stringify(module.ui, null, 1) }]
  for (const doc of docs) {
    if (!doc.ui) continue
    index.maps[doc.name] = mapFile(doc.name)
    files.push({ path: `${UI_DIR}/${mapFile(doc.name)}`, bytes: JSON.stringify(doc.ui, null, 1) })
  }
  if (!Object.keys(index.maps).length) delete index.maps
  files.unshift({ path: `${UI_DIR}/index.json`, bytes: JSON.stringify(index, null, 1) })
  return files
}

/**
 * The anchor a rectangle is nearest, and the offset that keeps it where it is.
 *
 * Dropping an element re-anchors it to the ninth of the screen its centre is
 * in, so a bar dragged to the top right stays at the top right on a wider
 * screen rather than drifting with the left edge. The inverse of the client's
 * `place`: given the rectangle in px and the scale, the (x, y) in UI units
 * that `place` would put it at from that anchor.
 */
export function anchorFor (rect, width, height, scale, insets = {}) {
  const ins = { top: 0, right: 0, bottom: 0, left: 0, ...insets }
  const L = ins.left; const R = width - ins.right; const T = ins.top; const B = height - ins.bottom
  const cx = rect.left + rect.width / 2
  const cy = rect.top + rect.height / 2
  const col = cx < L + (R - L) / 3 ? 'l' : cx > L + 2 * (R - L) / 3 ? 'r' : 'c'
  const row = cy < T + (B - T) / 3 ? 't' : cy > T + 2 * (B - T) / 3 ? 'b' : 'c'
  const anchor = row === 'c' && col === 'c' ? 'c' : row === 'c' ? col : col === 'c' ? row : row + col
  const x = col === 'l' ? rect.left - L : col === 'r' ? rect.left + rect.width - R : cx - (L + R) / 2
  const y = row === 't' ? rect.top - T : row === 'b' ? rect.top + rect.height - B : cy - (T + B) / 2
  return { anchor, x: Math.round(x / scale), y: Math.round(y / scale) }
}
