//
// SEVERAL ROOMS AT ONCE: what the map editor does to a selection of rooms --
// move, copy, paste, duplicate, turn, mirror -- on the document. Pure: the
// editor (tools.js, main.js) calls these and commits.
//
// A room takes what is IN it: the rooms nested inside (a pit, a platform:
// left behind they would sit in nothing) and the monsters, props and lights
// standing on it. Start spawns stay where they are -- a copy of the start is
// a second start -- and so do triggers, which name the rooms they were made
// for; a copy is a room with its walls and looks, and no tag.
//
import { addSector, newEdge, newId, snap } from './doc.js'
import { derive, sectorAt } from './topology.js'

/** The rooms named, and every room nested inside one of them. */
export function withInner (doc, ids) {
  const want = new Set(ids.filter((id) => doc.sectors[id]))
  const { parents } = derive(doc)
  for (let more = true; more;) {
    more = false
    for (const sid of doc.order) if (!want.has(sid) && want.has(parents[sid])) { want.add(sid); more = true }
  }
  return doc.order.filter((sid) => want.has(sid))
}

/** The things standing in those rooms: { entities, lights, spawns }, by the smallest room under each. */
export function thingsIn (doc, ids) {
  const set = new Set(ids)
  const inside = (t) => set.has(sectorAt(doc, t.x, t.y)?.id)
  return { entities: doc.entities.filter(inside), lights: doc.lights.filter(inside), spawns: doc.spawns.filter(inside) }
}

/** The middle of the rooms' corners' box: what they turn and mirror about, and paste around. */
export function middleOf (doc, ids) {
  const pts = ids.flatMap((id) => doc.sectors[id]?.verts ?? [])
  if (!pts.length) return { x: 0, y: 0 }
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y)
  return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 }
}

const roomless = (s) => { const { id: _i, verts: _v, tag: _t, ...rest } = s; return rest }
const edgeless = (e) => { const { id: _i, ...rest } = e; return rest }
const thingless = (t) => { const { id: _i, ...rest } = t; return rest }

/** A copy of the rooms (and what is in them), to paste anywhere, on this map or another. Plain JSON. */
export function copyRooms (doc, ids) {
  const all = withInner(doc, ids)
  const { entities, lights } = thingsIn(doc, all)
  return JSON.parse(JSON.stringify({
    rooms: all.map((id) => { const s = doc.sectors[id]; return { ...roomless(s), corners: s.verts.map((v) => ({ x: v.x, y: v.y, edge: edgeless(v.edge) })) } }),
    entities: entities.map(thingless), lights: lights.map(thingless),
    middle: middleOf(doc, all)
  }))
}

/**
 * Put a copy into the document, moved by (dx, dy): new rooms, walls and
 * things, every id fresh. Returns the new rooms' ids (the outer ones first,
 * as copied).
 */
export function pasteRooms (doc, clip, dx = 0, dy = 0) {
  const ids = []
  for (const r of clip?.rooms ?? []) {
    const { corners, ...attrs } = r
    const s = addSector(doc, corners.map((c) => ({ x: c.x + dx, y: c.y + dy })), structuredClone(attrs))
    s.verts.forEach((v, i) => { const e = corners[i].edge; v.edge = newEdge(doc, { ...structuredClone(e), flags: { ...(e?.flags ?? {}) } }) })
    ids.push(s.id)
  }
  for (const e of clip?.entities ?? []) doc.entities.push({ ...structuredClone(e), id: newId(doc, 'n'), x: e.x + dx, y: e.y + dy })
  for (const l of clip?.lights ?? []) doc.lights.push({ ...structuredClone(l), id: newId(doc, 'l'), x: l.x + dx, y: l.y + dy })
  return ids
}

/** Move the rooms (with what is inside them) by (dx, dy). Returns what moved. */
export function moveRooms (doc, ids, dx, dy) {
  const all = withInner(doc, ids)
  const { entities, lights, spawns } = thingsIn(doc, all)
  for (const id of all) for (const v of doc.sectors[id].verts) { v.x += dx; v.y += dy }
  for (const t of [...entities, ...lights, ...spawns]) { t.x += dx; t.y += dy }
  return all
}

/**
 * Turn the rooms a quarter turn (counter-clockwise; -1 the other way) about
 * their middle, on the grid; or mirror them left to right (`mirror`). What is
 * in them turns with them, monsters' facings too. A mirrored outline winds
 * the other way: normalize() puts it right, walls and all.
 */
export function turnRooms (doc, ids, { quarter = 1, mirror = false, grid = doc.grid ?? 0.25 } = {}) {
  const all = withInner(doc, ids)
  const things = thingsIn(doc, all)
  const m = middleOf(doc, all)
  const c = { x: snap(m.x, grid), y: snap(m.y, grid) }
  const move = (p) => {
    const x = p.x - c.x; const y = p.y - c.y
    if (mirror) { p.x = c.x - x; return }
    if (quarter === 1) { p.x = c.x - y; p.y = c.y + x } else { p.x = c.x + y; p.y = c.y - x }
  }
  for (const id of all) for (const v of doc.sectors[id].verts) move(v)
  for (const t of [...things.entities, ...things.lights, ...things.spawns]) move(t)
  const turn = (a) => ((a % 360) + 360) % 360
  for (const e of things.entities) e.angle = turn(mirror ? 180 - (e.angle ?? 0) : (e.angle ?? 0) + (quarter === 1 ? 90 : -90))
  return all
}
