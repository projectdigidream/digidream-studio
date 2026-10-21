//
// THE PLAY LOG: why a play-test did not start, readable in the studio.
//
// On a phone there is no console and no logcat to ask. So each Play leaves
// three files in the game tree the studio already writes (logs/ under the
// shell's writable root), started afresh every time:
//
//   play-studio.log   the studio's: what it wrote and launched -- the map, the
//                     module.txt, the scripts the map declares, what the bake
//                     warned about, and the launch's own answer;
//   play-server.log   the game server's every line (the shell writes it): a
//                     map that will not load is refused here, by name and line;
//   play-game.log     the game page's console (the shell writes it): an
//                     uncaught error, a refused message, a failed fetch.
//
// The Play log page reads them back, the lines that look like a failure
// first, and shares them as one text file. It opens by itself when a launch
// fails, and Home says when the last play-test left something to read.
//
import { shell, hasShell } from './bridge.js'
import { el, button, muted, withIcon, icon } from './ui.js'
import { STUDIO_VERSION } from './version.js'
import { execRoots, graphsOf } from './graphs_emit.js'

export const LOG_DIR = 'logs'
export const FILES = [
  ['studio', 'play-studio.log', 'what the studio wrote and launched'],
  ['server', 'play-server.log', 'the game server'],
  ['game', 'play-game.log', 'the game page']
]
const LAST_KEY = 'dnp.studio.lastplay'
const MAX_LINES = 2000

