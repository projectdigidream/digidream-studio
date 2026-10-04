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
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { newDoc, addSector, addSpawn, addPath, addPathPoint, CAP } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { makeResolver } from '../src/lua_emit.js'
import { emitGraph, graphProblems, newGraph, pinsOf, nodeSpecs, migrateGraph, migrateGraphs, graphsOf, liveGraphs, gameGraphFile, graphFile, parseGraphRoute, graphRoute } from '../src/graphs_emit.js'
import { emitLevel, emitModule, scriptDecls, moduleTxt, gameScripts, newModule, RUNTIME_SCRIPTS, MODULE_FILE } from '../src/module_emit.js'
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

// A graph as the server's JSON decoder hands it to Lua: a decimal is a plain
// number there (engine/server/src/lua/json.cpp), which toLua -- written for
// the studio's exact fixed-point tables -- refuses on purpose.
const luaOfJson = (v) => {
  if (v === null || v === undefined) return 'nil'
  if (typeof v === 'number') return String(v)
  if (typeof v !== 'object') return toLua(v)
  if (Array.isArray(v)) return `{ ${v.map(luaOfJson).join(', ')} }`
  return `{ ${Object.entries(v).map(([k, x]) => `[${JSON.stringify(k)}] = ${luaOfJson(x)}`).join(', ')} }`
}

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

// --- pins on a verb's arguments, calls, and the game's graph -----------------------------------
const lp = pinsOf({ type: 'action', a: 'counter_add' }, specs.get('action'), TV, GV)
check(lp.argPins.join() === 'counter,by' && lp.dataIn.includes('by'), `an action's pinnable arguments are data inputs (${lp.argPins.join()})`)
check(pinsOf({ type: 'condition', c: 'side_is' }, specs.get('condition'), TV, GV).argPins.every((x) => x !== 'side' && x !== 'expect_neighbour'),
      'what the studio writes itself (a side, its guard) has no pin')
// A level's graph: the game calls it with a value, which sets a counter's step.
const levelGraph = { vars: {}, nodes: [
  { id: 'heard', type: 'on_call', name: 'reward', pos: { x: 0, y: 0 } },
  { id: 'add', type: 'action', a: 'counter_add', counter: 'gold', pos: { x: 260, y: 0 } },
  { id: 'say', type: 'action', a: 'log', text: 'rewarded', pos: { x: 520, y: 0 } }
], links: [['heard.then', 'add.in'], ['heard.value', 'add.by'], ['add.then', 'say.in']] }
check(graphProblems(levelGraph, GV, TV).length === 0, `an on_call feeding an argument is clean (${graphProblems(levelGraph, GV, TV).join(' | ')})`)
const unlinked = structuredClone(levelGraph); delete unlinked.nodes[1].counter
unlinked.links.push(['heard.value', 'add.counter']); unlinked.links = unlinked.links.filter(([, t]) => t !== 'add.by')
check(graphProblems(unlinked, GV, TV).length === 0, 'a required argument a link supplies needs no literal')
unlinked.links = unlinked.links.filter(([, t]) => t !== 'add.counter')
check(graphProblems(unlinked, GV, TV).some((p) => /needs `counter`/.test(p)), 'CONTROL: unlinked again, it is missed')
// The game's graph: a player arrives, a counter goes up, the level is called.
const gameGraph = { vars: { arrivals: 0 }, nodes: [
  { id: 'came', type: 'event', event: 'on_player_enter', pos: { x: 0, y: 0 } },
  { id: 'n', type: 'add_var', var: 'arrivals', value: 1, pos: { x: 260, y: 0 } },
  { id: 'tell', type: 'call', to: 'level', name: 'reward', value: 5, pos: { x: 520, y: 0 } }
], links: [['came.then', 'n.in'], ['n.then', 'tell.in'], ['came.entity', 'tell.entity']] }
check(graphProblems(gameGraph, GV, TV, { game: true }).length === 0, `the game's graph is clean as one (${graphProblems(gameGraph, GV, TV, { game: true }).join(' | ')})`)
check(graphProblems(gameGraph, GV, TV).some((p) => /on_player_enter/.test(p)), 'CONTROL: as a level\'s, its on_player_enter is named')
const levelVerb = structuredClone(gameGraph)
levelVerb.nodes.push({ id: 'lift', type: 'action', a: 'sector_move', sector: 1, surface: 'floor', offset: 2, speed: 2, pos: { x: 780, y: 0 } })
levelVerb.links.push(['tell.then', 'lift.in'])
check(graphProblems(levelVerb, GV, TV, { game: true }).some((p) => /acts on a level/.test(p) && /call/.test(p)), 'CONTROL: a level\'s action in the game\'s graph is named, with a call as the way')
check(graphProblems({ nodes: [{ id: 'e', type: 'event', event: 'on_interact' }], links: [] }, GV, TV, { game: true }).some((p) => /does not reach the game/.test(p)),
      'CONTROL: an event the game never hears is named')
