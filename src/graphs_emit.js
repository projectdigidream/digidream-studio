//
// Graphs: Blueprint-style nodes and links (docs/GRAPHS.md), as the studio
// keeps them and as the engine reads them.
//
// MANY, EACH WITH ITS OWN NAME. A map keeps `doc.graphs = { <name>: graph }`
// and the module `module.graphs` the same way; a graph is `{ vars, nodes,
// links }`, holding as many event chains as it wants. Its name is its identity
// in its VM -- the engine refuses a second graph under a name already loaded
// there, and keys a graph's saved state by it -- so names are unique within a
// map (one level's VM) and within the module (the game VM). A level's graph
// and a game graph live in different VMs and may share a name.
//
// A node is `{ id, type, pos: {x, y}, ...fields }`; a condition's or action's
// fields are its trigger-vocabulary arguments, with geometry held as
// references (`{edge}`, `{sector}`, `{trigger}`) exactly as a trigger card
// holds them, resolved to indices with their guards at emit by the same
// resolver the trigger table uses (lua_emit.js makeResolver). `pos` becomes
// the node's `meta`, which the runtime never reads. (Not `x, y` on the node:
// teleport, the spawns and vfx take arguments of those names.)
//
// A map's graph is the file `maps/<map>.<name>.graph.json`, declared as one of
// the map's scripts after the trigger and graph runtimes; a module's is
// `maps/module.<name>.graph.json`, a module.txt `game` line. Map names have no
// dots and none can be `module` (module.lua is taken), so no two collide.
//

export const GRAPH_EXT = '.graph.json'
export const NAME_RE = /^[a-z0-9_]{1,32}$/
/** The name a map's first graph is given, and a module's. */
export const MAP_GRAPH = 'main'
export const GAME_NAME = 'game'

/** A map's graph's file. */
export const graphFile = (mapName, name = MAP_GRAPH) => `${mapName}.${name}${GRAPH_EXT}`
/** A module's graph's file, run once in the game VM. */
export const gameGraphFile = (name = GAME_NAME) => `module.${name}${GRAPH_EXT}`

export function newGraph () { return { vars: {}, nodes: [], links: [] } }

/** "Doors & lifts" -> "doors_lifts": a name the engine and the files take. */
export function cleanGraphName (s) {
  return String(s ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 32)
}

/**
 * The graphs of a map or the module, [[name, graph]], in their order. A
 * document from before there were many (one `graph`, not yet migrated) reads
 * as that one under its migrated name.
 */
export function graphsOf (owner) {
  if (owner?.graph && !owner.graphs) return [[owner.sectors ? MAP_GRAPH : GAME_NAME, owner.graph]]
  return Object.entries(owner?.graphs ?? {})
}

/** The ones worth writing: a graph with no nodes does nothing, and is not declared. */
export const liveGraphs = (owner) => graphsOf(owner).filter(([, g]) => (g?.nodes?.length ?? 0) > 0)

/** Does this map (or the module) have a graph worth declaring? */
export const hasGraph = (owner) => liveGraphs(owner).length > 0

/** Every graph anywhere: [{ scope: 'game' | 'map', map, name, graph }], the module's first. */
export function everyGraph (module, docs) {
  const out = graphsOf(module).map(([name, graph]) => ({ scope: 'game', map: null, name, graph }))
  for (const d of docs ?? []) for (const [name, graph] of graphsOf(d)) out.push({ scope: 'map', map: d.name, name, graph })
  return out
}

/**
 * A graph's address, as the Graph section's route says it: `game:<name>` for
 * one of the module's, `<map>:<name>` for a map's. A bare `game` or `<map>` is
 * that scope's first graph (or, with none, the one a first edit makes).
 */
export const graphRoute = (scope, map, name) => `${scope === 'game' ? 'game' : map}${name ? `:${name}` : ''}`
export function parseGraphRoute (arg) {
  if (!arg) return { scope: 'map', map: null, name: null }
  const [head, name = null] = String(arg).split(':')
  return head === 'game' ? { scope: 'game', map: null, name } : { scope: 'map', map: head, name }
}

