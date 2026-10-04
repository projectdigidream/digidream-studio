//
// THE MODULE'S PANELS: one document per panel, written out as everything the
// engine reads a panel from (docs/PANELS.md, docs/UI_LAYOUT.md 5).
//
// The engine keeps a panel in two halves. Its CONTENT -- a title and up to 32
// widgets of five kinds -- is what a script opens (dnp.ui_open, a trigger
// table's `panels`, a graph's `panels`). Its LOOK -- where it sits, where each
// widget goes, decor behind them -- is a template in the UI layout. The studio
// keeps the two together, because a person editing a shop is editing one
// thing, and splits them only here:
//
//   module.panels[name] = {
//     title,
//     look:    { anchor, x, y, w, h?, modal, closeable, showTitle, style? },
//     widgets: [{ kind, id, name, label, lo?, hi?, value?, options?,
//                 slot: { x, y, w, h, style? } }],
//     decor:   [ HUD elements, drawn behind the widgets ]
//   }
//
// A widget has a NAME, which is what graphs say ("buy_ssg"), and an id, the
// wire's number, given once and never reused, so renaming a button keeps the
// links to it. Every widget has a slot: the editor places all of them, so
// nothing falls into the template's "stacked in the body" fallback unseen.
//
// Pure: the Panels window, the emitters and the tests all use it.
//

import { graphsOf } from './graphs_emit.js'

export const NAME_RE = /^[a-z0-9_]{1,24}$/
export const KINDS = ['label', 'button', 'toggle', 'slider', 'select']
export const MAX_WIDGETS = 32
export const MAX_OPTIONS = 32
export const SLOT_H = 32                // the client's height for a slot that does not say

/** "Buy shotgun!" -> "buy_shotgun": a name the engine accepts, from words. */
export function cleanName (s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)
}

/** A free name: `base`, else `base2`, `base3` ... */
export function freeName (base, taken) {
  const b = cleanName(base) || 'panel'
  if (!taken.has(b)) return b
  let i = 2
  while (taken.has(`${b.slice(0, 22)}${i}`)) i++
  return `${b.slice(0, 22)}${i}`
}

export function newPanel (title = 'Panel') {
  return {
    title,
    look: { anchor: 'c', x: 0, y: 0, w: 320, modal: true, closeable: true, showTitle: true },
    widgets: [],
    decor: []
  }
}

/** Where a new widget's slot goes: under the lowest one, the panel's width less a margin. */
function nextSlot (panel, kind) {
  const bottom = Math.max(0, ...panel.widgets.map((w) => (w.slot?.y ?? 0) + (w.slot?.h ?? SLOT_H)))
  const w = Math.max(60, (panel.look?.w ?? 320) - 24)
  return { x: 12, y: panel.widgets.length ? bottom + 8 : 12, w, h: kind === 'slider' || kind === 'select' ? 44 : SLOT_H }
}

/** Add a widget of `kind`; returns it. Ids only grow, so a deleted id is never handed out again. */
export function addWidget (panel, kind, label = null) {
  if (!KINDS.includes(kind)) throw new Error(`no widget kind '${kind}'`)
  panel.nextId = Math.max(panel.nextId ?? 1, 1 + Math.max(0, ...panel.widgets.map((w) => w.id)))
  const id = panel.nextId++
  const names = new Set(panel.widgets.map((w) => w.name))
  const text = label ?? { label: 'Text', button: 'Button', toggle: 'Option', slider: 'Amount', select: 'Choice' }[kind]
  const w = { kind, id, name: freeName(text, names), label: text, slot: nextSlot(panel, kind) }
  if (kind === 'slider') Object.assign(w, { lo: 0, hi: 10, value: 5 })
  if (kind === 'toggle') w.value = 0
  if (kind === 'select') Object.assign(w, { options: ['one', 'two'], value: 0 })
  panel.widgets.push(w)
  return w
}

/** The widget list a script opens: the five kinds' own arguments, nothing of the editor's. */
export function widgetsOf (panel, { names = false } = {}) {
  return (panel.widgets ?? []).map((w) => {
    const out = { kind: w.kind, id: w.id, label: w.label ?? '' }
    if (names) out.name = w.name
    if (w.kind === 'slider') { out.lo = w.lo ?? 0; out.hi = w.hi ?? 0 }
    if (w.kind === 'select') out.options = [...(w.options ?? [])]
    if (w.kind !== 'label' && w.kind !== 'button' && w.value !== undefined) out.value = w.value
    return out
  })
}

/** The panel as a script's table: title, template (its own name) and widgets. */
export function contentOf (name, panel, opts = {}) {
  return { title: panel.title ?? name, template: name, widgets: widgetsOf(panel, opts) }
}