// show: the editor's, into meta.
const shown = emitGraph({ nodes: [{ id: 'h', type: 'action', a: 'set_hp', show: ['add'], pos: { x: 1, y: 2 } }], links: [] }, 's', null).json.nodes[0]
check(!('show' in shown) && shown.meta?.show?.[0] === 'add', 'which optional arguments the board shows goes in meta')
// The module: shared runtimes, then the graph, as module.txt game lines.
const gm = newModule('gg', 'gg'); gm.graph = gameGraph
const txt = moduleTxt(gm)
check(/^game trigger_vocab\.lua shared\ngame triggers\.lua shared\ngame graph_vocab\.lua shared\ngame graphs\.lua shared\ngame module\.game\.graph\.json$/m.test(txt),
      `module.txt runs the runtimes shared and then the game's graph (${gameScripts(gm).join(', ')})`)
check(!/graph/.test(moduleTxt(newModule('p', 'p'))), 'CONTROL: a module without one says nothing of it')

// --- the world's nodes: said the way a designer says it ---------------------------------------
// Stepping into the lift's room opens it; the hall's wall shows a lit switch;
// being near the start hurts by a linked amount.
const worldGraph = { vars: {}, nodes: [
  { id: 'in', type: 'when_sector_entered', sector: { sector: lift.id }, pos: { x: 0, y: 0 } },
  { id: 'open', type: 'open_door', sector: { sector: lift.id }, speed: 'fast', close_after: 4, pos: { x: 260, y: 0 } },
  { id: 'lit', type: 'set_wall_texture', side: { edge: wall }, texture: 'SW1ON', pos: { x: 520, y: 0 } },
  { id: 'near', type: 'when_near', x: 2, y: 2, radius: 1.5, pos: { x: 0, y: 200 } },
  { id: 'where', type: 'sector_of', pos: { x: 0, y: 360 } },
  { id: 'up', type: 'move_floor', to: 'up_by', amount: 2, pos: { x: 260, y: 200 } },
  { id: 'five', type: 'literal', value: 5, pos: { x: 260, y: 360 } },
  { id: 'hurt', type: 'damage', pos: { x: 520, y: 200 } }
], links: [['in.then', 'open.in'], ['open.then', 'lit.in'], ['near.near', 'up.in'], ['near.entity', 'where.entity'], ['where.sector', 'up.sector'],
  ['up.then', 'hurt.in'], ['five.value', 'hurt.amount']] }
check(graphProblems(worldGraph, GV, TV).length === 0, `the world's nodes are clean (${graphProblems(worldGraph, GV, TV).join(' | ')})`)
check(pinsOf(worldGraph.nodes[7], specs.get('damage'), TV, GV).argPins.join() === 'amount' && pinsOf(worldGraph.nodes[5], specs.get('move_floor'), TV, GV).argPins.join() === 'sector,amount',
      'a world node\'s input named after an argument is that argument\'s pin')
