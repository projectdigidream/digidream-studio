//
// THE MODULE'S STYLE: fonts, the theme, named panel styles and the subtitle
// line, written into every layout file a level draws from (docs/UI_STYLES.md).
//
//   module.style = {
//     fonts:    [{ family, file: 'fonts/x.woff2', weight?, italic? }],
//     theme:    { font?, text?, panel?, accent? },
//     styles:   { <name>: { font, size, color, weight, accent,
//                           panel: { bg, border, radius, padding, image, slice },
//                           title: { bg, color, size, weight, align, image, slice },
//                           button: { bg, color, border, radius, image, slice, pressed: { bg, color, image } },
//                           close: { color, image } } },
//     subtitle: { font, size, weight, color, speakerColor, speakerSize, align,
//                 bg, radius, padding, shadow, y, width }
//   }
//
// The pictures and font files are the module's assets under `ui/` (`ui/fonts/`,
// `ui/skins/`), so they are written to assets/ui/ and served at /ui/ beside
// the layout that names them.
//
// A client that draws named styles (layout.js UI_STYLES) reads `use`; one that
// does not reads the panel's colours written beside it -- so a styled panel is
// the right colour today and the whole look once the client has it.
//
// Pure: the Style section, the panel editor, the emitters and the tests use it.
//

export const STYLE_NAME_RE = /^[a-z0-9_]{1,24}$/
export const FONT_EXTS = ['woff2', 'woff', 'ttf', 'otf']
export const SHADOWS = {
  none: 'none',
  soft: '0 1px 2px #000',
  outline: '-1px -1px 0 #000, 1px -1px 0 #000, -1px 1px 0 #000, 1px 1px 0 #000, 0 2px 3px #000',
  glow: '0 0 4px #000, 0 0 8px #000'
}
// The client's own default subtitle (layout.js SUBTITLES), as the studio starts from.
export const SUBTITLE_DEFAULTS = Object.freeze({ size: 18, speakerSize: 14, weight: 400, color: '#ffffff', speakerColor: '#ffd27a', align: 'center', y: -110, width: 84, shadow: 'soft' })

export function newStyle () {
  return {
    font: null, size: 13, color: '#e8e8ea', accent: '#5b8fd6',
    panel: { bg: '#121216', border: '1px solid #3a3a44', radius: 8, padding: 10 },
    title: { color: '#e8e8ea', weight: 600, align: 'left' },
    button: { bg: '#1b2230', color: '#e8e8ea', radius: 4 },
    close: {}
  }
}

/** "My Font Bold.ttf" -> { family: 'My Font', weight: 700, ext: 'ttf', file: 'fonts/my_font_bold.ttf' } */
export function fontFromFile (name) {
  const ext = String(name).split('.').pop().toLowerCase()
  const stem = String(name).replace(/\.[^.]+$/, '')
  const weight = /black|heavy/i.test(stem) ? 900 : /extra ?bold/i.test(stem) ? 800 : /bold/i.test(stem) ? 700 : /semi ?bold|demi/i.test(stem) ? 600 : /medium/i.test(stem) ? 500 : /light/i.test(stem) ? 300 : 400
  const italic = /italic|oblique/i.test(stem)
  const family = stem.replace(/[-_ ]?(regular|black|heavy|extra ?bold|semi ?bold|demi ?bold|bold|medium|light|italic|oblique)/gi, '').replace(/[-_]+/g, ' ').trim() || stem
  const file = `fonts/${stem.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '')}.${ext}`
  return { family, weight, italic, ext, file }
}

/** The families the module's fonts give, in order, once each. */
export const families = (style) => [...new Set((style?.fonts ?? []).map((f) => f.family))]

/** A CSS font list: the family, then a fallback the device has. */
export const fontList = (family, fallback = 'ui-monospace, SFMono-Regular, Menlo, monospace') => family ? `"${family}", ${fallback}` : fallback

/** The subtitle line as a HUD element (layout.js SUBTITLES, restyled; UI_STYLES.md 2.3). */
export function subtitleElement (sub) {
  const s = { ...SUBTITLE_DEFAULTS, ...(sub ?? {}) }
  const shadow = SHADOWS[s.shadow] ?? s.shadow
  const font = s.font ? fontList(s.font, 'ui-monospace, monospace') : undefined
  const box = {}
  if (s.bg) Object.assign(box, { bg: s.bg, radius: s.radius ?? 6, padding: s.padding ?? 8 })
  const text = (extra) => Object.fromEntries(Object.entries({ ...extra, align: s.align, font, shadow }).filter(([, v]) => v !== undefined))
  return {
    id: 'subtitle', type: 'group', anchor: 'b', x: 0, y: s.y, w: { vw: s.width, max: 760 },
    stack: 'column', gap: 2, visible: { bind: 'hud.subtitle', op: 'set' },
    ...(Object.keys(box).length ? { style: box } : {}),
    children: [
      { id: 'subtitle_speaker', type: 'text', text: '{hud.subtitle_speaker}', visible: { bind: 'hud.subtitle_speaker', op: 'set' },
        style: text({ size: s.speakerSize, weight: 700, color: s.speakerColor }) },
      { id: 'subtitle_text', type: 'text', text: '{hud.subtitle}', style: text({ size: s.size, weight: s.weight, color: s.color, wrap: true }) }
    ]
  }
}

