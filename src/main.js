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
import { Core } from '/src/core.js'
import { parseProps } from '/src/render/props.js'
import { parseAtlas, frameKey } from '/src/render/atlas.js'
import { ISO_ELEVATION } from '/src/camera.js'
import { loadMapcBinary, bake as bakeWith } from './bake.js'
import { newDoc, addSector, addSpawn, validate, findEdge, newId, newEdge } from './doc.js'
import { normalize } from './topology.js'
import { newModule, emitModule, RUNTIME_SCRIPTS } from './module_emit.js'
import { Vocab } from './vocab.js'
import { Viewport, COLORS } from './viewport.js'
import { Preview } from './preview.js'
import { TextureCache } from './textures.js'
import { SpriteLibrary } from './sprites.js'
import { importSheetFile, sheetRecord } from './sheets.js'
import { Gestures } from './gestures.js'
import { History } from './history.js'
import { Store, debounce } from './store.js'
import { shell, hasShell } from './bridge.js'
import { Ui, el, button, row, text, muted, card, chips, select, slider, toggle, ask, confirmDialog } from './ui.js'
import { moduleProps, newProp, deleteProp, renameProp, placementsOf, propRows } from './props.js'
import { inspector, titleFor, texturePicker, placePalette } from './inspector.js'
import { triggersSheet } from './cards.js'
import { openWorkshop } from './workshop.js'
import * as tools from './tools.js'
import { writePack, readPack } from './pack.js'

const boot = document.getElementById('boot')
const bootMsg = document.getElementById('bootmsg')
const bootFill = document.getElementById('bootfill')
const stage = (msg, frac) => { bootMsg.textContent = msg; bootFill.style.width = `${Math.round(frac * 100)}%` }

const fetchText = async (url) => { const r = await fetch(url); if (!r.ok) throw new Error(`${r.status} ${url}`); return r.text() }
const fetchJson = async (url, fallback = null) => { const r = await fetch(url); if (!r.ok) return fallback; return r.json() }

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
S.vocab = new Vocab(await fetchJson('/studio/runtime/trigger_vocab.json'), await fetchJson('/studio/runtime/mob_vocab.json'))
stage('reading the catalogue', 0.5)
const texIndex = await fetchJson('/textures/index.json', { sizes: {} })
S.textureSizes = texIndex.sizes ?? {}
S.textureNames = Object.keys(S.textureSizes).sort()
const propsText = await fetch('/props.txt').then((r) => (r.ok ? r.text() : '')).catch(() => '')
S.kinds = parseProps(propsText).kinds
S.catalogue = [...S.kinds.values()].filter((k) => k.name).map((k) => k.name).sort()
stage('opening your work', 0.65)
S.store = await Store.open()
await seedFromShell()
await openModule((await S.store.list())[0]?.id ?? null)

stage('the picture', 0.85)
S.viewport = new Viewport(document.body)
// The module's own pictures come from the record's blobs; everything else the
// shell serves. Decoded once each, whatever the number of bakes.
S.textures = new TextureCache({ urlFor: (n) => S.imageUrls.get(n) ?? `/textures/${n}.png`, cutout: texIndex.cutout ?? {} })
S.preview = new Preview({ core: S.core, bake: S.bake, runtime: S.runtime, viewport: S.viewport, textures: S.textures })
// Placed things are drawn as their own pictures, once those have loaded.
S.sprites = new SpriteLibrary({ sheets: S.sheets, kinds: S.kinds, moduleProps: () => S.module?.props ?? [], onLoad: () => redraw(), imageFor: (n) => S.spriteUrls.get(n) ?? null })
S.preview.onResult = (r) => {
  if (!r.ok) S.status(r.errors.map((e) => (e.line ? `line ${e.line}: ${e.msg}` : e.msg)).join('\n'), 'error')
  else if (r.warnings.length) S.status(r.warnings.map((w) => `${w.sector}: ${w.msg}`).join('\n'), 'warn')
  else S.status(`${S.module.id} / ${S.docName}  ·  ${S.doc.order.length} sectors`, 'ok')
  S.viewport.dirty = true
}
S.ui = new Ui({
  tool: (id) => chooseTool(id),
  undo: () => restore(S.history.undo()),
  redo: () => restore(S.history.redo()),
  view: () => { S.viewport.setMode(S.viewport.mode === 'plan' ? 'iso' : 'plan'); S.ui.setView(S.viewport.mode) },
  rotate: (dir) => S.viewport.rotate(dir * Math.PI / 4)
})
S.ui.setView(S.viewport.mode)
// The map's name at the top is where the maps are: tap it for the list.
S.ui.status.addEventListener('click', () => { if (!S.workshop || S.workshop.root.hidden) showMaps() })
S.ui.status.title = 'tap for the module\'s maps'
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
boot.hidden = true
// For the page test and for poking at a live session from the console.
globalThis.__studio = S
requestAnimationFrame(function loop () {
  if (S.viewport.dirty) S.viewport.render()
  requestAnimationFrame(loop)
})

