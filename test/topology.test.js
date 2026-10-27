//
// Adjacency the author never typed, checked against the engine's own reading
// of the baked map.
//
// Every claim here is "draw this, and the baked map has that side pointing at
// that sector" -- asserted on what core.loadMap + readMap hand back, not on
// what derive() says it meant. The T-junction case carries the control that
// matters most: without the split, the long wall names no neighbour at all,
// and a body walking through the half that borders the second room would hit
// a wall the author never drew.
//
import { newDoc, addSector, addSpawn, removeSector, validate, RES } from '../src/doc.js'
import { normalize, derive, sectorAt, snapToMap, nearestEdgePoint, sideKinds, openWalls, restoreWalls } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { requireOracles, bakeNative, readBaked, sideBetween } from './oracle.js'
import { SIDE_FLAG, NO_SECTOR } from '../../engine/client/src/mapdata.js'

requireOracles('topology')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

async function bake (doc, opts) {
  normalize(doc, opts)
  const d = derive(doc)
  const e = emitMap(d, doc)
  const b = bakeNative(e.text)
  if (!b.ok) return { ok: false, stderr: b.stderr, derived: d, emitted: e }
  const { data } = await readBaked(b.dnpm)
  return { ok: true, data, derived: d, emitted: e }
}

// --- two rooms sharing a wall -----------------------------------------------
{
  const doc = newDoc('abut')
  addSector(doc, rect(0, 0, 8, 8))
  addSector(doc, rect(8, 0, 16, 8))
  addSpawn(doc, 'start', 4, 4)
  const r = await bake(doc)
  check(r.ok, `abutting rooms bake (${r.stderr})`)
  if (r.ok) {
    const ab = sideBetween(r.data, 0, { x: 8, y: 0 }, { x: 8, y: 8 })
    const ba = sideBetween(r.data, 1, { x: 8, y: 8 }, { x: 8, y: 0 })
    check(ab && ab.neighbor === 1, `A's shared side points at B (${ab?.neighbor})`)
    check(ba && ba.neighbor === 0, `B's shared side points at A (${ba?.neighbor})`)
    check(r.data.sectors[0].sideCount === 4 && r.data.sectors[1].sideCount === 4, 'four sides each, nothing invented')
    const wall = sideBetween(r.data, 0, { x: 0, y: 0 }, { x: 8, y: 0 })
    check(wall && wall.neighbor === NO_SECTOR && !(wall.flags & SIDE_FLAG.LEDGE), 'an outer edge is a wall')
  }
}

// --- a forced wall is a wall from both sides ----------------------------------
{
  const doc = newDoc('forced')
  const a = addSector(doc, rect(0, 0, 8, 8))
  addSector(doc, rect(8, 0, 16, 8))
  addSpawn(doc, 'start', 4, 4)
  normalize(doc)
  a.verts.find((v) => v.x === 8 && v.y === 0).edge.force = 'wall'
  const r = await bake(doc)
  check(r.ok, `forced wall bakes (${r.stderr})`)
  if (r.ok) {
    const ab = sideBetween(r.data, 0, { x: 8, y: 0 }, { x: 8, y: 8 })
    const ba = sideBetween(r.data, 1, { x: 8, y: 8 }, { x: 8, y: 0 })
    check(ab.neighbor === NO_SECTOR && ba.neighbor === NO_SECTOR, 'forcing one side walls both')
  }
}

