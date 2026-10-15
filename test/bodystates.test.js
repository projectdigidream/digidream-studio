// A BODY'S STATES (brain.js): the five, plus every state number the monster's
// brain uses -- its states' `anim` and each `set_anim` -- and any the body
// already has, so a monster's own state (Cinderfall's husk leaps in 5) can be
// given its animation. And a state with no animation is not written.
//
//   node studio/test/bodystates.test.js

import { animUses, bodyStates } from '../src/brain.js'
import { emitProps } from '../src/props_emit.js'

const name = 'bodystates'
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

const mob = { states: {
  look: { anim: 1 }, chase: { anim: 1 }, attack: { anim: 2 },
  leap: { anim: 5, sequence: [{ at: 4, action: 'set_anim', anim: 6 }, { at: 8, action: 'sound', name: 'x' }] },
  burn: { anim: 7 }
} }
const uses = animUses(mob)
check(JSON.stringify([...uses.keys()].sort((a, b) => a - b)) === '[1,2,5,6,7]', `the brain's state numbers are found, set_anim's too (${[...uses.keys()]})`)
check(uses.get(1).join() === 'look,chase' && uses.get(6).join() === 'leap', 'with the states that use each')
const prop = { art: { kind: 'atlas', sheet: 'HUSK', states: { 0: 'idle', 9: 'special' } } }
check(bodyStates(prop, uses).join() === '0,1,2,3,4,5,6,7,9', `the list: the five, the brain's, and the body's own (${bodyStates(prop, uses)})`)
check(bodyStates({ art: null }).join() === '0,1,2,3,4', 'CONTROL: a body with nothing else lists the five')
check(animUses(undefined).size === 0 && animUses({ states: { a: { anim: 'x' }, b: { anim: -1 } } }).size === 0, 'CONTROL: no brain, or no number, finds nothing')

const text = emitProps({ propIdBase: 1000, props: [{ id: 1000, name: 'husk', radius: 0.4, height: 1.6, solid: true, art: { kind: 'atlas', sheet: 'HUSK', states: { 0: 'idle', 5: 'leap', 6: '' } } }] })
check(/atlas 1000 sheet HUSK anim idle/.test(text) && /atlas 1000 state 5 sheet HUSK anim leap/.test(text), 'a state of its own is written for the game, with its number')
check(!/state 6/.test(text) && !/anim\s*$/m.test(text), 'a state with no animation yet is not written (no empty "anim")')

console.log(`\n${name}: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
