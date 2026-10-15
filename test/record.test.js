// A MODULE'S RECORD AND ITS FILES (src/record.js): recordToEntries is the
// exact inverse of recordFromEntries, nothing baked is written, and the same
// content gives the same bytes -- what a sync needs so that an unchanged file
// never looks changed. On the three modules the studio ships.
//
//   node studio/test/record.test.js

import { readFileSync } from 'node:fs'
import { readPack } from '../src/pack.js'
import { recordFromEntries, recordToEntries, stableJson } from '../src/record.js'

const name = 'record'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

const sameEntries = (a, b) => a.length === b.length && a.every((e, i) => e.path === b[i].path && e.bytes.length === b[i].bytes.length && e.bytes.every((x, j) => x === b[i].bytes[j]))

for (const t of ['starter', 'gemhollow', 'cinderfall']) {
  const pack = await readPack(new Uint8Array(readFileSync(new URL(`../src/templates/${t}.zip`, import.meta.url))))
  const prefix = pack.find((e) => e.path === 'module.studio.json' || e.path.endsWith('/module.studio.json')).path.replace(/module\.studio\.json$/, '')
  const rec = recordFromEntries(pack.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), bytes: e.bytes })))
  const files = await recordToEntries(rec)
  const again = recordFromEntries(files)
  check(JSON.stringify(again.module) === JSON.stringify(JSON.parse(stableJson(rec.module))) &&
        Object.keys(again.docs).sort().join() === Object.keys(rec.docs).sort().join() &&
        Object.keys(again.assets).sort().join() === Object.keys(rec.assets).sort().join(),
        `${t}: the files read back as the same record (${files.length} files, ${Object.keys(rec.docs).length} maps, ${Object.keys(rec.assets).length} assets)`)
  const twice = await recordToEntries(again)
  check(sameEntries(files, twice), `${t}: written again, the same bytes, file for file`)
  check(files.every((f, i) => i === 0 || files[i - 1].path < f.path), `${t}: files in path order`)
  check(!files.some((f) => /\.(dnpm|lua|map)$|(^|\/)(props\.txt|index\.json)$|^assets\/sounds\/bank\.sfxproj$|^assets\/ui\/[^/]+\.json$/.test(f.path)), `${t}: nothing baked or generated is written`)
  check(files.some((f) => f.path === 'module.studio.json') && files.some((f) => /^maps\/.+\.studio\.json$/.test(f.path)), `${t}: the module and its maps are there`)
}

// The same content, built in a different order, is the same text.
check(stableJson({ b: 1, a: { d: [3, { y: 1, x: 2 }], c: 2 } }) === stableJson({ a: { c: 2, d: [3, { x: 2, y: 1 }] }, b: 1 }), 'keys in any order give one text (arrays keep theirs)')
check(stableJson({ a: 1, gone: undefined }) === '{\n  "a": 1\n}\n', 'pretty-printed, a final newline, an undefined key left out')
// CONTROL: the inverse really is checked -- a changed byte is seen.
{
  const pack = await readPack(new Uint8Array(readFileSync(new URL('../src/templates/starter.zip', import.meta.url))))
  const prefix = pack.find((e) => e.path === 'module.studio.json' || e.path.endsWith('/module.studio.json')).path.replace(/module\.studio\.json$/, '')
  const rec = recordFromEntries(pack.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), bytes: e.bytes })))
  const a = await recordToEntries(rec)
  rec.module.name = rec.module.name + '!'
  check(!sameEntries(a, await recordToEntries(rec)), 'CONTROL: a changed name changes the bytes')
}

console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