// --- modules and maps --------------------------------------------------------------------

/**
 * A store record from a module's files: module.studio.json, the map documents
 * and the pictures. Paths relative to the module root. Null when it is not a
 * studio module (no documents).
 */
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
    else if (e.path.startsWith('assets/') && !/(^|\/)(props\.txt|index\.json)$/.test(e.path)) assets[e.path.slice(7)] = new Blob([e.bytes])
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
      if (!(rel.endsWith('.studio.json') || (rel.startsWith('assets/') && /\.(png|json|mstk)$/.test(rel)))) continue
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

async function openModule (id) {
  let rec = id ? await S.store.load(id) : null
  if (!rec) {
    const doc = starterDoc('first')
    rec = { id: 'my-level', module: newModule('my-level', 'My Level'), docs: { first: doc }, assets: {} }
    await S.store.save(rec)
  }
  S.rec = rec
  S.module = rec.module
  S.docs = rec.docs
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
}

async function openDoc (name) {
  S.docName = name
  S.doc = S.docs[name]
  normalize(S.doc)
  S.history = new History(S.doc)
  S.selection = null
  S.draw = { corners: [], rect: null }
  if (S.ui) { S.ui.hideSheet(); S.ui.setHistory(false, false); frameToDoc(); applyCamera(); redraw(); previewNow() }
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
  normalize(S.doc)
  S.history.commit(S.doc)
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
}, (armed) => { S.place = armed; S.openPalette(); if (armed) S.status(`tap the floor to place ${armed.name}`, 'ok') }, () => showProps()))
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
// What an open trigger touches: [{ kind: 'edge'|'sector'|'point', id|x,y, tone, label }],
// drawn in the viewport in the colour of the section that uses it.
S.setHighlights = (refs) => { S.highlights = refs; redraw() }
S.reopen = (title, body, onClose = null) => S.ui.showSheet(title, body, onClose)
// The module changed (a monster, a body, a texture): save, and re-bake so the
// module's mobs.lua the map declares is current.
S.moduleChanged = () => { save(); previewNow() }

const ctx = {
  commit: () => S.commit(), preview: () => previewNow(), select: (sel) => S.select(sel),
  otherSide: (edgeId) => tools.otherSide(S, edgeId),
  status: (t, l) => S.status(t, l), refreshSheet: () => S.refreshSheet(),
  pickTexture: (c, cb) => S.pickTexture(c, cb), duplicateSector: (id) => S.duplicateSector(id),
  editProp: (name) => { if (S.module.props?.some((p) => p.name === name)) showProp(name); else S.status(`${name} is the catalogue's, not this module's`, 'warn') }
}

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
  if (S.tool === 'room' && id !== 'room') tools.cancelRoom(S)
  S.tool = id
  S.ui.setTool(id)
  S.pick = null
  if (id === 'place') S.openPalette()
  else if (id === 'trigger') { S.triggerOpen = null; S.ui.showSheet('Triggers', triggersSheet(S), () => S.setHighlights([])) }
  else if (id === 'mobs') openWorkshop(S)
  else if (id === 'room') { S.ui.hideSheet(); S.status('tap corners, tap the first one again to close -- or drag a rectangle', 'ok') }
  else S.ui.hideSheet()
}

