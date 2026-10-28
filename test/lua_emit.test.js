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
import { newDoc, addSector, addSpawn, addEntity, addTrigger, validate, removeSector, triggersNaming } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { emitMapLua, facingBrad, CAMERA_MOTION } from '../src/lua_emit.js'
import { Vocab } from '../src/vocab.js'
import { door, lift, switchFor, teleport, ambush, exit, crusher, slider, turntable } from '../src/presets.js'
import { ROOT } from './oracle.js'

const TRIGGERCHECK = join(ROOT, 'engine', 'build', 'lua', 'triggercheck')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const vocab = new Vocab(
  JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'trigger_vocab.json'), 'utf8')),
  JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'mob_vocab.json'), 'utf8')))

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
check(rd.ok && rd.triggers.length === 3, `door: two portals give an open each, plus shut (${rd.triggers.length})`)
check(!rd.triggers.some((t) => /close/.test(t.name)) && rd.triggers.some((t) => t.actions.some((a) => a.a === 'run_after' && a.ticks === 240)),
  'and pressing an open door does nothing: it shuts by itself, four seconds on')
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

// A platform that travels, and one that turns. Both are sector_move, which is
// the point: `dx`/`dy` and `spin` joined the vocabulary rather than a script
// reaching past it into sector:move_parametric.
const slideEdge = edgeOf(hall, 0, 0)
const rslide = slider(doc, slideEdge, liftS.id, { dx: 4, dy: 2 })
check(rslide.ok && rslide.triggers.length === 2, `slider: a switch sends it out and it comes back (${rslide.triggers.length})`)
check(doc.sectors[liftS.id].floorStyle.anchor === 'sector',
      'and its flat is painted in its own frame, or it slides out from under its own pattern')
const rturn = turntable(doc, edgeOf(hall, 16, 0), pit.id, { spin: 90 })
check(rturn.ok && rturn.triggers.length === 1, 'turntable: one switch, one turn')
check(doc.sectors[pit.id].floorStyle.anchor === 'sector', 'anchored for the same reason, and more so')
{
  const act = rturn.triggers[0].actions[0]
  check(act.spin === 90 && act.pivot_x === undefined,
        'the pivot is left out, because it defaults to the mean of the sector\'s own corners')
}
check(!slider(doc, slideEdge, liftS.id, { dx: 0, dy: 0 }).ok, 'CONTROL: a slider that travels nowhere is refused')

