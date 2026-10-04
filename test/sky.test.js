//
// The sky: what the studio writes is what the server reads, and what its
// previews show is what the client draws (docs/SKY.md).
//
// ORACLES: dnp-server reading the module.txt the studio wrote (a line it
// cannot read is reported at start, by name -- none may be); the client's
// own skyFromMessage reading the message the studio previews with.
//
import { mkdtempSync, mkdirSync, writeFileSync, readFileSync, existsSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { spawn } from 'node:child_process'
import { skyWords, skyLines, skyMessage, skyProblems, skyFor, newSky } from '../src/sky_emit.js'
import { skyFromMessage, SKY_KIND } from '../../engine/client/src/render/sky.js'
import { newModule, emitModule, moduleTxt, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const strip = { kind: 'strip', images: ['SKY1'], repeat: 2, height: 0.75, yaw: 0.25 }
const pano = { kind: 'panorama', images: ['dusk'], yaw: -0.125 }
const cube = { kind: 'cube', images: ['e', 'w', 'n', 's', 'up', 'down'] }
check(skyWords(strip) === 'strip SKY1 repeat 2 height 0.75 yaw 0.25' && skyWords(pano) === 'panorama dusk yaw -0.125' && skyWords(cube) === 'cube e w n s up down' && skyWords({ kind: 'none' }) === 'none',
      `a sky is written in module.txt's words (${skyWords(strip)} | ${skyWords(pano)})`)
check(skyWords({ kind: 'strip', images: ['SKY1'], repeat: 4, height: 0.625 }) === 'strip SKY1', 'DOOM\'s own settings go unsaid')
check(skyWords({ kind: 'panorama', images: ['dusk'], repeat: 3, height: 2 }) === 'panorama dusk', 'a strip\'s settings are not written for another kind (the server refuses them)')

// The client reads the studio's preview message as the same sky.
const read = (s) => skyFromMessage(skyMessage(s))
const rs = read(strip)
check(rs.kind === SKY_KIND.STRIP && rs.images[0] === 'SKY1' && rs.repeat === 2 && rs.height === 0.75 && rs.yaw === 0.25, `the client reads the strip as written (${JSON.stringify(rs)})`)
check(read(cube).kind === SKY_KIND.CUBE && read(cube).images.join() === 'e,w,n,s,up,down' && read({ kind: 'none' }).kind === SKY_KIND.NONE, 'and the cube, faces in order, and none')
check(read({ kind: 'cube', images: ['a', 'b'] }).kind === SKY_KIND.NONE, 'CONTROL: a cube short of faces is no sky to the client -- which skyProblems says first')
check(skyProblems({ kind: 'cube', images: ['a', 'b'] }).some((p) => /needs 6 pictures/.test(p)) && skyProblems(strip, ['SKY2']).some((p) => /no texture called SKY1/.test(p)) &&
      skyProblems(strip, ['SKY1']).length === 0 && skyProblems({ kind: 'strip', images: ['a b'] }).some((p) => /not a picture name/.test(p)),
      'missing pictures, too few, and a name the server refuses are said')

// Which sky a map is drawn under, and the lines.
const module = { ...newModule('skies', 'skies'), sky: strip }
const docs = [{ name: 'boss', sky: cube }, { name: 'plain' }]
check(skyFor(module, docs[0]) === cube && skyFor(module, docs[1]) === strip && skyFor({}, {}) === null, 'a map\'s own sky, else the module\'s')
check(skyLines(module, docs).join('|') === 'sky default strip SKY1 repeat 2 height 0.75 yaw 0.25|sky boss cube e w n s up down', `the module.txt lines: the module's, then each map's own (${skyLines(module, docs).join(' | ')})`)
check(/^sky default /m.test(moduleTxt(module, docs)) && !/sky/.test(moduleTxt(newModule('p', 'p'), [{ name: 'a' }])), 'module.txt carries them, and a module with no sky says nothing')

// The server reads every line the studio writes.
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('sky: no server build -- the server check is skipped')
else {
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const serve = async (mod, ds, port, extraTxt = '') => {
    const real = ds.map((d) => { const doc = newDoc(d.name); addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'F_SKY1' }); addSpawn(doc, 'start', 2, 2); if (d.sky) doc.sky = d.sky; return doc })
    const r = await emitModule(mod, real, { bake, runtime })
    const dir = mkdtempSync(join(tmpdir(), 'dnp-sky-'))
    for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, (typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes))) }
    if (extraTxt) writeFileSync(join(dir, 'module.txt'), readFileSync(join(dir, 'module.txt'), 'utf8') + extraTxt)
    const srv = spawn(SERVER, ['--port', String(port), '--module', dir], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((res) => setTimeout(res, 2000))
    srv.kill()
    return { ok: r.ok, log }
  }
  const good = await serve(module, docs, 34707)
  check(good.ok && !/module\.txt: sky/.test(good.log) && /level\(s\)/.test(good.log), `the server reads every sky line the studio writes, without a word (${good.log.split('\n').filter((l) => /sky/i.test(l)).join(' | ') || 'none said'})`)
  const bad = await serve(module, docs, 34708, 'sky broken cube a b\n')
  check(/module\.txt: sky broken -- cube needs 6 picture/.test(bad.log), `CONTROL: a line it cannot read it reports, so the silence above means something (${bad.log.split('\n').filter((l) => /sky/.test(l)).join(' | ')})`)
}

console.log(`sky: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