function onKey (e) {
  if (e.target?.tagName === 'INPUT' || e.target?.tagName === 'TEXTAREA' || e.target?.tagName === 'SELECT') return
  const mod = e.ctrlKey || e.metaKey
  if (mod && e.key.toLowerCase() === 'z') { e.preventDefault(); restore(e.shiftKey ? S.history.redo() : S.history.undo()); return }
  if (mod && e.key.toLowerCase() === 'y') { e.preventDefault(); restore(S.history.redo()); return }
  switch (e.key) {
    case 'Escape': if (S.draw.corners.length) tools.cancelRoom(S); else { S.pick = null; S.select(null) } break
    case 'Enter': if (S.tool === 'room') tools.finishRoom(S); break
    case 'Delete': case 'Backspace': deleteSelection(); break
    case '1': chooseTool('select'); break
    case '2': chooseTool('room'); break
    case '3': chooseTool('place'); break
    case '4': chooseTool('trigger'); break
    case '5': chooseTool('mobs'); break
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

/** A monster's or prop's pictures: a .tsprite project, or an atlas .json and its .png. */
async function importSheet () {
  const f = await shell.importFile('.tsprite,.json,.png')
  if (!f) return null
  S.status('composing…', 'ok')
  let r
  try {
    r = await importSheetFile(f, {
      parseAtlas,
      pickPng: async (image) => { S.status(`now pick ${image}`, 'ok'); return shell.importFile('.png') }
    })
  } catch (e) { S.status(String(e.message ?? e), 'error'); return null }
  const json = new Blob([JSON.stringify(r.manifest)], { type: 'application/json' })
  const png = new Blob([r.png], { type: 'image/png' })
  S.rec.assets ??= {}
  S.rec.assets[`sprites/${r.name}.json`] = json
  S.rec.assets[`sprites/${r.name}.png`] = png
  S.module.sprites ??= {}
  S.module.sprites[r.name] = sheetRecord(r.manifest)
  const old = S.sheets.get(r.name)
  if (old) URL.revokeObjectURL(old.imageUrl)
  S.sheets.set(r.name, { atlas: parseAtlas(r.manifest, r.name), imageUrl: URL.createObjectURL(png) })
  S.sprites.forgetAll()
  S.moduleChanged()
  redraw()
  S.status(`sheet ${r.name} imported: ${r.manifest.animations.length} animation(s)${r.warnings.length ? ' -- ' + r.warnings.join('; ') : ''}`, 'ok')
  return r.name
}
S.importSheet = importSheet

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

async function importTexture () {
  const f = await shell.importFile('image/png')
  if (!f) return
  const name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return }
  const blob = new Blob([f.bytes], { type: 'image/png' })
  let bmp
  try { bmp = await createImageBitmap(blob) } catch { S.status('that is not a PNG the browser can read', 'error'); return }
  S.module.textures ??= {}
  S.module.textures[name] = { w: bmp.width, h: bmp.height }
  S.rec.assets ??= {}
  S.rec.assets[`textures/${name}.png`] = blob
  if (S.imageUrls.has(name)) URL.revokeObjectURL(S.imageUrls.get(name))
  S.imageUrls.set(name, URL.createObjectURL(blob))
  S.textures.forget(name)
  bmp.close?.()
  save.flush?.(); save()
  S.status(`texture ${name} added (${bmp.width}x${bmp.height})`, 'ok')
}

/** One picture (a PNG) for a prop: assets/sprites/NAME.png, served to the game as /sprites/NAME.png. */
async function importPicture () {
  const f = await shell.importFile('image/png')
  if (!f) return null
  const name = f.name.replace(/\.[^.]*$/, '').toUpperCase().replace(/[^A-Z0-9_]/g, '').slice(0, 24)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return null }
  if (S.module.sprites?.[name]) { S.status(`${name} is a sheet already; pick another name`, 'error'); return null }
  const blob = new Blob([f.bytes], { type: 'image/png' })
  try { (await createImageBitmap(blob)).close?.() } catch { S.status('that is not a PNG the browser can read', 'error'); return null }
  S.rec.assets ??= {}
  S.rec.assets[`sprites/${name}.png`] = blob
  if (S.spriteUrls.has(name)) URL.revokeObjectURL(S.spriteUrls.get(name))
  S.spriteUrls.set(name, URL.createObjectURL(blob))
  S.sprites.forgetAll()
  save()
  S.status(`picture ${name} added`, 'ok')
  return name
}
S.importPicture = importPicture

