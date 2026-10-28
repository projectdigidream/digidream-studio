//
// The map's camera and its paths: where the game looks at this map from, previewed here.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { buildSpline } from '/src/spline.js'
import { addPath, addPathPoint } from '../doc.js'
import { el, button, row, text, muted, card, select, slider, toggle, number, confirmDialog, withIcon, icon, addHelp } from '../ui.js'

import { ISO_ELEVATION } from '/src/camera.js'
import { CAMERA_MOTION } from '../lua_emit.js'

let S = null

const ENGINE_YAW_TURNS = 0.125          // the client's START_YAW, 45 degrees

// --- the camera: where the game looks at this map from, previewed here ------------------------
const TURN = Math.PI * 2
const ENGINE_PITCH_TURNS = ISO_ELEVATION / TURN

/**
 * A path's curve, sampled for drawing, and its length.
 *
 * buildSpline is the client's own -- the curve the camera actually rides -- so
 * the line drawn here and the length shown beside it are the engine's answers
 * rather than a second opinion. studio/test/paths.test.js holds that length
 * against the one mapc bakes.
 */
function pathCurve (p) {
  if (!p || p.points.length < 2) return null
  const sp = buildSpline(p.points, { loop: p.loop })
  const n = Math.max(24, (p.points.length - 1) * 24)
  const points = []
  for (let i = 0; i <= n; i++) {
    const q = sp.pointAt((i / n) * sp.length)
    points.push({ x: q.x, y: q.y, z: q.z })
  }
  return { points, length: sp.length }
}

/** Edit one path's points in the viewport: tap to add, drag to move, hold to remove. */
function editPath (id) {
  S.pathEdit = id
  S.pathPointSel = null
  S.tool = 'path'
  S.ui.setTool('camera')
  // The sheet STAYS, because a waypoint's height is a number and a number
  // needs somewhere to be typed. It sits at the bottom on a phone and down the
  // side in landscape, so the map is still there to tap.
  if (S.viewport.mode === 'plan') { S.viewport.setMode('iso'); S.ui.setView('iso') }
  showPathSheet()
  S.redraw()
  S.status('tap the floor to add a waypoint, tap one to pick it, drag to move, hold to remove', 'ok')
}

/**
 * The path being edited: what it is, and the waypoint in hand.
 *
 * Its own sheet rather than the whole Camera one, because this is what a
 * person is looking at while they tap: the height of the point they just
 * placed, and the height of all of them at once.
 */
/** Move the picked waypoint one place along the curve. */
function movePoint (delta) {
  const p = S.editedPath()
  movePointAt(p ? p.points.findIndex((q) => q.id === S.pathPointSel) : -1, delta)
}

/** Move waypoint `i` one place along the curve (it stays picked). */
function movePointAt (i, delta) {
  const p = S.editedPath()
  const j = i + delta
  if (!p || i < 0 || j < 0 || j >= p.points.length) return
  const [q] = p.points.splice(i, 1)
  p.points.splice(j, 0, q)
  S.pathPointSel = q.id
  S.commit(); showPathSheet(); S.redraw()
}

const fmt = (v) => String(Math.round((v ?? 0) * 100) / 100)

/**
 * A new waypoint between the picked one and the next, ready to drag.
 *
 * Halfway along, which is where somebody adding a bend to an existing curve
 * wants it -- appending would put it at the END of the path and change where
 * the shot finishes rather than how it gets there.
 */
function insertAfter () {
  const p = S.editedPath()
  const i = p ? p.points.findIndex((q) => q.id === S.pathPointSel) : -1
  if (i < 0) return
  const a = p.points[i]
  const b = p.points[i + 1] ?? p.points[(i + 1) % p.points.length]
  const mid = b && b !== a
    ? { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2, z: (a.z + b.z) / 2 }
    : { x: a.x + 2, y: a.y, z: a.z }
  const pt = addPathPoint(S.doc, p, Math.round(mid.x * 8) / 8, Math.round(mid.y * 8) / 8, Math.round(mid.z * 4) / 4, i + 1)
  S.pathPointSel = pt.id
  S.commit(); showPathSheet(); S.redraw()
}

