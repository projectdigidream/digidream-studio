//
// A cutscene, planned and posed: the studio's ▶ scene plays a graph's run
// timed as the engine times it (engine/maps/scripts/graphs.lua) and flies the
// camera as the client does (engine/client/src/camera.js).
//
// ORACLES: the timings are graphs.lua's, written down in scene_plan.js and
// checked here against what that file says; the curve is the client's own
// buildSpline, and the flythrough's eye and look the client's arithmetic.
//
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { planScene, cameraPose, subtitleSeconds, isStart } from '../src/scene_plan.js'
import { buildSpline } from '../../engine/client/src/spline.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}
const near = (a, b, e = 1e-6) => Math.abs(a - b) <= e

// The engine's own numbers, read from its source so the plan cannot drift from them.
const lua = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'graphs.lua'), 'utf8')
check(/n\.seconds or math\.min\(8, 1\.5 \+ #text \* 0\.05\)/.test(lua) && subtitleSeconds('x'.repeat(40)) === 3.5 && subtitleSeconds('x'.repeat(400)) === 8,
      'a subtitle stays min(8, 1.5 + 0.05 a letter), as graphs.lua says')
check(/n\.letterbox or 0\.12/.test(lua) && /n\.seconds or 0\.5/.test(lua) && /local secs = n\.seconds or 1/.test(lua), 'the bars default to 0.12 over 0.5 s and a fade to 1 s, as graphs.lua says')
check(/unfx\(len\) \/ speed \* 60/.test(lua) && /local speed = n\.speed or 6/.test(lua), 'a flythrough is done after length / speed, 6 units a second by default, as graphs.lua says')

const points = [{ x: 0, y: 0, z: 2 }, { x: 10, y: 0, z: 2 }, { x: 20, y: 6, z: 3 }]
const sp = buildSpline(points, { loop: false })
const scene = {
  nodes: [
    { id: 'go', type: 'when_player_arrives' },
    { id: 'cut', type: 'start_cinematic' },
    { id: 'fly', type: 'camera_flythrough', path: 1, speed: 5 },
    { id: 'l1', type: 'subtitle', text: 'Where am I?', speaker: 'You' },
    { id: 'l2', type: 'subtitle', text: 'Somewhere you should not be.', speaker: 'A voice', seconds: 2 },
    { id: 'dark', type: 'fade', to: 'black', seconds: 1.5 },
    { id: 'wait', type: 'delay', ticks: 30 },
    { id: 'shake', type: 'camera_shake', strength: 0.5, seconds: 1 },
    { id: 'door', type: 'open_door', tag: 3 },
    { id: 'out', type: 'end_cinematic' }
  ],
  links: [['go.then', 'cut.in'], ['cut.then', 'fly.in'], ['fly.then', 'l1.in'], ['l1.done', 'l2.in'], ['l2.done', 'dark.in'], ['fly.done', 'shake.in'],
    ['dark.done', 'wait.in'], ['wait.then', 'door.in'], ['door.then', 'out.in']]
}
const plan = planScene(scene, 'go', { pathLength: (tag) => (tag === 1 ? sp.length : null) })
const at = (kind, f = () => true) => plan.events.find((e) => e.kind === kind && f(e))
const l1 = subtitleSeconds('Where am I?')
check(at('letterbox', (e) => e.to === 0.12)?.t === 0 && at('camera', (e) => e.mode === 'flythrough')?.t === 0, 'the bars come in and the camera takes the path at once')
check(at('subtitle', (e) => e.text === 'Where am I?')?.t === 0 && near(at('subtitle', (e) => e.speaker === 'A voice')?.t, l1),
      `the second line follows the first when it goes (${at('subtitle', (e) => e.speaker === 'A voice')?.t} vs ${l1})`)
check(near(at('fade')?.t, l1 + 2) && near(at('shake')?.t, sp.length / 5), `the fade comes when the second line goes, the shake when the flight is done (${at('shake')?.t?.toFixed(2)} = ${(sp.length / 5).toFixed(2)})`)
check(near(at('note', (e) => /open door/.test(e.text))?.t, l1 + 2 + 1.5 + 0.5), 'a door opens half a second (30 ticks) after the fade is done')
check(near(at('letterbox', (e) => e.to === 0)?.t, l1 + 4) && at('camera', (e) => e.mode === 'follow') && plan.events.some((e) => e.kind === 'clear_subtitle' && e.line === undefined),
      'and the end gives the camera back, takes the bars and the subtitle away')
check(plan.events.filter((e) => e.kind === 'clear_subtitle' && e.line === 1).length === 1, 'a line is taken off only if it is still that line')
check(isStart(scene.nodes[0]) && !isStart(scene.nodes[3]) && planScene(scene, 'l2', {}).events[0]?.kind === 'subtitle', 'played from a node that is not a start, the run begins with that node')
const missing = planScene({ nodes: [{ id: 's', type: 'after', seconds: 1 }, { id: 'f', type: 'camera_flythrough', path: 9 }], links: [['s.then', 'f.in']] }, 's', { pathLength: () => null })
check(missing.notes.some((n) => /tag 9/.test(n)), 'CONTROL: a path the map lacks is said')
const loop = planScene({ nodes: [{ id: 's', type: 'after' }, { id: 'a', type: 'sequence', count: 2 }], links: [['s.then', 'a.in'], ['a.0', 'a.in'], ['a.1', 'a.in']] }, 's')
check(loop.steps <= 256 && loop.notes.some((n) => /256/.test(n)), 'a loop drawn by mistake stops after 256 steps, as the runtime does')

// The camera, as the client flies it.
const pose = cameraPose({ mode: 'flythrough', speed: 5 }, 1, sp, null)
const p = sp.pointAt(5); const tg = sp.tangentAt(5)
check(near(pose.eye.x, p.x) && near(pose.eye.y, p.y) && near(pose.look.x, p.x + tg.x * 8) && near(pose.look.z, p.z + tg.z * 8), 'a flythrough sits on the curve and looks 8 units along it, as the client does')
const back = cameraPose({ mode: 'flythrough', speed: -5 }, 1, sp, null)
check(near(back.eye.x, sp.pointAt(sp.length - 5).x) && back.look.x < back.eye.x, 'flown backwards, it starts at the end and looks back along the curve')
const track = cameraPose({ mode: 'track' }, 0, sp, { x: 12, y: 8, z: 1 })
check(near(track.look.x, 12) && near(track.eye.x, sp.pointAt(sp.nearest({ x: 12, y: 8, z: 1 }).along).x), 'a track sits at the point nearest the player and looks at them')

console.log(`scene: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
