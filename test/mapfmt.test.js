//
// The side indices the emitter promises are the ones the baked map has.
//
// Everything a trigger says about geometry rests on this: `side = 7` must be
// the edge the author tapped. So every edge id is looked up in the emitter's
// table and the side at that index is read back out of the engine's own
// loader -- and its two endpoints must be the edge's two corners.
//
import { newDoc, addSector, addSpawn, addLight } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap, num } from '../src/mapfmt.js'
import { requireOracles, bakeNative, readBaked } from './oracle.js'

requireOracles('mapfmt')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

check(num(0.125) === '0.125' && num(-3.5) === '-3.5' && num(12) === '12' && num(0) === '0', 'numbers print exactly and plainly')

const doc = newDoc('idx')
addSector(doc, rect(0, 0, 16, 8), { tag: 7, floorTex: 'FLOOR', ceilTex: 'CEIL' }, { middle: 'WALL' })
addSector(doc, rect(16, 0, 24, 4), { tag: 8 })
addSector(doc, rect(16, 4, 24, 8), { tag: 9 })
addSector(doc, rect(4, 2, 8, 6), { tag: 10, floor: -1 })       // a pit in the hall
addSpawn(doc, 'start', 2, 2)
addLight(doc, 8, 4, 6, { r: 255, g: 200, b: 120 })
normalize(doc)
const derived = derive(doc)
// Baked without scripts: the scratch directory has none, and mapc refuses a
// declaration it cannot find (as it should). The declaration line is checked
// on its own.
const emitted = emitMap(derived, doc)

check(emitMap(derive(doc), doc).text === emitted.text, 'emitting twice gives the same text')
check(/^script \.\.\/\.\.\/\.\.\/maps\/scripts\/mobs\.lua$/m.test(emitMap(derived, doc, ['../../../maps/scripts/mobs.lua']).text),
      'script declarations are written as given')
check(/^light 8 4 6 color 255 200 120 radius 12 intensity 1$/m.test(emitted.text), 'lights are written')

const baked = bakeNative(emitted.text)
check(baked.ok, `the emitted map bakes (${baked.stderr})`)
if (baked.ok) {
  const { data } = await readBaked(baked.dnpm)

  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    const si = emitted.sectorIndex.get(sid)
    check(data.sectors[si].tag === s.tag, `${sid} is sector ${si} (tag ${data.sectors[si].tag} vs ${s.tag})`)
    s.verts.forEach((v, i) => {
      const q = s.verts[(i + 1) % s.verts.length]
      const idx = emitted.sideIndex.get(v.edge.id)
      const sd = data.sides[idx]
      const pa = data.points[sd.a]
      const pb = data.points[sd.b]
      check(idx >= data.sectors[si].firstSide && idx < data.sectors[si].firstSide + data.sectors[si].sideCount,
            `${v.edge.id} lands inside its sector's side range`)
      check(pa.x === v.x && pa.y === v.y && pb.x === q.x && pb.y === q.y,
            `${v.edge.id}: side ${idx} runs (${pa.x},${pa.y})->(${pb.x},${pb.y}), edge runs (${v.x},${v.y})->(${q.x},${q.y})`)
    })
  }

  // Twins: the side facing an edge, from the neighbour or from the hole rim.
  const hall = doc.sectors[doc.order[0]]
  const pit = doc.sectors[doc.order[3]]
  for (const v of hall.verts) {
    const idx = emitted.sideIndex.get(v.edge.id)
    const twin = emitted.twinIndex.get(v.edge.id)
    const sd = data.sides[idx]
    if (sd.neighbor === -1) {
      check(twin === -1, `${v.edge.id} is a wall and has no twin (${twin})`)
    } else {
      const t = data.sides[twin]
      const ts = data.sectors[sd.neighbor]
      check(twin >= ts.firstSide && twin < ts.firstSide + ts.sideCount && t.neighbor === emitted.sectorIndex.get(hall.id),
            `${v.edge.id}'s twin ${twin} belongs to sector ${sd.neighbor} and points back`)
    }
  }
  for (const v of pit.verts) {
    const twin = emitted.twinIndex.get(v.edge.id)
    const t = data.sides[twin]
    const hallIdx = emitted.sectorIndex.get(hall.id)
    const hs = data.sectors[hallIdx]
    check(twin >= hs.firstSide + 5 && twin < hs.firstSide + hs.sideCount && t.neighbor === emitted.sectorIndex.get(pit.id),
          `${v.edge.id}'s twin ${twin} is a rim side of the hall pointing into the pit`)
  }

  // CONTROL: an index table built from a different walk is wrong, and this
  // test can tell. Bake the sectors in another order and look the edges up
  // with the original table.
  const shuffled = { ...derived, sectors: [...derived.sectors].reverse() }
  const other = bakeNative(emitMap(shuffled, doc).text)
  check(other.ok, `CONTROL: the reordered map bakes (${other.stderr})`)
  if (other.ok) {
    const { data: od } = await readBaked(other.dnpm)
    let wrong = 0
    for (const sid of doc.order) {
      const s = doc.sectors[sid]
      const si = emitted.sectorIndex.get(sid)
      s.verts.forEach((v, i) => {
        const q = s.verts[(i + 1) % s.verts.length]
        const sd = od.sides[emitted.sideIndex.get(v.edge.id)]
        const pa = od.points[sd.a]
        const pb = od.points[sd.b]
        if (!(pa.x === v.x && pa.y === v.y && pb.x === q.x && pb.y === q.y)) wrong++
      })
    }
    check(wrong > 0, `CONTROL: a table from another walk misplaces edges (${wrong} wrong)`)
  }
}

// A WALL'S TEXTURE SIZED ALONG AND UP ON ITS OWN (map version 16): `yscale`
// is written beside `xscale` only when they differ, and the bake keeps both.
{
  const d2 = newDoc('stretch')
  addSector(d2, rect(0, 0, 8, 8), { tag: 1 }, { middle: 'WALL' })
  normalize(d2)
  const s = d2.sectors[d2.order[0]]
  const [a, b, c] = s.verts
  a.edge.scale = 2; a.edge.yscale = 0.5   // stretched
  b.edge.scale = 2                       // uniform
  c.edge.scale = 2; c.edge.yscale = 2     // CONTROL: the same both ways is plain `scale`
  const em = emitMap(derive(d2), d2)
  check(/xscale 2 yscale 0\.5/.test(em.text) && (em.text.match(/ scale 2\b/g) ?? []).length === 2, `a stretched wall is xscale/yscale, the others plain scale (${em.text.match(/(x|y)?scale [\d.]+/g)})`)
  const bk = bakeNative(em.text)
  check(bk.ok, `the stretched map bakes (${bk.stderr})`)
  if (bk.ok) {
    const { data } = await readBaked(bk.dnpm)
    const sa = data.sides[em.sideIndex.get(a.edge.id)]; const sb = data.sides[em.sideIndex.get(b.edge.id)]
    check(sa.scale === 2 && sa.scaleY === 0.5, `the bake keeps both (${sa.scale} x ${sa.scaleY})`)
    check(sb.scale === 2 && sb.scaleY === 2, `CONTROL: a uniform wall is the same both ways (${sb.scale} x ${sb.scaleY})`)
  }
}

console.log(`\nmapfmt: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