check(rc.ok, 'crusher switch')
const rNo = door(doc, far.id)
check(rNo.ok && rNo.triggers.length === 2, `a door with one neighbour opens from one side (shut, and one open) (${rNo.triggers.length})`)
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
  const r = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), file], { encoding: 'utf8' })
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
  const rc = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), cfile], { encoding: 'utf8' })
  check(rc.status === 0, `the runtime takes a map that sets its camera:\n${rc.stderr}`)
  // HOW IT MOVES: every motion field the studio writes is one the server names
  // (world_binding.cpp CAMERA_FIELD_NAMES) and the client reads (proto.js
  // CAMERA_FIELD), and a map that sets them all is taken by the runtime.
  const cpp = readFileSync(join(ROOT, 'engine', 'server', 'src', 'lua', 'world_binding.cpp'), 'utf8')
  const names = /CAMERA_FIELD_NAMES\[\] = \{([\s\S]*?)\};/.exec(cpp)?.[1].replace(/\/\/[^\n]*/g, '').match(/"([a-z_]+)"/g)?.map((x) => x.slice(1, -1)) ?? []
  const { CAMERA_FIELD } = await import('../../engine/client/src/proto.js')
  const offWire = CAMERA_MOTION.filter((f) => !names.includes(f.wire) || CAMERA_FIELD[names.indexOf(f.wire)] !== f.key)
  check(names.length > 0 && offWire.length === 0, `the camera's motion fields are the engine's, by wire name and client name (${offWire.map((f) => f.wire).join(', ') || 'all ' + CAMERA_MOTION.length})`)
  const motion = Object.fromEntries(CAMERA_MOTION.map((f) => [f.key, f.max]))
  const moveLua = emitMapLua({ ...doc, camera: { yaw: null, pitch: null, distance: null, ...motion } }, emitted)
  check(CAMERA_MOTION.every((f) => new RegExp(`${f.wire} = ${Math.round(f.max * 1000)} / 1000`).test(moveLua.text)), 'a map\'s camera motion is written by wire name, in thousandths')
  const mfile = join(dir, 'camera_motion.lua')
  writeFileSync(mfile, moveLua.text)
  const rm = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), mfile], { encoding: 'utf8' })
  check(rm.status === 0, `the runtime takes a map that sets how its camera moves:\n${rm.stderr}`)
  // THE AUTOMATIC CAMERA (engine 0.2.3.7): its four fields by the server's own names, taken by the runtime.
  const autoLua = emitMapLua({ ...doc, camera: { yaw: null, pitch: null, distance: null, autoTurn: true, autoDelay: 3, autoRate: 2, collide: true } }, emitted)
  const autoLine = autoLua.text.split('\n').find((l) => /level_camera\{/.test(l)) ?? ''
  check(['auto_turn', 'auto_delay', 'auto_rate', 'collide'].every((w) => names.includes(w) && new RegExp(`${w} = `).test(autoLine)) && /auto_delay = 3000 \/ 1000/.test(autoLine), `the automatic camera is written by the engine's wire names (${autoLine.trim()})`)
  const afile = join(dir, 'camera_auto.lua')
  writeFileSync(afile, autoLua.text)
  const ra = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), afile], { encoding: 'utf8' })
  check(ra.status === 0, `the runtime takes a map with the automatic camera:\n${ra.stderr}`)
  check(!/auto_/.test(emitMapLua({ ...doc, camera: { yaw: 0.1, pitch: null, distance: null, autoDelay: 3 } }, emitted).text), 'CONTROL: with the swing off, its delay is not written')
  // ON A LEAD (engine 683417c): auto_turn 2, and the swing's delay and rate are not its
  const leadLua = emitMapLua({ ...doc, camera: { yaw: null, pitch: null, distance: null, autoTurn: 2, autoDelay: 3, autoRate: 2 } }, emitted)
  const leadLine = leadLua.text.split('\n').find((l) => /level_camera\{/.test(l)) ?? ''
  check(/auto_turn = 2/.test(leadLine) && !/auto_delay|auto_rate/.test(leadLine), `the camera on a lead is auto_turn 2, without the swing's delay and rate (${leadLine.trim()})`)
  const lfile = join(dir, 'camera_lead.lua')
  writeFileSync(lfile, leadLua.text)
  const rl = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), lfile], { encoding: 'utf8' })
  check(rl.status === 0, `the runtime takes a map with the camera on a lead:\n${rl.stderr}`)
  // THE CAMERA BY HEIGHT (engine 0.2.3.8): camera_height and aim_height, by the server's names, taken by the runtime
  const hLua = emitMapLua({ ...doc, camera: { yaw: null, pitch: null, distance: 6, cameraHeight: 3, aimHeight: 1.25 } }, emitted)
  const hLine = hLua.text.split('\n').find((l) => /level_camera\{/.test(l)) ?? ''
  check(names.includes('camera_height') && names.includes('aim_height') && /camera_height = 3000 \/ 1000/.test(hLine) && /aim_height = 1250 \/ 1000/.test(hLine), `the camera's height and aim are written by the engine's names (${hLine.trim()})`)
  const hfile = join(dir, 'camera_height.lua')
  writeFileSync(hfile, hLua.text)
  const rh = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), hfile], { encoding: 'utf8' })
  check(rh.status === 0, `the runtime takes a map with the camera's height:\n${rh.stderr}`)

  // CONTROL: without the guards the runtime refuses the table. If it did not,
  // a stale side index would be discovered by walking into the wrong wall.
  const bare = emitMapLua(doc, emitted, { guards: false })
  const bfile = join(dir, 'bare.lua')
  writeFileSync(bfile, bare.text)
  const rb = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), bfile], { encoding: 'utf8' })
  check(rb.status !== 0, 'CONTROL: the runtime refuses side_is without expect_neighbour')

  // PANELS, as the panel editor writes them: a layout in the table's `panels`,
  // opened by ui_open and answered through on_ui_event + widget_is.
  const panelDoc = { ...doc, triggers: [...doc.triggers,
    { id: 'tp1', name: 'open shop', event: 'on_interact', actions: [{ a: 'ui_open', panel: 'shop' }] },
    { id: 'tp2', name: 'buy', event: 'on_ui_event', conditions: [{ c: 'widget_is', widget: 2 }], actions: [{ a: 'log', text: 'bought' }] }],
  panels: { shop: { title: 'Shop', widgets: [{ kind: 'label', id: 1, label: 'Wares' }, { kind: 'button', id: 2, label: 'Buy' },
    { kind: 'slider', id: 3, label: 'How many', lo: 1, hi: 9, value: 3 }, { kind: 'select', id: 4, label: 'Colour', options: ['red', 'blue'] }] } } }
  check(vocab.validateTriggers(panelDoc).length === 0, `a panel and the triggers using it validate (${vocab.validateTriggers(panelDoc).join(' | ')})`)
  const pfile = join(dir, 'panels.lua')
  writeFileSync(pfile, emitMapLua(panelDoc, emitted).text)
  const rp = spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), pfile], { encoding: 'utf8' })
  check(rp.status === 0, `the runtime takes the panels as the studio writes them:\n${rp.stderr}`)
  const missing = { ...panelDoc, panels: { other: panelDoc.panels.shop } }
  check(vocab.validateTriggers(missing).some((m) => /no panel called "shop"/.test(m)), 'the studio names a ui_open whose panel is missing before the runtime does')
  writeFileSync(pfile, emitMapLua(missing, emitted).text)
  check(spawnSync(TRIGGERCHECK, [join(ROOT, 'engine'), pfile], { encoding: 'utf8' }).status !== 0,
        'CONTROL: and refuses a ui_open naming a panel the table does not define')
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

