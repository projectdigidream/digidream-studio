//
// The module's panels: one document each, written out as what the engine
// reads a panel from (docs/PANELS.md, docs/UI_LAYOUT.md 5).
//
// What has to hold. The LOOK: every template the studio writes is one the
// client's own parseLayout takes without a word, in every layout file a level
// can draw from. The CONTENT: a map's trigger table carrying the panels its
// cards and graph open is one the trigger runtime loads, and a graph opening
// one and answering its button with the trigger words loads beside it. And
// the move from the old per-map panels keeps everything, references included.
//
// ORACLES: engine/client/src/render/layout.js parseLayout; triggers.lua and
// graphs.lua under build/lua/triggercheck; dnp-server on a module the studio
// wrote.
//
import { readFileSync, writeFileSync, existsSync, mkdtempSync, mkdirSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import {
  newPanel, addWidget, widgetsOf, contentOf, templateOf, withTemplates, panelProblems, migratePanels,
  triggerPanels, graphPanels, panelsInGraph, panelUses, fromScript, cleanName, freeName
} from '../src/panels_emit.js'
import { uiFiles } from '../src/ui_emit.js'
import { emitMapLua } from '../src/lua_emit.js'
import { emitGraph } from '../src/graphs_emit.js'
import { newModule, emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { normalize, derive } from '../src/topology.js'
import { emitMap } from '../src/mapfmt.js'
import { toLua } from '../src/lua.js'
import { bake } from '../src/bake.js'
import { parseLayout, DEFAULT_LAYOUT } from '../../engine/client/src/render/layout.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- the document ------------------------------------------------------------------------
const shop = newPanel('Shop')
const gold = addWidget(shop, 'label', 'Gold')
const buy = addWidget(shop, 'button', 'Buy super shotgun!')
const many = addWidget(shop, 'slider', 'How many')
const colour = addWidget(shop, 'select', 'Colour')
check(buy.name === 'buy_super_shotgun' && gold.id === 1 && buy.id === 2 && colour.id === 4, `widgets are named from their words and numbered in order (${shop.widgets.map((w) => `${w.id}:${w.name}`).join(' ')})`)
check(buy.slot.y > gold.slot.y && many.slot.y > buy.slot.y && buy.slot.w === 296, 'each new widget gets a slot under the last, the panel\'s width less a margin')
shop.widgets.splice(shop.widgets.indexOf(colour), 1)
check(addWidget(shop, 'toggle').id === 5, 'an id is never handed out twice, even after the widget that had it is gone')
check(panelProblems('shop', shop).length === 0, `a fresh panel is clean (${panelProblems('shop', shop).join(' | ')})`)
check(panelProblems('Shop!', shop).some((p) => /name/.test(p)), 'CONTROL: a name the engine refuses is said')
const twin = structuredClone(shop); twin.widgets[1].name = twin.widgets[0].name
check(panelProblems('shop', twin).some((p) => /two widgets are called/.test(p)), 'CONTROL: two widgets of one name are said')
check(cleanName('Buy it -- now!') === 'buy_it_now' && freeName('shop', new Set(['shop', 'shop2'])) === 'shop3', 'names are made the engine\'s way, and kept apart')
check(widgetsOf(shop).every((w) => !('slot' in w) && !('name' in w)) && widgetsOf(shop, { names: true })[1].name === 'buy_super_shotgun',
      'a script\'s widgets carry nothing of the editor\'s; a graph\'s carry their names')

// --- the look, by the client's parser -----------------------------------------------------
shop.decor.push({ id: 'purse', type: 'text', anchor: 'tr', x: -12, y: 8, text: 'Gold {hud.gold}' })
shop.look.style = { bg: '#202830', radius: 10 }
buy.slot.style = { bg: '#2a4' }
const t = templateOf(shop)
check(t.slots.length === shop.widgets.length && t.slots[1].widget === buy.id && t.slots[1].style.bg === '#2a4' && t.decor.length === 1,
      'the template places every widget by its id, with its look, and the decor')
const parsed = parseLayout(withTemplates(DEFAULT_LAYOUT, { shop }))
check(parsed.ok && !parsed.errors.length && !parsed.warnings.length && parsed.layout.panels.shop, `the client's parser takes it without a word (${[...parsed.errors, ...parsed.warnings].join(' | ')})`)
// A BAR in the decor, as the panel editor adds it, as health is drawn: the
// client's parser takes it, bind, max, colours and all.
{
  const mana = { ...newPanel('Mana'), decor: [{ id: 'bar', type: 'bar', anchor: 'tl', x: 12, y: 8, w: 160, h: 10, bind: 'hud.mana', max: 'hud.mana_max', fill: '#5b8fd6', low: [{ below: 0.25, fill: '#d65b5b' }] }] }
  const pm = parseLayout(withTemplates(DEFAULT_LAYOUT, { mana }))
  const bar = pm.layout.panels?.mana?.decor?.[0]
  check(pm.ok && !pm.warnings.length && bar?.type === 'bar' && bar.bind === 'hud.mana' && bar.max === 'hud.mana_max' && bar.low?.[0]?.below === 0.25,
        `a bar in a panel's decor is taken by the client's parser as written (${JSON.stringify(pm.errors.concat(pm.warnings))})`)
}
const bad = parseLayout(withTemplates(DEFAULT_LAYOUT, { 'Shop!': shop }))
check(!bad.layout.panels?.['Shop!'], 'CONTROL: and drops a template under a name it refuses, so the check above means something')

// --- the layout files a level draws from ---------------------------------------------------
const mod = { panels: { shop } }
const onlyPanels = uiFiles(mod, [{ name: 'first' }])
const hud = JSON.parse(onlyPanels.find((f) => f.path.endsWith('/hud.json')).bytes)
check(hud.panels?.shop && !hud.hud && parseLayout(hud).layout.hud.length === DEFAULT_LAYOUT.hud.length,
      'a module with panels and no screens of its own writes a layout of only them, which the client completes with its default HUD')
const own = uiFiles({ ui: structuredClone(DEFAULT_LAYOUT), panels: { shop } }, [{ name: 'boss', ui: { version: 1, hud: [] } }])
const bossFile = JSON.parse(own.find((f) => f.path.endsWith('map_boss.json')).bytes)
check(bossFile.panels?.shop && JSON.parse(own.find((f) => f.path.endsWith('/hud.json')).bytes).panels?.shop, 'a map with a layout of its own carries the module\'s panels too')
check(uiFiles({}, []).length === 0, 'CONTROL: a module with neither writes nothing, and the client draws its defaults')

// --- the move from per-map panels ----------------------------------------------------------
const old = {
  ui: { version: 1, panels: { shop: { anchor: 'r', x: -20, y: 0, w: 280, modal: true, slots: [{ widget: 2, anchor: 'tl', x: 12, y: 50, w: 200 }] } } }
}
const a = { name: 'a', triggers: [{ name: 'open', event: 'on_interact', actions: [{ a: 'ui_open', panel: 'shop' }] }],
  panels: { shop: { title: 'Shop', widgets: [{ kind: 'label', id: 1, label: 'Hello' }, { kind: 'button', id: 2, label: 'Buy' }] } } }
const b = { name: 'b', triggers: [{ name: 'open', event: 'on_interact', actions: [{ a: 'ui_open', panel: 'shop' }] }],
  graphs: { main: { nodes: [{ id: 'o', type: 'action', a: 'ui_open', panel: 'shop' }], links: [] } },
  panels: { shop: { title: 'Other shop', widgets: [{ kind: 'button', id: 1, label: 'Leave' }] } } }
const did = migratePanels(old, [a, b])
check(old.panels.shop && old.panels.b_shop && !a.panels && !b.panels, `both maps' panels are the module's, the second renamed (${did.join('; ')})`)
check(old.panels.shop.look.anchor === 'r' && old.panels.shop.look.w === 280 && old.panels.shop.widgets[1].slot.x === 12 && old.panels.shop.widgets[1].slot.w === 200,
      'a panel takes the template of its name as its look, slots and all')
check(b.triggers[0].actions[0].panel === 'b_shop' && b.graphs.main.nodes[0].panel === 'b_shop' && a.triggers[0].actions[0].panel === 'shop', 'the renamed one\'s cards and graph follow it')
check(!old.ui.panels, 'and the template it took is not kept a second time in the layout')
check(fromScript('x', { widgets: [{ kind: 'button', id: 7, label: 'Go!' }] }).widgets[0].name === 'go', 'a script widget gets a name from its label')
check(panelUses('b_shop', old, [a, b]).map((u) => u.how).sort().join() === 'opens,trigger', 'where a panel is used: a graph node and a card')

// --- the trigger table and the graph, by the runtime ---------------------------------------
const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
const doc = newDoc('shopfloor')
addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' })
addSpawn(doc, 'start', 2, 2)
normalize(doc)
doc.triggers = []
doc.graphs = { main: { vars: {}, nodes: [
  { id: 'press', type: 'event', event: 'on_interact' }, { id: 'open', type: 'action', a: 'ui_open', panel: 'shop' },
  { id: 'ui', type: 'event', event: 'on_ui_event' }, { id: 'is_buy', type: 'condition', c: 'widget_is', widget: buy.id },
  { id: 'say', type: 'action', a: 'log', text: 'bought' }],
  links: [['press.then', 'open.in'], ['ui.then', 'is_buy.in'], ['is_buy.true', 'say.in']] } }
const panels = { shop }
const tp = triggerPanels(doc, panels)
check(Object.keys(tp).join() === 'shop' && tp.shop.template === 'shop' && tp.shop.widgets.every((w) => !('name' in w)), 'a map\'s trigger table carries the panels its graph opens, as a script\'s panel')
const emitted = emitMap(derive(doc), doc, [])
const lua = emitMapLua(doc, emitted, { panels: tp })
check(/triggers\.load/.test(lua.text) && /panels =/.test(lua.text) && lua.problems.length === 0, 'a map with a panel and no cards still writes a (cardless) trigger table')
check(panelsInGraph(doc.graphs.main).has('shop') && Object.keys(graphPanels(doc.graphs.main, panels)).join() === 'shop', 'the graph names the panel it opens')
check(!emitGraph(doc.graphs.main, 'shopfloor', null).json.panels && emitGraph(doc.graphs.main, 'shopfloor', null, null, { panels: graphPanels(doc.graphs.main, panels) }).json.panels.shop.widgets[1].name === buy.name,
      'a graph carries its panels, with widget names, only when asked (a runtime that reads them)')

const TRIGGERCHECK = join(ROOT, 'engine', 'build', 'lua', 'triggercheck')
if (!existsSync(TRIGGERCHECK)) {
  console.log('panels: triggercheck not built -- the runtime checks are skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-panels-'))
  const run = (name, body) => {
    const f = join(dir, `${name}.lua`)
    writeFileSync(f, body)
    const r = spawnSync(TRIGGERCHECK, ['.', f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    return { ok: r.status === 0, out: r.stderr + r.stdout }
  }
  const table = (p) => `triggers.load${toLua({ name: 'shopfloor', panels: p, triggers: [{ name: 'open', event: 'on_interact', actions: [{ a: 'ui_open', panel: 'shop' }] }] })}`
  const good = run('table', table(tp))
  check(good.ok, `the trigger runtime loads the panels the studio writes:\n${good.out}`)
  const broken = structuredClone(tp); broken.shop.widgets[1].kind = 'knob'
  check(!run('broken', table(broken)).ok, 'CONTROL: and refuses a widget kind it does not have, so that load means something')
  const both = run('graph', [
    'dofile("maps/scripts/graph_vocab.lua")', 'dofile("maps/scripts/graphs.lua")',
    table(tp),
    `local ok, problems = graphs.load(${toLua(emitGraph(doc.graphs.main, 'shopfloor', null).json)}, "shopfloor")`,
    'if not ok then error(table.concat(problems or {}, "\\n")) end'
  ].join('\n'))
  check(both.ok, `a graph opening the panel and answering its button with the trigger words loads beside it:\n${both.out}`)
}

// --- the module, on the server --------------------------------------------------------------
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('panels: no server build -- the module check is skipped')
else {
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const m = newModule('pp', 'pp')
  m.panels = { shop }
  const r = await emitModule(m, [doc], { bake, runtime })
  const paths = r.files.map((f) => f.path)
  check(r.ok && paths.includes('assets/ui/hud.json') && paths.includes('assets/ui/index.json'), `the module writes its panels' layout (${r.problems.map((p) => JSON.stringify(p)).join(' | ')})`)
  if (r.ok) {
    const out = mkdtempSync(join(tmpdir(), 'dnp-pp-'))
    for (const f of r.files) { const p = join(out, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
    const srv = spawn(SERVER, ['--port', '34695', '--module', out], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((res) => setTimeout(res, 2500))
    srv.kill()
    check(/\[triggers\] shopfloor: 0 triggers/.test(log) && /\[graphs\] shopfloor\.main\.graph\.json: 5 nodes, 3 links/.test(log) && !/refus|problem|error/i.test(log),
          `the server loads the map's panel table and the graph that opens it (${log.split('\n').filter((l) => /triggers|graphs|refus|error/i.test(l)).join(' | ')})`)
  }
}

// THE GAME'S GRAPHS OPEN PANELS TOO: the module's panels they open written
// as a cardless trigger table in the game VM (module_panels.lua), loaded
// after the shared runtimes and before the graphs; the server loads the lot.
// CONTROL: the same graph with no such table is refused at load.
{
  const { gameScripts, emitGamePanelsLua, GAME_PANELS_FILE } = await import('../src/module_emit.js')
  const gameShop = { vars: {}, nodes: [
    { id: 'came', type: 'when_player_arrives' }, { id: 'open', type: 'action', a: 'ui_open', panel: 'shop' },
    { id: 'ui', type: 'event', event: 'on_ui_event' }, { id: 'is_buy', type: 'condition', c: 'widget_is', widget: buy.id },
    { id: 'say', type: 'action', a: 'log', text: 'sold' }],
    links: [['came.then', 'open.in'], ['ui.then', 'is_buy.in'], ['is_buy.true', 'say.in']] }
  const gm = newModule('gp', 'gp')
  gm.panels = { shop }
  gm.graphs = { shopkeeper: gameShop }
  const lines = gameScripts(gm)
  check(lines.indexOf(GAME_PANELS_FILE) > lines.indexOf('triggers.lua shared') && lines.indexOf(GAME_PANELS_FILE) < lines.indexOf('module.shopkeeper.graph.json'),
        `module.txt loads the game's panels after the trigger runtime and before the graphs (${lines.join(', ')})`)
  check(/triggers\.load/.test(emitGamePanelsLua(gm)) && /template = "shop"/.test(emitGamePanelsLua(gm)) && emitGamePanelsLua({ ...gm, graphs: {} }) === null,
        'the table holds the panels the game\'s graphs open, and is not written without one')
  if (existsSync(SERVER)) {
    const runtime = {}
    for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
    const serve = async (mod, port) => {
      const r = await emitModule(mod, [doc], { bake, runtime })
      if (!r.ok) return JSON.stringify(r.problems)
      const out = mkdtempSync(join(tmpdir(), 'dnp-gp-'))
      for (const f of r.files) { const p = join(out, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes)) }
      const srv = spawn(SERVER, ['--port', String(port), '--module', out], { cwd: join(ROOT, 'engine') })
      let log = ''
      srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
      await new Promise((res) => setTimeout(res, 2500))
      srv.kill()
      return log
    }
    const log = await serve(gm, 34699)
    if (process.env.DNP_PANELS_LOG) console.log(log)
    check(/\[triggers\] module: 0 triggers/.test(log) && /\[graphs\] module\.shopkeeper\.graph\.json: 5 nodes, 3 links/.test(log) && /a graph, for the whole game/.test(log),
          `the server loads the game's panel table and the game graph that opens the shop (${log.split('\n').filter((l) => /module|shopkeeper|refus|panel/i.test(l)).slice(0, 4).join(' | ')})`)
  }
  // Where ui_open looks: the trigger runtime's panels in the game VM. With the
  // table the shop is there; without it, nothing -- and ui_open would find no panel.
  if (existsSync(TRIGGERCHECK)) {
    const dir = mkdtempSync(join(tmpdir(), 'dnp-gp-tc-'))
    const probe = (withTable) => {
      const f = join(dir, `probe${withTable ? 1 : 0}.lua`)
      writeFileSync(f, ['dnp = dnp or {}', 'dnp.is_game = function() return true end',
        withTable ? emitGamePanelsLua(gm) : '',
        // triggercheck insists on triggers of its own, so the answer is a line said.
        'print((triggers.panels ~= nil and triggers.panels.shop ~= nil) and "PANEL_FOUND shop" or "PANEL_MISSING shop")'].join('\n'))
      const r = spawnSync(TRIGGERCHECK, ['.', f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
      const out = r.stderr + r.stdout
      return { ok: /PANEL_FOUND shop/.test(out), out }
    }
    const withIt = probe(true)
    check(withIt.ok, `in the game VM the shop is where ui_open looks for it, once the table is loaded:\n${withIt.out}`)
    check(!probe(false).ok, 'CONTROL: without the table it is not, so the table is what lets a game graph open the panel')
  }
}

console.log(`panels: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
