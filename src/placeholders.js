//
// PLACEHOLDERS: pictures the studio paints for things that have none yet, so
// what a recipe makes is seen in the game at once and can be replaced later.
//
//   a missile   a prop of its own name, small and walk-through, drawn as a
//               glowing dot (the server will not fire a missile whose prop is
//               not in the catalogue, and an unseen shot is a shot nobody dodges)
//   a weapon    a gun held at the bottom of the screen, and the same gun with
//               a muzzle flash, as its first-person pictures (viewmodel_emit.js)
//
// The pixels are made here, the same every time (no randomness, no canvas),
// and stored as the module's own pictures (assets/sprites/NAME.png), which the
// author can draw over or swap like any other.
//
import { encodePng } from './bake/png.js'
import { artFromPicture } from './props.js'
import { nextPropId } from './props_emit.js'
import { viewmodelsOf } from './viewmodel_emit.js'

const clamp = (v) => Math.max(0, Math.min(255, Math.round(v)))

/** A picture being painted: straight RGBA, drawn over with `over`. */
function canvas (w, h) { return { w, h, px: new Uint8Array(w * h * 4) } }
function over (c, x, y, [r, g, b], a) {
  if (x < 0 || y < 0 || x >= c.w || y >= c.h || a <= 0) return
  const i = (y * c.w + x) * 4
  const da = c.px[i + 3] / 255
  const oa = a + da * (1 - a)
  if (oa <= 0) return
  for (const [k, v] of [[0, r], [1, g], [2, b]]) c.px[i + k] = clamp((v * a + c.px[i + k] * da * (1 - a)) / oa)
  c.px[i + 3] = clamp(oa * 255)
}
function rect (c, x0, y0, w, h, rgb, a = 1) { for (let y = y0; y < y0 + h; y++) for (let x = x0; x < x0 + w; x++) over(c, x, y, rgb, a) }
/** A soft round glow: full at the middle, gone at radius `r`. */
function glow (c, cx, cy, r, rgb, power = 1.6) {
  for (let y = Math.floor(cy - r); y <= cy + r; y++) {
    for (let x = Math.floor(cx - r); x <= cx + r; x++) {
      const d = Math.hypot(x + 0.5 - cx, y + 0.5 - cy) / r
      if (d < 1) over(c, x, y, rgb, Math.pow(1 - d, power))
    }
  }
}
const png = (c) => encodePng(c.w, c.h, c.px)

/** A glowing dot: a white-hot middle in `rgb`. */
export function orbPng (rgb = [255, 170, 60], size = 24) {
  const c = canvas(size, size)
  const m = size / 2
  glow(c, m, m, m, rgb, 1.4)
  glow(c, m, m, m * 0.45, [255, 245, 220], 1.2)
  return png(c)
}

/**
 * A gun seen from behind, at the bottom of a 320x200 screen: [rest, firing].
 * The firing one is the same gun under a muzzle flash.
 */
export const GUN_SIZE = [72, 80]
export function gunPngs () {
  const [w, h] = GUN_SIZE
  const paint = (flash) => {
    const c = canvas(w, h)
    // firing: a flash that fills the top, and the gun kicked down a little --
    // a flash of a few pixels was missed, and nobody could tell it had fired
    const cx = w / 2
    const k = flash ? 4 : 0
    const dark = [44, 46, 54], mid = [78, 82, 94], light = [128, 134, 150]
    if (flash) { glow(c, cx, 12, 22, [255, 170, 50], 1.1); glow(c, cx, 12, 13, [255, 220, 120], 1.0); glow(c, cx, 12, 6, [255, 252, 235], 0.9) }
    // the barrel and slide, narrowing upward; a front sight on top
    rect(c, cx - 6, 18 + k, 12, 30, dark)
    rect(c, cx - 5, 18 + k, 10, 30, mid)
    rect(c, cx - 2, 18 + k, 3, 30, light)
    rect(c, cx - 1, 15 + k, 2, 3, light)
    // the frame, wider, and the hand around the grip
    rect(c, cx - 11, 46 + k, 22, 12, dark)
    rect(c, cx - 10, 46 + k, 20, 11, mid)
    rect(c, cx - 14, 56 + k, 28, 24, [150, 104, 78])
    rect(c, cx - 12, 56 + k, 24, 4, [176, 128, 98])
    rect(c, cx - 3, 50 + k, 6, 4, light)
    return png(c)
  }
  return [paint(false), paint(true)]
}

