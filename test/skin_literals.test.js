//
// NO COLOUR LITERALS (docs/STUDIO_SKINS.md §6): the studio's CSS strings and
// canvas code ask the skin for every colour and font -- `var(--dnp-…)` in CSS,
// S.skin.canvas(group, key) in drawing code -- so a skin changes all of it.
//
// It fails when a file still writes a colour itself: #rgb, #rrggbb, #rrggbbaa,
// rgb()/rgba(), or a three.js 0xrrggbb. Two kinds of colour are not the
// studio's to skin, and are allowed:
//   - THE MODULE'S OWN: defaults of a colour the module stores (its HUD, its
//     panels, its subtitles, a particle's colour) -- a colour input's value, a
//     field's placeholder, the default a new widget is made with. The emitters
//     that write the module's files are content through and through.
//   - THE GAME'S: a preview drawing what the game itself draws (the cinematic
//     letterbox), marked with a comment naming it content.
// NOT_YET lists the files a later phase migrates; it only shrinks, and a file
// on it that has become clean is a failure too, so the list stays honest.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'

const SRC = join(dirname(fileURLToPath(import.meta.url)), '..', 'src')

// Files whose every colour is the module's: they write the module's files.
const CONTENT = new Set(['style_emit.js', 'props_emit.js'])
// Not yet migrated (later phases of the brief): shrink as each lands.
const NOT_YET = new Set([
  'viewport.js', 'swing.js', 'thumbs.js', 'vfxlib.js', 'workshop.js', 'graphwin.js',
  'sections/textures.js', 'sections/style.js'
])

const LITERAL = /(^|[^&\w])#(?:[0-9a-fA-F]{8}|[0-9a-fA-F]{6}|[0-9a-fA-F]{3})\b|\brgba?\(|\b0x[0-9a-fA-F]{6}\b/
// A line that holds the module's colour, not the studio's.
const MODULE_COLOUR = /type: 'color'|colou?rRow\(|placeholder: '[^']*(#|rgba?\()|\bfill: '#|\bcolour(End)?: 0x|edit\('bg'\)|low = \[\{|\/[/*][^\n]*\bcontent\b/

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

// A colour inside a comment is prose, not a colour.
const code = (line) => line.replace(/\/\/.*$/, '').replace(/\/\*.*?\*\//g, '')
const files = walk(SRC).map((p) => relative(SRC, p).split('\\').join('/')).sort()
for (const f of files) {
  if (CONTENT.has(f)) continue
  const lines = readFileSync(join(SRC, f), 'utf8').split('\n')
  const hits = []
  lines.forEach((l, i) => { if (LITERAL.test(code(l)) && !MODULE_COLOUR.test(l)) hits.push(`${i + 1}: ${l.trim().slice(0, 100)}`) })
  if (NOT_YET.has(f)) {
    check(hits.length > 0, `${f}: not migrated yet (${hits.length} literal line(s)) -- once clean, take it off NOT_YET`)
  } else if (hits.length) {
    check(false, `${f}: colour literals the skin should give:\n      ${hits.slice(0, 6).join('\n      ')}`)
  } else checks++
}
for (const f of NOT_YET) check(files.includes(f), `NOT_YET names a file that exists (${f})`)
// CONTROL: the scanner sees a literal where there is one, and the module's colours pass.
check(LITERAL.test("g.fillStyle = '#12161e'") && LITERAL.test('background:rgba(0,0,0,.5)') && LITERAL.test('color: 0x5b8fd6'), 'CONTROL: a literal is seen')
check(!LITERAL.test('background:var(--dnp-color-bg-app)') && !LITERAL.test("'&#9654;'") && !LITERAL.test('color-mix(in srgb,var(--dnp-color-accent) 55%,transparent)'), 'CONTROL: a variable is not a literal')
check(MODULE_COLOUR.test("row('text', el('input', { type: 'color', value: L.style?.color ?? '#e8e8ea' }))"), 'CONTROL: a module colour input passes')

console.log(`\nskin_literals: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
