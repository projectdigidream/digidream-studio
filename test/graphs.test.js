//
// A map's graph (docs/GRAPHS.md): what the studio writes is what the engine
// loads, declared beside the monster and trigger runtimes and the module file.
//
// Three things have to hold. The file: graphs.load -- the runtime itself --
// accepts the graph the studio writes, with a wall picked for side_is turned
// into the side index and its expect_neighbour guard, as a trigger card's is.
// The checks: what the studio says about a broken graph while it is drawn is
// what the runtime would refuse. And the map: monsters, triggers and a graph
// all declared, within the engine's sixteen script slots, and baked.
//
// ORACLES: graphs.lua loading under build/lua/triggercheck (the trigger
// runtime the graph's verbs come from, in the server's own VM), and mapc
// baking the map that declares the graph.
//
import { readFileSync, writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { newDoc, addSector, addSpawn, CAP } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { makeResolver } from '../src/lua_emit.js'
import { emitGraph, graphProblems, newGraph, pinsOf, nodeSpecs, migrateGraph } from '../src/graphs_emit.js'
import { emitLevel, scriptDecls, RUNTIME_SCRIPTS, MODULE_FILE } from '../src/module_emit.js'
import { toLua } from '../src/lua.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const SCRIPTS = join(ROOT, 'engine', 'maps', 'scripts')
const GV = JSON.parse(readFileSync(join(SCRIPTS, 'graph_vocab.json'), 'utf8'))
const TV = JSON.parse(readFileSync(join(SCRIPTS, 'trigger_vocab.json'), 'utf8'))
const TRIGGERCHECK = join(ROOT, 'engine', 'build', 'lua', 'triggercheck')

const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const doc = newDoc('lifts')
const hall = addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' })
const lift = addSector(doc, rect(16, 0, 24, 8), { floorTex: 'F', ceilTex: 'C', tag: 3 })
addSpawn(doc, 'start', 2, 2)
normalize(doc)
// The hall's wall that the lift sits behind.
const wall = hall.verts.find((v, i) => { const q = hall.verts[(i + 1) % hall.verts.length]; return v.x === 16 && q.x === 16 })?.edge.id

doc.graph = newGraph()
doc.graph.vars = { uses: 0 }
doc.graph.nodes = [
  { id: 'press', type: 'event', event: 'on_interact', pos: { x: 0, y: 0 } },
  { id: 'mine', type: 'condition', c: 'side_is', side: { edge: wall }, pos: { x: 220, y: 0 } },
  { id: 'go', type: 'action', a: 'sector_move', sector: { sector: lift.id }, surface: 'floor', offset: 2, speed: 2, pos: { x: 440, y: 0 } },
  { id: 'count', type: 'add_var', var: 'uses', value: 1, pos: { x: 660, y: 0 } },
  { id: 'later', type: 'delay', ticks: 180, pos: { x: 880, y: 0 } },
  { id: 'back', type: 'action', a: 'sector_move', sector: { sector: lift.id }, surface: 'floor', offset: 0, speed: 2, pos: { x: 1100, y: 0 } },
  { id: 'n', type: 'get_var', var: 'uses', pos: { x: 440, y: 160 } },
  { id: 'many', type: 'compare', op: '>=', b: 3, pos: { x: 660, y: 160 } },
  { id: 'if', type: 'branch', pos: { x: 880, y: 160 } },
  { id: 'say', type: 'action', a: 'log', text: 'the lift is tired', pos: { x: 1100, y: 160 } }
]
doc.graph.links = [
  ['press.then', 'mine.in'], ['mine.true', 'go.in'], ['go.then', 'count.in'], ['count.then', 'if.in'],
  ['n.value', 'many.a'], ['many.value', 'if.cond'], ['if.false', 'later.in'], ['if.true', 'say.in'], ['later.then', 'back.in']
]

// --- the studio's own checks ----------------------------------------------------------------
check(graphProblems(doc.graph, GV, TV).length === 0, `the graph is clean (${graphProblems(doc.graph, GV, TV).join(' | ')})`)
const specs = nodeSpecs(GV)
check(pinsOf({ type: 'sequence', count: 3 }, specs.get('sequence')).execOut.join() === '0,1,2', 'a sequence has as many exits as its count')
const bad = (mutate) => { const g = structuredClone(doc.graph); mutate(g); return graphProblems(g, GV, TV) }
check(bad((g) => g.links.push(['press.then', 'say.in'])).some((p) => /already leads somewhere/.test(p)), 'CONTROL: an exec exit with two links is named')
check(bad((g) => g.links.push(['n.value', 'go.in'])).some((p) => /cannot feed/.test(p)), 'CONTROL: data into an exec input is named')
check(bad((g) => g.links.push(['many.value', 'many.b'])).some((p) => /cycle/.test(p)), 'CONTROL: a value that depends on itself is named')
check(bad((g) => { g.nodes[2].a = 'fly' }).some((p) => /no action 'fly'/.test(p)), 'CONTROL: an action the vocabulary lacks is named')
check(bad((g) => { delete g.nodes[4].ticks }).some((p) => /needs `ticks`/.test(p)), 'CONTROL: a delay without its ticks is named')

// --- the file ---------------------------------------------------------------------------------
const emitted = emitMap(derive(doc), doc, [])
const unresolved = []
const g = emitGraph(doc.graph, doc.name, makeResolver(doc, emitted, { problems: unresolved }))
check(g.problems.length === 0 && unresolved.length === 0, `every place resolved (${[...g.problems, ...unresolved].join(' | ')})`)
const mine = g.json.nodes.find((n) => n.id === 'mine')
const go = g.json.nodes.find((n) => n.id === 'go')
const side = emitted.sideIndex.get(wall)
check(mine.side === side && mine.expect_neighbour === emitted.sectorIndex.get(lift.id),
      `the picked wall is the side index with its neighbour guard (${JSON.stringify(mine)})`)
check(go.sector === emitted.sectorIndex.get(lift.id) && go.expect_tag === 3, `a sector is its index with its tag guard (${JSON.stringify(go)})`)
check(g.json.graph === 1 && g.json.name === 'lifts' && go.meta?.x === 440 && !('pos' in go), 'the layout is the node\'s meta, which the runtime never reads')
check(JSON.parse(g.text).links.length === doc.graph.links.length, 'the links are written as they are')
// A node's place on the board is not its arguments: teleport's x, y, z are.
const tpGraph = { vars: {}, nodes: [{ id: 'press', type: 'event', event: 'on_interact', pos: { x: 0, y: 0 } },
  { id: 'tp', type: 'action', a: 'teleport', x: 3, y: 4, z: 0, pos: { x: 300, y: 50 } }], links: [['press.then', 'tp.in']] }
const tp = emitGraph(tpGraph, 'tp', makeResolver(doc, emitted, { problems: [] })).json.nodes.find((n) => n.id === 'tp')
check(tp.x === 3 && tp.y === 4 && tp.z === 0 && tp.meta?.x === 300, `a teleport keeps where it sends you, apart from where the node sits (${JSON.stringify(tp)})`)
const old = { nodes: [{ id: 'a', type: 'event', event: 'on_tick', x: 10, y: 20 }] }
check(migrateGraph(old) && old.nodes[0].pos.x === 10 && !('x' in old.nodes[0]) && !migrateGraph(old), 'a graph saved with places as x, y is moved to pos, once')

if (!existsSync(TRIGGERCHECK)) {
  console.log('graphs: triggercheck not built (scripts/build_lua_tests.sh) -- the runtime checks are skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-graphs-'))
  // graphs.load in the server's own VM, beside the trigger runtime it needs.
  const loads = (json, name) => {
    const f = join(dir, `${name}.lua`)
    writeFileSync(f, [
      'dofile("maps/scripts/graph_vocab.lua")',
      'dofile("maps/scripts/graphs.lua")',
      `local ok, problems = graphs.load(${toLua(json)}, "${name}")`,
      'if not ok then error(table.concat(problems or {}, "\\n")) end',
      // triggercheck wants a trigger table, and a graph is not one.
      'triggers.load{ name = "carrier", triggers = { { name = "x", event = "on_tick", actions = { { a = "log", text = "x" } } } } }'
    ].join('\n'))
    const r = spawnSync(TRIGGERCHECK, ['.', f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    return { ok: r.status === 0, out: r.stderr + r.stdout }
  }
  const good = loads(g.json, 'lifts')
  check(good.ok, `graphs.load takes the studio's graph:\n${good.out}`)
  const tpLoad = loads(emitGraph(tpGraph, 'tp', makeResolver(doc, emitted, { problems: [] })).json, 'tp')
  check(tpLoad.ok, `and a teleport node with its x, y, z:\n${tpLoad.out}`)
  const broken = structuredClone(g.json)
  broken.links.push(['press.then', 'say.in'])
  check(!loads(broken, 'broken').ok, 'CONTROL: and refuses the exec exit with two links the studio named, so the load above means something')
}

// --- the map: the budget, and a real bake -----------------------------------------------------
const module = { id: 'g', scripts: {}, mobs: { missiles: {}, mobs: { imp: { hp: 10, initial: 'look', states: { look: { anim: 0 } } } } } }
doc.triggers = [{ id: 't1', name: 'hello', event: 'on_interact', actions: [{ a: 'log', text: 'hello' }] }]
const decls = scriptDecls(module, { hasMobs: true, hasTriggers: true, graph: 'lifts.graph.json' })
check(decls.length + 1 <= CAP.scripts, `monsters, triggers and a graph fit the map's ${CAP.scripts} scripts (${decls.length + 1}: ${decls.map((d) => d.split('/').pop()).join(', ')}, lifts.lua)`)
check(decls.includes(MODULE_FILE) && decls.indexOf('lifts.graph.json') < decls.indexOf(MODULE_FILE), 'the module file is declared after the graph, as for any map')
const runtime = {}
for (const name of RUNTIME_SCRIPTS) runtime[name] = readFileSync(join(SCRIPTS, name), 'utf8')
const r = await emitLevel(module, doc, { bake, runtime, hooks: TV.events.map((e) => e.name) })
check(r.ok, `the map with its graph bakes (${r.errors.map((e) => e.msg).join(' | ')})`)
check(/script lifts\.graph\.json/.test(r.mapText) && /script \.\.\/\.\.\/\.\.\/engine\/maps\/scripts\/graphs\.lua/.test(r.mapText), 'the .map declares the graph after its runtime')
check(/script module\.lua/.test(r.mapText) && /triggers\.load/.test(r.luaText) && !/mobs\.load/.test(r.luaText), 'the monsters stay in the module file and the map\'s file holds its own triggers')
check(r.ok && Object.keys(r.copies).some((n) => n.endsWith('.graph.json')), 'mapc copies the graph beside the map, as it does every script')
const plain = { ...doc, graph: undefined, name: 'plain' }
const rp = await emitLevel(module, plain, { bake, runtime })
check(rp.ok && /script module\.lua/.test(rp.mapText) && !/graph/.test(rp.mapText), 'CONTROL: a map without a graph declares no graph runtime')

console.log(`graphs: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
