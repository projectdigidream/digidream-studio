//
// STYLES FROM OUTSIDE (src/skin.js parseSkinFile): a skin baked by uikit is
// taken whether it comes as its JSON or as the ES module a tool vendors; the
// source skin.json (not baked), and anything else, is refused with a reason.
//
// House style: standalone, prints ok/FAIL, ends with a count.
//
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { parseSkinFile } from '../src/skin.js'

const HERE = dirname(fileURLToPath(import.meta.url))
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; console.log(`  ${ok ? 'ok  ' : 'FAIL'} ${label}`); if (!ok) fails++ }

const js = readFileSync(join(HERE, '..', 'vendor', 'uikit', 'skins', 'paper.skin.js'), 'utf8')
const asJs = parseSkinFile(js)
check(!(asJs instanceof Error) && asJs.id === 'paper' && asJs.modes.includes('night'), `a baked .skin.js is taken (${asJs.message ?? asJs.id})`)
const asJson = parseSkinFile(JSON.stringify(asJs))
check(!(asJson instanceof Error) && asJson.id === 'paper', 'and the same bundle as .skin.json')
const source = parseSkinFile(readFileSync(join(HERE, '..', '..', 'uikit', 'skins', 'sample', 'skin.json'), 'utf8'))
check(source instanceof Error && /bake it/.test(source.message), `CONTROL: a skin's source, not baked, is refused and says to bake it (${source.message})`)
check(parseSkinFile('hello') instanceof Error && parseSkinFile('{"a":1}') instanceof Error, 'CONTROL: anything else is refused')
const badId = parseSkinFile(JSON.stringify({ ...asJs, id: '../x' }))
check(badId instanceof Error, 'an id that is not a plain name is refused')

console.log(`\nskin_import: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
