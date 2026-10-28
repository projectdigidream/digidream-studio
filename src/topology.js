//
// Adjacency is derived, never typed.
//
// A .map says `neighbor 3` on an edge and it is the author's job to be right.
// The studio's author is drawing rooms on a phone, so this works it out from
// where the rooms ARE:
//
//   an edge with an identical edge, reversed, in another sector   -> neighbor
//   an edge of a sector nested inside another, kind 'platform'    -> open
//   an edge of a sector nested inside another, kind 'cut'         -> neighbor,
//        and the container gets a hole shaped like the nested sector whose
//        rim sides point back at it (a pit, or a floor region cut out)
//   anything else                                                 -> wall
//
// T-JUNCTIONS ARE SPLIT, IN THE DOCUMENT. A side names exactly one neighbour,
// and the engine walks side.neighbor when a body crosses it (collide.cpp), so
// a long wall bordering two rooms must be two sides. When a corner of one
// sector lies on an edge of another, normalize() inserts that corner into the
// other sector; the new vertex is visible to the author, as it is in every
// level editor, and stays put if the neighbour is later moved away.
//
// EXACT ARITHMETIC. Every test here is done in grid integers (RES per unit),
// because "does this point lie on that segment" answered in doubles is a
// coin toss at the boundary -- and the boundary is the case that matters.
// mapc makes the same tests in 128-bit integers for the same reason.
//
import { RES, newId, newEdge, snap } from './doc.js'

const I = (v) => Math.round(v * RES)

const cross = (ax, ay, bx, by, cx, cy) => (bx - ax) * (cy - ay) - (by - ay) * (cx - ax)

// Twice the signed area in grid units; positive is counter-clockwise.
function area2 (verts) {
  let a = 0
  for (let i = 0; i < verts.length; i++) {
    const p = verts[i]; const q = verts[(i + 1) % verts.length]
    a += I(p.x) * I(q.y) - I(q.x) * I(p.y)
  }
  return a
}

// Strictly between p and q on the segment, never an endpoint.
function onSegmentStrict (px, py, qx, qy, x, y) {
  if (cross(px, py, qx, qy, x, y) !== 0) return false
  if ((x === px && y === py) || (x === qx && y === qy)) return false
  return x >= Math.min(px, qx) && x <= Math.max(px, qx) &&
         y >= Math.min(py, qy) && y <= Math.max(py, qy)
}

// 1 inside, 0 on the boundary, -1 outside. Ray casting in integers.
function classify (verts, x, y) {
  let inside = false
  const n = verts.length
  for (let i = 0; i < n; i++) {
    const p = verts[i]; const q = verts[(i + 1) % n]
    const px = I(p.x); const py = I(p.y); const qx = I(q.x); const qy = I(q.y)
    if ((x === px && y === py) || onSegmentStrict(px, py, qx, qy, x, y)) return 0
    if ((py > y) !== (qy > y)) {
      // x of the edge at height y, compared without division: the sign of
      // (x - px) * (qy - py) - (qx - px) * (y - py) tells which side.
      const side = (qx - px) * (y - py) - (x - px) * (qy - py)
      if ((qy > py ? side : -side) > 0) inside = !inside
    }
  }
  return inside ? 1 : -1
}

/**
 * Snap, orient counter-clockwise, drop repeated corners and split T-junctions.
 * Mutates the document; returns it. Ids of surviving vertices and edges are
 * unchanged, which is what lets a trigger keep pointing at "that edge".
 *
 * `split: false` exists for the test's control and nothing else.
 */
