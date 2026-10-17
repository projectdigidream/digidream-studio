//
// What a particle is drawn as (engine 0.2.1.2, docs/ENGINE_NEEDS.md "A
// particle's picture"): the studio writes `shape` and `sprite` on a kind's
// line only when they say something, and a sprite over a shape. And how it
// follows a body (a missile's trail, an attached emitter): any kind keeps its
// `rate`, which a trail emits at, and `carry 1` takes the specks along.
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
check(/ rate 60 /.test(vfxLine({ ...base, rate: 60 })) && !/linger|attach/.test(vfxLine({ ...base, rate: 60, linger: 0.4 })), 'a burst kind keeps its rate, what a missile\'s trail emits at; lingering is an attached emitter\'s alone')
check(/ carry 1 /.test(vfxLine({ ...base, carry: 1 })) && !/carry/.test(vfxLine({ ...base, carry: 0 })) && !/carry/.test(vfxLine(base)), 'carried says `carry 1`; left behind, the default, writes nothing')

// read back by the client's own parser, once it knows the words
const vfx = await import('../../engine/client/src/render/vfx.js')
if (vfx.PARTICLE_SHAPES) {
  const k = vfx.parseVfx(vfxLine({ ...base, shape: 'hexagon' }) + '\n' + vfxLine({ ...base, id: 21, sprite: 'fx/spark' })).kinds
  check(k.get(20)?.shape === 'hexagon' && k.get(21)?.sprite === 'fx/spark', `the client reads them back (${k.get(20)?.shape}, ${k.get(21)?.sprite})`)
  check(vfx.PARTICLE_SHAPES.join() === SHAPES.map(([v]) => v).join(), `the studio offers the client's shapes (${vfx.PARTICLE_SHAPES.join()})`)
} else console.log('particles: this engine draws no shapes yet -- the read-back is not run')
if (vfx.FOLLOW_GRACE !== undefined) {
  const k = vfx.parseVfx([vfxLine({ ...base, rate: 60, carry: 1 }), vfxLine({ ...base, id: 21, rate: 30 })].join('\n'))
  check(!k.warnings?.length, `the client reads carry and a burst's rate without a warning (${(k.warnings ?? []).join(' | ')})`)
  check(k.kinds.get(20)?.carry === 1 && k.kinds.get(20)?.rate === 60 && !k.kinds.get(21)?.carry && k.kinds.get(21)?.rate === 30, `carried and left behind, each at its rate (${JSON.stringify([k.kinds.get(20)?.carry, k.kinds.get(20)?.rate, k.kinds.get(21)?.carry, k.kinds.get(21)?.rate])})`)
} else console.log('particles: this engine has no trails yet -- carry is not read back')

console.log(`particles: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
