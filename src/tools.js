//
// What a tap or a drag does, per tool.
//
// Pure functions of the studio state and a gesture, returning nothing: they
// change the document and call back into main.js (`S.commit`, `S.select`,
// `S.redraw`, `S.previewNow`). Everything that must be exact -- snapping,
// which sector is under a point -- is done in document space; the viewport
// only turns pixels into ground coordinates and back.
//
import { addSector, addSpawn, addLight, addEntity, addPathPoint, snap, newId, newEdge } from './doc.js'
import { sectorAt, snapToMap } from './topology.js'

const HIT_PX = 14
const CLOSE_PX = 18
const SNAP_PX = 16

/**
 * Where a corner goes: onto another room's corner or wall when one is within
 * SNAP_PX on screen (so rooms connect and walls are shared), else onto the
 * grid. `except` keeps a dragged corner from snapping to its own room.
 */
export function snapAt (S, x, y, z = 0, except = null) {
  return snapToMap(S.doc, x, y, { tolerance: SNAP_PX * S.viewport.worldPerPixel(z), except })
}

export function groundAt (S, info, z) {
  return S.viewport.groundPoint(info.x, info.y, z ?? S.workZ())
}

/**
 * The edge under a screen point (within HIT_PX), or null.
 *
 * A SHARED WALL IS TWO EDGES in the same place, one per room, and "the
 * nearest" would always be the first room's. So among the edges that tie,
 * the tap's side decides -- tap the wall from inside the room whose side you
 * mean -- and tapping the wall that is already selected flips to the other
 * side. The selected room's edge wins a tap exactly on the line.
 */
function edgeUnder (S, info) {
  const doc = S.doc
  const cands = []
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    for (let i = 0; i < s.verts.length; i++) {
      const a = s.verts[i]; const b = s.verts[(i + 1) % s.verts.length]
      // The closest point on the edge to the tapped ground point, then its
      // screen distance -- so the tolerance is in pixels at any zoom.
      const g = groundAt(S, info, s.floor)
      if (!g) continue
      const dx = b.x - a.x; const dy = b.y - a.y
      const len2 = dx * dx + dy * dy || 1
      const t = Math.max(0, Math.min(1, ((g.x - a.x) * dx + (g.y - a.y) * dy) / len2))
      const px = a.x + t * dx; const py = a.y + t * dy
      const d = S.viewport.screenDistance(info.x, info.y, px, py, s.floor)
      if (d < HIT_PX) cands.push({ d, sector: s, i, edge: a.edge })
    }
  }
  if (!cands.length) return null
  cands.sort((p, q) => p.d - q.d)
  const ties = cands.filter((c) => c.d - cands[0].d < 2)
  if (ties.length === 1) return ties[0]
  const k = S.selection?.kind === 'edge' ? ties.findIndex((c) => c.edge.id === S.selection.id) : -1
  if (k >= 0) return ties[(k + 1) % ties.length]
  const g = groundAt(S, info, 0)
  const under = g ? sectorAt(doc, g.x, g.y) : null
  return ties.find((c) => c.sector.id === under?.id) ??
         ties.find((c) => c.sector.id === (S.selection?.kind === 'sector' ? S.selection.id : S.selection?.sectorId)) ??
         ties[0]
}

/** The edge in another sector running the other way along this one, with its sector, or null. */
export function otherSide (S, edgeId) {
  const doc = S.doc
  for (const sid of doc.order) {
    const s = doc.sectors[sid]
    for (let i = 0; i < s.verts.length; i++) if (s.verts[i].edge.id === edgeId) {
      const a = s.verts[i]; const b = s.verts[(i + 1) % s.verts.length]
      for (const oid of doc.order) {
        if (oid === sid) continue
        const o = doc.sectors[oid]
        for (let j = 0; j < o.verts.length; j++) {
          const w = o.verts[j]; const r = o.verts[(j + 1) % o.verts.length]
          if (w.x === b.x && w.y === b.y && r.x === a.x && r.y === a.y) return { kind: 'edge', id: w.edge.id, sectorId: oid }
        }
      }
      return null
    }
  }
  return null
}

/** What is under a screen point, in priority: furniture, edge, sector. */
export function hitTest (S, info) {
  const f = S.viewport.pickFurniture(info.x, info.y)
  if (f) {
    if (f.kind === 'vertex') {
      const sec = S.selection?.kind === 'sector' ? S.doc.sectors[S.selection.id]
        : S.selection?.sectorId ? S.doc.sectors[S.selection.sectorId] : null
      return { kind: 'vertex', id: f.id, sectorId: sec?.id }
    }
    return { kind: f.kind, id: f.id }
  }
  const e = edgeUnder(S, info)
  if (e) return { kind: 'edge', id: e.edge.id, sectorId: e.sector.id }
  const g = groundAt(S, info, 0)
  const s = g ? sectorAt(S.doc, g.x, g.y) : null
  if (s) return { kind: 'sector', id: s.id }
  return null
}