// --- a T-junction: one long wall, two rooms behind it -------------------------
{
  const build = () => {
    const doc = newDoc('tee')
    addSector(doc, rect(0, 0, 16, 8))
    addSector(doc, rect(16, 0, 24, 4))
    addSector(doc, rect(16, 4, 24, 8))
    addSpawn(doc, 'start', 4, 4)
    return doc
  }
  const doc = build()
  const r = await bake(doc)
  check(r.ok, `T-junction bakes (${r.stderr})`)
  check(doc.sectors[doc.order[0]].verts.length === 5, `the long wall gained a corner (${doc.sectors[doc.order[0]].verts.length} corners)`)
  if (r.ok) {
    const lo = sideBetween(r.data, 0, { x: 16, y: 0 }, { x: 16, y: 4 })
    const hi = sideBetween(r.data, 0, { x: 16, y: 4 }, { x: 16, y: 8 })
    check(lo && lo.neighbor === 1, `the lower half points at the lower room (${lo?.neighbor})`)
    check(hi && hi.neighbor === 2, `the upper half points at the upper room (${hi?.neighbor})`)
    const back1 = sideBetween(r.data, 1, { x: 16, y: 4 }, { x: 16, y: 0 })
    const back2 = sideBetween(r.data, 2, { x: 16, y: 8 }, { x: 16, y: 4 })
    check(back1?.neighbor === 0 && back2?.neighbor === 0, 'both rooms point back at the hall')
  }
  // CONTROL: without the split the hall's wall is one side and can name only
  // one thing -- and since neither room's edge matches it, it names nothing.
  const unsplit = build()
  const u = await bake(unsplit, { split: false })
  check(u.ok, `CONTROL: the unsplit map still bakes (${u.stderr}) -- mapc does not catch this, which is why the studio must`)
  if (u.ok) {
    const whole = sideBetween(u.data, 0, { x: 16, y: 0 }, { x: 16, y: 8 })
    check(whole && whole.neighbor === NO_SECTOR, `CONTROL: unsplit, the wall names no neighbour (${whole?.neighbor})`)
  }
}

// --- a platform standing in a room --------------------------------------------
{
  const doc = newDoc('platform')
  addSector(doc, rect(0, 0, 16, 16), { floor: 0, ceil: 8 })
  addSector(doc, rect(4, 4, 8, 8), { floor: 2, ceil: 8, thickness: 0.5 })
  addSpawn(doc, 'start', 2, 2)
  const r = await bake(doc)
  check(r.ok, `platform bakes (${r.stderr})`)
  check(r.derived.kinds[doc.order[1]] === 'platform', `a higher nested floor is a platform (${r.derived.kinds[doc.order[1]]})`)
  if (r.ok) {
    const p = r.data.sectors[1]
    let open = 0
    for (let k = 0; k < p.sideCount; k++) {
      const sd = r.data.sides[p.firstSide + k]
      if (sd.neighbor === NO_SECTOR && (sd.flags & SIDE_FLAG.LEDGE)) open++
    }
    check(open === 4, `all four platform edges are open ledges (${open})`)
    check(r.data.sectors[0].sideCount === 4, 'the room keeps four sides: no hole under a platform')
  }
}

// --- floating platforms in the void, touching ------------------------------------------
//
// maps/void.map: top-level sectors whose edges are `open`, walked off into the
// fall, and shared where two of them meet. Nothing contains them, so the kind
// has to be said rather than read from a floor height.
{
  const doc = newDoc('void')
  addSector(doc, rect(0, 0, 16, 8), { kind: 'platform', floor: 6, ceil: 40, thickness: 2 })
  addSector(doc, rect(16, 2, 32, 8), { kind: 'platform', floor: 6, ceil: 40, thickness: 2 })
  addSector(doc, rect(40, 0, 48, 8))                       // a room, for the control
  addSpawn(doc, 'start', 8, 4)
  const r = await bake(doc)
  check(r.ok, `floating platforms bake (${r.stderr})`)
  check(r.derived.kinds[doc.order[0]] === 'platform' && r.derived.parents[doc.order[0]] === null, 'a lone sector can be a platform')
  if (r.ok) {
    const count = (si, pred) => { const s = r.data.sectors[si]; let n = 0; for (let k = 0; k < s.sideCount; k++) if (pred(r.data.sides[s.firstSide + k])) n++; return n }
    const isOpen = (sd) => sd.neighbor === NO_SECTOR && (sd.flags & SIDE_FLAG.LEDGE)
    check(count(0, isOpen) === 4, `the first platform's unshared edges are open ledges (${count(0, isOpen)} of ${r.data.sectors[0].sideCount})`)
    const shared = sideBetween(r.data, 0, { x: 16, y: 2 }, { x: 16, y: 8 })
    check(shared && shared.neighbor === 1, `where the two platforms meet, the edge is shared (${shared?.neighbor})`)
    check(count(1, isOpen) === 3 && count(1, (sd) => sd.neighbor === 0) === 1, 'the second platform: three open edges and the shared one')
    check(near(r.data.sectors[0].thickness, 2), `the skirt is baked (${r.data.sectors[0].thickness})`)
    // CONTROL: the room beside them is still walls.
    check(count(2, (sd) => sd.neighbor === NO_SECTOR && !(sd.flags & SIDE_FLAG.LEDGE)) === 4, 'CONTROL: a room in the void keeps its walls')
  }
}