/**
 * Graphs saved when each map (and the module) had ONE, as `graph`: it is
 * now the first of `graphs`, named `main` on a map and `game` on the module.
 * Returns whether anything moved.
 */
export function migrateGraphs (owner, name) {
  if (!owner?.graph) return false
  owner.graphs ??= {}
  owner.graphs[owner.graphs[name] ? cleanGraphName(`${name}_2`) : name] = owner.graph
  delete owner.graph
  return true
}

/**
 * Graphs saved when a node's place on the board was its `x, y` -- which
 * collided with the arguments of that name (teleport's, the spawns') -- moved
 * to `pos`. Returns whether anything moved.
 */
export function migrateGraph (graph) {
  let moved = false
  for (const n of graph?.nodes ?? []) {
    if (n.pos || (n.x === undefined && n.y === undefined)) continue
    n.pos = { x: n.x ?? 0, y: n.y ?? 0 }
    delete n.x; delete n.y
    moved = true
  }
  return moved
}

/** A node type's spec from graph_vocab.json, by name. */
export function nodeSpecs (gv) { return new Map((gv?.nodes ?? []).map((n) => [n.name, n])) }

// A verb's arguments the studio writes itself, never a person: no pins.
const NOT_PINNED = new Set(['expect_neighbour', 'expect_tag', 'fn', 'side'])

/** The verb (trigger_vocab entry) a condition or action node runs, or null. */
export function verbOf (node, tv) {
  if (node.type === 'condition') return (tv?.conditions ?? []).find((c) => c.name === node.c) ?? null
  if (node.type === 'action') return (tv?.actions ?? []).find((a) => a.name === node.a) ?? null
  return null
}

/**
 * A node's pins, given its spec: exec and data, in and out. A `sequence`
 * has as many exits as its `count` says, up to the eight the vocabulary lists.
 * A condition's or action's arguments of a PINNABLE type are data inputs too
 * (graph_vocab `data_in_args`, `pinnable_types`): linked, the argument takes
 * the value at run time. `argPins` says which of `dataIn` are those.
 */
export function pinsOf (node, spec, tv = null, gv = null) {
  if (!spec) return { execIn: [], execOut: [], dataIn: [], dataOut: [], argPins: [] }
  let execOut = spec.exec_out ?? []
  if (node.type === 'sequence') execOut = execOut.slice(0, Math.max(1, Math.min(execOut.length, node.count ?? 2)))
  const argPins = []
  if (spec.data_in_args && tv) {
    const pinnable = new Set(gv?.pinnable_types ?? ['int', 'fx', 'string', 'bool', 'enum', 'sector', 'value'])
    for (const a of verbOf(node, tv)?.args ?? []) if (pinnable.has(a.type) && !NOT_PINNED.has(a.name)) argPins.push(a.name)
    return { execIn: spec.exec_in ?? [], execOut, dataIn: [...(spec.data_in ?? []), ...argPins], dataOut: spec.data_out ?? [], argPins }
  }
  // A world node's data input named after one of its arguments (teleport's
  // x, a door's sector, damage's amount) is that argument's pin too.
  const own = new Set((spec.args ?? []).map((a) => a.name))
  for (const d of spec.data_in ?? []) if (own.has(d)) argPins.push(d)
  return { execIn: spec.exec_in ?? [], execOut, dataIn: spec.data_in ?? [], dataOut: spec.data_out ?? [], argPins }
}

const split = (s) => { const i = String(s).lastIndexOf('.'); return i < 0 ? [s, ''] : [s.slice(0, i), s.slice(i + 1)] }

