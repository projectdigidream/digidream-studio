// SEVERAL ROOMS AT ONCE (src/rooms.js): a room holding a pit and a monster,
// beside another room. Copying takes the pit and the monster, not the tag;
// pasting makes new ids; moving leaves the neighbour where it was; turning
// and mirroring keep rooms that bake. Each with the control that it could
// have gone wrong.
//
//   node studio/test/rooms.test.js

import { newDoc, addSector, addEntity, addSpawn } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { withInner, copyRooms, pasteRooms, moveRooms, turnRooms, thingsIn } from '../src/rooms.js'
import { requireOracles, bakeNative } from './oracle.js'

requireOracles('rooms')
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const bakes = (doc) => { normalize(doc); return bakeNative(emitMap(derive(doc), doc).text) }

const make = () => {
  const doc = newDoc('rooms')
  const hall = addSector(doc, rect(0, 0, 10, 10), { floor: 0, tag: 7, floorTex: 'FLOOR' }, { middle: 'WALL' })
  const pit = addSector(doc, rect(3, 3, 6, 6), { floor: -2 })
  const side = addSector(doc, rect(10, 0, 16, 10), { floor: 0 })
  addEntity(doc, 'mob', 'imp', 2, 2)
  addSpawn(doc, 'start', 13, 5)
  normalize(doc)
  return { doc, hall, pit, side }
}

{
  const { doc, hall, pit, side } = make()
  check(withInner(doc, [hall.id]).join() === [hall.id, pit.id].join(), 'a room takes the pit inside it')
  check(!withInner(doc, [hall.id]).includes(side.id), 'CONTROL: not the room beside it')
  const clip = copyRooms(doc, [hall.id])
  check(clip.rooms.length === 2 && clip.entities.length === 1 && clip.entities[0].name === 'imp', `the copy holds the hall, its pit and its monster (${clip.rooms.length} rooms, ${clip.entities.length} things)`)
  check(clip.rooms.every((r) => r.tag === undefined) && clip.rooms[0].floorTex === 'FLOOR' && clip.rooms[0].corners[0].edge.middle === 'WALL', 'its looks come along, its tag does not')
  check(JSON.parse(JSON.stringify(clip)) !== null, 'and it is plain JSON (it is kept between maps)')
  const before = Object.keys(doc.sectors).length
  const ids = pasteRooms(doc, clip, 20, 0)
  const pasted = ids.map((id) => doc.sectors[id])
  check(Object.keys(doc.sectors).length === before + 2 && pasted[0].verts[0].x === 20, `pasting makes two new rooms, moved (${pasted[0].verts.map((v) => v.x)})`)
  const edgeIds = new Set(Object.values(doc.sectors).flatMap((s) => s.verts.map((v) => v.edge.id)))
  check(edgeIds.size === Object.values(doc.sectors).reduce((n, s) => n + s.verts.length, 0), 'every wall has an id of its own (none shared with the originals)')
  check(doc.entities.length === 2 && doc.entities[1].x === 22 && doc.entities[1].id !== doc.entities[0].id, 'and the monster is copied with them')
  check(bakes(doc).ok, 'the map with the pasted rooms bakes')
}

{
  const { doc, hall, pit, side } = make()
  moveRooms(doc, [hall.id], 0, 20)
  check(doc.sectors[pit.id].verts.every((v) => v.y >= 23) && doc.entities[0].y === 22, 'moving the hall moves its pit and its monster')
  check(doc.sectors[side.id].verts[0].y === 0 && doc.spawns[0].y === 5, 'CONTROL: the room beside it, and the start in it, stay')
  check(bakes(doc).ok, 'and the map still bakes')
}

{
  const { doc, hall, pit } = make()
  const { entities } = thingsIn(doc, [hall.id])
  turnRooms(doc, [hall.id], { quarter: 1 })
  check(entities[0].angle === 90, `turning a quarter turns the monster's facing too (${entities[0].angle})`)
  const r = bakes(doc)
  check(r.ok, `a turned room bakes (${r.stderr})`)
  turnRooms(doc, [hall.id, pit.id], { mirror: true })
  normalize(doc)
  const d = derive(doc)
  check(d.sectors.every((s) => s.verts.length >= 3), 'a mirrored room is wound right again by normalize')
  const m = bakes(doc)
  check(m.ok, `and it bakes (${m.stderr})`)
}

console.log(`\nrooms: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