/** Every prop name a brain or a trigger may name: the module's bodies and props, then the served catalogue. */
S.propNames = () => [...new Set([...(S.module?.props ?? []).map((p) => p.name), ...S.catalogue])].sort()

/** The module's single pictures: sprite PNGs with no manifest beside them. */
function pictureNames () {
  return Object.keys(S.rec.assets ?? {})
    .filter((p) => /^sprites\/[^/]+\.png$/.test(p) && !S.rec.assets[p.replace(/\.png$/, '.json')])
    .map((p) => p.slice(8, -4)).sort()
}

// --- the soundtrack: baked tracks in the module, cues per map, and a way to hear them ------------
//
// A track is a .mstk the synth project bakes (midisynth/docs/TRACK_FORMAT.md):
// the song, its instruments and its loop points in one sealed file. The game
// finds a map's music by the map's content hash in assets/music/index.json,
// which the emitter writes from doc.music beside each bake (module_emit.js).
async function importTrack () {
  const f = await shell.importFile('.mstk,application/octet-stream')
  if (!f) return null
  const name = f.name.replace(/\.mstk$/i, '').toLowerCase().replace(/[^a-z0-9_.-]/g, '').slice(0, 40)
  if (!name) { S.status('the file needs a name made of letters and digits', 'error'); return null }
  if (f.bytes.length < 16 || String.fromCharCode(...f.bytes.slice(0, 4)) !== 'MSTK') { S.status(`${f.name} is not a baked track (.mstk from the synth's Bake)`, 'error'); return null }
  const blob = new Blob([f.bytes], { type: 'application/octet-stream' })
  S.rec.assets ??= {}
  S.rec.assets[`music/${name}.mstk`] = blob
  if (S.trackUrls.has(name)) URL.revokeObjectURL(S.trackUrls.get(name))
  S.trackUrls.set(name, URL.createObjectURL(blob))
  save()
  S.status(`track ${name} added (${(f.bytes.length / 1024).toFixed(0)} KB)`, 'ok')
  return name
}
S.importTrack = importTrack

function trackNames () { return [...S.trackUrls.keys()].sort() }

/** Hear a track here, through the same synth the game uses. */
async function listen (name) {
  const url = S.trackUrls.get(name)
  if (!url) { S.status(`no track called ${name}`, 'warn'); return }
  if (!S.music) {
    const { Music } = await import('/src/audio/music.js')
    S.music = new Music({ log: (m) => console.log(m) })
  }
  try { await S.music.start() } catch (e) { S.status(`the synth did not start: ${e.message ?? e}`, 'error'); return }
  await S.music.play(url, { loop: true, fadeMs: 0 })
  S.status(`♪ ${name}`, 'ok')
  if (soundtrackOpen()) showMusic()
}
const soundtrackOpen = () => S.ui.sheetOpen && /^Soundtrack/.test(document.querySelector('.st-sheet-title')?.textContent ?? '')
S.listen = listen

function stopListening () {
  S.music?.stop()
  S.status('♪ stopped', 'ok')
  if (soundtrackOpen()) showMusic()
}
S.stopListening = stopListening

