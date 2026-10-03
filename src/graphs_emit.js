//
// A map's graph: Blueprint-style nodes and links (docs/GRAPHS.md), as the
// studio keeps it and as the engine reads it.
//
// The document keeps `doc.graph = { vars, nodes, links }`, one per map -- a
// level's graph, holding as many event chains as it wants. A node is
// `{ id, type, pos: {x, y}, ...fields }`; a condition's or action's fields are its
// trigger-vocabulary arguments, with geometry held as references (`{edge}`,
// `{sector}`, `{trigger}`) exactly as a trigger card holds them, resolved to
// indices with their guards at emit by the same resolver the trigger table
// uses (lua_emit.js makeResolver). `pos` becomes the node's `meta`, which the
// runtime never reads. (Not `x, y` on the node: teleport, the spawns and vfx
// take arguments of those names, and a node's place on the board is not one.)
//
// The file is `maps/<map>.graph.json`, declared as one of the map's scripts
// after the trigger and graph runtimes; the server decodes it and hands it to
// graphs.load. The words are the trigger vocabulary's (events, conditions,
// actions) plus graph_vocab's flow and data nodes, and that file -- generated
// from graph_vocab.lua -- is what every pin here comes from.
//

export const GRAPH_EXT = '.graph.json'
export const graphFile = (mapName) => `${mapName}${GRAPH_EXT}`

export function newGraph () { return { vars: {}, nodes: [], links: [] } }

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

/** Does this map have a graph worth declaring? */
export const hasGraph = (doc) => (doc?.graph?.nodes?.length ?? 0) > 0

/** A node type's spec from graph_vocab.json, by name. */
export function nodeSpecs (gv) { return new Map((gv?.nodes ?? []).map((n) => [n.name, n])) }

/**
 * A node's pins, given its spec: exec and data, in and out. A `sequence`
 * has as many exits as its `count` says, up to the eight the vocabulary lists.
 */
export function pinsOf (node, spec) {
  if (!spec) return { execIn: [], execOut: [], dataIn: [], dataOut: [] }
  let execOut = spec.exec_out ?? []
  if (node.type === 'sequence') execOut = execOut.slice(0, Math.max(1, Math.min(execOut.length, node.count ?? 2)))
  return { execIn: spec.exec_in ?? [], execOut, dataIn: spec.data_in ?? [], dataOut: spec.data_out ?? [] }
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
export function graphProblems (graph, gv, tv) {
  const problems = []
  if (!graph) return problems
  const specs = nodeSpecs(gv)
  const events = new Set((tv?.events ?? []).map((e) => e.name))
  const conds = new Map((tv?.conditions ?? []).map((c) => [c.name, c]))
  const acts = new Map((tv?.actions ?? []).map((a) => [a.name, a]))
  const byId = new Map()
  for (const n of graph.nodes ?? []) {
    const where = `node '${n.id}'`
    if (!n.id || String(n.id).includes('.')) problems.push(`${where}: an id must be a non-empty name without dots`)
    if (byId.has(n.id)) problems.push(`${where}: two nodes have this id`)
    byId.set(n.id, n)
    const spec = specs.get(n.type)
    if (!spec) { problems.push(`${where}: no node type '${n.type}'`); continue }
    for (const a of spec.args ?? []) if (!a.optional && (n[a.name] === undefined || n[a.name] === '')) problems.push(`${where}: needs \`${a.name}\``)
    if (n.type === 'event' && n.event && !events.has(n.event)) problems.push(`${where}: no event '${n.event}'`)
    const verb = n.type === 'condition' ? conds.get(n.c) : n.type === 'action' ? acts.get(n.a) : null
    if (n.type === 'condition' && n.c && !verb) problems.push(`${where}: no condition '${n.c}'`)
    if (n.type === 'action' && n.a && !verb) problems.push(`${where}: no action '${n.a}'`)
    if (verb) {
      for (const a of verb.args ?? []) {
        if (a.optional || ['expect_neighbour', 'expect_tag', 'fn'].includes(a.name)) continue
        // side_is takes its side as a wall reference, which stands in for side.
        if (a.name === 'side' && n.side) continue
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
    const fp = pinsOf(from, specs.get(from.type)); const tp = pinsOf(to, specs.get(to.type))
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
export function emitGraph (graph, name, resolve) {
  const problems = []
  const nodes = (graph.nodes ?? []).map((n) => {
    const { pos, ...rest } = n
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
    }
    if (pos) out.meta = { x: Math.round(pos.x ?? 0), y: Math.round(pos.y ?? 0) }
    return out
  })
  const json = { graph: 1, name, vars: { ...(graph.vars ?? {}) }, nodes, links: (graph.links ?? []).map((l) => [...l]) }
  if (!Object.keys(json.vars).length) delete json.vars
  json.meta = { editor: 'studio' }
  return { json, text: JSON.stringify(json, null, 1) + '\n', problems }
}
