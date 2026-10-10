//
// THE WEAPON IN FIRST PERSON (src/viewmodel_emit.js): what the studio writes
// as assets/sprites/weapons.json and sprites/index.json is placed by the
// client's own view-model code (render/viewmodel.js place, frameAt) exactly
// where the studio's form says -- the picture's top-left corner at (x, y) on
// the 320x200 screen at rest -- and its frames play for the tics the form says.
// CONTROL: a module with no view model writes neither file.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { weaponView, weaponsJson, spriteIndexJson, offsetFor, screenAt, bottomCentre, pngSize, expandSheetViews, REST_X, REST_Y } from '../src/viewmodel_emit.js'
import { frameAt, place, TIC } from '../../engine/client/src/render/viewmodel.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++ }

const m = {}
check(weaponsJson(m) === null && spriteIndexJson(m, [], () => null) === null, 'CONTROL: a module with no view model writes no weapons.json and no index')
const v = weaponView(m, 'blaster', { make: true })
v.ready.push(['BLSTA', 1])
v.fire.push(['BLSTB', 3, 'BLSTF'], ['BLSTC', 5])
m.pictureOffsets = { BLSTA: offsetFor(120, 140) }
const defs = JSON.parse(weaponsJson(m))
const sizes = { BLSTA: [80, 60], BLSTB: [80, 64], BLSTC: [80, 62], BLSTF: [30, 20], OTHER: [16, 16] }
const index = JSON.parse(spriteIndexJson(m, Object.keys(sizes), (n) => sizes[n]))
check(JSON.stringify(defs.weapons.blaster.fire) === JSON.stringify([['BLSTB', 3, 'BLSTF'], ['BLSTC', 5]]) && defs.screen[0] === 320, 'weapons.json carries the frames as the client reads them')
check(index.sizes.OTHER && index.offsets.BLSTA && index.offsets.BLSTF && !index.offsets.OTHER, 'the index sizes every picture and places the view model\'s')
// The client's placement, on a screen exactly 320 x 200: the corner lands where the form said.
const r = place({ width: 320, height: 200 }, index.sizes.BLSTA, index.offsets.BLSTA, REST_X, REST_Y, defs.screen)
check(r.left === 120 && r.top === 140 && r.width === 80, `the client draws BLSTA's corner at (120, 140), as set (${JSON.stringify(r)})`)
const c = bottomCentre(sizes.BLSTB); const rb = place({ width: 640, height: 400 }, sizes.BLSTB, index.offsets.BLSTB, REST_X, REST_Y, defs.screen)
check(rb.left === c.x * 2 && rb.top + rb.height === 400, `a picture not placed yet sits bottom centre, at any screen size (${JSON.stringify(rb)})`)
check(JSON.stringify(screenAt(offsetFor(33, 77))) === JSON.stringify({ x: 33, y: 77 }), 'the form\'s x, y and the offset go both ways')
check(frameAt(defs.weapons.blaster.fire, 2.5 * TIC)[0] === 'BLSTB' && frameAt(defs.weapons.blaster.fire, 4 * TIC)[0] === 'BLSTC' && frameAt(defs.weapons.blaster.fire, 9 * TIC) === null,
      'the shot plays for the tics set, then ends')
// DRAWN FROM A SHEET (a ThreeSprite project, baked): each frame of the two
// animations, front view, becomes a picture placed where it sits on the
// sheet's canvas -- scaled -- and shown for 35 / fps tics.
{
  const json = { canvas: { w: 64, h: 64 }, frames: { 'hold/0/v1': { rect: { x: 0, y: 0, w: 20, h: 30 }, source: { x: 22, y: 34, w: 20, h: 30 } }, 'shot/0/v1': { rect: { x: 20, y: 0, w: 24, h: 30 }, source: { x: 20, y: 34, w: 24, h: 30 } }, 'shot/1/v1': { rect: { x: 44, y: 0, w: 24, h: 30 }, source: { x: 20, y: 34, w: 24, h: 30 } } },
    animations: [{ name: 'hold', fps: 7, frames: [{ views: { 1: 'hold/0/v1' } }] }, { name: 'shot', fps: 12, frames: [{ views: { 1: 'shot/0/v1' } }, { views: { 1: 'shot/1/v1' } }] }] }
  const sm = { viewmodels: { weapons: { gun: { ready: [], fire: [], sheet: { name: 'GUN', ready: 'hold', fire: 'shot', scale: 2, x: 100, y: 72 } } } } }
  const ex = expandSheetViews(sm, () => json)
  const g = ex.module.viewmodels.weapons.gun
  check(g.ready.length === 1 && g.fire.length === 2 && g.ready[0][1] === 5 && g.fire[0][1] === 3, `a sheet's animations become frames, 35 / fps tics each (${JSON.stringify(g)})`)
  const p0 = ex.pictures.find((p) => p.name === g.ready[0][0])
  const r0 = place({ width: 320, height: 200 }, p0.size, p0.offset, REST_X, REST_Y, [320, 200])
  check(r0.left === 100 + 22 * 2 && r0.top === 72 + 34 * 2 && r0.width === 40, `each frame is drawn where it sits on the canvas, scaled (${JSON.stringify(r0)})`)
  check(ex.pictures.length === 3 && JSON.stringify(ex.pictures[1].rect) === JSON.stringify(json.frames['shot/0/v1'].rect), 'and is cut from the sheet at its own rectangle')
  const none = expandSheetViews({ viewmodels: { weapons: { gun: { sheet: { name: 'NOPE', ready: 'x' } } } } }, () => null)
  check(none.module.viewmodels.weapons.gun.ready.length === 0 && !none.pictures.length, 'CONTROL: a sheet the module does not have gives nothing to draw')
}
const png = readFileSync(join(HERE, '..', 'src', 'app', 'icon.png'))
check(JSON.stringify(pngSize(png)) === '[64,64]' && pngSize(new Uint8Array([1, 2, 3])) === null, 'a picture\'s size is read from its PNG header')

console.log(`\nviewmodel: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
