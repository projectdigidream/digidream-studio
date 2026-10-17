//
// ICONS BY ID (docs/STUDIO_SKINS.md, phase 3): every icon the studio shows is a
// catalog id (vendor/uikit/catalog/icons.json), drawn by ui.js icon(): the
// skin's picture where it has one, the catalog's glyph where it has none.
//
//   - every id the studio names exists in the catalog -- a typo would show an
//     empty box in every skin;
//   - the ids made from a name (preset.<id>, weather.<kind>, widget.<kind>,
//     section.<tile>, seam.<state>) exist for every name the studio makes;
//   - no string starts with an icon glyph any more: an icon written as a
//     character is one no skin can draw. The few left are text, not icons
//     (a key's name, a status line, a pin's hidden shape), and listed.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
const SRC = join(HERE, '..', 'src')
const catalog = JSON.parse(readFileSync(join(HERE, '..', 'vendor', 'uikit', 'catalog', 'icons.json'), 'utf8'))
const IDS = new Set(catalog.groups.flatMap((g) => g.icons.map(([n]) => `${g.id}.${n}`)))
const GROUPS = new Set(catalog.groups.map((g) => g.id))
const GLYPHS = new Set(catalog.groups.flatMap((g) => g.icons.map((i) => i[2])).filter((c) => !/^[\x20-\x7e]+$/.test(c)))

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++ }

function walk (dir) {
  const out = []
  for (const n of readdirSync(dir)) {
    const p = join(dir, n)
    if (statSync(p).isDirectory()) out.push(...walk(p)); else if (n.endsWith('.js')) out.push(p)
  }
  return out
}
const files = walk(SRC).map((p) => ({ rel: relative(SRC, p).split('\\').join('/'), text: readFileSync(p, 'utf8') }))

// 1. Every literal id the studio names is in the catalog.
const named = new Map()
for (const f of files) {
  // (a skin canvas key -- canvas('map', 'trigger.when') -- is not an icon)
  for (const m of f.text.matchAll(/('(?:common|map|graph|preview|designer)', )?'([a-z]+)\.([a-z]+)'/g)) {
    if (m[1] || !GROUPS.has(m[2])) continue
    const id = `${m[2]}.${m[3]}`
    if (!named.has(id)) named.set(id, f.rel)
  }
}
const unknown = [...named].filter(([id]) => !IDS.has(id))
check(named.size > 80, `the studio names its icons by id (${named.size} distinct)`)
check(unknown.length === 0, `every id it names is in the catalog${unknown.length ? `: ${unknown.map(([id, f]) => `${id} (${f})`).join(', ')}` : ''}`)

// 2. The ids made from a name, for every name.
const made = {
  preset: ['door', 'lift', 'switch', 'teleport', 'ambush', 'exit', 'crusher', 'slider', 'turntable', 'blank'],
  weather: (await import('../src/fxlib.js').catch(() => null))?.FX_KINDS ?? ['rain', 'snow', 'dust', 'embers', 'fog'],
  widget: ['label', 'button', 'toggle', 'slider', 'select', 'text', 'bar', 'picture'],
  section: ['monsters', 'player', 'weapons', 'props', 'particles', 'textures', 'music', 'sounds', 'screens', 'scripts', 'settings'],
  seam: ['joined', 'oneway', 'walls', 'loose']
}
for (const [g, names] of Object.entries(made)) {
  const missing = names.filter((n) => !IDS.has(`${g}.${n}`))
  check(missing.length === 0, `${g}.<name> exists for every name (${names.length})${missing.length ? `: missing ${missing.join(', ')}` : ''}`)
}

// 3. No icon written as a character.
const TEXT_NOT_ICON = [
  /^keys_emit\.js:/,                    // a key's name: ↑ is what the ArrowUp key is called
  /^sections\/music\.js:.*S\.status\(/,  // the status line while a track plays
  /^graphwin\.js:.*'●'/                 // a data pin's shape (CSS draws it; the text is not shown)
]
const left = []
for (const f of files) {
  f.text.split('\n').forEach((line, i) => {
    const code = line.replace(/^\s*\/\/.*$/, '')
    if (/^\s*\*/.test(code)) return
    for (const m of code.matchAll(/(['`])((?:[^'`\\]|\\.)*?)\1/g)) {
      const t = m[2]
      const lead = [...t][0]
      if (lead && GLYPHS.has(lead)) {
        const where = `${f.rel}:${i + 1}: ${line.trim().slice(0, 90)}`
        if (!TEXT_NOT_ICON.some((r) => r.test(where))) left.push(where)
      }
    }
  })
}
check(left.length === 0, `no string starts with an icon glyph${left.length ? `:\n      ${left.slice(0, 8).join('\n      ')}` : ''}`)
// CONTROL: the scan finds a glyph-led label where there is one.
check(GLYPHS.has([...'▶ play'][0]) && GLYPHS.has([...'🗺 maps'][0]), 'CONTROL: a glyph-led label is seen')

// NO COLOUR EMOJI (the playtest of 2026-10-17: flat glyphs only, in every tool):
// none in the studio's code outside comments and the list that names them; the
// plugins' rail icons are catalog ids; and every catalog glyph that is a colour
// emoji is drawn by the default skin, so it is never shown as a character.
{
  const { isColourEmoji } = await import('../src/ui.js').catch(() => ({}))
  const colour = isColourEmoji ?? ((t) => /[\u{1F000}-\u{1FFFF}]/u.test(t))
  const found = []
  for (const f of files) {
    f.text.split('\n').forEach((line, i) => {
      const code = line.replace(/\/\/.*$/, '').replace(/^\s*\*.*$/, '')
      if (/EMOJI_BMP = new Set/.test(code)) return
      if (colour(code)) found.push(`${f.rel}:${i + 1}: ${line.trim().slice(0, 80)}`)
    })
  }
  check(found.length === 0, `no colour emoji in the studio's code${found.length ? `:\n      ${found.slice(0, 8).join('\n      ')}` : ''}`)
  const plugins = readdirSync(join(HERE, '..', 'plugins')).map((d) => join(HERE, '..', 'plugins', d, 'plugin.json')).filter((p) => { try { statSync(p); return true } catch { return false } })
  const rail = plugins.flatMap((p) => (JSON.parse(readFileSync(p, 'utf8')).sections ?? []).map((sec) => sec.icon).filter(Boolean))
  check(rail.length > 0 && rail.every((ic) => IDS.has(ic)), `the plugins' rail icons are catalog ids (${rail.join(', ')})`)
  const claude = readFileSync(join(HERE, '..', 'vendor', 'uikit', 'skins', 'claude.skin.js'), 'utf8')
  const urls = JSON.parse(claude.slice(claude.indexOf('{'), claude.lastIndexOf('}') + 1)).icons?.urls ?? {}
  const undrawn = catalog.groups.filter((g) => g.id !== 'brand').flatMap((g) => g.icons.map((i) => [`${g.id}.${i[0]}`, i[2] ?? ''])).filter(([id, gl]) => colour(gl) && !urls[id]).map(([id, gl]) => `${id} ${gl}`)
  check(undrawn.length === 0, `every catalog glyph that is a colour emoji is drawn by the default skin (${undrawn.slice(0, 6).join(', ')})`)
}

console.log(`\nicons: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
