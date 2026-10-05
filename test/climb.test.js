//
// CLIMBING: what climb.js says a climbable side does is what the engine does
// with it (docs/PLAYER.md "How climbing plays").
//
// A walkway with a bay behind it for each case, drawn as the studio draws
// rooms, baked by the native mapc and driven by the engine's own controller
// (the client core's wasm world, the code the server runs): a body with
// climb_auto on pushes north into each bay's face for three seconds.
//
//   ledge     3 up, climbable on the walkway's side    climbs and mantles onto it
//   bare      3 up, not climbable                      CONTROL: never grabs
//   low       0.4 up, climbable                        walked up, never grabbed
//   upper     3 up, climbable on the BAY's side only   never grabs (looks down)
//   south     the walkway's outer wall, climbable      climbs toward the ceiling
//
// ORACLES: mapc (native) and the core's wasm world.
//
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { climbSides, climbProblems, climbSays, STEP_HEIGHT } from '../src/climb.js'
import { requireOracles, bakeNative, core } from './oracle.js'
import { axisFromNumber, BUTTON } from '../../engine/client/src/proto.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const doc = newDoc('climb')
const walk = addSector(doc, rect(0, 0, 32, 3), { floor: 0, ceil: 12 })
const BAYS = { ledge: [2, 3, true], bare: [8, 3, false], low: [14, 0.4, true], upper: [20, 3, false] }
const bay = {}
for (const [name, [x0, floor]] of Object.entries(BAYS)) bay[name] = addSector(doc, rect(x0, 3, x0 + 4, 8), { floor, ceil: 12 })
addSpawn(doc, 'start', 1, 1.5)
normalize(doc)

// The side of sector `s` from (ax, ay) to (bx, by).
const side = (s, ax, ay, bx, by) => {
  const i = s.verts.findIndex((v, k) => { const q = s.verts[(k + 1) % s.verts.length]; return v.x === ax && v.y === ay && q.x === bx && q.y === by })
  if (i < 0) throw new Error(`no side ${ax},${ay} -> ${bx},${by} in ${s.id}`)
  return s.verts[i].edge
}
// The walkway runs counter-clockwise, so its north sides run west along y 3.
const E = {}
for (const [name, [x0, , flagged]] of Object.entries(BAYS)) { E[name] = side(walk, x0 + 4, 3, x0, 3); if (flagged) E[name].flags.climbable = true }
E.upper = side(bay.upper, 20, 3, 24, 3); E.upper.flags.climbable = true
E.south = side(walk, 0, 0, 32, 0); E.south.flags.climbable = true

// --- what the studio says ------------------------------------------------------------------
const said = climbSides(doc)
const of = (edge) => said.find((c) => c.edge === edge)
check(of(E.ledge)?.kind === 'step' && of(E.ledge).height === 3, `the vine ledge is a 3-high face to climb (${of(E.ledge) && climbSays(of(E.ledge))})`)
check(of(E.low)?.kind === 'low', `a 0.4 step is walked up, never grabbed (STEP_HEIGHT ${STEP_HEIGHT})`)
check(of(E.upper)?.kind === 'down' && !of(E.bare), 'a flag on the upper room\'s side looks down: nothing to hold')
check(of(E.south)?.kind === 'wall' && of(E.south).height === 12, 'an outer wall climbs to the ceiling')
const probs = climbProblems(doc)
check(probs.length === 2 && probs.every((p) => /never grabs/.test(p.msg)), `the two that never grab are problems, the two that climb are not (${probs.map((p) => p.msg).join(' | ')})`)

// --- what the engine does --------------------------------------------------------------------
requireOracles('climb')
const emitted = emitMap(derive(doc), doc, [])
const baked = bakeNative(emitted.text, 'climb')
check(baked.ok, `the course bakes (${baked.stderr.trim().split('\n').pop()})`)
if (baked.ok) {
  const c = await core()
  const r = c.loadMap(new Uint8Array(baked.dnpm))
  const ONE = 4294967296
  const fx = (v) => BigInt(Math.round(v * ONE))
  const num = (raw) => Number(raw) / ONE
  // Push in one direction from (x, y) for `ticks`; what the body did.
  const push = (x, y, my, ticks = 180) => {
    const world = c.createWorld({ map: r.map })
    const a = world.spawn({ x: fx(x), y: fx(y), z: fx(0) })
    world.setParamByName(a, 'climb_auto', 1)
    for (let t = 0; t < 20; t++) { world.setInput(a, {}); world.step() }
    let climbed = false; let maxZ = 0
    for (let t = 0; t < ticks; t++) {
      world.setInput(a, { buttons: 0, moveX: 0, moveY: axisFromNumber(my) })
      world.step()
      const s = world.readAgent(a)
      climbed ||= s.climbing
      maxZ = Math.max(maxZ, num(s.pos.z))
    }
    const s = world.readAgent(a)
    const out = { climbed, maxZ: Number(maxZ.toFixed(2)), z: Number(num(s.pos.z).toFixed(2)), y: Number(num(s.pos.y).toFixed(2)) }
    world.destroy()
    return out
  }
  const ledge = push(4, 1.5, 1)
  check(ledge.climbed && ledge.z > 2.9 && ledge.z < 3.1 && ledge.y > 3.2, `the vine ledge: grabbed, climbed and mantled onto (${JSON.stringify(ledge)})`)
  const bare = push(10, 1.5, 1)
  check(!bare.climbed && bare.maxZ < 0.5, `CONTROL: the bare ledge never grabs (${JSON.stringify(bare)})`)
  const low = push(16, 1.5, 1)
  check(!low.climbed && low.z > 0.35 && low.z < 0.45, `the 0.4 step: walked up, never grabbed, as the studio says (${JSON.stringify(low)})`)
  const upper = push(22, 1.5, 1)
  check(!upper.climbed && upper.maxZ < 0.5, `the flag on the upper side: never grabs, as the studio says (${JSON.stringify(upper)})`)
  const wall = push(29, 1.5, -1, 120)
  check(wall.climbed && wall.maxZ > 3, `the outer wall: climbed toward the ceiling (${JSON.stringify(wall)})`)
}

console.log(`climb: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
