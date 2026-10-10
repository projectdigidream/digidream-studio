//
// HOW SWINGS LOOK (src/swings_emit.js, docs/SWINGS.md): what the studio writes
// as assets/sprites/swings.json is read by the client's own parser
// (render/slash.js parseSwingStyles) with no errors, and styleFor gives each
// weapon and monster the look the studio's form shows (slashLook). A module
// that says nothing writes no file (the engine's look); a cleared entry is gone.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { swingsJson, slashEntry, slashLook, tidySwings, SLASH_DEFAULT } from '../src/swings_emit.js'
import { parseSwingStyles, styleFor, DEFAULT_SLASH } from '../../engine/client/src/render/slash.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++ }

check(JSON.stringify(SLASH_DEFAULT) === JSON.stringify({ ...DEFAULT_SLASH }) || Object.entries(DEFAULT_SLASH).every(([k, v]) => SLASH_DEFAULT[k] === v),
      'the studio\'s base look is the engine\'s DEFAULT_SLASH')
const m = {}
check(swingsJson(m) === null, 'CONTROL: a module that says nothing writes no swings.json')
slashEntry(m, 'default', null, { make: true }).color = '#80c0ff'
slashEntry(m, 'weapon', 'axe', { make: true }).width = 0.8
Object.assign(slashEntry(m, 'monster', 'spirit', { make: true }), { show: false })
Object.assign(slashEntry(m, 'monster', 'imp', { make: true }), { blend: 'normal', texture: 'fx/streak.png', fade: 0.5, opacity: 0.9 })
const text = swingsJson(m)
const parsed = parseSwingStyles(JSON.parse(text))
check(parsed.errors.length === 0, `the client's parser takes it without a word (${parsed.errors.join('; ')})`)
const same = (scope, name, opts) => {
  const want = slashLook(m, scope, name); const got = styleFor(parsed.styles ?? parsed, opts)
  return Object.keys(SLASH_DEFAULT).every((k) => JSON.stringify(got[k] ?? null) === JSON.stringify(want[k] ?? null))
}
check(same('weapon', 'axe', { weapon: 'axe' }), 'a weapon\'s look in the game is the one the form shows (default + its own)')
check(same('monster', 'imp', { monster: 'imp' }) && same('monster', 'spirit', { monster: 'spirit' }), 'and a monster\'s, by its catalogue name')
check(same('default', null, {}), 'and the default, which other players get')
slashEntry(m, 'weapon', 'axe').width = undefined
delete m.swings.weapons.axe.width
tidySwings(m)
check(!m.swings.weapons && !JSON.parse(swingsJson(m)).weapons, 'an emptied entry is forgotten, and leaves the file')

console.log(`\nswings: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
