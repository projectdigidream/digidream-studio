//
// The Play log: the lines it picks out as failures are the ones that are.
//
// What has to hold: on the server's own output for a module that loads, it
// raises nothing (a log that cries wolf on every boot is one nobody reads);
// on the output for a module whose graph the server refuses, it picks out the
// refusal. And the text it shares carries all three logs.
//
// ORACLE: engine/build/server/dnp-server's real output, on modules the studio wrote.
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { isBad, failures, asText, FILES, tidy } from '../src/playlog.js'
import { newModule, emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// What a tester met (2026-10-17): a recipe's missile with no prop, failing at every shot, under "nothing looks like a failure".
{
  const bolt = '[mobs] action fire[2]: [string "/data/user/0/com.digidream.app/files/game/mod..."]:2951: no prop named \'bolt\' in the prop catalogue'
  check(isBad(bolt), 'a Lua error at run time is a failure, whatever its words')
  const f = failures({ server: [bolt, bolt, '[mobs] 3 monsters', bolt] })
  check(f.length === 1 && f[0].times === 3, `and the same line again is one failure, counted (${JSON.stringify(f.map((x) => x.times))})`)
  check(!isBad('[mobs] gunner: fire -> chase at 120') && !isBad('loaded maps/arena.dnpm: 2 rooms'), 'CONTROL: ordinary lines are not')
}
check(isBad('[lua:maps/graphs.lua] [graphs] first.main.graph.json: 1 problems -- the graph is not loaded') && isBad('Uncaught TypeError: x is not a function (src/main.js:12)') &&
      isBad('[shell] the server exited (1)') && isBad('[graphs] lost.intro.graph.json: node \'fly\': the map has no camera path tagged 9'),
      'refusals, uncaught errors, a dead server and a missing path are failures')
check(!isBad('[warning] [props] missing sprite BKEYA0 (/src/main.js:1527)') && isBad('[warning] the link failed to open') && isBad('[error] Uncaught TypeError: boom'),
      'the game page\'s warnings stay in its log unless they say something failed; its errors are failures')
// The graph runtime's warnings while it runs, in its own words (graphs.lua say()).
check(isBad("[lua:maps/graphs.lua] [graphs] world.levers: node 'open' was given \"x\" for 'amount', which is not a int -- skipped") &&
      isBad("[graphs] world.main: node 'heal' (heal) acted on no player -- the event has none; tick `everyone` to reach them all") &&
      isBad("[graphs] world.main: a run went past 1000 steps at node 'loop' and was stopped -- a loop?") &&
      isBad("[graphs] game.hud: panel 'score' differs from world.hud's; world.hud's is the one used"),
      "the graph runtime's run-time warnings are flagged: a skipped node, no player, a stopped run, a panel clash")
check(!isBad('[graphs] world.levers: 12 nodes, 14 links'), "CONTROL: and its load summary is not")
check(!isBad('[triggers] first: 3 triggers on 2 events') && !isBad('[studio] wrote 40 files (512 KB) under modules/x') && !isBad('[graphs] first.main.graph.json: 0 problems'),
      'CONTROL: ordinary lines are not')
const logs = { studio: ['[studio] launching the game'], server: ['[srv] up', '[graphs] x: 1 problems -- the graph is not loaded'], game: [] }
check(tidy('[srv] /data/user/0/com.digidream.app/files/game/modules/starter/maps/first.dnpm asked for graph') === '[srv] modules/starter/maps/first.dnpm asked for graph' &&
      tidy('[lua:/Users/x/Library/Application Support/Digidream/game/modules/a/maps/graphs.lua] y') === '[lua:modules/a/maps/graphs.lua] y', 'a line is shown with the path to the game tree dropped')
check(failures(logs).length === 1 && failures(logs)[0].log === 'server', 'the failures say which log they are from')
check(FILES.every(([, file]) => asText(logs).includes(file)) && asText(logs).includes('(empty)'), 'the shared text carries all three logs, an empty one said so')

const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('playlog: no server build -- the real-output checks are skipped')
else {
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const serve = async (graph, port) => {
    const doc = newDoc('first')
    addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' })
    addSpawn(doc, 'start', 2, 2)
    doc.triggers = [{ id: 't', name: 'hello', event: 'on_interact', actions: [{ a: 'log', text: 'hello' }] }]
    if (graph) doc.graphs = { main: graph }
    const r = await emitModule(newModule('pl', 'pl'), [doc], { bake, runtime })
    const dir = mkdtempSync(join(tmpdir(), 'dnp-pl-'))
    for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
    // As the shells run it for a play-test: the module, the map, the start.
    const srv = spawn(SERVER, ['--port', String(port), '--module', dir, '--map', join(dir, 'maps', 'first.dnpm'), '--spawn', 'start'], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((res) => setTimeout(res, 2500))
    srv.kill()
    return log.split('\n').filter(Boolean)
  }
  const good = await serve({ vars: {}, nodes: [{ id: 'go', type: 'when_level_starts' }, { id: 'say', type: 'action', a: 'log', text: 'hi' }], links: [['go.then', 'say.in']] }, 34703)
  const goodBad = good.filter(isBad)
  check(good.length > 5 && goodBad.length === 0, `a module that loads raises nothing in the server's real output (${good.length} lines${goodBad.length ? `; flagged: ${goodBad.slice(0, 3).join(' | ')}` : ''})`)
  const broken = await serve({ vars: {}, nodes: [{ id: 'go', type: 'when_level_starts' }, { id: 'fly', type: 'camera_flythrough', path: 9 }], links: [['go.then', 'fly.in']] }, 34704)
  const picked = broken.filter(isBad)
  check(picked.some((l) => /camera path tagged 9/.test(l)) && picked.some((l) => /not loaded/.test(l)), `a refused graph is picked out, by what the server said (${picked.slice(0, 2).join(' | ')})`)
}

console.log(`playlog: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