/**
 * What the studio can say about a graph before the runtime does: a node type,
 * an event, a condition or an action the vocabularies lack; a link naming a
 * pin that is not there, joining exec to data, or going the wrong way; an exec
 * exit or a data input with two links; a data cycle; a verb missing an
 * argument it needs. The runtime (graphs.lua) is still the judge -- this is so
 * the author hears it while drawing.
 *
 * @param gv  graph_vocab.json
 * @param tv  trigger_vocab.json
 * @returns [string]
 */
// --- variables and properties (docs/GRAPH_VARIABLES.md) ----------------------------------
//
// get_var, set_var and add_var take, as `var`, a name in the graph's own
// `vars` or one of graph_vocab's `properties`: an entity's own facts (hp,
// position ...) and its movement rules, each `read` or `read_write`.

export const VAR_NODES = ['get_var', 'set_var', 'add_var']
const NUMERIC = new Set(['int', 'number'])
/** The properties a graph can reach, by name (empty for an engine without them). */
export const propertiesOf = (gv) => new Map((gv?.properties ?? []).map((p) => [p.name, p]))
/** Can this node use that property: get any; set a settable one; add a settable number. */
export function propertyFits (type, p) {
  if (!p) return false
  if (type === 'get_var') return true
  if (p.access !== 'read_write') return false
  return type !== 'add_var' || NUMERIC.has(p.type)
}

/**
 * What a var node's `var` may be, grouped: [{ group, value, label, doc }] --
 * the graph's own variables, then the properties this node may use.
 */
export function varChoices (graph, gv, type) {
  const out = []
  for (const [k, v] of Object.entries(graph?.vars ?? {})) out.push({ group: 'this graph', value: k, label: `${k} (starts at ${JSON.stringify(v)})`, doc: '' })
  for (const p of gv?.properties ?? []) {
    if (!propertyFits(type, p)) continue
    out.push({ group: p.of === 'movement' ? 'its movement rules' : 'the entity', value: p.name, label: `${p.name} · ${p.type}${p.access === 'read' ? ' · read only' : ''}`, doc: p.doc ?? '' })
  }
  return out
}

// --- a number from a variable ----------------------------------------------------------
//
// A numeric argument with a data input (a verb's pinnable one, or a world
// node's in its data_in) can be held as { var: NAME }: the graph's variable or
// a readable numeric property. Written out, it is a get_var of that name linked
// into the argument's pin -- a node the board never shows -- so the engine
// sees an ordinary link and needs nothing new.

const NUMERIC_ARG = new Set(['int', 'number', 'fx'])
export const isVarRef = (v) => !!v && typeof v === 'object' && !Array.isArray(v) && typeof v.var === 'string' && Object.keys(v).length === 1

/** The arguments of a node that can take a variable: numeric, with a data input. */
export function bindableArgs (node, spec, tv, gv) {
  const p = pinsOf(node, spec, tv, gv)
  const args = (node.type === 'condition' || node.type === 'action') ? (verbOf(node, tv)?.args ?? []) : (spec?.args ?? [])
  const ins = new Set([...p.argPins, ...p.dataIn])
  return args.filter((a) => NUMERIC_ARG.has(a.type) && ins.has(a.name)).map((a) => a.name)
}

/** What a number may be taken from: the graph's variables, then the numeric properties. */
export function numberSources (graph, gv) {
  return varChoices(graph, gv, 'get_var').filter((c) => c.group === 'this graph' || NUMERIC.has(propertiesOf(gv).get(c.value)?.type))
}

/** The hidden get_var a bound argument is written as: its id. */
export const boundId = (nodeId, arg) => `${nodeId}__${arg}`

/** A var node's problem, as the engine refuses it at load; null when it is fine. */
export function varProblem (n, graph, props) {
  if (!VAR_NODES.includes(n.type) || n.var === undefined || n.var === '') return null
  const own = Object.prototype.hasOwnProperty.call(graph?.vars ?? {}, n.var)
  const p = props.get(n.var)
  if (own) return null
  if (!p) return `\`${n.var}\` is neither one of this graph's variables nor a property an entity has`
  if (n.type !== 'get_var' && p.access !== 'read_write') return `${n.var} can only be read -- a graph cannot set it`
  if (n.type === 'add_var' && !NUMERIC.has(p.type)) return `${n.var} is not a number, so nothing can be added to it`
  return null
}

