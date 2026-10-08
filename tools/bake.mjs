#!/usr/bin/env node
//
// Bake one source in node, as the studio bakes it in a page (docs/PLUGINS.md, Bakers):
//
//   node studio/tools/bake.mjs <file> [--key NAME] [--kind file:texture|file:tsprite] [-o dir]
//
// Prints each file it makes with its SHA-256 -- the same hashes a page's
// Worker gives, which is what lets a bake be cached by its source -- and
// writes them under -o when given. The kind is guessed from the extension.
//
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs'
import { join, dirname, basename } from 'node:path'
import { Baker, BUILTIN_BAKERS, sha256 } from '../src/bake/run.js'

const args = process.argv.slice(2)
const opt = (name) => { const i = args.indexOf(name); return i >= 0 ? args.splice(i, 2)[1] : null }
const out = opt('-o')
let kind = opt('--kind')
let key = opt('--key')
const file = args[0]
if (!file) { console.error('usage: bake.mjs <file> [--key NAME] [--kind KIND] [-o dir]'); process.exit(2) }
if (!kind) kind = /\.tsprite$/i.test(file) ? 'file:tsprite' : /\.texproj\.json$/i.test(file) ? 'file:texture' : null
if (!kind) { console.error(`${file}: say --kind; the extension does not tell`); process.exit(2) }
key ??= basename(file).replace(/\.(tsprite|texproj\.json)$/i, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)

const baker = new Baker({ bakersFor: (k) => BUILTIN_BAKERS.filter((b) => b.kinds.includes(k)) })
const r = await baker.bake(kind, key, new Uint8Array(readFileSync(file)))
if (!r.ok) { console.error(r.error); process.exit(1) }
for (const [path, bytes] of Object.entries(r.files)) {
  console.log(`${path}  ${bytes.length} bytes  ${await sha256(bytes)}`)
  if (out) { mkdirSync(dirname(join(out, path)), { recursive: true }); writeFileSync(join(out, path), bytes) }
}
for (const p of r.problems) console.log(`  ${p}`)
console.log(`${r.baker} ${r.version}, from ${r.hash.slice(0, 16)}…`)