function showMusic () {
  S.doc.music ??= {}
  const tracks = trackNames()
  const playing = (t) => !!S.music?.current && S.music.current === S.trackUrls.get(t)
  const usedBy = (t) => Object.values(S.docs).reduce((n, d) => n + Object.values(d.music ?? {}).filter((x) => x === t).length, 0)
  const cueRows = Object.entries(S.doc.music).map(([cue, track]) => el('div', { class: 'st-row', 'data-cue': cue }, [
    el('span', { class: 'st-entry', text: cue }),
    select('', track, [['', '(choose a track)'], ...tracks], (v) => { if (v) S.doc.music[cue] = v; else delete S.doc.music[cue]; S.commit(); showMusic() }).lastChild,
    button(playing(track) ? '■' : '▶', () => (playing(track) ? stopListening() : listen(track))),
    button('✕', () => { delete S.doc.music[cue]; S.commit(); showMusic() })
  ]))
  const trackRows = tracks.map((t) => el('div', { class: 'st-trow', 'data-track': t }, [
    el('div', { class: 'st-trow-text' }, [
      el('div', { class: 'st-trow-name', text: t }),
      el('div', { class: 'st-muted', text: `${(S.rec.assets[`music/${t}.mstk`].size / 1024).toFixed(0)} KB · in ${usedBy(t)} cue(s)` })
    ]),
    button(playing(t) ? '■' : '▶', () => (playing(t) ? stopListening() : listen(t))),
    button('✕', async () => {
      const n = usedBy(t)
      if (!await confirmDialog(`delete track ${t}?${n ? ` ${n} cue(s) use it; they go too.` : ''}`)) return
      if (playing(t)) stopListening()
      delete S.rec.assets[`music/${t}.mstk`]
      URL.revokeObjectURL(S.trackUrls.get(t)); S.trackUrls.delete(t)
      for (const d of Object.values(S.docs)) for (const [cue, x] of Object.entries(d.music ?? {})) if (x === t) delete d.music[cue]
      S.commit(); S.moduleChanged(); showMusic()
    }, 'st-danger')
  ]))
  S.ui.showSheet('Soundtrack', [
    el('div', { class: 'st-section-head', text: `♪ ${S.docName}: cues` }),
    ...cueRows,
    cueRows.length ? null : muted('No music for this map yet. The game starts the cue called default; a script can switch to another.'),
    button('+ cue', async () => {
      const raw = await ask('cue name', S.doc.music.default ? 'fight' : 'default')
      const cue = String(raw ?? '').toLowerCase().replace(/[^a-z0-9_]/g, '')
      if (!cue) return
      if (S.doc.music[cue]) { S.status(`there is a cue called ${cue} already`, 'warn'); return }
      S.doc.music[cue] = tracks[0] ?? ''
      S.commit(); showMusic()
    }),
    el('div', { class: 'st-section-head', text: '♫ tracks in the module' }),
    ...trackRows,
    trackRows.length ? null : muted('No tracks yet. Bake one in the synth project (midisynth/tool/daw.html, "Bake .mstk") and import it here.'),
    button('+ import track (.mstk)', async () => {
      const n = await importTrack()
      if (!n) return
      if (!S.doc.music.default) { S.doc.music.default = n; S.commit() }
      showMusic()
    }),
    S.music ? muted(S.music.health() ?? 'synth starting…') : null,
    muted('Cues cut from one parent track crossfade into each other; unrelated tracks swap. Every map of the module keeps its own cues.')
  ])
}
S.showMusic = showMusic

// --- the camera: where the game looks at this map from, previewed here ------------------------
const TURN = Math.PI * 2
const ENGINE_YAW_TURNS = 0.125          // the client's START_YAW, 45 degrees
const ENGINE_PITCH_TURNS = ISO_ELEVATION / TURN

function cameraOf (doc) {
  doc.camera ??= { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false }
  return doc.camera
}