export function normalize (doc, { split = true } = {}) {
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    // Onto the exact lattice (1/RES), not the map's grid: where a corner lands
    // on the grid is the tools' (tools.js step), and with the grid switched
    // off a corner here was pulled back onto it after every edit.
    for (const v of s.verts) { v.x = snap(v.x, 1 / RES); v.y = snap(v.y, 1 / RES) }
    // A corner equal to the one before it is one corner; the edge that
    // survives is the one leading on from it.
    s.verts = s.verts.filter((v, i, arr) => {
      const p = arr[(i - 1 + arr.length) % arr.length]
      return arr.length < 3 || !(p.x === v.x && p.y === v.y)
    })
    if (s.verts.length >= 3 && area2(s.verts) < 0) {
      // Reversing the corners reverses every edge: the edge that ran from
      // verts[i] to verts[i+1] now runs from verts[i+1] to verts[i] and so
      // belongs to the vertex that was its END. Ids travel with the edge.
      const edges = s.verts.map((v) => v.edge)
      s.verts.reverse()
      const n = s.verts.length
      // After the reverse, new index j holds old index n-1-j. Its outgoing
      // edge (to new j+1 = old n-2-j) is the old edge that started at old
      // index n-2-j.
      s.verts.forEach((v, j) => { v.edge = edges[(2 * n - 2 - j) % n] })
    }
  }
  for (const p of doc.spawns) { p.x = snap(p.x, 1 / RES); p.y = snap(p.y, 1 / RES); p.z = snap(p.z, 1 / RES) }
  for (const e of doc.entities) { e.x = snap(e.x, 1 / RES); e.y = snap(e.y, 1 / RES); e.z = snap(e.z, 1 / RES) }
  for (const l of doc.lights) { l.x = snap(l.x, 1 / RES); l.y = snap(l.y, 1 / RES); l.z = snap(l.z, 1 / RES) }

  if (split) {
    // Every corner of every sector against the edges of every other sector,
    // through a grid of the corners by cell: an edge asks only the cells its
    // box covers, not every corner of the map (that was corners x edges, and
    // seconds an edit on a map of a thousand rooms). Corners sharing
    // coordinates split the same edge once.
    const CELL = 8 * RES
    const cellOf = (v) => Math.floor(v / CELL)
    const grid = new Map()
    for (const sid of doc.order) {
      if (isEffect(doc.sectors[sid])) continue
      for (const v of doc.sectors[sid].verts) {
        const c = { sid, x: I(v.x), y: I(v.y) }
        const key = cellOf(c.x) + ',' + cellOf(c.y)
        let list = grid.get(key)
        if (!list) grid.set(key, (list = []))
        list.push(c)
      }
    }
    const near = function * (px, py, qx, qy) {
      for (let cx = cellOf(Math.min(px, qx)); cx <= cellOf(Math.max(px, qx)); cx++) {
        for (let cy = cellOf(Math.min(py, qy)); cy <= cellOf(Math.max(py, qy)); cy++) yield * (grid.get(cx + ',' + cy) ?? [])
      }
    }
    for (const sid of doc.order) {
      const s = doc.sectors[sid]
      if (isEffect(s)) continue
      const out = []
      for (let i = 0; i < s.verts.length; i++) {
        const p = s.verts[i]; const q = s.verts[(i + 1) % s.verts.length]
        const px = I(p.x); const py = I(p.y); const qx = I(q.x); const qy = I(q.y)
        out.push(p)
        const hits = []
        const seen = new Set()
        for (const c of near(px, py, qx, qy)) {
          if (c.sid === sid) continue
          const key = c.x + ',' + c.y
          if (seen.has(key) || !onSegmentStrict(px, py, qx, qy, c.x, c.y)) continue
          seen.add(key)
          hits.push(c)
        }
        // Along the edge from p, so the inserted corners stay in order.
        hits.sort((a, b) => (Math.abs(a.x - px) + Math.abs(a.y - py)) - (Math.abs(b.x - px) + Math.abs(b.y - py)))
        for (const h of hits) {
          // The new edge is a copy of the one it was cut from, with its own id.
          const { id: _cut, ...attrs } = p.edge
          out.push({ id: newId(doc, 'v'), x: h.x / RES, y: h.y / RES,
                     edge: newEdge(doc, { ...attrs, flags: { ...p.edge.flags } }) })
        }
      }
      s.verts = out
    }
  }
  return doc
}

/**
 * AN EFFECT SECTOR (kind 'effect', docs/SECTOR_FX.md 7) is a volume for
 * effects and events, laid over the map: no floor, no walls, overlapping
 * anything. The room topology never sees one -- it splits nothing, is split
 * by nothing, holds and is held by nothing, joins no room's side.
 */
export const isEffect = (s) => s?.kind === 'effect'

/**
 * Each sector's box and area, once for a whole derive, in lattice units: a
 * room whose box cannot hold another's (or meet it) is passed over before its
 * polygon is asked, which is most of them on a big map.
 */
function shapes (doc, order) {
  const out = new Map()
  for (const sid of order) {
    const vs = doc.sectors[sid].verts
    let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity
    for (const v of vs) { const x = I(v.x); const y = I(v.y); if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y }
    out.set(sid, { x0, y0, x1, y1, area: Math.abs(area2(vs)) })
  }
  return out
}

