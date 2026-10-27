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
import { RES, DEFAULT_BODY } from './doc.js'

/** A dyadic number as mapc reads it: exact, no exponent, no trailing zeros. */
export const num = (v) => {
  const s = (Math.round(v * RES) / RES).toString()
  if (s.includes('e')) throw new Error(`number out of range for a map: ${v}`)
  return s
}

// --- sector effects (docs/SECTOR_FX.md) -------------------------------------------

/** A value as an `fx` line takes it: a colour as six hex digits, a number exactly. */
export function fxWord (key, v) {
  if (key === 'color') {
    const n = typeof v === 'number' ? v : parseInt(String(v).replace(/^#/, ''), 16)
    return (n >>> 0).toString(16).padStart(6, '0').slice(-6)
  }
  const s = String(Number(Number(v).toFixed(4)))
  if (s.includes('e') || !Number.isFinite(Number(v))) throw new Error(`fx ${key}: ${v} is not a number a map can hold`)
  return s
}

/** The `fx` lines of one sector, in the order they were added. */
export function fxLines (fx = []) {
  return fx.map((e) => ['fx', e.kind, ...Object.entries(e.params ?? {}).flatMap(([k, v]) => [k, fxWord(k, v)])].join(' '))
}

function area2 (verts) {
  let a = 0
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]; const q = verts[(i + 1) % verts.length]
    a += p.x * q.y - q.x * p.y
  }
  return a
}