/** A named style as a layout writes it: font families as lists, empties left out. */
export function styleOut (st) {
  const clean = (o) => Object.fromEntries(Object.entries(o ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== '' && !(typeof v === 'object' && !Array.isArray(v) && !Object.keys(v).length)))
  const out = clean({ ...st, font: st.font ? fontList(st.font) : undefined, panel: clean(st.panel), title: clean(st.title), button: clean({ ...st.button, pressed: clean(st.button?.pressed) }), close: clean(st.close) })
  return out
}

/**
 * A panel template's `style` for a panel that uses a named style: `use` for a
 * client that draws styles, and the style's own colours beside it for one
 * that does not; the panel's own inline look over both.
 */
export function panelStyleRef (name, st, own = {}) {
  const fallback = {}
  if (st) {
    const p = st.panel ?? {}
    // Not the border when the box has a picture: a `border` written over the
    // style resets the 9-slice (CSS border resets border-image) -- and a
    // pictured box has no border of its own to keep.
    for (const [k, v] of [['bg', p.bg], ['color', st.color], ['border', p.image ? undefined : p.border], ['radius', p.radius], ['size', st.size], ['weight', st.weight]]) if (v !== undefined && v !== null && v !== '') fallback[k] = v
  }
  return { use: name, ...fallback, ...own }
}

/**
 * A layout with the module's style in it: its fonts, its named styles, the
 * theme over the layout's, and the subtitle line (replacing the layout's own
 * `subtitle` element when the module styles it).
 */
export function withStyle (layout, style) {
  if (!style) return layout
  const out = JSON.parse(JSON.stringify(layout ?? { version: 1 }))
  if (style.fonts?.length) out.fonts = style.fonts.map((f) => Object.fromEntries(Object.entries({ family: f.family, file: f.file, weight: f.weight, style: f.italic ? 'italic' : undefined }).filter(([, v]) => v !== undefined)))
  if (style.styles && Object.keys(style.styles).length) out.styles = Object.fromEntries(Object.entries(style.styles).map(([n, s]) => [n, styleOut(s)]))
  const theme = Object.fromEntries(Object.entries(style.theme ?? {}).filter(([, v]) => v !== undefined && v !== null && v !== ''))
  if (theme.font) theme.font = fontList(theme.font)
  if (Object.keys(theme).length) out.theme = { ...(out.theme ?? {}), ...theme }
  if (style.subtitle) {
    out.hud = [...(out.hud ?? []).filter((e) => e.id !== 'subtitle'), subtitleElement(style.subtitle)]
  }
  return out
}

/** Does the module style anything? */
export const hasStyle = (style) => !!style && (!!style.fonts?.length || !!Object.keys(style.styles ?? {}).length || !!style.subtitle || !!Object.keys(style.theme ?? {}).length)

/** What would be refused or lost. */
export function styleProblems (style, assetPaths = []) {
  const out = []
  const have = new Set(assetPaths)
  for (const f of style?.fonts ?? []) {
    if (!f.family || f.family.length > 48) out.push(`font ${f.file}: a family is 1 to 48 characters`)
    if (!have.has(`ui/${f.file}`)) out.push(`font ${f.family}: its file ${f.file} is not in the module`)
  }
  for (const [name, s] of Object.entries(style?.styles ?? {})) {
    if (!STYLE_NAME_RE.test(name)) out.push(`style '${name}': a name is 1 to 24 of a-z, 0-9, _`)
    for (const part of ['panel', 'title', 'button']) {
      const p = s[part]
      if (p?.image && !have.has(`ui/${p.image}`)) out.push(`style '${name}': ${part} picture ${p.image} is not in the module`)
      if (p?.slice && !(Array.isArray(p.slice) && p.slice.length === 4 && p.slice.every((v) => Number.isFinite(v) && v >= 0))) out.push(`style '${name}': ${part} slice is four numbers, 0 or more`)
    }
    if (s.font && !families(style).includes(s.font)) out.push(`style '${name}': no font called ${s.font} in the module`)
  }
  if (style?.subtitle?.font && !families(style).includes(style.subtitle.font)) out.push(`subtitles: no font called ${style.subtitle.font} in the module`)
  return out
}