// START FACING: a placed prop or monster's angle (degrees, 0 = +x, counter-
// clockwise) is written in brads (a full turn 2^32). A prop is turned with
// set_facing once spawned; a monster is given it as the `facing` spawn option.
// ORACLE: the emitted entities block run under LuaJIT, with a dnp and a mob
// runtime that record what they are handed. CONTROL: a thing without an angle
// is turned by nothing.
{
  check(facingBrad(90) === 1073741824 && facingBrad(180) === 2147483648 && facingBrad(360) === 0 && facingBrad(-90) === 3221225472, 'degrees become brads (90, 180, 360, -90)')
  const fd = structuredClone(doc)
  fd.entities = []
  addEntity(fd, 'prop', 'barrel', 4, 4, 0, { angle: 90 })
  addEntity(fd, 'prop', 'crate', 6, 4)
  addEntity(fd, 'mob', 'spirit', 8, 4, 0, { angle: 180 })
  const text = emitMapLua(fd, emitted, { guards: false }).text
  const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')
  if (!existsSync(LUAJIT)) console.log('lua_emit: no luajit -- the facing run is skipped')
  else {
    const body = text.slice(text.indexOf('if dnp ~= nil and fx ~= nil'), text.lastIndexOf('end') + 3)
    const f = join(mkdtempSync(join(tmpdir(), 'dnp-facing-')), 'f.lua')
    writeFileSync(f, [
      'local said = {}',
      'fx = { frac = function (n, d) return n / d end }',
      'vec3 = { new = function (x, y, z) return { x = x, y = y, z = z } end }',
      'dnp = { spawn_prop = function (name) return { set_facing = function (_, a) said[#said + 1] = name .. "=" .. string.format("%.0f", a) end } end }',
      'mobs = { spawn = function (name, _, o) said[#said + 1] = name .. ":" .. (o.facing and string.format("%.0f", o.facing) or "none"); return {} end }',
      'print = function () end',
      body,
      'io.write(table.concat(said, " "))'
    ].join('\n'))
    const r = spawnSync(LUAJIT, [f], { encoding: 'utf8' })
    const out = (r.stdout || '').trim()
    check(r.status === 0 && out === 'barrel=1073741824 spirit:2147483648', `the prop is turned and the monster told its facing (${out || r.stderr})`)
    check(!/crate/.test(out), 'CONTROL: the crate, with no angle, is turned by nothing')
  }
}

// A ROOM DELETED TAKES ITS TRIGGERS WITH IT: a door's room gone, its cards
// would name a sector and walls that are not there, and the map would not bake
// (the views then kept drawing the room). CONTROL: the same delete leaving the
// triggers behind is exactly what the emitter refuses.
{
  const two = newDoc('delete')
  const a = addSector(two, rect(0, 0, 8, 8))
  const d = addSector(two, rect(8, 2, 10, 6), { floor: 0, ceil: 4 })
  const b = addSector(two, rect(10, 0, 18, 8))
  addSpawn(two, 'start', 2, 4)
  normalize(two)
  door(two, d.id)
  exit(two, b.verts.find((v) => v.x === 18 && v.y === 0).edge.id)
  const kept = JSON.parse(JSON.stringify(two))
  const gone = removeSector(two, d.id)
  check(gone.length === 3 && gone.every((t) => t.name.startsWith('door')) && two.triggers.length === 1 && two.triggers[0].name.startsWith('exit'),
    `deleting a door's room takes its three triggers and leaves the exit (${gone.map((t) => t.name).join(', ')} | ${two.triggers.map((t) => t.name).join(', ')})`)
  const after = emitMapLua(two, emitMap(derive(two), two))
  check(after.problems.length === 0, `and the map still writes, every reference resolved (${after.problems.join(' | ')})`)
  removeSectorOnly(kept, d.id)
  const broken = emitMapLua(kept, emitMap(derive(kept), kept))
  check(broken.problems.length > 0, `CONTROL: the room deleted with its triggers left behind is refused (${broken.problems.length} problems)`)
  check(a && b && triggersNaming(two, a.id).length === 0, 'and a room no trigger names has none to take')
}
function removeSectorOnly (doc, id) { delete doc.sectors[id]; doc.order = doc.order.filter((s) => s !== id) }

console.log(`\nlua_emit: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