/** The sector immediately containing s, or null. Smallest by area wins. */
function parentOf (doc, s, order, geo = shapes(doc, [...order, s.id])) {
  let best = null
  let bestArea = Infinity
  const g = geo.get(s.id)
  const mine = g.area
  for (const oid of order) {
    if (oid === s.id) continue
    const go = geo.get(oid)
    if (go.area <= mine || go.area >= bestArea) continue
    // a room that holds s holds its box
    if (go.x0 > g.x0 || go.y0 > g.y0 || go.x1 < g.x1 || go.y1 < g.y1) continue
    const o = doc.sectors[oid]
    if (s.verts.every((v) => classify(o.verts, I(v.x), I(v.y)) >= 0)) { best = o; bestArea = go.area }
  }
  return best
}

/**
 * The sectors s overlaps without either holding the other: a corner of one
 * strictly inside the other, both ways, leaving out the rooms s holds whole.
 * ponytail: corners only; a cross with no corner inside the other (an X of
 * two thin strips) is not seen -- add edge crossings if that shape matters.
 */
function overlapping (doc, s, order, geo = shapes(doc, [...order, s.id])) {
  const out = []
  const g = geo.get(s.id)
  for (const oid of order) {
    if (oid === s.id) continue
    // a corner strictly inside the other is inside its box: boxes that only meet, or miss, cannot overlap
    const go = geo.get(oid)
    if (go.x1 <= g.x0 || go.x0 >= g.x1 || go.y1 <= g.y0 || go.y0 >= g.y1) continue
    const o = doc.sectors[oid]
    const mineIn = s.verts.some((v) => classify(o.verts, I(v.x), I(v.y)) > 0)
    const theirsIn = o.verts.filter((v) => classify(s.verts, I(v.x), I(v.y)) > 0).length
    if (theirsIn === o.verts.length) continue        // a room inside s: s holds it
    if (mineIn || theirsIn) out.push(o)
  }
  return out
}

/**
 * Work out what every edge is. Pure: reads the document, returns
 *
 *   { sectors: [{ id, ..., verts: [{ x, y, kind, neighbor, edge }],
 *                 holes: [[{ x, y, kind: 'neighbor', neighbor, edge }]] }],
 *     parents: { [sectorId]: parentId },
 *     kinds:   { [sectorId]: 'platform' | 'cut' | null },
 *     warnings: [{ sector, msg }] }
 *
 * in document order, ready for mapfmt.emitMap. `kind` is 'wall' | 'open' |
 * 'neighbor'; `neighbor` is a sector id; `edge` is the document's edge
 * object (a hole rim mirrors the nested sector's edge, textures and all).
 */
/** Each side's kind by its edge id -- 'wall' (solid), 'neighbor' (an opening into a room) or 'open'. */
export function sideKinds (doc) {
  const out = new Map()
  for (const s of derive(doc).sectors) for (const v of s.verts) out.set(v.edge.id, v.kind)
  return out
}

/**
 * A WALL THAT BECAME AN OPENING into a room drawn over it (`before` is
 * sideKinds from before the drawing) keeps no middle texture -- it would brick
 * the doorway up -- but keeps it aside, in `middleWas`, for restoreWalls.
 */
export function openWalls (doc, before) {
  for (const [id, kind] of sideKinds(doc)) {
    if (kind !== 'neighbor' || before.get(id) === 'neighbor') continue
    for (const sec of Object.values(doc.sectors)) {
      for (const v of sec.verts) if (v.edge.id === id) { if (v.edge.middle) v.edge.middleWas = v.edge.middle; v.edge.middle = null }
    }
  }
}

/**
 * ...and once it is a solid wall again (the room over it deleted, or made an
 * effect area, which opens nothing) it takes its middle back. A wall keeps no
 * `middleWas`, so a middle cleared on a wall stays cleared.
 */
export function restoreWalls (doc) {
  const kept = Object.values(doc.sectors).flatMap((s) => s.verts).filter((v) => v.edge.middleWas !== undefined)
  if (!kept.length) return
  const kinds = sideKinds(doc)
  for (const v of kept) {
    if (kinds.get(v.edge.id) !== 'wall') continue
    v.edge.middle ??= v.edge.middleWas
    delete v.edge.middleWas
  }
}

