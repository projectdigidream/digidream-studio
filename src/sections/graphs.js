//
// Graphs: every graph of the module, the game's and each map's, in one list.
//
// A module and each of its maps may hold several graphs, each with its own
// name (graphs_emit.js). The game's run once in the game VM -- the players
// coming and going, state kept across levels -- and a map's in its level.
// They talk by name: a `call` node starts the `on_call` nodes of that name on
// the other side (docs/GRAPHS.md, Calls). So the list says, for each graph,
// what it calls and what it answers, and a call that nothing answers is said.
//
import { buttonNames } from '../keys_emit.js'
import { el, button, muted, ask, withIcon, icon } from '../ui.js'
import { graphProblems, everyGraph, graphRoute, newGraph, cleanGraphName, NAME_RE, MAP_GRAPH, GAME_NAME } from '../graphs_emit.js'

let S = null

/** Every graph: [{ key, scope, map, name, label, graph, game }], the game's first. */
function allGraphs () {
  return everyGraph(S.module, Object.keys(S.docs).sort().map((n) => S.docs[n])).map((g) => ({
    ...g, game: g.scope === 'game', key: graphRoute(g.scope, g.map, g.name), label: g.scope === 'game' ? `the game · ${g.name}` : `${g.map} · ${g.name}`
  }))
}

/** The names `kind` nodes ('call' or 'on_call') say, in the graphs given (all of them by default). */
function namesOf (kind, graphs = allGraphs()) {
  const out = new Set()
  for (const g of graphs) for (const n of g.graph?.nodes ?? []) if (n.type === kind && typeof n.name === 'string' && n.name) out.add(n.name)
  return out
}

/**
 * Calls nothing answers: [{ graph, name, to }]. A call to the game is
 * answered by any of the game's graphs; a call to a level by the graphs of
 * whatever level the entity is in -- any map's, as far as the studio can tell.
 */
export function unansweredCalls () {
  const graphs = allGraphs()
  const game = namesOf('on_call', graphs.filter((g) => g.game))
  const levels = namesOf('on_call', graphs.filter((g) => !g.game))
  const out = []
  for (const g of graphs) {
    for (const n of g.graph?.nodes ?? []) {
      if (n.type !== 'call' || !n.name) continue
      const heard = n.to === 'game' ? game : levels
      if (!heard.has(n.name)) out.push({ graph: g.label, name: n.name, to: n.to })
    }
  }
  return out
}

/** Open one: a map's is edited with its map open, as its picks are on that map. */
async function openGraphOf (scope, map, name) {
  if (scope === 'map' && map !== S.docName) await S.openDoc(map)
  S.go('graph', graphRoute(scope, map, name))
}

/** A new graph in the game (map null) or a map, under a name nothing there has. */
export async function newGraphIn (map = null) {
  const owner = map ? S.docs[map] : S.module
  const taken = new Set(Object.keys(owner.graphs ?? {}))
  const raw = await ask('graph name (letters, digits, underscore)', taken.size ? '' : (map ? MAP_GRAPH : GAME_NAME))
  const name = cleanGraphName(raw)
  if (!name) return null
  if (!NAME_RE.test(name) || taken.has(name)) { S.status(`${map ?? 'the game'} has a graph called ${name} already`, 'warn'); return null }
  ;(owner.graphs ??= {})[name] = newGraph()
  if (map) { if (map === S.docName) S.commit(); else S.save() }
  S.moduleChanged()
  await openGraphOf(map ? 'map' : 'game', map, name)
  return name
}

function showGraphs () {
  const body = []
  const V = S.vocab
  if (!V.graph) { S.ui.showSheet('Graphs', [muted('No graph vocabulary staged with this studio (graph_vocab.json).')]); return }
  const unanswered = unansweredCalls()
  const all = allGraphs()
  const row = (g) => {
    const nodes = g.graph?.nodes?.length ?? 0
    const problems = graphProblems(g.graph, V.graph, V.trigger, { buttons: buttonNames(S.module), panels: S.module.panels ?? {}, game: g.game, maps: Object.keys(S.docs), paths: g.game ? null : new Set((S.docs[g.map]?.paths ?? []).map((x) => x.tag)) })
    const calls = [...namesOf('call', [g])]
    const answers = [...namesOf('on_call', [g])]
    const lines = [nodes ? `${nodes} node${nodes > 1 ? 's' : ''}` : 'empty -- not written until it has a node']
    if (calls.length) lines.push(`calls ${calls.join(', ')}`)
    if (answers.length) lines.push(`answers ${answers.join(', ')}`)
    return el('div', { class: 'st-trow', 'data-graph': g.key, onclick: () => openGraphOf(g.scope, g.map, g.name) }, [
      icon(g.game ? 'action.scopegame' : 'section.graphs', 'st-mark'),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: g.name }),
        el('div', { class: 'st-muted', text: lines.join(' · ') }),
        problems.length ? el('div', { class: 'st-danger', text: `${problems.length} problem${problems.length > 1 ? 's' : ''}: ${problems[0]}` }) : null
      ].filter(Boolean))
    ])
  }
  body.push(el('div', { class: 'st-section-head' }, withIcon('action.scopegame', 'the game\'s graphs')))
  for (const g of all.filter((x) => x.game)) body.push(row(g))
  body.push(button('+ new graph for the game', () => newGraphIn(null)))
  for (const m of Object.keys(S.docs).sort()) {
    body.push(el('div', { class: 'st-section-head' }, withIcon('action.scopemap', `${m}`)))
    for (const g of all.filter((x) => x.map === m)) body.push(row(g))
    body.push(button(`+ new graph on ${m}`, () => newGraphIn(m)))
  }
  for (const u of unanswered) body.push(el('div', { class: 'st-warn-box', 'data-unanswered': u.name, text: `${u.graph} calls '${u.name}' (to ${u.to}), and no ${u.to === 'game' ? 'game graph' : 'map\'s graph'} has an on_call of that name` }))
  body.push(muted('As many graphs as you like, each with its own name: one for the doors, one for the shop, one for the boss. The game\'s run once for the whole game -- they hear players arrive and leave, and their variables are kept from level to level. A map\'s run in its level, with the map\'s rooms, walls and things to pick; each takes one of the map\'s script slots. Graphs reach each other by name: a "call" node starts every "on_call" of that name on the other side, with an entity and a value.'))
  S.ui.showSheet('Graphs', body)
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.callNames = () => [...new Set([...namesOf('on_call'), ...namesOf('call')])].sort()
  S.unansweredCalls = unansweredCalls
  S.newGraphIn = newGraphIn
  S.showGraphs = S.sectionAlias('graphs', showGraphs)
}
