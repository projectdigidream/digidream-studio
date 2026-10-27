//
// STYLE: how the module's screens look -- its fonts, its pictures, named panel
// styles and the subtitle line (docs/UI_STYLES.md, style_emit.js).
//
// Fonts and pictures are imported files (the module's assets under `ui/`,
// written to assets/ui/ and served at /ui/). A panel style is a whole look a
// panel takes by name in the panel editor: its font and colours, a 9-slice
// picture for the box, the title bar and the buttons. Subtitles are the line
// a graph's `subtitle` node puts at the bottom of the screen.
//
// The previews are the client's own: a sample panel drawn by UiView, the
// subtitle drawn by HudView, from the layout the module writes. What the
// client cannot draw yet (layout.js UI_STYLES) the page says plainly, and
// shows the files themselves -- the font as a sample, the picture with its
// slice lines -- rather than pretending.
//
import { shell } from '../bridge.js'
import { useStroke } from '../../vendor/uikit/runtime.js'
import { el, row, text, number, select, toggle, button, muted, ask, confirmDialog, withIcon, icon } from '../ui.js'
import {
  newStyle, fontFromFile, families, fontList, withStyle, panelStyleRef, styleProblems, SHADOWS, SUBTITLE_DEFAULTS, STYLE_NAME_RE, FONT_EXTS
} from '../style_emit.js'
import * as Layout from '/src/render/layout.js'
import { UiView } from '/src/render/ui.js'
import { UI_KIND } from '/src/proto.js'

let S = null
const loaded = new Map()          // asset path -> FontFace added to the document
const urls = new Map()            // asset path -> blob URL, for the pictures

const support = () => Layout.UI_STYLES ?? null
const styleOf = () => (S.module.style ??= { fonts: [], theme: {}, styles: {} })
const changed = (redraw = true) => { S.moduleChanged(); if (redraw) showStyle(S.styleOpen ?? null) }
const cleanName = (s) => String(s ?? '').toLowerCase().replace(/[^a-z0-9_]+/g, '_').replace(/^_+|_+$/g, '').slice(0, 24)

/** The module's fonts, loaded into the studio's document so their samples show them. */
export async function loadStyleFonts () {
  for (const f of S.module.style?.fonts ?? []) {
    const path = `ui/${f.file}`
    if (loaded.has(path)) continue
    const blob = S.rec.assets?.[path]
    if (!blob) continue
    try {
      const face = new FontFace(f.family, await blob.arrayBuffer(), { weight: String(f.weight ?? 400), style: f.italic ? 'italic' : 'normal' })
      await face.load()
      document.fonts.add(face)
      loaded.set(path, face)
    } catch (e) { console.warn('[studio] font', f.file, e.message) }
  }
}

const pictureUrl = (file) => {
  const path = `ui/${file}`
  const blob = S.rec.assets?.[path]
  if (!blob) return null
  if (!urls.has(path)) urls.set(path, URL.createObjectURL(blob))
  return urls.get(path)
}
/**
 * THE MODULE'S PICTURES IN A PREVIEW. The client draws a 9-slice as
 * `url("/ui/<file>")` -- right in the game, where /ui/ serves the module's
 * files. The studio keeps them in the module's own store, not on a server, so
 * under a preview drawn by the client's own UiView every such URL is pointed
 * at the module's copy: now, and whenever the client sets one again (a
 * button's pressed look, set while it is held).
 */
export function useModulePictures (host) {
  const fix = (node) => {
    const bi = node.style?.borderImage
    if (!bi || !bi.includes('/ui/')) return
    const m = /url\("?\/ui\/([^")]+)"?\)/.exec(bi)
    const url = m ? pictureUrl(m[1]) : null
    if (url) node.style.borderImage = bi.replace(m[0], `url("${url}")`)
  }
  const sweep = () => { fix(host); for (const n of host.querySelectorAll('*')) fix(n) }
  sweep()
  if (!host.__pictures) {
    host.__pictures = new MutationObserver((list) => { for (const r of list) { if (r.type === 'attributes') fix(r.target); else for (const n of r.addedNodes) if (n.nodeType === 1) { fix(n); for (const k of n.querySelectorAll('*')) fix(k) } } })
    host.__pictures.observe(host, { attributes: true, attributeFilter: ['style'], subtree: true, childList: true })
  }
  return sweep
}

