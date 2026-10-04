//
// A CUTSCENE, PLANNED: a graph's run from one node, laid out in time the way
// the engine runs it (engine/maps/scripts/graphs.lua), so the studio can play
// it over the map before anyone presses Play.
//
// The engine's own rules, kept here:
//   subtitle      `then` at once; `done` after `seconds`, else min(8, 1.5 +
//                 0.05 a letter) -- long enough to read it;
//   fade          `then` at once; `done` after `seconds` (1);
//   flythrough    `then` at once; `done` after the path's length / speed;
//   delay         `then` after `ticks` / 60;
//   start / end   bars in (0.12 of the screen, 0.5 s) and out; end also gives
//                 the camera back and takes the subtitle off;
//   sequence      each exit in order, at once; once: through.
// A branch has no data here to decide by, so the plan takes `true` and says
// so; anything else (a door, a log line, a call) is a line in the plan and
// goes on at once. Bounded, as the runtime is: 256 steps, two minutes.
//
// Pure: graphwin.js plays the plan (scene.js) and scene.test.js checks it.
//

const MAX_STEPS = 256
const MAX_SECONDS = 120
const LOOKAHEAD = 8                       // the client's FLY_LOOKAHEAD

export const subtitleSeconds = (text) => Math.min(8, 1.5 + String(text ?? '').length * 0.05)

/** A node a run starts from: an event, an on_call, a `when_…`, every, after. */
export const isStart = (n) => ['event', 'on_call', 'every', 'after'].includes(n?.type) || /^when_/.test(n?.type ?? '')

/**
 * The plan: { events: [{ t, kind, ...}], end, notes, steps }. `kind` is one
 * of letterbox, fade, subtitle, clear_subtitle, camera, shake, note.
 *
 * @param graph       { nodes, links }
 * @param startId     the node it starts from (any exec node)
 * @param pathLength  (tag) -> length in units, or null when the map has no such path
 */