// --- a pit cut into the floor ---------------------------------------------------
{
  const doc = newDoc('pit')
  addSector(doc, rect(0, 0, 16, 16), { floor: 0, ceil: 8 })
  addSector(doc, rect(10, 4, 14, 8), { floor: -2, ceil: 8 })
  addSpawn(doc, 'start', 2, 2)
  const r = await bake(doc)
  check(r.ok, `pit bakes (${r.stderr})`)
  check(r.derived.kinds[doc.order[1]] === 'cut', `a lower nested floor is a cut (${r.derived.kinds[doc.order[1]]})`)
  if (r.ok) {
    const room = r.data.sectors[0]
    check(room.sideCount === 8, `the room has a hole: 8 sides (${room.sideCount})`)
    let rim = 0
    for (let k = 4; k < room.sideCount; k++) if (r.data.sides[room.firstSide + k].neighbor === 1) rim++
    check(rim === 4, `every rim side points into the pit (${rim})`)
    const pit = r.data.sectors[1]
    let up = 0
    for (let k = 0; k < pit.sideCount; k++) if (r.data.sides[pit.firstSide + k].neighbor === 0) up++
    check(up === 4, `every pit side points back at the room (${up})`)
    // The rim runs the pit's outline backwards, so the rim side facing the
    // pit's edge from (10,4) to (14,4) runs from (14,4) to (10,4).
    const rimSide = sideBetween(r.data, 0, { x: 14, y: 4 }, { x: 10, y: 4 })
    check(rimSide !== null && rimSide.neighbor === 1, 'the rim mirrors the pit outline edge for edge')
  }
}

// --- a nested sector touching its container is refused, and said so --------------
{
  const doc = newDoc('touching')
  addSector(doc, rect(0, 0, 16, 16))
  addSector(doc, rect(0, 4, 4, 8), { floor: -1 })
  addSpawn(doc, 'start', 8, 8)
  normalize(doc)
  const d = derive(doc)
  check(d.warnings.some((w) => /touches the boundary/.test(w.msg)), `derive warns about the touching sector (${JSON.stringify(d.warnings)})`)
}

// --- winding: a clockwise drawing keeps its edges ---------------------------------
{
  const doc = newDoc('cw')
  // Drawn clockwise: up the left side, across the top, down the right, back.
  const s = addSector(doc, [{ x: 0, y: 0 }, { x: 0, y: 8 }, { x: 8, y: 8 }, { x: 8, y: 0 }])
  const names = ['LEFT', 'TOP', 'RIGHT', 'BOTTOM']
  s.verts.forEach((v, i) => { v.edge.middle = names[i] })
  const ids = s.verts.map((v) => v.edge.id)
  normalize(doc)
  const edgeFrom = (x, y) => s.verts.find((v) => v.x === x && v.y === y).edge
  check(edgeFrom(0, 0).middle === 'BOTTOM', `after normalising, the edge leaving (0,0) is the bottom (${edgeFrom(0, 0).middle})`)
  check(edgeFrom(8, 0).middle === 'RIGHT', `the edge leaving (8,0) is the right wall (${edgeFrom(8, 0).middle})`)
  check(edgeFrom(8, 8).middle === 'TOP', `the edge leaving (8,8) is the top (${edgeFrom(8, 8).middle})`)
  check(edgeFrom(0, 8).middle === 'LEFT', `the edge leaving (0,8) is the left wall (${edgeFrom(0, 8).middle})`)
  check(s.verts.every((v) => ids.includes(v.edge.id)), 'edge ids survive the reversal')
}

