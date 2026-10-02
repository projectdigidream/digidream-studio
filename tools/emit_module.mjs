#!/usr/bin/env node
//
// Regenerate a module's files from its studio documents, on a workstation.
//
//   node studio/tools/emit_module.mjs modules/starter
//
// module.studio.json and maps/*.studio.json are the sources; everything the
// studio would write on Export is written beside them: module.txt, the
// .map/.lua/.dnpm per map, the runtime copies, mobs.lua, props.txt and the
// texture index. The pictures under assets/ are left as they are.
//
// The same code the studio runs -- studio/src/module_emit.js and the wasm
// mapc -- so a module checked in with its documents can be proven to be what
// they emit (scripts/test.sh runs this over modules/starter and diffs).
//
import { readFileSync, writeFileSync, readdirSync, mkdirSync, existsSync } from 'node:fs'
import { join, dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { bake } from '../src/bake.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
const dir = process.argv[2]
if (!dir) { console.error('usage: emit_module.mjs <module dir>'); process.exit(2) }
const check = process.argv.includes('--check')

const module = JSON.parse(readFileSync(join(dir, 'module.studio.json'), 'utf8'))
const docs = readdirSync(join(dir, 'maps')).filter((f) => f.endsWith('.studio.json'))
  .map((f) => JSON.parse(readFileSync(join(dir, 'maps', f), 'utf8')))
const runtime = {}
for (const name of RUNTIME_SCRIPTS) runtime[name] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', name), 'utf8')

const r = await emitModule(module, docs, { bake, runtime })
for (const p of r.problems) {
  for (const e of p.errors) console.error(`${p.map}: ${e.line ? `line ${e.line}: ` : ''}${e.msg}`)
  for (const w of p.warnings) console.error(`${p.map}: ${w.sector}: ${w.msg}`)
}
if (!r.ok) process.exit(1)

let changed = 0
for (const f of r.files) {
  if (f.path.endsWith('.studio.json')) continue          // the sources
  const out = join(dir, f.path)
  const bytes = typeof f.bytes === 'string' ? Buffer.from(f.bytes, 'utf8') : Buffer.from(f.bytes)
  const same = existsSync(out) && Buffer.compare(readFileSync(out), bytes) === 0
  if (same) continue
  changed++
  if (check) { console.error(`differs: ${f.path}`); continue }
  mkdirSync(dirname(out), { recursive: true })
  writeFileSync(out, bytes)
  console.log(`wrote ${f.path}`)
}
if (check) {
  console.log(changed ? `${dir}: ${changed} generated file(s) differ from the documents` : `${dir}: generated files match the documents`)
  process.exit(changed ? 1 : 0)
}
console.log(`${dir}: ${changed} file(s) written, ${r.files.length - changed} unchanged`)
