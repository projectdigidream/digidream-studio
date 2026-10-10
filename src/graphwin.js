//
// THE GRAPH WINDOW: a map's graph drawn and edited as nodes and links
// (docs/GRAPHS.md), over the whole screen like the monster workshop.
//
// Every word on a node is the vocabularies': the node types and their pins
// from graph_vocab.json, and an event's, condition's or action's name and
// arguments from trigger_vocab.json -- the same arguments, the same forms and
// the same picking on the map as a trigger card, because a graph's verbs ARE
// the trigger runtime's. Nothing here knows what a lift is.
//
// Pins: exec on the left (in) and right (out) as ▷, data as ●. Drag from an
// output to an input to link them; an exec exit goes to one place and a data
// input takes one value, so a new link replaces the one it would break. Tap a
// link to select it, and delete it from the side panel. Drag a node by its
// title; drag the board to pan, pinch or wheel to zoom.
//
// TWO SCOPES, MANY GRAPHS. A map's graphs (doc.graphs, undone with the map)
// run in its level; the GAME'S (module.graphs) run once in the game VM, hear
// the players come and go, and keep their variables across levels. Each has
// its own name, picked in the bar, where a new one is made too. The game has no level of
// its own, so its palette offers only graph_vocab's `game` words -- what acts
// on a level is done by `call`ing that level's graph, whose `on_call` takes it.
//
// A condition's or action's argument of a pinnable type has a data pin in its
// row on the node: linked, it takes the value at run time and its field says so.
//
import { buttonNames, ENGINE_BUTTON_NAMES, keyLabel } from './keys_emit.js'
import { el, row, text, select, button, muted, number, toggle, ask, confirmDialog, addHelp, withIcon, icon } from './ui.js'
import { argFields } from './argform.js'
import { decorIdsOf } from './panels_emit.js'
import { playScene } from './scene.js'
import { isStart } from './scene_plan.js'
import { newGraph, nodeSpecs, pinsOf, graphProblems, graphsOf, parseGraphRoute, graphRoute, cleanGraphName, NAME_RE, MAP_GRAPH, GAME_NAME, VAR_NODES, varChoices, propertiesOf, propertyFits, isVarRef, bindableArgs, numberSources } from './graphs_emit.js'

const CATEGORY = { event: 'ev', condition: 'cond', action: 'act', branch: 'flow', sequence: 'flow', delay: 'flow', once: 'flow',
                   get_var: 'data', set_var: 'act', add_var: 'act', literal: 'data', compare: 'data', math: 'data', logic: 'data', random: 'data',
                   on_call: 'ev', call: 'act' }
// What the studio writes for a verb, never a person: no field and no pin.
const HIDDEN_ARGS = ['side', 'expect_neighbour', 'expect_tag', 'fn']
const NODE_W = 236

/** A node's colour: where a run starts, what it does, what it reads, how it flows. */
function categoryOf (n, spec) {
  if (CATEGORY[n.type]) return CATEGORY[n.type]
  if (spec?.starts) return 'ev'
  if (['entity', 'sector', 'wall'].includes(spec?.category)) return (spec.exec_in ?? []).length ? 'act' : 'data'
  if (spec?.category === 'cinematic' || spec?.category === 'camera') return 'cine'
  return 'flow'
}

// The node menu's groups, designer's words first: the world's nodes by their
// graph_vocab category, then flow and data, then the trigger vocabulary's.
const MENU = [
  ['when …', (s) => s.starts || s.name === 'on_call'],
  ['do to a thing', (s) => s.category === 'entity' && (s.exec_in ?? []).length],
  ['move the map', (s) => (s.category === 'sector' || s.category === 'wall') && (s.exec_in ?? []).length],
  ['cutscene', (s) => s.category === 'cinematic'],
  ['camera', (s) => s.category === 'camera'],
  ['maps', (s) => s.category === 'maps'],
  ['read', (s) => ['entity', 'sector', 'wall'].includes(s.category) && !(s.exec_in ?? []).length],
  ['flow', (s) => ['branch', 'sequence', 'delay', 'once', 'call'].includes(s.name)],
  ['data', (s) => ['get_var', 'set_var', 'add_var', 'literal', 'compare', 'math', 'logic', 'random'].includes(s.name)]
]

// The panel words, in the menu's own group (menuItems): [kind, verb, label].
const PANELS_GROUP = 'panels'
// The menu groups drawn with an icon (catalog ids).
const GROUP_ICON = { cutscene: 'graphgroup.cutscene', camera: 'graphgroup.camera', maps: 'graphgroup.maps', panels: 'graphgroup.panels', board: 'graphgroup.note' }
// What using each kind of widget is called.
const USED = { button: 'pressed', toggle: 'flipped', slider: 'moved', select: 'chosen' }
/** A doc's first sentence, for a line under a menu entry. */
const firstSentence = (d) => { const m = /^(.+?[.!?])(\s|$)/.exec(String(d).replace(/\s+/g, ' ')); return (m ? m[1] : String(d)).slice(0, 140) }
const PANEL_ITEMS = [
  ['event', 'on_ui_event', 'when a panel is used'],
  ['condition', 'widget_is', 'if it was this widget …'],
  ['action', 'ui_open', 'open a panel'],
  ['action', 'ui_close', 'close a panel']
]

let win = null
/**
 * @param arg  a graph's address (graphs_emit.js graphRoute): `game[:name]`
 *             for one of the module's, `<map>[:name]` (or nothing) for one of
 *             the map being edited; without a name, that scope's first.
 */
export function openGraph (S, arg = null) {
  win ??= new GraphWindow(S)
  const to = parseGraphRoute(arg)
  const scope = to.scope
  const owner = scope === 'game' ? S.module : S.doc
  const name = to.name ?? graphsOf(owner)[0]?.[0] ?? (scope === 'game' ? GAME_NAME : MAP_GRAPH)
  const key = `${scope}:${scope === 'game' ? '' : S.docName}:${name}`
  if (key !== win.key) { win.picked = null; win.view = { x: 40, y: 40, z: 1 } }
  win.key = key
  win.scope = scope
  win.gname = name
  win.open()
  return win
}

class GraphWindow {
  constructor (S) {
    this.S = S
    this.view = { x: 40, y: 40, z: 1 }
    this.picked = null          // { kind: 'node', id } | { kind: 'link', index }
    this.pane = 'board'
    this.scope = 'map'
    this.gname = MAP_GRAPH
    this.root = el('div', { class: 'wk gw', 'data-pane': this.pane })
    this.root.hidden = true
    document.body.appendChild(this.root)
    document.head.appendChild(el('style', { text: STYLE }))
  }

  get gv () { return this.S.vocab.graph }
  get tv () { return this.S.vocab.trigger }
  get game () { return this.scope === 'game' }
  /** The map being edited, or the module: whose graphs these are. */
  get owner () { return this.game ? this.S.module : this.S.doc }
  get graph () { return this.owner.graphs?.[this.gname] }
  /** The graph, made when the first node or variable is added. */
  ensure () { const o = this.owner; o.graphs ??= {}; return (o.graphs[this.gname] ??= newGraph()) }

  // The words this scope may use: the game hears and does only graph_vocab's
  // `game` lists; a level hears everything but the players' coming and going.
  get events () {
    if (this.game) return (this.gv.game?.events ?? []).map((name) => ({ name }))
    return this.tv.events.filter((e) => !['on_player_enter', 'on_player_leave'].includes(e.name))
  }

  verbs (kind) {
    const list = kind === 'condition' ? this.tv.conditions : this.tv.actions
    if (!this.game) return list
    const ok = new Set(this.gv.game?.[kind === 'condition' ? 'conditions' : 'actions'] ?? [])
    return list.filter((v) => ok.has(v.name))
  }

  /** Where ‹ goes: the map this graph is of, or the list of graphs. */
  back () {
    if (!this.S.go) return this.close()
    return this.game ? this.S.go('graphs') : this.S.go('map', this.S.docName)
  }

  open () {
    // Sent here to look at one node (from the Panels window's list of uses).
    if (this.S.graphFocus) {
      const n = this.graph?.nodes.find((x) => x.id === this.S.graphFocus)
      if (n) { this.picked = { kind: 'node', id: n.id }; this.view = { x: 60 - (n.pos?.x ?? 0), y: 60 - (n.pos?.y ?? 0), z: 1 } }
      this.S.graphFocus = null
    }
    this.root.hidden = false
    this.S.ui.layer.dataset.workshop = '1'
    this.S.ui.hideSheet()
    this.render()
  }

  close () {
    this.root.hidden = true
    this.S.ui.layer.dataset.workshop = '0'
  }

  /** A change: to the map's document (undone with the map, re-baked) or the module's. */
  changed ({ redraw = true } = {}) {
    // An empty graph is kept -- it has a name someone gave it -- and simply
    // not written (graphs_emit.js liveGraphs).
    if (this.game) this.S.moduleChanged(); else this.S.commit()
    if (redraw) this.render()
  }

  /**
   * Play the run from the picked node -- or, with none, from the first start
   * node that reaches a cutscene or a camera node -- over the map (scene.js),
   * timed as the engine times it, and come back here after.
   */
  playScene () {
    const g = this.graph
    if (!g?.nodes.length) return
    const specs = nodeSpecs(this.gv)
    const cine = (n) => ['cinematic', 'camera'].includes(specs.get(n.type)?.category)
    const reaches = (id, seen = new Set()) => {
      if (seen.has(id)) return false
      seen.add(id)
      const n = g.nodes.find((x) => x.id === id)
      if (n && cine(n)) return true
      return g.links.filter(([f]) => f.startsWith(`${id}.`)).some(([, t]) => reaches(t.slice(0, t.lastIndexOf('.')), seen))
    }
    const picked = this.picked?.kind === 'node' ? g.nodes.find((n) => n.id === this.picked.id) : null
    const start = picked ?? g.nodes.find((n) => isStart(n) && reaches(n.id)) ?? g.nodes.find((n) => isStart(n)) ?? g.nodes[0]
    this.root.hidden = true
    this.scene = playScene(this.S, g, start.id, { onEnd: () => { this.scene = null; this.open() } })
  }

  /** Switch to another of this scope's graphs, or make one. */
  async pickGraph (name) {
    if (name === '\u0000new') {
      const taken = new Set(graphsOf(this.owner).map(([n]) => n))
      const raw = await ask('graph name (letters, digits, underscore)', '')
      const n = cleanGraphName(raw)
      if (!n) { this.render(); return }
      if (taken.has(n)) { this.S.status(`there is a graph called ${n} here already`, 'warn'); this.render(); return }
      this.gname = n
      this.ensure()
      this.changed({ redraw: false })
    } else this.gname = name
    this.picked = null
    this.view = { x: 40, y: 40, z: 1 }
    this.key = `${this.scope}:${this.game ? '' : this.S.docName}:${this.gname}`
    // The address follows, so a reload comes back here.
    if (this.S.go) await this.S.go('graph', graphRoute(this.scope, this.S.docName, this.gname))
    this.render()
  }

  /** Rename this graph: its name is its identity in its VM, and its file's. */
  rename (raw) {
    const n = cleanGraphName(raw)
    const o = this.owner
    if (!n || n === this.gname) { this.render(); return }
    if (!NAME_RE.test(n) || o.graphs?.[n]) { this.S.status('that name is empty or taken here', 'warn'); this.render(); return }
    // Kept in its place in the order.
    o.graphs = Object.fromEntries(Object.entries(o.graphs ?? {}).map(([k, v]) => [k === this.gname ? n : k, v]))
    if (!o.graphs[n]) o.graphs[n] = newGraph()
    this.gname = n
    this.key = `${this.scope}:${this.game ? '' : this.S.docName}:${n}`
    this.changed()
  }

  /**
   * Run a pick on the map with this window out of the way: the map is under
   * the page, so the page steps aside while a room, a wall, a point or a thing
   * is tapped, and comes back after.
   */
  aroundPick (start) {
    const page = this.S.shell?.page
    this.root.hidden = true
    if (page) { page.hidden = true; this.S.ui.layer.dataset.page = '0' }
    this.S.ui.layer.dataset.workshop = '0'
    return start().then((hit) => {
      if (page) { page.hidden = false; this.S.ui.layer.dataset.page = '1' }
      this.open()
      return hit
    })
  }