// --- a platform across a border: over two rooms, higher than both ----------------------
{
  const doc = newDoc('across')
  const r = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  addSector(doc, r(0, 0, 20, 20), { floor: 0 }); addSector(doc, r(20, 0, 40, 20), { floor: 0 })
  const plat = addSector(doc, r(15, 5, 25, 10), { floor: 2 })
  addSpawn(doc, 'start', 5, 15)
  normalize(doc)
  const d = derive(doc)
  check(d.kinds[plat.id] === 'platform', `a raised room over two rooms is a platform (${d.kinds[plat.id]})`)
  const sp = d.sectors.find((x) => x.id === plat.id)
  check(sp.verts.every((v) => v.kind === 'open'), `its edges are open, not walls (${sp.verts.map((v) => v.kind)})`)
  const baked = bakeNative(emitMap(d, doc).text)
  check(baked.ok, `and it bakes (${baked.stderr})`)
  // CONTROL: level with the rooms it crosses, it is no platform (mapc refuses that overlap)
  plat.floor = 0
  check(derive(doc).kinds[plat.id] === null, 'CONTROL: a level room across a border is no platform')
}

// --- an effect sector: laid over the rooms, part of no topology (map version 17) ----
{
  const doc = newDoc('effects')
  const r = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const a = addSector(doc, r(0, 0, 10, 10), { floor: 0 }); const b = addSector(doc, r(10, 0, 20, 10), { floor: 0 })
  const fog = addSector(doc, r(6, 3, 14, 7), { kind: 'effect', floor: 0, ceil: 6, tag: 5, fx: [{ kind: 'fog', params: { density: 0.45, top: 2.5 } }] })
  addSpawn(doc, 'start', 2, 2)
  normalize(doc)
  check(a.verts.length === 4 && b.verts.length === 4, `the rooms are not split at its corners (${a.verts.length}, ${b.verts.length} corners)`)
  const d = derive(doc)
  check(d.kinds[fog.id] === 'effect' && d.parents[fog.id] === null, 'it is an effect sector, inside nobody')
  const da = d.sectors.find((x) => x.id === a.id)
  check(da.verts.filter((v) => v.kind === 'neighbor').length === 1 && da.verts.every((v) => v.neighbor !== fog.id), 'the rooms keep their one shared wall, and none opens onto it')
  check(sectorAt(doc, 8, 5)?.id === a.id, 'the room under a point inside it is the room, not the effect sector')
  const text = emitMap(d, doc).text
  check(/^sector type effect floor 0 ceil 6 tag 5$/m.test(text) && /^  vertex 6 3$/m.test(text) && /fx fog/.test(text), 'it is written as a type effect block, with plain corners and its fx')
  const baked = bakeNative(text)
  check(baked.ok, `and the map bakes (${baked.stderr})`)
  if (baked.ok) {
    const bytes = baked.dnpm
    check(new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) === 17, `as map version 17 (${new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true)})`)
  }
  // A LIQUID (map version 18): the same area as water, written type liquid
  doc.sectors[fog.id].liquid = true
  const wet = emitMap(derive(doc), doc).text
  check(/^sector type liquid floor 0 ceil 6 tag 5$/m.test(wet) && !/^sector type effect/m.test(wet), 'made water, it is written as a type liquid block')
  const wb = bakeNative(wet)
  check(wb.ok, `and it bakes (${wb.stderr})`)
  if (wb.ok) check(new DataView(wb.dnpm.buffer, wb.dnpm.byteOffset).getUint32(4, true) === 18, `as map version 18 (${new DataView(wb.dnpm.buffer, wb.dnpm.byteOffset).getUint32(4, true)})`)
  delete doc.sectors[fog.id].liquid
  check(/^sector type effect /m.test(emitMap(derive(doc), doc).text), 'CONTROL: not water, it is an effect area again')
  // CONTROL: the same rooms with no effect sector are no version 17
  const plain = newDoc('plain'); addSector(plain, r(0, 0, 10, 10)); addSector(plain, r(10, 0, 20, 10)); addSpawn(plain, 'start', 2, 2); normalize(plain)
  const pb = bakeNative(emitMap(derive(plain), plain).text)
  if (pb.ok) { const bytes = pb.dnpm; check(new DataView(bytes.buffer, bytes.byteOffset).getUint32(4, true) !== 17, 'CONTROL: a map without one is written as before') }
}