// A line that says something went wrong. Words, not levels: the server and
// the Lua runtimes say what failed in sentences.
const BAD = /\b(errors?|refus\w*|fail\w*|problems?\b(?! --)|not loaded|exited|cannot|could not|couldn't|no such|uncaught|exception|traceback|attempt to|nil value|missing|not found|undefined is not|is not a function|stopped (?:during|while|unexpectedly)|has no|unknown|invalid)\b/i
const FINE = /\b0 problems\b|\bno problems\b|loads clean/i
// The graph runtime's run-time warnings (engine/maps/scripts/graphs.lua): a
// node skipped for a bad value or no entity, a run or a call stopped, an action
// on no player, a panel clash. Its load summary ("N nodes, M links") is not one.
const GRAPH_WARN = /\[graphs\].*(-- skipped|was stopped|-- stopped|acted on no player|is the one used)/

/** A line as shown: the device's long path to the game tree dropped (`modules/x/maps/first.dnpm`). */
export const tidy = (line) => line.replace(/(^|[\s[:(])\/[^[\]()]*?\/game\//g, '$1')

/** Does this line look like a failure? */
// A Lua error, at run time: `[string "…/mobs.lua"]:2951: no prop named 'bolt'`.
// Whatever its words, a script stopped there (a monster that never fires).
const LUA_ERROR = /\]:\d+: \S/

export const isBad = (line) => {
  if (GRAPH_WARN.test(line) || LUA_ERROR.test(line)) return true
  if (FINE.test(line)) return false
  // The game page's warnings (a missing sprite) are in its log, not in the
  // list of failures -- unless they say something failed outright.
  if (/^\[(warning|log|info|verbose|debug)\]/.test(line)) return /\b(errors?|uncaught|refus\w*|fail\w*|exception)\b/i.test(line)
  return BAD.test(line)
}

/**
 * The studio's part, written before the launch: what Play wrote and asked for.
 * @param r   emitModule's result
 */
export async function writeStudioLog (S, r, { map }) {
  const L = []
  const now = new Date()
  L.push(`[studio] play-test of ${S.module.id}/maps/${map}, ${now.toISOString()}, studio ${STUDIO_VERSION}`)
  const txt = r.files.find((f) => f.path === 'module.txt')
  if (txt) for (const line of String(txt.bytes).trim().split('\n')) L.push(`[studio] module.txt: ${line}`)
  const mapFile = r.files.find((f) => f.path === `maps/${map.replace(/\.dnpm$/, '.map')}`)
  if (mapFile) for (const line of String(mapFile.bytes).split('\n').filter((l) => /^script\s/.test(l))) L.push(`[studio] ${map.replace(/\.dnpm$/, '.map')} declares: ${line.slice(7).trim()}`)
  for (const p of r.problems ?? []) {
    for (const e of p.errors ?? []) L.push(`[studio] ${p.map}: error: ${e.line ? `line ${e.line}: ` : ''}${e.msg}`)
    for (const w of p.warnings ?? []) L.push(`[studio] ${p.map}: warning: ${w.sector ? `${w.sector}: ` : ''}${w.msg}`)
  }
  const bytes = r.files.reduce((n, f) => n + (typeof f.bytes === 'string' ? f.bytes.length : f.bytes.byteLength), 0)
  L.push(`[studio] wrote ${r.files.length} files (${Math.round(bytes / 1024)} KB) under modules/${S.module.id}`)
  L.push('[studio] launching the game')
  S.playLogLines = L
  // What the last one said on the graph boards is old news now.
  S.playFailures = null
  await saveStudioLog(L)
  try { localStorage.setItem(LAST_KEY, JSON.stringify({ at: now.getTime(), module: S.module.id, map })) } catch {}
}

/** One more line of the studio's own, written through at once. */
export async function noteStudioLog (S, line) {
  S.playLogLines = [...(S.playLogLines ?? []), `[studio] ${line}`]
  await saveStudioLog(S.playLogLines)
}

async function saveStudioLog (lines) {
  if (!hasShell()) return
  try { await shell.writeFile(`${LOG_DIR}/play-studio.log`, new TextEncoder().encode(lines.join('\n') + '\n')) } catch {}
}

/** The last play-test this device ran: { at, module, map } or null. */
export function lastPlay () {
  try { return JSON.parse(localStorage.getItem(LAST_KEY) ?? 'null') } catch { return null }
}

/** The three logs, read back: { studio: [lines], server: [...], game: [...] }. */
export async function readLogs () {
  const out = {}
  for (const [key, file] of FILES) {
    let text = ''
    if (hasShell()) {
      try {
        const b = await shell.readFile(`${LOG_DIR}/${file}`)
        text = b == null ? '' : typeof b === 'string' ? b : new TextDecoder().decode(b)
      } catch { text = '' }
    }
    const lines = text.split('\n').filter((l) => l !== '')
    out[key] = lines.length > MAX_LINES ? [`… ${lines.length - MAX_LINES} earlier lines not shown`, ...lines.slice(-MAX_LINES)] : lines
  }
  return out
}

/**
 * The failures, across the three: [{ log, line, times }]. A line that comes
 * again (a monster failing the same way at every shot) is one, counted.
 */
export function failures (logs) {
  const out = []
  const seen = new Map()
  for (const [key] of FILES) {
    for (const line of logs[key] ?? []) {
      if (!isBad(line)) continue
      const k = `${key}\n${line}`
      if (seen.has(k)) { seen.get(k).times++; continue }
      const f = { log: key, line, times: 1 }
      seen.set(k, f)
      out.push(f)
    }
  }
  return out
}

// THE GRAPH THAT FAILED, ON ITS BOARD. The graph runtime names a graph and
// often a node (`[graphs] main: node 'say' (subtitle) acted on no player --
// ...`), and a graph that would not load is named by its file. An action that
// raised stops the hook that ran it (`[lua] on_touch error (tick 979): entity 1
// is a player; a script cannot remove it`): no graph is named, so it is the
// graph's whose starts that hook feeds, at the node that removes something
// when that is what failed.
const HOOK_STARTS = { on_touch: ['when_prop_touched'], on_prop_use: ['when_prop_used'], on_interact: ['when_wall_used'] }
const GRAPH_LINE = /\[graphs\] ([^\s:]+): (.*)$/
const HOOK_ERROR = /\] (on_\w+) error(?: \(tick \d+\))?: (.+)$/

/**
 * What the last play-test's failures say about one graph: [{ node, text, times }],
 * `node` null for the graph as a whole.
 * @param bad    failures(logs)
 * @param name   the graph's name, as the runtime says it
 * @param file   its file (graphs_emit graphFile / gameGraphFile), as a load says it
 */
export function graphFailures (bad, { name, file, graph }) {
  // The same thing said at another tick is one line, counted.
  const said = new Map()
  const out = { push: (f) => { const k = `${f.node}\n${f.text}`; if (said.has(k)) said.get(k).times += f.times; else said.set(k, { ...f }) } }
  const ids = new Set((graph?.nodes ?? []).map((n) => n.id))
  const roots = execRoots(graph ?? {})
  for (const b of bad ?? []) {
    const line = tidy(b.line)
    const g = GRAPH_LINE.exec(line)
    if (g && (g[1] === name || g[1] === file)) {
      const id = /node '([^']+)'/.exec(g[2])?.[1]
      out.push({ node: id && ids.has(id) ? id : null, text: g[2], times: b.times })
      continue
    }
    const h = HOOK_ERROR.exec(line)
    if (!h || !graph) continue
    const starts = (graph.nodes ?? []).filter((n) => (n.type === 'event' && n.event === h[1]) || (HOOK_STARTS[h[1]] ?? []).includes(n.type))
    if (!starts.length) continue
    const fed = (n) => (roots.get(n.id) ?? []).some((s) => starts.includes(s))
    const removers = /cannot remove/.test(h[2]) ? (graph.nodes ?? []).filter((n) => fed(n) && ((n.type === 'action' && n.a === 'despawn') || n.type === 'remove')) : []
    if (removers.length) for (const n of removers) out.push({ node: n.id, text: `${h[1]} stopped here: ${h[2]}`, times: b.times })
    else out.push({ node: null, text: `${h[1]} stopped: ${h[2]}`, times: b.times })
  }
  return [...said.values()]
}

