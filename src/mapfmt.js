//
// The .map text, from a derived document.
//
// ONE WALK, TWO OUTPUTS. The same loop that writes each `vertex` line records
// which side index mapc will give it -- outer loop in order, then each hole in
// order, sectors in document order, exactly the walk in tools/mapc/main.cpp --
// so the trigger emitter can say `side = 7, expect_neighbour = 2` and be
// right by construction. A second walk that agreed with this one would agree
// until it did not.
//
// Winding is fixed here: outer loops counter-clockwise, holes clockwise, which
// is how the store keeps them (core/src/geom/mapstore.cpp). Emitting the store's
// own orientation means it never has to reverse anything, and the side that
// starts at corner i is the side that starts at corner i all the way down.
//
import { RES } from './doc.js'

/** A dyadic number as mapc reads it: exact, no exponent, no trailing zeros. */
export const num = (v) => {
  const s = (Math.round(v * RES) / RES).toString()
  if (s.includes('e')) throw new Error(`number out of range for a map: ${v}`)
  return s
}

function area2 (verts) {
  let a = 0
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]; const q = verts[(i + 1) % verts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a
}

function vertexLine (v, sectorIndex, indent) {
  const w = [`${indent}vertex ${num(v.x)} ${num(v.y)}`]
  if (v.kind === 'neighbor') w.push(`neighbor ${sectorIndex.get(v.neighbor)}`)
  else w.push(v.kind)
  const e = v.edge
  for (const f of ['climbable', 'grapple', 'blocking', 'trigger', 'usable']) if (e.flags?.[f]) w.push(f)
  if (e.middle) w.push(`tex ${e.middle}`)
  if (e.upper) w.push(`upper ${e.upper}`)
  if (e.lower) w.push(`lower ${e.lower}`)
  if (e.xoff) w.push(`xoff ${num(e.xoff)}`)
  if (e.yoff) w.push(`yoff ${num(e.yoff)}`)
  if (e.unpegUpper) w.push('unpeg-upper')
  if (e.unpegLower) w.push('unpeg-lower')
  return w.join(' ')
}

/**
 * @param derived  from topology.derive(doc)
 * @param doc      the document (body, texscale, spawns, lights)
 * @param scripts  script declarations, in order, as written in the file
 * @returns { text, sectorIndex: Map<sectorId, index>,
 *            sideIndex: Map<edgeId, index>,   the side each document edge became
 *            twinIndex: Map<edgeId, index>,   the side facing it (-1 for none):
 *                                             a neighbour's edge or a hole rim
 *            sides: [{ index, sector, neighbor, edge, a, b }] }
 */
export function emitMap (derived, doc, scripts = []) {
  const L = []
  const sectorIndex = new Map(derived.sectors.map((s, i) => [s.id, i]))
  const sideIndex = new Map()
  const twinIndex = new Map()
  const sides = []
  const byKey = new Map()

  L.push(`# ${doc.name}.map -- written by the studio from ${doc.name}.studio.json.`)
  L.push('# Edit the level there; this file is rewritten on every bake.')
  L.push('')
  L.push(`body radius ${num(doc.body.radius)} height ${num(doc.body.height)}`)
  L.push(`texscale ${num(doc.texscale)}`)
  if (scripts.length) {
    L.push('')
    for (const s of scripts) L.push(`script ${s}`)
  }

  let side = 0
  for (const s of derived.sectors) {
    if (s.verts.length < 3) continue
    L.push('')
    const head = [`sector floor ${num(s.floor)} ceil ${num(s.ceil)}`]
    if (s.tag) head.push(`tag ${s.tag}`)
    head.push(`light ${s.light}`)
    if (s.thickness) head.push(`thickness ${num(s.thickness)}`)
    if (s.floorTex) head.push(`floortex ${s.floorTex}`)
    if (s.ceilTex) head.push(`ceiltex ${s.ceilTex}`)
    L.push(head.join(' '))

    // Reversing here would move every edge to a different corner and break
    // the side indices this function promises, so a wrong winding is a bug
    // upstream and is said so.
    if (area2(s.verts) < 0) throw new Error(`${s.id}: derive() handed a clockwise loop; normalize() first`)
    for (const h of s.holes) if (area2(h) > 0) throw new Error(`${s.id}: derive() handed a counter-clockwise hole`)
    const loops = [s.verts, ...s.holes]
    loops.forEach((loop, li) => {
      if (li > 0) L.push('  hole')
      const indent = li > 0 ? '    ' : '  '
      loop.forEach((v, i) => {
        const q = loop[(i + 1) % loop.length]
        L.push(vertexLine(v, sectorIndex, indent))
        const rec = { index: side, sector: s.id, neighbor: v.neighbor, edge: v.edge, a: v, b: q }
        sides.push(rec)
        byKey.set(`${v.x},${v.y}>${q.x},${q.y}`, rec)
        if (li === 0) sideIndex.set(v.edge.id, side)
        side++
      })
      if (li > 0) L.push('  end')
    })
    L.push('end')
  }

  for (const rec of sides) {
    if (!sideIndex.has(rec.edge.id) || sideIndex.get(rec.edge.id) !== rec.index) continue
    const twin = byKey.get(`${rec.b.x},${rec.b.y}>${rec.a.x},${rec.a.y}`)
    twinIndex.set(rec.edge.id, twin ? twin.index : -1)
  }

  if (doc.spawns.length) L.push('')
  for (const p of doc.spawns) L.push(`spawn ${p.tag} ${num(p.x)} ${num(p.y)} ${num(p.z)}`)
  if (doc.lights.length) L.push('')
  for (const l of doc.lights) {
    L.push(`light ${num(l.x)} ${num(l.y)} ${num(l.z)} color ${l.r} ${l.g} ${l.b} ` +
           `radius ${num(l.radius)} intensity ${num(l.intensity)}`)
  }
  L.push('')
  return { text: L.join('\n'), sectorIndex, sideIndex, twinIndex, sides }
}
