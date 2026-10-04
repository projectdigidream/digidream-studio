//
// The module's style: fonts, named panel styles and the subtitle line, written
// into every layout file (docs/UI_STYLES.md).
//
// What has to hold, judged by the client's own code (render/layout.js):
// every layout the studio writes with a style still parses without an error,
// so today's client loads it; a styled panel's template carries the style's
// colours beside its name, so today's client draws them; the subtitle line
// the studio writes has the client's own default's shape (its ids, its
// bindings) with the module's looks; and every layout a level draws from --
// a map's own included -- carries the style.
//
import { parseLayout, SUBTITLES, DEFAULT_LAYOUT } from '../../engine/client/src/render/layout.js'
import { fontFromFile, families, fontList, subtitleElement, panelStyleRef, withStyle, styleProblems, hasStyle, newStyle, styleOut, SHADOWS } from '../src/style_emit.js'
import { newPanel, addWidget, templateOf } from '../src/panels_emit.js'
import { uiFiles } from '../src/ui_emit.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- fonts from files -------------------------------------------------------------------------
const bold = fontFromFile('Bitter-BoldItalic.ttf')
check(bold.family === 'Bitter' && bold.weight === 700 && bold.italic && bold.file === 'fonts/bitter_bolditalic.ttf', `a font's family, weight and slant come from its file name (${JSON.stringify(bold)})`)
check(fontFromFile('Press Start 2P.woff2').family === 'Press Start 2P' && fontFromFile('Press Start 2P.woff2').weight === 400, 'a regular one keeps its whole name as its family')

const style = {
  fonts: [{ family: 'Bitter', file: 'fonts/bitter.woff2', weight: 400 }, { family: 'Bitter', file: 'fonts/bitter_bold.woff2', weight: 700 }],
  theme: { font: 'Bitter', text: '#f0e6d2' },
  styles: { parchment: { ...newStyle(), font: 'Bitter', color: '#3a2a1a', panel: { bg: '#e9dcc0', image: 'skins/parchment.png', slice: [24, 24, 24, 24], radius: 0, border: 'none' } } },
  subtitle: { font: 'Bitter', color: '#ffffff', speakerColor: '#ffaa00', size: 20, shadow: 'outline', bg: 'rgba(0,0,0,.5)' }
}
check(families(style).join() === 'Bitter' && fontList('Bitter').startsWith('"Bitter", '), 'families once each, a font list with a fallback the device has')

// --- the subtitle line has the client's shape -------------------------------------------------
const sub = subtitleElement(style.subtitle)
const ids = (e) => [e.id, ...(e.children ?? []).flatMap(ids)]
check(ids(sub).join() === ids(SUBTITLES).join() && JSON.stringify(sub.visible) === JSON.stringify(SUBTITLES.visible) && sub.children[1].text === SUBTITLES.children[1].text,
      `the studio's subtitle line is the client's default in shape: its ids, its bindings (${ids(sub).join(', ')})`)
check(sub.children[1].style.color === '#ffffff' && sub.children[0].style.color === '#ffaa00' && sub.children[1].style.size === 20 && sub.children[1].style.shadow === SHADOWS.outline && sub.style.bg === 'rgba(0,0,0,.5)',
      'and the module\'s looks: colours, size, outline, a box behind it')
const plain = subtitleElement({})
check(plain.children[1].style.size === SUBTITLES.children[1].style.size && plain.children[0].style.color === SUBTITLES.children[0].style.color && plain.y === SUBTITLES.y,
      'switched on and left alone, it is the client\'s own: 18, the speaker in gold, 110 up')

// --- a styled panel ---------------------------------------------------------------------------
const ref = panelStyleRef('parchment', style.styles.parchment, { radius: 12 })
check(ref.use === 'parchment' && ref.bg === '#e9dcc0' && ref.color === '#3a2a1a' && ref.radius === 12, `a styled panel names its style, with the style's colours beside it and its own over them (${JSON.stringify(ref)})`)
const shop = newPanel('Shop'); addWidget(shop, 'button', 'Buy')
shop.look.styleName = 'parchment'
const t = templateOf(shop, style.styles)
check(t.style.use === 'parchment' && t.style.bg === '#e9dcc0', 'the panel\'s template carries it')

// --- by the client's parser: today's client loads all of it -----------------------------------
const full = withStyle({ ...structuredClone(DEFAULT_LAYOUT), panels: { shop: t } }, style)
const parsed = parseLayout(full)
check(parsed.ok && parsed.errors.length === 0, `a layout with the module's style parses without an error (${parsed.errors.join(' | ')})`)
check(parsed.layout.panels.shop?.style?.bg === '#e9dcc0', 'today\'s client keeps the styled panel\'s colours')
check(parsed.layout.hud.some((e) => e.id === 'subtitle' && e.children?.[1]?.style?.color === '#ffffff') && parsed.layout.hud.filter((e) => e.id === 'subtitle').length === 1,
      'and the module\'s subtitle line, once, in place of the default')
check(parsed.layout.theme.font.startsWith('"Bitter"') && parsed.layout.theme.text === '#f0e6d2', 'and the theme\'s font and colour')
check(full.fonts.length === 2 && full.fonts[1].weight === 700 && full.styles.parchment.panel.slice.join() === '24,24,24,24' && full.styles.parchment.font.startsWith('"Bitter"'),
      'the fonts and named styles are written for a client that draws them (docs/UI_STYLES.md 2)')
check(!('pressed' in styleOut({ ...newStyle(), button: { bg: '#111', pressed: {} } }).button), 'empty parts are left out')

// --- every layout a level draws from ----------------------------------------------------------
const files = uiFiles({ style, panels: { shop } }, [{ name: 'boss', ui: { version: 1, hud: [] } }])
const hud = JSON.parse(files.find((f) => f.path.endsWith('/hud.json')).bytes)
const boss = JSON.parse(files.find((f) => f.path.endsWith('map_boss.json')).bytes)
check(hud.fonts && hud.styles?.parchment && hud.hud.some((e) => e.id === 'subtitle') && hud.panels.shop.style.use === 'parchment', 'the module\'s layout carries the style and the styled panel')
check(boss.fonts && boss.styles?.parchment && boss.hud.some((e) => e.id === 'subtitle'), 'and so does a map\'s own layout')
check(uiFiles({ style: { fonts: [], styles: {}, theme: {} } }, []).length === 0 && !hasStyle({ fonts: [], styles: {}, theme: {} }), 'CONTROL: a module that styles nothing writes nothing')

// --- what would be lost -----------------------------------------------------------------------
const lost = styleProblems(style, ['ui/fonts/bitter.woff2'])
check(lost.some((p) => /bitter_bold\.woff2 is not in the module/.test(p)) && lost.some((p) => /parchment\.png is not in the module/.test(p)), 'a font file or picture the module lacks is said')
check(styleProblems(style, ['ui/fonts/bitter.woff2', 'ui/fonts/bitter_bold.woff2', 'ui/skins/parchment.png']).length === 0, 'and with them there, nothing')

console.log(`style: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