export function derive (doc) {
  const warnings = []
  const order = doc.order.filter((sid) => doc.sectors[sid]?.verts.length >= 3)
  // the rooms: what the topology is made of (an effect sector lies over them)
  const rooms = order.filter((sid) => !isEffect(doc.sectors[sid]))

  // Reversed-edge lookup: "x1,y1>x2,y2" -> { sid, edge }
  const byEdge = new Map()
  for (const sid of rooms) {
    const s = doc.sectors[sid]
    s.verts.forEach((v, i) => {
      const q = s.verts[(i + 1) % s.verts.length]
      byEdge.set(`${I(v.x)},${I(v.y)}>${I(q.x)},${I(q.y)}`, { sid, edge: v.edge })
    })
  }

  // What a sector's unmatched edges are. Inside another sector, 'auto' reads
  // the floor heights: higher is a platform standing on the floor, lower or
  // level is cut into it. A sector set to 'platform' is one WHEREVER it is --
  // a floating platform in the void (maps/void.map) has no container and
  // open edges all round. 'cut' means nothing without a container.
  const parents = {}
  const kinds = {}
  const geo = shapes(doc, rooms)
  for (const sid of order) {
    const s = doc.sectors[sid]
    if (isEffect(s)) { parents[sid] = null; kinds[sid] = 'effect'; continue }
    const p = parentOf(doc, s, rooms, geo)
    parents[sid] = p ? p.id : null
    // ACROSS A BORDER: an 'auto' sector inside no single room, over two or
    // more, is a platform when its floor is above every room it reaches over
    // (mapc takes that partial overlap since engine 8c813aa). A level or sunk
    // one stays as it was, and mapc says why.
    const over = p || s.kind !== 'auto' ? [] : overlapping(doc, s, rooms, geo)
    kinds[sid] = s.kind === 'auto' ? (p ? (s.floor > p.floor ? 'platform' : 'cut') : over.length && over.every((o) => s.floor > o.floor) ? 'platform' : null)
      : s.kind === 'cut' && !p ? null : s.kind
    if (p && s.verts.some((v) => classify(p.verts, I(v.x), I(v.y)) === 0)) {
      warnings.push({ sector: sid, msg: `touches the boundary of ${p.id}, which it sits inside; mapc refuses that -- move it inward` })
    }
  }

  const holesOf = {}
  for (const sid of order) if (kinds[sid] === 'cut') (holesOf[parents[sid]] ??= []).push(sid)

  const sectors = order.map((sid) => {
    const s = doc.sectors[sid]
    const n = s.verts.length
    const verts = s.verts.map((v, i) => {
      const q = s.verts[(i + 1) % n]
      // an effect sector's corners are plain: no wall, no opening, no neighbour
      if (kinds[sid] === 'effect') return { x: v.x, y: v.y, kind: 'effect', neighbor: null, edge: v.edge }
      const twin = byEdge.get(`${I(q.x)},${I(q.y)}>${I(v.x)},${I(v.y)}`)
      let kind = 'wall'
      let neighbor = null
      if (twin) { kind = 'neighbor'; neighbor = twin.sid }
      else if (kinds[sid] === 'platform') kind = 'open'
      else if (kinds[sid] === 'cut') { kind = 'neighbor'; neighbor = parents[sid] }
      // An outer side the author opened: the room ends there (a ledge), which
      // is how a map meets the next one on the metamap.
      else if (v.edge.force === 'open') kind = 'open'
      // A forced wall is a wall from both sides: a door you can open from
      // one room and not the other is a bug, not a feature.
      if (v.edge.force === 'wall' || (twin && twin.edge.force === 'wall')) { kind = 'wall'; neighbor = null }
      return { x: v.x, y: v.y, kind, neighbor, edge: v.edge }
    })
    // The container's hole: the nested sector's outline reversed (clockwise,
    // which is how the store keeps a hole). Hole corner j is the nested
    // sector's corner n-1-j, and the rim side leaving it is the reverse of
    // the nested sector's edge that starts at corner n-2-j.
    const holes = (holesOf[sid] ?? []).map((cid) => {
      const c = doc.sectors[cid]
      const m = c.verts.length
      return c.verts.map((_, j) => {
        const corner = c.verts[m - 1 - j]
        const mirrored = c.verts[(2 * m - 2 - j) % m].edge
        return { x: corner.x, y: corner.y, kind: 'neighbor', neighbor: cid, edge: mirrored }
      })
    })
    if (holes.length > 1) {
      // Two cuts that share an edge make two holes that touch, which the
      // triangulator bridges wrongly. Said here rather than found in play.
      const rims = new Set()
      for (const h of holes) {
        for (let j = 0; j < h.length; j++) {
          const a = h[j]; const b = h[(j + 1) % h.length]
          const k = `${I(b.x)},${I(b.y)}>${I(a.x)},${I(a.y)}`
          if (rims.has(k)) warnings.push({ sector: sid, msg: 'two cut sectors inside it share an edge; merge them into one cut' })
          rims.add(`${I(a.x)},${I(a.y)}>${I(b.x)},${I(b.y)}`)
        }
      }
    }
    return { id: sid, effect: kinds[sid] === 'effect', liquid: kinds[sid] === 'effect' && !!s.liquid, floor: s.floor, ceil: s.ceil, tag: s.tag, light: s.light, thickness: s.thickness,
             floorTex: s.floorTex, ceilTex: s.ceilTex,
             // How each flat is painted travels with the sector: the emitter
             // writes from what derive hands it, so a style left behind here
             // is a style the author set and the map never says.
             floorStyle: s.floorStyle, ceilStyle: s.ceilStyle,
             // Its weather and fog (docs/SECTOR_FX.md), likewise.
             fx: s.fx,
             verts, holes }
  })

  return { sectors, parents, kinds, warnings }
}