export function onTap (S, info) {
  if (S.pick) {
    // A POINT: wherever the floor is tapped, on the grid, at that room's floor.
    if (S.pick.kinds.includes('point')) {
      const g0 = groundAt(S, info, 0)
      const room = g0 ? sectorAt(S.doc, g0.x, g0.y) : null
      const g = room ? groundAt(S, info, room.floor) ?? g0 : g0
      if (g) {
        const step = S.doc.grid || 0.25
        const snapTo = (v) => Math.round(v / step) * step
        const p = S.pick; S.pick = null; S.redraw()
        p.resolve({ kind: 'point', x: snapTo(g.x), y: snapTo(g.y), z: room?.floor ?? 0, sectorId: room?.id ?? null })
        return
      }
    }
    const hit = hitTest(S, info)
    if (hit && S.pick.kinds.includes(hit.kind)) { const p = S.pick; S.pick = null; S.redraw(); p.resolve(hit); return }
    S.status(`tap ${S.pick.kinds.join(' or ')}`, 'warn')
    return
  }
  switch (S.tool) {
    case 'select': {
      const hit = hitTest(S, info)
      // Tapping a corner of the selected sector selects the corner; tapping
      // the sector again keeps it (and reopens its sheet).
      S.select(hit)
      return
    }
    case 'room': return roomTap(S, info)
    case 'path': return pathTap(S, info)
    case 'place': return placeTap(S, info)
    case 'trigger': {
      const hit = hitTest(S, info)
      if (hit && (hit.kind === 'edge' || hit.kind === 'sector')) S.select(hit)
      return
    }
  }
}

function roomTap (S, info) {
  const g = groundAt(S, info, S.workZ())
  if (!g) return
  const { x, y } = snapAt(S, g.x, g.y, S.workZ())
  const d = S.draw
  if (d.corners.length >= 3) {
    const first = d.corners[0]
    if (S.viewport.screenDistance(info.x, info.y, first.x, first.y, S.workZ()) < CLOSE_PX) { finishRoom(S); return }
  }
  if (d.corners.some((c) => c.x === x && c.y === y)) return
  d.corners.push({ x, y })
  S.redraw()
}

/**
 * Another point on the camera path being edited, at the end of it.
 *
 * On the WORK plane, not the floor: a camera path is usually above head
 * height, and a point dropped on the floor of the room below is a shot through
 * the carpet. The height comes from the path's last point, so a path stays at
 * the height it was started at.
 */
/**
 * THE WAYPOINT UNDER A FINGER: the nearest of the edited path's points within
 * reach on screen -- its handle, or the number drawn above it, which is what a
 * person actually aims at. The handle alone is a box a few pixels wide, and a
 * tap that missed it used to drop a new waypoint on top of the old one.
 */
const PATH_REACH_PX = 30
export function pathPointAt (S, info) {
  const p = S.editedPath?.()
  if (!p) return null
  const lift = 0.6 + S.viewport.viewHeight / 44          // the number's badge: z + 0.6, half its height up
  let best = null; let bestD = PATH_REACH_PX
  for (const pt of p.points) {
    const d = Math.min(S.viewport.screenDistance(info.x, info.y, pt.x, pt.y, pt.z),
                       S.viewport.screenDistance(info.x, info.y, pt.x, pt.y, pt.z + lift))
    if (d < bestD) { bestD = d; best = pt }
  }
  return best
}

function pathTap (S, info) {
  const p = S.editedPath()
  if (!p) { S.status('no camera path being edited', 'warn'); return }
  // A TAP ON A POINT PICKS IT rather than dropping a second one on top of it,
  // which is what a tap there used to do -- and the height of the one you
  // picked is what the sheet then edits.
  const hit = pathPointAt(S, info)
  if (hit) { S.selectPathPoint(hit.id); return }
  // At the height of the point last worked on, or of the last one placed: a
  // camera path is usually above head height, and a point dropped on the floor
  // of the room below is a shot through the carpet.
  const sel = p.points.find((q) => q.id === S.pathPointSel)
  const z = sel ? sel.z : (p.points.length ? p.points[p.points.length - 1].z : S.workZ())
  const g = groundAt(S, info, z)
  if (!g) return
  const pt = addPathPoint(S.doc, p, snap(g.x, 1 / 8), snap(g.y, 1 / 8), z)
  S.selectPathPoint(pt.id, { quiet: true })
  S.commit()
}