/** The level view takes the map's camera while one is set, and the engine's otherwise. */
function applyCamera () {
  if (!S.doc || !S.viewport) return
  const c = cameraOf(S.doc)
  S.viewport.setCamera({
    yaw: c.yaw !== null ? c.yaw * TURN : null,
    elevation: c.pitch !== null ? c.pitch * TURN : null,
    distance: c.distance
  })
  redraw()
}
S.applyCamera = applyCamera

function showCamera () {
  const c = cameraOf(S.doc)
  const deg = (t) => `${Math.round(t * 360)}°`
  const live = (done) => { applyCamera(); if (done) S.commit() }
  const angled = c.yaw !== null || c.pitch !== null
  S.ui.showSheet('Camera', [
    muted(`How the game looks at ${S.docName}. Off is the engine's own: ${deg(ENGINE_YAW_TURNS)} around, ${deg(ENGINE_PITCH_TURNS)} down, free to turn and zoom.`),
    toggle('set the angle', angled, (v) => {
      c.yaw = v ? ENGINE_YAW_TURNS : null
      c.pitch = v ? ENGINE_PITCH_TURNS : null
      if (v && S.viewport.mode !== 'iso') { S.viewport.setMode('iso'); S.ui.setView('iso') }
      live(true); showCamera()
    }),
    angled ? slider(`around (${deg(c.yaw ?? ENGINE_YAW_TURNS)})`, c.yaw ?? ENGINE_YAW_TURNS, { min: 0, max: 1, step: 1 / 32 }, (v, done) => { c.yaw = v; live(done); if (done) showCamera() }) : null,
    angled ? slider(`down (${deg(c.pitch ?? ENGINE_PITCH_TURNS)})`, c.pitch ?? ENGINE_PITCH_TURNS, { min: 0.02, max: 0.25, step: 0.005 }, (v, done) => { c.pitch = v; live(done); if (done) showCamera() }) : null,
    toggle('set the distance', c.distance !== null, (v) => { c.distance = v ? 38 : null; live(true); showCamera() }),
    c.distance !== null ? slider('distance', c.distance, { min: 8, max: 80, step: 1 }, (v, done) => { c.distance = v; live(done) }) : null,
    toggle('lock turning', !!c.lockYaw, (v) => { c.lockYaw = v; S.commit() }),
    toggle('lock zoom', !!c.lockZoom, (v) => { c.lockZoom = v; S.commit() }),
    muted('The level view follows these while they are set. Sprites stand upright in the world, so the steeper the camera looks down, the shorter they show -- here and in the game.')
  ].filter(Boolean))
}
S.showCamera = showCamera

// --- props: the sheet that lists them, and the one that edits one --------------------------------
function showProps () {
  const props = moduleProps(S.module)
  const rows = props.map((p) => {
    const r = el('div', { class: 'st-trow', 'data-prop': p.name }, [
      propThumb(p),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: p.name }),
        el('div', { class: 'st-muted', text: `${p.radius} × ${p.height} · ${p.solid ? 'solid' : 'walk-through'} · ${p.art ? (p.art.kind === 'atlas' ? p.art.sheet : p.art.states?.[0]?.frames?.[0]) : 'no picture'} · placed ${placementsOf(S.docs, p.name).length}` })
      ])
    ])
    r.addEventListener('click', () => showProp(p.name))
    return r
  })
  S.ui.showSheet('Props', [
    ...rows,
    props.length ? null : muted('No props yet. A prop is a thing without a brain: a barrel, a torch, a tree.'),
    button('+ new prop', async () => {
      const raw = await ask('prop name (letters, digits, underscore)', 'barrel')
      if (!raw) return
      const name = newProp(S.module, raw)
      if (!name) { S.status('that name is empty or taken', 'warn'); return }
      S.moduleChanged()
      showProp(name)
    }),
    muted('Tap one to edit it. Monsters are in the workshop (Mobs tool).')
  ])
}
S.showProps = showProps

