//
// The module's markers (src/markers.js) and the signs a map hangs (lua_emit.js).
//
// ORACLES: the names and uses read back from a module built here; and for the
// signs, the emitted level script RUN under LuaJIT with `dnp.mark` recording
// what it is given -- so what is checked is what the engine would be called
// with, not the text of the script. Controls: a template the module has is no
// problem; a map with no signs writes no sign block.
//
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { markerNames, markerUses, markerProblems, renameMarker, markerBindings, newMarker, cleanMarkerName, BUILTIN_MARKERS } from '../src/markers.js'
import { emitMapLua } from '../src/lua_emit.js'
import { normalize } from '../src/topology.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

// --- names ------------------------------------------------------------------------------
check(markerNames(null).join() === BUILTIN_MARKERS.join(), 'no layout: the four built-ins')
check(markerNames({ markers: { boss_bar: newMarker(), health: newMarker() } }).join() === 'boss_bar,health,label,marker,debug_health',
  'a layout\'s own come first, and one named like a built-in replaces it rather than listing it twice')
check(cleanMarkerName('Boss Bar!') === 'boss_bar' && cleanMarkerName('') === '', 'a name is a-z, 0-9, _')
check(markerBindings({ elements: [{ type: 'text', text: '{text} ({hp})' }, { type: 'bar', bind: 'value', max: 'max' }] }).sort().join() === 'hp,max,text,value', 'a template reads the values its texts and bindings name')

// --- uses, problems, a rename -----------------------------------------------------------
const module = {
  ui: { markers: { boss_bar: newMarker() } },
  mobs: { missiles: {}, mobs: { boss: { health_bar: 'boss_bar' }, grunt: { health_bar: 'health' }, ghost: { health_bar: 'nope' } } },
  graphs: { game: { nodes: [{ id: 'm1', type: 'mark', marker: 'goal', template: 'marker' }] } },
  scripts: { quest: "local id = dnp.mark(p, 'quest_pin', { text = 'Here' })" }
}
const docs = {
  first: { entities: [{ id: 'n1', kind: 'sign', name: 'label', text: 'EXIT', x: 1, y: 2, z: 0 }, { id: 'n2', kind: 'sign', name: 'boss_bar', x: 0, y: 0, z: 0 }],
           graphs: { main: { nodes: [{ id: 'k', type: 'mark', marker: 'b', template: 'gone' }] } } },
  own: { ui: { markers: {} }, entities: [{ id: 'n3', kind: 'sign', name: 'boss_bar', x: 0, y: 0, z: 0 }] }
}
const uses = markerUses(module, docs)
check(uses.get('boss_bar')?.map((u) => u.kind).sort().join() === 'monster,sign,sign', `boss_bar: worn by a monster and on two signs (${JSON.stringify(uses.get('boss_bar'))})`)
check(uses.get('marker')?.[0]?.kind === 'graph' && uses.get('gone')?.[0]?.map === 'first', 'a graph\'s mark node, the game\'s or a map\'s, hangs its template')
check(uses.get('quest_pin')?.[0]?.kind === 'script', 'a script\'s dnp.mark is found by reading it')
const probs = markerProblems(module, docs)
check(probs.some((p) => /^ghost: .*"nope"/.test(p)), 'a monster wearing a marker nobody made is named')
check(probs.some((p) => /first's graph main: .*"gone"/.test(p)), 'so is a graph hanging one')
check(probs.some((p) => /a sign on own: .*"boss_bar".*own's own screens do not have/.test(p)), 'a map with screens of its own is checked against them')
check(probs.some((p) => /^boss: .*the screens of own do not have/.test(p)), 'and a monster, which walks every map, is named when one map lacks its bar')
check(!probs.some((p) => /grunt|"label"|"marker"|quest_pin/.test(p)), `CONTROL: built-ins and what a script names are no problem (${probs.join(' | ')})`)
renameMarker(module, docs, 'boss_bar', 'big_bar')
check(module.mobs.mobs.boss.health_bar === 'big_bar' && docs.first.entities[1].name === 'big_bar' && docs.own.entities[0].name === 'big_bar', 'a rename follows the monsters and the signs that hang it')

// --- a map's signs, as the engine is called with them -----------------------------------
const doc = { name: 'first', sectors: {}, order: [], entities: [
  { id: 'n1', kind: 'sign', name: 'label', text: 'EXIT', x: 3.5, y: -2, z: 1, height: 1.5 },
  { id: 'n2', kind: 'sign', name: 'marker', x: 10, y: 4, z: 0, range: 24, through: true, debug: true },
  { id: 'n3', kind: 'prop', name: 'barrel', x: 0, y: 0, z: 0 }
], triggers: [], spawns: [], lights: [] }
normalize(doc)
const lua = emitMapLua(doc, { sectorIndex: new Map(), edgeIndex: new Map() }).text
const block = /-- >>> level editor: signs\n([\s\S]*?)\n-- <<< level editor: signs/.exec(lua)?.[1]
check(!!block, 'a map with signs writes a block that hangs them')
const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')
if (block && existsSync(LUAJIT)) {
  const f = join(mkdtempSync(join(tmpdir(), 'dnp-signs-')), 'signs.lua')
  writeFileSync(f, `local calls = {}
fx = { frac = function (n, d) return n / d end }
vec3 = { new = function (x, y, z) return { x = x, y = y, z = z } end }
dnp = { mark = function (on, t, v, o) calls[#calls + 1] = { on = on, t = t, v = v, o = o } return #calls end }
${block}
for _, c in ipairs(calls) do
  print(c.t, c.on.x, c.on.y, c.on.z, tostring(c.v.text), tostring(c.o.height), tostring(c.o.range), tostring(c.o.through_walls), tostring(c.o.debug))
end
`)
  const r = spawnSync(LUAJIT, [f], { encoding: 'utf8' })
  const got = (r.stdout ?? '').trim().split('\n')
  check(got.length === 2, `two signs hung, the barrel not (${r.stdout}${r.stderr})`)
  check(got[0] === 'label\t3.5\t-2\t1\tEXIT\t1.5\tnil\tnil\tnil', `the label, at its place, reading EXIT, raised by 1.5 (${got[0]})`)
  check(got[1] === 'marker\t10\t4\t0\tnil\tnil\t24\ttrue\ttrue', `the pointer: no text, seen within 24, through walls, debug only (${got[1]})`)
} else if (block) console.log('markers: no luajit -- the sign block is not run')
const plain = { name: 'second', sectors: {}, order: [], entities: [{ id: 'n1', kind: 'mob', name: 'imp', x: 0, y: 0, z: 0 }], triggers: [], spawns: [], lights: [] }
normalize(plain)
check(!/level editor: signs/.test(emitMapLua(plain, { sectorIndex: new Map(), edgeIndex: new Map() }).text), 'CONTROL: a map with no signs writes no sign block')

console.log(`markers: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