/** Where a client view finds the module's files, once it can be told (UI_STYLES.md 6.1). */
export const assetOpts = () => (support()?.assetUrl ? { assetUrl: (f) => pictureUrl(f) ?? `/ui/${f}` } : {})

const pictures = () => Object.keys(S.rec.assets ?? {}).filter((p) => /^ui\/skins\/[^/]+\.png$/.test(p)).map((p) => p.slice(3)).sort()

// --- importing -----------------------------------------------------------------------

async function importFonts () {
  const files = await shell.importFiles(FONT_EXTS.map((e) => `.${e}`).join(','))
  const style = styleOf()
  const added = []
  for (const f of files) {
    const info = fontFromFile(f.name)
    if (!FONT_EXTS.includes(info.ext)) { S.status(`${f.name}: a font is ${FONT_EXTS.join(', ')}`, 'warn'); continue }
    try {
      // Checked by the browser's own font loader: bytes that do not load are not a font.
      const face = new FontFace(info.family, f.bytes.buffer.slice(f.bytes.byteOffset, f.bytes.byteOffset + f.bytes.byteLength), { weight: String(info.weight), style: info.italic ? 'italic' : 'normal' })
      await face.load()
      document.fonts.add(face)
      loaded.set(`ui/${info.file}`, face)
    } catch (e) { S.status(`${f.name} is not a font this browser can load: ${e.message ?? e}`, 'error'); continue }
    S.rec.assets ??= {}
    S.rec.assets[`ui/${info.file}`] = new Blob([f.bytes], { type: `font/${info.ext}` })
    style.fonts = (style.fonts ?? []).filter((x) => x.file !== info.file)
    style.fonts.push({ family: info.family, file: info.file, weight: info.weight, ...(info.italic ? { italic: true } : {}) })
    added.push(`${info.family} ${info.weight}${info.italic ? ' italic' : ''}`)
  }
  if (!added.length) return
  S.status(`font${added.length > 1 ? 's' : ''} added: ${added.join(', ')}`, 'ok')
  changed()
}

async function importPictures () {
  const files = await shell.importFiles('.png,image/png')
  const added = []
  for (const f of files) {
    if (!/\.png$/i.test(f.name)) { S.status(`${f.name}: a picture is a PNG`, 'warn'); continue }
    const name = cleanName(f.name.replace(/\.png$/i, '')) || 'picture'
    S.rec.assets ??= {}
    S.rec.assets[`ui/skins/${name}.png`] = new Blob([f.bytes], { type: 'image/png' })
    urls.delete(`ui/skins/${name}.png`)
    added.push(name)
  }
  if (!added.length) return
  S.status(`picture${added.length > 1 ? 's' : ''} added: ${added.join(', ')}`, 'ok')
  changed()
}

// --- the page --------------------------------------------------------------------------

