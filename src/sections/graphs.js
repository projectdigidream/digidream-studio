//
// Graphs: the game's graph and every map's, in one list.
//
// The game's graph (module.graph) runs once in the game VM -- the players
// coming and going, state kept across levels -- and a map's runs in its level.
// They talk by name: a `call` node starts the `on_call` nodes of that name on
// the other side (docs/GRAPHS.md, Calls). So the list says, for each graph,
// what it calls and what it answers, and a call that nothing answers is said.
//
import { el, button, muted } from '../ui.js'
import { graphProblems } from '../graphs_emit.js'

let S = null

/** Every graph of the module: [{ key, label, graph, game }], the game's first. */
function allGraphs () {
  return [{ key: 'game', label: 'the game', graph: S.module.graph ?? null, game: true },
    ...Object.keys(S.docs).sort().map((n) => ({ key: n, label: n, graph: S.docs[n].graph ?? null, game: false }))]
}

/** The names `kind` nodes ('call' or 'on_call') say, in one graph or all. */
function namesOf (kind, graphs = allGraphs()) {
  const out = new Set()
  for (const g of graphs) for (const n of g.graph?.nodes ?? []) if (n.type === kind && typeof n.name === 'string' && n.name) out.add(n.name)
  return out
}

/**
 * Calls nothing answers: [{ graph, name }]. A call to the game is answered
 * by the game's graph; a call to a level by the graph of whatever level the
 * entity is in -- any map's, as far as the studio can tell.
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

function openGraphOf (g) {
  if (g.game) return S.go('graph', 'game')
  // A map's graph is edited with its map open: its picks are on that map.
  ;(async () => { if (g.key !== S.docName) await S.openDoc(g.key); S.go('graph', g.key) })()
}

function showGraphs () {
  const body = []
  const V = S.vocab
  if (!V.graph) { S.ui.showSheet('Graphs', [muted('No graph vocabulary staged with this studio (graph_vocab.json).')]); return }
  const unanswered = unansweredCalls()
  for (const g of allGraphs()) {
    const nodes = g.graph?.nodes?.length ?? 0
    const problems = graphProblems(g.graph, V.graph, V.trigger, { game: g.game })
    const calls = [...namesOf('call', [g])]
    const answers = [...namesOf('on_call', [g])]
    const lines = [nodes ? `${nodes} node${nodes > 1 ? 's' : ''}` : 'empty']
    if (calls.length) lines.push(`calls ${calls.join(', ')}`)
    if (answers.length) lines.push(`answers ${answers.join(', ')}`)
    body.push(el('div', { class: 'st-trow', 'data-graph': g.key, onclick: () => openGraphOf(g) }, [
      el('span', { class: 'st-mark', text: g.game ? '🌐' : '🗺' }),
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: g.game ? 'The game\'s graph' : g.label }),
        el('div', { class: 'st-muted', text: lines.join(' · ') }),
        problems.length ? el('div', { class: 'st-danger', text: `${problems.length} problem${problems.length > 1 ? 's' : ''}: ${problems[0]}` }) : null
      ].filter(Boolean))
    ]))
    if (g.game) body.push(el('div', { class: 'st-section-head', text: '🗺 the maps\' graphs' }))
  }
  for (const u of unanswered) body.push(el('div', { class: 'st-warn-box', 'data-unanswered': u.name, text: `${u.graph} calls '${u.name}' (to ${u.to}), and no ${u.to === 'game' ? 'game graph' : 'map\'s graph'} has an on_call of that name` }))
  body.push(muted('The game\'s graph runs once for the whole game: it hears players arrive and leave (on_player_enter, on_player_leave), and its variables are kept from level to level. A map\'s graph runs in its level, with the map\'s rooms, walls and things to pick. They reach each other by name: a "call" node starts every "on_call" of that name on the other side, with an entity and a value.'))
  S.ui.showSheet('Graphs', body)
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.callNames = () => [...new Set([...namesOf('on_call'), ...namesOf('call')])].sort()
  S.unansweredCalls = unansweredCalls
  S.showGraphs = S.sectionAlias('graphs', showGraphs)
}