function propThumb (p) {
  const box = el('div', { class: 'st-thumb', text: '?' })
  const icon = S.sprites.iconFor(p.name)
  const img = icon?.texture?.image
  if (img?.src) { box.textContent = ''; box.appendChild(el('img', { src: img.src })) }
  return box
}

function showProp (name) {
  const p = S.module.props.find((x) => x.name === name)
  if (!p) { showProps(); return }
  const ctx = {
    pictures: pictureNames(),
    sheets: Object.keys(S.module.sprites ?? {}),
    placements: placementsOf(S.docs, name).length,
    pictureUrl: (n) => S.spriteUrls.get(n) ?? null,
    sheetFrame: (sheet, anim) => {
      const src = S.sheets.get(sheet)
      const a = anim ? src?.atlas.byName.get(anim) : null
      const f = a ? src.atlas.frames[frameKey(src.atlas, a.name, 0, 1)] : null
      return f ? { url: src.imageUrl, rect: f.rect } : null
    },
    importPicture,
    importSheet,
    changed: () => { S.sprites.forget(name); S.moduleChanged(); redraw(); showProp(name) },
    rename: (raw) => {
      const to = renameProp(S.module, S.docs, name, raw)
      if (!to) { S.status('that name is empty or taken', 'warn'); showProp(name); return }
      S.sprites.forgetAll(); S.commit(); S.moduleChanged(); showProp(to)
    },
    remove: async () => {
      const n = placementsOf(S.docs, name).length
      if (!await confirmDialog(`delete prop ${name}?${n ? ` It stands in the maps ${n} time(s); those go too.` : ''}`)) return
      deleteProp(S.module, S.docs, name)
      S.sprites.forget(name); S.commit(); S.moduleChanged(); showProps()
    },
    place: () => { S.place = { kind: 'prop', name }; S.ui.setTool('place'); S.tool = 'place'; S.ui.hideSheet(); S.status(`tap the floor to place ${name}`, 'ok') }
  }
  S.ui.showSheet(`Prop ${name}`, propRows(S.module, p, ctx).filter(Boolean))
}
S.showProp = showProp

// --- play, export, import -----------------------------------------------------------------------
async function emitAll () {
  const problems = validate(S.doc)
  if (problems.length) { S.status(problems.map((p) => (p.sector ? `${p.sector}: ` : '') + p.msg).join('\n'), 'error'); return null }
  const sizes = { ...S.textureSizes }
  const assets = {}
  for (const [path, blob] of Object.entries(S.rec.assets ?? {})) assets[path] = new Uint8Array(await blob.arrayBuffer())
  const r = await emitModule(S.module, Object.values(S.docs), {
    bake: S.bake, runtime: S.runtime, assets,
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
  try { await shell.launch({ module: root, map: `${S.docName}.dnpm` }) } catch (e) { S.status(String(e.message ?? e), 'error') }
}

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

/** The module's maps, one sheet: tap one to edit it, ✕ to delete it, + for a new one. */
function showMaps () {
  const names = Object.keys(S.docs)
  const rows = names.map((n) => {
    const d = S.docs[n]
    const on = n === S.docName
    const r = el('div', { class: 'st-trow', 'data-on': on ? '1' : '0', 'data-map': n }, [
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: `${on ? '▶ ' : ''}${n}` }),
        el('div', { class: 'st-muted', text: `${d.order.length} sectors · ${d.entities.length} things · ${d.triggers.length} triggers${on ? ' · editing' : ''}` })
      ]),
      button('✕', async (e) => {
        e.stopPropagation()
        if (Object.keys(S.docs).length < 2) { S.status('a module keeps at least one map', 'warn'); return }
        if (!await confirmDialog(`delete map ${n}? There is no undo for this.`)) return
        delete S.docs[n]
        save()
        if (n === S.docName) await openDoc(Object.keys(S.docs)[0])
        S.status(`deleted map ${n}`, 'ok')
        showMaps()
      }, 'st-danger')
    ])
    r.addEventListener('click', () => { S.ui.hideSheet(); openDoc(n) })
    return r
  })
  S.ui.showSheet('Maps', [
    ...rows,
    button('+ new map', async () => {
      const name = await ask('map name (letters, digits, dashes)', `map${names.length + 1}`)
      if (!name) return
      const clean = name.toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (!clean || S.docs[clean]) { S.status('that name is taken or empty', 'warn'); return }
      S.docs[clean] = starterDoc(clean)
      save()
      await openDoc(clean)
      S.status(`${clean}: a new map, one room`, 'ok')
    }),
    muted('Tap a map to edit it. Every map ships in the pack; Play starts the one being edited.')
  ])
}
S.showMaps = showMaps

