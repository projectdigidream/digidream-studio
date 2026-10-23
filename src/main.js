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
import { buttonNames } from './keys_emit.js'
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
import { install as installSnapshots } from './sections/snapshots.js'
import { install as installControls } from './sections/controls.js'
import { install as installScripts } from './sections/scripts.js'
import { install as installGraphs } from './sections/graphs.js'
import { install as installStyle } from './sections/style.js'
import { install as installSky } from './mapeditor/sky.js'
import { install as installSkySection } from './sections/sky.js'
import { install as installCamera } from './mapeditor/camera.js'
import { install as installNeighbours } from './mapeditor/neighbours.js'
import { migratePlayer, overrides, paramNames } from './player.js'
import { migrateModule } from './migrate.js'
import { bankNames } from './soundpacks.js'
import { fxSchema } from './fxlib.js'
import { openScreens } from './screens.js'
import { openGraph } from './graphwin.js'
import { openPanels } from './panelwin.js'
import { decorIdsOf } from './panels_emit.js'
import { writeStudioLog, noteStudioLog, showPlayLog, lastPlay, readLogs, failures, playedGraphs } from './playlog.js'
import { graphProblems, graphsOf, liveGraphs, graphFile } from './graphs_emit.js'
import { markerNames, SIGN } from './markers.js'
import { Core } from '/src/core.js'
import { parseProps } from '/src/render/props.js'
import { parseAtlas } from '/src/render/atlas.js'
import { loadMapcBinary, bake as bakeWith } from './bake.js'
import { newDoc, addSector, addSpawn, validate, findEdge, newEdge, CAP, removeSector, graphsNaming } from './doc.js'
import { climbSides, climbProblems } from './climb.js'
import { normalize } from './topology.js'
import { newModule, emitModule, RUNTIME_SCRIPTS, scriptDecls, gameScripts, gameFileOf, cleanId } from './module_emit.js'
import { showPlayScreen } from './playscreen.js'
import { recordFromEntries, recordToEntries } from './record.js'
import { checkForUpdate } from './updates.js'
import { Vocab } from './vocab.js'
import { Viewport, COLORS, ALPHA, FILL, WIDTH, wearSkin as wearCanvasSkin } from './viewport.js'
import { Preview } from './preview.js'
import { TextureCache } from './textures.js'
import { SpriteLibrary } from './sprites.js'
import { Gestures } from './gestures.js'
import { History, keepHistories, takeHistories, restoreSteps } from './history.js'
import { Store, debounce, importSuite } from './store.js'
import { Snapshots, EVERY_MS, ON_OPEN_MS } from './snapshots.js'
import { STUDIO_VERSION } from './version.js'
import { parseAnimations } from '/src/render/animtex.js'
import { animationsTxt } from './texsheet.js'
import { shell, hasShell } from './bridge.js'
import { Ui, el, button, row, text, muted, card, select, number, ask, confirmDialog, useIcons, refreshIcons, icon, withIcon, installTapGuard } from './ui.js'
import { moduleProps } from './props.js'
import { hasWeapons } from './weapons_emit.js'
import { inspector, titleFor, texturePicker, placePalette } from './inspector.js'
import { triggersSheet } from './cards.js'
import { openWorkshop, openArsenal, openPlayer } from './workshop.js'
import { openMonsters, openWeapons } from './editors/editor.js'
import { openMissiles } from './editors/missiles.js'
import { arsenalRows } from './arms.js'
import { viewRows } from './viewform.js'
import { parseVfx } from '/src/render/vfx.js'
import { vfxChoices } from './vfxlib.js'
import * as tools from './tools.js'
import { writePack, readPack } from './pack.js'
import { BASE, RUNTIME, WASM, PLUGINS } from './base.js'
import { PluginRegistry, loadBundled } from './plugins/registry.js'
import { makeKinds, SUITE_KINDS } from './plugins/kinds.js'
import { installEditors, installPluginSections, startPluginServices, emitPluginEvent } from './plugins/frame.js'
import { sameBytes } from './plugins/protocol.js'
import { getDraft } from './plugins/drafts.js'
import { install as installPluginsPage } from './sections/plugins.js'
import { install as installSprites } from './sections/sprites.js'
import { installBaking } from './bake/apply.js'
import { ensureServiceWorker, loadInstalled } from './plugins/install.js'
import { wearSkin, skinList, iconCatalog } from './skin.js'
import { redrawThumbs } from './thumbs.js'

const boot = document.getElementById('boot')
const bootMsg = document.getElementById('bootmsg')
const bootFill = document.getElementById('bootfill')
// A stage: the line under the bar, and a step in the loading log (index.html).
const bootLog = (line, kind) => globalThis.__bootLog?.(line, kind)
let stageAt = performance.now()
let stageName = null
const stage = (msg, frac) => {
  if (stageName) bootLog(`✓ ${stageName} (${Math.round(performance.now() - stageAt)} ms)`)
  stageName = msg; stageAt = performance.now()
  globalThis.__bootStage = msg
  bootMsg.textContent = msg; bootFill.style.width = `${Math.round(frac * 100)}%`
}
/** A step inside a stage: logged, and remembered for the watchdog's "last step". */
const bootStep = (line) => { globalThis.__bootStep = line; bootLog(`  ${line}`) }

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

// This device's choices (localStorage, dnp.studio.*): never the module's.
const PREF = 'dnp.studio.'
// In the apps they are also a file of the app's own: Electron writes
// localStorage to disk when it gets round to it, and a forced quit lost the
// style and pointer just chosen. Read back first, so the skin below wears them.
const PREFS_FILE = 'settings/studio-prefs.json'
if (hasShell()) {
  try {
    const b = await shell.readFile(PREFS_FILE)
    if (b) for (const [k, v] of Object.entries(JSON.parse(new TextDecoder().decode(b)))) if (typeof v === 'string') localStorage.setItem(PREF + k, v)
  } catch {}
}
const keepPrefs = debounce(() => {
  const all = {}
  try { for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); if (k?.startsWith(PREF)) all[k.slice(PREF.length)] = localStorage.getItem(k) } } catch { return }
  shell.writeFile(PREFS_FILE, new TextEncoder().encode(JSON.stringify(all))).catch(() => {})
}, 300)
S.prefs = { get: (k) => { try { return localStorage.getItem(PREF + k) } catch { return null } }, set: (k, v) => { try { localStorage.setItem(PREF + k, v) } catch {} if (hasShell()) keepPrefs() } }

// --- boot ----------------------------------------------------------------------------
bootLog(`studio ${STUDIO_VERSION} · ${hasShell() ? 'in the app' : 'in a browser'} · ${navigator.platform || 'unknown platform'} · ${location.origin}`)
// The look, before anything is drawn (skin.js): the boot screen takes it too.
stage('putting on the skin', 0.02)
S.skin = await wearSkin(S.prefs)
S.skinList = await skinList()
// Icons by catalog id (ui.js icon): the skin's picture, or today's glyph.
useIcons(S.skin, await iconCatalog())
bootStep(`skin ${S.skin.id} · ${S.skin.view.mode} · ${S.skin.view.pointer}`)
stage('loading the core', 0.05)
S.core = await Core.load()
stage('loading the map compiler', 0.2)
const mapcBinary = await loadMapcBinary(`${WASM}mapc.wasm`)
S.bake = (opts) => bakeWith({ ...opts, wasmBinary: mapcBinary })
stage('loading the runtime', 0.35)
for (const name of RUNTIME_SCRIPTS) S.runtime[name] = await fetchText(`${RUNTIME}${name}`)
S.vocab = new Vocab(await fetchJson(`${RUNTIME}trigger_vocab.json`), await fetchJson(`${RUNTIME}mob_vocab.json`),
                    await fetchJson(`${RUNTIME}weapon_vocab.json`).catch(() => null))
// The graph nodes' types and pins (docs/GRAPHS.md), generated from graph_vocab.lua.
S.vocab.graph = await fetchJson(`${RUNTIME}graph_vocab.json`).catch(() => null)
// The plugins bundled with this build (plugins/index.json); installed ones join
// them later. Which editor a kind opens in is remembered per device.
stage('loading plugins', 0.45)
S.plugins = new PluginRegistry({
  suiteVersion: STUDIO_VERSION,
  knownKinds: SUITE_KINDS,
  prefs: S.prefs
})
S.bundledPlugins = await loadBundled(S.plugins, { base: PLUGINS, fetchJson: (u) => fetchJson(u) })
bootStep(`${S.bundledPlugins} bundled plugin(s)`)
// Plugins installed later (plugins/install.js) are served by the studio's
// service worker; where there is none, there are only the bundled ones.
S.canInstall = await ensureServiceWorker(BASE)
if (S.canInstall) bootStep(`${await loadInstalled(S.plugins, { base: BASE })} installed plugin(s)`)
// Switched off on this device (the Plugins page).
try { for (const id of JSON.parse(localStorage.getItem('dnp.studio.disabled') ?? '[]')) S.plugins.setEnabled(id, false) } catch {}
S.savePluginState = () => { try { localStorage.setItem('dnp.studio.disabled', JSON.stringify(S.plugins.list().filter((p) => !p.enabled).map((p) => p.manifest.id))) } catch {} }
for (const r of S.plugins.refused) console.warn('[studio] plugin refused:', r.id, r.errors.join('; '))
// Hidden plugins (the test editor, examples) only when asked for, per device.
S.plugins.showHidden = S.devPlugins = S.plugins.prefs.get('devPlugins') === '1'
S.docKinds = makeKinds(S)
// Sources baked into what the game loads (bake/): on an editor's save, and before Play and Export.
installBaking(S, { parseAtlas })
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
bootStep('opening the store (IndexedDB)')
S.store = await Store.open()
// The badge a plugin set per module (S.pluginStatus, below): here, before the first module opens.
const badges = new Map() // module id -> { plugin, text, level }
S.moduleBadge = (id) => badges.get(id) ?? null
// Modules made in the suite (the studio's fork before 0.2.0), brought over once.
try {
  const KEY = 'dnp.studio.suiteImported'
  const got = await importSuite(S.store, { done: () => { try { return !!localStorage.getItem(KEY) } catch { return false } }, mark: () => { try { localStorage.setItem(KEY, '1') } catch {} } })
  if (got.length) bootStep(`brought over from the suite: ${got.join(', ')}`)
} catch (e) { console.warn('[studio] the suite\'s modules could not be brought over:', e?.message ?? e) }
bootStep('the store is open')
// Copies of a module to go back to (snapshots.js). Without them the studio
// still works: a failure here is said, not fatal.
S.snaps = await Snapshots.open().catch((e) => { console.warn('[studio] no snapshots:', e); return null })
/**
 * Take a snapshot of the module being edited (or of `rec`), quietly: a
 * failure is a warning, never a lost edit. `reason` is said in the list.
 */
