//
// A CUTSCENE, PLAYED over the map: the graph window's ▶ scene.
//
// The plan is scene_plan.js's -- the engine's timings -- and what it shows is
// drawn as the game draws it where the studio can: the subtitle by the
// client's own HudView from the module's layout (its own `subtitle` element,
// or the default every layout gets, withSubtitles), the camera by the client's
// own spline and its flythrough and track arithmetic, in the level view the
// map editor already shows. The bars and the fade are the screen's, as
// SCREEN_SET draws them. What only the server can do -- a door, a log line, a
// call -- is a line in the strip at the bottom, at the moment it happens.
//
// Esc or ■ ends it; ↻ plays it again.
//
import { el, withIcon, icon } from './ui.js'
import { planScene, cameraPose } from './scene_plan.js'
import { buildSpline } from '/src/spline.js'
import { HudView, parseLayout, withSubtitles } from '/src/render/layout.js'

const smooth = (k) => k * k * (3 - 2 * k)
const lerp3 = (a, b, k) => ({ x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, z: a.z + (b.z - a.z) * k })

/**
 * Play a graph's run from one node over the map view.
 * @returns { stop() } -- and calls onEnd() when it is left
 */
export function playScene (S, graph, startId, { onEnd = () => {} } = {}) {
  const paths = S.doc.paths ?? []
  const splineFor = new Map()
  const spline = (tag) => {
    if (!splineFor.has(tag)) {
      const p = paths.find((x) => x.tag === tag)
      splineFor.set(tag, p && p.points.length >= 2 ? buildSpline(p.points, { loop: p.loop }) : null)
    }
    return splineFor.get(tag)
  }
  const plan = planScene(graph, startId, { pathLength: (tag) => spline(tag)?.length ?? null })
  const spawn = S.doc.spawns?.[0] ?? { x: 0, y: 0, z: 0 }
  const subject = { x: spawn.x, y: spawn.y, z: (spawn.z ?? 0) + 1 }
  const end = Math.max(plan.end, ...plan.events.filter((e) => e.kind === 'camera').map((e) => e.t + (e.seconds ?? 0))) + 1

  // The map, with everything else out of the way.
  const page = S.shell?.page
  const was = { mode: S.viewport.mode, page: page ? page.hidden : true, layerPage: S.ui.layer.dataset.page, workshop: S.ui.layer.dataset.workshop }
  if (page) page.hidden = true
  S.ui.layer.dataset.page = '0'
  S.ui.layer.dataset.workshop = '0'
  S.ui.hideSheet()
  if (S.viewport.mode === 'plan') { S.viewport.setMode('iso'); S.ui.setView?.('iso') }
  // The shot as the player sees it: no rail, none of the editor's lines,
  // handles or markers drawn into it.
  document.body.dataset.scene = '1'
  const overlays = ['lines', 'markers', 'handles', 'segments'].map((k) => S.viewport[k]).filter(Boolean)
  const shown = overlays.map((o) => o.visible)
  for (const o of overlays) o.visible = false

  const top = el('div', { class: 'sc-bar sc-bar-top' })
  const bottom = el('div', { class: 'sc-bar sc-bar-bottom' })
  const fade = el('div', { class: 'sc-fade' })
  const hudHost = el('div', { class: 'sc-hud' })
  const clock = el('span', { class: 'sc-clock', text: '0.0 s' })
  const log = el('div', { class: 'sc-log' })
  const strip = el('div', { class: 'sc-strip ui-toolbar' }, [
    el('span', { class: 'sc-title' }, withIcon('transport.play', `${startId}`)), clock,
    el('button', { text: '↻', title: 'again', 'data-scene': 'again', onclick: () => restart() }),
    el('button', { title: 'back to the graph', 'data-scene': 'stop', onclick: () => stop() }, withIcon('transport.stop'))
  ])
  const root = el('div', { class: 'sc-scene', 'data-scene': 'playing' }, [top, bottom, fade, hudHost, log, strip])
  if (!document.getElementById('sc-scene-style')) document.head.appendChild(el('style', { id: 'sc-scene-style', text: STYLE }))
  document.body.appendChild(root)
  const hud = new HudView({ host: hudHost, size: { width: innerWidth, height: innerHeight } })
  // The module's own subtitle element when its layout has one, else the default.
  hud.setLayout(withSubtitles(parseLayout({ ...(S.module.ui ?? { version: 1 }), hud: [] }).layout))
  // ...unless the layout's own HUD placed it: then that one.
  const own = (S.module.ui?.hud ?? []).find((e) => e.id === 'subtitle')
  if (own) hud.setLayout(parseLayout({ ...(S.module.ui), hud: [own] }).layout)

  let t0 = 0; let applied = 0; let line = 0; let cam = null; let shake = null; let raf = 0; let done = false
  const say = (text) => { log.textContent = text; log.dataset.on = '1' }
  const reset = () => {
    applied = 0; line = 0; cam = null; shake = null
    top.style.transition = bottom.style.transition = fade.style.transition = 'none'
    top.style.height = bottom.style.height = '0'
    fade.style.opacity = '0'
    hud.update({ 'hud.subtitle': undefined, 'hud.subtitle_speaker': undefined })
    log.textContent = plan.notes.join(' · ')
    S.viewport.setPose(null)
    t0 = performance.now()
  }
  const poseNow = () => {
    // Where the editor's camera is, in engine units: what a first move blends from.
    const c = S.viewport.iso.position
    return S.viewport.pose ?? { eye: { x: c.x, y: -c.z, z: c.y }, look: { ...S.viewport.target } }
  }
  const apply = (ev) => {
    if (ev.kind === 'letterbox') {
      for (const b of [top, bottom]) { b.style.transition = `height ${ev.seconds}s ease`; b.style.height = `${ev.to * 100}%` }
    } else if (ev.kind === 'fade') {
      fade.style.transition = `opacity ${ev.seconds}s linear`; fade.style.opacity = String(ev.to)
    } else if (ev.kind === 'subtitle') {
      line = ev.line
      hud.update({ 'hud.subtitle': ev.text, 'hud.subtitle_speaker': ev.speaker ?? undefined })
    } else if (ev.kind === 'clear_subtitle') {
      if (ev.line === undefined || ev.line === line) hud.update({ 'hud.subtitle': undefined, 'hud.subtitle_speaker': undefined })
    } else if (ev.kind === 'camera') {
      cam = ev.mode === 'follow' ? null : { ev, from: poseNow(), sp: spline(ev.path) }
      if (!cam) S.viewport.setPose(null)
      if (cam && !cam.sp) say(`no camera path with tag ${ev.path} on ${S.docName}`)
    } else if (ev.kind === 'shake') {
      shake = { t: ev.t, until: ev.t + ev.seconds, strength: ev.strength }
    } else if (ev.kind === 'note') say(`${ev.t.toFixed(1)} s · ${ev.text}`)
  }
  const frame = () => {
    if (done) return
    const t = (performance.now() - t0) / 1000
    while (applied < plan.events.length && plan.events[applied].t <= t) apply(plan.events[applied++])
    if (cam?.sp) {
      const u = t - cam.ev.t
      let pose = cameraPose(cam.ev, u, cam.sp, subject)
      const k = cam.ev.blend > 0 ? Math.min(1, u / cam.ev.blend) : 1
      if (pose && k < 1) pose = { eye: lerp3(cam.from.eye, pose.eye, smooth(k)), look: lerp3(cam.from.look, pose.look, smooth(k)) }
      if (pose && shake && t < shake.until) {
        const a = shake.strength * (1 - (t - shake.t) / (shake.until - shake.t))
        pose = { ...pose, eye: { x: pose.eye.x + (Math.random() - 0.5) * a, y: pose.eye.y + (Math.random() - 0.5) * a, z: pose.eye.z + (Math.random() - 0.5) * a } }
      }
      if (pose) S.viewport.setPose(pose)
    } else if (shake && t < shake.until) {
      const a = shake.strength * (1 - (t - shake.t) / (shake.until - shake.t))
      S.viewport.setPose({ ...poseNow(), eye: (() => { const e = poseNow().eye; return { x: e.x + (Math.random() - 0.5) * a, y: e.y + (Math.random() - 0.5) * a, z: e.z + (Math.random() - 0.5) * a } })() })
    } else if (shake) { shake = null; if (!cam) S.viewport.setPose(null) }
    clock.textContent = `${Math.min(t, end).toFixed(1)} / ${end.toFixed(1)} s`
    root.dataset.scene = t >= end ? 'ended' : 'playing'
    S.viewport.dirty = true
    raf = requestAnimationFrame(frame)
  }
  const restart = () => { reset(); cancelAnimationFrame(raf); raf = requestAnimationFrame(frame) }
  const onKey = (e) => { if (e.key === 'Escape') stop() }
  function stop () {
    if (done) return
    done = true
    cancelAnimationFrame(raf)
    removeEventListener('keydown', onKey)
    hud.destroy()
    root.remove()
    S.viewport.setPose(null)
    overlays.forEach((o, i) => { o.visible = shown[i] })
    delete document.body.dataset.scene
    S.viewport.dirty = true
    if (was.mode !== S.viewport.mode) { S.viewport.setMode(was.mode); S.ui.setView?.(was.mode) }
    if (page) page.hidden = was.page
    S.ui.layer.dataset.page = was.layerPage
    S.ui.layer.dataset.workshop = was.workshop
    onEnd()
  }
  addEventListener('keydown', onKey)
  restart()
  return { stop, plan, root }
}

