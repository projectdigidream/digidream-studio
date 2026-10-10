//
// THE WEAPON IN FIRST PERSON (engine/client/src/render/viewmodel.js): the
// pictures a weapon is drawn with over the view when the module is played
// first person (module.txt `controls fps`), as DOOM drew its guns.
//
//   assets/sprites/weapons.json   per weapon, by its name in the weapons runtime:
//                                 `ready` (at rest, looping) and `fire` (one shot)
//                                 frames, each [picture, tics at 35 a second, flash picture?]
//   assets/sprites/index.json     each picture's size, and its offset: where it sits
//                                 on the 320x200 screen (the client hides a picture
//                                 that has no size or offset here)
//
// The module keeps module.viewmodels = { weapons: { name: { ready, fire } } }
// and module.pictureOffsets = { PICTURE: [left, top] }, the offsets as DOOM
// writes them. The studio shows them as where the picture's top-left corner
// is on the screen with the weapon at rest: x = REST_X - left, y = REST_Y - top.
//
// Pure: viewmodel.test.js places what this writes with the client's own code.
//

export const SCREEN = [320, 200]
// Where the client holds the weapon at rest (viewmodel.js: sx 1 with no bob, WEAPONTOP 32).
export const REST_X = 1
export const REST_Y = 32
export const TIC = 1 / 35

/** The module's view models, made if absent. */
export function viewmodelsOf (module) {
  module.viewmodels ??= {}
  module.viewmodels.weapons ??= {}
  return module.viewmodels
}

/** A weapon's view model, made on first edit (`make`), else null. */
export function weaponView (module, name, { make = false } = {}) {
  if (make) return (viewmodelsOf(module).weapons[name] ??= { ready: [], fire: [] })
  return module.viewmodels?.weapons?.[name] ?? null
}

/** Where a picture's top-left corner sits on the screen at rest, from its offset. */
export function screenAt (offset) {
  return { x: REST_X - (offset?.[0] ?? 0), y: REST_Y - (offset?.[1] ?? 0) }
}

/** The offset that puts a picture's top-left corner at (x, y) at rest. */
export function offsetFor (x, y) {
  return [Math.round(REST_X - x), Math.round(REST_Y - y)]
}

/** Bottom centre of the screen, for a picture of size [w, h]: where a gun usually sits. */
export function bottomCentre ([w, h], screen = SCREEN) {
  return { x: Math.round((screen[0] - w) / 2), y: screen[1] - h }
}

/** A picture's offset: the module's own, else bottom centre (so a new picture shows at once). */
export function offsetOf (module, name, size) {
  const own = module.pictureOffsets?.[name]
  if (own) return own
  const at = bottomCentre(size ?? [64, 64])
  return offsetFor(at.x, at.y)
}

/** The pictures a module's view models name. */
export function viewPictures (module) {
  const out = new Set()
  for (const v of Object.values(module.viewmodels?.weapons ?? {})) {
    for (const f of [...(v.ready ?? []), ...(v.fire ?? []), ...Object.values(v.anims ?? {}).flatMap((a) => a?.frames ?? [])]) { if (f?.[0]) out.add(f[0]); if (f?.[2]) out.add(f[2]) }
  }
  return [...out].sort()
}

/** A frame as the client reads it: [picture, tics] or [picture, tics, flash]. */
const clean = (f) => (f?.[0] ? (f[2] ? [f[0], Math.max(1, Math.round(f[1] ?? 1)), f[2]] : [f[0], Math.max(1, Math.round(f[1] ?? 1))]) : null)

/**
 * The animation states a weapon's phases put the player in, with the phases
 * that do: [{ state, phases: [name] }] in order -- a phase's `anim`, and
 * every `set_anim` in its steps (docs/VIEWMODEL_PHASES.md). The first-person
 * view plays `anims[state]` while the player is in that state.
 */
export function weaponStates (module, name) {
  const by = new Map()
  const add = (state, phase) => { if (Number.isInteger(state) && state >= 0) { if (!by.has(state)) by.set(state, new Set()); by.get(state).add(phase) } }
  for (const [pn, ph] of Object.entries(module.weapons?.weapons?.[name]?.phases ?? {})) {
    add(ph.anim, pn)
    for (const st of ph.sequence ?? []) if (st?.action === 'set_anim') add(st.state, pn)
  }
  return [...by].sort((a, b) => a[0] - b[0]).map(([state, phases]) => ({ state, phases: [...phases] }))
}

/** A state's view loops unless told otherwise only when it is 0, as the client defaults. */
export const loopsByDefault = (state) => Number(state) === 0

/** assets/sprites/weapons.json, or null when no weapon has a view model. */
export function weaponsJson (module) {
  const weapons = {}
  for (const [name, v] of Object.entries(module.viewmodels?.weapons ?? {})) {
    const ready = (v.ready ?? []).map(clean).filter(Boolean)
    const fire = (v.fire ?? []).map(clean).filter(Boolean)
    // Per animation state (docs/VIEWMODEL_PHASES.md): a frame list, or
    // { frames, loop } when its looping is not the default.
    const anims = {}
    for (const [state, a] of Object.entries(v.anims ?? {})) {
      const frames = (a?.frames ?? []).map(clean).filter(Boolean)
      if (!frames.length || !/^(0|[1-9][0-9]*)$/.test(state)) continue
      anims[state] = a.loop === undefined || a.loop === loopsByDefault(state) ? frames : { frames, loop: !!a.loop }
    }
    const animsFrames = (st) => (Array.isArray(anims[st]) ? anims[st] : anims[st]?.frames)
    // An engine without per-phase views still gets ready and fire: from the
    // lists themselves, else from state 0 and the first other state.
    const r = ready.length ? ready : animsFrames('0') ?? fire.slice(0, 1)
    const f = fire.length ? fire : animsFrames(Object.keys(anims).find((k) => k !== '0')) ?? []
    if (r.length || f.length || Object.keys(anims).length) weapons[name] = { ready: r.length ? r : f.slice(0, 1), fire: f, ...(Object.keys(anims).length ? { anims } : {}) }
  }
  if (!Object.keys(weapons).length) return null
  return JSON.stringify({ _about: 'First-person weapon view models, written by the studio (docs/WEAPONS.md).', screen: SCREEN, weapons }, null, 1)
}