function showStyle (open = null) {
  S.styleOpen = open
  const style = S.module.style ?? { fonts: [], theme: {}, styles: {} }
  const sup = support()
  const rows = []
  rows.push(el('div', { class: sup?.fonts && sup?.skins ? 'st-muted' : 'st-warn-box', 'data-style-support': sup ? JSON.stringify(sup) : 'none',
    text: sup?.fonts && sup?.skins
      ? 'The game draws all of this: fonts, pictures, named styles, subtitles.'
      : 'This game client draws the colours and sizes here, and the subtitles\' colours. Fonts, panel pictures and the subtitle\'s font, outline and backdrop are written into the module now and show once the client draws them.' }))
  for (const p of styleProblems(style, Object.keys(S.rec.assets ?? {}))) rows.push(el('div', { class: 'st-danger', text: p }))

  // FONTS
  rows.push(el('div', { class: 'st-section-head' }, withIcon('widget.text', `fonts (${(style.fonts ?? []).length})`)))
  for (const f of style.fonts ?? []) {
    rows.push(el('div', { class: 'st-card', 'data-font': f.file }, [
      el('div', { class: 'sd-font-sample', text: 'The quick brown fox -- 0123', style: `font-family:${fontList(f.family)};font-weight:${f.weight ?? 400};font-style:${f.italic ? 'italic' : 'normal'}` }),
      text('family', f.family, (v) => {
        const was = f.family; f.family = v.trim() || was
        // What named it follows.
        for (const st of Object.values(styleOf().styles ?? {})) if (st.font === was) st.font = f.family
        if (styleOf().theme?.font === was) styleOf().theme.font = f.family
        if (styleOf().subtitle?.font === was) styleOf().subtitle.font = f.family
        loaded.delete(`ui/${f.file}`); loadStyleFonts().then(() => changed())
      }),
      select('weight', String(f.weight ?? 400), ['300', '400', '500', '600', '700', '800', '900'].map((w) => [w, w]), (v) => { f.weight = Number(v); loaded.delete(`ui/${f.file}`); loadStyleFonts().then(() => changed()) }),
      toggle('italic', !!f.italic, (v) => { if (v) f.italic = true; else delete f.italic; changed() }),
      el('div', { class: 'st-row' }, [el('span', { class: 'st-muted', text: f.file }), button(withIcon('action.close'), async () => {
        if (!await confirmDialog(`remove the font ${f.family} (${f.file})?`)) return
        styleOf().fonts = styleOf().fonts.filter((x) => x !== f); delete S.rec.assets[`ui/${f.file}`]; changed()
      }, 'st-danger')])
    ]))
  }
  rows.push(button('+ import fonts (.woff2 .woff .ttf .otf)', importFonts))

  // THEME
  const fams = families(style)
  const famOpts = [['', '(the engine\'s monospace)'], ...fams.map((f) => [f, f])]
  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.style', 'the whole UI')),
    select('font', style.theme?.font ?? '', famOpts, (v) => { styleOf().theme ??= {}; if (v) styleOf().theme.font = v; else delete styleOf().theme.font; changed() }),
    colorRow('text', style.theme?.text ?? '#cfe3ff', (v) => { styleOf().theme ??= {}; styleOf().theme.text = v; changed() }),
    colorRow('accent', style.theme?.accent ?? '#5b8fd6', (v) => { styleOf().theme ??= {}; styleOf().theme.accent = v; changed() }),
    muted('The font and colours every screen starts from: the HUD, and panels without a style of their own.'))

  // PICTURES
  const pics = pictures()
  rows.push(el('div', { class: 'st-section-head' }, withIcon('widget.picture', `pictures (${pics.length})`)))
  rows.push(el('div', { class: 'sd-pics' }, pics.map((p) => el('div', { class: 'sd-pic', 'data-picture': p }, [
    el('img', { src: pictureUrl(p), alt: p }),
    el('span', { class: 'st-muted', text: p.replace(/^skins\//, '') }),
    button(withIcon('action.close'), async () => {
      if (!await confirmDialog(`remove the picture ${p}?`)) return
      delete S.rec.assets[`ui/${p}`]; urls.delete(`ui/${p}`); changed()
    }, 'st-danger')
  ]))))
  rows.push(button('+ import pictures (.png)', importPictures),
    muted('A picture skins a panel, its title bar or its buttons as a 9-slice: its corners stay as drawn, its edges stretch along, its middle fills.'))

  // PANEL STYLES
  const styles = style.styles ?? {}
  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.panels', `panel styles (${Object.keys(styles).length})`)))
  for (const [name, st] of Object.entries(styles)) {
    const users = Object.entries(S.module.panels ?? {}).filter(([, p]) => p.look?.styleName === name).map(([n]) => n)
    const on = open === name
    rows.push(el('div', { class: 'st-card', 'data-style': name }, [
      el('div', { class: 'st-row' }, [el('span', { class: 'st-entry' }, withIcon('section.panels', `${name}`)), el('span', { class: 'st-muted', text: users.length ? `used by ${users.join(', ')}` : 'not used yet' }),
        button(withIcon(on ? 'action.collapse' : 'action.expand'), () => showStyle(on ? null : name))]),
      stylePreview(name, st),
      ...(on ? styleRows(name, st, fams, pics) : [])
    ]))
  }
  rows.push(button('+ new style', async () => {
    const n = cleanName(await ask('style name (letters, digits, underscore)', 'parchment'))
    if (!n) return
    if (styleOf().styles?.[n]) { S.status(`there is a style called ${n} already`, 'warn'); return }
    ;(styleOf().styles ??= {})[n] = newStyle()
    S.styleOpen = n
    changed()
  }))

  // SUBTITLES
  rows.push(el('div', { class: 'st-section-head' }, withIcon('widget.label', 'subtitles')), el('div', { class: 'sd-sub', 'data-subtitles': '1' }, [subtitlePreview(), ...subtitleRows(fams)]))
  S.ui.showSheet('Style', rows)
}

const colorRow = (label, value, onChange) => row(label, el('input', { type: 'color', value: /^#[0-9a-f]{6}$/i.test(value ?? '') ? value : '#000000', onchange: (e) => onChange(e.target.value) }))

/** A 9-slice picture: which one, and its four insets, drawn over it as lines. */
function sliceRows (label, part, pics) {
  const out = [select(`${label} picture`, part.image ?? '', [['', '(none -- the colour)'], ...pics.map((p) => [p, p.replace(/^skins\//, '')])], (v) => {
    if (v) { part.image = v; part.slice ??= [12, 12, 12, 12] } else { delete part.image; delete part.slice }
    changed()
  })]
  if (part.image) {
    const c = el('canvas', { class: 'sd-slice', width: 160, height: 120 })
    const img = new Image()
    img.onload = () => {
      const k = Math.min(160 / img.width, 120 / img.height, 4)
      c.width = Math.round(img.width * k); c.height = Math.round(img.height * k)
      const g = c.getContext('2d')
      g.imageSmoothingEnabled = false
      g.drawImage(img, 0, 0, c.width, c.height)
      const [t, r, b, l] = part.slice ?? [0, 0, 0, 0]
      useStroke(g, S.skin.canvas('preview', 'slice.guide'))
      for (const [x0, y0, x1, y1] of [[0, t * k, c.width, t * k], [0, c.height - b * k, c.width, c.height - b * k], [l * k, 0, l * k, c.height], [c.width - r * k, 0, c.width - r * k, c.height]]) {
        g.beginPath(); g.moveTo(x0 + 0.5, y0 + 0.5); g.lineTo(x1 + 0.5, y1 + 0.5); g.stroke()
      }
    }
    img.src = pictureUrl(part.image) ?? ''
    const sl = part.slice ?? [12, 12, 12, 12]
    out.push(el('div', { class: 'sd-slice-row' }, [c, el('div', { class: 'sd-slice-nums' },
      ['top', 'right', 'bottom', 'left'].map((side, i) => number(side, sl[i], { min: 0, max: 512, step: 1 }, (v) => { part.slice = [...sl]; part.slice[i] = Math.round(v); changed() })))]))
  }
  return out
}

function styleRows (name, st, fams, pics) {
  const ch = () => changed()
  const set = (o, k) => (v) => { if (v === '' || v === undefined || v === null) delete o[k]; else o[k] = v; ch() }
  st.panel ??= {}; st.title ??= {}; st.button ??= {}; st.close ??= {}
  st.button.pressed ??= {}
  return [
    text('name', name, (v) => {
      const n = cleanName(v)
      if (!n || n === name) return
      if (!STYLE_NAME_RE.test(n) || styleOf().styles[n]) { S.status('that name is empty or taken', 'warn'); return }
      styleOf().styles = Object.fromEntries(Object.entries(styleOf().styles).map(([k, x]) => [k === name ? n : k, x]))
      // The panels that take it follow.
      for (const p of Object.values(S.module.panels ?? {})) if (p.look?.styleName === name) p.look.styleName = n
      S.styleOpen = n; ch()
    }),
    el('div', { class: 'st-section-head', text: 'text' }),
    select('font', st.font ?? '', [['', '(the UI\'s)'], ...fams.map((f) => [f, f])], set(st, 'font')),
    number('size', st.size ?? 13, { min: 6, max: 48, step: 1 }, set(st, 'size')),
    colorRow('colour', st.color ?? '#e8e8ea', set(st, 'color')),
    colorRow('accent (sliders, toggles)', st.accent ?? '#5b8fd6', set(st, 'accent')),
    el('div', { class: 'st-section-head', text: 'the panel' }),
    colorRow('background', st.panel.bg ?? '#121216', set(st.panel, 'bg')),
    row('border', el('input', { type: 'text', value: st.panel.border ?? '', placeholder: '1px solid #3a3a44, or none', onchange: (e) => set(st.panel, 'border')(e.target.value.trim()) })),
    number('corners', st.panel.radius ?? 8, { min: 0, max: 40, step: 1 }, set(st.panel, 'radius')),
    number('padding', st.panel.padding ?? 10, { min: 0, max: 60, step: 1 }, set(st.panel, 'padding')),
    ...sliceRows('panel', st.panel, pics),
    el('div', { class: 'st-section-head', text: 'the title bar' }),
    colorRow('background', st.title.bg ?? '#121216', set(st.title, 'bg')),
    colorRow('colour', st.title.color ?? '#e8e8ea', set(st.title, 'color')),
    number('size', st.title.size ?? 13, { min: 6, max: 48, step: 1 }, set(st.title, 'size')),
    select('weight', String(st.title.weight ?? 600), [['400', 'normal'], ['600', 'bold'], ['800', 'heavy']], (v) => set(st.title, 'weight')(Number(v))),
    select('align', st.title.align ?? 'left', ['left', 'center', 'right'], set(st.title, 'align')),
    ...sliceRows('title', st.title, pics),
    el('div', { class: 'st-section-head', text: 'buttons' }),
    colorRow('background', st.button.bg ?? '#1b2230', set(st.button, 'bg')),
    colorRow('colour', st.button.color ?? '#e8e8ea', set(st.button, 'color')),
    number('corners', st.button.radius ?? 4, { min: 0, max: 40, step: 1 }, set(st.button, 'radius')),
    ...sliceRows('button', st.button, pics),
    st.button.image ? select('pressed picture', st.button.pressed.image ?? '', [['', '(the same)'], ...pics.map((p) => [p, p.replace(/^skins\//, '')])], set(st.button.pressed, 'image')) : null,
    colorRow('pressed background', st.button.pressed.bg ?? st.button.bg ?? '#1b2230', set(st.button.pressed, 'bg')),
    colorRow('the ×', st.close.color ?? st.title.color ?? '#e8e8ea', set(st.close, 'color')),
    el('div', { class: 'st-row' }, [
      button('duplicate', () => { let n = `${name}_copy`; let i = 2; while (styleOf().styles[n]) n = `${name}_copy${i++}`; styleOf().styles[n] = JSON.parse(JSON.stringify(st)); S.styleOpen = n; ch() }),
      button('delete style', async () => {
        const users = Object.values(S.module.panels ?? {}).filter((p) => p.look?.styleName === name)
        if (!await confirmDialog(`delete the style ${name}?${users.length ? ` ${users.length} panel(s) go back to their own colours.` : ''}`)) return
        for (const p of users) delete p.look.styleName
        delete styleOf().styles[name]; S.styleOpen = null; ch()
      }, 'st-danger')
    ])
  ].filter(Boolean)
}

/** A sample panel in the style, drawn by the client's UiView from the layout the module writes. */
function stylePreview (name, st) {
  const host = el('div', { class: 'sd-style-preview', 'data-style-preview': name })
  const tpl = { anchor: 'c', x: 0, y: 0, w: 240, title: { show: true }, style: panelStyleRef(name, st),
    slots: [{ widget: 1, anchor: 'tl', x: 10, y: 8, w: 220 }, { widget: 2, anchor: 'tl', x: 10, y: 40, w: 220 }, { widget: 3, anchor: 'tl', x: 10, y: 76, w: 220, h: 36 }] }
  const layout = Layout.parseLayout(withStyle({ version: 1, panels: { sample: tpl } }, S.module.style)).layout
  try {
    const view = new UiView({ onEvent: () => {}, host, layout, size: { width: 320, height: 210 }, ...assetOpts() })
    view.open({ uiId: 1, title: 'A panel', template: 'sample', widgets: [
      { kind: UI_KIND.LABEL, id: 1, label: 'What will it be?', value: 0, lo: 0, hi: 0, options: [] },
      { kind: UI_KIND.BUTTON, id: 2, label: 'Buy', value: 0, lo: 0, hi: 0, options: [] },
      { kind: UI_KIND.SLIDER, id: 3, label: 'How many', value: 3, lo: 0, hi: 9, options: [] }] })
    useModulePictures(host)
    // Centred by its height, which it has only once it is on the page.
    requestAnimationFrame(() => view.relayout())
  } catch (e) { host.textContent = `preview: ${e.message}` }
  return host
}

/** The subtitle line, drawn by the client's HudView from the layout the module writes. */
function subtitlePreview () {
  const host = el('div', { class: 'sd-sub-preview', 'data-sub-preview': '1' })
  const layout = Layout.parseLayout(withStyle({ version: 1, hud: [] }, { ...(S.module.style ?? {}), subtitle: S.module.style?.subtitle ?? {} })).layout
  requestAnimationFrame(() => {
    const r = host.getBoundingClientRect()
    const hud = new Layout.HudView({ host, size: { width: r.width || 640, height: r.height || 200 } })
    hud.setLayout(layout)
    hud.update({ 'hud.subtitle': 'This hall was sealed for a hundred years.', 'hud.subtitle_speaker': 'The Archivist' })
  })
  return host
}

function subtitleRows (fams) {
  const sub = S.module.style?.subtitle ?? null
  const s = { ...SUBTITLE_DEFAULTS, ...(sub ?? {}) }
  const edit = (k) => (v) => { styleOf().subtitle = { ...(styleOf().subtitle ?? {}), [k]: v }; changed() }
  const rows = [
    toggle('the module styles its subtitles', !!sub, (v) => { if (v) styleOf().subtitle = {}; else delete styleOf().subtitle; changed() })
  ]
  if (!sub) return [...rows, muted('Off, the game draws its own: white, 18, the speaker in gold above.')]
  rows.push(
    select('font', s.font ?? '', [['', '(the UI\'s)'], ...fams.map((f) => [f, f])], (v) => edit('font')(v || undefined)),
    colorRow('text', s.color, edit('color')),
    number('text size', s.size, { min: 8, max: 64, step: 1 }, edit('size')),
    select('weight', String(s.weight), [['400', 'normal'], ['600', 'bold'], ['800', 'heavy']], (v) => edit('weight')(Number(v))),
    colorRow('speaker', s.speakerColor, edit('speakerColor')),
    number('speaker size', s.speakerSize, { min: 8, max: 48, step: 1 }, edit('speakerSize')),
    select('outline', Object.keys(SHADOWS).includes(s.shadow) ? s.shadow : 'soft', Object.keys(SHADOWS).map((k) => [k, k]), edit('shadow')),
    toggle('a box behind the line', !!s.bg, (v) => edit('bg')(v ? 'rgba(0,0,0,0.55)' : undefined)),
    s.bg ? row('box colour', el('input', { type: 'text', value: s.bg, placeholder: 'rgba(0,0,0,0.55)', onchange: (e) => edit('bg')(e.target.value.trim() || undefined) })) : null,
    number('from the bottom', -s.y, { min: 0, max: 600, step: 2 }, (v) => edit('y')(-Math.round(v))),
    number('width, % of the screen', s.width, { min: 20, max: 100, step: 2 }, edit('width')),
    select('align', s.align, ['left', 'center', 'right'], edit('align')),
    muted('What a graph\'s subtitle node says, at the bottom of the screen; the speaker above it.'))
  return rows.filter(Boolean)
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.loadStyleFonts = loadStyleFonts
  S.useModulePictures = useModulePictures
  S.uiAssetOpts = assetOpts
  S.showStyle = S.sectionAlias('style', showStyle)
}

// Shared by the page: its own small styles.
document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.sd-font-sample{font-size:20px;padding:4px 0 8px}
.sd-sub{display:flex;flex-direction:column;gap:10px}
.sd-pics{display:grid;grid-template-columns:repeat(auto-fill,minmax(110px,1fr));gap:8px}
.sd-pic{display:flex;flex-direction:column;gap:4px;align-items:center;border:1px solid var(--dnp-color-line-main);border-radius:8px;padding:6px}
.sd-pic img{max-width:100%;max-height:80px;image-rendering:pixelated;background:repeating-conic-gradient(var(--cv-common-checker-a-fill) 0 25%,var(--cv-common-checker-b-fill) 0 50%) 0 0/12px 12px}
.sd-slice-row{display:flex;gap:10px;align-items:flex-start;flex-wrap:wrap}
.sd-slice{border:1px solid var(--dnp-color-line-main);background:repeating-conic-gradient(var(--cv-common-checker-a-fill) 0 25%,var(--cv-common-checker-b-fill) 0 50%) 0 0/12px 12px;image-rendering:pixelated}
.sd-slice-nums{display:grid;grid-template-columns:1fr 1fr;gap:0 8px;flex:1 1 200px}
.sd-style-preview{position:relative;height:210px;max-width:320px;border:1px dashed var(--dnp-color-line-strong);border-radius:8px;overflow:hidden;background:linear-gradient(160deg,var(--dnp-color-bg-hover),var(--dnp-color-bg-sunken))}
.sd-sub-preview{position:relative;height:200px;max-width:640px;border:1px dashed var(--dnp-color-line-strong);border-radius:8px;overflow:hidden;background:linear-gradient(160deg,var(--dnp-color-line-strong),var(--dnp-color-bg-panel))}
` }))