/** A blade held up at the bottom of the screen: [rest, mid-slash] -- the slash tilted, with a streak. */
export function bladePngs () {
  const [w, h] = GUN_SIZE
  const paint = (slash) => {
    const c = canvas(w, h)
    const cx = w / 2
    const steel = [196, 204, 218], edge = [236, 240, 248], dark = [88, 92, 104]
    for (let y = 4; y < 58; y++) {
      const lean = slash ? Math.round((58 - y) * 0.45) : 0       // the slash leans the blade over
      const half = y < 10 ? Math.max(1, (y - 4) * 0.6) : 3
      for (let x = -half; x <= half; x++) over(c, Math.round(cx + x + lean), y, x === -Math.round(half) ? dark : x >= 1 ? edge : steel, 1)
    }
    if (slash) for (let i = 0; i < 26; i++) glow(c, cx + 6 + i * 1.2, 30 - i * 0.6, 3, [200, 220, 255], 2)
    rect(c, cx - 12, 58, 24, 4, [120, 96, 60])                   // the guard
    rect(c, cx - 4, 62, 8, 18, [150, 104, 78])                   // the grip, in the hand
    rect(c, cx - 10, 66, 20, 14, [150, 104, 78])
    return png(c)
  }
  return [paint(false), paint(true)]
}

/** A picture name of the module's that is free: base, base_2, … (A-Z, 0-9, _). */
function freePicture (S, base) {
  const name = String(base).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 20) || 'PIC'
  const taken = (n) => !!S.rec.assets?.[`sprites/${n}.png`] || !!S.module.sprites?.[n]
  if (!taken(name)) return name
  for (let i = 2; ; i++) if (!taken(`${name}_${i}`)) return `${name}_${i}`
}

/** Keep bytes as a picture of the module's, ready to draw. */
function addPicture (S, name, bytes) {
  const blob = new Blob([bytes], { type: 'image/png' })
  S.rec.assets ??= {}
  S.rec.assets[`sprites/${name}.png`] = blob
  if (S.spriteUrls?.has(name)) URL.revokeObjectURL(S.spriteUrls.get(name))
  S.spriteUrls?.set(name, URL.createObjectURL(blob))
  S.sprites?.forgetAll?.()
}

/**
 * Give a missile something to be drawn as, when nothing in the catalogue has
 * the name it is drawn as: a prop of that name, a glowing dot. The prop's
 * name, or null when it had one already.
 */
export function giveMissileLook (S, name, rgb) {
  const m = S.module.mobs?.missiles?.[name]
  if (!m) return null
  const prop = m.prop ?? name
  if ((S.propNames?.() ?? (S.module.props ?? []).map((p) => p.name)).includes(prop)) return null
  const pic = freePicture(S, prop)
  addPicture(S, pic, orbPng(rgb))
  S.module.props ??= []
  S.module.props.push({ id: nextPropId(S.module), name: prop, radius: 0.15, height: 0.35, solid: false, usable: false, art: artFromPicture(pic, 0.35) })
  return prop
}

/**
 * Give a weapon first-person pictures, when it has none: the placeholder gun
 * at rest, and firing for a moment. True when it was given them.
 */
export function giveWeaponLook (S, name, { blade = false } = {}) {
  const vm = viewmodelsOf(S.module)
  const have = vm.weapons[name]
  if (have && ((have.ready ?? []).length || (have.fire ?? []).length || Object.keys(have.anims ?? {}).length)) return false
  const [rest, fire] = blade ? bladePngs() : gunPngs()
  const a = freePicture(S, `${name}_${blade ? 'blade' : 'gun'}`)
  addPicture(S, a, rest)
  const f = freePicture(S, `${name}_${blade ? 'bladef' : 'gunf'}`)
  addPicture(S, f, fire)
  // the flash held long enough to be seen
  vm.weapons[name] = { ready: [[a, 4]], fire: [[f, 7], [a, 6]] }
  return true
}