S.snapshot = async (reason, { rec = S.rec, force = false } = {}) => {
  if (!S.snaps || !rec) return null
  try {
    const snap = await S.snaps.take(rec, reason, { force })
    if (rec === S.rec) S.lastSnapAt = snap?.at ?? S.lastSnapAt ?? Date.now()
    return snap
  } catch (e) { console.warn('[studio] snapshot failed:', e); return null }
}
bootStep(S.snaps ? 'snapshots are open' : 'no snapshots (the store has no room for them)')
await seedFromShell()
{
  const list = await S.store.list()
  bootStep(`${list.length} module${list.length === 1 ? '' : 's'} in the store${list.length ? `: ${list.map((r) => r.id).join(', ')}` : ''}`)
  bootStep(`opening ${list[0]?.id ?? 'a new module'}`)
  await openModule(list[0]?.id ?? null)
  bootStep(`opened ${S.module?.id}: ${Object.keys(S.docs ?? {}).length} map(s)`)
}

stage('the picture', 0.85)
wearCanvasSkin(S.skin)
S.viewport = new Viewport(document.body)
// A marker's icon picture has loaded: the badges are drawn again with it.
S.viewport.onLabelArt = () => redraw()
// A new skin or mode: the map editor's colours in place, then every drawing
// that asks the skin draws again (S.onSkin listeners: graph, previews, …).
S.skinListeners = new Set()
S.onSkin = (fn) => { S.skinListeners.add(fn); return () => S.skinListeners.delete(fn) }
S.onSkin((skin) => { redrawThumbs(skin); refreshIcons() })
S.skin.onChange(() => {
  wearCanvasSkin(S.skin)
  S.viewport.reskin()
  redraw()
  for (const fn of S.skinListeners) { try { fn(S.skin) } catch (e) { console.warn('[studio] a drawing did not take the skin:', e) } }
})
/** Where a texture's picture is: the module's own, else the app's. */
S.imageFor = (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`
// (Before the sky: it loads its pictures through this the moment it is installed.)
// The sky, before any map is drawn: a sky flat takes its material when it is built.
installSky(S)
// The module's own pictures come from the record's blobs; everything else the
// shell serves. Decoded once each, whatever the number of bakes.
// Animated textures: the app's (its frame lists and sheets, /animations.txt)
// and the module's own sheets over them, read by the client's own parser.
S.servedAnim = await fetch('/animations.txt').then((r) => (r.ok ? r.text() : '')).then(parseAnimations).catch(() => parseAnimations(''))
S.sheetOf = (n) => S.module?.textures?.[n]?.sheet ?? (S.module?.textures?.[n] ? null : S.servedAnim.sheets.get(n) ?? null)
S.animGroups = () => {
  const own = new Set(Object.keys(S.module?.textures ?? {}))
  return [...S.servedAnim.groups.filter((g) => !own.has(g.frames[0])), ...parseAnimations(animationsTxt(S.module) ?? '').groups]
}
S.textures = new TextureCache({ urlFor: (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`, cutout: texIndex.cutout ?? {}, sheetOf: (n) => S.sheetOf(n), groups: () => S.animGroups() })
S.preview = new Preview({ core: S.core, bake: S.bake, runtime: S.runtime, viewport: S.viewport, textures: S.textures,
                          hooks: S.vocab.trigger.events.map((e) => e.name) })
// Placed things are drawn as their own pictures, once those have loaded.
S.sprites = new SpriteLibrary({ sheets: S.sheets, kinds: S.kinds, moduleProps: () => S.module?.props ?? [], onLoad: () => redraw(), imageFor: (n) => S.spriteUrls.get(n) ?? null })
S.preview.onResult = (r) => {
  // The rooms something is wrong with, marked on the map in red (amber for a
  // warning) and explained in each one's inspector.
  const before = JSON.stringify(S.problems ?? [])
  // Climbable sides, worked out once a bake (derive is too dear for every
  // redraw): what climbs is drawn green, what never grabs is a warning.
  S.climbs = S.doc ? climbSides(S.doc).filter((c) => c.kind === 'wall' || c.kind === 'step') : []
  S.problems = [...(r.problems ?? []), ...(S.doc ? climbProblems(S.doc).map((p) => ({ ...p, level: 'warn' })) : [])]
  const rooms = new Set(S.problems.filter((p) => p.level === 'error').map((p) => p.sector)).size
  const lead = rooms ? `${rooms === 1 ? 'one room is' : `${rooms} rooms are`} wrong (marked in red; tap one to see why)\n` : ''
  // a map that does not bake is still drawn as it last baked: say so, or what is gone looks kept
  if (!r.ok) S.status(lead + r.errors.map((e) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg)).join('\n') + '\n(the view shows the map as it last baked)', 'error')
  else if (rooms) S.status(lead + S.problems.filter((p) => p.level === 'error').map((p) => p.msg).join('\n'), 'error')
  else if (r.warnings.length) S.status(r.warnings.map((w) => `${w.sector}: ${w.msg}`).join('\n'), 'warn')
  else if (S.held && performance.now() < S.held.until) S.status(S.held.text, S.held.level)
  else S.status(`${S.module.id} / ${S.docName}  ·  ${S.doc.order.length} sectors`, 'ok')
  // The neighbours and the seams follow every bake of this map (cheap: each
  // neighbour is baked again only when its own document changed).
  if (S.route() === 'map') S.refreshNeighbours?.()
  if (JSON.stringify(S.problems) !== before) { redraw(); if (S.selection && S.ui.sheetOpen && ['sector', 'edge'].includes(S.selection.kind)) showInspector() }
  S.viewport.dirty = true
}
// A tap that ends a typed edit lands where it was aimed (ui.js).
installTapGuard()
S.ui = new Ui({
  tool: (id) => chooseTool(id),
  undo: () => mapUndo(),
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
S.router = new Router({ onChange: () => {
  refreshBadges(); S.shell.drawRail()
  // Back on the map: the bake that waited, and a frame.
  if (S.route() === 'map') { if (S.previewStale) previewNow(); S.viewport.dirty = true }
} })
/** The rail's counts of what is wrong, by section (app/problems.js). */
function refreshBadges () {
  try { S.shell.badges = new Map(Object.entries(badgeCounts(moduleProblems(S)))) } catch (e) { console.warn('[studio] problems', e) }
}
const badgesSoon = debounce(() => { refreshBadges(); S.shell.drawRail() }, 400)
S.shell = new Shell({ router: S.router, on: { play: () => play(), exportPack: () => exportPack(), undo: () => S.undoHere(), redo: () => S.redoHere() } })
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
    S.syncHistory?.()
  },
  unmount: () => { S.window?.close(); S.window = null; S.ui.layer.dataset.workshop = '0' }
})
pageSection('home', 'Home', 'section.home', /^Home$/, () => S.showHome(), { rail: false })
pageSection('maps', 'Maps', 'section.maps', /^Maps$/, () => S.showMaps())
// The old entry points go to their sections; called from inside one, they draw it.
const sectionAlias = (id, fn) => (...a) => (S.route() === id ? fn(...a) : S.go(id, a[0] ?? null))
S.sectionAlias = sectionAlias
// The verbs the sections share, published before they are installed.
// `save` is a const further down; reached through a wrapper so this runs first.
S.save = () => save()
// Now, not in a moment: before a snapshot or a restore reads the store.
S.save.flush = () => save.flush()
Object.assign(S, { play, exportPack, importPack, frameToDoc, openModule, starterDoc, showInspector, emitAll })
for (const install of [installHome, installMaps, installProps, installParticles, installMusic, installSounds, installTextures, installSettings, installSnapshots, installControls, installScripts, installGraphs, installStyle, installSkySection, installCamera, installNeighbours]) install(S)
await S.loadPacks()
S.router.register({
  id: 'map', label: 'Map', icon: 'section.map', rail: false, parent: 'maps',
  mount: async (arg) => {
    S.shell.hidePage()
    S.ui.layer.dataset.page = '0'
    S.ui.layer.dataset.workshop = '0'
    if (arg && S.docs[arg] && arg !== S.docName) await openDoc(arg)
    // The sky this map is drawn under, as it is now (the Sky section may have changed it).
    S.applySky?.()
    S.viewport.resize?.()
    redraw()
    S.viewport.dirty = true
    S.refreshNeighbours?.()
  },
  unmount: () => { S.ui.hideSheet(); if (S.tool === 'room') tools.cancelRoom(S) }
})
windowSection('monsters', 'Monsters', 'section.monsters', (name) => openMonsters(S, name))
windowSection('player', 'Player', 'section.player', () => openPlayer(S))
pageSection('controls', 'Controls', 'section.controls', /^Controls$/, () => S.showControls())
// Screens on its touch tab: where the module's keys' buttons are placed.
S.showScreensTouch = async () => { await S.go('screens'); if (S.window) { S.window.tab = 'touch'; S.window.picked = null; S.window.render() } }
windowSection('weapons', 'Weapons', 'section.weapons', (name) => openWeapons(S, name))
// The module's missiles, shared by its monsters and weapons (no icon of their own in the catalog yet).
windowSection('missiles', 'Missiles', 'workshop.missiles', (name) => openMissiles(S, name))
pageSection('props', 'Props', 'section.props', /^Props$|^Prop /, (name) => (name ? S.showProp(name) : S.showProps()))
installSprites(S)
pageSection('sprites', 'Sprites', 'section.sprites', /^Sprites$/, (n) => S.showSprites(n))
pageSection('particles', 'Particles', 'section.particles', /^Particles/, (id) => S.showVfx(id ?? undefined))
pageSection('textures', 'Textures', 'section.textures', /^Textures$/, (n) => S.showTextures(n))
pageSection('music', 'Music', 'section.music', /^Soundtrack/, () => S.showMusic())
pageSection('sounds', 'Sounds', 'section.sounds', /^Sounds$/, () => S.showSounds())
windowSection('screens', 'Screens', 'section.screens', (arg) => openScreens(S, arg))
windowSection('panels', 'Panels', 'section.panels', (name) => openPanels(S, name))
pageSection('style', 'Style', 'section.style', /^Style$/, (name) => S.showStyle(name ?? null))
pageSection('sky', 'Sky', 'section.sky', /^Sky$/, (map) => S.showSky(map ?? null))
pageSection('scripts', 'Scripts', 'section.scripts', /^Scripts$/, (n) => S.showScripts(n))
pageSection('graphs', 'Graphs', 'section.graphs', /^Graphs$/, () => S.showGraphs())
windowSection('graph', 'Graph', 'section.graphs', (arg) => openGraph(S, arg), { rail: false, parent: 'graphs' })
pageSection('settings', 'Settings', 'section.settings', /^Module settings$/, () => S.showSettings())
pageSection('snapshots', 'Snapshots', 'section.snapshots', /^Snapshots$/, () => S.showSnapshots(), { rail: false })
pageSection('playlog', 'Play log', 'section.playlog', /^Play log$/, () => showPlayLog(S), { rail: false })
// THE PLUGINS (docs/PLUGINS.md). The studio's own pages that already edit a kind
// are its built-in editors: a plugin is offered beside them, never instead.
S.plugins.addBuiltin({ key: 'scripts', label: 'the Scripts page', kinds: ['record:script'], open: (k) => S.go('scripts', k) })
S.plugins.addBuiltin({ key: 'textures', label: 'the Textures page', kinds: ['file:texture'], open: (k) => S.go('textures', k) })
S.plugins.addBuiltin({ key: 'sounds', label: 'the Sounds page', kinds: ['file:sfxproj'], open: () => S.go('sounds') })
S.plugins.addBuiltin({ key: 'monsters', label: 'the Monsters workshop', kinds: ['record:mob'], open: (k) => S.go('monsters', k) })
installEditors(S)
installPluginsPage(S)
pageSection('plugins', 'Plugins', 'section.plugins', /^Plugins$/, () => S.showPlugins(), { rail: false })
installPluginSections(S)