function showMenu () {
  const items = [
    ['Maps…', showMaps],
    ['Props…', showProps],
    ['Soundtrack…', showMusic],
    ['Camera…', showCamera],
    ['Module settings…', () => S.ui.showSheet('Module', [
      text('id', S.module.id, (v) => { const id = v.toLowerCase().replace(/[^a-z0-9_-]/g, ''); if (id) { S.module.id = id; S.rec.id = id; save() } }),
      text('name', S.module.name, (v) => { S.module.name = v; save() }),
      text('about', S.module.about, (v) => { S.module.about = v; save() }, { multiline: true }),
      text('extra Lua for this map', S.doc.extraLua, (v) => { S.doc.extraLua = v; S.commit() }, { multiline: true, placeholder: '-- hand-written Lua, kept verbatim' }),
      muted(`Prop ids start at ${S.module.propIdBase}. Every map declares the module's monsters and scripts.`)
    ])],
    ['New module (from the starter)', async () => {
      const id = await ask('module id (letters, digits, dashes)', 'my-level')
      if (!id) return
      const clean = id.toLowerCase().replace(/[^a-z0-9_-]/g, '')
      if (!clean) return
      if (await S.store.load(clean)) { S.status(`a module called ${clean} already exists`, 'warn'); return }
      // The starter module, when the app shipped one, is the base: a level
      // with a door, a monster with a sheet, textures. Otherwise a blank room.
      const copied = await copyModule('starter', clean, id)
      if (!copied) {
        const rec = { id: clean, module: newModule(clean, id), docs: { first: starterDoc('first') }, assets: {} }
        await S.store.save(rec)
      }
      await openModule(clean)
      S.status(copied ? `${clean}: a copy of the starter module (prop ids from ${copied.module.propIdBase})` : `${clean}: no starter module here, so a blank room`, 'ok')
    }],
    ['Open module…', async () => {
      const list = await S.store.list()
      S.ui.showSheet('Modules', [chips(list.map((r) => ({ id: r.id, label: r.id, on: r.id === S.rec.id })), (it) => { S.ui.hideSheet(); openModule(it.id) })])
    }],
    ['Import texture (PNG)', importTexture],
    ['Import sprite sheet (.tsprite / .json+.png)', importSheet],
    ['Export pack (zip)', exportPack],
    ['Import pack (zip)', importPack],
    ['Fit view', frameToDoc],
    ['Help', () => S.ui.showSheet('Help', [
      muted('Room: tap corners and close on the first, or drag a rectangle. Rooms that touch share a wall; a room inside a room is a platform when its floor is higher and a pit when it is lower.'),
      muted('Select: tap a room, a wall or a corner. Drag corners to reshape, drag a selected room to move it. Long-press a wall to add a corner, a corner to remove it.'),
      muted('Place: monsters, props, spawns and lights, on the floor you tap.'),
      muted('Triggers: doors, lifts, switches, teleports, ambushes and exits in one tap, then change any detail on the card.'),
      muted('Keys: 1-5 tools · Enter closes a room · Esc cancels · Del deletes · Q/E rotate · V plan/game view · +/- zoom · arrows pan.')
    ])]
  ]
  S.ui.showMenu(items)
}