const STYLE = `
body[data-scene="1"] .sd-rail,body[data-scene="1"] .st-layer{display:none}
.sc-scene{position:fixed;inset:0;z-index:95;pointer-events:none;font-size:13px;line-height:1.4;font-family:var(--dnp-font-ui);color:var(--dnp-color-text-primary)}
.sc-bar{position:absolute;left:0;right:0;height:0;background:#000} /* the game's letterbox: content, not the skin */
.sc-bar-top{top:0}.sc-bar-bottom{bottom:0}
.sc-fade{position:absolute;inset:0;background:#000;opacity:0} /* the game's fade: content */
.sc-hud{position:absolute;inset:0}
.sc-strip{position:absolute;top:calc(8px + env(safe-area-inset-top));right:calc(8px + env(safe-area-inset-right));display:flex;gap:6px;align-items:center;pointer-events:auto;
  background:color-mix(in srgb,var(--dnp-color-bg-app) 85%,transparent);border:1px solid var(--dnp-color-line-main);border-radius:10px;padding:4px 6px 4px 10px;z-index:3}
.sc-strip button{min-width:40px;height:36px;font-size:15px;line-height:1;cursor:pointer}
.sc-title{font-weight:700}
.sc-clock{color:var(--dnp-color-text-secondary);min-width:7em;text-align:right}
.sc-log{position:absolute;left:calc(8px + env(safe-area-inset-left));top:calc(8px + env(safe-area-inset-top));max-width:55%;background:color-mix(in srgb,var(--dnp-color-bg-app) 75%,transparent);border-radius:8px;padding:4px 10px;color:var(--dnp-color-warn);z-index:3}
.sc-log:empty{display:none}
`