/** The panel's LOOK as a layout template (docs/UI_LAYOUT.md 5.2). */
export function templateOf (panel) {
  const L = panel.look ?? {}
  const t = { anchor: L.anchor ?? 'c', x: L.x ?? 0, y: L.y ?? 0, w: L.w ?? 320 }
  if (L.h !== undefined) t.h = L.h
  t.modal = !!L.modal
  if (L.closeable === false) t.closeable = false
  if (L.showTitle === false) t.title = { show: false }
  if (L.style && Object.keys(L.style).length) t.style = { ...L.style }
  t.slots = (panel.widgets ?? []).map((w) => {
    const s = w.slot ?? {}
    const sl = { widget: w.id, anchor: 'tl', x: s.x ?? 0, y: s.y ?? 0, w: s.w ?? 120 }
    if (s.h !== undefined && s.h !== SLOT_H) sl.h = s.h
    if (s.style && Object.keys(s.style).length) sl.style = { ...s.style }
    return sl
  })
  if ((panel.decor ?? []).length) t.decor = JSON.parse(JSON.stringify(panel.decor))
  return t
}

/** A layout with the module's panel templates in it, over any of the same name. */
export function withTemplates (layout, panels) {
  const out = JSON.parse(JSON.stringify(layout ?? { version: 1 }))
  if (!panels || !Object.keys(panels).length) return out
  out.panels = { ...(out.panels ?? {}) }
  for (const [name, p] of Object.entries(panels)) out.panels[name] = templateOf(p)
  return out
}

/** What would be refused or lost, said while it is drawn. */
export function panelProblems (name, panel) {
  const out = []
  const where = `panel '${name}'`
  if (!NAME_RE.test(name)) out.push(`${where}: a name is 1 to 24 of a-z, 0-9, _`)
  const ws = panel.widgets ?? []
  if (ws.length > MAX_WIDGETS) out.push(`${where}: ${ws.length} widgets, the most a panel can carry is ${MAX_WIDGETS}`)
  const names = new Set(); const ids = new Set()
  for (const w of ws) {
    const ww = `${where}, ${w.name ?? w.id}`
    if (!KINDS.includes(w.kind)) out.push(`${ww}: no widget kind '${w.kind}'`)
    if (!NAME_RE.test(w.name ?? '')) out.push(`${ww}: a widget's name is 1 to 24 of a-z, 0-9, _`)
    if (names.has(w.name)) out.push(`${ww}: two widgets are called '${w.name}'`)
    if (ids.has(w.id)) out.push(`${ww}: two widgets have the id ${w.id}`)
    names.add(w.name); ids.add(w.id)
    if (!(Number.isInteger(w.id) && w.id >= 1 && w.id <= 65535)) out.push(`${ww}: an id is a whole number from 1`)
    if (w.kind === 'slider' && !(Number.isInteger(w.lo) && Number.isInteger(w.hi) && w.lo < w.hi)) out.push(`${ww}: a slider runs from a whole number to a larger one`)
    if (w.kind === 'select' && !(w.options ?? []).length) out.push(`${ww}: a choice needs at least one option`)
    if (w.kind === 'select' && (w.options ?? []).length > MAX_OPTIONS) out.push(`${ww}: ${w.options.length} options, the most is ${MAX_OPTIONS}`)
  }
  return out
}

// --- who uses a panel ---------------------------------------------------------------------

// The node types and verbs that name a panel: the graph's own (docs/PANELS.md
// 3) and the trigger vocabulary's.
export const PANEL_NODES = ['open_panel', 'close_panel', 'set_widget', 'when_panel_used', 'when_panel_closed', 'panel_is_open']
const PANEL_VERBS = ['ui_open', 'ui_close']

/** The panel names a graph uses, by its nodes. */
export function panelsInGraph (graph) {
  const out = new Set()
  for (const n of graph?.nodes ?? []) {
    if ((PANEL_NODES.includes(n.type) || (n.type === 'action' && PANEL_VERBS.includes(n.a))) && typeof n.panel === 'string' && n.panel) out.add(n.panel)
  }
  return out
}

/** The panel names a map's trigger cards and graph open through the trigger table. */
export function panelsInTriggers (doc) {
  const out = new Set()
  for (const t of doc?.triggers ?? []) for (const a of t.actions ?? []) if (PANEL_VERBS.includes(a.a) && typeof a.panel === 'string') out.add(a.panel)
  // A graph's `action ui_open` runs the trigger runtime's verb, which reads
  // the trigger table's panels: those go there too.
  for (const g of graphsOf(doc).map(([, g]) => g)) for (const n of g?.nodes ?? []) if (n.type === 'action' && PANEL_VERBS.includes(n.a) && typeof n.panel === 'string') out.add(n.panel)
  return out
}

/** The trigger table's `panels` for a map: the module's panels it opens. */
export function triggerPanels (doc, panels) {
  const out = {}
  for (const name of panelsInTriggers(doc)) if (panels?.[name]) out[name] = contentOf(name, panels[name])
  return out
}

/** A graph's `panels` field (docs/PANELS.md 2): the ones its nodes name, with widget names. */
export function graphPanels (graph, panels) {
  const out = {}
  for (const name of panelsInGraph(graph)) if (panels?.[name]) out[name] = contentOf(name, panels[name], { names: true })
  return out
}