export function finishRoom (S) {
  const d = S.draw
  if (d.corners.length < 3) { S.status('a room needs at least three corners', 'warn'); return }
  S.ensureRoomStyle()
  const s = addSector(S.doc, d.corners, { ...S.style.sector }, { ...S.style.edge })
  d.corners = []
  S.select({ kind: 'sector', id: s.id })
  S.commit()
}

export function cancelRoom (S) {
  S.draw.corners = []
  S.draw.rect = null
  S.redraw()
}

function placeTap (S, info) {
  const armed = S.place
  if (!armed) { S.status('pick something to place first', 'warn'); S.openPalette(); return }
  const g = groundAt(S, info, 0)
  if (!g) return
  const sec = sectorAt(S.doc, g.x, g.y)
  const x = snap(g.x, 1 / 8); const y = snap(g.y, 1 / 8)
  const z = sec ? sec.floor : 0
  let sel = null
  if (armed.kind === 'spawn') sel = { kind: 'spawn', id: addSpawn(S.doc, armed.name, x, y, z).id }
  else if (armed.kind === 'light') sel = { kind: 'light', id: addLight(S.doc, x, y, z + 2).id }
  else sel = { kind: 'entity', id: addEntity(S.doc, armed.kind, armed.name, x, y, z).id }
  S.commit()
  S.select(sel, { quiet: true })
}

// --- drags ---------------------------------------------------------------------------

export function onDragStart (S, info) {
  S.drag = null
  // A drag is recognised only once the pointer has moved past the tap slop, so
  // what is under it NOW is a few pixels from what the finger went down on --
  // enough to miss a corner handle and catch the wall beside it. Everything
  // here is asked at the down position.
  info = { ...info, x: info.startX, y: info.startY }
  if (S.tool === 'room') {
    // Dragging draws a rectangle; tapping draws corners. Both are rooms.
    if (S.draw.corners.length === 0) {
      const g = groundAt(S, info, S.workZ())
      if (g) { const p = snapAt(S, g.x, g.y, S.workZ()); S.draw.rect = { x0: p.x, y0: p.y, x1: p.x, y1: p.y } }
      return
    }
    S.drag = { kind: 'pan', last: { x: info.x, y: info.y } }
    return
  }
  // A path point is dragged with the path tool, where a tap would otherwise
  // add a point on top of it.
  if (S.tool === 'path') {
    const pt = pathPointAt(S, info)
    if (pt) { S.selectPathPoint(pt.id, { quiet: true }); S.drag = { kind: 'pathpoint', pt, start: { x: pt.x, y: pt.y }, from: groundAt(S, info, pt.z) } }
    else S.drag = { kind: 'pan', last: { x: info.x, y: info.y } }
    return
  }
  const hit = S.tool === 'select' ? hitTest(S, info) : null
  const g = groundAt(S, info, 0)
  if (hit?.kind === 'vertex' && hit.sectorId) {
    const s = S.doc.sectors[hit.sectorId]
    const v = s.verts.find((x) => x.id === hit.id)
    S.drag = { kind: 'vertex', v, s, start: { x: v.x, y: v.y }, from: groundAt(S, info, s.floor) }
    S.select(hit, { quiet: true })
  } else if (hit && (hit.kind === 'entity' || hit.kind === 'spawn' || hit.kind === 'light')) {
    const list = hit.kind === 'entity' ? S.doc.entities : hit.kind === 'spawn' ? S.doc.spawns : S.doc.lights
    const e = list.find((x) => x.id === hit.id)
    S.drag = { kind: 'thing', e, start: { x: e.x, y: e.y }, from: g }
    S.select(hit, { quiet: true })
  } else if (hit?.kind === 'sector' && S.selection?.kind === 'sector' && S.selection.id === hit.id) {
    const s = S.doc.sectors[hit.id]
    S.drag = { kind: 'sector', s, start: s.verts.map((v) => ({ x: v.x, y: v.y })), from: groundAt(S, info, s.floor) }
  } else {
    S.drag = { kind: 'pan', last: { x: info.x, y: info.y } }
  }
}

