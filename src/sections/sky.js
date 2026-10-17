//
// SKY: what the module and each map are drawn under (docs/SKY.md, sky_emit.js).
//
// The module has one sky (`sky default`); a map may have its own (`sky <map>`).
// A sky is a strip (DOOM's: one picture round the horizon), a panorama (one
// picture of the whole sphere), a cube (six faces) or none, its pictures the
// module's textures or the app's. The preview is the client's own Sky in a
// view of its own -- drag it to look round -- and the level view draws the
// same sky behind the map (mapeditor/sky.js), on every sky ceiling too.
//
import * as THREE from 'three'
import { el, row, number, select, button, muted, toggle, withIcon } from '../ui.js'
import { skyFromMessage } from '/src/render/sky.js'
import { KINDS, PICTURES, CUBE_FACES, DOOM_STRIP, newSky, skyMessage, skyProblems, skyWords } from '../sky_emit.js'

let S = null
let preview = null            // { renderer, scene, camera, sky, yaw, pitch } -- one, reused

/** Every texture name the studio knows: the module's own, then the app's. */
const textureNames = () => [...new Set([...(S.imageUrls?.keys() ?? []), ...(S.textureNames ?? [])])].sort()

/** Whose sky: the module's, or a map's by name. */
const ownerOf = (scope) => (scope ? S.docs[scope] : S.module)

function saved (scope) {
  if (!scope) S.moduleChanged()
  else if (scope === S.docName) S.commit()
  else { S.save(); S.moduleChanged() }
  S.applySky?.()
}

// --- the preview -----------------------------------------------------------------------

function previewOf (sky) {
  if (!preview) {
    const renderer = new THREE.WebGLRenderer({ antialias: true })
    renderer.setPixelRatio(Math.min(2, devicePixelRatio))
    renderer.setSize(480, 270)
    const scene = new THREE.Scene()
    const camera = new THREE.PerspectiveCamera(70, 480 / 270, 0.1, 100)
    const s = S.studioSky()
    scene.add(s.background)
    preview = { renderer, scene, camera, sky: s, yaw: 0, pitch: 0.15 }
    // Drag to look round: across turns, up and down tilts.
    const c = renderer.domElement
    c.classList.add('sd-sky-view')
    c.style.touchAction = 'none'
    let last = null
    c.addEventListener('pointerdown', (e) => { last = { x: e.clientX, y: e.clientY }; c.setPointerCapture?.(e.pointerId) })
    c.addEventListener('pointermove', (e) => {
      if (!last) return
      preview.yaw -= (e.clientX - last.x) * 0.006
      preview.pitch = Math.max(-1.45, Math.min(1.45, preview.pitch + (e.clientY - last.y) * 0.006))
      last = { x: e.clientX, y: e.clientY }
      draw()
    })
    const up = () => { last = null }
    c.addEventListener('pointerup', up); c.addEventListener('pointercancel', up)
  }
  preview.sky.set(skyFromMessage(skyMessage(sky))).then(() => draw())
  draw()
  return preview.renderer.domElement
}

function draw () {
  if (!preview) return
  const { renderer, scene, camera, sky } = preview
  // three.js's frame: +y up. Facing the game's north (+y) at yaw 0.
  camera.position.set(0, 0, 0)
  const dir = new THREE.Vector3(Math.sin(preview.yaw) * Math.cos(preview.pitch), Math.sin(preview.pitch), -Math.cos(preview.yaw) * Math.cos(preview.pitch))
  camera.lookAt(dir)
  sky.background.visible = true
  sky.update(camera)
  renderer.render(scene, camera)
  const label = document.querySelector('.sd-sky-facing')
  if (label) label.textContent = `facing ${facing()} -- drag to look round`
}

/** Which way the preview faces, said as the game's compass. */
const facing = () => {
  const t = ((-(preview?.yaw ?? 0) / (Math.PI * 2)) % 1 + 1) % 1
  return ['north', 'north-east', 'east', 'south-east', 'south', 'south-west', 'west', 'north-west'][Math.round(t * 8) % 8]
}

// --- the editor --------------------------------------------------------------------------

/** One picture: a texture name, typed or chosen, with its thumbnail. */
function pictureRow (label, value, onChange) {
  const listId = 'sd-sky-textures'
  const input = el('input', { type: 'text', value: value ?? '', list: listId, placeholder: 'a texture name' })
  input.addEventListener('change', () => onChange(input.value.trim()))
  const thumb = el('img', { class: 'sd-sky-thumb', src: value ? S.imageFor(value) : '', alt: '' })
  thumb.onerror = () => { thumb.style.visibility = 'hidden' }
  if (!value) thumb.style.visibility = 'hidden'
  return row(label, thumb, input)
}

