// AN IMPORTED SHEET'S ANIMATIONS, EDITED (the Sprites page).
//
// A finished sheet (an atlas export: NAME.json + NAME.png) keeps its pixels
// as they are; what can change is its manifest's `animations`: each one's
// name, fps, whether it loops, and its frames -- which, in which order, how
// many times. A frame is a set of views (`{ "1": key, "2": key, ... }`), each
// key a rectangle of the sheet in `frames`; keys are only ever looked up
// (client/src/render/atlas.js), so an animation renamed still finds them, and
// a new animation is made of frames the sheet already has.
//
// A sheet baked from a ThreeSprite project is not edited here: the next bake
// would overwrite it. Its animations are the project's (ThreeSprite).
//
// Pure: manifests in, manifests out, never the one given. The module's
// references to an animation by name -- a prop's states, a weapon's view --
// follow a rename (renameReferences).

const clone = (x) => JSON.parse(JSON.stringify(x))
const reindex = (frames) => frames.map((f, i) => ({ ...clone(f), index: i }))

/** A name an animation may have: what a props.txt `anim` token can carry. */
export const animNameOk = (n) => /^[A-Za-z0-9_][A-Za-z0-9_.-]{0,47}$/.test(String(n ?? ''))

/**
 * Every distinct frame of the sheet, to build animations from: [{ id, views,
 * from }] -- `from` names where it was first seen ("walk #3"). Two frames are
 * the same when they show the same rectangles.
 */
export function framePalette (manifest) {
  const seen = new Map()
  for (const a of manifest.animations ?? []) {
    a.frames.forEach((f, i) => {
      const id = JSON.stringify(Object.entries(f.views ?? {}).sort(([x], [y]) => Number(x) - Number(y)))
      if (!seen.has(id)) seen.set(id, { id, views: clone(f.views), from: `${a.name} #${i + 1}` })
    })
  }
  return [...seen.values()]
}

function find (m, name) {
  const a = (m.animations ?? []).find((x) => x.name === name)
  if (!a) throw new Error(`no animation called ${name}`)
  return a
}

/** Rename an animation; refused if the new name is taken or not a name. */
export function renameAnim (manifest, from, to) {
  if (!animNameOk(to)) throw new Error(`"${to}" is not a name an animation can have (letters, digits, _ . -)`)
  if (from === to) return clone(manifest)
  if ((manifest.animations ?? []).some((a) => a.name === to)) throw new Error(`there is already an animation called ${to}`)
  const m = clone(manifest)
  find(m, from).name = to
  return m
}

/** Its fps (1..120) and whether it loops. */
export function setAnim (manifest, name, { fps, loop } = {}) {
  const m = clone(manifest)
  const a = find(m, name)
  if (fps !== undefined) {
    const v = Math.round(Number(fps))
    if (!(v >= 1 && v <= 120)) throw new Error('fps is 1 to 120')
    a.fps = v
  }
  if (loop !== undefined) a.loop = !!loop
  return m
}

/** Its frames: [{ views }], at least one; they are numbered again from 0. */
export function setFrames (manifest, name, frames) {
  if (!Array.isArray(frames) || !frames.length) throw new Error('an animation needs at least one frame')
  const m = clone(manifest)
  find(m, name).frames = reindex(frames)
  return m
}

/** A new animation, of frames the sheet already has. */
export function addAnim (manifest, name, frames, { fps = 10, loop = true } = {}) {
  if (!animNameOk(name)) throw new Error(`"${name}" is not a name an animation can have (letters, digits, _ . -)`)
  if ((manifest.animations ?? []).some((a) => a.name === name)) throw new Error(`there is already an animation called ${name}`)
  if (!Array.isArray(frames) || !frames.length) throw new Error('an animation needs at least one frame')
  const m = clone(manifest)
  m.animations.push({ name, fps: Math.max(1, Math.min(120, Math.round(fps))), loop: !!loop, frames: reindex(frames) })
  return m
}

/** Remove one; a sheet keeps at least one animation (the client refuses a sheet with none). */
export function removeAnim (manifest, name) {
  if ((manifest.animations ?? []).length <= 1) throw new Error('a sheet needs at least one animation')
  const m = clone(manifest)
  find(m, name)
  m.animations = m.animations.filter((a) => a.name !== name)
  return m
}

/**
 * The module's references to `sheet`'s animation `from`, renamed to `to`:
 * every prop drawn with the sheet (its states), and every weapon view drawn
 * from it (at rest, firing, each state's). Changes `module` in place; returns
 * how many references moved.
 */
export function renameReferences (module, sheet, from, to) {
  let n = 0
  for (const p of module.props ?? []) {
    if (p.art?.kind !== 'atlas' || p.art.sheet !== sheet) continue
    for (const k of Object.keys(p.art.states ?? {})) if (p.art.states[k] === from) { p.art.states[k] = to; n++ }
  }
  for (const v of Object.values(module.viewmodels?.weapons ?? {})) {
    if (v?.sheet?.name !== sheet) continue
    for (const k of ['ready', 'fire']) if (v.sheet[k] === from) { v.sheet[k] = to; n++ }
    for (const a of Object.values(v.anims ?? {})) if (a?.sheetAnim === from) { a.sheetAnim = to; n++ }
  }
  return n
}

/** Where an animation is used by name: what removing it would leave pointing at nothing. */
export function referencesTo (module, sheet, name) {
  const out = []
  for (const p of module.props ?? []) {
    if (p.art?.kind === 'atlas' && p.art.sheet === sheet) for (const [k, v] of Object.entries(p.art.states ?? {})) if (v === name) out.push(`${p.name} state ${k}`)
  }
  for (const [w, v] of Object.entries(module.viewmodels?.weapons ?? {})) {
    if (v?.sheet?.name !== sheet) continue
    for (const k of ['ready', 'fire']) if (v.sheet[k] === name) out.push(`weapon ${w} (${k === 'ready' ? 'at rest' : 'firing'})`)
    for (const [st, a] of Object.entries(v.anims ?? {})) if (a?.sheetAnim === name) out.push(`weapon ${w} state ${st}`)
  }
  return out
}

/**
 * THE MODULE'S WORD ON LOOPING, over a sheet baked from a ThreeSprite project:
 * `loops` is { animation: true | false } (module.sprites[NAME].loops), kept by
 * the studio because every bake writes the manifest afresh and ThreeSprite's
 * own flag is often left at its default. Applied to each bake (bake/apply.js);
 * an animation not named keeps the project's.
 */
export function applyLoops (manifest, loops) {
  if (!loops || !Object.keys(loops).length) return manifest
  const m = clone(manifest)
  for (const a of m.animations ?? []) if (typeof loops[a.name] === 'boolean') a.loop = loops[a.name]
  return m
}