function showPathSheet () {
  const p = S.editedPath()
  if (!p) { showCamera(); return }
  const curve = pathCurve(p)
  const sel = p.points.find((q) => q.id === S.pathPointSel) ?? null
  const i = sel ? p.points.indexOf(sel) : -1
  S.ui.showSheet(`Path tag ${p.tag}`, [
    muted(`${p.points.length} waypoint(s)${curve ? ` · ${curve.length.toFixed(2)} units of curve` : ' · a path needs at least 2'}. Tap the floor to add one, tap a waypoint to pick it, drag to move it, hold to remove it.`),
    sel
      ? card(`waypoint ${i + 1} of ${p.points.length}`, [
          slider('height', sel.z, { min: -32, max: 64, step: 0.25 }, (v, done) => { sel.z = v; S.redraw(); if (done) S.commit() }),
          number('x', sel.x, { min: -256, max: 256, step: 0.125 }, (v) => { sel.x = v; S.commit(); showPathSheet() }),
          number('y', sel.y, { min: -256, max: 256, step: 0.125 }, (v) => { sel.y = v; S.commit(); showPathSheet() }),
          el('div', { class: 'st-row' }, [
            button(withIcon('action.back', 'previous'), () => S.selectPathPoint(p.points[(i - 1 + p.points.length) % p.points.length]?.id)),
            button(withIcon('action.next', 'next'), () => S.selectPathPoint(p.points[(i + 1) % p.points.length]?.id)),
            button('remove', () => { p.points = p.points.filter((q) => q.id !== sel.id); S.pathPointSel = null; S.commit(); showPathSheet(); S.redraw() }, 'st-danger')
          ]),
          // WHERE A WAYPOINT SITS IN THE LIST IS PART OF THE SHAPE, because
          // the curve runs through them in order: the same three points in a
          // different order are a different path. So they can be moved along
          // it without being deleted and re-tapped.
          el('div', { class: 'st-row' }, [
            button(withIcon('action.left', 'earlier'), () => movePoint(-1), i === 0 ? 'st-dim' : ''),
            button(withIcon('action.right', 'later'), () => movePoint(1), i === p.points.length - 1 ? 'st-dim' : ''),
            button('+ after this', () => insertAfter())
          ])
        ])
      : muted('No waypoint picked. Tap one (or its number) to set its height.'),
    // THE ORDER, as a list: the curve runs through the waypoints in this
    // order. Tap a row to pick that waypoint; the arrows move it along.
    el('div', { class: 'st-section-head', text: 'the order' }),
    ...p.points.map((q, n) => el('div', { class: 'st-row st-path-point', 'data-path-point': q.id, 'data-on': q.id === S.pathPointSel ? '1' : '0' }, [
      button(`${n + 1}`, () => S.selectPathPoint(q.id), 'st-path-n'),
      el('span', { class: 'st-entry', text: `${fmt(q.x)}, ${fmt(q.y)} · height ${fmt(q.z)}`, onclick: () => S.selectPathPoint(q.id) }),
      button(withIcon('action.up'), () => movePointAt(n, -1), n === 0 ? 'st-dim' : ''),
      button(withIcon('action.down'), () => movePointAt(n, 1), n === p.points.length - 1 ? 'st-dim' : '')
    ])),
    p.points.length > 1 ? button(withIcon('action.swap', 'reverse the order'), () => { p.points.reverse(); S.commit(); showPathSheet(); S.redraw() }) : null,
    slider('height for every waypoint', p.points[0]?.z ?? 2, { min: -32, max: 64, step: 0.25 }, (v, done) => {
      for (const q of p.points) q.z = v
      S.redraw()
      if (done) S.commit()
    }),
    ...pathRows(),
    button(withIcon('action.back', 'all cameras'), () => { S.pathEdit = null; S.pathPointSel = null; S.redraw(); showCamera() })
  ].filter(Boolean))
}

function cameraOf (doc) {
  doc.camera ??= { yaw: null, pitch: null, distance: null, lockYaw: false, lockZoom: false }
  return doc.camera
}

/** The level view takes the map's camera while one is set, and the engine's otherwise. */
function applyCamera () {
  if (!S.doc || !S.viewport) return
  const c = cameraOf(S.doc)
  S.viewport.setCamera({
    yaw: c.yaw !== null ? c.yaw * TURN : null,
    elevation: c.pitch !== null ? c.pitch * TURN : null,
    distance: c.distance
  })
  S.redraw()
}

