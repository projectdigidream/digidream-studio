//
// What a particle is drawn as (engine 0.2.1.2, docs/ENGINE_NEEDS.md "A
// particle's picture"): the studio writes `shape` and `sprite` on a kind's
// line only when they say something, and a sprite over a shape.
//
// ORACLE: the line read back by the client's own parser (render/vfx.js
// parseVfx), when it knows the words; the text of the line otherwise.
//
import { vfxLine, SHAPES } from '../src/props_emit.js'

let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } }

const base = { id: 20, type: 'particles', count: 8, life: 0.5, colour: 0xffffff, colourEnd: 0x000000 }
check(!/shape|sprite/.test(vfxLine(base)), 'a soft dot, the default, writes neither word: a kind made before draws as it did')
check(!/shape/.test(vfxLine({ ...base, shape: 'soft' })), 'nor does saying soft')
check(/ shape star$/.test(vfxLine({ ...base, shape: 'star' })), `a hard star says so (${vfxLine({ ...base, shape: 'star' })})`)
check(/ sprite fx\/spark$/.test(vfxLine({ ...base, shape: 'disc', sprite: 'fx/spark' })) && !/shape/.test(vfxLine({ ...base, shape: 'disc', sprite: 'fx/spark' })), 'a picture is written over a shape, as the engine draws the picture')
check(SHAPES.map(([v]) => v).join() === 'soft,disc,square,hexagon,star', 'the five shapes the engine knows, the soft dot first')
check(!/shape|sprite/.test(vfxLine({ id: 1, type: 'tracer', shape: 'star', sprite: 'x' })), 'CONTROL: a tracer writes neither')

// read back by the client's own parser, once it knows the words
const vfx = await import('../../engine/client/src/render/vfx.js')
if (vfx.PARTICLE_SHAPES) {
  const k = vfx.parseVfx(vfxLine({ ...base, shape: 'hexagon' }) + '\n' + vfxLine({ ...base, id: 21, sprite: 'fx/spark' })).kinds
  check(k.get(20)?.shape === 'hexagon' && k.get(21)?.sprite === 'fx/spark', `the client reads them back (${k.get(20)?.shape}, ${k.get(21)?.sprite})`)
  check(vfx.PARTICLE_SHAPES.join() === SHAPES.map(([v]) => v).join(), `the studio offers the client's shapes (${vfx.PARTICLE_SHAPES.join()})`)
} else console.log('particles: this engine draws no shapes yet -- the read-back is not run')

console.log(`particles: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