// --- snapping and duplicates ------------------------------------------------------
{
  const doc = newDoc('snap')
  // Corners go onto the exact lattice (1/RES), not the map's grid: the grid is
  // the tools' to apply, and switched off it must not come back here.
  const s = addSector(doc, [{ x: 0.1, y: 0.1 }, { x: 8 - 0.3 / RES, y: 0.2 / RES }, { x: 8 + 0.3 / RES, y: 0.1 / RES }, { x: 8, y: 8 }, { x: 0, y: 8 }])
  normalize(doc)
  check(s.verts.length === 4, `a corner that snaps onto its neighbour is dropped (${s.verts.length} corners)`)
  check(s.verts.every((v) => Number.isInteger(v.x * RES) && Number.isInteger(v.y * RES)), 'every corner sits on the exact lattice')
  check(s.verts.some((v) => v.x === Math.round(0.1 * RES) / RES), `CONTROL: a corner off the map's grid stays off it (${JSON.stringify(s.verts.map((v) => [v.x, v.y]))})`)
}

// --- which sector is under a point --------------------------------------------------
{
  const doc = newDoc('at')
  addSector(doc, rect(0, 0, 16, 16))
  const inner = addSector(doc, rect(4, 4, 8, 8), { floor: 2 })
  check(sectorAt(doc, 6, 6)?.id === inner.id, 'the smallest containing sector wins')
  check(sectorAt(doc, 12, 12)?.id === doc.order[0], 'outside the platform it is the room')
  check(sectorAt(doc, 20, 20) === null, 'outside everything is nothing')
}

// --- snapping to what is drawn: a tapped corner joins another room ----------------------
{
  const doc = newDoc('snapmap')
  addSector(doc, rect(0, 0, 8, 8))
  addSector(doc, [{ x: 12, y: 0 }, { x: 20, y: 0 }, { x: 20, y: 8 }, { x: 14, y: 12 }])   // a diagonal wall
  normalize(doc)
  const tol = 0.6
  let p = snapToMap(doc, 8.3, 7.8, { tolerance: tol })
  check(p.kind === 'corner' && p.x === 8 && p.y === 8, `near a corner lands on it (${JSON.stringify(p)})`)
  p = snapToMap(doc, 8.4, 3.1, { tolerance: tol })
  check(p.kind === 'edge' && p.x === 8 && p.y === Math.round(3.1 * RES) / RES, `near a wall lands exactly on it, at the finest grid (${JSON.stringify(p)})`)
  // The diagonal from (20,8) to (14,12) runs 6 across and 4 up: in eighths, 48
  // and 32, gcd 16, so exactly-on-it points are every (3,2)/8 -- and the
  // nearest one is what is offered.
  p = snapToMap(doc, 17.1, 9.8, { tolerance: tol })
  const onLine = (20 - p.x) * 4 - (p.y - 8) * 6
  check(p.kind === 'edge' && onLine === 0, `a diagonal wall snaps to a point exactly on it (${JSON.stringify(p)}, residual ${onLine})`)
  p = snapToMap(doc, 30.1, 30.2, { tolerance: tol })
  check(p.kind === 'grid' && p.x === 30 && p.y === 30.25, `far from everything, the grid (${JSON.stringify(p)})`)
  p = snapToMap(doc, 8.3, 7.8, { tolerance: tol, except: doc.order[0] })
  check(p.kind === 'grid', 'a corner excluded from its own room does not snap to it')
  // CONTROL: the tolerance decides, so a point just outside it stays put.
  check(nearestEdgePoint(doc, 8.7, 3.1, tol) === null, 'CONTROL: beyond the tolerance nothing snaps')
  // And the point of it: corners snapped to another room's wall bake into a
  // shared wall, through the split the normaliser makes.
  addSector(doc, [{ x: 8, y: 2 }, { x: 11, y: 2 }, { x: 11, y: 6 }, { x: 8, y: 6 }])
  addSpawn(doc, 'start', 4, 4)
  const r = await bake(doc)
  check(r.ok, `the snapped room bakes (${r.stderr})`)
  if (r.ok) {
    const shared = sideBetween(r.data, 2, { x: 8, y: 6 }, { x: 8, y: 2 })
    const back = sideBetween(r.data, 0, { x: 8, y: 2 }, { x: 8, y: 6 })
    check(shared?.neighbor === 0 && back?.neighbor === 2, `the wall is shared both ways (${shared?.neighbor}, ${back?.neighbor})`)
  }
}