/** The curve of the first path with this tag; tags are not unique and first match wins. */
function curveFor (tag) {
  const p = (S.doc.paths ?? []).find((x) => x.tag === tag)
  return p ? pathCurve(p) : null
}

/** The controls for the path being edited, shown inside the Camera sheet. */
function pathRows () {
  const p = S.editedPath()
  if (!p) return []
  // Refreshed in place: these are shown inside the path's own sheet while it
  // is being edited, and rebuilding the Camera overview underneath it would
  // take the waypoint out of the author's hands mid-tap.
  const again = () => (S.pathEdit ? showPathSheet() : showCamera())
  return [el('div', { class: 'st-card' }, [
    number('tag', p.tag, { min: 0, max: 65535, step: 1 }, (v) => { p.tag = Math.round(v); S.commit(); again() }),
    toggle('loop', !!p.loop, (v) => { p.loop = v; S.commit(); again() }),
    toggle('rides the sectors under it', p.anchored !== false, (v) => { p.anchored = v; S.commit(); again() }),
    muted(p.anchored !== false
      ? 'Each point rides the sector it sits over, so a path over a lift moves with it. Do not ride a sector a script moves in steps: its position is streamed, and the camera judders.'
      : 'Every point is pinned to the world.')
  ])]
}

function showCamera () {
  const c = cameraOf(S.doc)
  const deg = (t) => `${Math.round(t * 360)}°`
  const live = (done) => { applyCamera(); if (done) S.commit() }
  const angled = c.yaw !== null || c.pitch !== null
  S.ui.showSheet('Camera', [
    muted(`How the game looks at ${S.docName}. Off is the engine's own: ${deg(ENGINE_YAW_TURNS)} around, ${deg(ENGINE_PITCH_TURNS)} down, free to turn and zoom.`),
    toggle('set the angle', angled, (v) => {
      c.yaw = v ? ENGINE_YAW_TURNS : null
      c.pitch = v ? ENGINE_PITCH_TURNS : null
      if (v && S.viewport.mode !== 'iso') { S.viewport.setMode('iso'); S.ui.setView('iso') }
      live(true); showCamera()
    }),
    angled ? slider(`around (${deg(c.yaw ?? ENGINE_YAW_TURNS)})`, c.yaw ?? ENGINE_YAW_TURNS, { min: 0, max: 1, step: 1 / 32 }, (v, done) => { c.yaw = v; live(done); if (done) showCamera() }) : null,
    angled ? slider(`down (${deg(c.pitch ?? ENGINE_PITCH_TURNS)})`, c.pitch ?? ENGINE_PITCH_TURNS, { min: 0.02, max: 0.25, step: 0.005 }, (v, done) => { c.pitch = v; live(done); if (done) showCamera() }) : null,
    toggle('set the distance', c.distance !== null, (v) => { c.distance = v ? 38 : null; live(true); showCamera() }),
    c.distance !== null ? slider('distance', c.distance, { min: 8, max: 80, step: 1 }, (v, done) => { c.distance = v; live(done) }) : null,
    toggle('lock turning', !!c.lockYaw, (v) => { c.lockYaw = v; S.commit() }),
    toggle('lock zoom', !!c.lockZoom, (v) => { c.lockZoom = v; S.commit() }),
    muted('The level view follows these while they are set. Sprites stand upright in the world, so the steeper the camera looks down, the shorter they show -- here and in the game.'),

    // HOW IT MOVES while it follows: the engine's values until the map sets one.
    el('div', { class: 'st-section-head' }, withIcon('maptool.camera', 'how it moves')),
    ...CAMERA_MOTION.map((f) => addHelp(slider(`${f.label}${c[f.key] != null ? ' (own)' : ''}`, c[f.key] ?? f.def, f,
      (v, done) => { if (done) { c[f.key] = v; S.commit(); showCamera() } }), f.doc)),
    CAMERA_MOTION.some((f) => c[f.key] != null)
      ? button(withIcon('action.reset', "back to the engine's movement"), () => { for (const f of CAMERA_MOTION) delete c[f.key]; S.commit(); showCamera() })
      : muted("The engine's own movement: a smooth follow with a small dead zone, aimed at the player."),

    // THE AUTOMATIC CAMERA (engine 0.2.3.7): it swings round behind the
    // player unless they turned it lately, and walls can pull it in -- a low
    // camera behind the player rather than the high overhead one.
    el('div', { class: 'st-section-head' }, withIcon('maptool.camera', 'behind the player')),
    // `autoTurn`: true (1, the swing round behind) or 2 (on a lead, engine 683417c)
    addHelp(select('turns by itself', c.autoTurn === 2 ? 'lead' : c.autoTurn ? 'behind' : 'off',
      [['off', 'no: stays where it is turned'], ['behind', 'swings round behind them'], ['lead', 'on a lead: follows the way they go']],
      (v) => { if (v === 'behind') c.autoTurn = true; else if (v === 'lead') c.autoTurn = 2; else delete c.autoTurn; S.commit(); showCamera() }),
      'Behind: the camera turns to look along where the player faces, unless they turned it themselves in the last few seconds. On a lead: it turns with the way they move, as if pulled along, and never swings round behind their back. Its distance and its angle down above are where it settles.'),
    c.autoTurn === true ? addHelp(slider(`after (s)${c.autoDelay != null ? ' (own)' : ''}`, c.autoDelay ?? 2, { min: 0, max: 10, step: 0.25 },
      (v, done) => { if (done) { c.autoDelay = v; S.commit() } }), 'How long after the player last turned the camera it starts swinging back.') : null,
    c.autoTurn === true ? addHelp(slider(`how fast (turns/s)${c.autoRate != null ? ' (own)' : ''}`, c.autoRate ?? 1.5, { min: 0.1, max: 6, step: 0.1 },
      (v, done) => { if (done) { c.autoRate = v; S.commit() } }), 'How quickly it swings round.') : null,
    addHelp(toggle('walls pull it in', !!c.collide, (v) => { if (v) c.collide = true; else delete c.collide; S.commit() }),
      'A wall (or a ceiling) between the camera and the player brings it closer, so it never looks through one. Best with a low camera behind the player.'),
    // THE CONE (engine a9d768f, CAMERA_SET 25-26): with either automatic
    // camera, it turns round the player to keep a cone to them clear of walls.
    // `cone` in degrees across, 0 or unset none; `coneRate` its turn, default 4.
    c.autoTurn ? addHelp(slider('keep in view (°)', c.cone ?? 0, { min: 0, max: 60, step: 1 },
      (v, done) => { if (done) { if (v > 0) c.cone = v; else { delete c.cone; delete c.coneRate } S.commit(); showCamera() } }),
      'Keeps the player in view: when a wall, a ceiling or a floor starts to come between the camera and the player, the camera turns round them to where the view is clear. This is how wide a cone it keeps clear, in degrees across: wider turns it sooner. 0: it never turns for walls. Best with "walls pull it in" on.') : null,
    c.autoTurn && c.cone ? addHelp(slider(`turn rate for walls${c.coneRate != null ? ' (own)' : ''}`, c.coneRate ?? 4, { min: 0.5, max: 20, step: 0.5 },
      (v, done) => { if (done) { c.coneRate = v; S.commit() } }), 'How quickly it turns round the player to keep the view clear.') : null,
    // BY HEIGHT over the player (engine 0.2.3.8, CAMERA_SET 23-24): where it
    // sits and what it looks at, rather than an angle down.
    addHelp(toggle('set its height over the player', c.cameraHeight != null, (v) => { if (v) { c.cameraHeight = 3; c.aimHeight ??= 1 } else { delete c.cameraHeight; delete c.aimHeight } S.commit(); showCamera() }),
      'The camera sits this high above the player\'s feet, its distance behind them, and the angle down follows from the two -- instead of the angle above. Off: the angle decides, as before.'),
    c.cameraHeight != null ? addHelp(slider(`height (units, ${c.cameraHeight})`, c.cameraHeight, { min: 0, max: 30, step: 0.25 },
      (v, done) => { c.cameraHeight = v; if (done) { S.commit(); showCamera() } }), 'How high above the player\'s feet the camera sits.') : null,
    c.cameraHeight != null ? addHelp(slider(`looks at (units up, ${c.aimHeight ?? 0})`, c.aimHeight ?? 0, { min: 0, max: 6, step: 0.125 },
      (v, done) => { c.aimHeight = v; if (done) { S.commit(); showCamera() } }), 'The point above the player\'s feet it looks at and swings round: their middle, their head, or the floor (0).') : null,

    el('div', { class: 'st-section-head' }, withIcon('graphgroup.cutscene', 'how it follows')),
    select('mode', c.mode ?? '', [['', "follow the player (the engine's own)"], ['track', 'track: stay on the path, nearest the player'],
                                  ['flythrough', 'flythrough: ride the path at a speed'], ['auto', 'auto: take the path when the player comes near']],
           (v) => { c.mode = v || null; S.commit(); showCamera() }),
    c.mode && c.mode !== 'follow'
      ? select('path', c.path == null ? '' : String(c.path),
               [['', '(choose a path)'], ...[...new Set((S.doc.paths ?? []).map((p) => p.tag))].sort((a, b) => a - b).map((t) => [String(t), `tag ${t}`])],
               (v) => { c.path = v === '' ? null : Number(v); S.commit(); showCamera() })
      : null,
    c.mode === 'flythrough' ? slider('speed (units/s)', c.speed ?? 6, { min: -40, max: 40, step: 0.5 }, (v, done) => { c.speed = v; if (done) { S.commit(); showCamera() } }) : null,
    c.mode === 'auto' ? slider('take it within', c.attach ?? 8, { min: 1, max: 40, step: 0.5 }, (v, done) => { c.attach = v; if (done) S.commit() }) : null,
    c.mode && c.mode !== 'follow' ? slider('blend rate', c.blend ?? 4, { min: 0.5, max: 20, step: 0.5 }, (v, done) => { c.blend = v; if (done) S.commit() }) : null,
    c.mode === 'flythrough' && c.path != null && curveFor(c.path)
      ? muted(`Path ${c.path} is ${curveFor(c.path).length.toFixed(2)} units of curve, so at ${Math.abs(c.speed ?? 6)} units a second the shot lasts ${(curveFor(c.path).length / Math.max(0.5, Math.abs(c.speed ?? 6))).toFixed(1)}s. The engine has no completion event: a script times the rest of the cutscene from that number.`)
      : null,

    el('div', { class: 'st-section-head', text: '⌁ camera paths' }),
    ...(S.doc.paths ?? []).map((p) => {
      const curve = pathCurve(p)
      const r = el('div', { class: 'st-trow', 'data-path': p.id, 'data-on': p.id === S.pathEdit ? '1' : '0' }, [
        el('div', { class: 'st-trow-text' }, [
          el('div', { class: 'st-trow-name', text: `tag ${p.tag}${p.loop ? ' · loop' : ''}` }),
          el('div', { class: 'st-muted', text: `${p.points.length} point(s)${curve ? ` · ${curve.length.toFixed(2)} units of curve` : ' · needs at least 2'}${p.anchored === false ? ' · world-fixed' : ''}` })
        ]),
        button(withIcon('action.edit'), () => editPath(p.id)),
        button(withIcon('action.close'), async () => {
          if (!await confirmDialog(`delete camera path tag ${p.tag}?`)) return
          S.doc.paths = S.doc.paths.filter((x) => x.id !== p.id)
          if (S.pathEdit === p.id) S.pathEdit = null
          S.commit(); showCamera()
        }, 'st-danger')
      ])
      return r
    }),
    ...(S.pathEdit ? pathRows() : []),
    button('+ new path', () => {
      const tags = (S.doc.paths ?? []).map((p) => p.tag)
      const p = addPath(S.doc, tags.length ? Math.max(...tags) + 1 : 1)
      S.commit()
      editPath(p.id)
    }),
    muted('A path is a line the camera can ride. It bows outward at every corner, because the camera rides a curve through the points rather than the line between them.')
  ].filter(Boolean))
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.pathCurve = pathCurve
  S.editedPath = () => (S.doc?.paths ?? []).find((p) => p.id === S.pathEdit) ?? null
  S.selectPathPoint = (id, { quiet = false } = {}) => {
    S.pathPointSel = id
    const p = S.editedPath()
    const pt = p?.points.find((q) => q.id === id)
    if (pt && !quiet) S.status(`waypoint ${p.points.indexOf(pt) + 1} of ${p.points.length}, ${pt.z} up`, 'ok')
    showPathSheet()
    S.redraw()
  }
  S.showPathSheet = showPathSheet
  S.editPath = editPath
  S.applyCamera = applyCamera
  S.showCamera = showCamera
}
