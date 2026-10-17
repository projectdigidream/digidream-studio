//
// A ThreeSprite project with no animations yet (every sprite as it is first
// drawn) is baked as one still picture, not refused (src/tsprite_still.js).
//
// ORACLE: ThreeSprite's own runtime (vendor/tsprite.js) composing the result,
// and the studio's sprite baker's files. CONTROL: the runtime alone refuses
// the same project; a project with animations is left as it is.
//
import { readFileSync, existsSync } from 'node:fs'
import { join } from 'node:path'
import { unzipSync, zipSync } from '../vendor/fflate.js'
import { loadTsprite } from '../vendor/tsprite.js'
import { composeTsprite, stillOf, STILL } from '../src/tsprite_still.js'
import { bake } from '../src/bake/tsprite.js'
import { ROOT } from './oracle.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const SAMPLE = join(ROOT, 'threesprite', 'runtime', 'test', 'fixtures', 'sample.tsprite')
if (!existsSync(SAMPLE)) { console.log('tsprite_still: no ThreeSprite sample here -- not run'); process.exit(0) }
const bytes = new Uint8Array(readFileSync(SAMPLE))
const files = unzipSync(bytes)
const p = JSON.parse(new TextDecoder().decode(files['project.json']))
p.animations = {}
p.animationOrder = []
files['project.json'] = new TextEncoder().encode(JSON.stringify(p))
const bare = zipSync(files)

let refused = ''
try { loadTsprite(bare) } catch (e) { refused = String(e.message) }
check(/no animations/.test(refused), `CONTROL: the runtime alone refuses a sprite with no animations (${refused})`)
const { r, still } = composeTsprite(loadTsprite, bare)
const anims = r.sheet.manifest.animations
check(still && anims.length === 1 && anims[0].name === STILL && r.png.length > 0, `it is composed as one still "${STILL}" picture (${anims.map((a) => a.name).join(', ')})`)
const baked = await bake({ key: 'BOSS', bytes: bare })
const manifest = JSON.parse(new TextDecoder().decode(baked.files['sprites/BOSS.json']))
check(manifest.sprite === 'BOSS' && manifest.animations[0].name === STILL && baked.files['sprites/BOSS.png']?.length > 0, 'the sprite baker writes its sheet, under the module\'s name for it')
check(baked.problems.some((x) => /no animations yet/.test(x)), 'and says it is a still until it has animations')
check(stillOf(bytes) === null && composeTsprite(loadTsprite, bytes).still === false, 'CONTROL: a project with animations is left as it is')

console.log(`tsprite_still: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