  pickOnMap (kinds, prompt) { return this.aroundPick(() => this.S.pickInViewport(kinds, prompt)) }

  /** What a node's fields are edited with, on the board and in the side panel alike. */
  fieldCtx () {
    const S = this.S
    const g = this.graph ?? { vars: {} }
    return {
      onChange: () => this.changed(), status: (m, l) => S.status(m, l),
      // The game's graph is of no map: nothing to tap.
      ...(S.mapPickers && !this.game ? S.mapPickers((f) => this.aroundPick(f)) : {}),
      triggers: this.game ? [] : S.doc.triggers.map((t) => ({ id: t.id, name: t.name })),
      mobs: Object.keys(S.module.mobs?.mobs ?? {}), props: S.propNames?.() ?? [],
      vars: Object.keys(g.vars ?? {}), suggest: (a, o) => S.suggest?.(a, o) ?? null, soundField: S.soundField,
      // The map's camera paths, by tag, with their lengths: what a camera node rides.
      ...(this.game ? {} : {
        paths: () => [...new Set((S.doc.paths ?? []).map((p) => p.tag))].sort((a, b) => a - b).map((tag) => {
          const p = S.doc.paths.find((x) => x.tag === tag)
          return { tag, length: S.pathCurve?.(p)?.length ?? null, points: p.points.length }
        }),
        editPath: (tag) => {
          const p = (S.doc.paths ?? []).find((x) => x.tag === tag)
          this.close()
          S.go('map').then(() => { S.showCamera?.(); if (p) S.editPath?.(p.id) })
        }
      }),
      ...(S.panelCtx?.() ?? {}),
      // A button node's button: the engine's, then the module's keys (Controls).
      buttons: () => ({ engine: ENGINE_BUTTON_NAMES.map((n) => [n, n]), keys: (S.module.keys ?? []).filter((k) => k.name).map((k) => [k.name, `${k.name} (${keyLabel(k.code)})`]) }),
      editKeys: () => S.go('controls'),
      // The module's maps, and the spawn points of one (or of this map).
      maps: () => Object.keys(S.docs).sort(),
      spawnsOf: (map) => [...new Set(((map ? S.docs[map] : S.doc)?.spawns ?? []).map((p) => p.tag).filter(Boolean))].sort()
    }
  }

