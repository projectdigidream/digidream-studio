// ThreeSprite's PER-VIEW LAYER ORDER (`partOrderByView`) is what the studio
// bakes: a view that stacks its parts its own way comes out that way in the
// sheet, the other views as before. The studio composes .tsprite projects
// with ThreeSprite's own runtime (vendor/tsprite.js, scripts/vendor_tsprite.sh);
// a copy from before the feature baked every view in the one partOrder.
//
//   node studio/test/vieworder.test.js [runtime.js]   (another runtime: the control)

import { readFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { unzipSync, zipSync, strFromU8, strToU8 } from '../vendor/fflate.js'

const name = 'vieworder'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

const runtime = process.argv[2] ? pathToFileURL(process.argv[2]).href : new URL('../vendor/tsprite.js', import.meta.url).href
const { loadTsprite } = await import(runtime)

// The fixture with its body drawn twice, the second copy shifted sideways:
// where the two overlap they show different pixels, so which is on top shows.
const fixture = (() => {
  const z = unzipSync(new Uint8Array(readFileSync(new URL('fixtures/spirit.tsprite', import.meta.url))))
  const p = JSON.parse(strFromU8(z['project.json']))
  const body = Object.values(p.parts).find((x) => x.name === 'body')
  const copy = JSON.parse(JSON.stringify(body))
  copy.id = 'bodyCopy0001'
  copy.name = 'body copy'
  copy.offset = { x: body.offset.x + 7, y: body.offset.y + 3 }
  p.parts[copy.id] = copy
  p.partOrder = [...p.partOrder, copy.id]
  z['project.json'] = strToU8(JSON.stringify(p))
  return zipSync(z)
})()
// The project with some views given their own order.
const withOrder = (byView) => {
  const z = unzipSync(fixture)
  const p = JSON.parse(strFromU8(z['project.json']))
  p.partOrderByView = byView(p.partOrder)
  z['project.json'] = strToU8(JSON.stringify(p))
  return zipSync(z)
}
// Each view's frames, as the pixels of their rects: one fingerprint per view.
const views = (bytes) => {
  const r = loadTsprite(bytes)
  const out = new Map()
  // Frames are keyed '<animation>/<frame>/v<view>'.
  for (const [key, f] of Object.entries(r.sheet.manifest.frames)) {
    const v = Number(/\/v(\d+)$/.exec(key)[1])
    const { x, y, w, h } = f.rect
    let s = out.get(v) ?? ''
    for (let j = y; j < y + h; j++) for (let i = x; i < x + w; i++) { const o = (j * r.width + i) * 4; s += r.rgba[o + 3] ? `${r.rgba[o]},${r.rgba[o + 1]},${r.rgba[o + 2]};` : '.' }
    out.set(v, s)
  }
  return out
}

const plain = views(fixture)
const reversed = views(withOrder((order) => ({ 1: [...order].reverse() })))
const same = views(withOrder((order) => ({ 1: [...order] })))
const changed = [...plain.keys()].filter((v) => plain.get(v) !== reversed.get(v))
check(plain.size >= 4, `the fixture bakes several views (${plain.size})`)
check(changed.length >= 1 && changed.every((v) => v === 1), `view 1's own order changes view 1, and no other view (changed: ${changed.join(', ') || 'none'})`)
check([...plain.keys()].every((v) => plain.get(v) === same.get(v)), 'CONTROL: a view order the same as the default bakes exactly as before')

console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
