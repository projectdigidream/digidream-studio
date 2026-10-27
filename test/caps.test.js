// THE MAP'S LIMITS ARE THE ENGINE'S: src/doc.js CAP against the headers the
// engine compiles, so a map the engine takes is never refused here (it said
// "the engine holds 512" of a 600-room map long after the engine held 16384).
//
//   node studio/test/caps.test.js

import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { CAP, newDoc, addSector, addSpawn, validate } from '../src/doc.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

const geom = (f) => readFileSync(join(ROOT, 'engine', 'core', 'include', 'dnp', 'geom', f), 'utf8')
const headers = geom('mapstore.hpp') + geom('map.hpp') + geom('triangulate.hpp') + geom('sector_fx.hpp')
const constant = (name) => Number(new RegExp(`constexpr\\s+\\w+\\s+${name}\\s*=\\s*(\\d+)`).exec(headers)?.[1])

const MIRRORS = {
  sectors: 'MAX_MAP_SECTORS', points: 'MAX_MAP_POINTS', sides: 'MAX_MAP_SIDES', spawns: 'MAX_MAP_SPAWNS',
  lights: 'MAX_MAP_LIGHTS', textures: 'MAX_MAP_TEXTURES', scripts: 'MAX_MAP_SCRIPTS', loopPoints: 'MAX_POLY_POINTS',
  holesPerSector: 'MAX_POLY_HOLES', textureName: 'MAX_TEXTURE_NAME', paths: 'MAX_MAP_PATHS', pathPoints: 'MAX_MAP_PATH_POINTS',
  effects: 'MAX_MAP_FX'
}
for (const [key, name] of Object.entries(MIRRORS)) {
  const engine = constant(name)
  check(Number.isFinite(engine) && CAP[key] === engine, `CAP.${key} is the engine's ${name} (${CAP[key]} / ${engine})`)
}
check(Object.keys(CAP).every((k) => k in MIRRORS), `every CAP has its header (${Object.keys(CAP).filter((k) => !(k in MIRRORS)).join(', ') || 'all'})`)

// a map of 600 rooms: refused while the studio thought the engine held 512
const doc = newDoc('big')
for (let i = 0; i < 600; i++) { const x = (i % 30) * 2; const y = Math.floor(i / 30) * 2; addSector(doc, [{ x, y }, { x: x + 1, y }, { x: x + 1, y: y + 1 }, { x, y: y + 1 }]) }
addSpawn(doc, 'start', 0.5, 0.5)
const said = validate(doc).filter((p) => /holds|at most|too many/i.test(p.msg)).map((p) => p.msg)
check(said.length === 0, `a 600-room map is not refused for its size (${said[0] ?? 'nothing said'})`)

console.log(`\ncaps: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
