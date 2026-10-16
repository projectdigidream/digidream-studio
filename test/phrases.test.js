// The vocabulary in words (src/phrases.js): every phrase names a real entry of
// the engine's vocabularies with real argument names, and its units round-trip.
//
// ORACLE: engine/maps/scripts/mob_vocab.json and weapon_vocab.json.
//
// Run: node studio/test/phrases.test.js
import { readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { MOB_CONDITIONS, WEAPON_CONDITIONS, MOB_ACTIONS, WEAPON_ACTIONS, MISSILE_ACTIONS, newCond, newAct, sentence, shown, store, shortOf, groupsOf, condKey, fxOf, secs, ticksOf } from '../src/phrases.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const mob = JSON.parse(readFileSync(join(ROOT, 'engine/maps/scripts/mob_vocab.json'), 'utf8'))
const weapon = JSON.parse(readFileSync(join(ROOT, 'engine/maps/scripts/weapon_vocab.json'), 'utf8'))

let checks = 0
let fails = 0
const check = (ok, what) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${what}`) } }

const byName = (list) => new Map(list.map((x) => [x.name, x]))
function against (table, vocabList, kind, what) {
  const V = byName(vocabList)
  for (const [key, ph] of Object.entries(table)) {
    const name = key.replace(/!$/, '').split(':')[0]
    const spec = V.get(name)
    check(!!spec, `${what} "${key}" is a ${kind} of the engine's vocabulary`)
    if (!spec) continue
    const args = new Set((spec.args ?? []).map((a) => a.name))
    for (const part of ph.p) if (part[0] !== 't') check(args.has(part[1]), `${what} "${key}": "${part[1]}" is one of ${name}'s arguments (${[...args].join(', ')})`)
    // with_target is the editor's own marker, compiled away by brainc.js (a has_target beside it)
    for (const k of Object.keys(ph.fixed ?? {})) if (k !== 'with_target') check(args.has(k), `${what} "${key}": its fixed "${k}" is an argument`)
    // the defaults it writes are all the required arguments
    const made = kind === 'condition' ? newCond(table, key) : newAct(table, key, 0, { missile: 'flare', sound: 'boom', state: 'idle' })
    for (const a of spec.args ?? []) {
      if (a.optional) continue
      check(made[a.name] !== undefined, `${what} "${key}": a new one has ${name}'s required "${a.name}"`)
    }
  }
}
against(MOB_CONDITIONS, mob.conditions, 'condition', 'monster condition')
against(WEAPON_CONDITIONS, weapon.conditions, 'condition', 'weapon condition')
against(MOB_ACTIONS, mob.actions, 'action', 'monster step')
against(WEAPON_ACTIONS, weapon.actions, 'action', 'weapon step')
against(MISSILE_ACTIONS, mob.actions, 'action', 'missile action')

// units: what is typed is what is kept, in the engine's units
check(fxOf(1.5) === '1.5' && fxOf(2) === 2 && fxOf(0.1 + 0.2) === '0.3', 'a fixed-point value is an int or an exact decimal string')
check(ticksOf(0.5) === 30 && secs(30) === 0.5, 'seconds are 60 ticks')
const far = newCond(MOB_CONDITIONS, 'target_within!')
check(far.cond === 'target_within' && far.negate === true && far.distance === 8, '"further than" is target_within negated')
check(condKey(MOB_CONDITIONS, far) === 'target_within!' && sentence(MOB_CONDITIONS, far) === 'the target is further than 8 m', `and reads as such ("${sentence(MOB_CONDITIONS, far)}")`)
const few = newCond(MOB_CONDITIONS, 'count_within!')
check(few.at_least === 3 && shown(['n', 'at_least', 'n+1', 2], few) === 2, '"no more than 2" keeps at_least 3, negated')
store(['n', 'at_least', 'n+1'], few, 4)
check(few.at_least === 5, 'and typing 4 keeps 5')
const anyKind = newCond(MOB_CONDITIONS, 'mob_within')
check(!('mob' in anyKind) && sentence(MOB_CONDITIONS, anyKind).includes('(any kind)'), '"any kind" leaves `mob` out')
const st = newAct(MOB_ACTIONS, 'set_cooldown', 12)
store(['n', 'ticks', 's'], st, 1.5)
check(st.at === 12 && st.ticks === 90, 'a step keeps its time and its seconds as ticks')
const sp = newAct(MOB_ACTIONS, 'set_param:move_speed')
check(sp.action === 'set_param' && sp.param === 'move_speed' && sp.value === 8, '"change its speed" is set_param of move_speed')
check(shortOf(MOB_CONDITIONS, { cond: 'target_within', distance: '1.7' }) === '≤1.7 m', 'an arrow\'s label is short')
check(sentence(MOB_CONDITIONS, { cond: 'mystery', foo: 2 }).includes('mystery'), 'an entry the phrasebook lacks still has a sentence')
const groups = groupsOf(MOB_CONDITIONS, 'cond')
check(groups.length >= 5 && groups.every((g) => g.opts.every((o) => o.label && !o.label.includes('undefined'))), 'the chooser\'s groups read as sentences')
check(groupsOf(WEAPON_ACTIONS, 'act').flatMap((g) => g.opts).every((o) => !o.label.includes('undefined')), 'and so do the steps')

console.log(`phrases: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