export function graphProblems (graph, gv, tv, { game = false, paths = null, maps = null } = {}) {
  const problems = []
  if (!graph) return problems
  // A GAME graph (a module's, in the game VM) may use only what the game
  // hears and what does not act on a level (graph_vocab.game).
  const gameOk = { event: new Set(gv?.game?.events ?? []), condition: new Set(gv?.game?.conditions ?? []), action: new Set(gv?.game?.actions ?? []) }
  const linkedInto = new Set((graph.links ?? []).map((l) => l?.[1]))
  const specs = nodeSpecs(gv)
  const events = new Set((tv?.events ?? []).map((e) => e.name))
  const conds = new Map((tv?.conditions ?? []).map((c) => [c.name, c]))
  const acts = new Map((tv?.actions ?? []).map((a) => [a.name, a]))
  const byId = new Map()
  // Properties, when the engine has them: a variable may not take one's name,
  // and a var node names a variable or a property it may use.
  const props = propertiesOf(gv)
  if (props.size) for (const k of Object.keys(graph.vars ?? {})) if (props.has(k)) problems.push(`variable ${k}: an entity has a property called ${k} -- give the variable another name`)
  for (const n of graph.nodes ?? []) {
    const where = `node '${n.id}'`
    if (props.size) { const vp = varProblem(n, graph, props); if (vp) problems.push(`${where}: ${vp}`) }
    if (!n.id || String(n.id).includes('.')) problems.push(`${where}: an id must be a non-empty name without dots`)
    if (byId.has(n.id)) problems.push(`${where}: two nodes have this id`)
    byId.set(n.id, n)
    const spec = specs.get(n.type)
    if (!spec) { problems.push(`${where}: no node type '${n.type}'`); continue }
    // Numbers taken from a variable: only where the argument has an input, from a name there is.
    const bindable = new Set(bindableArgs(n, spec, tv, gv))
    for (const [k, v] of Object.entries(n)) {
      if (!isVarRef(v)) continue
      if (!bindable.has(k)) problems.push(`${where}: \`${k}\` cannot be taken from a variable -- the engine gives it no input`)
      else if (linkedInto.has(`${n.id}.${k}`)) problems.push(`${where}: \`${k}\` is both linked and taken from ${v.var} -- one or the other`)
      else if (!Object.prototype.hasOwnProperty.call(graph.vars ?? {}, v.var) && !props.has(v.var)) problems.push(`${where}: \`${k}\` is taken from ${v.var}, which is neither one of this graph's variables nor a property`)
    }
    for (const a of spec.args ?? []) {
      const v = n[a.name]
      if (isVarRef(v)) continue
      if (v === undefined || v === '') { if (!a.optional && !linkedInto.has(`${n.id}.${a.name}`)) problems.push(`${where}: needs \`${a.name}\``); continue }
      // The runtime checks a world node's fields by type: a number is a number.
      if (a.type === 'number' && typeof v !== 'number') problems.push(`${where}: \`${a.name}\` should be a number`)
      if (a.type === 'enum' && a.values && !a.values.includes(v)) problems.push(`${where}: \`${a.name}\` is one of ${a.values.join(', ')}`)
    }
    // What the game has no level for: refused in the game's graph.
    if (game && spec.level_only) problems.push(`${where}: a ${n.type} acts on a level, and the game has none -- call the level's graph (a call node, to level) and do it there`)
    // Another map the module lacks: the engine refuses the graph at load. (A
    // map given by its number is the server's to judge.)
    if (maps && n.type === 'change_map' && typeof n.level === 'string' && n.level !== '' && !/^\d+$/.test(n.level) && !maps.includes(n.level.toLowerCase().replace(/\.(map|dnpm)$/, ''))) {
      problems.push(`${where}: no map called ${n.level} in the module, and the server refuses a graph that goes to one it does not have`)
    }
    // A camera path the map lacks: the engine refuses the graph at load.
    if (paths && n.path !== undefined && (n.type === 'camera_flythrough' || n.type === 'camera_track') && !paths.has(n.path)) {
      problems.push(`${where}: no camera path with tag ${n.path} on this map (Camera → camera paths)`)
    }
    // A sector node needs its sector: picked, linked, or a tag.
    if (spec.category === 'sector' && (spec.exec_out ?? []).length && n.sector === undefined && n.tag === undefined && !linkedInto.has(`${n.id}.sector`)) {
      problems.push(`${where}: a ${n.type} needs a sector -- picked on the map, linked from sector_of, or a tag`)
    }
    if (game && n.type === 'event' && n.event && !gameOk.event.has(n.event)) {
      problems.push(`${where}: '${n.event}' does not reach the game -- a game graph starts from ${[...gameOk.event].join(', ')}`)
    } else if (!game && n.type === 'event' && ['on_player_enter', 'on_player_leave'].includes(n.event)) {
      problems.push(`${where}: '${n.event}' reaches only the game's graph`)
    } else if (n.type === 'event' && n.event && !events.has(n.event) && !gameOk.event.has(n.event)) problems.push(`${where}: no event '${n.event}'`)
    if (game && (n.type === 'condition' || n.type === 'action')) {
      const name = n.type === 'condition' ? n.c : n.a
      if (name && !gameOk[n.type].has(name)) problems.push(`${where}: ${n.type} '${name}' acts on a level, and the game has none -- call the level's graph (a call node, to level) and do it there`)
    }
    const verb = n.type === 'condition' ? conds.get(n.c) : n.type === 'action' ? acts.get(n.a) : null
    if (n.type === 'condition' && n.c && !verb) problems.push(`${where}: no condition '${n.c}'`)
    if (n.type === 'action' && n.a && !verb) problems.push(`${where}: no action '${n.a}'`)
    if (verb) {
      for (const a of verb.args ?? []) {
        if (a.optional || ['expect_neighbour', 'expect_tag', 'fn'].includes(a.name)) continue
        // side_is takes its side as a wall reference, which stands in for side.
        if (a.name === 'side' && n.side) continue
        // A linked argument is supplied at run time.
        if (linkedInto.has(`${n.id}.${a.name}`)) continue
        if (n[a.name] === undefined || n[a.name] === '') problems.push(`${where}: ${n.c ?? n.a} needs \`${a.name}\``)
      }
    }
  }
  const execOutUsed = new Set()
  const dataInUsed = new Set()
  const dataEdges = new Map()
  for (const [i, link] of (graph.links ?? []).entries()) {
    const where = `link ${i + 1}`
    if (!Array.isArray(link) || link.length !== 2) { problems.push(`${where}: must be [from, to]`); continue }
    const [fid, fpin] = split(link[0]); const [tid, tpin] = split(link[1])
    const from = byId.get(fid); const to = byId.get(tid)
    if (!from || !to) { problems.push(`${where}: names a node that is not there (${link.join(' → ')})`); continue }
    const fp = pinsOf(from, specs.get(from.type), tv, gv); const tp = pinsOf(to, specs.get(to.type), tv, gv)
    const execLink = fp.execOut.includes(fpin) && tp.execIn.includes(tpin)
    const dataLink = fp.dataOut.includes(fpin) && tp.dataIn.includes(tpin)
    if (!execLink && !dataLink) { problems.push(`${where}: ${link[0]} cannot feed ${link[1]} (an output to an input, exec to exec, data to data)`); continue }
    if (execLink) {
      if (execOutUsed.has(link[0])) problems.push(`${where}: ${link[0]} already leads somewhere; an exec exit goes to one place`)
      execOutUsed.add(link[0])
    } else {
      if (dataInUsed.has(link[1])) problems.push(`${where}: ${link[1]} already has a value feeding it`)
      dataInUsed.add(link[1])
      ;(dataEdges.get(fid) ?? dataEdges.set(fid, []).get(fid)).push(tid)
    }
  }
  // A data value cannot depend on itself.
  const state = new Map()
  const visit = (id) => {
    if (state.get(id) === 1) return true
    if (state.get(id) === 2) return false
    state.set(id, 1)
    for (const next of dataEdges.get(id) ?? []) if (visit(next)) return true
    state.set(id, 2)
    return false
  }
  for (const id of dataEdges.keys()) if (visit(id)) { problems.push(`the data links form a cycle through '${id}'`); break }
  return problems
}

