//
// A refused bake points at the rooms it is about.
//
// mapc names a place by the .map line, by sector index or by side index; the
// studio traces each back through the tables its emitter kept, so the
// viewport can mark the room in red. Measured against what mapc really says
// for maps that are really wrong, not against messages written here.
//
// ORACLE: engine/build/<arch>/mapc.
//
import { newDoc, addSector, addSpawn, validate } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { sectorProblems, nameSectors } from '../src/problems.js'
import { requireOracles, bakeNative } from './oracle.js'

requireOracles('problems', { core: false })

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
/** Bake a document with native mapc and trace its complaints. */
const traced = (doc) => {
  normalize(doc)
  const derived = derive(doc)
  const emitted = emitMap(derived, doc, [])
  const r = bakeNative(emitted.text, doc.name)
  // The studio's bake.js parse: `N: msg` is a line, anything else line 0.
  const errors = r.stderr.split('\n').map((line) => { const m = /^(\d+): (.*)$/.exec(line); return m ? { line: Number(m[1]), msg: m[2] } : { line: 0, msg: line } })
  const extra = [...validate(doc).filter((p) => p.sector), ...derived.warnings.map((w) => ({ ...w, level: 'warn' }))]
  return { ok: r.ok, stderr: r.stderr, problems: sectorProblems(r.ok ? [] : errors, emitted, extra) }
}

// --- by sector index: two rooms that overlap -------------------------------------------
{
  const doc = newDoc('overlap')
  const a = addSector(doc, rect(0, 0, 8, 8))
  const b = addSector(doc, rect(4, 4, 12, 12))
  const c = addSector(doc, rect(20, 0, 28, 8))
  addSpawn(doc, 'start', 1, 1)
  const t = traced(doc)
  const rooms = new Set(t.problems.map((p) => p.sector))
  check(!t.ok && /overlaps/.test(t.stderr), `mapc refuses two rooms that overlap (${t.stderr.split('\n')[0]})`)
  check(rooms.has(a.id) && rooms.has(b.id), `both rooms it names are marked (${[...rooms].join(', ')})`)
  check(!rooms.has(c.id), 'CONTROL: the room it does not name is not')
  const p = t.problems.find((x) => x.sector === a.id)
  check(/starting at corner/.test(p?.msg ?? ''), `the explanation's next line stays with it (${p?.msg?.slice(0, 120)})`)
  check(new RegExp(`sector ${a.id}\\b`).test(p?.msg ?? '') && new RegExp(`sector ${b.id}\\b`).test(p?.msg ?? '') && !/sector \d/.test(p?.msg ?? ''),
        `and it names the rooms as the studio does, not by mapc's numbering (${p?.msg?.slice(0, 60)})`)
}

// --- by line: a key an effect does not take ----------------------------------------------
{
  const doc = newDoc('badline')
  const a = addSector(doc, rect(0, 0, 8, 8))
  const b = addSector(doc, rect(8, 0, 16, 8))
  b.fx = [{ kind: 'snow', params: { falloff: 1 } }]
  addSpawn(doc, 'start', 1, 1)
  const t = traced(doc)
  check(!t.ok && /^\d+: /m.test(t.stderr), `mapc refuses it by line (${t.stderr.split('\n')[0]})`)
  check(t.problems.length >= 1 && t.problems.every((p) => p.sector === b.id), `the line is traced to the room it is in (${t.problems.map((p) => p.sector).join(', ')}, wanted ${b.id})`)
  check(!t.problems.some((p) => p.sector === a.id), 'CONTROL: and not to its neighbour')
}

// --- the studio's own checks, and a map that is fine ----------------------------------------
{
  const doc = newDoc('checks')
  const a = addSector(doc, rect(0, 0, 8, 8))
  addSector(doc, rect(8, 0, 16, 8))
  a.ceil = -1
  addSpawn(doc, 'start', 1, 1)
  const t = traced(doc)
  check(t.problems.some((p) => p.sector === a.id && /below floor/.test(p.msg)), 'a room the studio\'s own check refuses is marked too')
  const fine = newDoc('fine')
  addSector(fine, rect(0, 0, 8, 8))
  addSector(fine, rect(8, 0, 16, 8))
  addSpawn(fine, 'start', 1, 1)
  const f = traced(fine)
  check(f.ok && f.problems.length === 0, 'CONTROL: a map that bakes marks nothing')
}

// --- a message naming no place marks nothing --------------------------------------------------
check(sectorProblems([{ line: 0, msg: 'cannot open the file' }], null).length === 0, 'a complaint that names no place is not guessed at')

console.log(`problems: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
