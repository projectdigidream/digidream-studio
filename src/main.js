//
// The studio: draw rooms, place things, write behaviour, bake, play.
//
// Everything that decides something lives elsewhere: the document (doc.js),
// what its geometry means (topology.js), what gets written (mapfmt.js,
// lua_emit.js, module_emit.js), what a gesture does (tools.js), what the
// sheet shows (inspector.js). This file boots them, holds the one state
// object they share, and routes events between them. If it is doing
// arithmetic, something is in the wrong file.
//
import { Router, parseHash } from './app/router.js'
import { Shell } from './app/shell.js'
import { moduleProblems, badgeCounts } from './app/problems.js'
import { install as installHome } from './sections/home.js'
import { install as installMaps } from './sections/maps.js'
import { install as installProps } from './sections/props.js'
import { install as installParticles } from './sections/particles.js'
import { install as installMusic } from './sections/music.js'
import { install as installSounds } from './sections/sounds.js'
import { install as installTextures } from './sections/textures.js'
import { install as installSettings } from './sections/settings.js'
import { install as installScripts } from './sections/scripts.js'
import { install as installGraphs } from './sections/graphs.js'
import { install as installCamera } from './mapeditor/camera.js'
import { install as installNeighbours } from './mapeditor/neighbours.js'
import { migratePlayer, overrides, paramNames } from './player.js'
import { migrateModule } from './migrate.js'
import { bankNames } from './soundpacks.js'
import { fxSchema } from './fxlib.js'
import { openScreens } from './screens.js'
import { openGraph } from './graphwin.js'
import { openPanels } from './panelwin.js'
import { graphProblems, graphsOf, liveGraphs, graphFile } from './graphs_emit.js'
import { Core } from '/src/core.js'
import { parseProps } from '/src/render/props.js'
import { parseAtlas } from '/src/render/atlas.js'
import { loadMapcBinary, bake as bakeWith } from './bake.js'
import { newDoc, addSector, addSpawn, validate, findEdge, newEdge, CAP } from './doc.js'
import { normalize } from './topology.js'
import { newModule, emitModule, RUNTIME_SCRIPTS, scriptDecls, gameScripts, gameFileOf } from './module_emit.js'
import { Vocab } from './vocab.js'
import { Viewport, COLORS } from './viewport.js'
import { Preview } from './preview.js'
import { TextureCache } from './textures.js'
import { SpriteLibrary } from './sprites.js'
import { Gestures } from './gestures.js'
import { History } from './history.js'
import { Store, debounce } from './store.js'
import { shell, hasShell } from './bridge.js'
import { Ui, el, button, row, text, muted, card, select, number, ask } from './ui.js'
import { moduleProps } from './props.js'
import { hasWeapons } from './weapons_emit.js'
import { inspector, titleFor, texturePicker, placePalette } from './inspector.js'
import { triggersSheet } from './cards.js'
import { openWorkshop, openArsenal, openPlayer } from './workshop.js'
import { parseVfx } from '/src/render/vfx.js'
import { vfxChoices } from './vfxlib.js'
import * as tools from './tools.js'
import { writePack, readPack } from './pack.js'

const boot = document.getElementById('boot')
const bootMsg = document.getElementById('bootmsg')
const bootFill = document.getElementById('bootfill')
const stage = (msg, frac) => { bootMsg.textContent = msg; bootFill.style.width = `${Math.round(frac * 100)}%` }

const fetchText = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text() }
const fetchJson = async (url, fallback = null) => { const r = await fetch(url); if (!r.ok) return fallback; return r.json() }

// Where Play left from (see rememberReturn): read at boot, so declared before it.
const RETURN_KEY = 'dnp.studio.return'
const RETURN_MS = 60 * 60 * 1000

// --- the state everything shares -------------------------------------------------
const S = {
  core: null, bake: null, runtime: {}, vocab: null,
  textureNames: [], textureSizes: {}, catalogue: [], kinds: new Map(), sheets: new Map(),
  store: null, rec: null, module: null, docs: {}, docName: null, doc: null,
  history: null, preview: null, viewport: null, ui: null,
  tool: 'select', selection: null, drag: null, pick: null, place: null, highlights: [],
  draw: { corners: [], rect: null },
  style: { sector: { kind: 'auto', floor: 0, ceil: 4, light: 200, thickness: 0, floorTex: null, ceilTex: null }, edge: { middle: null } },
  imageUrls: new Map(),
  pathEdit: null,              // the camera path being edited, by id
  pathPointSel: null,          // and which of its waypoints is in hand
  spriteUrls: new Map(),       // the module's single pictures and sheet images, as blob URLs
  trackUrls: new Map(),        // the module's baked tracks (.mstk), as blob URLs
  music: null,                 // the client's Music, once something was listened to

  status (text, level = '') { this.ui.setStatus(text, level) },
  workZ () {
    const sid = this.selection?.kind === 'sector' ? this.selection.id : this.selection?.sectorId
    return sid && this.doc.sectors[sid] ? this.doc.sectors[sid].floor : 0
  }
}

// --- boot ----------------------------------------------------------------------------
stage('loading the core', 0.05)
S.core = await Core.load()
stage('loading the map compiler', 0.2)
const mapcBinary = await loadMapcBinary('/studio/wasm/dist/mapc.wasm')
S.bake = (opts) => bakeWith({ ...opts, wasmBinary: mapcBinary })
stage('loading the runtime', 0.35)
for (const name of RUNTIME_SCRIPTS) S.runtime[name] = await fetchText(`/studio/runtime/${name}`)
S.vocab = new Vocab(await fetchJson('/studio/runtime/trigger_vocab.json'), await fetchJson('/studio/runtime/mob_vocab.json'),
                    await fetchJson('/studio/runtime/weapon_vocab.json').catch(() => null))
// The graph nodes' types and pins (docs/GRAPHS.md), generated from graph_vocab.lua.
S.vocab.graph = await fetchJson('/studio/runtime/graph_vocab.json').catch(() => null)
stage('reading the catalogue', 0.5)
const texIndex = await fetchJson('/textures/index.json', { sizes: {} })
S.textureSizes = texIndex.sizes ?? {}
S.textureNames = Object.keys(S.textureSizes).sort()
const propsText = await fetch('/props.txt').then((r) => (r.ok ? r.text() : '')).catch(() => '')
S.kinds = parseProps(propsText).kinds
// The particle and tracer kinds the app serves, so the studio can offer them
// beside the module's own wherever something names one by number.
S.servedVfx = parseVfx(propsText).kinds
S.catalogue = [...S.kinds.values()].filter((k) => k.name).map((k) => k.name).sort()
// What the app serves besides the module: its sound bank's names and its
// sprite pictures, offered wherever a field names one.
S.servedSounds = await fetch('/sounds/bank.sfxproj').then((r) => (r.ok ? r.json() : null)).then(bankNames).catch(() => [])
S.servedSprites = await fetch('/sprites/index.json').then((r) => (r.ok ? r.json() : {})).then((j) => Object.keys(j.sizes ?? {})).catch(() => [])
stage('opening your work', 0.65)
S.store = await Store.open()
await seedFromShell()
await openModule((await S.store.list())[0]?.id ?? null)

