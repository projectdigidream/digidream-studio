//
// Bakers (docs/PLUGINS.md, Bakers): sources in, what the game loads out, the
// same bytes every time. The PNG codec they share, the texture baker's
// compositing, the sprite baker against the studio's own import, and the
// cache that keys a bake by its source.
//
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { encodePng, decodePng, dataUrlBytes } from '../src/bake/png.js'
import * as texproj from '../src/bake/texproj.js'
import * as tsprite from '../src/bake/tsprite.js'
import { Baker, BUILTIN_BAKERS, sha256 } from '../src/bake/run.js'
import { importSheetFile } from '../src/sheets.js'
import { sourcesIn, SOURCES } from '../src/plugins/kinds.js'

const HERE = dirname(fileURLToPath(import.meta.url))
const REPO = join(HERE, '..', '..')
let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}
const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])
const dataUrl = (bytes) => `data:image/png;base64,${Buffer.from(bytes).toString('base64')}`

// --- the PNG codec ----------------------------------------------------------------------
{
  const w = 5, h = 3
  const rgba = new Uint8Array(w * h * 4).map((_, i) => (i * 37) & 255)
  const png = encodePng(w, h, rgba)
  const back = decodePng(png)
  check(back.w === w && back.h === h && same(back.rgba, rgba), 'what is encoded decodes to the same pixels')
  check(same(encodePng(w, h, rgba), png), 'and encodes to the same bytes every time')
  // Real files, as other programs wrote them.
  const idx = JSON.parse(readFileSync(join(REPO, 'modules', 'starter', 'assets', 'textures', 'index.json'), 'utf8'))
  for (const [name, [tw, th]] of Object.entries(idx.sizes)) {
    const img = decodePng(new Uint8Array(readFileSync(join(REPO, 'modules', 'starter', 'assets', 'textures', `${name}.png`))))
    check(img.w === tw && img.h === th && img.rgba.length === tw * th * 4, `${name}.png decodes at its listed size (${img.w}×${img.h})`)
  }
  let refused = ''
  try { decodePng(new Uint8Array([1, 2, 3])) } catch (e) { refused = e.message }
  check(refused === 'not a PNG', 'what is not a PNG is said to be one')
  check(same(dataUrlBytes(dataUrl(png)), png), 'a data URL gives back its bytes')
}

// --- the texture baker ------------------------------------------------------------------
{
  const w = 2, h = 1
  const red = encodePng(w, h, new Uint8Array([255, 0, 0, 255, 255, 0, 0, 128]))
  const blue = encodePng(w, h, new Uint8Array([0, 0, 255, 255, 0, 0, 0, 0]))
  const project = (layers, extra = {}) => new TextEncoder().encode(JSON.stringify({ w, h, active: 0, palette: [], ramps: [], settings: {}, layers, ...extra }))

  let r = await texproj.bake({ key: 'ONE', bytes: project([{ name: 'a', visible: true, opacity: 1, cels: [dataUrl(red)] }]) })
  let img = decodePng(r.files['textures/ONE.png'])
  check(same(img.rgba, [255, 0, 0, 255, 255, 0, 0, 128]) && r.meta.w === 2 && r.meta.h === 1 && !r.meta.sheet, 'one layer at full opacity is copied exactly, half-transparent pixels too')

  r = await texproj.bake({ key: 'TWO', bytes: project([{ visible: true, opacity: 1, cels: [dataUrl(red)] }, { visible: true, opacity: 0.5, cels: [dataUrl(blue)] }]) })
  img = decodePng(r.files['textures/TWO.png'])
  check(same(img.rgba.slice(0, 4), [128, 0, 128, 255]), `a half-opaque layer over an opaque one mixes half and half (${[...img.rgba.slice(0, 4)]})`)
  check(same(img.rgba.slice(4, 8), [255, 0, 0, 128]), 'a transparent pixel above leaves the one below as it was')

  r = await texproj.bake({ key: 'HID', bytes: project([{ visible: true, opacity: 1, cels: [dataUrl(red)] }, { visible: false, opacity: 1, cels: [dataUrl(blue)] }]) })
  check(same(decodePng(r.files['textures/HID.png']).rgba, [255, 0, 0, 255, 255, 0, 0, 128]), 'a hidden layer is left out')

  r = await texproj.bake({ key: 'ANIM', bytes: project([{ visible: true, opacity: 1, cels: [dataUrl(red), dataUrl(blue), dataUrl(red)] }], { fps: 12 }) })
  img = decodePng(r.files['textures/ANIM.png'])
  check(img.w === 2 && img.h === 3 && r.meta.h === 3 && JSON.stringify(r.meta.sheet) === '{"layout":"vertical","frames":3,"fps":12}', 'frames are stacked top to bottom into an animated sheet, at the project\'s speed')
  check(same(img.rgba.slice(8, 12), [0, 0, 255, 255]), 'the second frame is the second row')

  let refused = ''
  try { await texproj.bake({ key: 'BAD', bytes: project([{ visible: true, opacity: 1, cels: [dataUrl(encodePng(3, 3, new Uint8Array(36)))] }]) }) } catch (e) { refused = e.message }
  check(/3×3 layer in a 2×1 project/.test(refused), 'a layer of the wrong size is refused, saying so')
}