/**
 * What a plugin may ask about the module (an editor's `query`): read-only,
 * and nothing the author could not see on a page -- but for the module's
 * palette (set-palette) and the sync's module-write. docs/PLUGINS.md, Queries.
 */
S.pluginQuery = async (what, arg, ctx = {}) => {
  switch (what) {
    case 'module': return { id: S.module.id, name: S.module.name ?? S.module.id, version: STUDIO_VERSION, rev: S.rec?.rev ?? 0 }
    // EVERY MODULE, not just the open one (a sync): their ids, names and revisions.
    case 'modules': return (await S.store.list()).map((r) => ({ id: r.id, name: r.module?.name ?? r.id, rev: r.rev ?? 0, opened: r.opened ?? 0, open: r.id === S.rec?.id }))
    // A module's files, unbaked (record.js), with the revision they are of:
    // what module-write takes back. The open module: what is waiting saved first.
    case 'record-files': {
      const id = arg?.id ?? S.rec?.id
      if (id === S.rec?.id) await settleSave()
      const rec = await S.store.load(id)
      if (!rec) throw new Error(`no module called ${id}`)
      return { id, rev: rec.rev ?? 0, files: await recordToEntries(rec) }
    }
    // Replace a module from files (main.js, writeModule); needs the permission.
    case 'module-write': {
      if (!S.plugins.can(ctx.plugin, 'module-write')) throw new Error(`${ctx.plugin ?? 'this page'} may not write modules (its plugin.json does not ask for "module-write")`)
      return writeModule({ id: arg?.id, baseRev: arg?.baseRev, files: arg?.files, by: S.plugins.plugins.get(ctx.plugin)?.manifest.name ?? ctx.plugin })
    }
    case 'kinds': return Object.values(S.docKinds).map((k) => ({ id: k.id, label: k.label }))
    case 'list': return S.docKinds[arg]?.list() ?? []
    case 'read': {
      const k = S.docKinds[arg?.kind]
      if (!k || !k.has(arg.key)) throw new Error(`no ${arg?.kind} called ${arg?.key}`)
      return (await k.read(arg.key)).payload
    }
    case 'textures': return Object.entries(S.module.textures ?? {}).map(([n, t]) => ({ name: n, w: t.w, h: t.h }))
    case 'sprites': return Object.keys(S.module.sprites ?? {})
    case 'sounds': return S.moduleSounds ?? []
    case 'palette': {
      const b = S.rec.assets?.['sources/palette.json']
      return b ? JSON.parse(await b.text()) : null
    }
    // THE MODULE'S PALETTE, set by a plugin (qPainter, ThreeSprite): one
    // palette both read ('palette') and write, so the two stay in step. A
    // digidream-palette object (INTEGRATION.md C2); keys the plugin did not
    // send are kept from the file. One undo step.
    case 'set-palette': {
      if (arg?.format !== 'digidream-palette' || !Array.isArray(arg.colors) || !arg.colors.every((c) => /^#[0-9a-f]{6}$/i.test(c))) throw new Error("set-palette needs a digidream-palette: { format: 'digidream-palette', version: 1, colors: ['#rrggbb', ...] }")
      const was = S.rec.assets?.['sources/palette.json']
      const old = was ? await was.text().then((t) => { try { return JSON.parse(t) } catch { return {} } }) : {}
      S.rec.assets ??= {}
      S.rec.assets['sources/palette.json'] = new Blob([JSON.stringify({ ...old, ...arg }, null, 2) + '\n'], { type: 'application/json' })
      S.moduleChanged()
      return true
    }
    // A texture's picture as the game draws it (PNG bytes), where 'read' gives its qPainter project. Null if none.
    case 'texture-png': {
      const b = S.rec.assets?.[`textures/${String(arg?.name ?? '')}.png`]
      return b ? new Uint8Array(await b.arrayBuffer()) : null
    }
    // The one question that is not read-only: give the user a file a plugin
    // made (the packager's APK or app). It goes where the studio's own Export
    // goes -- the system's save dialog in the apps, a download in a browser --
    // because a page in a frame cannot save on a phone. Nothing in the module
    // changes. True when it was saved, false when the user cancelled.
    case 'share': {
      if (typeof arg?.name !== 'string' || !(arg.bytes instanceof Uint8Array)) throw new Error('share needs { name, bytes }')
      return !!(await shell.share(arg.name.replace(/[\\/]/g, '_'), arg.bytes))
    }
    // The other way: a file the user picks, for a plugin -- the system's picker
    // in the apps, a file input in a browser; a frame's own picker opens
    // nothing on a phone. { name, bytes }, or null when cancelled.
    case 'import-file': {
      const f = await shell.importFile(String(arg?.accept ?? ''))
      return f ? { name: f.name, bytes: f.bytes instanceof Uint8Array ? f.bytes : new Uint8Array(f.bytes) } : null
    }
    // A web page in the system's browser (where to make a token, a repository):
    // a link in a plugin's frame goes nowhere in the apps. https only. In a
    // browser it answers false and opens nothing: a tab opened from here, after
    // the message, would be blocked as a popup -- the plugin opens it from its
    // own click.
    case 'open-url': {
      const url = String(arg?.url ?? '')
      if (!/^https:\/\/[^\s]+$/.test(url)) throw new Error('open-url needs an https address')
      if (!hasShell()) return false
      await shell.openUrl(url)
      return true
    }
    case 'modulePack': {
      const r = await emitAll()
      if (!r) throw new Error('the module does not bake (the studio says why)')
      return writePack(r.files.map((f) => ({ path: `${S.module.id}/${f.path}`, bytes: f.bytes })))
    }
    default: throw new Error(`no such question: ${what}`)
  }
}
// A PLUGIN'S WORD ON A MODULE (its `status` message: a sync's "up to date",
// "3 changes to push", "conflict"): a dot and the words on Home and the rail.
// { module, text, level: info|ok|warn|error }; empty text takes it away.
S.pluginStatus = (plugin, m) => {
  const id = typeof m?.module === 'string' && m.module ? m.module : S.rec?.id
  if (!id) return
  const level = ['info', 'ok', 'warn', 'error'].includes(m.level) ? m.level : 'info'
  if (!m.text) badges.delete(id); else badges.set(id, { plugin, text: String(m.text).slice(0, 120), level })
  const b = badges.get(id) ?? null
  if (id === S.rec?.id && S.shell) { S.shell.moduleStatus = b; S.shell.drawRail() }
  for (const node of document.querySelectorAll(`[data-badge-module="${CSS.escape(id)}"]`)) {
    node.hidden = !b
    node.dataset.statusLevel = b?.level ?? 'info'
    node.querySelector('.ui-dot').className = `ui-dot${b && b.level !== 'info' ? ` ui-dot--${b.level}` : ''}`
    node.querySelector('.sd-sync-text').textContent = b?.text ?? ''
  }
}

// THE STUDIO'S EVENTS, to every running plugin page (frame.js): a module
// opened, each save (one per save, not per edit), and the app back in front.
S.store.onSave = (rec) => emitPluginEvent('module-saved', { id: rec.id, rev: rec.rev ?? 0 })
let lastFront = 0
const backInFront = () => {
  if (Date.now() - lastFront < 1000) return // the shell's word and the page's, for one return
  lastFront = Date.now()
  emitPluginEvent('foreground', { id: S.rec?.id ?? null, rev: S.rec?.rev ?? 0 })
}
document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'visible') backInFront() })
// The Android shell's own lifecycle word (onResume), which a WebView's page
// is not always told any other way.
{
  const before = globalThis.__dnpAppHidden
  globalThis.__dnpAppHidden = (hidden) => { try { before?.(hidden) } catch {} if (!hidden) backInFront() }
}

