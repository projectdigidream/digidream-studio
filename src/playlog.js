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

/** A line as shown: the device's long path to the game tree dropped (`modules/x/maps/first.dnpm`). */
export const tidy = (line) => line.replace(/(^|[\s[:(])\/[^[\]()]*?\/game\//g, '$1')

/** Does this line look like a failure? */
export const isBad = (line) => {
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

/** The failures, across the three: [{ log, line }]. */
export function failures (logs) {
  const out = []
  for (const [key] of FILES) for (const line of logs[key] ?? []) if (isBad(line)) out.push({ log: key, line })
  return out
}

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
    last ? button(withIcon('transport.play', 'play again'), () => S.play()) : null
  ].filter(Boolean)))
  rows.push(muted(last
    ? `The last play-test: ${last.module}/${String(last.map).replace(/\.dnpm$/, '')}, ${new Date(last.at).toLocaleString()}.`
    : 'No play-test has run on this device yet.'))
  rows.push(el('div', { class: 'st-section-head', icon: bad.length ? 'status.error' : 'status.ok', text: bad.length ? ` what looks wrong (${bad.length})` : ' nothing in the logs looks like a failure' }))
  for (const b of bad.slice(0, 40)) rows.push(el('div', { class: 'sd-log-line sd-log-bad', 'data-log-bad': b.log, text: `${b.log}: ${tidy(b.line)}` }))
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