/** `floorangle 30 floorscale 1.5` -- one prefix for the surface, one suffix for the attribute. */
function styleWords (prefix, st) {
  if (!st) return []
  const out = []
  if (st.angle) out.push(`${prefix}angle ${num(st.angle)}`)
  if (st.offX) out.push(`${prefix}offx ${num(st.offX)}`)
  if (st.offY) out.push(`${prefix}offy ${num(st.offY)}`)
  if (st.scale !== undefined && st.scale !== 1) out.push(`${prefix}scale ${num(st.scale)}`)
  if (st.alpha !== undefined && st.alpha !== 255) out.push(`${prefix}alpha ${Math.round(st.alpha)}`)
  if (st.anchor === 'sector') out.push(`${prefix}anchor sector`)
  return out
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
  // turned and scaled like a flat (map version 15, docs/WALL_STYLES.md)
  if (e.angle) w.push(`angle ${num(e.angle)}`)
  // up the wall on its own (`yscale`, map version 16): written only when it differs from along it
  const sx = e.scale > 0 ? e.scale : 1
  if (e.yscale > 0 && e.yscale !== sx) w.push(`xscale ${num(sx)} yscale ${num(e.yscale)}`)
  else if (sx !== 1) w.push(`scale ${num(sx)}`)
  if (e.unpegUpper) w.push('unpeg-upper')
  if (e.unpegLower) w.push('unpeg-lower')
  // A GRATE. 255 is the solid sheet, and writing it would be saying nothing at
  // more length -- and would fold a default into the map's hash.
  if (e.alpha !== undefined && e.alpha !== 255) w.push(`alpha ${Math.round(e.alpha)}`)
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
export function emitMap (derived, doc, scripts = [], { body = doc.body ?? DEFAULT_BODY } = {}) {
  const L = []
  const sectorIndex = new Map(derived.sectors.map((s, i) => [s.id, i]))
  const sideIndex = new Map()
  const twinIndex = new Map()
  const sides = []
  const byKey = new Map()

  L.push(`# ${doc.name}.map -- written by the studio from ${doc.name}.studio.json.`)
  L.push('# Edit the level there; this file is rewritten on every bake.')
  L.push('')
  L.push(`body radius ${num(body.radius)} height ${num(body.height)}`)
  L.push(`texscale ${num(doc.texscale)}`)
  if (scripts.length) {
    L.push('')
    for (const s of scripts) L.push(`script ${s}`)
  }

  // 1-based .map line number -> { sector, edge? }, for the lines of sector blocks.
  const lineOwner = []
  let side = 0
  for (const s of derived.sectors) {
    if (s.verts.length < 3) continue
    L.push('')
    // AN EFFECT SECTOR (docs/SECTOR_FX.md 7, map version 17): a volume for its
    // effects and events, over the map -- bottom and top, its tag, its fx and
    // plain corners; no textures or thickness. A FILL in it (SECTOR_FX.md
    // 1.3) is lit by its light and wears its ceiling picture as the top --
    // written only then, so an area without one stays the bytes it was.
    if (s.effect) {
      const filled = (s.fx ?? []).some((e) => e.kind === 'fill')
      const surface = filled && s.ceilTex ? [`ceiltex ${s.ceilTex}`, ...styleWords('ceil', s.ceilStyle)] : []
      // a liquid (map version 18) is one that is water: its top is the surface
      L.push([`sector type ${s.liquid ? 'liquid' : 'effect'} floor ${num(s.floor)} ceil ${num(s.ceil)}`, ...(s.tag ? [`tag ${s.tag}`] : []),
        ...(filled && Number.isFinite(s.light) ? [`light ${Math.round(s.light)}`] : []), ...surface].join(' '))
      const firstE = L.length
      for (const line of fxLines(s.fx)) L.push(`  ${line}`)
      if (area2(s.verts) < 0) throw new Error(`${s.id}: derive() handed a clockwise loop; normalize() first`)
      s.verts.forEach((v, i) => {
        const q = s.verts[(i + 1) % s.verts.length]
        L.push(`  vertex ${num(v.x)} ${num(v.y)}`)
        lineOwner[L.length] = { sector: s.id, edge: v.edge.id }
        const rec = { index: side, sector: s.id, neighbor: null, edge: v.edge, a: v, b: q }
        sides.push(rec)
        sideIndex.set(v.edge.id, side)
        side++
      })
      L.push('end')
      for (let n = firstE; n <= L.length; n++) lineOwner[n] ??= { sector: s.id }
      continue
    }
    const head = [`sector floor ${num(s.floor)} ceil ${num(s.ceil)}`]
    if (s.tag) head.push(`tag ${s.tag}`)
    head.push(`light ${s.light}`)
    if (s.thickness) head.push(`thickness ${num(s.thickness)}`)
    if (s.floorTex) head.push(`floortex ${s.floorTex}`)
    if (s.ceilTex) head.push(`ceiltex ${s.ceilTex}`)
    // WRITTEN ONLY WHEN IT SAYS SOMETHING. The map's content hash folds a
    // surface style in only when it differs from the default, so a map that
    // has never touched one hashes exactly as it did before these existed --
    // which is what lets an older module keep its soundtrack, keyed by that
    // hash, without a re-bake.
    head.push(...styleWords('floor', s.floorStyle))
    head.push(...styleWords('ceil', s.ceilStyle))
    L.push(head.join(' '))
    // Every line of the block is the sector's, so a mapc error by line
    // number can be traced back to the room it is about (problems.js).
    const first = L.length
    // Effects right after the head, before the vertices (docs/SECTOR_FX.md 5).
    // A map with none is written, and hashed, exactly as before they existed.
    for (const line of fxLines(s.fx)) L.push(`  ${line}`)

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
        lineOwner[L.length] = { sector: s.id, edge: v.edge.id }
        const rec = { index: side, sector: s.id, neighbor: v.neighbor, edge: v.edge, a: v, b: q }
        sides.push(rec)
        byKey.set(`${v.x},${v.y}>${q.x},${q.y}`, rec)
        if (li === 0) sideIndex.set(v.edge.id, side)
        side++
      })
      if (li > 0) L.push('  end')
    })
    L.push('end')
    for (let n = first; n <= L.length; n++) lineOwner[n] ??= { sector: s.id }
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
  // Camera paths, at file scope (docs/MAP_AUTHOR.md). `waypoint` is the same
  // word a rail uses and means the same thing; which block is open decides
  // where the point goes. The anchor is left to mapc, which infers it from the
  // sector each point falls in -- unless the path asked to be world-fixed.
  for (const p of doc.paths ?? []) {
    if (p.points.length < 2) continue
    L.push('')
    L.push(`path tag ${p.tag}${p.loop ? ' loop' : ''}`)
    for (const pt of p.points) {
      L.push(`  waypoint ${num(pt.x)} ${num(pt.y)} ${num(pt.z)}${p.anchored === false ? ' anchor none' : ''}`)
    }
    L.push('end')
  }
  L.push('')
  return { text: L.join('\n'), sectorIndex, sideIndex, twinIndex, sides, lineOwner }
}
