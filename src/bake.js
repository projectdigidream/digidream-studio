//
// Baking a .map on the device: the real mapc, compiled to wasm.
//
// The studio never parses or triangulates a map itself. It writes the text
// mapc reads, hands it to this, and gets back exactly what a workstation bake
// produces -- the same bytes, the same hash, and on a bad map the same
// line-numbered complaints, which the studio shows as they are. One grammar,
// one validator, one triangulator; docs/STUDIO.md says why that is the whole
// design.
//
// A FRESH INSTANCE PER BAKE. mapc counts its errors in a global it never
// resets (it is a program, and programs exit). Reusing one instance would make
// every bake after a failed one fail too, so each call instantiates the module
// again -- milliseconds, against a compiled binary the loader caches. The test
// keeps a control that reuses an instance and must see the stale count.
//
// THE FILE LAYOUT IS THE REPOSITORY'S. A map declares its scripts by relative
// path (`../../../maps/scripts/mobs.lua`), so the in-memory filesystem mirrors
// the checkout: everything under /repo, the map at its module path, the
// runtime Lua under maps/scripts/. A pack unzipped into a checkout then bakes
// with the desktop mapc from the same text -- and scripts/check_map_scripts.sh
// finds the copies where it expects them.
//
import createMapc from '../wasm/dist/mapc.mjs'

const REPO = '/repo'

/** Fetch the wasm once so that every bake can instantiate without a request. */
export async function loadMapcBinary (url) {
  const res = await fetch(url)
  if (!res.ok) throw new Error(`${res.status} fetching ${url}`)
  return new Uint8Array(await res.arrayBuffer())
}

/**
 * Bake one map.
 *
 * @param mapPath   repository-relative path of the .map, e.g.
 *                  'modules/first/maps/level.map'. Where it sits decides where
 *                  its `script` declarations resolve.
 * @param mapText   the .map source
 * @param files     { 'maps/scripts/mobs.lua': string|Uint8Array, ... } --
 *                  every file the map declares, repository-relative
 * @param wasmBinary  from loadMapcBinary(); optional, the loader finds the
 *                  file beside itself otherwise
 * @param instance  TEST ONLY: reuse this module instance instead of a fresh one
 * @returns {ok, code, dnpm, copies, errors:[{line,msg}], hash, stdout, stderr}
 *          copies: { 'mobs.lua': Uint8Array } -- the declared scripts mapc
 *          put beside the output, which ship with the map
 */
export async function bake ({ mapPath, mapText, files = {}, wasmBinary = null, instance = null }) {
  const stdout = []
  const stderr = []
  const M = instance ?? await createMapc({
    print: (line) => stdout.push(line),
    printErr: (line) => stderr.push(line),
    ...(wasmBinary ? { wasmBinary } : {})
  })
  if (instance) { instance.__out = stdout; instance.__err = stderr }
  const FS = M.FS

  const inPath = `${REPO}/${mapPath}`
  const outPath = inPath.replace(/\.map$/, '') + '.dnpm'
  const outDir = outPath.slice(0, outPath.lastIndexOf('/'))

  const put = (path, content) => {
    FS.mkdirTree(path.slice(0, path.lastIndexOf('/')))
    FS.writeFile(path, content)
  }
  for (const [rel, content] of Object.entries(files)) put(`${REPO}/${rel}`, content)
  put(inPath, mapText)

  // In Node the loader copies main's return into process.exitCode on the way
  // out of callMain, which would turn every refused bake into a failed test
  // run. Put back whatever was there.
  const proc = globalThis.process
  const savedExit = proc?.exitCode
  let code
  try {
    code = M.callMain([inPath, outPath])
  } catch (e) {
    code = typeof e?.status === 'number' ? e.status : 1
  }
  if (proc) proc.exitCode = savedExit

  const out = instance ? instance.__out : stdout
  const err = instance ? instance.__err : stderr
  const errors = err.map((line) => {
    const m = /^(\d+): (.*)$/.exec(line)
    return m ? { line: Number(m[1]), msg: m[2] } : { line: 0, msg: line }
  })
  if (code !== 0) return { ok: false, code, dnpm: null, copies: {}, errors, hash: null, stdout: out, stderr: err }

  const copies = {}
  for (const line of out) {
    const m = /: script (\S+)$/.exec(line)
    if (m) copies[m[1]] = FS.readFile(`${outDir}/${m[1]}`)
  }
  const hm = /\(hash ([0-9A-F]{16})\)/.exec(out[out.length - 1] ?? '')
  return {
    ok: true,
    code,
    dnpm: FS.readFile(outPath),
    copies,
    errors,
    hash: hm ? hm[1] : null,
    stdout: out,
    stderr: err
  }
}