/**
 * Every place a panel is used: [{ graph: 'game' | map, gname, node, how, widget? }]
 * -- `gname` the graph's name in its map (or the module); a card has `trigger`.
 * `how` is 'opens', 'closes', 'sets', 'answers', 'closed', 'asks', or
 * 'trigger' for a trigger card.
 */
export function panelUses (name, module, docs) {
  const HOW = { open_panel: 'opens', close_panel: 'closes', set_widget: 'sets', when_panel_used: 'answers', when_panel_closed: 'closed', panel_is_open: 'asks' }
  const out = []
  const scan = (owner, label) => {
    for (const [gname, graph] of graphsOf(owner)) {
      for (const n of graph?.nodes ?? []) {
        if (n.panel !== name) continue
        if (HOW[n.type]) out.push({ graph: label, gname, node: n.id, how: HOW[n.type], widget: n.widget })
        else if (n.type === 'action' && n.a === 'ui_open') out.push({ graph: label, gname, node: n.id, how: 'opens' })
        else if (n.type === 'action' && n.a === 'ui_close') out.push({ graph: label, gname, node: n.id, how: 'closes' })
      }
    }
  }
  scan(module, 'game')
  for (const d of docs ?? []) {
    scan(d, d.name)
    for (const t of d.triggers ?? []) for (const a of t.actions ?? []) if (PANEL_VERBS.includes(a.a) && a.panel === name) out.push({ graph: d.name, trigger: t.name, how: 'trigger' })
  }
  return out
}

// --- from the map's panels and the layout's templates --------------------------------------

/**
 * Module version 3: panels move from each map's trigger table (doc.panels)
 * into the module's library, taking the layout's template of the same name
 * as their look. Two maps with a panel of one name and different contents
 * keep both, the second renamed `<map>_<name>`, and that map's references
 * follow. Returns lines saying what moved.
 */
export function migratePanels (module, docs) {
  const did = []
  module.panels ??= {}
  for (const doc of docs) {
    for (const [name, p] of Object.entries(doc.panels ?? {})) {
      const mine = fromScript(name, p, module.ui?.panels?.[name] ?? doc.ui?.panels?.[name])
      let as = name
      const there = module.panels[name]
      if (there && JSON.stringify(contentOf(name, there)) !== JSON.stringify(contentOf(name, mine))) {
        as = freeName(`${doc.name}_${name}`, new Set(Object.keys(module.panels)))
        renamePanelRefs(doc, name, as)
      }
      if (!module.panels[as]) { module.panels[as] = mine; did.push(`${doc.name}'s panel ${name} moved to the module's panels${as !== name ? ` as ${as}` : ''}`) }
    }
    delete doc.panels
  }
  // A template a panel took as its look is the panel's now: written from it,
  // so not kept a second time in the layouts.
  for (const L of [module.ui, ...docs.map((d) => d.ui)]) {
    if (!L?.panels) continue
    for (const name of Object.keys(module.panels)) delete L.panels[name]
    if (!Object.keys(L.panels).length) delete L.panels
  }
  if (!Object.keys(module.panels).length) delete module.panels
  return did
}

/** A panel document from a script panel and, if there is one, its template. */
export function fromScript (name, p, tpl = null) {
  const panel = newPanel(p.title ?? name)
  if (tpl) {
    Object.assign(panel.look, { anchor: tpl.anchor ?? 'c', x: tpl.x ?? 0, y: tpl.y ?? 0, w: tpl.w ?? 320, modal: !!tpl.modal, closeable: tpl.closeable !== false, showTitle: tpl.title?.show !== false })
    if (tpl.h !== undefined) panel.look.h = tpl.h
    if (tpl.style) panel.look.style = { ...tpl.style }
    if (tpl.decor) panel.decor = JSON.parse(JSON.stringify(tpl.decor))
  }
  const taken = new Set()
  for (const w of p.widgets ?? []) {
    const slot = tpl?.slots?.find((s) => s.widget === w.id)
    const nw = { ...JSON.parse(JSON.stringify(w)), name: freeName(w.label || `${w.kind}${w.id}`, taken) }
    taken.add(nw.name)
    nw.slot = slot ? { x: slot.x ?? 0, y: slot.y ?? 0, w: slot.w ?? 120, h: slot.h ?? SLOT_H, ...(slot.style ? { style: { ...slot.style } } : {}) } : nextSlot(panel, w.kind)
    panel.widgets.push(nw)
  }
  return panel
}

/** A panel renamed: every trigger card and graph node naming it follows (a map, or the module). */
export function renamePanelRefs (doc, from, to) {
  for (const t of doc?.triggers ?? []) for (const a of t.actions ?? []) if (PANEL_VERBS.includes(a.a) && a.panel === from) a.panel = to
  for (const g of graphsOf(doc).map(([, g]) => g)) for (const n of g?.nodes ?? []) if (n.panel === from) n.panel = to
}

/** A widget renamed: graph nodes naming it follow, in every graph of a map or the module. */
export function renameWidgetRefs (owner, panel, from, to) {
  for (const g of graphsOf(owner).map(([, g]) => g)) for (const n of g?.nodes ?? []) if (n.panel === panel && n.widget === from) n.widget = to
}