/**
 * The file, as the engine reads it.
 * @param resolve  lua_emit's makeResolver for this map, for verb arguments
 * @returns { json, text, problems }
 */
export function emitGraph (graph, name, resolve, plain = null, { panels = null } = {}) {
  const problems = []
  // Numbers taken from a variable become hidden get_var nodes linked in.
  const bound = []
  const nodes = (graph.nodes ?? []).map((n) => {
    const { pos, show, ...withRefs } = n
    const rest = {}
    for (const [k, v] of Object.entries(withRefs)) {
      if (isVarRef(v)) bound.push({ node: n.id, arg: k, var: v.var, pos })
      else rest[k] = v
    }
    let out = rest
    if (n.type === 'condition' || n.type === 'action') {
      const where = `graph node '${n.id}'`
      // A wall picked for side_is is held as `side: {edge}`, as on a trigger
      // card; the resolver writes the side index and its expect_neighbour
      // guard from it, and every other place likewise.
      const args = rest
      out = resolve ? resolve(args, where) : args
      if (!resolve && Object.values(args).some((v) => v && typeof v === 'object' && !Array.isArray(v))) {
        problems.push(`${where}: names a place in a map, which a graph without one cannot resolve`)
      }
    } else if (Object.values(rest).some((v) => v && typeof v === 'object' && !Array.isArray(v))) {
      // A world node's picked sector or wall: the bare index. Its fields are
      // checked by name, so the trigger table's guards have no place there.
      if (plain) out = plain(rest, `graph node '${n.id}'`)
      else problems.push(`graph node '${n.id}': names a place in a map, which a graph without one cannot resolve`)
    }
    if (pos) out.meta = { x: Math.round(pos.x ?? 0), y: Math.round(pos.y ?? 0) }
    // Which optional arguments the board shows: the editor's, like the place.
    if (show?.length) out.meta = { ...(out.meta ?? {}), show: [...show] }
    return out
  })
  const links = (graph.links ?? []).map((l) => [...l])
  for (const b of bound) {
    const id = boundId(b.node, b.arg)
    nodes.push({ id, type: 'get_var', var: b.var, meta: { x: Math.round((b.pos?.x ?? 0) - 160), y: Math.round(b.pos?.y ?? 0), bound: `${b.node}.${b.arg}` } })
    links.push([`${id}.value`, `${b.node}.${b.arg}`])
  }
  const json = { graph: 1, name, vars: { ...(graph.vars ?? {}) }, nodes, links }
  if (!Object.keys(json.vars).length) delete json.vars
  // The panels its nodes name, as the runtime reads them (docs/PANELS.md 2).
  if (panels && Object.keys(panels).length) json.panels = panels
  json.meta = { editor: 'studio' }
  // The board's notes and links' bends: the editor's, never run (graph_vocab
  // graph_fields: meta is "layout, comments").
  if (graph.notes?.length) json.meta.notes = graph.notes.map((n) => ({ ...n }))
  if (graph.bends && Object.keys(graph.bends).length) json.meta.bends = Object.fromEntries(Object.entries(graph.bends).map(([k, v]) => [k, v.map((p) => ({ x: p.x, y: p.y }))]))
  return { json, text: JSON.stringify(json, null, 1) + '\n', problems }
}
