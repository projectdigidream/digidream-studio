//
// What the studio writes as a map's Lua is what the trigger runtime accepts.
//
// ORACLE: build/lua/triggercheck -- the real runtime loading the real file,
// with the real vocabulary -- over every preset the studio offers, on a small
// map that has a room for each of them. The control removes the staleness
// guards the emitter writes beside every index, and the runtime must refuse
// the table: that refusal is the reason the guards exist.
//
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { newDoc, addSector, addSpawn, addEntity, addTrigger, validate } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { emitMapLua } from '../src/lua_emit.js'
import { Vocab } from '../src/vocab.js'
import { door, lift, switchFor, teleport, ambush, exit, crusher } from '../src/presets.js'
import { ROOT } from './oracle.js'

const TRIGGERCHECK = join(ROOT, 'build', 'lua', 'triggercheck')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const vocab = new Vocab(
  JSON.parse(readFileSync(join(ROOT, 'maps', 'scripts', 'trigger_vocab.json'), 'utf8')),
  JSON.parse(readFileSync(join(ROOT, 'maps', 'scripts', 'mob_vocab.json'), 'utf8')))

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

// A hall, a door, a second room, a lift into a third, and a pit to crush.
const doc = newDoc('presets')
const hall = addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' })
const doorS = addSector(doc, rect(16, 2, 18, 6), { floor: 0, ceil: 4 })
const room = addSector(doc, rect(18, 0, 26, 8))
const liftS = addSector(doc, rect(26, 2, 30, 6), { floor: 0, ceil: 8 })
const far = addSector(doc, rect(30, 0, 40, 8), { floor: -2, ceil: 8 })
const pit = addSector(doc, rect(4, 2, 8, 6), { floor: -1 })
addSpawn(doc, 'start', 2, 4)
addEntity(doc, 'prop', 'key_blue', 12, 4)
addEntity(doc, 'mob', 'spirit', 22, 4, 0, { dormant: true })
normalize(doc)

const edgeOf = (s, x0, y0) => s.verts.find((v) => v.x === x0 && v.y === y0).edge.id

const rd = door(doc, doorS.id)
check(rd.ok && rd.triggers.length === 5, `door: two portals give open/close each plus shut (${rd.triggers.length})`)
const rl = lift(doc, liftS.id)
check(rl.ok && rl.triggers.length === 4, `lift: raise, lower, two ways in (${rl.triggers.length})`)
const rs = switchFor(doc, edgeOf(hall, 0, 8), pit.id, { to: 'highest_neighbour_floor' })
check(rs.ok, 'switch on the hall wall raises the pit')
const rt = teleport(doc, edgeOf(room, 26, 0), 2, 4, 0)
check(rt.ok && rt.triggers.length === 1, `teleport on an outer wall has one direction (${rt.triggers.length})`)
const ra = ambush(doc, edgeOf(hall, 16, 2), 'spirit', 12, 6, 0)
check(ra.ok && ra.triggers.length === 2, `ambush on the door line fires from either side (${ra.triggers.length})`)
const rx = exit(doc, edgeOf(far, 40, 0))
check(rx.ok, 'exit switch on the far wall')
const rc = crusher(doc, edgeOf(hall, 16, 8), pit.id)
check(rc.ok, 'crusher switch')
const rNo = door(doc, far.id)
check(rNo.ok && rNo.triggers.length === 3, `a door with one neighbour opens from one side (${rNo.triggers.length})`)
const rBad = door(doc, 'nope')
check(!rBad.ok, 'a door on nothing is refused with a sentence')

check(vocab.validateTriggers(doc).length === 0, `the presets validate (${vocab.validateTriggers(doc).join(' | ')})`)
// Play and Export run the document validator first; a closed door (ceiling on
// the floor) is a map the engine bakes and the validator must not refuse.
check(validate(doc).length === 0, `the presets leave a document Play accepts (${validate(doc).map((p) => p.msg).join(' | ')})`)

