//
// The metamap: the module's maps on a grid, as the server reads them.
//
// What has to hold: the metamap.txt the studio writes is one the server
// accepts and places every level from; with a pitch the levels share one
// world; and the studio's seam check -- which boundary sides meet a
// neighbour's and whether they join -- says what the server's stitching does.
//
// ORACLE: engine/build/server/dnp-server on a module the studio wrote, read
// from its log ("N of N level(s) placed", "share one world", "N edge(s)
// stitched").
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { newModule, emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { metamapText, metamapProblems, neighboursOf, offsetOf, outerSides, seamCheck, outsideCell, mapAt } from '../src/metamap.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
/** Two rooms side by side, one cell apart; `open` says which of the touching sides are open. */
const pair = ({ aOpen = true, bOpen = true } = {}) => {
  const a = newDoc('a'); const sa = addSector(a, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' }); addSpawn(a, 'start', 2, 2)
  if (aOpen) sa.verts[1].edge.force = 'open'          // (16,0) -> (16,8), its east side
  const b = newDoc('b'); const sb = addSector(b, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' }); addSpawn(b, 'start', 2, 2)
  if (bOpen) sb.verts[3].edge.force = 'open'          // (0,8) -> (0,0), its west side
  return { a, b }
}
const mm = { enabled: true, pitch: [16, 16], radius: 1, cells: { a: [0, 0], b: [1, 0] } }

// --- the file and the grid ---------------------------------------------------------------
const text = metamapText(mm)
check(/^radius 1$/m.test(text) && /^pitch 16 16$/m.test(text) && /^cell 0 0 a$/m.test(text) && /^cell 1 0 b$/m.test(text), `the file says radius, pitch and every cell (${text.split('\n').slice(2).join(' | ')})`)
check(metamapText({ ...mm, enabled: false }) === null && metamapText({ ...mm, cells: {} }) === null, 'a metamap switched off, or empty, writes nothing')
check(!/pitch/.test(metamapText({ ...mm, pitch: null })), 'without a pitch the grid only places the levels')
check(metamapProblems(mm, ['a', 'b']).length === 0, 'a good metamap is clean')
check(metamapProblems({ ...mm, cells: { a: [0, 0], b: [0, 0] } }, ['a', 'b']).some((p) => /holds both/.test(p)), 'CONTROL: two maps in one cell is named')
check(metamapProblems({ ...mm, radius: 9 }, ['a', 'b']).some((p) => /radius/.test(p)) && metamapProblems(mm, ['a']).some((p) => /not a map/.test(p)), 'CONTROL: a radius out of range and a missing map are named')
check(neighboursOf(mm, 'a').length === 1 && neighboursOf(mm, 'a')[0].name === 'b' && offsetOf(mm, 1, 0).x === 16, 'b is a\'s neighbour, one pitch east')
check(neighboursOf({ ...mm, radius: 0 }, 'a').length === 0 && mapAt(mm, 1, 0) === 'b', 'with radius 0 nobody is near; a cell knows its map')
check(outsideCell(pair().a, mm.pitch).length === 0 && outsideCell(pair().a, [8, 8]).length === 1, 'a map inside its cell is fine, one reaching out is said')

// --- the seam check ----------------------------------------------------------------------
const seams = ({ a, b }) => {
  normalize(a); normalize(b)
  return seamCheck(outerSides(derive(a)), [{ name: 'b', offset: offsetOf(mm, 1, 0), sides: outerSides(derive(b)) }])
}
const both = seams(pair())
const half = seams(pair({ bOpen: false }))
check(both.filter((x) => x.state === 'joined').length === 1 && both.find((x) => x.state === 'joined').with === 'b', `both sides open: one seam, joined (${JSON.stringify(both.map((x) => x.state))})`)
check(half.filter((x) => x.state === 'one-way').length === 1 && !half.some((x) => x.state === 'joined'), 'one side a wall: they meet, and do not join')
check(seams(pair({ aOpen: false, bOpen: false })).some((x) => x.state === 'walls'), 'both walls: they meet along a line, closed')

// --- the server --------------------------------------------------------------------------
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
const runtime = {}
for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
async function serve ({ a, b }, port) {
  const mod = newModule('mmtest', 'mm')
  mod.metamap = structuredClone(mm)
  const r = await emitModule(mod, [a, b], { bake, runtime })
  if (!r.ok) return { ok: false, log: JSON.stringify(r.problems) }
  const dir = mkdtempSync(join(tmpdir(), 'dnp-mm-'))
  for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
  const srv = spawn(SERVER, ['--port', String(port), '--module', dir], { cwd: join(ROOT, 'engine') })
  let log = ''
  srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
  await new Promise((res) => setTimeout(res, 2500))
  srv.kill()
  const stitched = [...log.matchAll(/joined the region: (\d+) edge\(s\) stitched/g)].reduce((n, m) => n + Number(m[1]), 0)
  return { ok: true, log, stitched, placed: /2 of 2 level\(s\) placed/.test(log), region: /share one world/.test(log) }
}
if (!existsSync(SERVER)) {
  console.log('metamap: no server build (engine/scripts/build_server.sh) -- the server checks are skipped')
} else {
  const s1 = await serve(pair(), 34671)
  check(s1.ok && s1.placed && s1.region, `the server places both levels from the studio's metamap, in one world (${s1.log.split('\n').filter((l) => /metamap|region/.test(l)).join(' | ')})`)
  check(s1.stitched === both.filter((x) => x.state === 'joined').length, `and stitches exactly the seams the studio says join (${s1.stitched} vs ${both.filter((x) => x.state === 'joined').length})`)
  const s2 = await serve(pair({ bOpen: false }), 34672)
  check(s2.ok && s2.stitched === 0, `CONTROL: with one side a wall the server stitches nothing, as the studio said (${s2.stitched})`)
}

console.log(`metamap: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
