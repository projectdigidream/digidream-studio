//
// The oracles the studio tests measure against: the native map compiler and
// the wasm core's own loader. Neither is a paraphrase of the engine; both ARE
// the engine, which is the only kind of oracle this repository accepts.
//
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { dirname, join, resolve } from 'node:path'
import { tmpdir } from 'node:os'
import { fileURLToPath } from 'node:url'

export const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const ARCH = process.arch === 'arm64' ? 'arm64' : 'x86_64'
export const NATIVE_MAPC = [join(ROOT, 'engine', 'build', ARCH, 'mapc'), join(ROOT, 'engine', 'build', 'native', 'mapc')]
  .find((p) => existsSync(p)) ?? null
export const CORE_WASM = existsSync(join(ROOT, 'engine', 'client', 'wasm', 'dist', 'dnp_core.mjs'))

/** Print the skip line the suite expects and leave, when an oracle is missing. */
export function requireOracles (name, { mapc = true, core = true } = {}) {
  if (mapc && !NATIVE_MAPC) {
    console.log(`${name}: skipped (no native mapc -- run scripts/build_native.sh)`)
    console.log(`${name}: 0 checks, 0 failures (SKIPPED)`)
    process.exit(0)
  }
  if (core && !CORE_WASM) {
    console.log(`${name}: skipped (no core wasm -- run scripts/build_wasm.sh)`)
    console.log(`${name}: 0 checks, 0 failures (SKIPPED)`)
    process.exit(0)
  }
}

/** Bake .map text with the native compiler. { ok, dnpm, stderr, stdout }. */
export function bakeNative (mapText, name = 'level') {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-studio-'))
  const src = join(dir, `${name}.map`)
  const out = join(dir, `${name}.dnpm`)
  writeFileSync(src, mapText)
  const r = spawnSync(NATIVE_MAPC, [src, out], { encoding: 'utf8' })
  return { ok: r.status === 0, dnpm: r.status === 0 ? readFileSync(out) : null, stderr: r.stderr, stdout: r.stdout }
}

let corePromise = null
/** The loaded core, once. */
export async function core () {
  if (!corePromise) {
    corePromise = import(join(ROOT, 'engine', 'client', 'src', 'core.js')).then((m) => m.Core.load())
  }
  return corePromise
}

/** Parse a baked map with the runtime's loader and read it out as plain data. */
export async function readBaked (dnpm) {
  const c = await core()
  const { readMap } = await import(join(ROOT, 'engine', 'client', 'src', 'mapdata.js'))
  const r = c.loadMap(new Uint8Array(dnpm))
  if (!r.ok) throw new Error(`core refused the baked map: status ${r.status}`)
  const data = readMap(r.map)
  return { map: r.map, data }
}

/** The side of sector `si` running from point a to point b, or null. */
export function sideBetween (data, si, a, b) {
  const s = data.sectors[si]
  for (let k = 0; k < s.sideCount; k++) {
    const sd = data.sides[s.firstSide + k]
    // Side endpoints are absolute point indices (client/src/mapgeom.js).
    const pa = data.points[sd.a]
    const pb = data.points[sd.b]
    if (pa.x === a.x && pa.y === a.y && pb.x === b.x && pb.y === b.y) return { index: s.firstSide + k, ...sd }
  }
  return null
}
