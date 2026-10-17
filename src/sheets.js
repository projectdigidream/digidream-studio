//
// Sprite sheets for a module's monsters and props: importing them.
//
// Two things can be imported, and they end up as the same two files:
//
//   a ThreeSprite PROJECT (.tsprite)  -> composed here, by ThreeSprite's own
//                                        runtime (studio/vendor/tsprite.js):
//                                        the manifest and the packed sheet
//   an ATLAS export (.json + .png)    -> taken as they are, the manifest
//                                        checked by the client's own parser
//
// Either way the module gets assets/sprites/NAME.json and NAME.png, which is
// what an `atlas NAME` line in props.txt names and what the client draws
// (client/src/render/atlas.js). NAME is the sheet's own sprite name, made
// safe for a catalogue token -- unless it is ThreeSprite's untouched default,
// SPRT, which every new sprite starts with: then the file's name. A project
// the studio keeps or hands out carries its sheet's name (nameTsprite), so a
// sprite taken out and brought in again comes back as itself.
//
// No DOM here and no client imports, so the test can run it in Node: the
// manifest check is passed in (the client's parseAtlas), as is the picker for
// the second file.
//
import { loadTsprite } from '../vendor/tsprite.js'
import { unzipSync, zipSync } from '../vendor/fflate.js'
import { composeTsprite } from './tsprite_still.js'

export const sheetName = (s) => String(s).toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)

/** ThreeSprite's sprite id for a project nobody named (createProject's default). */
export const DEFAULT_SPRITE = 'SPRT'

/**
 * A .tsprite whose project has `name` as its sprite id (the stem ThreeSprite
 * exports under). The same bytes when it already has; null when the bytes are
 * not a project this can read (the caller keeps them as they are).
 */
export function nameTsprite (bytes, name) {
  let files
  try { files = unzipSync(bytes) } catch { return null }
  const json = files['project.json']
  if (!json) return null
  let p
  try { p = JSON.parse(new TextDecoder().decode(json)) } catch { return null }
  if (!p || typeof p !== 'object' || p.spriteName === name) return p && typeof p === 'object' ? bytes : null
  p.spriteName = name
  files['project.json'] = new TextEncoder().encode(JSON.stringify(p, null, 2))
  // Pictures are PNGs already: stored, not squeezed again.
  const out = {}
  for (const [k, v] of Object.entries(files)) out[k] = k.endsWith('.png') ? [v, { level: 0 }] : v
  return zipSync(out, { level: 6 })
}

/**
 * @param file        { name, bytes } as the shell's picker returns it
 * @param parseAtlas  the client's parser; throws on a bad manifest
 * @param pickPng     async (imageName) => { name, bytes } | null, asked for
 *                    when a manifest arrives without its picture
 * @returns { name, manifest, png, warnings }
 */
export async function importSheetFile (file, { parseAtlas, pickPng }) {
  if (/\.tsprite$/i.test(file.name)) {
    const { r } = composeTsprite(loadTsprite, file.bytes)
    const manifest = JSON.parse(JSON.stringify(r.sheet.manifest))
    const own = manifest.sprite && manifest.sprite !== DEFAULT_SPRITE ? manifest.sprite : ''
    const name = sheetName(own || file.name.replace(/\.tsprite$/i, '')) || sheetName(manifest.sprite ?? '')
    if (!name) throw new Error('the project has no usable sprite name')
    manifest.sprite = name
    manifest.image = `${name}.png`
    parseAtlas(manifest, name)
    return { name, manifest, png: r.png, warnings: r.warnings ?? [] }
  }
  if (/\.json$/i.test(file.name)) {
    let manifest
    try { manifest = JSON.parse(new TextDecoder().decode(file.bytes)) } catch (e) { throw new Error(`${file.name}: not JSON (${e.message})`) }
    parseAtlas(manifest, file.name)
    const name = sheetName(manifest.sprite || file.name.replace(/\.json$/i, ''))
    if (!name) throw new Error('the manifest has no usable sprite name')
    const png = await pickPng(manifest.image)
    if (!png) throw new Error(`${name}: needs its sheet, ${manifest.image}`)
    if (png.bytes.length < 8 || png.bytes[0] !== 0x89 || png.bytes[1] !== 0x50) throw new Error(`${png.name}: not a PNG`)
    manifest.sprite = name
    manifest.image = `${name}.png`
    return { name, manifest, png: png.bytes, warnings: [] }
  }
  throw new Error('pick a .tsprite project, or an atlas .json and then its .png')
}

/** What the module document keeps about a sheet (the files hold the rest). */
export function sheetRecord (manifest) {
  return {
    image: manifest.image,
    worldHeight: manifest.worldHeight,
    animations: (manifest.animations ?? []).map((a) => a.name)
  }
}

/** A body's five states, matched to a sheet's animations by name where the names allow. */
export function guessStates (animations) {
  const find = (...wants) => animations.find((a) => wants.some((w) => a.toLowerCase().includes(w))) ?? animations[0] ?? ''
  return { 0: find('idle', 'stand'), 1: find('walk', 'run', 'move'), 2: find('attack', 'fire', 'melee'), 3: find('pain', 'hurt', 'idle'), 4: find('death', 'die') }
}
