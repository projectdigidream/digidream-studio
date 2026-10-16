//
// A .tsprite imported into the studio becomes the atlas the game draws.
//
// ORACLES: the client's own manifest parser (client/src/render/atlas.js),
// which refuses anything the game could not draw, and tools/tsprite/read.js's
// project-versus-atlas comparison, which is the repository's existing check
// that an atlas says what its project says. The composition itself is
// ThreeSprite's runtime (studio/vendor/tsprite.js), not a copy of it.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { importSheetFile, sheetRecord, guessStates, sheetName, nameTsprite, DEFAULT_SPRITE } from '../src/sheets.js'
import { inspectTsprite } from '../vendor/tsprite.js'
import { parseAtlas } from '../../engine/client/src/render/atlas.js'
import { readProject, compare } from '../../engine/tools/tsprite/read.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const bytes = new Uint8Array(readFileSync(join(ROOT, 'studio', 'test', 'fixtures', 'spirit.tsprite')))
const pngSize = (b) => ({ w: (b[16] << 24 | b[17] << 16 | b[18] << 8 | b[19]) >>> 0, h: (b[20] << 24 | b[21] << 16 | b[22] << 8 | b[23]) >>> 0 })

// --- a project, composed ----------------------------------------------------------
const r = await importSheetFile({ name: 'spirit.tsprite', bytes }, { parseAtlas, pickPng: async () => null })
check(r.name === 'SPIR', `the sheet is named after the project's sprite (${r.name})`)
check(r.manifest.image === 'SPIR.png' && r.manifest.sprite === 'SPIR', 'the manifest names its own picture')
let parsed = null
try { parsed = parseAtlas(r.manifest, 'SPIR') } catch (e) { check(false, `the client's parser accepts the composed manifest: ${e.message}`) }
if (parsed) {
  check(parsed.animations.map((a) => a.name).join(',') === 'idle,walk,Attack,death', `four animations (${parsed.animations.map((a) => a.name).join(',')})`)
  check(parsed.views.count === 8, `eight views (${parsed.views.count})`)
}
const size = pngSize(r.png)
check(r.png[0] === 0x89 && r.png[1] === 0x50, 'the sheet is a PNG')
check(size.w === r.manifest.size.w && size.h === r.manifest.size.h, `the PNG is the size the manifest says (${size.w}x${size.h} vs ${r.manifest.size.w}x${r.manifest.size.h})`)
// compare() takes the atlas as the client parses it (a numeric canvas), as the
// reader's own command feeds it.
const disagreements = parsed ? compare(readProject(Buffer.from(bytes), 'spirit'), parsed) : ['not parsed']
check(disagreements.length === 0, `the composed atlas says what the project says (${disagreements.join(' | ')})`)

// The starter module ships this very sprite as an atlas ThreeSprite exported;
// the runtime composes the same facts from the project.
const shipped = JSON.parse(readFileSync(join(ROOT, 'modules', 'starter', 'assets', 'sprites', 'SPIR.json'), 'utf8'))
check(shipped.canvas.w === r.manifest.canvas.w && shipped.worldHeight === r.manifest.worldHeight &&
      shipped.animations.map((a) => a.name).join() === r.manifest.animations.map((a) => a.name).join(),
      'and agrees with the atlas the starter module ships')

// --- what the module keeps, and the five states -----------------------------------------
const rec = sheetRecord(r.manifest)
check(rec.image === 'SPIR.png' && rec.worldHeight === 1 && rec.animations.length === 4, `the module record (${JSON.stringify(rec)})`)
const st = guessStates(rec.animations)
check(st[0] === 'idle' && st[1] === 'walk' && st[2] === 'Attack' && st[4] === 'death', `states matched to animations by name (${JSON.stringify(st)})`)
check(st[3] === 'idle', 'a sheet with no pain animation shows idle when hurt, as the catalogue does')
check(sheetName('my sprite-01') === 'MYSPRITE01', 'a sheet name is a catalogue token')

// --- an atlas export: manifest, then its picture ----------------------------------------
const asJson = { name: 'SPIR.json', bytes: new TextEncoder().encode(JSON.stringify(r.manifest)) }
let asked = null
const r2 = await importSheetFile(asJson, { parseAtlas, pickPng: async (image) => { asked = image; return { name: image, bytes: r.png } } })
check(asked === 'SPIR.png' && r2.name === 'SPIR' && r2.png.length === r.png.length, `a manifest asks for its picture by name and takes it (${asked})`)

// --- a project's sprite id: SPRT, ThreeSprite's default, is nobody's name -------------------
// Every sprite ThreeSprite starts says SPRT until it is named, so two of them
// imported by their id would be one sheet, the second over the first.
const sprt = nameTsprite(bytes, DEFAULT_SPRITE)
check(inspectTsprite(sprt).sprite === 'SPRT', `a project can be given an id (${inspectTsprite(sprt).sprite})`)
const imp = await importSheetFile({ name: 'imp.tsprite', bytes: sprt }, { parseAtlas, pickPng: async () => null })
const cac = await importSheetFile({ name: 'cacodemon.tsprite', bytes: sprt }, { parseAtlas, pickPng: async () => null })
check(imp.name === 'IMP' && cac.name === 'CACODEMON' && imp.manifest.sprite === 'IMP', `two SPRT projects come in under their files' names (${imp.name}, ${cac.name})`)
const back = nameTsprite(sprt, 'IMP')
check(inspectTsprite(back).sprite === 'IMP' && inspectTsprite(back).animations.length === 4, 'a project handed out carries its sheet\'s name, and all of its animations')
const again = await importSheetFile({ name: 'whatever.tsprite', bytes: back }, { parseAtlas, pickPng: async () => null })
check(again.name === 'IMP', `so it comes back as itself, whatever the file is called (${again.name})`)
check(nameTsprite(back, 'IMP') === back, 'a project that has the name already is the same bytes')
check(inspectTsprite(nameTsprite(bytes, 'X')).canvas === inspectTsprite(bytes).canvas, 'renaming keeps the rest of the project')
check(nameTsprite(new Uint8Array([1, 2, 3]), 'X') === null, 'CONTROL: bytes that are not a project are not renamed')

// --- controls -------------------------------------------------------------------------------
let refused = null
try { await importSheetFile({ name: 'x.json', bytes: new TextEncoder().encode('{"format":"threesprite-atlas","version":1}') }, { parseAtlas, pickPng: async () => null }) } catch (e) { refused = e.message }
check(refused !== null, `CONTROL: a manifest the game could not draw is refused (${refused})`)
refused = null
try { await importSheetFile({ name: 'x.tsprite', bytes: new Uint8Array([80, 75, 3, 4, 0, 0]) }, { parseAtlas, pickPng: async () => null }) } catch (e) { refused = e.message }
check(refused !== null, `CONTROL: something that is not a project is refused (${String(refused).slice(0, 60)})`)
refused = null
try { await importSheetFile({ name: 'x.gif', bytes: new Uint8Array(4) }, { parseAtlas, pickPng: async () => null }) } catch (e) { refused = e.message }
check(refused !== null, 'CONTROL: an unknown file kind is refused')
refused = null
try { await importSheetFile(asJson, { parseAtlas, pickPng: async () => null }) } catch (e) { refused = e.message }
check(/needs its sheet/.test(refused ?? ''), 'CONTROL: a manifest without its picture is refused, naming the picture')

console.log(`\nsheets: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