export function onDrag (S, info) {
  const d = S.drag
  if (S.tool === 'room' && S.draw.rect) {
    const g = groundAt(S, info, S.workZ())
    if (g) { const p = snapAt(S, g.x, g.y, S.workZ()); S.draw.rect.x1 = p.x; S.draw.rect.y1 = p.y; S.redraw() }
    return
  }
  if (!d) return
  if (d.kind === 'pan') {
    S.viewport.panBy(info.x - d.last.x, info.y - d.last.y)
    d.last = { x: info.x, y: info.y }
    return
  }
  const z = d.kind === 'vertex' || d.kind === 'sector' ? d.s.floor : d.kind === 'pathpoint' ? d.pt.z : 0
  const g = groundAt(S, info, z)
  if (!g || !d.from) return
  const dx = g.x - d.from.x; const dy = g.y - d.from.y
  if (d.kind === 'vertex') {
    // A corner dragged onto another room's corner or wall joins it.
    const p = snapAt(S, d.start.x + dx, d.start.y + dy, d.s.floor, d.s.id)
    d.v.x = p.x; d.v.y = p.y
  } else if (d.kind === 'sector') {
    const sx = snap(dx, S.doc.grid); const sy = snap(dy, S.doc.grid)
    d.s.verts.forEach((v, i) => { v.x = d.start[i].x + sx; v.y = d.start[i].y + sy })
  } else if (d.kind === 'thing') {
    d.e.x = snap(d.start.x + dx, 1 / 8); d.e.y = snap(d.start.y + dy, 1 / 8)
  } else if (d.kind === 'pathpoint') {
    d.pt.x = snap(d.start.x + dx, 1 / 8); d.pt.y = snap(d.start.y + dy, 1 / 8)
  }
  S.redraw()
  // Reshape the one sector on the loaded map; a bake only when that cannot
  // apply (no good bake yet, or the outline cannot be meshed).
  if (d.kind === 'vertex' || d.kind === 'sector') { if (!S.previewDrag(d.s.id)) S.previewNow() }
}

export function onDragEnd (S, info, cancelled) {
  if (S.tool === 'room' && S.draw.rect) {
    const r = S.draw.rect
    S.draw.rect = null
    if (!cancelled && r.x0 !== r.x1 && r.y0 !== r.y1) {
      const x0 = Math.min(r.x0, r.x1); const x1 = Math.max(r.x0, r.x1)
      const y0 = Math.min(r.y0, r.y1); const y1 = Math.max(r.y0, r.y1)
      S.ensureRoomStyle()
      const s = addSector(S.doc, [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }], { ...S.style.sector }, { ...S.style.edge })
      S.select({ kind: 'sector', id: s.id })
      S.commit()
    } else S.redraw()
    return
  }
  const d = S.drag
  S.drag = null
  if (!d || d.kind === 'pan') return
  if (cancelled) {
    if (d.kind === 'vertex') { d.v.x = d.start.x; d.v.y = d.start.y }
    else if (d.kind === 'sector') d.s.verts.forEach((v, i) => { v.x = d.start[i].x; v.y = d.start[i].y })
    else if (d.kind === 'thing') { d.e.x = d.start.x; d.e.y = d.start.y }
    else if (d.kind === 'pathpoint') { d.pt.x = d.start.x; d.pt.y = d.start.y }
    S.redraw(); S.previewNow()
    return
  }
  if (d.kind === 'thing') {
    // A thing dropped on a floor sits on it.
    const sec = sectorAt(S.doc, d.e.x, d.e.y)
    if (sec && 'dormant' in d.e) d.e.z = sec.floor
  }
  S.commit()
}

export function onLongPress (S, info) {
  // A path's point is removed by holding it, the way a sector's corner is.
  if (S.tool === 'path') {
    const pt = pathPointAt(S, info)
    const p = S.editedPath()
    if (pt && p) {
      p.points = p.points.filter((x) => x !== pt)
      if (S.pathPointSel === pt.id) S.pathPointSel = null
      S.commit()
    }
    return
  }
  const hit = hitTest(S, info)
  if (!hit) return
  if (hit.kind === 'vertex' && hit.sectorId) {
    const s = S.doc.sectors[hit.sectorId]
    if (s.verts.length <= 3) { S.status('a sector needs three corners', 'warn'); return }
    s.verts = s.verts.filter((v) => v.id !== hit.id)
    S.select({ kind: 'sector', id: s.id })
    S.commit()
    return
  }
  if (hit.kind === 'edge') {
    // A new corner in the middle of the wall, ready to drag.
    const s = S.doc.sectors[hit.sectorId]
    const i = s.verts.findIndex((v) => v.edge.id === hit.id)
    const a = s.verts[i]; const b = s.verts[(i + 1) % s.verts.length]
    const { id: _cut, ...attrs } = a.edge
    const v = { id: newId(S.doc, 'v'), x: snap((a.x + b.x) / 2, S.doc.grid), y: snap((a.y + b.y) / 2, S.doc.grid),
                edge: newEdge(S.doc, { ...attrs, flags: { ...a.edge.flags } }) }
    s.verts.splice(i + 1, 0, v)
    S.select({ kind: 'vertex', id: v.id, sectorId: s.id })
    S.commit()
    return
  }
  S.select(hit)
}