S.gestures = new Gestures(S.viewport.canvas, {
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
// The rest of the boot -- the way back from Play, the first section, the
// loader away -- is finishBoot(), at the end of this file: it uses verbs this
// file publishes further down (S.redraw, S.openDoc ...), which a step taken
// here would find missing.

// --- modules and maps --------------------------------------------------------------------

// A store record from a module's files, and back: record.js.

/**
 * The modules the app shipped, into the store -- once each. The shell seeded
 * them into its game tree; a studio that opened a blank room beside a starter
 * level nobody could find was the first thing the desktop app showed.
 */
async function seedFromShell () {
  if (!hasShell()) return
  bootStep('looking for the app\'s modules')
  const files = await shell.listFiles('modules')
  const ids = [...new Set(files.filter((f) => f.endsWith('/module.studio.json')).map((f) => f.split('/')[1]))]
  bootStep(`the app has ${ids.length} studio module${ids.length === 1 ? '' : 's'}${ids.length ? `: ${ids.join(', ')}` : ''}`)
  for (const id of ids) {
    if (await S.store.load(id)) continue
    bootStep(`bringing ${id} into the store`)
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
    bootStep(rec ? `${id}: ${entries.length} file(s), ${Object.keys(rec.docs ?? {}).length} map(s)` : `${id}: nothing a studio can open`)
  }
}

/** The props of a copied record moved to an id range of their own (after every stored module's). */
async function ownPropIds (rec) {
  const bases = (await S.store.list()).filter((r) => r.id !== rec.id).map((r) => r.module?.propIdBase ?? 0)
  const next = Math.max(999, ...bases) + 1 + 100 - ((Math.max(999, ...bases) + 1) % 100)
  const shift = next - (rec.module.propIdBase ?? 1000)
  rec.module.propIdBase = next
  for (const p of rec.module.props ?? []) p.id += shift
}

/**
 * A new module as a COPY of another, under a new id. The copy's props get an
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
  await ownPropIds(rec)
  await S.store.save(rec)
  return rec
}
S.copyModule = copyModule

/**
 * THE STARTER TEMPLATE: the starter module as this studio version shipped it,
 * packed into its pages (src/templates/starter.zip, made by
 * tools/make_template.mjs). A new module is a copy of it -- never of the
 * store's 'starter', which is the user's to edit or delete. It is read, never
 * listed, opened or saved as itself. Null when it cannot be read.
 */
// Its address is worked out when asked, not held in a const: the boot opens a
// module from it on an empty store, long before a const this far down is
// initialised (a first launch made a blank room on exactly that).
async function templateRecord (template = 'starter') {
  try {
    const r = await fetch(new URL(`./templates/${template}.zip`, import.meta.url))
    if (!r.ok) throw new Error(`${r.status}`)
    return recordFromEntries(await readPack(new Uint8Array(await r.arrayBuffer())))
  } catch (e) {
    console.warn(`[studio] the ${template} template could not be read:`, e?.message ?? e)
    return null
  }
}
S.templateRecord = templateRecord

/** A new module from the starter template, saved under `id`. Null without the template. */
async function newFromTemplate (id, name) {
  const rec = await templateRecord()
  if (!rec) return null
  rec.id = id
  rec.module.id = id
  rec.module.name = name
  await ownPropIds(rec)
  await S.store.save(rec)
  return rec
}
S.newFromTemplate = newFromTemplate

/**
 * THE EXAMPLE PROJECTS, packed into the studio like the starter
 * (tools/make_template.mjs): opened as a module of the user's own, made from
 * the example the first time and theirs to change after. "Fresh" makes it
 * again from the example, under a new id, keeping the one they changed.
 */
const EXAMPLES = [
  { id: 'gemhollow', name: 'Gem Hollow', about: 'A small platformer: a title screen, one big level in four zones, levers, gates, keys, gems, monsters and cutscenes.' },
  { id: 'cinderfall', name: 'Cinderfall', about: 'A first-person shooter: a smelting colony gone wrong, five districts joined without a load, explored in any order, people to talk to and a boss at the bottom.' }
]
S.examples = EXAMPLES
S.openExample = async (id, { fresh = false } = {}) => {
  const ex = EXAMPLES.find((e) => e.id === id)
  if (!ex) return null
  let at = id
  if (await S.store.load(id)) {
    if (!fresh) { await openModule(id); return id }
    let n = 2
    while (await S.store.load(`${id}-${n}`)) n++
    at = `${id}-${n}`
  }
  const rec = await templateRecord(id)
  if (!rec) { S.status(`the example ${ex.name} could not be read`, 'error'); return null }
  rec.id = at
  rec.module.id = at
  await ownPropIds(rec)
  await S.store.save(rec)
  await openModule(at)
  S.status(`${ex.name}: the example, as a module of your own (${at})`, 'ok')
  return at
}

/**
 * Open a module. Every section shows the module, so whatever was on screen
 * is the old one's: unless `show` is false (boot, the way back from Play,
 * which go on to a section of their own), it lands on the new module's Home,
 * drawn afresh -- the router does not move to the section already showing.
 */
/**
 * The blob URLs, sheets, packs and fonts made from a record's assets, made
 * again: a module opened, or an undo that put back different assets (an
 * editor's save is one undo step, pictures included).
 */
async function rebuildAssetCaches (rec) {
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
  // The module's own fonts, so the Style section's samples and previews show them.
  await S.loadStyleFonts?.()
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
}

async function openModule (id, { show = true } = {}) {
  // The module being left is saved first: saving waits a moment after the
  // last change, and that save would otherwise write the NEW module.
  if (S.rec) await S.store.save(S.rec)
  let rec = id ? await S.store.load(id) : null
  if (!rec) {
    // Nothing to open (an empty store, in a browser): a module made from the
    // starter template, else a blank room.
    bootStep('nothing stored: a module from the starter template')
    rec = await newFromTemplate('my-level', 'My Level')
    if (!rec) {
      rec = { id: 'my-level', module: newModule('my-level', 'My Level'), docs: { first: starterDoc('first', { fresh: true }) }, assets: {} }
      await S.store.save(rec)
    }
  }
  S.rec = rec
  S.module = rec.module
  S.docs = rec.docs
  // The shell serves this module's files and the engine's, no other module's.
  shell.useModule(rec.id).catch(() => {})
  // Maps written when the player's size was each map's own: the module takes
  // the common size, a map that differs keeps its own as an override.
  // Documents from earlier studios, brought up to date (migrate.js).
  // What a studio update is about to change, kept first.
  const before = JSON.parse(JSON.stringify({ id: rec.id, module: rec.module, docs: rec.docs, assets: rec.assets }))
  const did = migrateModule(rec)
  const moved = migratePlayer(S.module, S.docs)
  if (moved || did.length) {
    await S.snapshot(`before studio ${STUDIO_VERSION} updated it`, { rec: before, force: true })
    await S.store.save(rec)
  }
  if (did.length) console.log('[studio] updated:', did.join('; '))
  // A snapshot on opening, unless one is recent: the state a session began from.
  S.lastSnapAt = (await S.snaps?.latestAt(rec.id).catch(() => 0)) ?? 0
  if (Date.now() - S.lastSnapAt > ON_OPEN_MS) await S.snapshot('opened')
  S.moduleHistory = new History({ module: S.module, docs: S.docs, assets: rec.assets ?? {} })
  S.shell?.setHistory(false, false)
  if (S.shell) { S.shell.moduleName = S.module.name || S.module.id; S.shell.drawRail() }
  await rebuildAssetCaches(rec)
  // Back on the map last edited here (this device's), so Play on the rail plays it.
  const last = lastMap(rec.id)
  await openDoc(last && S.docs[last] ? last : Object.keys(S.docs)[0])
  if (S.shell) { S.shell.moduleStatus = badges.get(rec.id) ?? null; S.shell.drawRail() }
  emitPluginEvent('module-opened', { id: rec.id, rev: rec.rev ?? 0 })
  if (show && S.router?.current) {
    if (S.router.current.id === 'home') await S.router.remount()
    else await S.go('home')
  }
}

// The map last edited, per module, on this device: a convenience, so it may be
// lost. Declared as functions: the boot opens a module before a const this far
// down exists.
function lastMap (id) { try { return localStorage.getItem(`dnp.studio.lastMap.${id}`) } catch { return null } }
function rememberMap (id, name) { try { if (id) localStorage.setItem(`dnp.studio.lastMap.${id}`, name) } catch {} }

// `keepView`: the camera stays where it is (the module was replaced under the
// author, by a sync: the same map, seen from the same place).
async function openDoc (name, { keepView = false } = {}) {
  S.docName = name
  S.doc = S.docs[name]
  rememberMap(S.module?.id, name)
  normalize(S.doc)
  S.history = new History(S.doc)
  S.selection = null
  S.draw = { corners: [], rect: null }
  if (S.ui) { S.ui.hideSheet(); S.ui.setHistory(false, false); if (!keepView) { frameToDoc(); S.applyCamera() } redraw(); previewNow() }
  S.applySky?.()
}

/**
 * A MODULE REPLACED FROM OUTSIDE (a plugin's module-write: a sync pulling
 * from GitHub). `files` are what recordToEntries writes; `baseRev` is the
 * revision they were made against, and a module saved since is refused --
 * a slow pull must not overwrite edits made while it ran. Otherwise: what was
 * waiting to be saved is saved, a snapshot keeps the module as it was, and the
 * record is replaced. The open module is reloaded in place -- the same map
 * and view where it still exists -- and an editor open on a document that
 * changed is given the new one if it has nothing unsaved, else warned.
 * Returns { ok, rev } or { ok: false, reason, rev? }.
 */
/**
 * The open module under a new id: MOVED, record and snapshots and the map it
 * was on, not copied -- the id field saved the module under each id typed, so
 * a slip left a module of its own behind. An id another module has is refused.
 */
async function renameModule (raw) {
  const from = S.rec.id
  const { id, dropped } = cleanId(raw)
  // Letters with no plain spelling are not lost in silence: the id is refused.
  if (dropped.length) { S.say(`An id is a-z, 0-9, _ and -: ${dropped.join(' ')} cannot be in it. The id stays ${from}.`, 'warn'); return from }
  if (!id || id === from) return from
  if (await S.store.load(id)) { S.say(`There is already a module called ${id}: the id stays ${from}.`, 'warn'); return from }
  await settleSave()
  S.rec.id = id
  S.module.id = id
  await S.store.save(S.rec)
  await S.store.remove(from)
  await S.snaps?.move(from, id).catch((e) => console.warn('[studio] snapshots not moved:', e.message))
  const last = lastMap(from)
  if (last) rememberMap(id, last)
  shell.useModule(id).catch(() => {})
  S.shell?.drawRail()
  S.say(`The module's id is ${id} now (it was ${from}).`)
  return id
}
S.renameModule = renameModule

/** Another module taken off this device, when asked: the open one is not deleted from under itself. */
async function deleteModule (id) {
  if (!id || id === S.rec?.id) return false
  const rec = await S.store.load(id)
  if (!rec) return false
  if (!(await confirmDialog(`Delete the module ${rec.module?.name || id} (${id}) from this device? Its maps go with it; export it first to keep a copy.`))) return false
  await S.store.remove(id)
  for (const s of await S.snaps?.list(id).catch(() => []) ?? []) await S.snaps.remove(s.key).catch(() => {})
  S.say(`Deleted the module ${id}.`)
  return true
}
S.deleteModule = deleteModule

async function writeModule ({ id, baseRev, files, by = 'a plugin' }) {
  if (typeof id !== 'string' || !id) throw new Error('module-write needs { id, baseRev, files }')
  if (!Array.isArray(files)) throw new Error('module-write: files must be [{ path, bytes }]')
  const rec = recordFromEntries(files.map((f) => ({ path: String(f.path), bytes: f.bytes instanceof Uint8Array ? f.bytes : new TextEncoder().encode(String(f.bytes ?? '')) })))
  if (!rec) return { ok: false, reason: 'not a studio module: it needs module.studio.json and at least one maps/<name>.studio.json' }
  if (rec.module.id !== id) return { ok: false, reason: `module.studio.json says "${rec.module.id}", not "${id}"` }
  const isOpen = S.rec?.id === id
  const check = async () => {
    if (isOpen) await settleSave()
    const stored = await S.store.load(id)
    const rev = stored?.rev ?? 0
    return { stored, rev, ok: rev === (baseRev ?? 0) }
  }
  let c = await check()
  if (!c.ok) return { ok: false, reason: 'changed', rev: c.rev }
  if (c.stored) await S.snapshot(`before sync from ${by}`, { rec: c.stored, force: true })
  // Edited while the snapshot was taken: refused all the same.
  c = await check()
  if (!c.ok) return { ok: false, reason: 'changed', rev: c.rev }
  rec.rev = c.rev
  if (c.stored?.opened) rec.opened = c.stored.opened
  migrateModule(rec)
  migratePlayer(rec.module, rec.docs)
  if (isOpen) await reloadInPlace(rec, by)
  const rev = await S.store.save(rec)
  return { ok: true, rev }
}
S.writeModule = writeModule

// The open module's record, replaced: everything made from it made again,
// histories begun afresh (the snapshot is the way back), the map and view kept.
async function reloadInPlace (rec, by) {
  const session = S.editorSession
  const was = session && !session.done ? { kind: session.kindId, key: session.key, before: session.original } : null
  S.rec = rec
  S.module = rec.module
  S.docs = rec.docs
  S.moduleHistory = new History({ module: S.module, docs: S.docs, assets: rec.assets ?? {} })
  S.shell?.setHistory(false, false)
  if (S.shell) { S.shell.moduleName = S.module.name || S.module.id; S.shell.drawRail() }
  await rebuildAssetCaches(rec)
  const name = S.docs[S.docName] ? S.docName : Object.keys(S.docs)[0]
  await openDoc(name, { keepView: name === S.docName })
  // A page showing the module (not the map, not an editor): drawn again from the new one.
  const route = S.router?.current?.id
  if (route && route !== 'map' && route !== 'edit') await S.router.remount()
  if (was) {
    const k = S.docKinds[was.kind]
    const now = k?.has(was.key) ? (await k.read(was.key)).payload : null
    if (now === null) session.status(`${was.key} is gone from the module (${by}); Back would put it back`, 'warn')
    else if (!sameBytes(now, was.before)) {
      const draft = await getDraft(S.module.id, was.kind, was.key).catch(() => null)
      if (!session.dirty && !draft) { session.original = now; session.port?.send('revert', { payload: now }); session.status(`updated from ${by}`) }
      else session.status(`changed by ${by} while you edit; Back keeps your version`, 'warn')
    }
  }
  S.status(`${S.module.name || S.module.id} updated from ${by}`, 'ok')
}

// `fresh`: the doc is for a module not open yet, so it must not be given
// textures of the open one's making.
function starterDoc (name, { fresh = false } = {}) {
  const doc = newDoc(name)
  S.ensureRoomStyle({ create: !fresh })
  addSector(doc, [{ x: -8, y: -6 }, { x: 8, y: -6 }, { x: 8, y: 6 }, { x: -8, y: 6 }], { ...S.style.sector }, { ...S.style.edge })
  addSpawn(doc, 'start', 0, 0, 0)
  return doc
}

/**
 * Textures for the next room drawn, wherever the style has none.
 *
 * A room with no textures bakes, but it is an outline in plan view and nothing
 * at all in 3D -- to someone drawing their first room, drawing looks broken.
 * So a style without textures takes the module's own (a FLOOR and a WALL by
 * name when there are such), then the textures the app serves, and a module
 * with none at all gets two plain ones of its own, added like an import.
 * A texture the user picked is never replaced.
 */
S.ensureRoomStyle = ({ create = true } = {}) => {
  const sec = S.style.sector; const edge = S.style.edge
  const have = (n) => n && ((create && S.imageUrls.has(n)) || S.textureSizes[n])
  if (have(sec.floorTex) && have(sec.ceilTex) && have(edge.middle)) return
  // A doc for a module not open yet takes only what the app serves: the open
  // module's pictures are not the new one's.
  let names = create ? [...S.imageUrls.keys()].sort() : []
  if (!names.length) names = S.textureNames
  if (!names.length && create && S.rec) names = plainTextures()
  if (!names.length) return
  const floor = names.find((n) => /FLOOR|FLAT|GROUND/.test(n)) ?? names[0]
  const wall = names.find((n) => /WALL/.test(n)) ?? names.find((n) => n !== floor) ?? floor
  if (!have(sec.floorTex)) sec.floorTex = floor
  if (!have(sec.ceilTex)) sec.ceilTex = floor
  for (const k of ['middle', 'upper', 'lower']) if (!have(edge[k])) edge[k] = wall
}

// PLAIN_FLOOR and PLAIN_WALL: 64x64, quiet tiles with a faint grid, so a room
// reads as a room and its scale can be judged. Made here, not fetched: a module
// opened offline with nothing in it still gets them.
function plainTextures () {
  const make = (name, base, line) => {
    const c = document.createElement('canvas'); c.width = c.height = 64
    const g = c.getContext('2d')
    g.fillStyle = base; g.fillRect(0, 0, 64, 64)
    g.fillStyle = line; g.fillRect(0, 0, 64, 2); g.fillRect(0, 0, 2, 64); g.fillRect(0, 31, 64, 1); g.fillRect(31, 0, 1, 64)
    const bin = atob(c.toDataURL('image/png').split(',')[1])
    const blob = new Blob([Uint8Array.from(bin, (ch) => ch.charCodeAt(0))], { type: 'image/png' })
    S.module.textures ??= {}
    S.module.textures[name] = { w: 64, h: 64 }
    S.rec.assets ??= {}
    S.rec.assets[`textures/${name}.png`] = blob
    S.imageUrls.set(name, URL.createObjectURL(blob))
    S.textures?.forget(name)
  }
  make('PLAIN_FLOOR', '#6b6f78', '#5a5e66') // content: the texture's own pixels, not the studio's look
  make('PLAIN_WALL', '#8a8170', '#776f60') // content: the texture's own pixels
  S.moduleChanged()
  S.status('added two plain textures to the module, PLAIN_FLOOR and PLAIN_WALL (Textures to change them)', 'ok')
  return ['PLAIN_FLOOR', 'PLAIN_WALL']
}

// The save being written, if one is: what settleSave waits for besides the debounce.
let saving = null
const save = debounce(async () => {
  try { await (saving = S.store.save(S.rec)) } catch (e) { S.status(`could not save: ${e.message}`, 'error'); return } finally { saving = null }
  // Every few minutes of editing, a snapshot (one the same as the last is not taken).
  if (Date.now() - (S.lastSnapAt ?? 0) > EVERY_MS) await S.snapshot('editing')
}, 600)
/** Whatever is waiting to be saved, saved, and in the store: before a module is read or replaced from outside. */
async function settleSave () {
  await save.flush()
  await saving?.catch(() => {})
}
S.settleSave = settleSave
// Leaving the page (a browser tab closed): what is waiting to be saved, saved.
addEventListener('pagehide', () => save.flush())
addEventListener('beforeunload', () => save.flush())

function frameToDoc () {
  const pts = []
  for (const sid of S.doc.order) for (const v of S.doc.sectors[sid].verts) pts.push(v)
  if (!pts.length) { S.viewport.lookAt(0, 0); return }
  const xs = pts.map((p) => p.x); const ys = pts.map((p) => p.y)
  const w = Math.max(...xs) - Math.min(...xs); const h = Math.max(...ys) - Math.min(...ys)
  // THE PART OF THE VIEW ONE CAN SEE: the canvas runs under the rail and the
  // bars, so a fit to the whole of it hid the map's left under the rail.
  const box = S.viewport.canvas?.getBoundingClientRect?.() ?? { left: 0, top: 0, width: innerWidth, height: innerHeight }
  const edge = (sel, side) => { const r = document.querySelector(sel)?.getBoundingClientRect(); return r && r.width && r.height ? r[side] : null }
  const L = Math.max(box.left, edge('.sd-rail', 'right') ?? box.left)
  const T = Math.max(box.top, edge('.st-top', 'bottom') ?? box.top)
  const B = Math.min(box.top + box.height, edge('.st-bar', 'top') ?? box.top + box.height)
  const R = box.left + box.width
  const visW = Math.max(100, R - L); const visH = Math.max(100, B - T)
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2; const cy = (Math.min(...ys) + Math.max(...ys)) / 2
  S.viewport.lookAt(cx, cy, 0)
  S.viewport.viewHeight = Math.min(300, Math.max(8, Math.max(h, w * visH / visW) * 1.3 * (box.height / visH)))
  S.viewport.resize()
  // then moved so the map's middle is the visible middle
  const mid = S.viewport.groundPoint(box.left + box.width / 2, box.top + box.height / 2, 0)
  const seen = S.viewport.groundPoint((L + R) / 2, (T + B) / 2, 0)
  if (mid && seen) { S.viewport.lookAt(cx + mid.x - seen.x, cy + mid.y - seen.y, 0); S.viewport.resize() }
}

// --- the shared verbs ------------------------------------------------------------------------
S.commit = ({ geometry = true } = {}) => {
  badgesSoon?.()
  // An edit that leaves the map's shape alone (a graph's nodes) is not
  // normalized, drawn or baked again: those cost far more than the edit did.
  if (geometry) normalize(S.doc)
  S.history.commit(S.doc)
  // The module's history follows the maps without making a step of its own.
  S.moduleHistory?.replace({ module: S.module, docs: S.docs })
  S.ui.setHistory(S.history.canUndo, S.history.canRedo)
  S.syncHistory?.()
  save()
  if (!geometry) return
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
  // once each: the module's own are among the ones the app serves too
  const names = [...new Set([...Object.keys(S.module.textures ?? {}), ...S.textureNames])]
  S.ui.showSheet('Texture', texturePicker(names, current, (name) => { onPick(name); showInspector() },
    { imageFor: (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`, sheetOf: (n) => S.sheetOf(n) }))
}
S.openPalette = () => S.ui.showSheet('Place', placePalette({
  mobs: Object.keys(S.module.mobs?.mobs ?? {}), props: [...moduleProps(S.module).map((p) => p.name), ...S.catalogue], armed: S.place,
  // signs read a text: every marker but the two that show a health
  signs: markerNames(S.doc?.ui ?? S.module.ui).filter((n) => n !== 'health' && n !== 'debug_health')
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
  decorOf: (panel) => decorIdsOf(S.module.panels?.[panel]),
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
  S.moduleHistory?.commit({ module: S.module, docs: S.docs, assets: S.rec.assets ?? {} })
  S.shell?.setHistory(S.moduleHistory?.canUndo, S.moduleHistory?.canRedo)
}

/**
 * The module as it was: an undo or a redo on a page. The maps come back with
 * it, because a module edit can reach into them -- a texture renamed on every
 * surface that named it -- and restoring one without the other would leave a
 * map naming something the module no longer has.
 */
async function restoreModule (snap) {
  if (!snap) return
  const m = snap.module
  S.module = m
  S.rec.module = m
  S.docs = snap.docs
  S.rec.docs = snap.docs
  // The pictures, packs and sources an edit replaced come back with it.
  if (snap.assets) { S.rec.assets = snap.assets; await rebuildAssetCaches(S.rec) }
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
// IN A MAP'S GRAPH WINDOW an edit is the map's (S.commit), so the page's undo
// is the map's there: the module's history holds no step for it. Everywhere
// else on a page it is the module's.
const mapGraphOpen = () => S.route() === 'graph' && S.window && S.window.game === false
S.syncHistory = () => {
  if (mapGraphOpen()) S.shell?.setHistory(S.history.canUndo, S.history.canRedo)
  else S.shell?.setHistory(S.moduleHistory?.canUndo, S.moduleHistory?.canRedo)
}
const mapStep = (snap) => { restore(snap); S.window?.render?.(); S.syncHistory() }
S.undoHere = () => (mapGraphOpen() ? mapStep(S.history.undo()) : S.undoModule())
S.redoHere = () => (mapGraphOpen() ? mapStep(S.history.redo()) : S.redoModule())
// ⌘Z on a page is the module's; in the map editor it is the map's (onKey).
addEventListener('keydown', (e) => {
  if (S.route() === 'map' || !S.route()) return
  if (['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target?.tagName)) return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); e.shiftKey ? S.redoHere() : S.undoHere() }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); S.redoHere() }
})

const ctx = {
  commit: () => S.commit(), preview: () => previewNow(), select: (sel) => S.select(sel),
  otherSide: (edgeId) => tools.otherSide(S, edgeId),
  status: (t, l) => S.status(t, l), refreshSheet: () => S.refreshSheet(),
  pickTexture: (c, cb) => S.pickTexture(c, cb), duplicateSector: (id) => S.duplicateSector(id),
  editProp: (name) => { if (S.module.props?.some((p) => p.name === name)) S.showProp(name); else S.status(`${name} is the catalogue's, not this module's`, 'warn') },
  fxSchema: () => S.fxSchema ?? null,
  problems: (sectorId) => (S.problems ?? []).filter((p) => p.sector === sectorId),
  seamFor: (edgeId) => S.seamFor?.(edgeId) ?? null,
  // a sign's marker: the templates this map's screens offer, and the way to its look
  markerNames: () => markerNames(S.doc?.ui ?? S.module.ui),
  editMarker: (name) => S.go('screens', `markers/${name}`),
  roomDeleted: (id, gone) => roomDeleted(id, gone)
}

/** A message the bake that follows does not wipe at once: what was just done, said long enough to read. */
S.say = (text, level = 'ok') => {
  const ms = Math.min(9000, 3000 + text.length * 45)
  S.held = { text, level, until: performance.now() + ms }
  S.status(text, level)
  // the status strip is hidden under a page (Home's import, Settings' id): said there too
  if (mapCovered()) {
    document.querySelector('body > .st-toast')?.remove()
    const t = el('div', { class: 'st-toast', role: 'status', 'data-level': level, text })
    document.body.appendChild(t)
    setTimeout(() => t.remove(), ms)
  }
}

/** What deleting a room took with it, and what still names it. */
function roomDeleted (id, gone) {
  const graphs = graphsNaming(S.doc, id)
  S.say(`Deleted room ${id}${gone.length ? `, and ${gone.length === 1 ? 'the trigger' : `the ${gone.length} triggers`} that worked it (${gone.map((t) => t.name || t.id).join(', ')})` : ''}.` +
    (graphs.length ? ` The graph${graphs.length > 1 ? 's' : ''} ${graphs.join(', ')} still name${graphs.length > 1 ? '' : 's'} it.` : '') + ' Undo brings it back.', graphs.length ? 'warn' : 'ok')
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
  S.held = null
  S.ui.hideSheet()
  S.ui.setHistory(S.history.canUndo, S.history.canRedo)
  save()
  redraw()
  previewNow()
}

/** Is a page over the map? Then the level is neither drawn nor baked: nobody can see it. */
function mapCovered () { return !!S.shell?.page && !S.shell.page.hidden }

/**
 * Bake the map again, for the level view. While a page covers it the bake
 * waits -- an edit to a graph or a monster changes nothing there, and a bake
 * (and the shaders of a new view) cost far more than the edit -- and runs when
 * the map shows (the router's onChange).
 */
function previewNow () {
  if (mapCovered()) { S.previewStale = true; return }
  S.previewStale = false
  S.preview.refresh(S.module, S.doc)
}

function chooseTool (id) {
  if (id === 'play') return play()
  if (id === 'menu') return showMenu()
  if (id === 'graph') return S.go('graph')
  if (S.tool === 'room' && id !== 'room') tools.cancelRoom(S)
  if ((S.tool === 'path' || S.tool === 'camera') && id !== 'path' && id !== 'camera') { S.pathEdit = null; S.pathPointSel = null; redraw() }
  S.tool = id
  S.ui.setTool(id)
  S.pick = null
  // The room tool shows every room's corners (redraw), from the moment it is chosen, not from its first tap.
  redraw()
  if (id === 'place') S.openPalette()
  else if (id === 'trigger') { S.triggerOpen = null; S.ui.showSheet('Triggers', triggersSheet(S), () => S.setHighlights([])) }
  else if (id === 'camera') S.showCamera()
  else if (id === 'room') { S.ui.hideSheet(); S.status('tap corners, tap the first one again to close -- or drag a rectangle', 'ok') }
  else S.ui.hideSheet()
}

// UNDO WHILE A ROOM IS BEING DRAWN takes back its last corner, not the change
// before it: the corners are not in the map's history until the room is made.
function mapUndo () {
  if (S.tool === 'room' && S.draw.corners.length) {
    S.draw.corners.pop()
    S.status(S.draw.corners.length ? `corner taken back: ${S.draw.corners.length} left` : 'corner taken back', 'ok')
    redraw()
    return
  }
  restore(S.history.undo())
}

function onKey (e) {
  // The map editor's keys, only while it is the section showing.
  if (S.route() !== 'map') return
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); if (e.shiftKey) restore(S.history.redo()); else mapUndo(); return }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(S.history.redo()); return }
  // ⌘V is not V: a key held with ⌘, Ctrl or Alt is somebody else's shortcut, never the map's letter
  if (mod || e.altKey) return
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
    case 'g': S.toggleFreePlace(); break
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
  if (sel.kind === 'sector') { const gone = removeSector(d, sel.id); S.select(null); S.commit(); roomDeleted(sel.id, gone); return } else if (sel.kind === 'entity') d.entities = d.entities.filter((x) => x.id !== sel.id)
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
/** A furniture colour and its opacity, as the skin gives them (viewport.js SKIN_KEYS). */
function tint (k) { return { color: COLORS[k], alpha: ALPHA[k] } }

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
      for (const v of o.verts) handles.push({ id: v.id, x: v.x, y: v.y, z: o.floor, ...tint('corner') })
      // While drawing, every room's walls too: what a new room meets or snaps to.
      if (S.tool === 'room') lines.push({ points: o.verts.map((v) => ({ x: v.x, y: v.y, z: o.floor })), closed: true, ...tint('corner'), width: 2 })
    }
  }
  if (s) {
    lines.push({ points: s.verts.map((v) => ({ x: v.x, y: v.y, z: s.floor })), closed: true, ...tint('outline') })
    handles.push(...s.verts.map((v) => ({ id: v.id, x: v.x, y: v.y, z: s.floor, hot: sel.kind === 'vertex' && sel.id === v.id })))
    if (sel.kind === 'edge') {
      const e = findEdge(d, sel.id)
      if (e) lines.push({ points: insetEdge(e, 0.2, s.floor + 0.05), ...tint('edgeHot') })
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
    // This map's own limits on the shared world's grid: thick and opaque, so
    // where it ends and a neighbour begins reads at any zoom.
    lines.push({ points: [{ x: 0, y: 0, z: 0 }, { x: pw, y: 0, z: 0 }, { x: pw, y: ph, z: 0 }, { x: 0, y: ph, z: 0 }], closed: true, ...tint('cellEdge'), width: Math.max(3, WIDTH.cellEdge ?? 4) })
    for (const nb of S.neighbourInfo ?? []) {
      badges.push({ x: nb.offset.x + pw / 2, y: nb.offset.y + ph / 2, z: 0, label: `${nb.name}${nb.failed ? ' (does not bake)' : ''}`, ...tint('cell') })
      // Dimmed, so the one map under a finger is the one that looks it.
      for (const p of nb.polys ?? []) lines.push({ points: p.pts.map((v) => ({ x: v.x + nb.offset.x, y: v.y + nb.offset.y, z: p.floor + 0.04 })), closed: true, color: COLORS.neighbourShade, fill: FILL.neighbourShade })
    }
    for (const sm of S.seams ?? []) {
      const e = findEdge(d, sm.edgeId)
      if (!e) continue
      const seam = `seam_${sm.state.replace('-', '')}`
      lines.push({ points: insetEdge(e, 0.15, e.sector.floor + 0.12), ...tint(seam in COLORS ? seam : 'cell') })
    }
  }
  // What climbs (climb.js): a green line just inside each climbable side.
  for (const c of S.climbs ?? []) {
    const e = findEdge(d, c.edge.id)
    if (e) lines.push({ points: insetEdge(e, 0.1, e.sector.floor + 0.09), ...tint('climb') })
  }
  // WHAT IS WRONG, on the map: each room a bake or a check complained about,
  // outlined in red (amber for a warning) with a badge, and the wall itself
  // when the complaint named one.
  const marked = new Set()
  for (const p of S.problems ?? []) {
    const o = d.sectors[p.sector]
    if (!o) continue
    const tone = p.level === 'warn' ? 'problemWarn' : 'problem'
    const color = COLORS[tone]
    if (p.edge) {
      const e = findEdge(d, p.edge)
      if (e) lines.push({ points: insetEdge(e, 0.2, o.floor + 0.1), color })
    }
    if (marked.has(p.sector)) continue
    marked.add(p.sector)
    lines.push({ points: o.verts.map((v) => ({ x: v.x, y: v.y, z: o.floor + 0.08 })), closed: true, color, fill: FILL[tone] })
    const n = o.verts.length
    badges.push({ x: o.verts.reduce((a, v) => a + v.x, 0) / n, y: o.verts.reduce((a, v) => a + v.y, 0) / n, z: o.floor, label: p.level === 'warn' ? '' : 'wrong', iconId: p.level === 'warn' ? 'status.warning' : 'status.error', color })
  }
  // Camera paths: the CURVE the camera rides, which is not the polyline through
  // the points (docs/MAP_AUTHOR.md) -- so the one being edited shows both, the
  // way the game's own ?paths=1 overlay does, because that is the only way to
  // tell a deliberate bulge from a point in the wrong place.
  for (const p of d.paths ?? []) {
    const hot = p.id === S.pathEdit
    const curve = S.pathCurve(p)
    if (curve) lines.push({ points: curve.points, ...tint(hot ? 'pathHot' : 'path') })
    if (hot) {
      if (curve) lines.push({ points: p.points.map((pt) => ({ x: pt.x, y: pt.y, z: pt.z })), closed: p.loop, ...tint('pathChord') })
      handles.push(...p.points.map((pt) => ({ id: pt.id, kind: 'pathpoint', x: pt.x, y: pt.y, z: pt.z,
                                             hot: pt.id === S.pathPointSel, color: pt.id === S.pathPointSel ? undefined : COLORS.pathHot })))
      // NUMBERED, because the order is the shape and moving a waypoint along
      // the curve has no visible effect otherwise.
      p.points.forEach((pt, n) => badges.push({ x: pt.x, y: pt.y, z: pt.z, label: String(n + 1), ...tint('pathHot') }))
    }
  }
  if (S.draw.corners.length) {
    const z = S.workZ()
    lines.push({ points: S.draw.corners.map((c) => ({ ...c, z })), closed: false, ...tint('rubber') })
    handles.push(...S.draw.corners.map((c, i) => ({ id: `draw${i}`, x: c.x, y: c.y, z, hot: i === 0 })))
  }
  S.viewport.setHandles(handles)
  if (S.draw.rect) {
    const r = S.draw.rect; const z = S.workZ()
    lines.push({ points: [{ x: r.x0, y: r.y0, z }, { x: r.x1, y: r.y0, z }, { x: r.x1, y: r.y1, z }, { x: r.x0, y: r.y1, z }], closed: true, ...tint('rubber') })
  }
  S.viewport.setLines(lines)
  const markers = []
  for (const p of d.spawns) markers.push({ id: p.id, kind: 'spawn', x: p.x, y: p.y, z: p.z, label: p.tag, iconId: 'marker.spawn', ...tint('spawn') })
  for (const l of d.lights) markers.push({ id: l.id, kind: 'light', x: l.x, y: l.y, z: l.z, label: 'light', iconId: 'marker.light', ...tint('light') })
  for (const e of d.entities) {
    // a sign shows what it reads, at the height it is hung
    if (e.kind === SIGN) markers.push({ id: e.id, kind: 'entity', x: e.x, y: e.y, z: e.z + Number(e.height ?? 0), label: e.text ? `"${e.text}"` : e.name, iconId: 'widget.label', ...tint('spawn') })
    else markers.push({ id: e.id, kind: 'entity', x: e.x, y: e.y, z: e.z, label: e.name, ...tint(e.kind === 'mob' ? 'mob' : 'prop'), icon: S.sprites?.iconFor(e.name), heading: e.angle ?? 0 })
  }
  badges.forEach((b, i) => markers.push({ id: `badge${i}`, kind: 'badge', x: b.x, y: b.y, z: b.z + 0.6, label: b.label, iconId: b.iconId, color: b.color }))
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
S.soundNames = () => { S.freshSounds?.(); return [...new Set([...(S.moduleSounds ?? []), ...(S.servedSounds ?? [])])] }
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
  // MARKERS (docs/MARKERS.md): a template is the layout's or a built-in (this
  // map's own screens when it has them); a marker's name is one a mark node gave.
  if (arg === 'template' && owner === 'mark') return markerNames(S.doc?.ui ?? S.module.ui)
  if (arg === 'health_bar') return markerNames(S.module.ui)
  if (arg === 'marker' && ['mark', 'set_marker', 'remove_marker'].includes(owner)) {
    const names = new Set()
    for (const o of [S.module, ...Object.values(S.docs ?? {})]) for (const g of Object.values(o?.graphs ?? {})) for (const n of g?.nodes ?? []) if (n.type === 'mark' && n.marker) names.add(n.marker)
    return [...names].sort()
  }
  // Any texture: the module's own, then the app's (a floor, a ceiling, a wall).
  if (arg === 'texture') return S.allTextureNames?.() ?? S.textureNames
  // A sky's picture (the set_sky node): any texture, the module's first.
  if (arg === 'image' && owner === 'set_sky') return S.allTextureNames?.() ?? S.textureNames
  if (arg === 'param' && owner === 'add_effect') return paramNames()
  // The weapon nodes: the arsenal's weapons and ammunition pools.
  if (arg === 'weapon') return Object.keys(S.module.weapons?.weapons ?? {})
  if (arg === 'ammo') return Object.keys(S.module.weapons?.ammo ?? {})
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
  const play = button(withIcon('transport.play'), () => { if (sel.value && sel.value !== '\u0000other') S.hear(sel.value) })
  return row(label, sel, play)
}


/** The arsenal's pools, health and pickups, and a weapon's view model: forms the weapon editor reuses (arms.js, viewform.js). */
S.arsenalRows = (changed) => arsenalRows(S, {
  onChange: changed, changed, status: (t, l) => S.status(t, l), ammo: Object.keys(S.module.weapons?.ammo ?? {}), weapons: Object.keys(S.module.weapons?.weapons ?? {}),
  props: S.propNames?.() ?? [], vfxChoices: () => S.vfxChoices?.() ?? [], suggest: (n, o) => S.suggest?.(n, o) ?? null, soundField: S.soundField
})
S.viewRows = (name, changed) => viewRows(S, name, changed)

/** Every prop name a brain or a trigger may name: the module's bodies and props, then the served catalogue. */
S.propNames = () => [...new Set([...(S.module?.props ?? []).map((p) => p.name), ...S.catalogue])].sort()

/** Every particle kind anything may name: the module's own, then the served ones. */
S.vfxChoices = () => vfxChoices(S.module ?? {}, S.servedVfx ?? new Map())


// --- play, export, import -----------------------------------------------------------------------
// THE DEBUG OVERLAY IN A PLAY-TEST, this device's choice: 'module' (as the
// module says), 'on' or 'off'. Written into the module.txt Play hands the
// game -- the last module to say wins -- and never into an Export.
const PLAY_DEBUG_KEY = 'dnp.studio.playDebug'
S.playDebug = () => { try { return localStorage.getItem(PLAY_DEBUG_KEY) ?? 'module' } catch { return 'module' } }
S.setPlayDebug = (v) => { try { localStorage.setItem(PLAY_DEBUG_KEY, v) } catch {} }

// `screen`: Play's screen (playscreen.js), told each step as it starts.
// A refusal is said in the status strip as before, and kept in S.emitError
// for whoever shows it in full (the play screen).
async function emitAll ({ forPlay = false, screen = null } = {}) {
  S.emitError = null
  const refuse = (msg) => { S.emitError = msg; S.status(msg, 'error'); return null }
  // Every source baked first: what the module keeps is the sources, and what
  // Play and Export write must be made from them as they are now.
  await screen?.step('sources')
  const bk = await S.bakeAll({ onProgress: screen && (({ i, n, key }) => screen.progress(i / n, `${key} (${i + 1} of ${n})`)) })
  if (!bk.ok) return refuse(bk.errors.join('\n'))
  if (bk.baked) S.moduleChanged()
  await screen?.step('check')
  const problems = validate(S.doc)
  if (problems.length) return refuse(problems.map((p) => (p.sector ? `${p.sector}: ` : '') + p.msg).join('\n'))
  // A graph the runtime would refuse does not load at all, so it is said here
  // rather than discovered as a level where nothing happens.
  for (const d of Object.values(S.docs)) {
    for (const [name, g] of graphsOf(d)) {
      const gp = S.vocab.graph ? graphProblems(g, S.vocab.graph, S.vocab.trigger, { buttons: buttonNames(S.module), panels: S.module.panels ?? {}, props: S.propNames?.() ?? null, maps: Object.keys(S.docs), paths: new Set((d.paths ?? []).map((x) => x.tag)) }) : []
      if (gp.length) return refuse(`${d.name}'s graph ${name}: ${gp.join('; ')}`)
    }
  }
  for (const [name, g] of graphsOf(S.module)) {
    const mg = S.vocab.graph ? graphProblems(g, S.vocab.graph, S.vocab.trigger, { buttons: buttonNames(S.module), panels: S.module.panels ?? {}, props: S.propNames?.() ?? null, game: true, maps: Object.keys(S.docs) }) : []
    if (mg.length) return refuse(`the game's graph ${name}: ${mg.join('; ')}`)
  }
  const sizes = { ...S.textureSizes }
  const assets = {}
  for (const [path, blob] of Object.entries(S.rec.assets ?? {})) assets[path] = new Uint8Array(await blob.arrayBuffer())
  await screen?.step('maps')
  const r = await emitModule(S.module, Object.values(S.docs), {
    // The hook names the server harvests, from the vocabulary that lists them.
    bake: S.bake, runtime: S.runtime, hooks: S.vocab.trigger.events.map((e) => e.name), assets, graphVocab: S.vocab.graph,
    textureSizes: (n) => (sizes[n] ? { w: sizes[n][0], h: sizes[n][1], cutout: !!texIndex.cutout?.[n] } : null),
    debug: forPlay && S.playDebug() !== 'module' ? S.playDebug() === 'on' : undefined,
    onMap: screen && (({ i, n, name }) => screen.progress(i / n, `${name} (${i + 1} of ${n})`))
  })
  if (!r.ok) return refuse(r.problems.map((p) => `${p.map}: ` + p.errors.map((e) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg)).join('; ')).join('\n'))
  return r
}

// The steps Play's screen shows, and how much of the bar each takes.
const PLAY_STEPS = [
  { id: 'sources', label: 'baking sources', weight: 3 },
  { id: 'check', label: 'checking maps and graphs', weight: 1 },
  { id: 'maps', label: 'baking maps', weight: 4 },
  { id: 'write', label: 'writing the module', weight: 2 },
  { id: 'start', label: 'starting the game', weight: 3 }
]

// `start`: the map to start on (Home's Play: the module's starting map,
// startmap.js); the map being edited when not said.
async function play ({ start = null } = {}) {
  if (!hasShell()) {
    // SAID IN A DIALOG: the status strip is hidden under a page (Home's own Play buttons were silent)
    // and clipped on a phone beside the map's sheet.
    S.status('Play needs the app. In a browser, export a pack and run it with the engine (docs/STUDIO.md).', 'warn')
    if (await confirmDialog('Playing needs the Digidream app (desktop or Android): a browser cannot run the game. Export this module as a pack now, to open it in the app?')) exportPack()
    return
  }
  S.status('baking…', 'ok')
  const startName = start && S.docs[start] ? start : S.docName
  const map = `${startName}.dnpm`
  const screen = showPlayScreen({ title: `Play: ${S.module.name || S.module.id} · ${startName}`, steps: PLAY_STEPS })
  const toLog = () => S.go('playlog')
  let r = null
  try { r = await emitAll({ forPlay: true, screen }) } catch (e) { S.emitError = String(e.message ?? e) }
  if (!r) {
    // Refused before anything ran: what the status strip said is the log.
    S.playLogLines = [`[studio] play-test of ${S.module.id}/maps/${map}, ${new Date().toISOString()}`]
    await noteStudioLog(S, `the module did not bake, so nothing was launched: ${S.emitError ?? document.querySelector('.st-status')?.textContent ?? ''}`)
    screen.fail(S.emitError ?? 'the module did not bake', [{ label: 'play log', run: toLog }])
    return
  }
  await screen.step('write')
  const root = `modules/${S.module.id}`
  for (const [i, f] of r.files.entries()) {
    const bytes = typeof f.bytes === 'string' ? new TextEncoder().encode(f.bytes) : f.bytes
    // Every 16 files, the bar: a big module writes hundreds.
    if (i % 16 === 0) await screen.progress(i / r.files.length, `${i} of ${r.files.length} files`)
    await shell.writeFile(`${root}/${f.path}`, bytes)
  }
  // A MAP DELETED here leaves its bake from an earlier Play on disk, and the
  // shell hands the server every .dnpm in maps/: the deleted map was played.
  const written = new Set(r.files.map((f) => `${root}/${f.path}`))
  for (const f of await shell.listFiles(`${root}/maps`).catch(() => [])) {
    if (f.endsWith('.dnpm') && !written.has(f)) await shell.deleteFile(f).catch(() => {})
  }
  // The studio's part of the Play log (playlog.js), before anything starts.
  await writeStudioLog(S, r, { map })
  S.status('starting the game…', 'ok')
  await screen.step('start', 'the game server, then the game')
  rememberReturn()
  // and what undo can take back, which the page coming back would not know
  await keepHistories(S.module.id, S.docName, S.history, S.moduleHistory).catch((e) => console.warn('[studio] undo not kept over Play:', e))
  try {
    // The shell starts the server, then loads the game in this window: the
    // screen stays until the page is replaced.
    // the colliders drawn over the game (engine 0.2.3.7's ?colliders=1), when the map menu says so
    await shell.launch({ module: root, map, ...(S.playColliders ? { colliders: true } : {}) })
    await screen.progress(1, 'loading the game')
    // A shell that started the game without replacing this page (or a page
    // that is slow to go): the screen must not outlive its purpose.
    setTimeout(() => screen.close(), 20000)
  } catch (e) {
    forgetReturn()
    await noteStudioLog(S, `the launch failed: ${e.message ?? e}`)
    S.status(String(e.message ?? e), 'error')
    // What the server said is in the log: offer it.
    screen.fail(String(e.message ?? e), [{ label: 'play log', run: toLog }])
  }
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
  // said where it can be seen: from Home (a page) the status strip is hidden, and an export said nothing
  S.say(`Exported ${S.module.id}.zip (${(zip.length / 1024).toFixed(0)} KB): a pack to open in the studio on another device, or to unzip into modules/.`)
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
  // A pack with the id of a module already here replaces it, when asked: that
  // one kept first. The open module is reloaded in place -- opening it again
  // saved the one being left, which was this one, back over the pack, and
  // the import did nothing anybody could see.
  const isOpen = S.rec?.id === rec.id
  if (isOpen) await settleSave()
  const old = await S.store.load(rec.id)
  const maps = Object.keys(rec.docs)
  const what = `${maps.length} map${maps.length === 1 ? '' : 's'} (${maps.join(', ')})`
  if (old) {
    if (!(await confirmDialog(`Replace ${old.module?.name || rec.id} with the pack? It has ${what}. The module here now is kept in Snapshots first.`))) { S.status('nothing imported', 'ok'); return }
    await S.snapshot('before a pack was imported over it', { rec: old, force: true })
    rec.rev = old.rev ?? 0
    if (old.opened) rec.opened = old.opened
  }
  if (isOpen) {
    migrateModule(rec)
    migratePlayer(rec.module, rec.docs)
    await reloadInPlace(rec, 'the pack')
    await S.store.save(rec)
  } else {
    await S.store.save(rec)
    await openModule(rec.id)
  }
  S.say(`Imported ${rec.module.name || rec.id}: ${what}.${old ? ' The module it replaced is in Snapshots.' : ''}`)
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
// SNAP TO THE GRID, or not (tools.js step): per device, remembered.
try { S.freePlace = localStorage.getItem('dnp.studio.freePlace') === '1' } catch {}
S.toggleFreePlace = () => {
  S.freePlace = !S.freePlace
  try { localStorage.setItem('dnp.studio.freePlace', S.freePlace ? '1' : '0') } catch {}
  S.status(S.freePlace ? 'grid off: things go exactly where you put them (a corner still joins a corner or wall it lands on)' : `grid on: things snap to the map's grid (${S.doc.grid})`, 'ok')
}

// PLAY WITH THE COLLIDERS DRAWN (engine 0.2.3.7): every body's and wall's
// collider over the frame, to see why something hits or misses. Per device;
// in the game F4 turns them on and off too.
try { S.playColliders = localStorage.getItem('dnp.studio.playColliders') === '1' } catch {}
S.togglePlayColliders = () => {
  S.playColliders = !S.playColliders
  try { localStorage.setItem('dnp.studio.playColliders', S.playColliders ? '1' : '0') } catch {}
  S.status(S.playColliders ? 'Play shows the colliders over the game (F4 in the game turns them off)' : 'Play shows the game as it is', 'ok')
}

function showMenu () {
  S.ui.showMenu([
    ['Map settings…', showMapSettings],
    [S.freePlace ? 'Snap to grid: off (turn on)' : 'Snap to grid: on (turn off)', () => S.toggleFreePlace()],
    [S.playColliders ? 'Play shows colliders: on (turn off)' : 'Play shows colliders: off (turn on)', () => S.togglePlayColliders()],
    ['Play log…', () => S.go('playlog')],
    ['Camera…', () => S.showCamera()],
    ['Import texture (PNG)', () => S.importTexture()],
    ['Fit view', frameToDoc],
    ['Help', () => S.ui.showSheet('Help', [
      muted('Room: tap corners and close on the first, or drag a rectangle. Rooms that touch share a wall; a room inside a room is a platform when its floor is higher and a pit when it is lower.'),
      muted('Select: tap a room, a wall or a corner. Drag corners to reshape, drag a selected room to move it. Long-press a wall to add a corner, a corner to remove it.'),
      muted('Place: monsters, props, spawns and lights, on the floor you tap.'),
      muted('Triggers: doors, lifts, switches, teleports, ambushes and exits in one tap, then change any detail on the card.'),
      muted('Graph: node scripting for this map. The module\'s monsters, player, weapons and everything else are in the rail on the left (or ‹ on a phone).'),
      muted('Keys: 1-6 tools · Enter closes a room · Esc cancels · Del deletes · Q/E rotate · V plan/game view · G snap to grid on/off · +/- zoom · arrows pan.')
    ])]
  ])
}

/** Everything that belongs to this map and not to a room in it. */
function showMapSettings () {
  const own = overrides(S.doc)
  S.ui.showSheet(`Map ${S.docName}`, [
    text('extra Lua', S.doc.extraLua, (v) => { S.doc.extraLua = v; S.commit() }, { multiline: true, placeholder: '-- hand-written Lua, kept verbatim' }),
    el('div', { class: 'st-row' }, [button(withIcon('maptool.camera', 'camera…'), () => S.showCamera()), button(withIcon('section.graphs', 'graph…'), () => S.go('graph')), button(withIcon('section.music', 'music cues…'), () => S.go('music'))]),
    el('div', { class: 'st-row' }, [button(withIcon('section.sky', `sky${S.doc.sky ? ' (own)' : S.module.sky ? ' (the module\'s)' : ''}…`), () => S.go('sky', S.docName))]),
    el('div', { class: 'st-row' }, [
      button(withIcon('section.player', `player${own.length ? ` (own ${own.join(', ')})` : ''}…`), () => { S.playerScope = 'map'; S.go('player') }),
      button(withIcon('section.screens', `screens${S.doc.ui ? ' (own)' : ''}…`), () => { S.screensScope = 'map'; S.go('screens') })
    ]),
    muted(scriptBudget())
  ])
}
S.showMapSettings = showMapSettings

/**
 * The end of the boot, run last: everything above has published its verbs on
 * S by now. Coming back from Play to a map that was not the first opened it
 * here, mid-file, and the camera's redraw found S.redraw not yet there -- the
 * loader stayed on "the picture".
 */
async function finishBoot () {
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
      // Undo as it was before Play (history.js keepHistories).
      const kept = await takeHistories().catch(() => null)
      if (kept && kept.module === S.module.id) {
        restoreSteps(S.moduleHistory, kept.module_)
        if (kept.map === S.docName) restoreSteps(S.history, kept.map_)
        S.ui.setHistory(S.history.canUndo, S.history.canRedo)
        S.syncHistory?.()
      }
      S.status(`back from playing ${back.map}`, 'ok')
      // What the play-test logged that looks wrong, said on the way back.
      readLogs().then((logs) => {
        const bad = failures(logs)
        // Kept for the graph boards, which say what failed at the graph or the node (graphwin.js).
        S.playFailures = { bad, graphs: playedGraphs(S) }
        if (bad.length) S.status(`back from playing ${back.map} -- the Play log has ${bad.length} line${bad.length > 1 ? 's' : ''} that look wrong (⋯ → Play log, or Home)`, 'warn')
      }).catch(() => {})
    }
  }
  if (!S.router.current) await S.router.follow()
  addEventListener('hashchange', () => S.router.follow())
  // THE PHONE'S BACK (the Android shell asks, MainActivity.onBackPressed): a
  // dialog closes, else the page before this one, else Home. Only on Home is
  // it not taken, and the app goes to the background -- never quits.
  window.dnpBack = () => {
    // BACK WHILE TYPING closes the keyboard: the field lets go and the page
    // stays. It used to leave the map with the keyboard, one press for both.
    const f = document.activeElement
    if (f && f !== document.body && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA' || f.tagName === 'SELECT' || f.isContentEditable)) { f.blur(); return true }
    const dlg = [...document.querySelectorAll('dialog[open]')].pop()
    if (dlg) { if (dlg.dispatchEvent(new Event('cancel', { cancelable: true }))) dlg.close(); return true }
    if (S.router.current?.id === 'home') return false
    if (history.length > 1) history.back(); else S.go('home')
    return true
  }
  // THE KEYBOARD MADE ROOM (the shell shortens the page): the field being
  // typed in is brought where it can be seen, not left under the keyboard.
  // AND PUT BACK when the keyboard goes or the field lets go: focusing a field
  // and scrollIntoView also scroll boxes that are not meant to scroll
  // (overflow hidden, as the graph board is), and the board stayed shifted
  // up, its zoom buttons over the nodes.
  {
    let moved = []                       // [element, scrollTop, scrollLeft] as they were before
    let tall = { w: innerWidth, h: visualViewport?.height ?? innerHeight }
    const putBack = () => { for (const [n, top, left] of moved) { n.scrollTop = top; n.scrollLeft = left } moved = [] }
    const fixed = (n) => { const o = getComputedStyle(n); return o.overflowY === 'hidden' || o.overflowY === 'clip' || o.overflowX === 'hidden' }
    // As they were when the finger went down: the browser's own scroll to a
    // focused field comes before the focus event.
    const boxes = (f) => { const out = []; for (let n = f?.parentElement; n; n = n.parentElement) if (fixed(n)) out.push([n, n.scrollTop, n.scrollLeft]); return out }
    let down = null
    addEventListener('pointerdown', (e) => { down = { at: e.target, boxes: boxes(e.target) } }, true)
    addEventListener('focusin', (e) => {
      const f = e.target
      if (!(f.tagName === 'INPUT' || f.tagName === 'TEXTAREA')) return
      putBack()
      moved = down && (down.at === f || f.contains(down.at) || down.at.contains?.(f)) ? down.boxes : boxes(f)
      down = null
    }, true)
    addEventListener('focusout', () => requestAnimationFrame(() => {
      const f = document.activeElement
      if (!(f && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA'))) putBack()
    }), true)
    const onResize = () => requestAnimationFrame(() => {
      const h = visualViewport?.height ?? innerHeight
      // turned on its side, or taller again: no keyboard in the way
      if (innerWidth !== tall.w || h >= tall.h - 1) { tall = { w: innerWidth, h: Math.max(h, innerWidth === tall.w ? tall.h : 0) }; putBack(); return }
      const f = document.activeElement
      if (!(f && (f.tagName === 'INPUT' || f.tagName === 'TEXTAREA') && f.isConnected)) return
      for (let n = f.parentElement; n; n = n.parentElement) if (fixed(n) && !moved.some((m) => m[0] === n)) moved.push([n, n.scrollTop, n.scrollLeft])
      const page = document.scrollingElement
      if (page && !moved.some((m) => m[0] === page)) moved.push([page, page.scrollTop, page.scrollLeft])
      f.scrollIntoView({ block: 'center', inline: 'nearest' })
    })
    addEventListener('resize', onResize)
    visualViewport?.addEventListener('resize', onResize)
  }
  stage('ready', 1)
  boot.hidden = true
  // The plugins' background pages (a sync), now that a module is open.
  startPluginServices(S)
  // A newer studio on GitHub (updates.js): asked after the studio is up, never
  // in the way of it; Home shows it when there is one.
  checkForUpdate(STUDIO_VERSION).then((u) => {
    S.update = u
    if (u.state === 'newer' && S.route?.() === 'home') S.router.remount()
  }).catch(() => {})
  // For the page test and for poking at a live session from the console.
  globalThis.__studio = S
  requestAnimationFrame(function loop () {
    // Not while a page covers the map (a graph, a workshop, Home): drawing
    // the level under an opaque page every frame was most of what a drag on
    // a big graph cost. It is drawn again the moment the map shows.
    // Weather alone does not redraw while a finger is on the map: on a slow
    // phone those frames were what kept the gesture's own events waiting.
    if (!mapCovered() && (S.viewport.dirty || (S.viewport.animating && !S.gestures?.busy))) S.viewport.render()
    requestAnimationFrame(loop)
  })
}
await finishBoot()