function skyRows (scope) {
  const owner = ownerOf(scope)
  const sky = owner.sky
  const rows = []
  const where = scope ? `${scope}'s sky` : 'the module\'s sky'
  if (scope) {
    rows.push(toggle(`${scope} has a sky of its own`, !!sky, (v) => {
      if (v) owner.sky = JSON.parse(JSON.stringify(S.module.sky ?? newSky()))
      else delete owner.sky
      saved(scope); showSky(scope)
    }))
    if (!sky) {
      rows.push(muted(S.module.sky ? `${scope} is drawn under the module's sky: ${skyWords(S.module.sky)}.` : `${scope} has no sky, and nor has the module: the game's dark background.`))
      return rows
    }
  } else if (!sky) {
    rows.push(muted('The module names no sky: the game\'s dark background, as before skies existed.'),
      button('+ give the module a sky', () => { S.module.sky = newSky('strip'); saved(null); showSky(null) }))
    return rows
  }
  const set = (k) => (v) => { if (v === undefined || v === '' || v === null) delete sky[k]; else sky[k] = v; saved(scope); showSky(scope) }
  rows.push(select('kind', sky.kind, [['strip', 'strip -- one picture round the horizon (DOOM\'s)'], ['panorama', 'panorama -- the whole sphere in one picture (2:1)'], ['cube', 'cube -- six faces'], ['none', 'none -- no sky']], (v) => {
    sky.kind = v
    sky.images = (sky.images ?? []).slice(0, PICTURES[v])
    if (v !== 'strip') { delete sky.repeat; delete sky.height }
    if (v === 'none') delete sky.yaw
    saved(scope); showSky(scope)
  }))
  const n = PICTURES[sky.kind]
  const labels = sky.kind === 'cube' ? CUBE_FACES : ['picture']
  for (let i = 0; i < n; i++) {
    rows.push(pictureRow(labels[i], sky.images?.[i], (v) => { sky.images ??= []; sky.images[i] = v; saved(scope); showSky(scope) }))
  }
  if (sky.kind === 'strip') {
    rows.push(number('times round the horizon', sky.repeat ?? DOOM_STRIP.repeat, { min: 0.25, max: 16, step: 0.25 }, set('repeat')),
      number('height (how far up the sky)', sky.height ?? DOOM_STRIP.height, { min: 0.1, max: 4, step: 0.025 }, set('height')))
  }
  if (sky.kind !== 'none') {
    rows.push(number('turned, degrees', Math.round((sky.yaw ?? 0) * 360), { min: -360, max: 360, step: 1 }, (v) => set('yaw')(v ? Number((v / 360).toFixed(4)) : undefined)))
  }
  for (const p of skyProblems(sky, textureNames(), where)) rows.push(el('div', { class: 'st-danger', text: p }))
  rows.push(muted({
    strip: 'A strip is any width × height (DOOM\'s are 256×128), its left edge at north, running clockwise. Its top and bottom rows fade into the sky above and below, so keep them calm.',
    panorama: 'A panorama is one equirectangular picture, 2:1, its middle facing north. 2048×1024 is kind to phones.',
    cube: 'Six square faces, as three.js draws a cube background: east, west, north, south, up, down.',
    none: 'No sky: the game\'s dark background. Sky ceilings show a dark gradient.'
  }[sky.kind]))
  rows.push(el('div', { class: 'st-muted', text: `module.txt: sky ${scope ?? 'default'} ${skyWords(sky)}` }))
  return rows
}

function showSky (scope = null) {
  if (scope && !S.docs[scope]) scope = null
  S.skyScope = scope
  const sky = ownerOf(scope).sky ?? (scope ? S.module.sky : null)
  const view = previewOf(sky)
  const rows = [
    el('div', { class: 'st-row' }, [
      el('span', { class: 'st-muted', text: 'whose' }),
      el('select', { 'data-sky-scope': '1', onchange: (e) => showSky(e.target.value || null) }, [
        el('option', { value: '', text: 'the module (every map)' }),
        ...Object.keys(S.docs).sort().map((n) => { const o = el('option', { value: n, text: `${n}${S.docs[n].sky ? ' (own)' : ''}` }); return o })
      ])
    ]),
    el('div', { class: 'sd-sky-wrap', 'data-sky-preview': '1' }, [view, el('div', { class: 'sd-sky-facing', text: `facing ${facing()} -- drag to look round` })]),
    ...skyRows(scope),
    el('datalist', { id: 'sd-sky-textures' }, textureNames().map((t) => el('option', { value: t }))),
    el('div', { class: 'st-section-head' }, withIcon('section.sky', 'sky ceilings')),
    muted('A floor or ceiling opens onto the sky when its texture is F_SKY1 -- the room inspector\'s "open to the sky". It draws the sky, lined up with the sky past the walls, and no wall is drawn between two sky ceilings, as in DOOM.')
  ]
  S.ui.showSheet('Sky', rows)
  const sel = document.querySelector('[data-sky-scope]')
  if (sel) sel.value = scope ?? ''
  requestAnimationFrame(() => draw())
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showSky = S.sectionAlias('sky', showSky)
  S.allTextureNames = textureNames
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.sd-sky-wrap{position:relative;max-width:480px;border-radius:10px;overflow:hidden;border:1px solid var(--dnp-color-line-main)}
.sd-sky-view{display:block;width:100%;height:auto;aspect-ratio:16/9;cursor:grab}
.sd-sky-facing{position:absolute;left:8px;bottom:6px;font-weight:600;font-size:11px;font-family:var(--dnp-font-ui);color:var(--dnp-color-text-primary);text-shadow:0 1px 2px var(--dnp-color-text-inverse);pointer-events:none}
.sd-sky-thumb{width:48px;height:32px;object-fit:cover;border-radius:4px;border:1px solid var(--dnp-color-line-main);image-rendering:pixelated;flex:0 0 auto}
` }))
