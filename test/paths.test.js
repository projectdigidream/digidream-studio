//
// Camera paths: what the studio draws is what the engine bakes.
//
// A path is a line the camera rides (design §4.1, docs/MAP_AUTHOR.md), and
// three separate things have to agree about it -- the .map the studio writes,
// the curve mapc measures at bake, and the curve the studio draws in its own
// viewport. The last two matter because a flythrough is timed in ADVANCE: the
// engine has no completion event, so a script divides a speed into the curve's
// length. A studio showing a different number from the one baked would time
// every cutscene wrong and say nothing.
//
// ORACLES: build/<arch>/mapc, the real compiler, and the runtime's own loader
// read back through client/src/mapdata.js -- never the studio's idea of what
// it wrote. The curve is client/src/spline.js, the one the camera rides.
//
import { newDoc, addSector, addSpawn, addPath, addPathPoint, validate, CAP } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { emitMapLua } from '../src/lua_emit.js'
import { buildSpline } from '../../engine/client/src/spline.js'
import { readPaths } from '../../engine/client/src/mapdata.js'
import { requireOracles, bakeNative, readBaked } from './oracle.js'

requireOracles('paths')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]

const doc = newDoc('paths')
addSector(doc, rect(0, 0, 24, 24), { floorTex: 'F', ceilTex: 'C' })
addSpawn(doc, 'start', 2, 2)

// A looping shot that rides the room, and a two-point one pinned to the world.
const ride = addPath(doc, 3)
ride.loop = true
for (const [x, y] of [[4, 4], [20, 4], [20, 20]]) addPathPoint(doc, ride, x, y, 2)
const fixed = addPath(doc, 7)
fixed.anchored = false
addPathPoint(doc, fixed, 1, 1, 0)
addPathPoint(doc, fixed, 5, 1, 0)

normalize(doc)
const emitted = emitMap(derive(doc), doc, [])

check(/^path tag 3 loop$/m.test(emitted.text), 'a looping path is written with its tag and loop')
check(/^path tag 7$/m.test(emitted.text), 'and a plain one with neither')
check(/^  waypoint 4 4 2$/m.test(emitted.text), "points are waypoints, the word a rail already uses")
check(/^  waypoint 1 1 0 anchor none$/m.test(emitted.text), 'a world-fixed path says so on every point')
check(!/anchor none/.test(emitted.text.split('path tag 7')[0]), 'CONTROL: an anchored path leaves the anchor to mapc')

// --- through the real compiler, read back by the runtime ------------------------------
const baked = bakeNative(emitted.text, 'paths')
check(baked.ok, `mapc accepts the studio's paths:\n${baked.stderr}`)
if (baked.ok) {
  const { map } = await readBaked(baked.dnpm)
  const got = readPaths(map)
  check(got.length === 2, `both paths survive the bake (${got.length})`)
  const a = got.find((p) => p.tag === 3)
  const b = got.find((p) => p.tag === 7)
  check(a && a.loop && a.count === 3, `the looping path keeps its tag, loop and points (${JSON.stringify({ loop: a?.loop, count: a?.count })})`)
  check(b && !b.loop && b.count === 2, 'and the other keeps its own')
  check(a && Array.from(a.pos).join() === '4,4,2,20,4,2,20,20,2', `the points are where they were drawn (${a && Array.from(a.pos).join()})`)
  check(a && Array.from(a.anchors).every((x) => x === 0), `mapc anchored them to the room under them (${a && Array.from(a.anchors).join()})`)
  check(b && Array.from(b.anchors).every((x) => x === -1), `and left the world-fixed one alone (${b && Array.from(b.anchors).join()})`)

  // THE NUMBER THE STUDIO SHOWS IS THE NUMBER BAKED. Both are the arc length
  // of a centripetal Catmull-Rom through the same points; mapc's is a port of
  // spline.js and has to stay one.
  for (const p of [a, b]) {
    const pts = []
    for (let i = 0; i < p.count; i++) pts.push({ x: p.pos[i * 3], y: p.pos[i * 3 + 1], z: p.pos[i * 3 + 2] })
    const mine = buildSpline(pts, { loop: p.loop }).length
    check(Math.abs(mine - p.curveLength) < 1e-3,
          `path ${p.tag}: the studio's curve length matches the bake (${mine.toFixed(4)} vs ${p.curveLength.toFixed(4)})`)
  }
}

// --- the rules --------------------------------------------------------------------------
check(validate(doc).length === 0, `a document with paths validates (${validate(doc).map((p) => p.msg).join(' | ')})`)
const short = newDoc('short')
addSector(short, rect(0, 0, 8, 8)); addSpawn(short, 'start', 1, 1)
addPathPoint(short, addPath(short, 1), 2, 2, 0)
check(validate(short).some((p) => /needs at least 2/.test(p.msg)), 'CONTROL: a one-point path is named, not baked')
check(!/^path /m.test(emitMap(derive(normalize(short) ?? short), short, []).text), 'CONTROL: and it is not written at all')
const many = newDoc('many')
addSector(many, rect(0, 0, 8, 8)); addSpawn(many, 'start', 1, 1)
for (let i = 0; i <= CAP.paths; i++) { const p = addPath(many, i); addPathPoint(many, p, 0, 0, 0); addPathPoint(many, p, 1, 1, 0) }
check(validate(many).some((p) => new RegExp(`a map holds ${CAP.paths}`).test(p.msg)), `CONTROL: past ${CAP.paths} paths is named`)

// --- the level camera names a path by TAG ------------------------------------------------
doc.camera = { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false,
               mode: 'flythrough', path: 3, speed: 6, attach: null, blend: null }
const lua = emitMapLua(doc, emitted).text
check(/dnp\.level_camera\{ cam_mode = 2, cam_path = 3, cam_path_speed = 6000 \/ 1000 \}/.test(lua),
      `the level camera names the mode and the path's tag (${/dnp\.level_camera\{[^}]*\}/.exec(lua)?.[0]})`)
doc.camera.path = 0
check(/cam_path = 0/.test(emitMapLua(doc, emitted).text), 'tag 0 is a real tag and is written')
doc.camera.path = null
check(!/cam_path = /.test(emitMapLua(doc, emitted).text), 'CONTROL: naming no path writes no cam_path, since 0 cannot mean none')

console.log(`paths: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