const derived = derive(doc)
const emitted = emitMap(derived, doc)
const lua = emitMapLua(doc, emitted)
check(lua.problems.length === 0, `every reference resolved (${lua.problems.join(' | ')})`)
const sideIs = (lua.text.match(/c = "side_is"/g) ?? []).length
const guards = (lua.text.match(/expect_neighbour = -?\d+/g) ?? []).length
check(sideIs > 0 && sideIs === guards, `every side_is carries expect_neighbour (${sideIs} vs ${guards})`)
check(/dnp\.spawn_prop/.test(lua.text) && /mobs\.spawn/.test(lua.text), 'the entities block places the prop and the monster')
check(/dormant=true/.test(lua.text), 'a dormant monster is placed dormant')
check(!/\b\d+\.\d+\b(?![^"]*")/.test(lua.text.replace(/"[^"]*"/g, '""')), 'no bare fractional number anywhere in the Lua')

// The hall's edge facing the door is the door's twin; its index must be the
// hall's side and its guard must be the door sector's index.
{
  const open = lua.text.match(/name = "door: open from s\d+",[\s\S]*?side = (\d+), expect_neighbour = (\d+)/)
  check(open !== null, 'the door open trigger names a side and a guard')
  if (open) {
    const sd = emitted.sides[Number(open[1])]
    check(sd.sector !== doorS.id && sd.neighbor === doorS.id && Number(open[2]) === emitted.sectorIndex.get(doorS.id),
          `the pressed side belongs to a room and faces the door (side ${open[1]} of ${sd.sector} -> ${sd.neighbor})`)
  }
}

// --- the runtime rules ---------------------------------------------------------
if (!existsSync(TRIGGERCHECK)) {
  console.log('lua_emit: triggercheck not built (scripts/build_lua_tests.sh) -- runtime checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-lua-'))
  const file = join(dir, 'presets.lua')
  writeFileSync(file, lua.text)
  const r = spawnSync(TRIGGERCHECK, [ROOT, file], { encoding: 'utf8' })
  check(r.status === 0, `triggercheck accepts the studio's table:\n${r.stderr}`)
  const n = /ok \((\d+) triggers\)/.exec(r.stderr)
  check(n && Number(n[1]) === doc.triggers.length, `all ${doc.triggers.length} triggers loaded (${n?.[1]})`)

  // The map's camera: written as whole numbers over 1000, for everyone who
  // joins; the runtime takes the file. A map with no camera says nothing.
  const camDoc = { ...doc, camera: { yaw: 0.125, pitch: 0.05, distance: 30, lockYaw: true, lockZoom: false } }
  const camLua = emitMapLua(camDoc, emitted)
  check(/dnp\.level_camera\{ yaw = 125 \/ 1000, pitch = 50 \/ 1000, distance = 30000 \/ 1000, lock_yaw = 1 \}/.test(camLua.text), 'the camera is written in thousandths, locks as 1')
  check(!/\d\.\d/.test(camLua.text.split('level_camera')[1].split('\n')[0]), 'and with no decimal literal in the line')
  check(!/level_camera/.test(lua.text), 'CONTROL: a map with no camera set does not call it')
  const cfile = join(dir, 'camera.lua')
  writeFileSync(cfile, camLua.text)
  const rc = spawnSync(TRIGGERCHECK, [ROOT, cfile], { encoding: 'utf8' })
  check(rc.status === 0, `the runtime takes a map that sets its camera:\n${rc.stderr}`)

  // CONTROL: without the guards the runtime refuses the table. If it did not,
  // a stale side index would be discovered by walking into the wrong wall.
  const bare = emitMapLua(doc, emitted, { guards: false })
  const bfile = join(dir, 'bare.lua')
  writeFileSync(bfile, bare.text)
  const rb = spawnSync(TRIGGERCHECK, [ROOT, bfile], { encoding: 'utf8' })
  check(rb.status !== 0, 'CONTROL: the runtime refuses side_is without expect_neighbour')
}

// --- the studio's own checks say it first -----------------------------------------
{
  const d2 = newDoc('bad')
  addSector(d2, rect(0, 0, 8, 8))
  addSpawn(d2, 'start', 4, 4)
  normalize(d2)
  const e = d2.sectors[d2.order[0]].verts[0].edge.id
  addTrigger(d2, { name: 'x', event: 'on_interact', conditions: [{ c: 'side_is', side: { edge: e } }],
                   actions: [{ a: 'sector_move', sector: 'behind', surface: 'sideways', speed: 1 }] })
  addTrigger(d2, { name: 'x', event: 'on_cross', actions: [{ a: 'teleport', x: 1, y: 2 }] })
  addTrigger(d2, { name: 'y', event: 'on_touch', conditions: [{ c: 'side_is', side: { edge: e } }], actions: [{ a: 'nothing' }] })
  addTrigger(d2, { name: 'z', event: 'on_tick', actions: [{ a: 'log', text: 'hi', speed: 0.5 }] })
  const p = vocab.validateTriggers(d2)
  check(p.some((m) => /surface.*one of floor/.test(m)), 'a bad enum is named')
  check(p.some((m) => /already used/.test(m)), 'a duplicate name is named')
  check(p.some((m) => /needs `z`/.test(m)), 'a missing argument is named')
  check(p.some((m) => /side_is.*only makes sense on/.test(m)), 'a condition on the wrong event is named')
  check(p.some((m) => /unknown action "nothing"/.test(m)), 'an unknown action is named')
  check(p.some((m) => /unknown field `speed`/.test(m)), 'a stray field is named')
  check(vocab.validateTriggers(doc).length === 0, 'CONTROL: the good document still validates clean')
}

console.log(`\nlua_emit: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