  render () {
    const S = this.S
    if (!this.gv) {
      this.root.replaceChildren(el('div', { class: 'wk-top' }, [el('span', { class: 'wk-title' }, withIcon('section.graphs', 'graph')), button(withIcon('action.back', 'back'), () => this.back())]),
        el('div', { class: 'wk-details' }, [muted('No graph vocabulary staged with this studio (graph_vocab.json).')]))
      return
    }
    const problems = graphProblems(this.graph, this.gv, this.tv, { buttons: buttonNames(this.S.module), panels: this.S.module.panels ?? {}, game: this.game, maps: Object.keys(S.docs), paths: this.game ? null : new Set((S.doc.paths ?? []).map((p) => p.tag)) })
    this.root.dataset.scope = this.scope
    const top = el('div', { class: 'wk-top' }, [
      el('span', { class: 'wk-title' }, withIcon('section.graphs', this.game ? 'the game' : S.docName)),
      this.#graphPicker(),
      this.#palette(),
      el('div', { class: 'wk-tabs gw-panes' }, [['board', 'board'], ['details', 'details'], ['variables', null, 'action.variable']].map(([v, l, i]) =>
        el('button', { 'data-pane-tab': v, 'data-on': (v === 'variables' ? this.pane === 'details' && this.side === 'variables' : this.pane === v && !(v === 'details' && this.side === 'variables')) ? '1' : '0',
          onclick: () => { this.pane = v === 'variables' ? 'details' : v; if (v !== 'board') this.side = v; this.root.dataset.pane = this.pane; this.render() } }, i ? withIcon(i, l) : [l]))),
      this.graph?.nodes.length ? button(withIcon('transport.play', 'scene'), () => this.playScene(), 'gw-play') : null,
      el('span', { style: 'flex:1' }),
      problems.length ? el('span', { class: 'st-danger', text: `${problems.length} problem${problems.length > 1 ? 's' : ''}` }) : null,
      button(withIcon('action.back', this.game ? 'graphs' : 'map'), () => this.back())
    ].filter(Boolean))

    const board = el('div', { class: 'wk-board gw-board' })
    const world = el('div', { class: 'wk-world' })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'wk-edges')
    // Arrowheads, so which way a link runs is never in doubt.
    svg.innerHTML = '<defs>' + [['exec', 'wire-exec'], ['data', 'wire-data'], ['on', 'wire-selected']].map(([k, c]) =>
      `<marker id="gw-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--cv-graph-${c})"/></marker>`).join('') + '</defs>'
    world.appendChild(svg)
    board.appendChild(world)
    this.world = world
    this.svg = svg
    this.nodeEls = new Map()
    const specs = nodeSpecs(this.gv)
    // NOTES behind everything, links included: a labelled box round a part of
    // the board (graph.notes, written to the file's meta, never run).
    for (const note of this.graph?.notes ?? []) world.insertBefore(this.#noteEl(note), svg)
    this.#pruneBends()
    for (const n of this.graph?.nodes ?? []) world.appendChild(this.#nodeEl(n, specs.get(n.type), problems))
    this.#applyView()
    this.#boardGestures(board)
    board.appendChild(this.#zoomBar(board))

    const side = el('div', { class: 'wk-details' }, this.#sideRows(problems))
    this.root.replaceChildren(top, el('div', { class: 'wk-graph' }, [board]), side)
    requestAnimationFrame(() => this.#drawLinks())
  }

  /** This scope's graphs, by name, and a new one. */
  #graphPicker () {
    const names = graphsOf(this.owner).map(([n]) => n)
    if (!names.includes(this.gname)) names.push(this.gname)
    const sel = el('select', { class: 'gw-graphs', 'data-graphs': '1' }, [...names.map((n) => el('option', { value: n, text: `${n}${n === this.gname && !this.graph ? ' (new)' : ''}` })), el('option', { value: '\u0000new', text: '+ new graph…' })])
    sel.value = this.gname
    sel.addEventListener('change', () => this.pickGraph(sel.value))
    return sel
  }

  // --- adding ---------------------------------------------------------------------

  /**
   * Everything the + node menu offers, in its groups: [{ group, value, label, doc }].
   * The world's nodes by graph_vocab category, then flow and data; the
   * panels -- the engine's panel nodes when it has them, and the trigger
   * words a panel is opened, closed and answered with, ready-made per panel
   * and per widget; and every trigger event, condition and action by name.
   * `doc` is the vocabulary's own description, which the search reads too.
   */
  menuItems () {
    const out = []
    const push = (group, value, label, doc = '') => out.push({ group, value, label, doc: doc ?? '' })
    // The game has no level: what needs one is not offered there.
    const specs = this.gv.nodes.filter((n) => !['event', 'condition', 'action'].includes(n.name) && !(this.game && n.level_only))
    const taken = new Set()
    const words = (n) => n.name.replace(/_/g, ' ')
    // The engine's panel nodes are the panels group's, start nodes included.
    const panelNodes = specs.filter((x) => x.category === 'panel')
    for (const n of panelNodes) taken.add(n.name)
    for (const [label, test] of MENU) {
      for (const n of specs.filter((x) => !taken.has(x.name) && test(x))) { taken.add(n.name); push(label, `node:${n.name}`, words(n), n.doc) }
      // EVERY TICK, beside "every N seconds": the trigger runtime's on_tick
      // (and on_post_tick, after the world steps), said as a start.
      if (label === 'when …') {
        if (this.events.some((e) => e.name === 'on_tick')) push(label, 'event:on_tick', 'every tick', 'Every tick of the game, 60 a second, before the world moves: a run each time, so keep what it does small. For a slower beat, every N seconds.')
        if (this.events.some((e) => e.name === 'on_post_tick')) push(label, 'event:on_post_tick', 'every tick, after the world moves', 'Every tick, 60 a second, once the world has moved and positions are final: to read where things ended up.')
      }
    }
    // THE PANELS. The engine's own panel nodes (docs/PANELS.md §3) first, the
    // moment graph_vocab has them; then the trigger words, ready-made.
    for (const n of panelNodes) push(PANELS_GROUP, `node:${n.name}`, words(n), n.doc)
    const has = (kind, name) => kind === 'event' ? this.events.some((e) => e.name === name) : this.verbs(kind).some((v) => v.name === name)
    const panels = this.S.module.panels ?? {}
    const node = (name) => panelNodes.find((x) => x.name === name)
    if (node('open_panel')) {
      // THE ENGINE'S PANEL NODES, one entry per panel and per widget, filled in.
      for (const [p, q] of Object.entries(panels)) {
        push(PANELS_GROUP, `node:open_panel:${p}`, `open ${p}`, node('open_panel').doc)
        if (node('close_panel')) push(PANELS_GROUP, `node:close_panel:${p}`, `close ${p}`, node('close_panel').doc)
        if (node('when_panel_closed')) push(PANELS_GROUP, `node:when_panel_closed:${p}`, `when ${p} is closed`, node('when_panel_closed').doc)
        if (node('panel_is_open')) push(PANELS_GROUP, `node:panel_is_open:${p}`, `is ${p} open?`, node('panel_is_open').doc)
        for (const w of q.widgets ?? []) {
          const wn = w.name ?? w.label
          if (w.kind !== 'label') {
            if (node('when_panel_used')) push(PANELS_GROUP, `node:when_panel_used:${p}:${wn}`, `when ${p} › ${wn} is ${USED[w.kind] ?? 'used'}`, node('when_panel_used').doc)
            if (node('set_widget') && w.kind !== 'button') push(PANELS_GROUP, `node:set_widget:${p}:${wn}`, `set ${p} › ${wn}`, node('set_widget').doc)
          }
          // Any widget, a label too, can be shown and hidden.
          for (const t of ['show_element', 'hide_element']) if (node(t)) push(PANELS_GROUP, `node:${t}:${p}:${wn}`, `${t === 'show_element' ? 'show' : 'hide'} ${p} › ${wn}`, node(t).doc)
        }
        // Its decor (a bar, a text, a picture), by id: `#` marks one in the entry.
        for (const d of decorIdsOf(q)) {
          for (const t of ['show_element', 'hide_element']) if (node(t)) push(PANELS_GROUP, `node:${t}:${p}:#${d}`, `${t === 'show_element' ? 'show' : 'hide'} ${p} › ${d} (decor)`, node(t).doc)
        }
      }
      return this.#menuRest(out, push, specs, taken)
    }
    for (const [kind, name, text] of PANEL_ITEMS) if (has(kind, name)) push(PANELS_GROUP, `${kind === 'event' ? 'event' : kind === 'condition' ? 'cond' : 'act'}:${name}`, text, this.#verbDoc(kind, name))
    // A widget's id is its panel's, so two panels can share one: said, as
    // widget_is cannot tell them apart (the engine's when_panel_used will).
    const idCount = new Map()
    for (const q of Object.values(panels)) for (const w of q.widgets ?? []) if (w.kind !== 'label') idCount.set(w.id, (idCount.get(w.id) ?? 0) + 1)
    for (const [p, q] of Object.entries(panels)) {
      if (has('action', 'ui_open')) push(PANELS_GROUP, `act:ui_open:${p}`, `open ${p}`, `Open the panel ${p} for the player the run started from.`)
      if (has('action', 'ui_close')) push(PANELS_GROUP, `act:ui_close:${p}`, `close ${p}`, `Close the panel ${p} this level opened for that player.`)
      if (!has('event', 'on_ui_event') || !has('condition', 'widget_is')) continue
      for (const w of q.widgets ?? []) {
        if (w.kind === 'label') continue
        const shared = idCount.get(w.id) > 1
        push(PANELS_GROUP, `ui:${p}:${w.id}`, `when ${p} › ${w.name ?? w.label} is ${USED[w.kind] ?? 'used'}${shared ? ` (id ${w.id}, shared)` : ''}`,
          `A panel event, then "if it was widget ${w.id}" -- the ${w.kind} ${w.name ?? w.label} on ${p}.${shared ? ` Another panel has a widget ${w.id} too, and widget_is cannot tell them apart.` : ''}`)
      }
    }
    return this.#menuRest(out, push, specs, taken)
  }

  /** The menu after the panels: the rest of the nodes, a note, and the trigger words. */
  #menuRest (out, push, specs, taken) {
    for (const n of specs.filter((x) => !taken.has(x.name))) push('other', `node:${n.name}`, n.name.replace(/_/g, ' '), n.doc)
    push('board', 'note:', 'a note', 'A labelled box on the board, round the picked node if there is one: what this part of the graph is for. Drag its title and the nodes inside go with it. Never run.')
    // The trigger vocabulary's own words, each by name, for what the world's nodes do not say.
    for (const e of this.events) push('trigger words', `event:${e.name}`, `when ${e.name.replace(/^on_/, '').replace(/_/g, ' ')}`, this.#verbDoc('event', e.name))
    for (const c of this.verbs('condition')) push('trigger words', `cond:${c.name}`, `if ${c.name.replace(/_/g, ' ')}`, c.doc)
    for (const v of this.verbs('action')) push('trigger words', `act:${v.name}`, `do ${v.name.replace(/_/g, ' ')}`, v.doc)
    return out
  }

  #verbDoc (kind, name) {
    const list = kind === 'event' ? this.tv.events : kind === 'condition' ? this.tv.conditions : this.tv.actions
    return list.find((v) => v.name === name)?.doc ?? ''
  }

  /** The + node button, and the menu it opens: a search over menuItems, by group. */
  #palette () {
    const b = el('button', { class: 'gw-palette', text: '+ node…', 'data-menu': '1', onclick: (e) => { e.stopPropagation(); this.#openMenu() } })
    return b
  }

  #openMenu () {
    this.#closeMenu()
    const items = this.menuItems()
    const input = el('input', { type: 'search', class: 'gw-menu-find', placeholder: 'find a node: open, fog, damage, panel…', autocomplete: 'off' })
    const list = el('div', { class: 'gw-menu-list' })
    const menu = el('div', { class: 'gw-menu', role: 'dialog' }, [el('div', { class: 'gw-menu-top' }, [input, button(withIcon('action.close'), () => this.#closeMenu())]), list])
    let shown = []
    const draw = () => {
      const q = input.value.trim().toLowerCase().split(/\s+/).filter(Boolean)
      // Every word must appear in the label, the group or the name -- or start
      // a word of the description ("light" is not found in "flight").
      const esc = (w) => w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      shown = items.filter((it) => {
        const hay = `${it.label} ${it.group} ${it.value}`.toLowerCase()
        return q.every((w) => hay.includes(w) || new RegExp(`(^|[^a-z0-9_])${esc(w)}`, 'i').test(it.doc))
      })
      // A label match first: "open" finds "open door" before a doc that says open.
      if (q.length) shown.sort((x, y) => (q.every((w) => y.label.toLowerCase().includes(w)) ? 1 : 0) - (q.every((w) => x.label.toLowerCase().includes(w)) ? 1 : 0))
      const rows = []
      let last = null
      for (const it of shown) {
        if (!q.length && it.group !== last) { rows.push(el('div', { class: 'gw-menu-group' }, GROUP_ICON[it.group] ? withIcon(GROUP_ICON[it.group], it.group) : [it.group])); last = it.group }
        rows.push(el('button', { class: 'gw-menu-item', 'data-value': it.value, onclick: () => { this.#closeMenu(); this.addFrom(it.value) } }, [
          el('span', { class: 'gw-menu-label', text: it.label }),
          q.length ? el('span', { class: 'gw-menu-in', text: it.group }) : null,
          it.doc ? el('span', { class: 'gw-menu-doc', text: firstSentence(it.doc) }) : null].filter(Boolean)))
      }
      if (!shown.length) rows.push(muted('Nothing by that name. Try a shorter word.'))
      list.replaceChildren(...rows)
    }
    input.addEventListener('input', draw)
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' && shown[0]) { e.preventDefault(); this.#closeMenu(); this.addFrom(shown[0].value) }
      if (e.key === 'Escape') this.#closeMenu()
    })
    draw()
    this.root.appendChild(menu)
    this.menu = menu
    // A tap anywhere else closes it.
    this.menuAway = (e) => { if (!menu.contains(e.target) && !e.target.closest?.('[data-menu]')) this.#closeMenu() }
    setTimeout(() => document.addEventListener('pointerdown', this.menuAway), 0)
    // Not on a phone's first tap: the keyboard would cover the list.
    if (matchMedia('(pointer: fine)').matches) input.focus()
  }

  #closeMenu () {
    this.menu?.remove(); this.menu = null
    if (this.menuAway) document.removeEventListener('pointerdown', this.menuAway)
    this.menuAway = null
  }

  /**
   * Add what a menu entry names, at a free spot: `node:<type>`,
   * `event:<name>`, `cond:<name>`, `act:<name>[:<panel>]`, or
   * `ui:<panel>:<widget id>` (a panel event and its widget_is, linked).
   */
  addFrom (value) {
    const [kind, name, arg, arg2] = String(value).split(':')
    const g = this.ensure()
    if (kind === 'note') return this.addNote()
    const at = this.#freeSpot()
    if (kind === 'ui') {
      const ev = { id: this.#newId(`${name}_used`), type: 'event', event: 'on_ui_event', pos: { x: at.x, y: at.y } }
      g.nodes.push(ev)
      const cond = { id: this.#newId(`if_${name}_${arg}`), type: 'condition', c: 'widget_is', widget: Number(arg), pos: { x: at.x + NODE_W + 40, y: at.y } }
      g.nodes.push(cond)
      g.links.push([`${ev.id}.then`, `${cond.id}.in`])
      this.picked = { kind: 'node', id: cond.id }
      this.changed()
      return cond.id
    }
    const id = this.#newId(kind === 'event' ? name.replace(/^on_/, '')
      : kind === 'node' ? (arg ? [name.replace(/^when_panel_/, '').replace(/_panel$/, '').replace(/_element$/, ''), arg, arg2?.replace(/^#/, '')].filter(Boolean).join('_').replace(/[^A-Za-z0-9_]/g, '_') : name.replace(/^when_/, ''))
        : kind === 'cond' ? (name ? `if_${name}` : 'if') : (arg ? `${name.replace(/^ui_/, '')}_${arg}` : name || 'do'))
    const n = { id, pos: { x: at.x, y: at.y } }
    if (kind === 'event') Object.assign(n, { type: 'event', event: name })
    else if (kind === 'cond') Object.assign(n, { type: 'condition', c: name || this.verbs('condition')[0]?.name })
    else if (kind === 'act') Object.assign(n, name ? { type: 'action', a: name } : { type: 'action', a: 'log', text: 'hello' })
    else {
      n.type = name
      if (name === 'sequence') n.count = 2
      if (name === 'delay') n.ticks = 60
      if (name === 'random') Object.assign(n, { lo: 1, hi: 6 })
      if (name === 'compare') n.op = '=='
      if (name === 'math') n.op = '+'
      if (name === 'logic') n.op = 'and'
      if (name === 'literal') n.value = 0
      // A var node starts on the graph's first variable, else on hp, which every node may use.
      if (VAR_NODES.includes(name)) n.var = Object.keys(g.vars ?? {})[0] ?? (propertiesOf(this.gv).has('hp') ? 'hp' : 'count')
      if (name === 'call') Object.assign(n, { to: this.game ? 'level' : 'game', name: this.S.callNames?.()[0] ?? 'hello' })
      if (name === 'on_call') n.name = this.S.callNames?.()[0] ?? 'hello'
      if (name === 'log' || (kind === 'act' && !name)) n.text ??= 'hello'
      this.#defaults(n, nodeSpecs(this.gv).get(name))
    }
    if (kind === 'act' && name === 'log') n.text ??= 'hello'
    // A panel verb (or the engine's panel node) starts on the panel named, else the module's first.
    if ((kind === 'act' && (name === 'ui_open' || name === 'ui_close')) || (kind === 'node' && nodeSpecs(this.gv).get(name)?.args?.some((x) => x.name === 'panel'))) {
      const p = arg ?? Object.keys(this.S.module.panels ?? {})[0]
      if (p) n.panel = p
      if (arg2?.startsWith('#')) n.decor = arg2.slice(1)
      else if (arg2) n.widget = arg2
    }
    g.nodes.push(n)
    this.picked = { kind: 'node', id }
    this.changed()
    return id
  }

  /**
   * A new world node's required arguments, where one value is the obvious
   * start: the first of an enum's choices, a few seconds, the first monster.
   * What only the map can say -- a spot, a wall -- is left to be picked.
   */
  #defaults (n, spec) {
    for (const a of spec?.args ?? []) {
      if (a.optional || n[a.name] !== undefined) continue
      if (a.type === 'enum' && a.values?.length) n[a.name] = a.values[0]
      else if (a.name === 'seconds') n[a.name] = n.type === 'every' ? 5 : 3
      else if (a.name === 'what') { const m = Object.keys(this.S.module.mobs?.mobs ?? {})[0]; if (m) n[a.name] = m }
    }
    if (n.type === 'move_floor' || n.type === 'move_ceiling') n.amount ??= 4
  }

  /** A node and every link to or from it. */
  /**
   * A var node's `var`: the graph's own variables, then the entity's
   * properties this node may use (set and add: settable ones; add: numbers),
   * grouped. A name that is neither stays, said as such.
   */
  #varRow (n) {
    const choices = varChoices(this.graph, this.gv, n.type)
    const sel = el('select', { class: 'gw-pick gw-var', 'data-var': '1' })
    const groups = new Map()
    for (const c of choices) {
      if (!groups.has(c.group)) { const og = el('optgroup', { label: c.group }); groups.set(c.group, og); sel.appendChild(og) }
      groups.get(c.group).appendChild(el('option', { value: c.value, text: c.label, title: c.doc }))
    }
    if (n.var !== undefined && !choices.some((c) => c.value === n.var)) sel.prepend(el('option', { value: n.var, text: `${n.var} -- not one this node can use` }))
    if (!choices.length) sel.appendChild(el('option', { value: '', text: '(no variables yet)' }))
    sel.value = n.var ?? ''
    sel.addEventListener('change', () => { n.var = sel.value; this.changed() })
    return el('div', { class: 'st-row' }, [el('label', { text: 'variable' }), sel])
  }

  /** A get, set or add of `name`, dropped in at a free spot. */
  addVarNode (type, name) {
    const id = this.addFrom(`node:${type}`)
    const n = this.graph.nodes.find((x) => x.id === id)
    n.var = name
    const fresh = this.#newId(`${type.replace('_var', '')}_${name}`)
    if (fresh !== n.id && !this.graph.links.some(([f, t]) => f.startsWith(`${n.id}.`) || t.startsWith(`${n.id}.`))) n.id = fresh
    this.picked = { kind: 'node', id: n.id }
    this.changed()
    return n.id
  }

  /**
   * THE VARIABLES PANE: what a graph's get, set and add can name -- its own
   * variables (made and given a start here), then every property of an
   * entity (graph_vocab.properties), each with its type, whether a graph may
   * set it, what it is, and a button to drop the node that uses it.
   */
  #varsPane () {
    const g = this.graph
    const props = this.gv.properties ?? []
    const q = (this.varFilter ?? '').trim().toLowerCase()
    const hit = (name, doc) => !q || q.split(/\s+/).every((w) => name.toLowerCase().includes(w) || (doc ?? '').toLowerCase().includes(w))
    const find = el('input', { type: 'search', class: 'gw-var-find', placeholder: 'find: hp, speed, jump…', value: this.varFilter ?? '' })
    find.addEventListener('input', () => { this.varFilter = find.value; const pos = find.selectionStart; this.#drawSide(); const f = this.root.querySelector('.gw-var-find'); f?.focus(); f?.setSelectionRange(pos, pos) })
    const drop = (type, name, ok = true) => ok ? button(type.replace('_var', ''), () => this.addVarNode(type, name), 'gw-var-drop') : null
    const rows = [find]
    // The graph's own, each with its start and a node away.
    rows.push(...this.#varsRows((k) => [drop('get_var', k), drop('set_var', k), drop('add_var', k)]))
    if (!props.length) {
      rows.push(muted('This engine lets a graph name only its own variables.'))
      return rows
    }
    for (const [of, title, note] of [
      ['entity', 'the entity', 'Its own facts: the event\'s entity, or the one linked to a node\'s entity input.'],
      ['movement', 'its movement rules', 'How it moves (docs/PLAYER.md). Set on a player, a rule lasts as an effect a later set replaces; on anything else it is its body\'s.']]) {
      const list = props.filter((p) => p.of === of && hit(p.name, p.doc))
      if (!list.length) continue
      rows.push(el('div', { class: 'st-section-head', text: `${title} (${list.length})` }), muted(note))
      for (const p of list) {
        rows.push(addHelp(el('div', { class: 'st-row gw-var-row', 'data-prop': p.name }, [
          el('span', { class: 'st-entry', text: p.name }),
          el('span', { class: 'gw-var-type', text: `${p.type}${p.access === 'read' ? ' · read only' : ''}` }),
          el('span', { style: 'flex:1 1 auto' }),
          drop('get_var', p.name), drop('set_var', p.name, propertyFits('set_var', p)), drop('add_var', p.name, propertyFits('add_var', p))
        ].filter(Boolean)), p.doc))
      }
    }
    return rows
  }

  /** The side panel: a node's details, or the variables. */
  #drawSide () {
    const side = this.root.querySelector('.wk-details')
    if (!side) return
    const problems = graphProblems(this.graph, this.gv, this.tv, { buttons: buttonNames(this.S.module), panels: this.S.module.panels ?? {}, game: this.game, maps: Object.keys(this.S.docs), paths: this.game ? null : new Set((this.S.doc.paths ?? []).map((p) => p.tag)) })
    side.replaceChildren(...this.#sideRows(problems))
  }

  #sideRows (problems) {
    const tabs = el('div', { class: 'wk-tabs gw-side-tabs' }, [['details', 'details'], ['variables', 'variables', 'action.variable']].map(([v, l, i]) =>
      el('button', { 'data-side': v, 'data-on': (this.side ?? 'details') === v ? '1' : '0', onclick: () => { this.side = v; this.#drawSide() } }, i ? withIcon(i, l) : [l])))
    return [tabs, ...((this.side ?? 'details') === 'variables' ? this.#varsPane() : this.#details(problems))]
  }

  /** A node's description: its verb's for an event, condition or action, else its type's. */
  #nodeDoc (n, spec) {
    if (n.type === 'event') return this.#verbDoc('event', n.event) || spec?.doc || ''
    if (n.type === 'condition') return this.#verbDoc('condition', n.c) || spec?.doc || ''
    if (n.type === 'action') return this.#verbDoc('action', n.a) || spec?.doc || ''
    return spec?.doc ?? ''
  }

  #deleteNode (n) {
    const g = this.graph
    if (!g) return
    g.nodes.splice(g.nodes.indexOf(n), 1)
    g.links = g.links.filter(([f, t]) => !f.startsWith(`${n.id}.`) && !t.startsWith(`${n.id}.`))
    if (this.picked?.kind === 'node' && this.picked.id === n.id) this.picked = null
    this.changed()
  }

  #newId (base) {
    const ids = new Set((this.graph?.nodes ?? []).map((n) => n.id))
    const b = String(base).replace(/[^a-z0-9_]/gi, '_') || 'node'
    if (!ids.has(b)) return b
    let i = 2
    while (ids.has(`${b}${i}`)) i++
    return `${b}${i}`
  }

  /** Below everything, so a new node never lands on top of another. */
  #freeSpot () {
    const nodes = this.graph?.nodes ?? []
    if (!nodes.length) return { x: 0, y: 0 }
    const sel = this.picked?.kind === 'node' ? nodes.find((n) => n.id === this.picked.id) : null
    if (sel) return { x: (sel.pos?.x ?? 0) + NODE_W + 50, y: sel.pos?.y ?? 0 }
    return { x: Math.min(...nodes.map((n) => n.pos?.x ?? 0)), y: Math.max(...nodes.map((n) => n.pos?.y ?? 0)) + 150 }
  }

  // --- the board ------------------------------------------------------------------

  #summary (n) {
    if (n.type === 'event') return n.event ?? '?'
    if (n.type === 'condition') return `${n.negate ? 'not ' : ''}${n.c ?? '?'}`
    if (n.type === 'action') return n.a ?? '?'
    if (n.type === 'delay') return `${n.ticks ?? '?'} ticks`
    if (['get_var', 'set_var', 'add_var'].includes(n.type)) return `${n.var ?? '?'}${n.value !== undefined && n.type !== 'get_var' ? ` ${n.type === 'add_var' ? '+=' : '='} ${n.value}` : ''}`
    if (n.type === 'literal') return JSON.stringify(n.value)
    if (['compare', 'math', 'logic'].includes(n.type)) return `a ${n.op ?? '?'} b`
    if (n.type === 'random') return `${n.lo ?? '?'}..${n.hi ?? '?'}`
    if (n.type === 'call') return `${n.name ?? '?'} → ${n.to ?? '?'}`
    if (n.type === 'on_call') return n.name ?? '?'
    return ''
  }

  #nodeEl (n, spec, problems) {
    const p = pinsOf(n, spec, this.tv, this.gv)
    const bad = problems.some((m) => m.startsWith(`node '${n.id}'`))
    const on = this.picked?.kind === 'node' && this.picked.id === n.id
    // A small ✕ to delete it where it is; undo brings it back.
    const del = el('button', { class: 'gw-del', title: `delete ${n.id}`, 'data-del': n.id, onclick: (e) => { e.stopPropagation(); this.#deleteNode(n) } }, [icon('action.close')])
    // What it does, a tap away: the vocabulary's own description, under the title.
    const docText = this.#nodeDoc(n, spec)
    this.docOpen ??= new Set()
    const docEl = docText ? el('div', { class: 'gw-doc', text: docText }) : null
    if (docEl) docEl.hidden = !this.docOpen.has(n.id)
    const info = docText ? el('button', { class: 'gw-info', title: docText, 'data-info': n.id, 'data-on': docEl.hidden ? '0' : '1', onclick: (e) => {
      e.stopPropagation()
      docEl.hidden = !docEl.hidden
      info.dataset.on = docEl.hidden ? '0' : '1'
      if (docEl.hidden) this.docOpen.delete(n.id); else this.docOpen.add(n.id)
      this.#drawLinks()
    } }, [icon('action.help')]) : null
    const head = el('div', { class: 'gw-head' }, [el('span', { class: 'gw-title' }, n.type === 'event' ? withIcon('trigger.event', n.id) : [n.id]), info, del].filter(Boolean))
    const body = el('div', { class: 'gw-body' })
    // A var node's entity input matters only for a property: dimmed for the graph's own variable.
    const idle = (name) => name === 'entity' && VAR_NODES.includes(n.type) && Object.prototype.hasOwnProperty.call(this.graph?.vars ?? {}, n.var ?? '')
    const pin = this.pin = (name, dir, kind) => {
      const d = el('div', { class: `gw-pin gw-${dir} gw-${kind}${dir === 'in' && idle(name) ? ' gw-pin-idle' : ''}`, 'data-pin': `${n.id}.${name}`, 'data-dir': dir, 'data-kind': kind, title: dir === 'in' && idle(name) ? 'only for a property: this is the graph\'s own variable' : '' },
        [el('span', { class: 'gw-dot', text: kind === 'exec' ? '▷' : '●' }), el('span', { class: 'gw-pname', text: name === 'in' || name === 'then' ? '' : name })])
      if (dir === 'out') this.#linkGesture(d)
      return d
    }
    // A verb argument's pin is in its field's row (#boardFields), not here.
    const ins = [...p.execIn.map((x) => pin(x, 'in', 'exec')), ...p.dataIn.filter((x) => !p.argPins.includes(x)).map((x) => pin(x, 'in', 'data'))]
    const outs = [...p.execOut.map((x) => pin(x, 'out', 'exec')), ...p.dataOut.map((x) => pin(x, 'out', 'data'))]
    body.append(el('div', { class: 'gw-col' }, ins), el('div', { class: 'gw-col gw-right' }, outs))
    const fields = this.#boardFields(n, spec, p.argPins)
    const node = el('div', { class: `gw-node gw-${categoryOf(n, spec)}${on ? ' gw-on' : ''}${bad ? ' wk-node-bad' : ''}`, 'data-node': n.id },
      [head, docEl, fields.length ? el('div', { class: 'gw-fields' }, fields) : el('div', { class: 'gw-sum', text: this.#summary(n) }), body].filter(Boolean))
    node.style.left = `${n.pos?.x ?? 0}px`
    node.style.top = `${n.pos?.y ?? 0}px`
    this.#nodeGesture(node, head, n)
    this.nodeEls.set(n.id, node)
    return node
  }

  /**
   * The node's own fields, on the board: what it is (the event, the condition,
   * the action) and the arguments it needs or already has -- the rest are in
   * the side panel. A change is a change to the map, as anywhere.
   */
  #current = null

  #boardFields (n, spec, argPins = []) {
    this.#current = n
    const ctx = this.fieldCtx()
    const linked = this.#linkedArgs(n)
    const out = []
    const pick = (label, value, options, onChange) => {
      const sel = el('select', { class: 'gw-pick' }, options.map(([v, t]) => el('option', { value: v, text: t })))
      sel.value = value ?? ''
      sel.addEventListener('change', () => onChange(sel.value))
      return el('div', { class: 'st-row' }, [el('label', { text: label }), sel])
    }
    // Required arguments, and optional ones once they have a value, a link,
    // or were asked onto the node (`show`, the editor's own).
    const on = (name) => n[name] !== undefined || linked.has(name) || n.show?.includes(name)
    // A place comes whole: x brought on brings its y and z, for one tap.
    const shown = (args) => (args ?? []).filter((a) => !a.optional || on(a.name) || ((a.name === 'y' || a.name === 'z') && on('x')))
    if (n.type === 'event') {
      out.push(pick('when', n.event, withCurrent(this.events.map((e) => [e.name, e.name]), n.event), (v) => { n.event = v; this.changed() }))
    } else if (n.type === 'condition' || n.type === 'action') {
      const key = n.type === 'condition' ? 'c' : 'a'
      const list = this.verbs(n.type)
      out.push(pick(n.type === 'condition' ? 'if' : 'do', n[key], withCurrent(list.map((x) => [x.name, x.name]), n[key]), (v) => {
        for (const k of Object.keys(n)) if (!['id', 'type', 'pos', 'negate'].includes(k)) delete n[k]
        this.#dropArgLinks(n)
        n[key] = v
        this.changed()
      }))
      if (n.c === 'side_is') {
        const v = n.side
        out.push(el('div', { class: 'st-row' }, [el('label', { text: 'side' }),
          button(v?.edge ? `wall ${v.edge}` : v?.edgeTwin ? `facing ${v.edgeTwin}` : withIcon('action.pick', 'tap a wall'), () => this.pickOnMap(['edge'], 'tap the wall').then((hit) => { n.side = { edge: hit.id }; this.changed() }))]))
      }
      const verb = this.tv[n.type === 'condition' ? 'conditions' : 'actions'].find((x) => x.name === n[key])
      if (verb) out.push(...this.#argRows(verb.args, shown, argPins, linked, (args) => argFields(args, n, ctx, HIDDEN_ARGS, n[key])))
    } else if (spec) {
      if (['get_var', 'set_var', 'add_var'].includes(n.type)) {
        out.push(this.#varRow(n))
        if (n.type !== 'get_var') out.push(this.#literalRow('value', n, 'value'))
      } else {
        out.push(...this.#argRows(spec.args, shown, argPins, linked, (args) => [
          // Places, rooms and walls together, so x, y and z are one tap.
          // A map is chosen from the module's (argform), not typed; other values are literals.
          ...argFields(args.filter((a) => a.type !== 'value' || a.name === 'level'), n, ctx, [], n.type),
          ...args.filter((a) => a.type === 'value' && a.name !== 'level').map((a) => { const r = this.#literalRow(a.name, n, a.name); r.dataset.arg = a.name; return r })
        ]))
      }
    }
    return out
  }

  /**
   * An entry's argument rows on the board: those `shown`, each pinnable one
   * with its data pin at the start of its row -- a linked one saying where its
   * value comes from instead of a control -- then the rest to bring on.
   */
  #argRows (args, shown, argPins, linked, make) {
    const n = this.#current
    // A number taken from a variable is not a field to type into: drawn as its own row below.
    const rows = this.#withBinding(n, shown(args), linked, make)
    for (const name of argPins) {
      if (!shown(args).some((a) => a.name === name)) continue
      let r = rows.find((x) => x.dataset?.arg === name)
      if (linked.has(name)) {
        const nr = el('div', { class: 'st-row gw-linked', 'data-arg': name }, [el('label', { text: name }), el('span', { class: 'gw-from' }, withIcon('action.left', `${linked.get(name)}`))])
        if (r) rows.splice(rows.indexOf(r), 1, nr); else rows.push(nr)
        r = nr
      }
      if (r) { r.classList.add('gw-argrow'); r.prepend(this.pin(name, 'in', 'data')) }
    }
    // The optional arguments not on the node, to bring one on.
    const more = (args ?? []).filter((a) => a.optional && !HIDDEN_ARGS.includes(a.name) && !shown([a]).length)
    if (more.length) {
      const sel = el('select', { class: 'gw-pick gw-more' }, [el('option', { value: '', text: `+ ${more.length} more…` }), ...more.map((a) => el('option', { value: a.name, text: a.name }))])
      sel.addEventListener('change', () => { if (!sel.value) return; n.show = [...(n.show ?? []), sel.value]; this.changed() })
      rows.push(el('div', { class: 'st-row' }, [sel]))
    }
    return rows
  }

  /** A form's argument rows with numbers from variables: bound ones as their own rows, 𝑥 on the rest. */
  #withBinding (n, args, linked, make) {
    const bindable = new Set(this.#bindable(n))
    const rows = make(args.filter((a) => !isVarRef(n[a.name])))
    for (const a of args) if (isVarRef(n[a.name]) && !linked.has(a.name)) rows.push(this.#boundRow(n, a.name))
    for (const r of rows) {
      const name = r.dataset?.arg
      if (name && bindable.has(name) && !linked.has(name) && !isVarRef(n[name]) && !r.querySelector('.gw-bind')) r.appendChild(this.#bindButton(n, name))
    }
    return rows
  }

  /** Which of a node's arguments can take a variable (numeric, with a data input). */
  #bindable (n) { return bindableArgs(n, nodeSpecs(this.gv).get(n.type), this.tv, this.gv) }

  /** 𝑥 beside a number: take it from a variable instead. */
  #bindButton (n, name) {
    return el('button', { class: 'gw-bind', type: 'button', icon: 'action.variable', title: `take ${name} from a variable`, 'data-bind': name, onclick: (e) => {
      e.stopPropagation()
      const first = numberSources(this.graph, this.gv)[0]
      if (!first) { this.S.status('no variable to take it from yet: make one in 𝑥 variables', 'warn'); this.side = 'variables'; this.#drawSide(); return }
      n[name] = { var: first.value }
      this.changed()
    } })
  }

  /** A number taken from a variable: which one, and ✕ back to a typed number. */
  #boundRow (n, name) {
    const sources = numberSources(this.graph, this.gv)
    const sel = el('select', { class: 'gw-pick gw-bound', 'data-bound': name })
    const groups = new Map()
    for (const c of sources) {
      if (!groups.has(c.group)) { const og = el('optgroup', { label: c.group }); groups.set(c.group, og); sel.appendChild(og) }
      groups.get(c.group).appendChild(el('option', { value: c.value, text: c.label, title: c.doc }))
    }
    const cur = n[name].var
    if (!sources.some((c) => c.value === cur)) sel.prepend(el('option', { value: cur, text: `${cur} -- no such variable` }))
    sel.value = cur
    sel.addEventListener('change', () => { n[name] = { var: sel.value }; this.changed() })
    return el('div', { class: 'st-row gw-bound-row', 'data-arg': name }, [el('label', {}, [`${name} `, icon('action.variable')]), sel,
      el('button', { class: 'gw-bind', type: 'button', icon: 'action.close', title: 'a typed number again', onclick: (e) => {
        e.stopPropagation()
        delete n[name]
        // Kept on the node, to type the number into (an optional one would otherwise go).
        n.show = [...new Set([...(n.show ?? []), name])]
        this.changed()
      } })])
  }

  /** The node's arguments a link feeds: name -> where from ("node.pin"). */
  #linkedArgs (n) {
    const out = new Map()
    for (const [f, t] of this.graph?.links ?? []) if (t.startsWith(`${n.id}.`)) out.set(t.slice(n.id.length + 1), f)
    return out
  }

  /** A verb changed: links into its old arguments' pins go with them. */
  #dropArgLinks (n) {
    const g = this.graph
    if (!g) return
    const keep = new Set(nodeSpecs(this.gv).get(n.type)?.data_in ?? [])
    g.links = g.links.filter(([, t]) => !t.startsWith(`${n.id}.`) || keep.has(t.slice(n.id.length + 1)) || ['in'].includes(t.slice(n.id.length + 1)))
  }

  #literalRow (label, n, key) {
    const i = el('input', { type: 'text', value: n[key] ?? '', placeholder: 'linked or typed' })
    i.addEventListener('change', () => { if (i.value === '') delete n[key]; else n[key] = literal(i.value); this.changed() })
    return el('div', { class: 'st-row' }, [el('label', { text: label }), i])
  }

  #applyView () {
    this.world.style.transform = `translate(${this.view.x}px, ${this.view.y}px) scale(${this.view.z})`
    if (this.zoomLabel) this.zoomLabel.textContent = `${Math.round(this.view.z * 100)}%`
  }

  /** Board pan and zoom: one finger or the mouse on empty board pans; pinch and wheel zoom. */
  #boardGestures (board) {
    const pts = new Map()
    let last = null
    let travel = 0
    board.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gw-node') || e.target.closest('.gw-link')) return
      board.setPointerCapture?.(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      last = null
      travel = 0
    })
    board.addEventListener('pointermove', (e) => {
      if (!pts.has(e.pointerId)) return
      const prev = pts.get(e.pointerId)
      pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
      travel += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y)
      if (pts.size === 1) {
        this.view.x += e.clientX - prev.x; this.view.y += e.clientY - prev.y
      } else if (pts.size === 2) {
        const [a, b] = [...pts.values()]
        const d = Math.hypot(a.x - b.x, a.y - b.y)
        if (last) this.#zoomAt((a.x + b.x) / 2, (a.y + b.y) / 2, d / last, board)
        last = d
      }
      this.#applyView()
    })
    const end = (e) => {
      // A tap on the empty board lets go of what was selected.
      const tap = pts.has(e.pointerId) && pts.size === 1 && travel < 4
      pts.delete(e.pointerId); last = null
      if (tap && this.picked) { this.picked = null; this.render() }
    }
    board.addEventListener('pointerup', end)
    board.addEventListener('pointercancel', end)
    board.addEventListener('wheel', (e) => { e.preventDefault(); this.#zoomAt(e.clientX, e.clientY, Math.exp(-e.deltaY / 400), board); this.#applyView() }, { passive: false })
  }

  /** −, the zoom, +, and every node in view: for a phone, where a pinch is not always at hand. */
  #zoomBar (board) {
    this.zoomLabel = el('span', { class: 'gw-zoom-pct', text: `${Math.round(this.view.z * 100)}%` })
    const mid = (f) => { const r = board.getBoundingClientRect(); this.#zoomAt(r.left + r.width / 2, r.top + r.height / 2, f, board); this.#applyView() }
    const bar = el('div', { class: 'gw-zoom' }, [
      el('button', { title: 'zoom out', 'data-zoom': 'out', onclick: () => mid(1 / 1.25) }, withIcon('action.zoomout')),
      this.zoomLabel,
      el('button', { text: '+', title: 'zoom in', 'data-zoom': 'in', onclick: () => mid(1.25) }),
      el('button', { title: 'every node in view', 'data-zoom': 'fit', onclick: () => this.fitAll(board) }, withIcon('action.fit'))
    ])
    bar.addEventListener('pointerdown', (e) => e.stopPropagation())
    return bar
  }

  /** Every node in view, as large as fits. */
  fitAll (board) {
    const nodes = this.graph?.nodes ?? []
    if (!nodes.length) return
    const els = nodes.map((n) => this.nodeEls.get(n.id))
    // The notes too: a note's title is what says what the part is.
    const notes = this.graph?.notes ?? []
    const x0 = Math.min(...nodes.map((n) => n.pos?.x ?? 0), ...notes.map((t) => t.x)); const y0 = Math.min(...nodes.map((n) => n.pos?.y ?? 0), ...notes.map((t) => t.y))
    const x1 = Math.max(...nodes.map((n, i) => (n.pos?.x ?? 0) + (els[i]?.offsetWidth ?? NODE_W)), ...notes.map((t) => t.x + t.w))
    const y1 = Math.max(...nodes.map((n, i) => (n.pos?.y ?? 0) + (els[i]?.offsetHeight ?? 120)), ...notes.map((t) => t.y + t.h))
    const r = board.getBoundingClientRect()
    const z = Math.min(2, Math.max(0.3, Math.min((r.width - 40) / (x1 - x0), (r.height - 80) / (y1 - y0))))
    this.view = { z, x: (r.width - (x1 - x0) * z) / 2 - x0 * z, y: 20 - y0 * z }
    this.#applyView()
  }

  #zoomAt (cx, cy, factor, board) {
    const r = board.getBoundingClientRect()
    const z = Math.min(2, Math.max(0.3, this.view.z * factor))
    const k = z / this.view.z
    const px = cx - r.left; const py = cy - r.top
    this.view.x = px - (px - this.view.x) * k
    this.view.y = py - (py - this.view.y) * k
    this.view.z = z
  }

  /** Drag a node by its title; a tap selects it. */
  #nodeGesture (node, head, n) {
    head.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gw-del, .gw-info')) { e.stopPropagation(); return }
      e.preventDefault(); e.stopPropagation()
      head.setPointerCapture?.(e.pointerId)
      const start = { x: e.clientX, y: e.clientY, nx: n.pos?.x ?? 0, ny: n.pos?.y ?? 0 }
      let moved = false
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.view.z; const dy = (ev.clientY - start.y) / this.view.z
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        n.pos = { x: Math.round(start.nx + dx), y: Math.round(start.ny + dy) }
        node.style.left = `${n.pos.x}px`; node.style.top = `${n.pos.y}px`
        this.#drawLinks()
      }
      const up = () => {
        head.removeEventListener('pointermove', move); head.removeEventListener('pointerup', up); head.removeEventListener('pointercancel', up)
        this.picked = { kind: 'node', id: n.id }
        if (moved) this.changed(); else this.render()
      }
      head.addEventListener('pointermove', move); head.addEventListener('pointerup', up); head.addEventListener('pointercancel', up)
    })
    node.addEventListener('pointerdown', (e) => { if (!e.target.closest('.gw-pin')) e.stopPropagation() })
    node.addEventListener('click', (e) => {
      if (e.target.closest('.gw-pin') || e.target.closest('.gw-head') || e.target.closest('input,select,button,textarea,label')) return
      this.picked = { kind: 'node', id: n.id }; this.render()
    })
  }

  /** Drag from an output pin; release over an input pin to link them. */
  #linkGesture (pinEl) {
    pinEl.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation()
      pinEl.setPointerCapture?.(e.pointerId)
      const from = pinEl.dataset.pin
      const kind = pinEl.dataset.kind
      const a = this.#pinPoint(pinEl)
      const rubber = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      rubber.setAttribute('class', `wk-edge gw-${kind}-link gw-rubber`)
      rubber.setAttribute('marker-end', `url(#gw-arrow-${kind})`)
      this.svg.appendChild(rubber)
      // Every input it could go to lights up while it is dragged.
      this.world.dataset.linking = kind
      pinEl.dataset.from = '1'
      const toWorld = (ev) => {
        const r = this.world.getBoundingClientRect()
        return { x: (ev.clientX - r.left) / this.view.z, y: (ev.clientY - r.top) / this.view.z }
      }
      const move = (ev) => rubber.setAttribute('d', curve(a, toWorld(ev)))
      const up = (ev) => {
        pinEl.removeEventListener('pointermove', move); pinEl.removeEventListener('pointerup', up); pinEl.removeEventListener('pointercancel', up)
        rubber.remove()
        delete this.world.dataset.linking
        delete pinEl.dataset.from
        const target = document.elementsFromPoint(ev.clientX, ev.clientY).map((x) => x.closest?.('.gw-pin')).find((x) => x && x.dataset.dir === 'in')
        if (!target || target.dataset.kind !== kind) { if (target) this.S.status('exec links to exec, data to data', 'warn'); return }
        this.link(from, target.dataset.pin, kind)
      }
      pinEl.addEventListener('pointermove', move); pinEl.addEventListener('pointerup', up); pinEl.addEventListener('pointercancel', up)
    })
  }

  /**
   * Link an output to an input. The rules are the runtime's: an exec exit goes
   * to one place and a data input takes one value, so the link that would
   * break them is replaced rather than refused.
   */
  link (from, to, kind) {
    const g = this.ensure()
    if (from.split('.')[0] === to.split('.')[0]) { this.S.status('a node cannot feed itself', 'warn'); return }
    g.links = g.links.filter(([f, t]) => !(kind === 'exec' ? f === from : t === to))
    g.links.push([from, to])
    this.picked = { kind: 'link', index: g.links.length - 1 }
    this.changed()
  }

  #pinPoint (pinEl) {
    const r = pinEl.querySelector('.gw-dot').getBoundingClientRect()
    const w = this.world.getBoundingClientRect()
    return { x: (r.left + r.width / 2 - w.left) / this.view.z, y: (r.top + r.height / 2 - w.top) / this.view.z }
  }

  #drawLinks () {
    if (!this.svg) return
    for (const p of [...this.svg.querySelectorAll('.gw-link-g')]) p.remove()
    ;(this.graph?.links ?? []).forEach(([f, t], i) => {
      const a = this.world.querySelector(`.gw-pin[data-pin="${CSS.escape(f)}"][data-dir="out"]`)
      const b = this.world.querySelector(`.gw-pin[data-pin="${CSS.escape(t)}"][data-dir="in"]`)
      if (!a || !b) return
      const bends = this.graph.bends?.[`${f}>${t}`] ?? []
      const d = curveThrough([this.#pinPoint(a), ...bends, this.#pinPoint(b)])
      const g = document.createElementNS('http://www.w3.org/2000/svg', 'g')
      g.setAttribute('class', 'gw-link-g')
      const hit = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      hit.setAttribute('d', d); hit.setAttribute('class', 'gw-link'); hit.dataset.link = String(i)
      hit.addEventListener('pointerdown', (e) => e.stopPropagation())
      hit.addEventListener('click', () => { this.picked = { kind: 'link', index: i }; this.render() })
      const vis = document.createElementNS('http://www.w3.org/2000/svg', 'path')
      const on = this.picked?.kind === 'link' && this.picked.index === i
      vis.setAttribute('d', d); vis.setAttribute('class', `wk-edge gw-${a.dataset.kind}-link${on ? ' gw-link-on' : ''}`)
      vis.setAttribute('marker-end', `url(#gw-arrow-${on ? 'on' : a.dataset.kind})`)
      g.append(vis, hit)
      // Each bend a dot to drag.
      bends.forEach((pt, k) => g.appendChild(this.#bendDot(pt, i, k, on)))
      this.svg.appendChild(g)
    })
  }

  // --- notes and bends: the board's own, never run --------------------------------

  /** A note round the picked node (or at a free spot), picked for its text. */
  addNote () {
    const g = this.ensure()
    g.notes ??= []
    const sel = this.picked?.kind === 'node' ? g.nodes.find((n) => n.id === this.picked.id) : null
    const box = sel ? this.nodeEls.get(sel.id) : null
    const at = sel ? { x: (sel.pos?.x ?? 0) - 24, y: (sel.pos?.y ?? 0) - 52 } : this.#freeSpot()
    const ids = new Set(g.notes.map((x) => x.id))
    let k = 1
    while (ids.has(`note${k}`)) k++
    const note = { id: `note${k}`, x: Math.round(at.x), y: Math.round(at.y), w: Math.round((box?.offsetWidth ?? NODE_W) + 48), h: Math.round((box?.offsetHeight ?? 140) + 76), text: 'What this part does', color: 'slate' }
    g.notes.push(note)
    this.picked = { kind: 'note', id: note.id }
    this.changed()
    return note.id
  }

  /** A bend in the middle of link `index`: between its ends, or its last bend and the end. */
  addBend (index) {
    const g = this.graph
    const [f, t] = g.links[index]
    const a = this.world.querySelector(`.gw-pin[data-pin="${CSS.escape(f)}"][data-dir="out"]`)
    const b = this.world.querySelector(`.gw-pin[data-pin="${CSS.escape(t)}"][data-dir="in"]`)
    if (!a || !b) return
    g.bends ??= {}
    const list = (g.bends[`${f}>${t}`] ??= [])
    const p = list.at(-1) ?? this.#pinPoint(a)
    const q = this.#pinPoint(b)
    list.push({ x: Math.round((p.x + q.x) / 2), y: Math.round((p.y + q.y) / 2) })
    this.changed()
  }

  /** Bends of links that are gone go with them. */
  #pruneBends () {
    const g = this.graph
    if (!g?.bends) return
    const live = new Set(g.links.map(([f, t]) => `${f}>${t}`))
    for (const k of Object.keys(g.bends)) if (!live.has(k) || !g.bends[k]?.length) delete g.bends[k]
    if (!Object.keys(g.bends).length) delete g.bends
  }

  #bendDot (pt, index, k, on) {
    const c = document.createElementNS('http://www.w3.org/2000/svg', 'circle')
    c.setAttribute('cx', pt.x); c.setAttribute('cy', pt.y); c.setAttribute('r', on ? 9 : 6)
    c.setAttribute('class', `gw-bend${on ? ' gw-bend-on' : ''}`)
    c.dataset.bend = `${index}.${k}`
    c.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation()
      c.setPointerCapture?.(e.pointerId)
      const start = { x: e.clientX, y: e.clientY, px: pt.x, py: pt.y }
      let moved = false
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.view.z; const dy = (ev.clientY - start.y) / this.view.z
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        pt.x = Math.round(start.px + dx); pt.y = Math.round(start.py + dy)
        this.#drawLinks()
      }
      const up = () => {
        c.removeEventListener('pointermove', move); c.removeEventListener('pointerup', up); c.removeEventListener('pointercancel', up)
        this.picked = { kind: 'link', index }
        if (moved) this.changed(); else this.render()
      }
      c.addEventListener('pointermove', move); c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
    })
    return c
  }

  #noteEl (note) {
    const on = this.picked?.kind === 'note' && this.picked.id === note.id
    const head = el('div', { class: 'gw-note-head' }, [
      el('span', { class: 'gw-note-text', text: note.text || 'note' }),
      el('button', { class: 'gw-del', icon: 'action.close', title: 'delete the note (the nodes stay)', onclick: (e) => { e.stopPropagation(); this.#deleteNote(note) } })])
    const size = el('div', { class: 'gw-note-size', title: 'drag to resize' })
    const box = el('div', { class: `gw-note gw-note-${NOTE_COLORS.includes(note.color) ? note.color : 'slate'}${on ? ' gw-note-on' : ''}`, 'data-note': note.id }, [head, size])
    const place = () => { box.style.left = `${note.x}px`; box.style.top = `${note.y}px`; box.style.width = `${note.w}px`; box.style.height = `${note.h}px` }
    place()
    // Drag the title: the note, and every node (and bend) inside it at the start, go together.
    const drag = (handle, onMove) => handle.addEventListener('pointerdown', (e) => {
      if (e.target.closest('.gw-del')) return
      e.preventDefault(); e.stopPropagation()
      handle.setPointerCapture?.(e.pointerId)
      const start = { x: e.clientX, y: e.clientY }
      const begin = onMove.begin()
      let moved = false
      const move = (ev) => {
        const dx = (ev.clientX - start.x) / this.view.z; const dy = (ev.clientY - start.y) / this.view.z
        if (Math.abs(dx) + Math.abs(dy) > 3) moved = true
        onMove.move(begin, dx, dy)
        place()
        this.#drawLinks()
      }
      const up = () => {
        handle.removeEventListener('pointermove', move); handle.removeEventListener('pointerup', up); handle.removeEventListener('pointercancel', up)
        this.picked = { kind: 'note', id: note.id }
        if (moved) this.changed(); else this.render()
      }
      handle.addEventListener('pointermove', move); handle.addEventListener('pointerup', up); handle.addEventListener('pointercancel', up)
    })
    const inside = (x, y) => x >= note.x && y >= note.y && x <= note.x + note.w && y <= note.y + note.h
    drag(head, {
      begin: () => ({
        x: note.x, y: note.y,
        nodes: (this.graph.nodes ?? []).filter((n) => inside(n.pos?.x ?? 0, n.pos?.y ?? 0)).map((n) => ({ n, x: n.pos?.x ?? 0, y: n.pos?.y ?? 0 })),
        bends: Object.values(this.graph.bends ?? {}).flat().filter((p) => inside(p.x, p.y)).map((p) => ({ p, x: p.x, y: p.y }))
      }),
      move: (b, dx, dy) => {
        note.x = Math.round(b.x + dx); note.y = Math.round(b.y + dy)
        for (const it of b.nodes) {
          it.n.pos = { x: Math.round(it.x + dx), y: Math.round(it.y + dy) }
          const elN = this.nodeEls.get(it.n.id)
          if (elN) { elN.style.left = `${it.n.pos.x}px`; elN.style.top = `${it.n.pos.y}px` }
        }
        for (const it of b.bends) { it.p.x = Math.round(it.x + dx); it.p.y = Math.round(it.y + dy) }
      }
    })
    drag(size, {
      begin: () => ({ w: note.w, h: note.h, nodes: [], bends: [] }),
      move: (b, dx, dy) => { note.w = Math.max(160, Math.round(b.w + dx)); note.h = Math.max(80, Math.round(b.h + dy)) }
    })
    return box
  }

  #deleteNote (note) {
    const g = this.graph
    g.notes = (g.notes ?? []).filter((x) => x !== note)
    if (!g.notes.length) delete g.notes
    if (this.picked?.kind === 'note' && this.picked.id === note.id) this.picked = null
    this.changed()
  }

  #noteForm (note) {
    const ch = () => this.changed()
    return [
      el('div', { class: 'st-section-head' }, withIcon('graphgroup.note', 'note')),
      text('text', note.text ?? '', (v) => { note.text = v; ch() }, { multiline: true, placeholder: 'What this part of the graph does' }),
      row('colour', el('div', { class: 'st-row gw-note-colours' }, NOTE_COLORS.map((c) =>
        el('button', { class: `gw-swatch gw-note-${c}`, title: c, 'data-on': note.color === c ? '1' : '0', onclick: () => { note.color = c; ch() } })))),
      muted('Drag its title to move it with every node inside; drag the corner to resize. Notes are the board\'s: written to the graph file\'s meta, never run.'),
      button('delete note (the nodes stay)', () => this.#deleteNote(note), 'st-danger')
    ]
  }

  // --- the side panel ---------------------------------------------------------------

  #details (problems) {
    const S = this.S
    const g = this.graph
    const rows = []
    // What the last bake said about the graph (a place it could not resolve):
    // the status strip that would say it is under this window.
    const baked = (S.preview?.last?.errors ?? []).map((e) => e.msg).filter((m) => /graph/.test(m))
    for (const m of [...problems, ...baked]) rows.push(el('div', { class: 'st-danger', text: m, style: 'white-space:pre-wrap;font-size:12px' }))
    if (this.picked?.kind === 'link' && g?.links[this.picked.index]) {
      const [f, t] = g.links[this.picked.index]
      const key = `${f}>${t}`
      const bends = g.bends?.[key] ?? []
      rows.push(el('div', { class: 'st-section-head', text: 'link' }), muted(`${f} → ${t}`),
        el('div', { class: 'st-row' }, [
          button(withIcon('action.add', 'bend'), () => this.addBend(this.picked.index)),
          bends.length ? button(`remove ${bends.length > 1 ? 'the bends' : 'the bend'}`, () => { delete g.bends[key]; this.changed() }) : null].filter(Boolean)),
        muted('A bend is a point the link is drawn through, to route it round other nodes: drag it where it should go. Only the drawing changes.'),
        button('delete link', () => { g.links.splice(this.picked.index, 1); this.picked = null; this.changed() }, 'st-danger'))
    }
    const note = this.picked?.kind === 'note' ? (g?.notes ?? []).find((x) => x.id === this.picked.id) : null
    if (note) rows.push(...this.#noteForm(note))
    const n = this.picked?.kind === 'node' ? g?.nodes.find((x) => x.id === this.picked.id) : null
    if (n) rows.push(...this.#nodeForm(n))
    if (!n && this.picked?.kind !== 'link' && this.picked?.kind !== 'note') {
      rows.push(muted(g?.nodes?.length
        ? 'Tap a node to edit it, a link to delete it. Drag from a pin on the right of a node to one on the left of another to link them.'
        : this.game
          ? 'The game has no graph yet. It runs once for the whole game, across levels: start from "when on_player_enter", count, keep score, open a screen. To act in a level, "call" it -- the level\'s graph starts from "on_call".'
          : 'This map has no graph yet. Add a "when …" node from the menu above: it is where a run starts. Then do something, ask something, wait, count.'))
    }
    rows.push(button(withIcon('action.variable', 'variables…'), () => { this.side = 'variables'; this.#drawSide() }))
    rows.push(...this.#graphRows())
    rows.push(muted(this.game
      ? 'The game\'s graph runs once, in the game, not in any level: it hears the players arrive and leave, and its variables are kept from level to level and saved with the game. What happens in a level is a "call" to it (to: level), which that level\'s "on_call" of the same name takes.'
      : 'A graph runs beside the map\'s triggers, with the same words: its events, conditions and actions are the trigger cards\'. It adds flow (branch, sequence, delay, once), data (variables, numbers, comparisons) and calls to and from the game\'s graph. A run is at most 256 steps, so a loop drawn by mistake cannot stall the game.'))
    return rows
  }

  #nodeForm (n) {
    const S = this.S
    const g = this.graph
    const spec = nodeSpecs(this.gv).get(n.type)
    const ch = () => this.changed()
    const rows = [el('div', { class: 'st-section-head' }, withIcon('action.expand', `${n.type}`))]
    if (spec?.doc) rows.push(muted(spec.doc))
    rows.push(text('id', n.id, (v) => {
      const id = v.trim().replace(/[^a-z0-9_]/gi, '_')
      if (!id || g.nodes.some((x) => x.id === id && x !== n)) { S.status('that id is empty or taken', 'warn'); return }
      // Links name nodes by id, so they follow the rename.
      g.links = g.links.map(([f, t]) => [f.startsWith(`${n.id}.`) ? `${id}${f.slice(n.id.length)}` : f, t.startsWith(`${n.id}.`) ? `${id}${t.slice(n.id.length)}` : t])
      n.id = id; this.picked = { kind: 'node', id }; ch()
    }))
    const ctx = this.fieldCtx()
    if (n.type === 'event') {
      rows.push(select('when', n.event ?? '', withCurrent(this.events.map((e) => [e.name, e.name]), n.event), (v) => { n.event = v; ch() }))
    } else if (n.type === 'condition' || n.type === 'action') {
      const key = n.type === 'condition' ? 'c' : 'a'
      const list = this.verbs(n.type)
      rows.push(select(n.type, n[key] ?? '', withCurrent(list.map((x) => [x.name, x.name]), n[key]), (v) => {
        // A different verb takes different arguments: keep only the node's own.
        for (const k of Object.keys(n)) if (!['id', 'type', 'pos', 'negate'].includes(k)) delete n[k]
        this.#dropArgLinks(n)
        n[key] = v; ch()
      }))
      if (n.type === 'condition') rows.push(toggle('not (take the other exit)', !!n.negate, (v) => { if (v) n.negate = true; else delete n.negate; ch() }))
      const verb = this.tv[n.type === 'condition' ? 'conditions' : 'actions'].find((x) => x.name === n[key])
      if (verb?.doc) rows.push(muted(verb.doc))
      if (n.c === 'side_is') {
        const v = n.side
        const label = v?.edge ? `wall ${v.edge}` : v?.edgeTwin ? `facing wall ${v.edgeTwin}` : 'tap a wall'
        const b = button(label, () => this.pickOnMap(['edge'], 'tap the wall').then((hit) => { n.side = { edge: hit.id }; ch() }))
        b.style.flex = '1 1 auto'
        rows.push(row('side', b, button('other side', () => { if (v?.edge) n.side = { edgeTwin: v.edge }; else if (v?.edgeTwin) n.side = { edge: v.edgeTwin }; ch() })))
      }
      const linked = this.#linkedArgs(n)
      for (const [name, from] of linked) if ((verb?.args ?? []).some((a) => a.name === name)) rows.push(row(name, el('span', { class: 'gw-from' }, withIcon('action.left', `linked from ${from}`))))
      if (verb) rows.push(...this.#withBinding(n, verb.args ?? [], linked, (args) => argFields(args, n, ctx, [...HIDDEN_ARGS, ...linked.keys()], n[key])))
    } else if (['get_var', 'set_var', 'add_var'].includes(n.type)) {
      rows.push(this.#varRow(n))
      const p = propertiesOf(this.gv).get(n.var)
      if (p) rows.push(muted(`${p.doc} (${p.type}, ${p.access === 'read' ? 'read only' : 'read and set'}${p.of === 'movement' ? ', a movement rule' : ''}). Whose: the event's entity, or the one linked to \`entity\`.`))
      if (n.type !== 'get_var') rows.push(text('value (unless linked)', n.value ?? '', (v) => { n.value = literal(v); ch() }))
    } else if (spec) {
      if (spec.doc) rows.push(muted(spec.doc))
      const linked = this.#linkedArgs(n)
      const own = (spec.args ?? []).filter((a) => !linked.has(a.name))
      for (const a of (spec.args ?? []).filter((x) => linked.has(x.name))) rows.push(row(a.name, el('span', { class: 'gw-from' }, withIcon('action.left', `linked from ${linked.get(a.name)}`))))
      rows.push(...this.#withBinding(n, own.filter((a) => a.type !== 'value' || a.name === 'level'), linked, (args) => argFields(args, n, ctx, [], n.type)))
      for (const a of own.filter((x) => x.type === 'value' && x.name !== 'level')) rows.push(text(`${a.name}${a.optional ? ' (unless linked)' : ''}`, n[a.name] ?? '', (v) => { if (v === '') delete n[a.name]; else n[a.name] = literal(v); ch() }))
    }
    rows.push(button('delete node', () => this.#deleteNode(n), 'st-danger'))
    return rows
  }

  /** This graph: its name, and deleting it. */
  #graphRows () {
    const others = graphsOf(this.owner).filter(([n]) => n !== this.gname).map(([n]) => n)
    return [el('div', { class: 'st-section-head', text: `graph · ${this.gname}` }),
      text('name', this.gname, (v) => this.rename(v)),
      el('div', { class: 'st-row' }, [
        button('+ new graph', () => this.pickGraph('\u0000new')),
        this.graph ? button('delete graph', async () => {
          if (!await confirmDialog(`delete the graph ${this.gname}${this.game ? '' : ` of ${this.S.docName}`}? Its nodes go with it.`)) return
          delete this.owner.graphs[this.gname]
          this.gname = others[0] ?? (this.game ? GAME_NAME : MAP_GRAPH)
          this.picked = null
          this.changed()
          if (this.S.go) this.S.go('graph', graphRoute(this.scope, this.S.docName, this.gname))
        }, 'st-danger') : null
      ].filter(Boolean)),
      muted(`${this.game ? 'The game' : this.S.docName} ${others.length ? `has ${others.length} other graph${others.length > 1 ? 's' : ''} (${others.join(', ')})` : 'has no other graph'}. Each runs on its own, under its own name${this.game ? '' : ', and takes one of the map\'s script slots'}; an empty one is not written.`)]
  }

  #varsRows (extra = null) {
    const g = this.graph
    const rows = [el('div', { class: 'st-section-head', text: 'this graph\'s variables' })]
    for (const [k, v] of Object.entries(g?.vars ?? {})) {
      rows.push(el('div', { class: 'st-row gw-var-row', 'data-var-row': k }, [
        el('span', { class: 'st-entry', text: k }),
        text('starts at', String(v), (x) => { g.vars[k] = literal(x) ?? 0; this.changed() }).lastChild,
        ...(extra ? extra(k) : []),
        button(withIcon('action.close'), () => { delete g.vars[k]; this.changed() })
      ]))
    }
    rows.push(button('+ variable', async () => {
      const raw = await ask('variable name (letters, digits, underscore)', 'count')
      const k = String(raw ?? '').replace(/[^a-z0-9_]/gi, '')
      if (!k) return
      const gg = this.ensure()
      gg.vars ??= {}
      if (k in gg.vars) { this.S.status(`there is a variable called ${k} already`, 'warn'); return }
      if (propertiesOf(this.gv).has(k)) { this.S.status(`${k} is an entity's property (in the list below) -- a variable needs another name`, 'warn'); return }
      gg.vars[k] = 0
      this.changed()
    }))
    rows.push(muted(this.game
      ? 'Each starts at its value when the game does, and is kept from level to level. Numbers, words, or true and false.'
      : 'Each starts at its value when the level does. Numbers, words, or true and false.'))
    return rows
  }
}

/** The options, with the current value kept when it is not among them (a word this scope does not offer). */
function withCurrent (opts, cur) {
  return cur && !opts.some(([v]) => v === cur) ? [[cur, `${cur} (not here)`], ...opts] : opts
}

/** "3" -> 3, "true" -> true, "abc" -> "abc": a literal as the person meant it. */
function literal (s) {
  // A decimal comma ("0,5", as many keyboards write it) is a decimal point:
  // kept as text, the runtime would read it as no number at all.
  const t = String(s).trim().replace(/^(-?\d+),(\d+)$/, '$1.$2')
  if (t === '') return undefined
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+\.\d+$/.test(t)) return t
  return t
}

/** A link's curve: out of the right of one node, into the left of another. */
/** A link through its bends: one curve per stretch, each leaving and arriving level. */
function curveThrough (pts) {
  let d = `M${pts[0].x},${pts[0].y}`
  for (let i = 1; i < pts.length; i++) d += ' ' + curve(pts[i - 1], pts[i]).replace(/^M[^C]*/, '')
  return d
}

const NOTE_COLORS = ['slate', 'blue', 'green', 'amber', 'red', 'violet']

function curve (a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

const STYLE = `
.gw{grid-template-columns:1fr 400px;grid-template-areas:"top top" "graph details"}
.gw .wk-graph{grid-area:graph}
.gw .wk-top select{height:40px;border-radius:8px;background:var(--dnp-color-bg-raised);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);font:600 12px/1 var(--dnp-font-ui);padding:0 8px}
.gw .gw-panes{display:none}
.gw-node{position:absolute;width:${NODE_W}px;box-sizing:border-box;border:1px solid var(--cv-graph-node);border-radius:var(--cv-graph-node-radius);background:var(--cv-graph-node-fill);font:var(--cv-graph-node-text-font);color:var(--cv-graph-node-text);user-select:none}
.gw-node.gw-on{box-shadow:0 0 0 var(--cv-graph-node-selected-width) var(--cv-graph-node-selected)}
.gw-head{padding:6px 10px;font:var(--cv-graph-node-title-font);color:var(--cv-graph-node-title);border-radius:calc(var(--cv-graph-node-radius) - 1px) calc(var(--cv-graph-node-radius) - 1px) 0 0;cursor:grab;touch-action:none;display:flex;align-items:center;gap:6px}
.gw-title{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.gw-note{position:absolute;border:1px solid var(--cv-note-slate);border-radius:12px;background:var(--cv-note-slate-body);pointer-events:none;box-sizing:border-box}
.gw-note-on{border-color:var(--cv-graph-node-selected);box-shadow:0 0 0 1px var(--cv-graph-node-selected)}
.gw-note-head{pointer-events:auto;display:flex;align-items:flex-start;gap:6px;padding:6px 8px;border-radius:11px 11px 0 0;background:var(--cv-note-slate-head);cursor:grab;touch-action:none;font:700 13px var(--dnp-font-ui);color:var(--dnp-color-text-primary)}
.gw-note-text{flex:1 1 auto;min-width:0;white-space:pre-wrap;word-break:break-word}
.gw-note-size{pointer-events:auto;position:absolute;right:0;bottom:0;width:22px;height:22px;cursor:nwse-resize;touch-action:none;background:linear-gradient(135deg,transparent 50%,color-mix(in srgb,var(--dnp-color-text-primary) 35%,transparent) 50%);border-radius:0 0 11px 0}
.gw-note-blue{border-color:var(--cv-note-blue);background:var(--cv-note-blue-body)}.gw-note-blue .gw-note-head{background:var(--cv-note-blue-head)}
.gw-note-green{border-color:var(--cv-note-green);background:var(--cv-note-green-body)}.gw-note-green .gw-note-head{background:var(--cv-note-green-head)}
.gw-note-amber{border-color:var(--cv-note-amber);background:var(--cv-note-amber-body)}.gw-note-amber .gw-note-head{background:var(--cv-note-amber-head)}
.gw-note-red{border-color:var(--cv-note-red);background:var(--cv-note-red-body)}.gw-note-red .gw-note-head{background:var(--cv-note-red-head)}
.gw-note-violet{border-color:var(--cv-note-violet);background:var(--cv-note-violet-body)}.gw-note-violet .gw-note-head{background:var(--cv-note-violet-head)}
.gw-swatch{width:30px;height:30px;min-width:0;padding:0;border-radius:8px}
.gw-swatch[data-on="1"]{outline:2px solid var(--cv-graph-node-selected)}
.gw-bend{fill:var(--cv-graph-bend-fill);stroke:var(--cv-graph-board);stroke-width:2;cursor:grab;touch-action:none;pointer-events:all}
.gw-bend-on{fill:var(--cv-graph-bend-selected-fill)}
.gw-pin-idle{opacity:.35}
.gw-bind{flex:0 0 auto;width:28px;height:28px;min-width:0;min-height:0;padding:0;border-radius:8px;font-size:13px;background:transparent;border:1px solid color-mix(in srgb,var(--dnp-color-ok) 45%,transparent);color:var(--dnp-color-ok)}
.gw-bound-row label{color:var(--dnp-color-ok)}
.gw-bound{color:var(--dnp-color-ok)}
/* A button alone in the side panel's column keeps a finger's height. */
.gw .wk-details > button{flex:0 0 auto;min-height:36px}
.gw-side-tabs{margin-bottom:6px}
.gw-var-find{width:100%;height:36px;font-size:14px;box-sizing:border-box}
.gw-var-row{min-height:34px;gap:6px}
.gw-var-type{font-size:11px;color:var(--dnp-color-text-secondary);white-space:nowrap}
.gw-var-drop{min-width:0;height:28px;padding:0 8px;font-size:11px}
.gw-menu{position:absolute;z-index:40;top:52px;left:8px;width:min(420px,calc(100% - 16px));max-height:calc(100% - 64px);display:flex;flex-direction:column;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:12px;box-shadow:var(--dnp-shadow-raised);overflow:hidden}
.gw-menu-top{display:flex;gap:6px;padding:8px;border-bottom:1px solid var(--dnp-color-line-main)}
.gw-menu-find{flex:1 1 auto;min-width:0;height:36px;font-size:14px}
.gw-menu-list{overflow:auto;-webkit-overflow-scrolling:touch;padding:4px 6px 8px}
.gw-menu-group{font:700 11px var(--dnp-font-ui);color:var(--dnp-color-text-secondary);padding:10px 6px 4px;text-transform:none}
.gw-menu-item{display:flex;flex-wrap:wrap;align-items:baseline;gap:2px 8px;width:100%;height:auto;min-height:34px;padding:6px 8px;text-align:left;border:0;border-radius:8px;background:transparent}
.gw-menu-item:hover,.gw-menu-item:focus{background:var(--dnp-color-bg-raised)}
.gw-menu-label{font-weight:700;color:var(--dnp-color-text-primary)}
.gw-menu-in{font-size:10px;color:var(--dnp-color-text-secondary)}
.gw-menu-doc{flex:1 1 100%;font-size:11px;color:var(--dnp-color-text-secondary);white-space:normal}
.gw-del{flex:0 0 auto;width:22px;height:22px;min-width:0;min-height:0;padding:0;border-radius:6px;font-size:11px;line-height:20px;background:color-mix(in srgb,var(--dnp-color-bg-sunken) 45%,transparent);border:1px solid color-mix(in srgb,var(--dnp-color-text-primary) 18%,transparent);color:var(--dnp-color-text-primary);opacity:.7;cursor:pointer}
.gw-del:hover,.gw-del:active{opacity:1;background:var(--dnp-color-node-event);border-color:var(--dnp-color-error)}
.gw-info{flex:0 0 auto;width:22px;height:22px;min-width:0;min-height:0;padding:0;border-radius:50%;font-size:12px;line-height:20px;background:color-mix(in srgb,var(--dnp-color-bg-sunken) 45%,transparent);border:1px solid color-mix(in srgb,var(--dnp-color-text-primary) 18%,transparent);color:var(--dnp-color-text-primary);opacity:.7;cursor:pointer}
.gw-info:hover,.gw-info:active,.gw-info[data-on="1"]{opacity:1;background:color-mix(in srgb,var(--dnp-color-accent) 35%,transparent);border-color:var(--dnp-color-accent)}
.gw-doc{padding:6px 10px;font:11px/1.45 var(--dnp-font-ui);color:var(--dnp-color-text-primary);background:color-mix(in srgb,var(--dnp-color-bg-sunken) 45%,transparent);white-space:pre-wrap;border-bottom:1px solid color-mix(in srgb,var(--dnp-color-text-primary) 12%,transparent)}
.gw-ev .gw-head{background:var(--cv-graph-head-event)}.gw-cond .gw-head{background:var(--cv-graph-head-condition)}.gw-act .gw-head{background:var(--cv-graph-head-action)}
.gw-flow .gw-head{background:var(--cv-graph-head-flow)}.gw-data .gw-head{background:var(--cv-graph-head-data)}
.gw-cine .gw-head{background:var(--cv-graph-head-camera)}
.gw-sum{padding:4px 10px;color:var(--cv-graph-node-text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-body{display:flex;justify-content:space-between;padding:2px 0 8px}
.gw-col{display:flex;flex-direction:column;gap:2px}
.gw-right{align-items:flex-end}
/* PINS: big enough to grab with a thumb, and shaped as what they carry --
   a white arrow-tab for what happens next, a green round socket for a value. */
.gw-pin{display:flex;align-items:center;gap:6px;padding:3px 0;min-height:28px;cursor:crosshair;touch-action:none}
.gw-col:not(.gw-right) .gw-pin{margin-left:-9px}
.gw-right .gw-pin{flex-direction:row-reverse;margin-right:-9px}
.gw-dot{display:flex;align-items:center;justify-content:center;width:18px;height:18px;font-size:0;box-sizing:border-box;transition:transform 80ms,box-shadow 80ms}
.gw-exec .gw-dot{background:var(--cv-graph-pin-exec-fill);clip-path:polygon(0 0,62% 0,100% 50%,62% 100%,0 100%)}
.gw-data .gw-dot{background:var(--cv-graph-board);border:var(--cv-graph-pin-data-width) solid var(--cv-graph-pin-data);border-radius:50%}
.gw-pin:hover .gw-dot,.gw-pin[data-from="1"] .gw-dot{transform:scale(1.35)}
/* While a link is dragged, every input it can go to says so. */
.wk-world[data-linking="exec"] .gw-pin.gw-in.gw-exec .gw-dot{background:var(--cv-graph-pin-valid);transform:scale(1.45)}
.wk-world[data-linking="data"] .gw-pin.gw-in.gw-data .gw-dot{border-color:var(--cv-graph-pin-valid);background:var(--cv-graph-head-data);transform:scale(1.45)}
.gw-pname{color:var(--cv-graph-node-text)}
.gw-zoom{position:absolute;right:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:4px;background:color-mix(in srgb,var(--dnp-color-bg-app) 85%,transparent);border:1px solid var(--dnp-color-line-main);border-radius:10px;padding:4px}
.gw .gw-zoom button{min-width:36px;height:34px;padding:0 8px;border-radius:8px;background:var(--dnp-color-bg-raised);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);font:600 15px/1 var(--dnp-font-ui);cursor:pointer}
.gw-zoom-pct{font:600 11px var(--dnp-font-mono);color:var(--dnp-color-text-secondary);min-width:42px;text-align:center}
.gw-link{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke;cursor:pointer}
.gw-exec-link{stroke:var(--cv-graph-wire-exec);stroke-width:var(--cv-graph-wire-exec-width)}
.gw-data-link{stroke:var(--cv-graph-wire-data);stroke-width:var(--cv-graph-wire-data-width)}
.gw-link-on{stroke:var(--cv-graph-wire-selected);stroke-width:var(--cv-graph-wire-selected-width)}
.gw-rubber{stroke:var(--cv-graph-wire-drag);stroke-width:var(--cv-graph-wire-drag-width);stroke-dasharray:8 5;animation:gw-flow .5s linear infinite}
@keyframes gw-flow{to{stroke-dashoffset:-13}}
/* A node's own fields, compact. */
.gw-fields{padding:4px 8px 0;display:flex;flex-direction:column;gap:3px}
.gw-fields .st-row{min-height:26px;gap:5px}
.gw-fields .st-row label{flex:0 0 5.2em;font-size:10px;opacity:.75}
.gw-fields .st-row input,.gw-fields .st-row select,.gw-fields input,.gw-fields select{height:24px;font-size:11px;padding:0 5px;min-width:0;flex:1 1 auto;border-radius:var(--cv-graph-node-field-radius);background:var(--cv-graph-node-field-fill);color:var(--cv-graph-node-title);border:1px solid var(--cv-graph-node-field)}
.gw-fields .st-row button,.gw-fields button{min-width:28px;height:24px;font-size:11px;padding:0 6px;border-radius:6px}
.gw-fields .st-choice{flex:1 1 auto;display:flex;min-width:0}
/* A verb argument's data pin, at the start of its row, on the node's edge. */
.gw-fields .gw-argrow{position:relative;padding-left:10px}
.gw-fields .gw-argrow > .gw-pin{position:absolute;left:-17px;top:50%;transform:translateY(-50%);min-height:0;padding:0;margin:0}
.gw-fields .gw-argrow > .gw-pin .gw-pname{display:none}
.gw-from{flex:1 1 auto;color:var(--dnp-color-ok);font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-fields .gw-more{opacity:.7}
@media (max-width:1100px){
  .gw{grid-template-columns:1fr;grid-template-areas:"top" "main"}
  .gw .gw-panes{display:flex}
  .gw .wk-graph,.gw .wk-details{grid-area:main;display:none}
  .gw[data-pane="board"] .wk-graph{display:flex}
  .gw[data-pane="details"] .wk-details{display:flex}
}
`