// --- snapping to what is already drawn -------------------------------------------
//
// A corner tapped near another room's corner IS that corner, and one tapped
// near its wall lands exactly on the wall -- exactly, in grid integers, or
// mapc's collinearity test says "not on it" and no wall is shared. On a
// diagonal wall the points that are exactly on it are a lattice (every gcd-th
// step of the wall's run), so the nearest such point is offered; a wall too
// steep to have one nearby simply does not snap.

const gcd = (a, b) => { a = Math.abs(a); b = Math.abs(b); while (b) { [a, b] = [b, a % b] } return a }

/** The nearest corner of any sector (but `except`) within `tolerance` units, or null. */
export function nearestCorner (doc, x, y, tolerance, except = null) {
  let best = null
  for (const sid of doc.order) {
    if (sid === except) continue
    for (const v of doc.sectors[sid].verts) {
      const d = Math.hypot(v.x - x, v.y - y)
      if (d <= tolerance && (!best || d < best.d)) best = { x: v.x, y: v.y, d, sector: sid, vert: v.id }
    }
  }
  return best
}

/** The nearest exactly-on-a-wall point of any sector (but `except`) within `tolerance`, or null. */
export function nearestEdgePoint (doc, x, y, tolerance, except = null) {
  let best = null
  const px = I(x); const py = I(y)
  for (const sid of doc.order) {
    if (sid === except) continue
    const s = doc.sectors[sid]
    for (let i = 0; i < s.verts.length; i++) {
      const a = s.verts[i]; const b = s.verts[(i + 1) % s.verts.length]
      const ax = I(a.x); const ay = I(a.y); const dx = I(b.x) - ax; const dy = I(b.y) - ay
      const g = gcd(dx, dy)
      if (g === 0) continue
      const len2 = dx * dx + dy * dy
      const t = ((px - ax) * dx + (py - ay) * dy) / len2
      const k = Math.max(0, Math.min(g, Math.round(t * g)))
      const qx = ax + k * (dx / g); const qy = ay + k * (dy / g)
      const d = Math.hypot(qx - px, qy - py) / RES
      if (d <= tolerance && (!best || d < best.d)) best = { x: qx / RES, y: qy / RES, d, sector: sid, edge: a.edge.id }
    }
  }
  return best
}

/**
 * Where a tapped point goes: another room's corner if one is within
 * `tolerance`, else exactly onto its wall, else onto the grid.
 * Returns { x, y, kind: 'corner' | 'edge' | 'grid' }.
 */
export function snapToMap (doc, x, y, { tolerance, grid = doc.grid, except = null } = {}) {
  const c = nearestCorner(doc, x, y, tolerance, except)
  if (c) return { x: c.x, y: c.y, kind: 'corner' }
  const e = nearestEdgePoint(doc, x, y, tolerance, except)
  if (e) return { x: e.x, y: e.y, kind: 'edge' }
  return { x: snap(x, grid), y: snap(y, grid), kind: 'grid' }
}

/** Which sector's floor is under (x, y): the smallest containing one, or null. */
export function sectorAt (doc, x, y) {
  let best = null
  let bestArea = Infinity
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    // the room under a point: an effect sector is nobody's floor
    if (s.verts.length < 3 || isEffect(s)) continue
    if (classify(s.verts, I(x), I(y)) < 0) continue
    const a = Math.abs(area2(s.verts))
    if (a < bestArea) { best = s; bestArea = a }
  }
  return best
}