stage('the picture', 0.85)
S.viewport = new Viewport(document.body)
// The module's own pictures come from the record's blobs; everything else the
// shell serves. Decoded once each, whatever the number of bakes.
S.textures = new TextureCache({ urlFor: (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`, cutout: texIndex.cutout ?? {} })
S.preview = new Preview({ core: S.core, bake: S.bake, runtime: S.runtime, viewport: S.viewport, textures: S.textures,
                          hooks: S.vocab.trigger.events.map((e) => e.name) })
// Placed things are drawn as their own pictures, once those have loaded.
S.sprites = new SpriteLibrary({ sheets: S.sheets, kinds: S.kinds, moduleProps: () => S.module?.props ?? [], onLoad: () => redraw(), imageFor: (n) => S.spriteUrls.get(n) ?? null })
S.preview.onResult = (r) => {
  // The rooms something is wrong with, marked on the map in red (amber for a
  // warning) and explained in each one's inspector.
  const before = JSON.stringify(S.problems ?? [])
  S.problems = r.problems ?? []
  const rooms = new Set(S.problems.filter((p) => p.level === 'error').map((p) => p.sector)).size
  const lead = rooms ? `${rooms === 1 ? 'one room is' : `${rooms} rooms are`} wrong (marked in red; tap one to see why)\n` : ''
  if (!r.ok) S.status(lead + r.errors.map((e) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg)).join('\n'), 'error')
  else if (rooms) S.status(lead + S.problems.filter((p) => p.level === 'error').map((p) => p.msg).join('\n'), 'error')
  else if (r.warnings.length) S.status(r.warnings.map((w) => `${w.sector}: ${w.msg}`).join('\n'), 'warn')
  else S.status(`${S.module.id} / ${S.docName}  ·  ${S.doc.order.length} sectors`, 'ok')
  // The neighbours and the seams follow every bake of this map (cheap: each
  // neighbour is baked again only when its own document changed).
  if (S.route() === 'map') S.refreshNeighbours?.()
  if (JSON.stringify(S.problems) !== before) { redraw(); if (S.selection && S.ui.sheetOpen && ['sector', 'edge'].includes(S.selection.kind)) showInspector() }
  S.viewport.dirty = true
}
S.ui = new Ui({
  tool: (id) => chooseTool(id),
  undo: () => restore(S.history.undo()),
  redo: () => restore(S.history.redo()),
  view: () => { S.viewport.setMode(S.viewport.mode === 'plan' ? 'iso' : 'plan'); S.ui.setView(S.viewport.mode) },
  rotate: (dir) => S.viewport.rotate(dir * Math.PI / 4),
  home: () => S.go('home')
})
S.ui.setView(S.viewport.mode)
// The map's name at the top is where the maps are: tap it for the list.
S.ui.status.addEventListener('click', () => S.go('maps'))
S.ui.status.title = 'tap for the module\'s maps'

// --- the module's sections (app/router.js, app/shell.js) ---------------------------
//
// THE STUDIO IS A MODULE EDITOR. Its home is the module; the map editor is one
// section, opened from Maps. A section that used to be a sheet draws its rows
// into the page (Ui.showSheet routes a matching title there while it is up);
// one that used to be a full-screen window moves its root into the page.
S.router = new Router({ onChange: () => { refreshBadges(); S.shell.drawRail() } })
/** The rail's counts of what is wrong, by section (app/problems.js). */
function refreshBadges () {
  try { S.shell.badges = new Map(Object.entries(badgeCounts(moduleProblems(S)))) } catch (e) { console.warn('[studio] problems', e) }
}
const badgesSoon = debounce(() => { refreshBadges(); S.shell.drawRail() }, 400)
S.shell = new Shell({ router: S.router, on: { play: () => play(), exportPack: () => exportPack(), undo: () => restoreModule(S.moduleHistory?.undo()), redo: () => restoreModule(S.moduleHistory?.redo()) } })
S.go = (id, arg = null) => S.router.go(id, arg)
S.ui.pageSink = (title, rows, onClose) => S.shell.showRows(title, rows, onClose)
S.route = () => S.router.current?.id ?? null
// Back from a window-section: to the map when it was opened from there.
S.leave = () => S.go(S.cameFrom === 'map' ? 'map' : 'home', S.cameFrom === 'map' ? S.docName : null)

/** A section that was a sheet: its rows on a page. */
const pageSection = (id, label, icon, titles, show, extra = {}) => S.router.register({
  id, label, icon, ...extra,
  mount: (arg, from) => {
    S.cameFrom = from?.id ?? null
    S.shell.openPage(label)
    S.ui.layer.dataset.page = '1'
    S.ui.hideSheet()
    S.ui.pageTitles = titles
    show(arg)
  },
  unmount: () => { S.ui.pageTitles = null; S.shell.closePageContent() }
})
/** A section that was a full-screen window: its root moved into the page. */
const windowSection = (id, label, icon, open, extra = {}) => S.router.register({
  id, label, icon, ...extra,
  mount: (arg, from) => {
    S.cameFrom = from?.id ?? null
    const body = S.shell.openPage(label, { kind: 'window' })
    S.ui.layer.dataset.page = '1'
    S.ui.hideSheet()
    const w = open(arg)
    body.appendChild(w.root)
    w.root.hidden = false
    S.window = w
  },
  unmount: () => { S.window?.close(); S.window = null; S.ui.layer.dataset.workshop = '0' }
})
pageSection('home', 'Home', '◆', /^Home$/, () => S.showHome(), { rail: false })
pageSection('maps', 'Maps', '🗺', /^Maps$/, () => S.showMaps())
// The old entry points go to their sections; called from inside one, they draw it.
const sectionAlias = (id, fn) => (...a) => (S.route() === id ? fn(...a) : S.go(id, a[0] ?? null))
S.sectionAlias = sectionAlias
// The verbs the sections share, published before they are installed.
// `save` is a const further down; reached through a wrapper so this runs first.
S.save = () => save()
Object.assign(S, { play, exportPack, importPack, frameToDoc, openModule, starterDoc, showInspector, emitAll })
for (const install of [installHome, installMaps, installProps, installParticles, installMusic, installSounds, installTextures, installSettings, installScripts, installGraphs, installCamera, installNeighbours]) install(S)
await S.loadPacks()
S.router.register({
  id: 'map', label: 'Map', icon: '▭', rail: false, parent: 'maps',
  mount: async (arg) => {
    S.shell.hidePage()
    S.ui.layer.dataset.page = '0'
    S.ui.layer.dataset.workshop = '0'
    if (arg && S.docs[arg] && arg !== S.docName) await openDoc(arg)
    S.viewport.resize?.()
    redraw()
    S.viewport.dirty = true
    S.refreshNeighbours?.()
  },
  unmount: () => { S.ui.hideSheet(); if (S.tool === 'room') tools.cancelRoom(S) }
})
windowSection('monsters', 'Monsters', '☠', (name) => openWorkshop(S, name))
windowSection('player', 'Player', '🧍', () => openPlayer(S))
windowSection('weapons', 'Weapons', '🔫', (name) => openArsenal(S, name))
pageSection('props', 'Props', '📦', /^Props$|^Prop /, (name) => (name ? S.showProp(name) : S.showProps()))
pageSection('particles', 'Particles', '✨', /^Particles/, (id) => S.showVfx(id ?? undefined))
pageSection('textures', 'Textures', '🧱', /^Textures$/, (n) => S.showTextures(n))
pageSection('music', 'Music', '♪', /^Soundtrack/, () => S.showMusic())
pageSection('sounds', 'Sounds', '🔊', /^Sounds$/, () => S.showSounds())
windowSection('screens', 'Screens', '▣', () => openScreens(S))
windowSection('panels', 'Panels', '▢', (name) => openPanels(S, name))
pageSection('scripts', 'Scripts', '📜', /^Scripts$/, (n) => S.showScripts(n))
pageSection('graphs', 'Graphs', '◇', /^Graphs$/, () => S.showGraphs())
windowSection('graph', 'Graph', '◇', (arg) => openGraph(S, arg), { rail: false, parent: 'graphs' })
pageSection('settings', 'Settings', '⚙', /^Module settings$/, () => S.showSettings())
new Gestures(S.viewport.canvas, {
  tap: (i) => tools.onTap(S, i),
  dragStart: (i) => tools.onDragStart(S, i),
  drag: (i) => tools.onDrag(S, i),
  dragEnd: (i, c) => tools.onDragEnd(S, i, c),
  longPress: (i) => tools.onLongPress(S, i),
  pan: ({ dx, dy }) => S.viewport.panBy(dx, dy),
  zoom: (f) => S.viewport.zoomBy(f),
  wheel: (dy) => S.viewport.zoomBy(dy > 0 ? 1 / 1.1 : 1.1),
  key: (e) => onKey(e)
})
frameToDoc()
redraw()
previewNow()
S.shell.moduleName = S.module.name || S.module.id
// Back from Play: no address of our own, and a note saying where we were.
const back = parseHash(location.hash) ? null : takeReturn()
if (back) {
  if (back.module !== S.module.id && await S.store.load(back.module)) await openModule(back.module, { show: false })
  if (S.docs[back.map]) {
    await S.go('map', back.map)
    const v = back.view
    if (v) {
      if (v.mode && v.mode !== S.viewport.mode) { S.viewport.setMode(v.mode); S.ui.setView(v.mode) }
      if (v.target) S.viewport.lookAt(v.target.x, v.target.y, v.target.z)
      if (v.viewHeight) S.viewport.viewHeight = v.viewHeight
      if (typeof v.yaw === 'number') S.viewport.yaw = v.yaw
      S.viewport.resize()
    }
    S.status(`back from playing ${back.map}`, 'ok')
  }
}
if (!S.router.current) await S.router.follow()
addEventListener('hashchange', () => S.router.follow())
boot.hidden = true
// For the page test and for poking at a live session from the console.
globalThis.__studio = S
requestAnimationFrame(function loop () {
  if (S.viewport.dirty || S.viewport.animating) S.viewport.render()
  requestAnimationFrame(loop)
})

// --- modules and maps --------------------------------------------------------------------

/**
 * A store record from a module's files: module.studio.json, the map documents
 * and the pictures. Paths relative to the module root. Null when it is not a
 * studio module (no documents).
 */
// What emitModule writes into assets/ from the documents, and must not be read
// back as if it were the module's own: the merged sound bank, the screens.
const GENERATED = /^assets\/(sounds\/bank\.sfxproj|ui\/[^/]+\.json)$/

function recordFromEntries (entries) {
  const dec = new TextDecoder()
  const modEntry = entries.find((e) => e.path === 'module.studio.json')
  if (!modEntry) return null
  const module = JSON.parse(dec.decode(modEntry.bytes))
  const docs = {}
  const assets = {}
  for (const e of entries) {
    const m = /^maps\/(.+)\.studio\.json$/.exec(e.path)
    if (m) docs[m[1]] = JSON.parse(dec.decode(e.bytes))
    else if (e.path.startsWith('assets/') && !/(^|\/)(props\.txt|index\.json)$/.test(e.path) && !GENERATED.test(e.path)) assets[e.path.slice(7)] = new Blob([e.bytes])
    // Sources (sound packs) are kept under their own path, as written.
    else if (e.path.startsWith('sources/')) assets[e.path] = new Blob([e.bytes])
  }
  return Object.keys(docs).length ? { id: module.id, module, docs, assets } : null
}

/**
 * The modules the app shipped, into the store -- once each. The shell seeded
 * them into its game tree; a studio that opened a blank room beside a starter
 * level nobody could find was the first thing the desktop app showed.
 */
async function seedFromShell () {
  if (!hasShell()) return
  const files = await shell.listFiles('modules')
  const ids = [...new Set(files.filter((f) => f.endsWith('/module.studio.json')).map((f) => f.split('/')[1]))]
  for (const id of ids) {
    if (await S.store.load(id)) continue
    const entries = []
    for (const f of files) {
      if (!f.startsWith(`modules/${id}/`)) continue
      const rel = f.slice(`modules/${id}/`.length)
      if (!(rel.endsWith('.studio.json') || (rel.startsWith('assets/') && /\.(png|json|mstk|sfxproj)$/.test(rel)) || rel.startsWith('sources/'))) continue
      const bytes = await shell.readFile(f)
      if (bytes) entries.push({ path: rel, bytes })
    }
    const rec = recordFromEntries(entries)
    if (rec) await S.store.save(rec)
  }
}

/**
 * A new module as a COPY of another -- the starter, normally: its maps, its
 * monsters, its sheets and textures, under a new id. The copy's props get an
 * id range of their own, because the shells load the bundled starter beside
 * the user's module on Play and the server refuses a colliding id.
 */
async function copyModule (baseId, id, name) {
  const base = await S.store.load(baseId)
  if (!base) return null
  const rec = structuredClone(base)
  rec.id = id
  rec.module.id = id
  rec.module.name = name
  const bases = (await S.store.list()).map((r) => r.module?.propIdBase ?? 0)
  const next = Math.max(999, ...bases) + 1 + 100 - ((Math.max(999, ...bases) + 1) % 100)
  const shift = next - (rec.module.propIdBase ?? 1000)
  rec.module.propIdBase = next
  for (const p of rec.module.props ?? []) p.id += shift
  await S.store.save(rec)
  return rec
}
S.copyModule = copyModule

/**
 * Open a module. Every section shows the module, so whatever was on screen
 * is the old one's: unless `show` is false (boot, the way back from Play,
 * which go on to a section of their own), it lands on the new module's Home,
 * drawn afresh -- the router does not move to the section already showing.
 */
async function openModule (id, { show = true } = {}) {
  // The module being left is saved first: saving waits a moment after the
  // last change, and that save would otherwise write the NEW module.
  if (S.rec) await S.store.save(S.rec)
  let rec = id ? await S.store.load(id) : null
  if (!rec) {
    const doc = starterDoc('first')
    rec = { id: 'my-level', module: newModule('my-level', 'My Level'), docs: { first: doc }, assets: {} }
    await S.store.save(rec)
  }
  S.rec = rec
  S.module = rec.module
  S.docs = rec.docs
  // Maps written when the player's size was each map's own: the module takes
  // the common size, a map that differs keeps its own as an override.
  // Documents from earlier studios, brought up to date (migrate.js).
  const did = migrateModule(rec)
  if (migratePlayer(S.module, S.docs) || did.length) await S.store.save(rec)
  if (did.length) console.log('[studio] updated:', did.join('; '))
  S.moduleHistory = new History({ module: S.module, docs: S.docs })
  S.shell?.setHistory(false, false)
  if (S.shell) { S.shell.moduleName = S.module.name || S.module.id; S.shell.drawRail() }
  for (const [name, url] of S.imageUrls) { URL.revokeObjectURL(url); S.textures?.forget(name) }
  S.imageUrls.clear()
  for (const src of S.sheets.values()) URL.revokeObjectURL(src.imageUrl)
  S.sheets.clear()
  S.sprites?.forgetAll()
  for (const url of S.spriteUrls.values()) URL.revokeObjectURL(url)
  S.spriteUrls.clear()
  S.music?.stop()
  for (const url of S.trackUrls.values()) URL.revokeObjectURL(url)
  S.trackUrls.clear()
  S.moduleSounds = []
  // The module's sound packs, read and merged (sections/sounds.js); at boot
  // the section is installed after the first module opens and loads them then.
  await S.loadPacks?.()
  for (const [path, blob] of Object.entries(rec.assets ?? {})) {
    if (path.startsWith('textures/') && path.endsWith('.png')) S.imageUrls.set(path.slice(9, -4), URL.createObjectURL(blob))
    if (path.startsWith('sprites/') && path.endsWith('.png')) S.spriteUrls.set(path.slice(8, -4), URL.createObjectURL(blob))
    if (path.startsWith('music/') && path.endsWith('.mstk')) S.trackUrls.set(path.slice(6, -5), URL.createObjectURL(blob))
  }
  // The module's sheets: manifest parsed by the client's own parser, picture
  // as a blob URL, so the viewport draws what the game will.
  for (const [path, blob] of Object.entries(rec.assets ?? {})) {
    const m = /^sprites\/([^/]+)\.json$/.exec(path)
    if (!m) continue
    try {
      const json = JSON.parse(await blob.text())
      const png = rec.assets[`sprites/${json.image}`]
      if (png) S.sheets.set(m[1], { atlas: parseAtlas(json, m[1]), imageUrl: URL.createObjectURL(png) })
    } catch (e) { console.warn('[studio] sheet', path, e.message) }
  }
  await openDoc(Object.keys(S.docs)[0])
  if (show && S.router?.current) {
    if (S.router.current.id === 'home') await S.router.remount()
    else await S.go('home')
  }
}

async function openDoc (name) {
  S.docName = name
  S.doc = S.docs[name]
  normalize(S.doc)
  S.history = new History(S.doc)
  S.selection = null
  S.draw = { corners: [], rect: null }
  if (S.ui) { S.ui.hideSheet(); S.ui.setHistory(false, false); frameToDoc(); S.applyCamera(); redraw(); previewNow() }
}

function starterDoc (name) {
  const doc = newDoc(name)
  const floorTex = S.textureNames.find((n) => /FLOOR/.test(n)) ?? S.textureNames[0] ?? null
  const wallTex = S.textureNames.find((n) => /WALL/.test(n)) ?? S.textureNames[1] ?? S.textureNames[0] ?? null
  S.style.sector.floorTex = floorTex
  S.style.sector.ceilTex = floorTex
  S.style.edge.middle = wallTex
  addSector(doc, [{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 6 }, { x: -8, y: 6 }], { ...S.style.sector }, { ...S.style.edge })
  addSpawn(doc, 'start', 0, 0, 0)
  return doc
}

const save = debounce(async () => { try { await S.store.save(S.rec) } catch (e) { S.status(`could not save: ${e.message}`, 'error') } }, 600)

function frameToDoc () {
  const pts = []
  for (const sid of S.doc.order) for (const v of S.doc.sectors[sid].verts) pts.push(v)
  if (!pts.length) { S.viewport.lookAt(0, 0); return }
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys)
  S.viewport.lookAt((Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, 0)
  S.viewport.viewHeight = Math.min(300, Math.max(8, Math.max(h, w * innerHeight / innerWidth) * 1.3))
  S.viewport.resize()
}

// --- the shared verbs ------------------------------------------------------------------------
S.commit = () => {
  badgesSoon?.()
  normalize(S.doc)
  S.history.commit(S.doc)
  // The module's history follows the maps without making a step of its own.
  S.moduleHistory?.replace({ module: S.module, docs: S.docs })
  S.ui.setHistory(S.history.canUndo, S.history.canRedo)
  save()
  redraw()
  previewNow()
}
S.previewNow = previewNow
// A drag in progress: reshape the one sector on the loaded map, no bake.
S.previewDrag = (sectorId) => S.preview.stage(S.doc, sectorId)
S.redraw = redraw
S.select = (sel, { quiet = false } = {}) => {
  S.selection = sel
  redraw()
  if (!sel) { if (!quiet) S.ui.hideSheet(); return }
  if (sel.kind === 'sector') rememberStyle(S.doc.sectors[sel.id])
  if (!quiet || S.ui.sheetOpen) showInspector()
}
S.refreshSheet = () => { if (S.ui.sheetOpen && S.selection) showInspector() }
S.pickTexture = (current, onPick) => {
  const names = [...Object.keys(S.module.textures ?? {}), ...S.textureNames]
  S.ui.showSheet('Texture', texturePicker(names, current, (name) => { onPick(name); showInspector() },
    { imageFor: (n) => S.imageUrls.get(n) ?? `/textures/${n}.png` }))
}
S.openPalette = () => S.ui.showSheet('Place', placePalette({
  mobs: Object.keys(S.module.mobs?.mobs ?? {}), props: [...moduleProps(S.module).map((p) => p.name), ...S.catalogue], armed: S.place
}, (armed) => { S.place = armed; S.openPalette(); if (armed) S.status(`tap the floor to place ${armed.name}`, 'ok') }, () => S.showProps()))
S.duplicateSector = (id) => {
  const s = S.doc.sectors[id]
  const copy = addSector(S.doc, s.verts.map((v) => ({ x: v.x + 2, y: v.y + 2 })),
                         { kind: s.kind, floor: s.floor, ceil: s.ceil, light: s.light, thickness: s.thickness, floorTex: s.floorTex, ceilTex: s.ceilTex })
  copy.verts.forEach((v, i) => { const { id: _e, ...attrs } = s.verts[i].edge; v.edge = newEdge(S.doc, { ...attrs, flags: { ...s.verts[i].edge.flags } }) })
  S.select({ kind: 'sector', id: copy.id })
  S.commit()
}
S.pickInViewport = (kinds, prompt) => new Promise((resolve) => {
  S.pick = { kinds, resolve }
  S.status(prompt, 'ok')
  S.ui.hideSheet()
  redraw()
})
/** A room's tag, giving it the next free one if it has none: what a tag argument picked on the map is. */
S.ensureTag = (sectorId) => {
  const s = S.doc.sectors[sectorId]
  if (!s) return null
  if (!s.tag) {
    const used = new Set(Object.values(S.doc.sectors).map((x) => x.tag).filter(Boolean))
    let t = 1
    while (used.has(t)) t++
    s.tag = t
    S.commit()
  }
  return s.tag
}
/**
 * Picking on the map for a form's arguments (argform.js): a room for a tag, a
 * point for x/y/z, a placed thing for a name. `around` wraps the pick for a
 * window that covers the map (the graph steps aside while it is done).
 */
/** What an argument form needs to choose a panel and its widgets (argform.js). */
S.panelCtx = () => ({
  panels: () => Object.keys(S.module.panels ?? {}),
  widgetsOf: (panel) => (S.module.panels?.[panel]?.widgets ?? []).map((w) => w.name),
  widgetIds: () => Object.entries(S.module.panels ?? {}).flatMap(([p, q]) => q.widgets.filter((w) => w.kind !== 'label').map((w) => [w.id, `${p} · ${w.name} (${w.id})`])),
  editPanel: (name) => S.go('panels', name || null)
})
S.mapPickers = (around = (f) => f()) => ({
  pickSector: (cb) => around(() => S.pickInViewport(['sector'], 'tap a room')).then((hit) => cb(hit)),
  pickTag: (cb) => around(() => S.pickInViewport(['sector'], 'tap the room (it is given a tag if it has none)')).then((hit) => cb(S.ensureTag(hit.id))),
  pickPoint: (cb) => around(() => S.pickInViewport(['point'], 'tap the floor where it should be')).then((hit) => cb(hit)),
  pickThing: (cb) => around(() => S.pickInViewport(['entity'], 'tap a placed monster or prop')).then((hit) => cb(S.doc.entities.find((e) => e.id === hit.id))),
  pickEdge: (cb) => around(() => S.pickInViewport(['edge'], 'tap the wall')).then((hit) => cb(hit))
})
// What an open trigger touches: [{ kind: 'edge'|'sector'|'point', id|x,y, tone, label }],
// drawn in the viewport in the colour of the section that uses it.
S.setHighlights = (refs) => { S.highlights = refs; redraw() }
S.reopen = (title, body, onClose = null) => S.ui.showSheet(title, body, onClose)
// The module changed (a monster, a body, a texture): save, and re-bake so the
// module's mobs.lua the map declares is current.
S.moduleChanged = () => {
  save()
  previewNow()
  badgesSoon()
  S.moduleHistory?.commit({ module: S.module, docs: S.docs })
  S.shell?.setHistory(S.moduleHistory?.canUndo, S.moduleHistory?.canRedo)
}

/**
 * The module as it was: an undo or a redo on a page. The maps come back with
 * it, because a module edit can reach into them -- a texture renamed on every
 * surface that named it -- and restoring one without the other would leave a
 * map naming something the module no longer has.
 */
function restoreModule (snap) {
  if (!snap) return
  const m = snap.module
  S.module = m
  S.rec.module = m
  S.docs = snap.docs
  S.rec.docs = snap.docs
  if (!S.docs[S.docName]) S.docName = Object.keys(S.docs)[0]
  S.doc = S.docs[S.docName]
  S.history.commit(S.doc)
  S.ui.setHistory(S.history.canUndo, S.history.canRedo)
  S.sprites?.forgetAll()
  S.shell.moduleName = m.name || m.id
  S.shell.setHistory(S.moduleHistory.canUndo, S.moduleHistory.canRedo)
  save()
  previewNow()
  S.router.remount()
}
S.undoModule = () => restoreModule(S.moduleHistory?.undo())
S.redoModule = () => restoreModule(S.moduleHistory?.redo())
// ⌘Z on a page is the module's; in the map editor it is the map's (onKey).
addEventListener('keydown', (e) => {
  if (S.route() === 'map' || !S.route()) return
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redoModule() : S.undoModule() }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redoModule() }
})

const ctx = {
  commit: () => S.commit(), preview: () => previewNow(), select: (sel) => S.select(sel),
  otherSide: (edgeId) => tools.otherSide(S, edgeId),
  status: (t, l) => S.status(t, l), refreshSheet: () => S.refreshSheet(),
  pickTexture: (c, cb) => S.pickTexture(c, cb), duplicateSector: (id) => S.duplicateSector(id),
  editProp: (name) => { if (S.module.props?.some((p) => p.name === name)) S.showProp(name); else S.status(`${name} is the catalogue's, not this module's`, 'warn') },
  fxSchema: () => S.fxSchema ?? null,
  problems: (sectorId) => (S.problems ?? []).filter((p) => p.sector === sectorId),
  seamFor: (edgeId) => S.seamFor?.(edgeId) ?? null
}
// The sector effects' keys and defaults, read from the engine by a probe bake
// (fxlib.js) once the studio is up; the inspector shows them when they land.
fxSchema({ core: S.core, bake: S.bake })
  .then((r) => { S.fxSchema = r; if (S.selection?.kind === 'sector') showInspector() })
  .catch((e) => console.warn('[studio] effects schema:', e.message))

function showInspector () {
  const body = inspector(S.selection, S.doc, ctx)
  if (!body) { S.ui.hideSheet(); return }
  S.ui.showSheet(titleFor(S.selection, S.doc), body)
}

function rememberStyle (s) {
  if (!s) return
  // The next room drawn takes after the last one touched: heights, light,
  // textures, and whether it is a floating platform.
  S.style.sector = { kind: s.kind, floor: s.floor, ceil: s.ceil, light: s.light, thickness: s.thickness, floorTex: s.floorTex, ceilTex: s.ceilTex }
  S.style.edge = { middle: s.verts[0]?.edge.middle ?? null }
}

function restore (doc) {
  if (!doc) return
  S.docs[S.docName] = doc
  S.doc = doc
  S.moduleHistory?.replace({ module: S.module, docs: S.docs })
  S.selection = null
  S.ui.hideSheet()
  S.ui.setHistory(S.history.canUndo, S.history.canRedo)
  save()
  redraw()
  previewNow()
}

function previewNow () { S.preview.refresh(S.module, S.doc) }

function chooseTool (id) {
  if (id === 'play') return play()
  if (id === 'menu') return showMenu()
  if (id === 'graph') return S.go('graph')
  if (S.tool === 'room' && id !== 'room') tools.cancelRoom(S)
  if ((S.tool === 'path' || S.tool === 'camera') && id !== 'path' && id !== 'camera') { S.pathEdit = null; S.pathPointSel = null; redraw() }
  S.tool = id
  S.ui.setTool(id)
  S.pick = null
  if (id === 'place') S.openPalette()
  else if (id === 'trigger') { S.triggerOpen = null; S.ui.showSheet('Triggers', triggersSheet(S), () => S.setHighlights([])) }
  else if (id === 'camera') S.showCamera()
  else if (id === 'room') { S.ui.hideSheet(); S.status('tap corners, tap the first one again to close -- or drag a rectangle', 'ok') }
  else S.ui.hideSheet()
}

function onKey (e) {
  // The map editor's keys, only while it is the section showing.
  if (S.route() !== 'map') return
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? S.history.redo() : S.history.undo()); return }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(S.history.redo()); return }
  switch (e.key) {
    case 'Escape':
      if (S.draw.corners.length) tools.cancelRoom(S)
      else if (S.tool === 'path') chooseTool('select')
      else { S.pick = null; S.select(null) }
      break
    case 'Enter': if (S.tool === 'room') tools.finishRoom(S); break
    case 'Delete': case 'Backspace': deleteSelection(); break
    case '1': chooseTool('select'); break
    case '2': chooseTool('room'); break
    case '3': chooseTool('place'); break
    case '4': chooseTool('trigger'); break
    case '5': chooseTool('graph'); break
    case '6': chooseTool('camera'); break
    case '+': case '=': S.viewport.zoomBy(1.2); break
    case '-': S.viewport.zoomBy(1 / 1.2); break
    case 'q': S.viewport.rotate(-Math.PI / 4); break
    case 'e': S.viewport.rotate(Math.PI / 4); break
    case 'v': S.ui.on.view(); break
    case 'ArrowLeft': S.viewport.panBy(40, 0); break
    case 'ArrowRight': S.viewport.panBy(-40, 0); break
    case 'ArrowUp': S.viewport.panBy(0, 40); break
    case 'ArrowDown': S.viewport.panBy(0, -40); break
  }
}

function deleteSelection () {
  const sel = S.selection
  if (!sel) return
  const d = S.doc
  if (sel.kind === 'sector') { delete d.sectors[sel.id]; d.order = d.order.filter((x) => x !== sel.id) } else if (sel.kind === 'entity') d.entities = d.entities.filter((x) => x.id !== sel.id)
  else if (sel.kind === 'spawn') d.spawns = d.spawns.filter((x) => x.id !== sel.id)
  else if (sel.kind === 'light') d.lights = d.lights.filter((x) => x.id !== sel.id)
  else if (sel.kind === 'vertex') {
    const s = d.sectors[sel.sectorId]
    if (s && s.verts.length > 3) s.verts = s.verts.filter((v) => v.id !== sel.id)
  } else return
  S.select(null)
  S.commit()
}

// --- drawing the furniture ------------------------------------------------------------------
function redraw () {
  const d = S.doc
  const sel = S.selection
  const sid = sel?.kind === 'sector' ? sel.id : sel?.sectorId
  const s = sid ? d.sectors[sid] : null
  const lines = []
  const handles = []
  // While drawing a room or dragging a corner, every other room's corners are
  // shown: they are what a new corner snaps to, and a wall between two rooms
  // is made by landing on them.
  if (S.tool === 'room' || S.drag?.kind === 'vertex') {
    for (const oid of d.order) {
      if (S.drag?.kind === 'vertex' && oid === S.drag.s.id) continue
      const o = d.sectors[oid]
      for (const v of o.verts) handles.push({ id: v.id, x: v.x, y: v.y, z: o.floor, color: COLORS.corner })
    }
  }
  if (s) {
    lines.push({ points: s.verts.map((v) => ({ x: v.x, y: v.y, z: s.floor })), closed: true, color: COLORS.outline })
    handles.push(...s.verts.map((v) => ({ id: v.id, x: v.x, y: v.y, z: s.floor, hot: sel.kind === 'vertex' && sel.id === v.id })))
    if (sel.kind === 'edge') {
      const e = findEdge(d, sel.id)
      if (e) lines.push({ points: insetEdge(e, 0.2, s.floor + 0.05), color: COLORS.edgeHot })
    }
  }
  // While a pick is pending, everything that could be tapped is shown thin
  // and blue: every wall, every room, every placed thing, as asked.
  const segs = []
  if (S.pick) {
    for (const oid of d.order) {
      const o = d.sectors[oid]
      const want = (S.pick.kinds.includes('edge') || S.pick.kinds.includes('sector'))
      if (!want) continue
      o.verts.forEach((v, i) => {
        const q = o.verts[(i + 1) % o.verts.length]
        const [a, b] = S.pick.kinds.includes('edge') ? insetEdge({ vert: v, sector: o, i }, 0.12, o.floor) : [{ x: v.x, y: v.y, z: o.floor }, { x: q.x, y: q.y, z: o.floor }]
        segs.push({ a, b })
      })
    }
    if (S.pick.kinds.includes('entity')) {
      for (const e of d.entities) {
        const r = 0.5
        const ring = [[-r, 0], [0, r], [r, 0], [0, -r]]
        for (let i = 0; i < 4; i++) segs.push({ a: { x: e.x + ring[i][0], y: e.y + ring[i][1], z: e.z }, b: { x: e.x + ring[(i + 1) % 4][0], y: e.y + ring[(i + 1) % 4][1], z: e.z } })
      }
    }
  }
  S.viewport.setSegments(segs)
  // What the open trigger touches, in its section's colour, with a badge
  // saying which section.
  const badges = []
  for (const r of S.highlights) {
    const color = COLORS[r.tone] ?? COLORS.if
    if (r.kind === 'edge') {
      const e = findEdge(d, r.id)
      if (!e) continue
      const pts = insetEdge(e, 0.35, e.sector.floor + 0.06)
      lines.push({ points: pts, color })
      badges.push({ x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2, z: e.sector.floor, label: r.label, color })
    } else if (r.kind === 'sector') {
      const o = d.sectors[r.id]
      if (!o) continue
      lines.push({ points: o.verts.map((v) => ({ x: v.x, y: v.y, z: o.floor + 0.06 })), closed: true, color })
      const n = o.verts.length
      badges.push({ x: o.verts.reduce((a, v) => a + v.x, 0) / n, y: o.verts.reduce((a, v) => a + v.y, 0) / n, z: o.floor, label: r.label, color })
    } else if (r.kind === 'point') {
      badges.push({ x: r.x, y: r.y, z: r.z ?? 0, label: r.label, color })
    }
  }
  // THE METAMAP: this map's cell, its neighbours' names, and its boundary
  // sides by how they meet a neighbour's (metamap.js seamCheck).
  const mm = S.module.metamap
  if (mm?.enabled && mm.pitch && mm.cells?.[S.docName]) {
    const [pw, ph] = mm.pitch
    lines.push({ points: [{ x: 0, y: 0, z: 0 }, { x: pw, y: 0, z: 0 }, { x: pw, y: ph, z: 0 }, { x: 0, y: ph, z: 0 }], closed: true, color: COLORS.cell })
    for (const nb of S.neighbourInfo ?? []) {
      badges.push({ x: nb.offset.x + pw / 2, y: nb.offset.y + ph / 2, z: 0, label: `${nb.name}${nb.failed ? ' (does not bake)' : ''}`, color: COLORS.cell })
      // Dimmed, so the one map under a finger is the one that looks it.
      for (const p of nb.polys ?? []) lines.push({ points: p.pts.map((v) => ({ x: v.x + nb.offset.x, y: v.y + nb.offset.y, z: p.floor + 0.04 })), closed: true, color: COLORS.neighbourShade, fill: 0.5 })
    }
    for (const sm of S.seams ?? []) {
      const e = findEdge(d, sm.edgeId)
      if (!e) continue
      lines.push({ points: insetEdge(e, 0.15, e.sector.floor + 0.12), color: COLORS[`seam_${sm.state.replace('-', '')}`] ?? COLORS.cell })
    }
  }
  // WHAT IS WRONG, on the map: each room a bake or a check complained about,
  // outlined in red (amber for a warning) with a badge, and the wall itself
  // when the complaint named one.
  const marked = new Set()
  for (const p of S.problems ?? []) {
    const o = d.sectors[p.sector]
    if (!o) continue
    const color = p.level === 'warn' ? COLORS.problemWarn : COLORS.problem
    if (p.edge) {
      const e = findEdge(d, p.edge)
      if (e) lines.push({ points: insetEdge(e, 0.2, o.floor + 0.1), color })
    }
    if (marked.has(p.sector)) continue
    marked.add(p.sector)
    lines.push({ points: o.verts.map((v) => ({ x: v.x, y: v.y, z: o.floor + 0.08 })), closed: true, color, fill: p.level === 'warn' ? 0.18 : 0.3 })
    const n = o.verts.length
    badges.push({ x: o.verts.reduce((a, v) => a + v.x, 0) / n, y: o.verts.reduce((a, v) => a + v.y, 0) / n, z: o.floor, label: p.level === 'warn' ? '⚠' : '✖ wrong', color })
  }
  // Camera paths: the CURVE the camera rides, which is not the polyline through
  // the points (docs/MAP_AUTHOR.md) -- so the one being edited shows both, the
  // way the game's own ?paths=1 overlay does, because that is the only way to
  // tell a deliberate bulge from a point in the wrong place.
  for (const p of d.paths ?? []) {
    const hot = p.id === S.pathEdit
    const curve = S.pathCurve(p)
    if (curve) lines.push({ points: curve.points, color: hot ? COLORS.pathHot : COLORS.path })
    if (hot) {
      if (curve) lines.push({ points: p.points.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })), closed: p.loop, color: COLORS.pathChord })
      handles.push(...p.points.map((pt) => ({ id: pt.id, kind: 'pathpoint', x: pt.x, y: pt.y, z: pt.z,
                                             hot: pt.id === S.pathPointSel, color: pt.id === S.pathPointSel ? undefined : COLORS.pathHot })))
      // NUMBERED, because the order is the shape and moving a waypoint along
      // the curve has no visible effect otherwise.
      p.points.forEach((pt, n) => badges.push({ x: pt.x, y: pt.y, z: pt.z, label: String(n + 1), color: COLORS.pathHot }))
    }
  }
  if (S.draw.corners.length) {
    const z = S.workZ()
    lines.push({ points: S.draw.corners.map((c) => ({ ...c, z })), closed: false, color: COLORS.rubber })
    handles.push(...S.draw.corners.map((c, i) => ({ id: `draw${i}`, x: c.x, y: c.y, z, hot: i === 0 })))
  }
  S.viewport.setHandles(handles)
  if (S.draw.rect) {
    const r = S.draw.rect; const z = S.workZ()
    lines.push({ points: [{ x: r.x0, y: r.y0, z }, { x: r.x1, y: r.y0, z }, { x: r.x1, y: r.y1, z }, { x: r.x0, y: r.y1, z }], closed: true, color: COLORS.rubber })
  }
  S.viewport.setLines(lines)
  const markers = []
  for (const p of d.spawns) markers.push({ id: p.id, kind: 'spawn', x: p.x, y: p.y, z: p.z, label: `⚑ ${p.tag}`, color: COLORS.spawn })
  for (const l of d.lights) markers.push({ id: l.id, kind: 'light', x: l.x, y: l.y, z: l.z, label: '☀ light', color: COLORS.light })
  for (const e of d.entities) markers.push({ id: e.id, kind: 'entity', x: e.x, y: e.y, z: e.z, label: e.name, color: e.kind === 'mob' ? COLORS.mob : COLORS.prop, icon: S.sprites?.iconFor(e.name) })
  badges.forEach((b, i) => markers.push({ id: `badge${i}`, kind: 'badge', x: b.x, y: b.y, z: b.z + 0.6, label: b.label, color: b.color }))
  S.viewport.setMarkers(markers)
}

/** The two ends of an edge, moved a little into its own room (rooms are counter-clockwise, so inside is to the left). */
function insetEdge (e, by, z) {
  const q = e.sector.verts[(e.i + 1) % e.sector.verts.length]
  const len = Math.hypot(q.x - e.vert.x, q.y - e.vert.y) || 1
  const nx = -(q.y - e.vert.y) / len * by; const ny = (q.x - e.vert.x) / len * by
  return [{ x: e.vert.x + nx, y: e.vert.y + ny, z }, { x: q.x + nx, y: q.y + ny, z }]
}


/**
 * How tall a module sheet stands in the world. It is the manifest's
 * worldHeight, the one number the client scales every frame of the sheet by
 * (the catalogue's atlas line deliberately carries no size of its own), so
 * changing it is rewriting the manifest: the file, the parsed atlas the
 * viewport and the workshop draw from, and the bodies that stood as tall as
 * the sheet did, which keep matching it.
 */
S.setSheetHeight = async (name, h) => {
  const rec = S.module.sprites?.[name]
  const path = `sprites/${name}.json`
  const blob = S.rec.assets?.[path]
  if (!rec || !blob || !(h > 0)) return false
  const json = JSON.parse(await blob.text())
  const was = json.worldHeight
  json.worldHeight = h
  rec.worldHeight = h
  S.rec.assets[path] = new Blob([JSON.stringify(json)], { type: 'application/json' })
  const src = S.sheets.get(name)
  if (src) src.atlas = parseAtlas(json, name)
  for (const p of S.module.props ?? []) if (p.art?.sheet === name && p.height === was) p.height = h
  S.sprites.forgetAll()
  S.moduleChanged()
  redraw()
  return true
}


S.openDoc = openDoc
S.bankNames = bankNames
S.soundNames = () => [...new Set([...(S.moduleSounds ?? []), ...(S.servedSounds ?? [])])]
S.spriteNames = () => [...new Set([...S.spriteUrls.keys(), ...(S.servedSprites ?? [])])].sort()

/**
 * What a string field might hold, by its name and whose field it is: the
 * studio offers these as it is typed in (argform's `suggest`) and never
 * insists, because another module loaded beside this one has names too.
 */
S.suggest = (arg, owner) => {
  if (arg === 'sound' || (arg === 'name' && owner === 'sound')) return S.soundNames()
  if (arg === 'icon' || arg === 'frame') return S.spriteNames()
  if (arg === 'item') return S.propNames()
  if (arg === 'cue') return [...new Set(['default', ...Object.keys(S.doc?.music ?? {})])]
  if (arg === 'panel') return Object.keys(S.module?.panels ?? {})
  if (arg === 'name' && (owner === 'call' || owner === 'on_call')) return S.callNames?.() ?? null
  // The graph's world nodes: what to spawn, whose death, which prop, which picture.
  if (arg === 'what' && owner === 'spawn') return [...Object.keys(S.module.mobs?.mobs ?? {}), ...S.propNames()]
  if (arg === 'kind' && (owner === 'when_dies' || owner === 'when_hurt')) return Object.keys(S.module.mobs?.mobs ?? {})
  if (arg === 'prop') return S.propNames()
  if (arg === 'texture') return S.textureNames
  if (arg === 'param' && owner === 'add_effect') return paramNames()
  return null
}
/**
 * A sound's field, wherever one is: the module's sounds grouped by pack, a ▶
 * to hear the one chosen, and a red mark when no pack has the name -- which
 * the game would play as silence. Any name can still be typed ("other…"), for
 * a sound another module loaded beside this one provides.
 */
S.soundField = (label, value, onChange) => {
  const groups = S.soundsByPack?.() ?? new Map()
  const known = new Set([...groups.values()].flat())
  const sel = el('select', { class: 'st-sound' })
  sel.append(el('option', { value: '', text: '(none)' }))
  if (value && !known.has(value)) sel.append(el('option', { value, text: `${value} -- in no pack` }))
  for (const [pack, names] of groups) sel.append(el('optgroup', { label: pack }, names.map((n) => el('option', { value: n, text: n }))))
  sel.append(el('option', { value: '\u0000other', text: 'other… (type a name)' }))
  sel.value = value ?? ''
  const missing = !!value && !known.has(value)
  sel.dataset.missing = missing ? '1' : '0'
  sel.addEventListener('change', async () => {
    if (sel.value === '\u0000other') {
      const v = await ask('sound name', value ?? '')
      if (v !== null) onChange(v.trim())
      else sel.value = value ?? ''
      return
    }
    onChange(sel.value)
  })
  const play = button('▶', () => { if (sel.value && sel.value !== '\u0000other') S.hear(sel.value) })
  return row(label, sel, play)
}

/** Where a texture's picture is: the module's own, else the app's. */
S.imageFor = (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`

/** Every prop name a brain or a trigger may name: the module's bodies and props, then the served catalogue. */
S.propNames = () => [...new Set([...(S.module?.props ?? []).map((p) => p.name), ...S.catalogue])].sort()

/** Every particle kind anything may name: the module's own, then the served ones. */
S.vfxChoices = () => vfxChoices(S.module ?? {}, S.servedVfx ?? new Map())


// --- play, export, import -----------------------------------------------------------------------
async function emitAll () {
  const problems = validate(S.doc)
  if (problems.length) { S.status(problems.map((p) => (p.sector ? `${p.sector}: ` : '') + p.msg).join('\n'), 'error'); return null }
  // A graph the runtime would refuse does not load at all, so it is said here
  // rather than discovered as a level where nothing happens.
  for (const d of Object.values(S.docs)) {
    for (const [name, g] of graphsOf(d)) {
      const gp = S.vocab.graph ? graphProblems(g, S.vocab.graph, S.vocab.trigger, { maps: Object.keys(S.docs), paths: new Set((d.paths ?? []).map((x) => x.tag)) }) : []
      if (gp.length) { S.status(`${d.name}'s graph ${name}: ${gp.join('; ')}`, 'error'); return null }
    }
  }
  for (const [name, g] of graphsOf(S.module)) {
    const mg = S.vocab.graph ? graphProblems(g, S.vocab.graph, S.vocab.trigger, { game: true, maps: Object.keys(S.docs) }) : []
    if (mg.length) { S.status(`the game's graph ${name}: ${mg.join('; ')}`, 'error'); return null }
  }
  const sizes = { ...S.textureSizes }
  const assets = {}
  for (const [path, blob] of Object.entries(S.rec.assets ?? {})) assets[path] = new Uint8Array(await blob.arrayBuffer())
  const r = await emitModule(S.module, Object.values(S.docs), {
    // The hook names the server harvests, from the vocabulary that lists them.
    bake: S.bake, runtime: S.runtime, hooks: S.vocab.trigger.events.map((e) => e.name), assets, graphVocab: S.vocab.graph,
    textureSizes: (n) => (sizes[n] ? { w: sizes[n][0], h: sizes[n][1], cutout: !!texIndex.cutout?.[n] } : null)
  })
  if (!r.ok) {
    S.status(r.problems.map((p) => `${p.map}: ` + p.errors.map((e) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg)).join('; ')).join('\n'), 'error')
    return null
  }
  return r
}

async function play () {
  if (!hasShell()) { S.status('Play needs the app. In a browser, export a pack and run it with the engine (docs/STUDIO.md).', 'warn'); return }
  S.status('baking…', 'ok')
  const r = await emitAll()
  if (!r) return
  const root = `modules/${S.module.id}`
  for (const f of r.files) {
    const bytes = typeof f.bytes === 'string' ? new TextEncoder().encode(f.bytes) : f.bytes
    await shell.writeFile(`${root}/${f.path}`, bytes)
  }
  S.status('starting the game…', 'ok')
  rememberReturn()
  try { await shell.launch({ module: root, map: `${S.docName}.dnpm` }) } catch (e) { forgetReturn(); S.status(String(e.message ?? e), 'error') }
}

// BACK FROM PLAY, to the map that was being tested. The game's "◀ Studio" link
// opens /studio/ with no address of its own, so before Play the studio notes
// where it was -- the module, the map, and the view onto it -- and the next
// boot with no address goes back there. Per device (localStorage), and only
// for a while: an hour later, the studio opening on Home is what is expected.

function rememberReturn () {
  const v = S.viewport
  try {
    localStorage.setItem(RETURN_KEY, JSON.stringify({ module: S.module.id, map: S.docName, at: Date.now(),
      view: { target: v.target, viewHeight: v.viewHeight, mode: v.mode, yaw: v.yaw } }))
  } catch {}
}
function forgetReturn () { try { localStorage.removeItem(RETURN_KEY) } catch {} }

/** Where Play left from, if this boot is the way back: { module, map, view } or null. */
function takeReturn () {
  let r = null
  try { r = JSON.parse(localStorage.getItem(RETURN_KEY) ?? 'null') } catch {}
  forgetReturn()
  if (!r || !(Date.now() - r.at < RETURN_MS)) return null
  return r
}
S.rememberReturn = rememberReturn

async function exportPack () {
  S.status('baking…', 'ok')
  const r = await emitAll()
  if (!r) return
  const zip = await writePack(r.files.map((f) => ({ path: `${S.module.id}/${f.path}`, bytes: f.bytes })))
  await shell.share(`${S.module.id}.zip`, zip)
  S.status(`exported ${S.module.id}.zip (${(zip.length / 1024).toFixed(0)} KB). Unzip into modules/ and run --module ${S.module.id}.`, 'ok')
}

async function importPack () {
  const f = await shell.importFile('.zip,application/zip')
  if (!f) return
  let entries
  try { entries = await readPack(f.bytes) } catch (e) { S.status(`not a pack: ${e.message}`, 'error'); return }
  const modEntry = entries.find((e) => e.path.endsWith('module.studio.json'))
  if (!modEntry) { S.status('the pack has no module.studio.json; only packs written by the studio can be opened', 'error'); return }
  const prefix = modEntry.path.slice(0, -'module.studio.json'.length)
  const rec = recordFromEntries(entries.filter((e) => e.path.startsWith(prefix)).map((e) => ({ path: e.path.slice(prefix.length), bytes: e.bytes })))
  if (!rec) { S.status('the pack has no maps', 'error'); return }
  await S.store.save(rec)
  await openModule(rec.id)
  S.status(`opened ${rec.id}`, 'ok')
}


/**
 * How many of a map's script slots this module spends, and on what.
 *
 * Said here because the alternative is finding out at the bake.
 */
function scriptBudget () {
  const decls = scriptDecls(S.module, {
    hasMobs: Object.keys(S.module.mobs?.mobs ?? {}).length > 0 || Object.keys(S.module.mobs?.missiles ?? {}).length > 0,
    hasTriggers: (S.doc?.triggers?.length ?? 0) > 0,
    hasWeapons: hasWeapons(S.module),
    graphs: liveGraphs(S.doc).map(([name]) => graphFile(S.docName, name))
  })
  const used = decls.length + 1
  const game = gameScripts(S.module).map(gameFileOf)
  return `Scripts: ${used} of the ${CAP.scripts} a map may declare -- ${decls.map((d) => d.split('/').pop()).join(', ')}, and ${S.docName}.lua.` +
         (game.length ? ` The game's own scripts are not among them: they run once for the whole game (${game.join(', ')}).` : '')
}

/** The map editor's ⋯: what is about this map, not the module. */
function showMenu () {
  S.ui.showMenu([
    ['Map settings…', showMapSettings],
    ['Camera…', () => S.showCamera()],
    ['Import texture (PNG)', () => S.importTexture()],
    ['Fit view', frameToDoc],
    ['Help', () => S.ui.showSheet('Help', [
      muted('Room: tap corners and close on the first, or drag a rectangle. Rooms that touch share a wall; a room inside a room is a platform when its floor is higher and a pit when it is lower.'),
      muted('Select: tap a room, a wall or a corner. Drag corners to reshape, drag a selected room to move it. Long-press a wall to add a corner, a corner to remove it.'),
      muted('Place: monsters, props, spawns and lights, on the floor you tap.'),
      muted('Triggers: doors, lifts, switches, teleports, ambushes and exits in one tap, then change any detail on the card.'),
      muted('Graph: node scripting for this map. The module\'s monsters, player, weapons and everything else are in the rail on the left (or ‹ on a phone).'),
      muted('Keys: 1-6 tools · Enter closes a room · Esc cancels · Del deletes · Q/E rotate · V plan/game view · +/- zoom · arrows pan.')
    ])]
  ])
}

/** Everything that belongs to this map and not to a room in it. */
function showMapSettings () {
  const own = overrides(S.doc)
  S.ui.showSheet(`Map ${S.docName}`, [
    text('extra Lua', S.doc.extraLua, (v) => { S.doc.extraLua = v; S.commit() }, { multiline: true, placeholder: '-- hand-written Lua, kept verbatim' }),
    el('div', { class: 'st-row' }, [button('🎥 camera…', () => S.showCamera()), button('◇ graph…', () => S.go('graph')), button('♪ music cues…', () => S.go('music'))]),
    el('div', { class: 'st-row' }, [
      button(`🧍 player${own.length ? ` (own ${own.join(', ')})` : ''}…`, () => { S.playerScope = 'map'; S.go('player') }),
      button(`▣ screens${S.doc.ui ? ' (own)' : ''}…`, () => { S.screensScope = 'map'; S.go('screens') })
    ]),
    muted(scriptBudget())
  ])
}
S.showMapSettings = showMapSettings


