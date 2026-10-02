//
// The on-device bake is the workstation bake.
//
// The studio's whole claim to correctness is that it does not have its own
// map compiler: the wasm mapc IS tools/mapc/main.cpp. This proves it, byte for
// byte, against the native binary over maps of every shape in the tree -- a
// bare room, a scripted door map, a module's map with repository-relative
// scripts, and a converted Doom level with holes and sixty sectors.
//
// ORACLE: build/<arch>/mapc, the native compiler. Skips loudly when either
// side is not built; a skipped comparison is not a passed one.
//
import { readFileSync, existsSync, mkdtempSync } from 'node:fs'
import { execFileSync } from 'node:child_process'
import { dirname, join, resolve, relative, basename } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'
import createMapc from '../wasm/dist/mapc.mjs'
import { bake } from '../src/bake.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x86_64'
const NATIVE = [join(ROOT, 'engine', 'build', ARCH, 'mapc'), join(ROOT, 'engine', 'build', 'native', 'mapc')]
  .find((p) => existsSync(p))

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

if (!NATIVE) {
  console.log('bake: skipped (no native mapc -- run scripts/build_native.sh)')
  console.log('bake: 0 checks, 0 failures (SKIPPED)')
  process.exit(0)
}

const CORPUS = [
  'engine/maps/test.map',
  'engine/maps/void.map',
  'engine/maps/doors_trig.map',
  'modules/shootrange/maps/range.map',
  'modules/starter/maps/first.map',
  'modules/doom2/maps/map01.map'
].filter((p) => existsSync(join(ROOT, p)))

/** The map's text plus every file its `script` lines declare, repo-relative. */
function gather (mapRel) {
  const mapText = readFileSync(join(ROOT, mapRel), 'utf8')
  const files = {}
  for (const line of mapText.split('\n')) {
    const m = /^\s*script\s+(\S+)/.exec(line)
    if (!m) continue
    const abs = resolve(join(ROOT, dirname(mapRel)), m[1])
    files[relative(ROOT, abs)] = readFileSync(abs)
  }
  return { mapText, files }
}

function nativeBake (mapRel) {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-bake-'))
  const out = join(dir, basename(mapRel).replace(/\.map$/, '.dnpm'))
  const stdout = execFileSync(NATIVE, [join(ROOT, mapRel), out], { encoding: 'utf8' })
  const hm = /\(hash ([0-9A-F]{16})\)/.exec(stdout.trim().split('\n').pop())
  return { dnpm: readFileSync(out), hash: hm ? hm[1] : null }
}

const same = (a, b) => a.length === b.length && a.every((x, i) => x === b[i])

for (const mapRel of CORPUS) {
  const { mapText, files } = gather(mapRel)
  const w = await bake({ mapPath: mapRel, mapText, files })
  check(w.ok, `${mapRel}: wasm bake succeeds (${w.errors.map((e) => e.msg).join('; ')})`)
  if (!w.ok) continue
  const n = nativeBake(mapRel)
  check(same(w.dnpm, n.dnpm), `${mapRel}: wasm bytes equal native bytes (${w.dnpm.length} vs ${n.dnpm.length})`)
  check(w.hash !== null && w.hash === n.hash, `${mapRel}: hash ${w.hash} equals native ${n.hash}`)
  const declared = Object.keys(files).length
  check(Object.keys(w.copies).length === declared,
        `${mapRel}: ${Object.keys(w.copies).length} script copies for ${declared} declarations`)
  for (const [name, bytes] of Object.entries(w.copies)) {
    const src = Object.entries(files).find(([rel]) => basename(rel) === name)
    check(src && same(bytes, new Uint8Array(src[1])), `${mapRel}: copy of ${name} is byte-identical`)
  }
}

// --- controls -----------------------------------------------------------------

// A map mapc must refuse, and the refusal must carry a line number: that is
// what the studio shows next to the sector.
const BAD = 'sector floor 0 ceil 8\n  vertex 0 0 wall\n  vertex 4 0 wall\nend\n'
const bad = await bake({ mapPath: 'modules/t/maps/bad.map', mapText: BAD })
check(!bad.ok && bad.errors.length > 0, 'CONTROL: a two-vertex sector is refused')
check(bad.errors.some((e) => e.line > 0), `CONTROL: the refusal names a line (${JSON.stringify(bad.errors)})`)

// The reason every bake gets a fresh instance: mapc's error count is a global.
// On a reused instance a good map after a bad one is refused with the stale
// count; on a fresh one it bakes.
const GOOD = 'sector floor 0 ceil 8\n  vertex 0 0 wall\n  vertex 4 0 wall\n  vertex 4 4 wall\nend\nspawn start 2 2 0\n'
const shared = await createMapc({ print: () => {}, printErr: () => {} })
await bake({ mapPath: 'modules/t/maps/bad.map', mapText: BAD, instance: shared })
const stale = await bake({ mapPath: 'modules/t/maps/good.map', mapText: GOOD, instance: shared })
check(!stale.ok, 'CONTROL: a reused instance carries the previous bake\'s error count')
const fresh = await bake({ mapPath: 'modules/t/maps/good.map', mapText: GOOD })
check(fresh.ok, `CONTROL: the same map bakes on a fresh instance (${fresh.errors.map((e) => e.msg).join('; ')})`)

// A map that declares a script it does not ship is refused at bake time, not
// discovered when the server loads it.
const range = gather('modules/shootrange/maps/range.map')
const noScripts = await bake({ mapPath: 'modules/shootrange/maps/range.map', mapText: range.mapText, files: {} })
check(!noScripts.ok && noScripts.errors.some((e) => /cannot open script/.test(e.msg)),
      'CONTROL: missing declared scripts are refused')

console.log(`\nbake: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