/**
 * The graphs as they were played, by the board's key (`map:<map>:<name>`,
 * `game::<name>`), taken when the logs are read back: a line about a node
 * stands until that node is changed, and one about the graph until the graph is.
 */
export function playedGraphs (S) {
  const out = new Map()
  for (const [n, g] of graphsOf(S.module)) out.set(`game::${n}`, structuredClone(g))
  for (const [doc, d] of Object.entries(S.docs ?? {})) for (const [n, g] of graphsOf(d)) out.set(`map:${doc}:${n}`, structuredClone(g))
  return out
}

/** A node, or a graph, as it runs: where it sits on the board left out. */
export const asRun = (x) => JSON.stringify(x?.nodes ? { nodes: x.nodes.map(asRunNode), links: x.links ?? [], vars: x.vars ?? {} } : asRunNode(x))
const asRunNode = (n) => { if (!n) return null; const { pos, show, ...rest } = n; return rest }

/** All of it as one text, for sharing. */
export function asText (logs) {
  return FILES.map(([key, file, about]) => `===== ${file} -- ${about} =====\n${(logs[key] ?? []).join('\n') || '(empty)'}`).join('\n\n') + '\n'
}

/** The Play log page. */
export async function showPlayLog (S) {
  const last = lastPlay()
  const rows = []
  if (!hasShell()) {
    S.ui.showSheet('Play log', [muted('Play, and its log, need the app: in a browser the studio exports a pack instead.')])
    return
  }
  const logs = await readLogs()
  const bad = failures(logs)
  rows.push(el('div', { class: 'st-row' }, [
    button('↻ read again', () => showPlayLog(S)),
    button('share the log', async () => { await shell.share(`play-log-${last?.map?.replace(/\.dnpm$/, '') ?? 'last'}.txt`, new TextEncoder().encode(asText(logs))) }),
    last ? button(withIcon('transport.play', 'play again'), () => S.play({ start: String(last.map ?? '').replace(/\.dnpm$/, '') })) : null
  ].filter(Boolean)))
  rows.push(muted(last
    ? `The last play-test: ${last.module}/${String(last.map).replace(/\.dnpm$/, '')}, ${new Date(last.at).toLocaleString()}.`
    : 'No play-test has run on this device yet.'))
  rows.push(el('div', { class: 'st-section-head', icon: bad.length ? 'status.error' : 'status.ok', text: bad.length ? ` what looks wrong (${bad.length})` : ' nothing in the logs looks like a failure' }))
  for (const b of bad.slice(0, 40)) rows.push(el('div', { class: 'sd-log-line sd-log-bad', 'data-log-bad': b.log, text: `${b.log}: ${tidy(b.line)}${b.times > 1 ? `  (×${b.times})` : ''}` }))
  if (bad.length > 40) rows.push(muted(`and ${bad.length - 40} more, in the logs below`))
  for (const [key, file, about] of FILES) {
    const lines = logs[key] ?? []
    rows.push(el('div', { class: 'st-section-head', text: `${file} -- ${about} (${lines.length} line${lines.length === 1 ? '' : 's'})` }))
    rows.push(el('div', { class: 'sd-log', 'data-log': key }, lines.length
      ? lines.map((l) => el('div', { class: `sd-log-line${isBad(l) ? ' sd-log-bad' : ''}`, text: tidy(l) }))
      : [el('div', { class: 'sd-log-line st-muted', text: '(empty)' })]))
  }
  rows.push(muted('Each Play starts these three again. They live in the game tree the studio writes (logs/), and "share the log" hands them over as one file.'))
  S.ui.showSheet('Play log', rows)
}
