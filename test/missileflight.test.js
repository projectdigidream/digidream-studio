// A missile's flight on the Missiles page (src/missileflight.js) against the engine's.
//
// ORACLE: engine/server/tests/test_lua_mobneeds.cpp, which flies these same
// missiles in the real runtime and prints what they did: a glob thrown at a
// player ten away peaks about 3.3 up and lands; dropped level it comes down
// 2.31 on; a low and a high throw at 9 a second both land six away, the lob
// 2.6 higher; a throw too weak for the distance falls short; a grenade bounces.
// Controls: the same glob with no gravity flies straight and peaks at nothing.
//
// Run: node studio/test/missileflight.test.js
import { flight } from '../src/missileflight.js'

let checks = 0
let fails = 0
const check = (ok, what) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${what}`) } }

const glob = { speed: '6', gravity: '9', life: 400, z_offset: '0.6667' }
const a = flight(glob, { dist: 10 })
check(a.end === 'hit' && a.peak > 3.0 && a.peak < 3.5, `a glob thrown 10 away lands, peaking about 3.3 up (${a.end}, ${a.peak.toFixed(2)})`)
const b = flight(glob, { dist: 30, fromPlayer: true })
check(b.end === 'floor' && b.endX > 2.0 && b.endX < 2.6, `thrown level, it comes down 2.31 on (${b.endX.toFixed(2)})`)
const lo = flight({ ...glob, speed: '9', gravity: '9.8', throw: 'low' }, { dist: 6 })
const hi = flight({ ...glob, speed: '9', gravity: '9.8', throw: 'high' }, { dist: 6 })
check(lo.end === 'hit' && hi.end === 'hit', `a low and a high throw at 9 a second both land six away (${lo.end}, ${hi.end})`)
check(Math.abs(hi.peak - lo.peak - 2.6) < 0.3, `the lob peaks about 2.6 higher (${(hi.peak - lo.peak).toFixed(2)})`)
const weak = flight({ ...glob, speed: '3', gravity: '9.8', throw: 'low' }, { dist: 6 })
check(weak.end !== 'hit' && weak.endX < 6, `a throw too weak for the distance falls short (${weak.end} at ${weak.endX.toFixed(2)})`)
const gren = flight({ ...glob, speed: '3', life: 900, bounces: 2 }, { dist: 30, fromPlayer: true })
check(gren.bounced === 2 && gren.end === 'floor', `a grenade bounces twice, then stops on the floor (${gren.bounced}, ${gren.end})`)
const straight = flight({ speed: '16', life: 120, z_offset: '1.4' }, { dist: 8 })
check(straight.end === 'hit' && straight.peak < 0.01, `CONTROL: with no gravity it flies straight at the target's middle (${straight.end}, peak ${straight.peak.toFixed(2)})`)
const short = flight({ speed: '16', life: 20, z_offset: '1.4' }, { dist: 8 })
check(short.end === 'expired' && short.endX < 8, `its life ends it short of the target (${short.end} at ${short.endX.toFixed(2)})`)

console.log(`missileflight: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
