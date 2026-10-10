#!/usr/bin/env node
//
// The studio's templates: a module's sources, packed into the studio.
//   starter    what a new module is a copy of
//   gemhollow  Gem Hollow, the example project Home offers to open (a copy too)
//
//   node studio/tools/make_template.mjs [id ...]          write studio/src/templates/<id>.zip
//   node studio/tools/make_template.mjs [id ...] --check  exit 1 if one differs from modules/<id>
//
// A new module is a copy of this, not of the store's 'starter' -- that one is
// the user's to edit or delete. The zip ships with the studio's pages (under
// src/, which every build copies), so each studio version carries the starter
// it was made with, and nothing in the studio can change it.
//
// The same files a store record is made of (recordFromEntries in main.js):
// the documents, the pictures and sheets, the sound sources.
//
import { readFileSync, writeFileSync, readdirSync, statSync, existsSync, mkdirSync } from 'node:fs'
import { join, dirname, resolve, relative } from 'node:path'
import { fileURLToPath } from 'node:url'
import { writePack, readPack } from '../src/pack.js'

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), '..', '..')
export const TEMPLATES = ['starter', 'gemhollow']
const check = process.argv.includes('--check')
const asked = process.argv.slice(2).filter((a) => !a.startsWith('--'))

/** The template's files: what the studio's store keeps of a module. */
function isTemplateFile (rel) {
  return rel === 'module.studio.json' || /^maps\/[^/]+\.studio\.json$/.test(rel) ||
    (rel.startsWith('assets/') && /\.(png|json|mstk|sfxproj)$/.test(rel) && !/(^|\/)index\.json$/.test(rel)) ||
    rel.startsWith('sources/')
}

function walk (dir) {
  const out = []
  for (const name of readdirSync(dir).sort()) {
    const p = join(dir, name)
    if (statSync(p).isDirectory()) out.push(...walk(p))
    else out.push(p)
  }
  return out
}

let failed = 0
for (const id of asked.length ? asked : TEMPLATES) await one(id)
process.exit(failed ? 1 : 0)

async function one (id) {
  const SRC = join(ROOT, 'modules', id)
  const OUT = join(ROOT, 'studio', 'src', 'templates', `${id}.zip`)
  const entries = walk(SRC).map((p) => relative(SRC, p).split('\\').join('/')).filter(isTemplateFile)
    .map((path) => ({ path, bytes: new Uint8Array(readFileSync(join(SRC, path))) }))

  if (check) {
    const have = existsSync(OUT) ? await readPack(new Uint8Array(readFileSync(OUT))) : []
    const byPath = new Map(have.map((e) => [e.path, e.bytes]))
    const differs = []
    for (const e of entries) {
      const b = byPath.get(e.path)
      if (!b || Buffer.compare(Buffer.from(b), Buffer.from(e.bytes)) !== 0) differs.push(e.path)
      byPath.delete(e.path)
    }
    differs.push(...[...byPath.keys()].map((p) => `${p} (not in modules/${id})`))
    for (const d of differs) console.error(`differs: ${d}`)
    console.log(differs.length ? `the ${id} template is out of date (${differs.length} file(s)): run node studio/tools/make_template.mjs ${id}`
      : `the ${id} template matches modules/${id} (${entries.length} files)`)
    if (differs.length) failed++
    return
  }

  mkdirSync(dirname(OUT), { recursive: true })
  writeFileSync(OUT, await writePack(entries))
  console.log(`wrote ${relative(ROOT, OUT)}: ${entries.length} files, ${(statSync(OUT).size / 1024).toFixed(0)} KB`)
}
