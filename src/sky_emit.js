//
// THE SKY: what the module and each map are drawn under (docs/SKY.md).
//
//   module.sky = { kind, images, repeat?, yaw?, height? }   the module's (`sky default`)
//   doc.sky    = { kind, ... } | undefined                  a map's own (`sky <map>`)
//
// `kind` is strip (DOOM's: one picture round the horizon), panorama (one
// equirectangular picture of the whole sphere), cube (six: east west north
// south up down -- the game's +x -x +y -y +z -z) or none. `yaw` is in TURNS,
// as module.txt has it (the graph node takes degrees); `repeat` and `height`
// are a strip's. Pictures are texture names, served from /textures/.
//
// Written as module.txt `sky` lines in the server's own words
// (engine/server/src/sky.hpp parse_sky), and turned into the client's SKY_SET
// shape for the studio's previews, so both read the same sky.
//
// Pure: the Sky section, Map settings, module_emit.js and the tests use it.
//

export const KINDS = ['strip', 'panorama', 'cube', 'none']
export const PICTURES = { strip: 1, panorama: 1, cube: 6, none: 0 }
export const CUBE_FACES = ['east', 'west', 'north', 'south', 'up', 'down']
// The client's numbers (engine/client/src/render/sky.js SKY_KIND, SKY_FIELD).
const KIND_ID = { none: 0, strip: 1, panorama: 2, cube: 3 }
const FIELD_ID = { repeat: 1, yaw: 2, height: 3 }
export const DOOM_STRIP = { repeat: 4, height: 0.625 }
// The server's rule for a picture's name (sky.hpp sky_image_ok).
export const IMAGE_RE = /^(?!.*\.\.)[A-Za-z0-9_\-./]{1,64}$/

export function newSky (kind = 'strip') { return { kind, images: [] } }

/** The words a module.txt `sky` line (and dnp.sky) takes: "strip SKY1 repeat 4 yaw 0.25". */
export function skyWords (sky) {
  if (!sky || sky.kind === 'none') return 'none'
  const n = PICTURES[sky.kind] ?? 0
  const w = [sky.kind, ...(sky.images ?? []).slice(0, n)]
  const num = (v) => String(Number(Number(v).toFixed(4)))
  if (sky.kind === 'strip' && sky.repeat !== undefined && sky.repeat !== DOOM_STRIP.repeat) w.push('repeat', num(sky.repeat))
  if (sky.kind === 'strip' && sky.height !== undefined && sky.height !== DOOM_STRIP.height) w.push('height', num(sky.height))
  if (sky.yaw) w.push('yaw', num(sky.yaw))
  return w.join(' ')
}

/** The module.txt lines: the module's (`default`), then each map's own, by name. */
export function skyLines (module, docs = []) {
  const out = []
  if (module?.sky) out.push(`sky default ${skyWords(module.sky)}`)
  for (const d of docs) if (d.sky) out.push(`sky ${d.name} ${skyWords(d.sky)}`)
  return out
}

/** The sky a map is drawn under: its own, else the module's, else none. */
export const skyFor = (module, doc) => doc?.sky ?? module?.sky ?? null

/** The sky as the client's SKY_SET message (render/sky.js skyFromMessage takes it). */
export function skyMessage (sky) {
  if (!sky || sky.kind === 'none') return { kind: 0, images: [], fields: [] }
  const fields = []
  for (const k of ['repeat', 'yaw', 'height']) if (sky[k] !== undefined) fields.push({ id: FIELD_ID[k], milli: Math.round(sky[k] * 1000) })
  return { kind: KIND_ID[sky.kind] ?? 0, images: (sky.images ?? []).slice(0, PICTURES[sky.kind] ?? 0), fields }
}

/**
 * What the server would refuse, or the game would draw plain: pictures
 * missing, too few, a name the server does not take, a setting out of range.
 * @param textures  the texture names there are (the module's and the served)
 */
export function skyProblems (sky, textures = null, where = 'the sky') {
  const out = []
  if (!sky) return out
  if (!KINDS.includes(sky.kind)) { out.push(`${where}: no sky kind '${sky.kind}'`); return out }
  const n = PICTURES[sky.kind]
  const imgs = (sky.images ?? []).slice(0, n)
  if (imgs.filter(Boolean).length < n) out.push(`${where}: a ${sky.kind} sky needs ${n} picture${n > 1 ? 's' : ''}${sky.kind === 'cube' ? ` (${CUBE_FACES.join(', ')})` : ''}`)
  for (const name of imgs.filter(Boolean)) {
    if (!IMAGE_RE.test(name)) out.push(`${where}: '${name}' is not a picture name the server takes`)
    else if (textures && !textures.includes(name)) out.push(`${where}: no texture called ${name} (import its PNG in Textures)`)
  }
  if (sky.kind === 'strip' && sky.repeat !== undefined && !(sky.repeat > 0)) out.push(`${where}: repeat must be above 0`)
  if (sky.kind === 'strip' && sky.height !== undefined && !(sky.height > 0)) out.push(`${where}: height must be above 0`)
  return out
}