export function planScene (graph, startId, { pathLength = () => null } = {}) {
  const byId = new Map((graph?.nodes ?? []).map((n) => [n.id, n]))
  const next = new Map()
  for (const [f, t] of graph?.links ?? []) {
    const i = f.lastIndexOf('.'); const j = t.lastIndexOf('.')
    const key = f
    if (!next.has(key)) next.set(key, [])
    next.get(key).push({ id: t.slice(0, j), pin: t.slice(j + 1), from: f.slice(i + 1) })
  }
  const events = []
  const notes = []
  let steps = 0
  let subtitleSeq = 0
  const out = (id, pin) => (next.get(`${id}.${pin}`) ?? []).filter((x) => byId.has(x.id))
  const queue = []                         // [{ t, id }] runs waiting their time
  const go = (id, pin, t) => { for (const x of out(id, pin)) queue.push({ t, id: x.id }) }
  const startNode = byId.get(startId)
  if (!startNode) return { events, end: 0, notes: ['no such node'], steps }
  // From a start node, its exits; from any other node, that node itself.
  queue.push({ t: 0, id: startId, start: isStart(startNode) })
  while (queue.length && steps < MAX_STEPS) {
    queue.sort((a, b) => a.t - b.t)
    const { t, id, start } = queue.shift()
    if (t > MAX_SECONDS) break
    steps++
    const n = byId.get(id)
    const say = (text) => events.push({ t, kind: 'note', text: `${n.id}: ${text}` })
    if (start) {
      // Where the run begins: whatever its exits are, at once.
      for (const pin of ['then', 'near', 'true']) go(id, pin, t)
      continue
    }
    switch (n.type) {
      case 'start_cinematic': {
        const secs = n.seconds ?? 0.5
        events.push({ t, kind: 'letterbox', to: n.letterbox ?? 0.12, seconds: secs })
        go(id, 'then', t); break
      }
      case 'end_cinematic': {
        events.push({ t, kind: 'letterbox', to: 0, seconds: n.seconds ?? 0.5 })
        events.push({ t, kind: 'camera', mode: 'follow' })
        events.push({ t, kind: 'clear_subtitle' })
        go(id, 'then', t); break
      }
      case 'fade': {
        const secs = n.seconds ?? 1
        events.push({ t, kind: 'fade', to: n.to === 'black' ? 1 : 0, seconds: secs })
        go(id, 'then', t); go(id, 'done', t + secs); break
      }
      case 'subtitle': {
        const secs = n.seconds ?? subtitleSeconds(n.text)
        const line = ++subtitleSeq
        events.push({ t, kind: 'subtitle', text: n.text ?? '', speaker: n.speaker ?? null, line })
        // Taken off only if it is still this line (a newer one replaced it).
        events.push({ t: t + secs, kind: 'clear_subtitle', line })
        go(id, 'then', t); go(id, 'done', t + secs); break
      }
      case 'clear_subtitle':
        events.push({ t, kind: 'clear_subtitle' }); go(id, 'then', t); break
      case 'camera_follow':
        events.push({ t, kind: 'camera', mode: 'follow', distance: n.distance, height: n.height, angle: n.angle })
        go(id, 'then', t); break
      case 'camera_flythrough': {
        const speed = n.speed ?? 6
        const len = pathLength(n.path)
        events.push({ t, kind: 'camera', mode: 'flythrough', path: n.path, speed, blend: n.blend ?? 1, ...(len !== null ? { seconds: len / Math.abs(speed || 6) } : {}) })
        if (len === null) notes.push(`${n.id}: no camera path with tag ${n.path} on this map`)
        go(id, 'then', t)
        if (len !== null) go(id, 'done', t + Math.max(1 / 60, len / Math.abs(speed || 6)))
        break
      }
      case 'camera_track':
        events.push({ t, kind: 'camera', mode: 'track', path: n.path, blend: n.blend ?? 1 })
        go(id, 'then', t); break
      case 'camera_shake':
        events.push({ t, kind: 'shake', strength: n.strength ?? 0.3, seconds: n.seconds ?? 0.5 })
        go(id, 'then', t); break
      case 'delay':
        go(id, 'then', t + (n.ticks ?? 1) / 60); break
      case 'sequence':
        for (let i = 0; i < (n.count ?? 2); i++) go(id, String(i), t)
        break
      case 'branch':
        say('a branch -- the preview takes `true`')
        go(id, 'true', t); break
      case 'condition':
        say(`if ${n.c} -- the preview takes \`true\``)
        go(id, 'true', t); break
      case 'action':
        say(n.a === 'log' ? `log "${n.text ?? ''}"` : n.a)
        go(id, 'then', t); break
      case 'call':
        say(`calls ${n.name ?? '?'} (to ${n.to ?? '?'})`)
        go(id, 'then', t); break
      default:
        say(n.type.replace(/_/g, ' '))
        go(id, 'then', t)
    }
  }
  if (steps >= MAX_STEPS) notes.push(`stopped after ${MAX_STEPS} steps, as the runtime would`)
  events.sort((a, b) => a.t - b.t)
  const end = Math.max(0, ...events.map((e) => e.t + (e.seconds ?? 0)))
  return { events, end, notes, steps }
}

/**
 * Where the camera is at time `u` into a camera event, in engine units:
 * { eye: {x,y,z}, look: {x,y,z} } -- the client's own arithmetic (camera.js):
 * a flythrough rides the curve and looks LOOKAHEAD along its tangent, a track
 * sits at the point nearest the subject and looks at it.
 *
 * @param spline   the client's buildSpline of the path
 * @param subject  where the player is (the map's start)
 */
export function cameraPose (ev, u, spline, subject) {
  if (!spline) return null
  if (ev.mode === 'flythrough') {
    const s = ev.speed < 0 ? -1 : 1
    const along = ev.speed < 0 ? spline.length + ev.speed * u : ev.speed * u
    const p = spline.pointAt(Math.max(0, Math.min(spline.length, along)))
    const tg = spline.tangentAt(Math.max(0, Math.min(spline.length, along)))
    return { eye: { x: p.x, y: p.y, z: p.z }, look: { x: p.x + tg.x * LOOKAHEAD * s, y: p.y + tg.y * LOOKAHEAD * s, z: p.z + tg.z * LOOKAHEAD * s } }
  }
  if (ev.mode === 'track') {
    const n = spline.nearest(subject)
    const p = spline.pointAt(n.along)
    return { eye: { x: p.x, y: p.y, z: p.z }, look: { ...subject } }
  }
  return null
}