/**
 * assets/sprites/index.json: every single picture's size, and the offsets
 * of the pictures the view models use. `sizeOf(name)` -> [w, h] | null.
 * Null when the module has no pictures.
 */
export function spriteIndexJson (module, names, sizeOf) {
  const sizes = {}
  const offsets = {}
  for (const n of names) { const s = sizeOf(n); if (s) sizes[n] = s }
  for (const n of viewPictures(module)) if (sizes[n]) offsets[n] = offsetOf(module, n, sizes[n])
  if (!Object.keys(sizes).length) return null
  return JSON.stringify({ sizes, offsets }, null, 1)
}

/** A PNG's [width, height] from its header, or null. */
export function pngSize (bytes) {
  const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes)
  if (b.length < 24 || b[0] !== 0x89 || b[1] !== 0x50 || b[12] !== 0x49 || b[13] !== 0x48) return null
  const u32 = (i) => ((b[i] << 24) | (b[i + 1] << 16) | (b[i + 2] << 8) | b[i + 3]) >>> 0
  return [u32(16), u32(20)]
}

// --- a weapon drawn from a sprite sheet (a ThreeSprite project, baked) -----------------
//
// view.sheet = { name, ready: animation, fire: animation, scale, x, y }: the
// sheet's square canvas placed on the 320x200 screen with its top-left at
// (x, y), `scale` screen pixels to a canvas pixel. Each frame of the two
// animations (its front view) becomes a picture of its own when the module is
// written -- VM_<SHEET>_<ANIM>_<n> -- placed where it sits on that canvas, shown
// for 35 / fps tics; the view model draws it like any other picture.

/** The sheet's canvas size, for a placement (a ThreeSprite canvas is square). */
export const sheetCanvas = (json) => (typeof json?.canvas === 'number' ? json.canvas : json?.canvas?.w ?? 64)

/** Bottom centre for a sheet at `scale`: where a gun drawn on its canvas usually sits. */
export function sheetBottomCentre (canvasPx, scale = 1, screen = SCREEN) {
  const s = canvasPx * scale
  return { x: Math.round((screen[0] - s) / 2), y: Math.round(screen[1] - s) }
}

const slug = (s) => String(s).toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, 10) || 'A'

/**
 * The frames one animation of a sheet gives, front view: [{ name, rect, source, tics }].
 * `json` is the sheet's manifest (sprites/NAME.json).
 */
export function sheetFrames (json, sheet, anim) {
  const a = (json?.animations ?? []).find((x) => x.name === anim)
  if (!a) return []
  const tics = Math.max(1, Math.round(35 / (a.fps || 10)))
  return a.frames.map((fr, i) => {
    const key = fr.views?.['1'] ?? Object.values(fr.views ?? {})[0]
    const f = json.frames?.[key]
    return f ? { name: `VM_${slug(sheet)}_${slug(anim)}_${i}`, rect: f.rect, source: f.source, tics } : null
  }).filter(Boolean)
}

/**
 * Expand every weapon drawn from a sheet into frame lists of pictures, and the
 * pictures themselves: { module (a copy whose views are frame lists), pictures:
 * [{ name, sheet, rect, size, offset }] }. `manifest(sheet)` -> the sheet's json.
 */
export function expandSheetViews (module, manifest) {
  const weapons = {}
  const pictures = []
  for (const [name, v] of Object.entries(module.viewmodels?.weapons ?? {})) {
    if (!v.sheet?.name) { weapons[name] = v; continue }
    const json = manifest(v.sheet.name)
    if (!json) { weapons[name] = { ready: [], fire: [] }; continue }
    const scale = v.sheet.scale ?? 1
    const at = { x: v.sheet.x ?? sheetBottomCentre(sheetCanvas(json), scale).x, y: v.sheet.y ?? sheetBottomCentre(sheetCanvas(json), scale).y }
    const list = (anim) => sheetFrames(json, v.sheet.name, anim).map((f) => {
      if (!pictures.some((p) => p.name === f.name)) {
        pictures.push({
          name: f.name, sheet: v.sheet.name, rect: f.rect,
          size: [Math.max(1, Math.round(f.rect.w * scale)), Math.max(1, Math.round(f.rect.h * scale))],
          offset: offsetFor(at.x + f.source.x * scale, at.y + f.source.y * scale)
        })
      }
      return [f.name, f.tics]
    })
    const anims = {}
    for (const [state, a] of Object.entries(v.anims ?? {})) if (a?.sheetAnim) anims[state] = { frames: list(a.sheetAnim), loop: a.loop }
    weapons[name] = { ready: v.sheet.ready ? list(v.sheet.ready) : [], fire: v.sheet.fire ? list(v.sheet.fire) : [], anims }
  }
  return { module: { ...module, viewmodels: { ...module.viewmodels, weapons } }, pictures }
}