// --- validate says it first ---------------------------------------------------------
{
  const doc = newDoc('bad')
  addSector(doc, [{ x: 0, y: 0 }, { x: 4, y: 0 }])
  const p = validate(doc)
  check(p.some((x) => /at least 3/.test(x.msg)), 'a two-corner sector is named')
  check(p.some((x) => /'start'/.test(x.msg)), 'a missing start spawn is named')
}

// --- a room drawn over rooms, then made an effect area or deleted ---------------------------
// Its inner walls became openings and gave their middles up (tools.js
// placeRoom); a wall again, they take them back. The user's report: an
// effect area drawn over rooms left their walls untextured, deleted or not.
{
  const over = () => {
    const doc = newDoc('over')
    const inner = addSector(doc, rect(8, 4, 16, 12), { floor: 0, ceil: 4 }, { middle: 'STONE2' })
    normalize(doc)
    const before = sideKinds(doc)
    const big = addSector(doc, rect(4, 0, 20, 16), { floor: 0, ceil: 4 }, { middle: 'STONE2' })
    normalize(doc)
    openWalls(doc, before)
    return { doc, inner, big }
  }
  const textured = (s) => s.verts.filter((v) => v.edge.middle === 'STONE2').length
  const a = over()
  check(textured(a.inner) === 0, `drawn over, the inner room's walls are openings with no middle (${textured(a.inner)}/4)`)
  a.big.kind = 'effect'; normalize(a.doc)
  check(textured(a.inner) === 0, 'CONTROL: made an effect area, normalize alone gives nothing back')
  restoreWalls(a.doc)
  check(textured(a.inner) === 4, `made an effect area, the inner walls take their middles back (${textured(a.inner)}/4)`)
  check(a.inner.verts.every((v) => v.edge.middleWas === undefined), 'and keep nothing aside once they are walls')
  a.inner.verts[0].edge.middle = null; normalize(a.doc); restoreWalls(a.doc)
  check(a.inner.verts[0].edge.middle === null, 'a middle cleared on a wall afterwards stays cleared')

  const b = over()
  removeSector(b.doc, b.big.id); normalize(b.doc); restoreWalls(b.doc)
  check(textured(b.inner) === 4, `the room over them deleted, the walls take their middles back (${textured(b.inner)}/4)`)

  const c = over()
  normalize(c.doc); restoreWalls(c.doc)
  check(textured(c.inner) === 0, 'CONTROL: while they are openings, an edit gives nothing back')
}

console.log(`\ntopology: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
