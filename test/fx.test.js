//
// Weather and fog: what the studio writes for a sector's effects is what the
// engine reads (docs/SECTOR_FX.md).
//
// The contract is the studio's half of SECTOR_FX.md §5: a sector carries
// `fx: [{ kind, params }]` and emitMap writes `fx <kind> key value ...` after
// the sector's head. What has to be proven is that both compilers take it --
// the native one and the wasm one the studio bakes with on a phone -- that the
// runtime reads back the numbers authored, with the engine's defaults for the
// rest, and that a map with no effects is written exactly as before.
//
// ORACLES: engine/build/<arch>/mapc, studio/wasm/dist/mapc.mjs, and the
// runtime's loader read back through engine/client/src/mapdata.js readEffects.
//
import { join } from 'node:path'
import { existsSync } from 'node:fs'
import { newDoc, addSector, addSpawn, validate } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap, fxLines, fxWord } from '../src/mapfmt.js'
import { bake } from '../src/bake.js'
import { ROOT, requireOracles, bakeNative, core } from './oracle.js'

requireOracles('fx')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const build = (tweak) => {
  const doc = newDoc('weather')
  const a = addSector(doc, rect(0, 0, 16, 16), { floorTex: 'F', ceilTex: 'C', ceil: 6 })
  const b = addSector(doc, rect(16, 0, 32, 16), { floorTex: 'F', ceilTex: 'C', ceil: 6 })
  addSpawn(doc, 'start', 2, 2)
  tweak?.(doc, a, b)
  normalize(doc)
  return { doc, text: emitMap(derive(doc), doc, []).text }
}

// --- the words ---------------------------------------------------------------------------
check(fxWord('color', '9aa8c0') === '9aa8c0' && fxWord('color', 0x0000ff) === '0000ff', 'a colour is six hex digits, padded')
check(fxWord('density', 0.012) === '0.012' && fxWord('windx', -1.5) === '-1.5' && fxWord('density', 10) === '10', 'a number is written exactly, no exponent')
check(fxLines([{ kind: 'rain', params: { density: 10, color: 'aabbcc' } }])[0] === 'fx rain density 10 color aabbcc', 'one line per effect: kind, then key value pairs')

const plain = build()
check(!/^\s*fx /m.test(plain.text), 'a map with no effects writes no fx line')

const wet = build((doc, a, b) => {
  a.fx = [{ kind: 'rain', params: { density: 10, windx: 1.5, color: '9aa8c0' } },
          { kind: 'fog', params: { density: 0.2, top: 1.25, falloff: 0.5 } }]
  b.fx = [{ kind: 'snow', params: {} }]
})
const lines = wet.text.split('\n')
const head = lines.findIndex((l) => /^sector /.test(l))
check(/^ {2}fx rain density 10 windx 1\.5 color 9aa8c0$/.test(lines[head + 1]) && /^ {2}fx fog /.test(lines[head + 2]) && /^ {2}vertex /.test(lines[head + 3]),
      `the effects come right after the sector's head, before its vertices (${lines.slice(head, head + 4).join(' | ')})`)
check(validate(wet.doc).length === 0, `the document validates (${validate(wet.doc).map((p) => p.msg).join(' | ')})`)
const bad = build((doc, a) => { a.fx = [{ kind: 'hail', params: {} }] })
check(validate(bad.doc).some((p) => /no effect called "hail"/.test(p.msg)), 'CONTROL: a kind the engine lacks is named before the bake')

// --- the compilers -----------------------------------------------------------------------
const native = bakeNative(wet.text, 'weather')
check(native.ok, `native mapc takes the studio's fx lines:\n${native.stderr}`)
const WASM = join(ROOT, 'studio', 'wasm', 'dist', 'mapc.mjs')
if (!existsSync(WASM)) {
  console.log('fx: no wasm mapc (engine/scripts/build_mapc_wasm.sh) -- the phone-side bake is not checked')
} else {
  const w = await bake({ mapPath: 'modules/t/maps/weather.map', mapText: wet.text })
  check(w.ok, `the studio's own (wasm) mapc takes them too -- a stale build would refuse every fx line (${w.errors.map((e) => e.msg).join('; ')})`)
  check(w.ok && native.ok && Buffer.compare(Buffer.from(w.dnpm), Buffer.from(native.dnpm)) === 0, 'and bakes the same bytes')
}
const badKey = build((doc, a) => { a.fx = [{ kind: 'snow', params: { falloff: 1 } }] })
check(!bakeNative(badKey.text, 'badkey').ok, 'CONTROL: mapc refuses a key the kind does not take, so the check above is not passing everything')

// --- read back by the runtime ------------------------------------------------------------
if (native.ok) {
  const c = await core()
  const { readEffects } = await import(join(ROOT, 'engine', 'client', 'src', 'mapdata.js'))
  const r = c.loadMap(new Uint8Array(native.dnpm))
  const fx = readEffects(r.map)
  const rain = fx.find((e) => e.kind === 1)
  const fog = fx.find((e) => e.kind === 5)
  const snow = fx.find((e) => e.kind === 2)
  check(fx.length === 3, `three effects read back (${fx.length})`)
  check(rain && rain.params.density === 10 && rain.params.windx === 1.5 && rain.params.color === 0x9aa8c0, `the rain is what was authored (${JSON.stringify(rain?.params)})`)
  check(rain && rain.params.speed === 9, `and takes the engine's default where it said nothing (speed ${rain?.params.speed})`)
  check(fog && Math.abs(fog.params.density - 0.2) < 1e-4 && fog.params.top === 1.25 && fog.params.falloff === 0.5, `the fog too (${JSON.stringify(fog?.params)})`)
  check(snow && snow.params.density === 4 && snow.params.color === 0xffffff, 'an effect with no keys is the kind\'s defaults')
  check(rain && fog && rain.sector === fog.sector && snow.sector !== rain.sector, 'each on the sector it was written in')
}

console.log(`fx: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