const wbad = (mutate, opts) => { const g = structuredClone(worldGraph); mutate(g); return graphProblems(g, GV, TV, opts) }
check(wbad((g) => { g.links = g.links.filter(([, t]) => t !== 'up.sector') }).some((p) => /needs a sector/.test(p)), 'CONTROL: a sector node with no sector, link or tag is named')
check(wbad((g) => { g.nodes[3].radius = '1.5' }).some((p) => /should be a number/.test(p)), 'CONTROL: a number written as words is named')
check(wbad(() => {}, { game: true }).some((p) => /open_door acts on a level/.test(p)), 'CONTROL: in the game\'s graph, what needs a level is named')
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

const wfile = emitGraph(worldGraph, 'world', makeResolver(doc, emitted, { problems: [] }), makeResolver(doc, emitted, { guards: false, problems: [] }))
const wn = (id) => wfile.json.nodes.find((n) => n.id === id)
check(wn('open').sector === emitted.sectorIndex.get(lift.id) && !('expect_tag' in wn('open')) && wn('lit').side === emitted.sideIndex.get(wall) && !('expect_neighbour' in wn('lit')),
      `a picked room or wall is its bare index on a world node (${JSON.stringify([wn('open'), wn('lit')])})`)

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
      `local ok, problems = graphs.load(${luaOfJson(json)}, "${name}")`,
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
  // The game's graph in the game VM (dnp.is_game), and a level's answering it.
  const gameLoads = (json, name) => {
    const f = join(dir, `${name}.lua`)
    writeFileSync(f, [
      'dnp = dnp or {}', 'dnp.is_game = function() return true end',
      'dofile("maps/scripts/graph_vocab.lua")',
      'dofile("maps/scripts/graphs.lua")',
      `local ok, problems = graphs.load(${luaOfJson(json)}, "${name}")`,
      'if not ok then error(table.concat(problems or {}, "\\n")) end',
      'triggers.load{ name = "carrier", triggers = { { name = "x", event = "on_tick", actions = { { a = "log", text = "x" } } } } }'
    ].join('\n'))
    const r = spawnSync(TRIGGERCHECK, ['.', f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    return { ok: r.status === 0, out: r.stderr + r.stdout }
  }
  const gl = gameLoads(emitGraph(gameGraph, 'module', null).json, 'game1')
  check(gl.ok, `graphs.load takes the studio's game graph in the game VM:\n${gl.out}`)
  const gbad = gameLoads(emitGraph(levelVerb, 'module', null).json, 'game2')
  check(!gbad.ok && /acts on a level/.test(gbad.out), `CONTROL: and refuses a level's action there, as the studio said:\n${gbad.out.slice(0, 300)}`)
  const ll = loads(emitGraph(levelGraph, 'lvl', null).json, 'lvl')
  check(ll.ok, `a level's on_call feeding an argument loads:\n${ll.out}`)
  const ul = structuredClone(emitGraph(levelGraph, 'lvl', null).json)
  ul.links = ul.links.filter(([, t]) => t !== 'add.by'); ul.links.push(['heard.value', 'add.counter']); delete ul.nodes[1].counter
  check(loads(ul, 'lvl2').ok, 'and one whose required argument comes from a link')
  ul.links = ul.links.filter(([, t]) => t !== 'add.counter')
  check(!loads(ul, 'lvl3').ok, 'CONTROL: refused once nothing supplies it')

  const wl = loads(wfile.json, 'world')
  check(wl.ok, `graphs.load takes the world's nodes:\n${wl.out}`)
  const wg = gameLoads(emitGraph({ vars: {}, nodes: [{ id: 'came', type: 'when_player_arrives' }, { id: 'heal', type: 'heal', amount: 10 }, { id: 'tick', type: 'every', seconds: 2 }, { id: 'say', type: 'action', a: 'log', text: 'x' }],
    links: [['came.then', 'heal.in'], ['tick.then', 'say.in']] }, 'module', null).json, 'game3')
  check(wg.ok, `and the game's graph takes the designer's nodes that need no level:\n${wg.out}`)
  const wgBad = gameLoads(emitGraph({ vars: {}, nodes: [{ id: 'came', type: 'when_player_arrives' }, { id: 'open', type: 'open_door', tag: 3 }], links: [['came.then', 'open.in']] }, 'module', null).json, 'game4')
  check(!wgBad.ok && /acts on a level/.test(wgBad.out), 'CONTROL: and refuses a door there, as the studio said')

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
check(/script lifts\.main\.graph\.json/.test(r.mapText) && /script \.\.\/\.\.\/\.\.\/engine\/maps\/scripts\/graphs\.lua/.test(r.mapText), 'the .map declares the graph after its runtime')
check(/script module\.lua/.test(r.mapText) && /triggers\.load/.test(r.luaText) && !/mobs\.load/.test(r.luaText), 'the monsters stay in the module file and the map\'s file holds its own triggers')
check(r.ok && Object.keys(r.copies).some((n) => n.endsWith('.graph.json')), 'mapc copies the graph beside the map, as it does every script')
const plain = { ...doc, graph: undefined, name: 'plain' }
const rp = await emitLevel(module, plain, { bake, runtime })
check(rp.ok && /script module\.lua/.test(rp.mapText) && !/graph/.test(rp.mapText), 'CONTROL: a map without a graph declares no graph runtime')

// --- many graphs, each with its own name --------------------------------------------------------
const old1 = { name: 'm', sectors: {}, graph: levelGraph }
const old2 = { id: 'mod', graph: gameGraph }
check(migrateGraphs(old1, 'main') && old1.graphs.main === levelGraph && !('graph' in old1) && !migrateGraphs(old1, 'main') && migrateGraphs(old2, 'game') && old2.graphs.game,
      'a map\'s one graph becomes its graph "main", the module\'s its "game", once')
check(graphsOf({ sectors: {}, graph: levelGraph })[0][0] === 'main' && graphsOf({ id: 'x', graph: gameGraph })[0][0] === 'game', 'a document not yet moved reads as that one graph, under the name it will move to')
check(liveGraphs({ graphs: { a: levelGraph, empty: newGraph() } }).map(([n]) => n).join() === 'a', 'an empty graph is kept in the document and not written')
check(graphFile('alley', 'world') === 'alley.world.graph.json' && gameGraphFile('greeter') === 'module.greeter.graph.json', 'a map\'s graph is <map>.<name>.graph.json, the module\'s module.<name>.graph.json')
check(JSON.stringify(parseGraphRoute(graphRoute('map', 'alley', 'world'))) === JSON.stringify({ scope: 'map', map: 'alley', name: 'world' }) &&
      parseGraphRoute('game:greeter').scope === 'game' && parseGraphRoute('game').name === null, 'a graph\'s address goes there and back')
const twoDecls = scriptDecls(module, { hasMobs: true, hasTriggers: true, graphs: ['lifts.doors.graph.json', 'lifts.boss.graph.json'] })
check(twoDecls.indexOf('lifts.doors.graph.json') > -1 && twoDecls.indexOf('lifts.boss.graph.json') === twoDecls.indexOf('lifts.doors.graph.json') + 1 && twoDecls.filter((d) => d.endsWith('graphs.lua')).length === 1,
      'a map with two graphs declares both, after one copy of their runtime')

// The module: two graphs for the game, and a map with two of its own.
const greeter = { vars: {}, nodes: [{ id: 'hi', type: 'when_player_arrives', pos: { x: 0, y: 0 } }, { id: 'say', type: 'action', a: 'log', text: 'hello', pos: { x: 260, y: 0 } }], links: [['hi.then', 'say.in']] }
gm.graphs = { game: gameGraph, greeter }
delete gm.graph
const two = moduleTxt(gm)
check(/^game module\.game\.graph\.json\ngame module\.greeter\.graph\.json$/m.test(two) && (two.match(/graphs\.lua shared/g) ?? []).length === 1,
      `module.txt runs each of the game's graphs, after one copy of the runtimes (${gameScripts(gm).join(', ')})`)
// A cutscene: a map with a camera path, and a graph that takes the controls,
// flies the path, speaks two lines and gives everything back.
const film = structuredClone(plain)
film.name = 'film'
const rail = addPath(film, 4)
for (const [x, y] of [[2, 2], [10, 3], [14, 6]]) addPathPoint(film, rail, x, y, 2)
const cutscene = { vars: {}, nodes: [
  { id: 'go', type: 'when_player_arrives', pos: { x: 0, y: 0 } },
  { id: 'cut', type: 'start_cinematic', pos: { x: 260, y: 0 } },
  { id: 'fly', type: 'camera_flythrough', path: 4, speed: 4, pos: { x: 520, y: 0 } },
  { id: 'line', type: 'subtitle', text: 'Welcome.', speaker: 'Guide', pos: { x: 520, y: 200 } },
  { id: 'dark', type: 'fade', to: 'black', seconds: 0.5, pos: { x: 780, y: 0 } },
  { id: 'out', type: 'end_cinematic', pos: { x: 1040, y: 0 } },
  { id: 'clear', type: 'fade', to: 'clear', pos: { x: 1300, y: 0 } },
  { id: 'shake', type: 'camera_shake', pos: { x: 780, y: 200 } },
  { id: 'back', type: 'camera_follow', distance: 12, pos: { x: 1040, y: 200 } }
], links: [['go.then', 'cut.in'], ['cut.then', 'fly.in'], ['fly.then', 'line.in'], ['fly.done', 'dark.in'], ['dark.done', 'out.in'], ['out.then', 'clear.in'],
  ['line.done', 'shake.in'], ['shake.then', 'back.in']] }
const filmPaths = new Set(film.paths.map((x) => x.tag))
check(graphProblems(cutscene, GV, TV, { paths: filmPaths }).length === 0, `a cutscene is clean on a map with its path (${graphProblems(cutscene, GV, TV, { paths: filmPaths }).join(' | ')})`)
const lost = structuredClone(cutscene); lost.nodes[2].path = 9
check(graphProblems(lost, GV, TV, { paths: filmPaths }).some((p) => /no camera path with tag 9/.test(p)), 'CONTROL: a path the map lacks is named')
check(graphProblems(cutscene, GV, TV, { game: true }).some((p) => /camera_flythrough acts on a level/.test(p)), 'CONTROL: a flythrough in the game\'s graph is named: the game has no paths')
film.graphs = { intro: cutscene }
const filmLost = { ...structuredClone(film), name: 'lost', graphs: { intro: lost } }

const em = await emitModule(gm, [{ ...plain, name: 'alley', graphs: { world: worldGraph, reward: levelGraph } }, { ...plain, name: 'answers', graphs: { main: levelGraph } }], { bake, runtime })
const paths = em.files.map((f) => f.path)
check(em.ok && ['module.game.graph.json', 'module.greeter.graph.json', 'alley.world.graph.json', 'alley.reward.graph.json', 'answers.main.graph.json'].every((n) => paths.includes(`maps/${n}`)) &&
      ['triggers.lua', 'graphs.lua', 'graph_vocab.lua', 'trigger_vocab.lua'].every((n) => paths.includes(`maps/${n}`)),
      `the module carries every graph as its own file, and the runtimes beside them (${em.problems.map((p) => JSON.stringify(p)).join(' | ')})`)
const alleyMap = String(em.files.find((f) => f.path === 'maps/alley.map').bytes)
check(/script alley\.world\.graph\.json/.test(alleyMap) && /script alley\.reward\.graph\.json/.test(alleyMap), 'the map declares both its graphs')
check(JSON.parse(em.files.find((f) => f.path === 'maps/alley.reward.graph.json').bytes).name === 'reward', 'each graph file carries its own name, the identity the engine keys it by')
// The server: the game's graph runs once, and the levels keep their runtimes.
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('graphs: no server build -- the module check is skipped')
else if (em.ok) {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-gg-'))
  for (const f of em.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
  const srv = spawn(SERVER, ['--port', '34693', '--module', dir], { cwd: join(ROOT, 'engine') })
  let log = ''
  srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
  await new Promise((res) => setTimeout(res, 2500))
  srv.kill()
  if (process.env.DNP_GRAPHS_LOG) console.log(log)
  check(/module\.game\.graph\.json \(a graph, for the whole game\)/.test(log) && /\[graphs\] module\.game\.graph\.json: 3 nodes, 3 links/.test(log) &&
        /\[graphs\] module\.greeter\.graph\.json: 2 nodes, 1 links/.test(log),
        `the server runs both of the game's graphs once (${log.split('\n').filter((l) => /graph/.test(l)).join(' | ')})`)
  check(/\[graphs\] alley\.reward\.graph\.json: 3 nodes, 3 links/.test(log) && !/refus/i.test(log), 'and both of a map\'s graphs in its level, under their own names')
  check(/level 0: \S*triggers\.lua \(declared by the map\)/.test(log) && /level 0: \S*graphs\.lua \(declared by the map\)/.test(log),
        'and the level still runs its own trigger and graph runtimes (shared)')
  if (process.env.DNP_GRAPHS_LOG) console.log(log)
  check(/\[graphs\] alley\.world\.graph\.json: 8 nodes, 7 links/.test(log) && !/alley\.world\.graph\.json: .*(not in this map|refused|should be)/.test(log),
        `and a map's world nodes load there, their picked room and wall found in the map (${log.split('\n').filter((l) => /alley/.test(l)).slice(0, 3).join(' | ')})`)
}

// The cutscene on the server: on its own module, so it is the level loaded
// at once; and again with a path the map lacks, which the engine refuses.
async function serveOne (docs, port) {
  const m = newModule('cut', 'cut')
  const r = await emitModule(m, docs, { bake, runtime })
  if (!r.ok) return { ok: false, log: JSON.stringify(r.problems) }
  const dir = mkdtempSync(join(tmpdir(), 'dnp-cut-'))
  for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
  const srv = spawn(SERVER, ['--port', String(port), '--module', dir], { cwd: join(ROOT, 'engine') })
  let log = ''
  srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
  await new Promise((res) => setTimeout(res, 2500))
  srv.kill()
  return { ok: true, log }
}
if (existsSync(SERVER)) {
  const good = await serveOne([film], 34697)
  check(good.ok && /\[graphs\] film\.intro\.graph\.json: 9 nodes, 8 links/.test(good.log) && !/refus|not in this map|no path/i.test(good.log),
        `the server loads the cutscene on the map that has its path (${good.log.split('\n').filter((l) => /graph|path/i.test(l)).slice(0, 4).join(' | ')})`)
  const bad = await serveOne([filmLost], 34698)
  if (process.env.DNP_GRAPHS_LOG) console.log(bad.log.split("\n").filter((l) => /graph|path/i.test(l)).join("\n"))
  check(bad.ok && !/\[graphs\] lost\.intro\.graph\.json: 9 nodes/.test(bad.log) && /no camera path tagged 9/.test(bad.log),
        `CONTROL: and refuses it where the path is missing, as the studio says (${bad.log.split('\n').filter((l) => /graph|path/i.test(l)).slice(0, 3).join(' | ')})`)
}

console.log(`graphs: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
