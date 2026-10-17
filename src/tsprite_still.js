//
// A THREESPRITE PROJECT WITH NO ANIMATIONS YET is a picture, and drawn as one.
//
// ThreeSprite's runtime composes a sheet from a project's animations and
// refuses one that has none ("this sprite has no animations") -- which is
// every sprite as it is first drawn. A monster given a sprite of its own was
// then drawn nowhere: its Looks preview stayed black and the game had no sheet
// for it. Composed here as one still "idle" picture of the drawing as it
// stands (a held first frame, every view), until it has animations of its own.
//
// No DOM: the baker runs it in a Worker and the tests in Node.
//
import { unzipSync, zipSync } from '../vendor/fflate.js'

export const STILL = 'idle'

/** The project with one still animation, when it has none; null when it has some or cannot be read. */
export function stillOf (bytes) {
  let files
  try { files = unzipSync(bytes) } catch { return null }
  const json = files['project.json']
  if (!json) return null
  let p
  try { p = JSON.parse(new TextDecoder().decode(json)) } catch { return null }
  if (!p || typeof p !== 'object' || (p.animationOrder ?? []).length) return null
  const id = 'studio_still'
  p.animations = { ...(p.animations ?? {}), [id]: { id, name: STILL, fps: 0, loop: true, frameCount: 1, boneTracks: {}, partTracks: {} } }
  p.animationOrder = [id]
  files['project.json'] = new TextEncoder().encode(JSON.stringify(p))
  const out = {}
  for (const [k, v] of Object.entries(files)) out[k] = k.endsWith('.png') ? [v, { level: 0 }] : v
  return zipSync(out, { level: 6 })
}

/** loadTsprite, with a project that has no animations yet composed as one still picture: { r, still }. */
export function composeTsprite (loadTsprite, bytes) {
  try {
    return { r: loadTsprite(bytes), still: false }
  } catch (e) {
    if (!/no animations/.test(String(e?.message ?? e))) throw e
    const s = stillOf(bytes)
    if (!s) throw e
    return { r: loadTsprite(s), still: true }
  }
}