// --- the sprite baker, against the studio's own import -----------------------------------
{
  const bytes = new Uint8Array(readFileSync(join(HERE, 'fixtures', 'spirit.tsprite')))
  const r = await tsprite.bake({ key: 'GHOST', bytes })
  const imp = await importSheetFile({ name: 'spirit.tsprite', bytes }, { parseAtlas: () => {} })
  check(same(r.files['sprites/GHOST.png'], imp.png), 'the sprite baker makes the same sheet as importing the project')
  const m = JSON.parse(new TextDecoder().decode(r.files['sprites/GHOST.json']))
  check(m.sprite === 'GHOST' && m.image === 'GHOST.png' && m.animations.length === imp.manifest.animations.length, 'and names it as the module does, not as the project did')
}

// --- the runner and its cache -------------------------------------------------------------
{
  const mem = new Map()
  const cache = { get: async (k) => mem.get(k) ?? null, put: async (k, v) => { mem.set(k, v) } }
  const baker = new Baker({ bakersFor: (k) => BUILTIN_BAKERS.filter((b) => b.kinds.includes(k)), cache })
  const bytes = new Uint8Array(readFileSync(join(HERE, 'fixtures', 'spirit.tsprite')))
  const a = await baker.bake('file:tsprite', 'GHOST', bytes)
  const b = await baker.bake('file:tsprite', 'GHOST', bytes)
  check(a.ok && !a.cached && b.ok && b.cached && same(a.files['sprites/GHOST.png'], b.files['sprites/GHOST.png']), 'the second bake of the same source comes from the cache')
  const c = await baker.bake('file:tsprite', 'OTHER', bytes)
  check(!c.cached && c.files['sprites/OTHER.json'], 'the same source under another name is baked for that name')
  check(a.hash === await sha256(bytes) && a.baker === 'tsprite' && a.version === '1', 'a bake says which bytes, which baker, which version')
  const none = await baker.bake('file:psd', 'X', bytes)
  check(!none.ok && /nothing here bakes/.test(none.error), 'a kind with no baker says so')
  const lying = new Baker({ bakersFor: () => [{ id: 'texproj', version: '9', url: BUILTIN_BAKERS[0].url }] })
  const good = new TextEncoder().encode(JSON.stringify({ w: 1, h: 1, layers: [{ visible: true, opacity: 1, cels: [dataUrl(encodePng(1, 1, new Uint8Array([1, 2, 3, 255])))] }] }))
  const l = await lying.bake('file:texture', 'X', good)
  check(!l.ok && /version/.test(l.error), `a baker whose module is another version than the plugin says is not trusted (${l.error})`)
}

// --- the DAW plugin's music baker, in node --------------------------------------------------
{
  const daw = join(HERE, '..', 'plugins', 'daw', 'bake.js')
  const song = join(REPO, 'midisynth', 'content', 'music', 'dreamy_dnb.msproj')
  const { existsSync } = await import('node:fs')
  if (existsSync(join(HERE, '..', 'plugins', 'daw', 'app', 'tool', 'dist', 'midisynth.mjs')) && existsSync(song)) {
    const m = await import(daw)
    const bytes = new Uint8Array(readFileSync(song))
    const a = await m.bake({ key: 'dreamy', bytes })
    const b = await m.bake({ key: 'dreamy', bytes })
    const out = a.files['music/dreamy.mstk']
    check(String.fromCharCode(...out.slice(0, 4)) === 'MSTK' && same(out, b.files['music/dreamy.mstk']), `a DAW project bakes to a track, the same bytes every time (${out.length} bytes)`)
  } else console.log('  (the DAW plugin is not vendored here: its baker is not checked)')
}

// --- where sources live -------------------------------------------------------------------
check(JSON.stringify(sourcesIn({ 'sources/sprites/A.tsprite': 1, 'sources/textures/W.texproj.json': 1, 'sources/music/T.msproj': 1, 'sources/sounds/x.sfxproj': 1, 'textures/W.png': 1 }).map((s) => s.kind)) === '["file:tsprite","file:texture","file:msproj"]',
  'the baked sources in a record are found by path; a sound pack is not one')
check(SOURCES['file:texture'].path('ROCK') === 'sources/textures/ROCK.texproj.json', 'a texture\'s project lives under sources/textures')

console.log(`bake.sources: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
