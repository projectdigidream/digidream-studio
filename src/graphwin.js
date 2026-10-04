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
import { el, row, text, select, button, muted, number, toggle, ask, confirmDialog } from './ui.js'
import { argFields } from './argform.js'
import { newGraph, nodeSpecs, pinsOf, graphProblems, graphsOf, parseGraphRoute, graphRoute, cleanGraphName, NAME_RE, MAP_GRAPH, GAME_NAME } from './graphs_emit.js'

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
  return 'flow'
}

// The node menu's groups, designer's words first: the world's nodes by their
// graph_vocab category, then flow and data, then the trigger vocabulary's.
const MENU = [
  ['when …', (s) => s.starts || s.name === 'on_call'],
  ['do to a thing', (s) => s.category === 'entity' && (s.exec_in ?? []).length],
  ['move the map', (s) => (s.category === 'sector' || s.category === 'wall') && (s.exec_in ?? []).length],
  ['read', (s) => ['entity', 'sector', 'wall'].includes(s.category) && !(s.exec_in ?? []).length],
  ['flow', (s) => ['branch', 'sequence', 'delay', 'once', 'call'].includes(s.name)],
  ['data', (s) => ['get_var', 'set_var', 'add_var', 'literal', 'compare', 'math', 'logic', 'random'].includes(s.name)]
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
      ...(S.panelCtx?.() ?? {})
    }
  }

  render () {
    const S = this.S
    if (!this.gv) {
      this.root.replaceChildren(el('div', { class: 'wk-top' }, [el('span', { class: 'wk-title', text: '◇ graph' }), button('‹ back', () => this.back())]),
        el('div', { class: 'wk-details' }, [muted('No graph vocabulary staged with this studio (graph_vocab.json).')]))
      return
    }
    const problems = graphProblems(this.graph, this.gv, this.tv, { game: this.game })
    this.root.dataset.scope = this.scope
    const top = el('div', { class: 'wk-top' }, [
      el('span', { class: 'wk-title', text: this.game ? '◇ the game' : `◇ ${S.docName}` }),
      this.#graphPicker(),
      this.#palette(),
      el('div', { class: 'wk-tabs gw-panes' }, [['board', 'board'], ['details', 'details']].map(([v, l]) =>
        el('button', { text: l, 'data-on': this.pane === v ? '1' : '0', onclick: () => { this.pane = v; this.root.dataset.pane = v } }))),
      el('span', { style: 'flex:1' }),
      problems.length ? el('span', { class: 'st-danger', text: `${problems.length} problem${problems.length > 1 ? 's' : ''}` }) : null,
      button(this.game ? '‹ graphs' : '‹ map', () => this.back())
    ].filter(Boolean))

    const board = el('div', { class: 'wk-board gw-board' })
    const world = el('div', { class: 'wk-world' })
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
    svg.setAttribute('class', 'wk-edges')
    // Arrowheads, so which way a link runs is never in doubt.
    svg.innerHTML = '<defs>' + [['exec', '#e8f0ff'], ['data', '#7ad48a'], ['on', '#ffe066']].map(([k, c]) =>
      `<marker id="gw-arrow-${k}" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto-start-reverse"><path d="M0,0 L10,5 L0,10 z" fill="${c}"/></marker>`).join('') + '</defs>'
    world.appendChild(svg)
    board.appendChild(world)
    this.world = world
    this.svg = svg
    this.nodeEls = new Map()
    const specs = nodeSpecs(this.gv)
    for (const n of this.graph?.nodes ?? []) world.appendChild(this.#nodeEl(n, specs.get(n.type), problems))
    this.#applyView()
    this.#boardGestures(board)
    board.appendChild(this.#zoomBar(board))

    const side = el('div', { class: 'wk-details' }, this.#details(problems))
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

  #palette () {
    const sel = el('select', { class: 'gw-palette' }, [el('option', { value: '', text: '+ node…' })])
    const group = (label, opts) => { if (opts.length) sel.append(el('optgroup', { label }, opts.map(([v, t]) => el('option', { value: v, text: t })))) }
    // The game has no level: what needs one is not offered there.
    const specs = this.gv.nodes.filter((n) => !['event', 'condition', 'action'].includes(n.name) && !(this.game && n.level_only))
    const taken = new Set()
    for (const [label, test] of MENU) {
      const list = specs.filter((n) => !taken.has(n.name) && test(n))
      for (const n of list) taken.add(n.name)
      group(label, list.map((n) => [`node:${n.name}`, n.name.replace(/_/g, ' ')]))
    }
    group('other', specs.filter((n) => !taken.has(n.name)).map((n) => [`node:${n.name}`, n.name.replace(/_/g, ' ')]))
    // The trigger vocabulary's own words, for what the world's nodes do not say.
    group('trigger words', [...this.events.map((e) => [`event:${e.name}`, `when ${e.name}`]), ['cond:', 'if … (a condition)'], ['act:', 'do … (an action)']])
    sel.addEventListener('change', () => {
      const v = sel.value
      if (!v) return
      const [kind, name] = v.split(':')
      const g = this.ensure()
      const at = this.#freeSpot()
      const id = this.#newId(kind === 'event' ? name.replace(/^on_/, '') : kind === 'node' ? name.replace(/^when_/, '') : kind === 'cond' ? 'if' : 'do')
      const n = { id, pos: { x: at.x, y: at.y } }
      if (kind === 'event') Object.assign(n, { type: 'event', event: name })
      else if (kind === 'cond') Object.assign(n, { type: 'condition', c: this.verbs('condition')[0]?.name })
      else if (kind === 'act') Object.assign(n, { type: 'action', a: 'log', text: 'hello' })
      else {
        n.type = name
        if (name === 'sequence') n.count = 2
        if (name === 'delay') n.ticks = 60
        if (name === 'random') Object.assign(n, { lo: 1, hi: 6 })
        if (name === 'compare') n.op = '=='
        if (name === 'math') n.op = '+'
        if (name === 'logic') n.op = 'and'
        if (name === 'literal') n.value = 0
        if (['get_var', 'set_var', 'add_var'].includes(name)) n.var = Object.keys(g.vars ?? {})[0] ?? 'count'
        if (name === 'call') Object.assign(n, { to: this.game ? 'level' : 'game', name: this.S.callNames?.()[0] ?? 'hello' })
        if (name === 'on_call') n.name = this.S.callNames?.()[0] ?? 'hello'
        this.#defaults(n, nodeSpecs(this.gv).get(name))
      }
      g.nodes.push(n)
      this.picked = { kind: 'node', id }
      this.changed()
    })
    return sel
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
    const head = el('div', { class: 'gw-head', text: `${n.type === 'event' ? '⚡ ' : ''}${n.id}` })
    const body = el('div', { class: 'gw-body' })
    const pin = this.pin = (name, dir, kind) => {
      const d = el('div', { class: `gw-pin gw-${dir} gw-${kind}`, 'data-pin': `${n.id}.${name}`, 'data-dir': dir, 'data-kind': kind },
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
      [head, fields.length ? el('div', { class: 'gw-fields' }, fields) : el('div', { class: 'gw-sum', text: this.#summary(n) }), body])
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
          button(v?.edge ? `wall ${v.edge}` : v?.edgeTwin ? `facing ${v.edgeTwin}` : '📍 tap a wall', () => this.pickOnMap(['edge'], 'tap the wall').then((hit) => { n.side = { edge: hit.id }; this.changed() }))]))
      }
      const verb = this.tv[n.type === 'condition' ? 'conditions' : 'actions'].find((x) => x.name === n[key])
      if (verb) out.push(...this.#argRows(verb.args, shown, argPins, linked, (args) => argFields(args, n, ctx, HIDDEN_ARGS, n[key])))
    } else if (spec) {
      if (['get_var', 'set_var', 'add_var'].includes(n.type)) {
        out.push(pick('variable', n.var, Object.keys(this.graph?.vars ?? {}).map((v) => [v, v]), (v) => { n.var = v; this.changed() }))
        if (n.type !== 'get_var') out.push(this.#literalRow('value', n, 'value'))
      } else {
        out.push(...this.#argRows(spec.args, shown, argPins, linked, (args) => [
          // Places, rooms and walls together, so x, y and z are one tap.
          ...argFields(args.filter((a) => a.type !== 'value'), n, ctx, [], n.type),
          ...args.filter((a) => a.type === 'value').map((a) => { const r = this.#literalRow(a.name, n, a.name); r.dataset.arg = a.name; return r })
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
    const rows = make(shown(args))
    for (const name of argPins) {
      if (!shown(args).some((a) => a.name === name)) continue
      let r = rows.find((x) => x.dataset?.arg === name)
      if (linked.has(name)) {
        const nr = el('div', { class: 'st-row gw-linked', 'data-arg': name }, [el('label', { text: name }), el('span', { class: 'gw-from', text: `← ${linked.get(name)}` })])
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
      el('button', { text: '−', title: 'zoom out', 'data-zoom': 'out', onclick: () => mid(1 / 1.25) }),
      this.zoomLabel,
      el('button', { text: '+', title: 'zoom in', 'data-zoom': 'in', onclick: () => mid(1.25) }),
      el('button', { text: '⤢', title: 'every node in view', 'data-zoom': 'fit', onclick: () => this.fitAll(board) })
    ])
    bar.addEventListener('pointerdown', (e) => e.stopPropagation())
    return bar
  }

  /** Every node in view, as large as fits. */
  fitAll (board) {
    const nodes = this.graph?.nodes ?? []
    if (!nodes.length) return
    const els = nodes.map((n) => this.nodeEls.get(n.id)).filter(Boolean)
    const x0 = Math.min(...nodes.map((n) => n.pos?.x ?? 0)); const y0 = Math.min(...nodes.map((n) => n.pos?.y ?? 0))
    const x1 = Math.max(...nodes.map((n, i) => (n.pos?.x ?? 0) + (els[i]?.offsetWidth ?? NODE_W)))
    const y1 = Math.max(...nodes.map((n, i) => (n.pos?.y ?? 0) + (els[i]?.offsetHeight ?? 120)))
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
      const d = curve(this.#pinPoint(a), this.#pinPoint(b))
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
      this.svg.appendChild(g)
    })
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
      rows.push(el('div', { class: 'st-section-head', text: 'link' }), muted(`${f} → ${t}`),
        button('delete link', () => { g.links.splice(this.picked.index, 1); this.picked = null; this.changed() }, 'st-danger'))
    }
    const n = this.picked?.kind === 'node' ? g?.nodes.find((x) => x.id === this.picked.id) : null
    if (n) rows.push(...this.#nodeForm(n))
    if (!n && this.picked?.kind !== 'link') {
      rows.push(muted(g?.nodes?.length
        ? 'Tap a node to edit it, a link to delete it. Drag from a pin on the right of a node to one on the left of another to link them.'
        : this.game
          ? 'The game has no graph yet. It runs once for the whole game, across levels: start from "when on_player_enter", count, keep score, open a screen. To act in a level, "call" it -- the level\'s graph starts from "on_call".'
          : 'This map has no graph yet. Add a "when …" node from the menu above: it is where a run starts. Then do something, ask something, wait, count.'))
    }
    rows.push(...this.#varsRows())
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
    const rows = [el('div', { class: 'st-section-head', text: `▸ ${n.type}` })]
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
      for (const [name, from] of linked) if ((verb?.args ?? []).some((a) => a.name === name)) rows.push(row(name, el('span', { class: 'gw-from', text: `← linked from ${from}` })))
      if (verb) rows.push(...argFields(verb.args ?? [], n, ctx, [...HIDDEN_ARGS, ...linked.keys()], n[key]))
    } else if (['get_var', 'set_var', 'add_var'].includes(n.type)) {
      rows.push(select('variable', n.var ?? '', Object.keys(g.vars ?? {}).map((v) => [v, v]), (v) => { n.var = v; ch() }))
      if (n.type !== 'get_var') rows.push(text('value (unless linked)', n.value ?? '', (v) => { n.value = literal(v); ch() }))
    } else if (spec) {
      const linked = this.#linkedArgs(n)
      const own = (spec.args ?? []).filter((a) => !linked.has(a.name))
      for (const a of (spec.args ?? []).filter((x) => linked.has(x.name))) rows.push(row(a.name, el('span', { class: 'gw-from', text: `← linked from ${linked.get(a.name)}` })))
      rows.push(...argFields(own.filter((a) => a.type !== 'value'), n, ctx, [], n.type))
      for (const a of own.filter((x) => x.type === 'value')) rows.push(text(`${a.name}${a.optional ? ' (unless linked)' : ''}`, n[a.name] ?? '', (v) => { if (v === '') delete n[a.name]; else n[a.name] = literal(v); ch() }))
    }
    rows.push(button('delete node', () => {
      g.nodes.splice(g.nodes.indexOf(n), 1)
      g.links = g.links.filter(([f, t]) => !f.startsWith(`${n.id}.`) && !t.startsWith(`${n.id}.`))
      this.picked = null; ch()
    }, 'st-danger'))
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

  #varsRows () {
    const g = this.graph
    const rows = [el('div', { class: 'st-section-head', text: 'variables' })]
    for (const [k, v] of Object.entries(g?.vars ?? {})) {
      rows.push(el('div', { class: 'st-row' }, [
        el('span', { class: 'st-entry', text: k }),
        text('starts at', String(v), (x) => { g.vars[k] = literal(x) ?? 0; this.changed() }).lastChild,
        button('✕', () => { delete g.vars[k]; this.changed() })
      ]))
    }
    rows.push(button('+ variable', async () => {
      const raw = await ask('variable name (letters, digits, underscore)', 'count')
      const k = String(raw ?? '').replace(/[^a-z0-9_]/gi, '')
      if (!k) return
      const gg = this.ensure()
      gg.vars ??= {}
      if (k in gg.vars) { this.S.status(`there is a variable called ${k} already`, 'warn'); return }
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
  const t = String(s).trim()
  if (t === '') return undefined
  if (t === 'true') return true
  if (t === 'false') return false
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+\.\d+$/.test(t)) return t
  return t
}

/** A link's curve: out of the right of one node, into the left of another. */
function curve (a, b) {
  const dx = Math.max(40, Math.abs(b.x - a.x) / 2)
  return `M${a.x},${a.y} C${a.x + dx},${a.y} ${b.x - dx},${b.y} ${b.x},${b.y}`
}

const STYLE = `
.gw{grid-template-columns:1fr 400px;grid-template-areas:"top top" "graph details"}
.gw .wk-graph{grid-area:graph}
.gw .wk-top select{height:40px;border-radius:8px;background:rgba(27,34,48,.85);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);font:600 12px/1 ui-monospace,Menlo,monospace;padding:0 8px}
.gw .gw-panes{display:none}
.gw-node{position:absolute;width:${NODE_W}px;box-sizing:border-box;border:1px solid #3a4454;border-radius:10px;background:#12161e;font-size:11px;user-select:none}
.gw-node.gw-on{box-shadow:0 0 0 2px #ffe066}
.gw-head{padding:6px 10px;font-weight:700;font-size:12px;border-radius:9px 9px 0 0;cursor:grab;touch-action:none}
.gw-ev .gw-head{background:#5a2330}.gw-cond .gw-head{background:#5a4a1e}.gw-act .gw-head{background:#1f3a5c}
.gw-flow .gw-head{background:#33384a}.gw-data .gw-head{background:#1f4a35}
.gw-sum{padding:4px 10px;color:#9fb0c8;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-body{display:flex;justify-content:space-between;padding:2px 0 8px}
.gw-col{display:flex;flex-direction:column;gap:2px}
.gw-right{align-items:flex-end}
/* PINS: big enough to grab with a thumb, and shaped as what they carry --
   a white arrow-tab for what happens next, a green round socket for a value. */
.gw-pin{display:flex;align-items:center;gap:6px;padding:3px 0;min-height:28px;cursor:crosshair;touch-action:none}
.gw-col:not(.gw-right) .gw-pin{margin-left:-9px}
.gw-right .gw-pin{flex-direction:row-reverse;margin-right:-9px}
.gw-dot{display:flex;align-items:center;justify-content:center;width:18px;height:18px;font-size:0;box-sizing:border-box;transition:transform 80ms,box-shadow 80ms}
.gw-exec .gw-dot{background:#e8f0ff;clip-path:polygon(0 0,62% 0,100% 50%,62% 100%,0 100%)}
.gw-data .gw-dot{background:#0e1219;border:3px solid #7ad48a;border-radius:50%}
.gw-pin:hover .gw-dot,.gw-pin[data-from="1"] .gw-dot{transform:scale(1.35)}
/* While a link is dragged, every input it can go to says so. */
.wk-world[data-linking="exec"] .gw-pin.gw-in.gw-exec .gw-dot{background:#66ff99;transform:scale(1.45)}
.wk-world[data-linking="data"] .gw-pin.gw-in.gw-data .gw-dot{border-color:#66ff99;background:#1f4a35;transform:scale(1.45)}
.gw-pname{color:#9fb0c8}
.gw-zoom{position:absolute;right:8px;bottom:8px;z-index:5;display:flex;align-items:center;gap:4px;background:rgba(11,13,18,.85);border:1px solid #2a3446;border-radius:10px;padding:4px}
.gw .gw-zoom button{min-width:36px;height:34px;padding:0 8px;border-radius:8px;background:rgba(27,34,48,.95);color:#cfe3ff;border:1px solid rgba(207,227,255,.22);font:600 15px/1 ui-monospace,Menlo,monospace;cursor:pointer}
.gw-zoom-pct{font:600 11px ui-monospace,Menlo,monospace;color:#9fb0c8;min-width:42px;text-align:center}
.gw-link{fill:none;stroke:transparent;stroke-width:18;pointer-events:stroke;cursor:pointer}
.gw-exec-link{stroke:#e8f0ff;stroke-width:3.5}
.gw-data-link{stroke:#7ad48a;stroke-width:3}
.gw-link-on{stroke:#ffe066;stroke-width:4.5}
.gw-rubber{stroke-dasharray:8 5;animation:gw-flow .5s linear infinite}
@keyframes gw-flow{to{stroke-dashoffset:-13}}
/* A node's own fields, compact. */
.gw-fields{padding:4px 8px 0;display:flex;flex-direction:column;gap:3px}
.gw-fields .st-row{min-height:26px;gap:5px}
.gw-fields .st-row label{flex:0 0 5.2em;font-size:10px;opacity:.75}
.gw-fields .st-row input,.gw-fields .st-row select,.gw-fields input,.gw-fields select{height:24px;font-size:11px;padding:0 5px;min-width:0;flex:1 1 auto;border-radius:6px;background:#151a24;color:#e8f0ff;border:1px solid #3a4454}
.gw-fields .st-row button,.gw-fields button{min-width:28px;height:24px;font-size:11px;padding:0 6px;border-radius:6px}
.gw-fields .st-choice{flex:1 1 auto;display:flex;min-width:0}
/* A verb argument's data pin, at the start of its row, on the node's edge. */
.gw-fields .gw-argrow{position:relative;padding-left:10px}
.gw-fields .gw-argrow > .gw-pin{position:absolute;left:-17px;top:50%;transform:translateY(-50%);min-height:0;padding:0;margin:0}
.gw-fields .gw-argrow > .gw-pin .gw-pname{display:none}
.gw-from{flex:1 1 auto;color:#7ad48a;font-size:11px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.gw-fields .gw-more{opacity:.7}
@media (max-width:1100px){
  .gw{grid-template-columns:1fr;grid-template-areas:"top" "main"}
  .gw .gw-panes{display:flex}
  .gw .wk-graph,.gw .wk-details{grid-area:main;display:none}
  .gw[data-pane="board"] .wk-graph{display:flex}
  .gw[data-pane="details"] .wk-details{display:flex}
}
`
