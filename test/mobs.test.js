//
// A monster the studio writes is a monster the mob runtime loads, and a body
// the studio writes is a body the client's catalogue parser reads.
//
// ORACLES: tools/mobcheck/check.lua under LuaJIT (the real mobs.lua loading
// the real file), and client/src/render/props.js's parseProps. The brain
// fixture is the spirit from modules/doom2/maps/editor_mobs.lua, transcribed
// into the JSON the studio's cards edit, so the round trip is measured against
// a mob that already plays.
//
import { writeFileSync, existsSync, mkdtempSync, readFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { toLua } from '../src/lua.js'
import { emitMobsLua } from '../src/mobs_emit.js'
import { emitProps, nextPropId } from '../src/props_emit.js'
import { Vocab } from '../src/vocab.js'
import { ROOT } from './oracle.js'
import { parseProps } from '../../client/src/render/props.js'

const LUAJIT = join(ROOT, 'third_party', 'luajit', 'src', 'luajit')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- the serialiser ---------------------------------------------------------------
check(toLua({ a: 1, b: 'two', c: true, d: null }) === '{ a = 1, b = "two", c = true, d = nil }', 'a flat table is one line')
check(toLua([-4, 48]) === '{ -4, 48 }', 'a fraction pair is a two-element table')
check(toLua('he said "no"\n') === '"he said \\"no\\"\\n"', 'strings are escaped')
check(toLua({ end: 1, 'a-b': 2 }) === '{ ["end"] = 1, ["a-b"] = 2 }', 'keywords and odd keys are bracketed')
let threw = null
try { toLua({ speed: 0.25 }) } catch (e) { threw = e.message }
check(threw !== null && /whole number/.test(threw), `CONTROL: a fractional number is refused (${threw})`)

// --- the spirit ---------------------------------------------------------------------
const spirit = {
  hp: 80, turn_speed: 14, sight: '42.6667', pain_chance: 128, infighting: true, corpse: true,
  initial: 'look', flying: true, hover_z: '0.4000',
  vars: { ready: 0 },
  states: {
    look: { anim: 0, move: 'stop', face: 'hold',
            transitions: [{ to: 'chase', when: [{ cond: 'has_target' }, { cond: 'target_visible' }] }] },
    chase: { anim: 1, move: 'chase', face: 'target', interruptible: true,
             transitions: [
               { to: 'look', when: [{ cond: 'has_target', negate: true }] },
               { to: 'missile', when: [{ cond: 'target_within', distance: '1.6667' }, { cond: 'target_visible' }, { cond: 'cooldown_ready', var: 'ready' }] }
             ] },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: 'chase' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' },
    missile: { anim: 2, move: 'stop', face: 'target', ticks: 20, next: 'chase', interruptible: true,
               sequence: [
                 { at: 0, action: 'face' },
                 { at: 10, action: 'melee', damage: 9, range: '1.6667' },
                 { at: 10, action: 'set_cooldown', var: 'ready', ticks: 60 }
               ] }
  }
}
const module = {
  id: 'starter', propIdBase: 1000,
  mobs: { missiles: {}, mobs: { spirit } },
  props: [{ id: 1000, name: 'spirit', radius: 0.35, height: 1, speed: 5.2, solid: true,
            art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle', 1: 'walk', 2: 'Attack', 3: 'idle', 4: 'death' } } }]
}

const vocab = new Vocab(
  JSON.parse(readFileSync(join(ROOT, 'maps', 'scripts', 'trigger_vocab.json'), 'utf8')),
  JSON.parse(readFileSync(join(ROOT, 'maps', 'scripts', 'mob_vocab.json'), 'utf8')))
check(vocab.validateMobs(module.mobs).length === 0, `the spirit validates (${vocab.validateMobs(module.mobs).join(' | ')})`)
check(emitMobsLua({ id: 'x', mobs: { missiles: {}, mobs: {} } }) === null, 'a module with no mobs writes no file')

const lua = emitMobsLua(module)
check(/^-- >>> level editor: mobs\n/.test(lua) && /-- <<< level editor: mobs\n$/.test(lua), 'the mobs block is marked')
check(/mobs\.load\{/.test(lua) && /spirit = \{/.test(lua), 'mobs.load{} carries the spirit')

// A brain written with the vocabulary the mob runtime grew on 2026-09-25:
// rolled durations, headings in vars, hunting props and other mobs, waking a
// room. The studio's forms are generated from the vocabulary, so this is the
// check that what they can write, the runtime loads.
const hunter = {
  hp: 40, initial: 'sleep', sight: '30', corpse: true,
  vars: { ready: 0, heading: 0, roll: 0 },
  states: {
    sleep: { anim: 0, move: 'stop', face: 'hold',
             transitions: [{ to: 'look', when: [{ cond: 'has_target' }] }] },
    look: { anim: 0, move: 'stop', face: 'hold', ticks: 20, ticks_jitter: 10, next: 'roam',
            sequence: [{ at: 0, action: 'target_nearest', of: 'prop', prop: 'barrel', distance: '12' },
                       { at: 1, action: 'var_random', var: 'roll', min: 0, max: 9 }],
            transitions: [{ to: 'chase', when: [{ cond: 'target_is', kind: 'player' }, { cond: 'can_reach' }] },
                          { to: 'guard', when: [{ cond: 'prop_within', distance: '6', prop: 'barrel' }, { cond: 'var_at_least', var: 'roll', value: 7 }] }] },
    roam: { anim: 1, move: 'wander', face: 'movement', ticks: 60, next: 'look',
            sequence: [{ at: 0, action: 'set_angle', var: 'heading', towards: 'random' }, { at: 0, action: 'face', towards: 'var', var: 'heading' }],
            transitions: [{ to: 'look', when: [{ cond: 'stuck', ticks: 16 }] },
                          { to: 'chase', when: [{ cond: 'count_within', distance: '8', at_least: 2, mob: 'hunter' }, { cond: 'target_visible' }] }] },
    chase: { anim: 1, move: 'chase', face: 'target', interruptible: true,
             sequence: [{ at: 0, action: 'alert_nearby', radius: '10' }],
             transitions: [{ to: 'look', when: [{ cond: 'has_target', negate: true }] },
                           { to: 'look', when: [{ cond: 'target_above', by: '2' }] },
                           { to: 'attack', when: [{ cond: 'target_within', distance: '1.5' }, { cond: 'ally_in_front', negate: true }, { cond: 'cooldown_ready', var: 'ready' }] }] },
    guard: { anim: 0, move: 'stop', face: 'hold', ticks: 90, next: 'look',
             sequence: [{ at: 0, action: 'target_none' }, { at: 1, action: 'wake', radius: '4' }] },
    attack: { anim: 2, move: 'stop', face: 'target', ticks: 20, next: 'chase',
              sequence: [{ at: 0, action: 'face', towards: 'target', jitter: 5 }, { at: 10, action: 'melee', damage: 6, range: '1.5' },
                         { at: 10, action: 'set_cooldown', var: 'ready', ticks: 40, jitter: 20 }, { at: 12, action: 'target_attacker' }] },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 8, next: 'chase' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
  }
}
const module2 = { ...module, mobs: { missiles: {}, mobs: { spirit, hunter } } }
const catalogue = ['spirit', 'barrel']
const p2 = vocab.validateMobs(module2.mobs, { props: catalogue })
check(p2.length === 0, `a brain using the new vocabulary validates (${p2.join(' | ')})`)
check(vocab.validateMobs(module2.mobs, { props: ['spirit'] }).some((m) => /`prop` should be the name of a prop/.test(m)), 'CONTROL: with the catalogue to hand, a prop it lacks is named')
const jit = structuredClone(module2.mobs); delete jit.mobs.hunter.states.look.ticks
check(vocab.validateMobs(jit, { props: catalogue }).some((m) => /`ticks_jitter` and so needs `ticks`/.test(m)), 'CONTROL: ticks_jitter without ticks is named')
const kind = structuredClone(module2.mobs); kind.mobs.hunter.states.look.transitions[0].when[0].kind = 'ghost'
check(vocab.validateMobs(kind, { props: catalogue }).some((m) => /`kind` should be one of player, mob, prop/.test(m)), 'CONTROL: a target kind the vocabulary lacks is named')
const lua2 = emitMobsLua(module2)

// The validator's own rules, each the runtime's.
const broken = structuredClone(module.mobs)
delete broken.mobs.spirit.states.death
const p1 = vocab.validateMobs(broken)
check(p1.some((m) => /corpse = true and no death/.test(m)), 'CONTROL: corpse without death is named')
const broken2 = structuredClone(module.mobs)
delete broken2.mobs.spirit.states.pain.next
check(vocab.validateMobs(broken2).some((m) => /needs `next`/.test(m)), 'CONTROL: ticks without next is named')
const broken3 = structuredClone(module.mobs)
broken3.mobs.spirit.states.look.transitions[0].to = 'nowhere'
check(vocab.validateMobs(broken3).some((m) => /`to` must name a state/.test(m)), 'CONTROL: a transition to nowhere is named')
const broken4 = structuredClone(module.mobs)
broken4.mobs.spirit.states.missile.sequence[1].action = 'hug'
check(vocab.validateMobs(broken4).some((m) => /unknown action "hug"/.test(m)), 'CONTROL: an unknown action is named')

if (!existsSync(LUAJIT)) {
  console.log('mobs: no luajit (scripts/setup_luajit.sh) -- runtime checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-mobs-'))
  const file = join(dir, 'mobs.lua')
  writeFileSync(file, lua)
  const r = spawnSync(LUAJIT, ['tools/mobcheck/check.lua', file], { cwd: ROOT, encoding: 'utf8' })
  check(r.status === 0 && /1 mobs, 0 missiles, 0 problems/.test(r.stdout), `mobcheck accepts the spirit:\n${r.stdout}${r.stderr}`)
  const hfile = join(dir, 'hunter.lua')
  writeFileSync(hfile, lua2)
  const rh = spawnSync(LUAJIT, ['tools/mobcheck/check.lua', hfile], { cwd: ROOT, encoding: 'utf8' })
  check(rh.status === 0 && /2 mobs, 0 missiles, 0 problems/.test(rh.stdout), `mobcheck accepts the brain written with the new vocabulary:\n${rh.stdout}${rh.stderr}`)
  const kfile = join(dir, 'kind.lua')
  writeFileSync(kfile, emitMobsLua({ id: 'x', mobs: kind }))
  check(spawnSync(LUAJIT, ['tools/mobcheck/check.lua', kfile], { cwd: ROOT, encoding: 'utf8' }).status !== 0, 'CONTROL: the runtime refuses the unknown target kind too')
  const bfile = join(dir, 'broken.lua')
  writeFileSync(bfile, emitMobsLua({ id: 'x', mobs: broken }))
  const rb = spawnSync(LUAJIT, ['tools/mobcheck/check.lua', bfile], { cwd: ROOT, encoding: 'utf8' })
  check(rb.status !== 0, 'CONTROL: the runtime refuses the corpse with no death state too')
}

// --- the body ---------------------------------------------------------------------
const props = emitProps(module)
check(nextPropId(module) === 1001, `the next id follows the last (${nextPropId(module)})`)
check(nextPropId({ propIdBase: 1000, props: [] }) === 1000, 'an empty module starts at its base')
const parsed = parseProps(props)
const kinds = parsed.kinds ?? parsed
const k = kinds.get(1000)
check(k && k.name === 'spirit' && k.radius === 0.35 && k.height === 1 && (k.flags & 1) === 1,
      `the client reads the body back (${JSON.stringify(k && { name: k.name, radius: k.radius, height: k.height, flags: k.flags })})`)
check(k && k.type === 'atlas' && k.sheet === 'SPIR' && k.states.get(4)?.anim === 'death' && k.states.get(0)?.anim === 'idle',
      'the client reads the five atlas states back')
check((parsed.warnings ?? []).length === 0, `no parser warnings (${(parsed.warnings ?? []).join(' | ')})`)
// The drawing scale: on the prop line, read by the client as a multiplier,
// consumed and ignored by the server (server/src/props.hpp). Absent at 1.
const scaled = { ...module, props: [{ ...module.props[0], scale: 2.5 }] }
const ks = parseProps(emitProps(scaled)).kinds.get(1000)
check(ks?.scale === 2.5 && /^prop 1000 spirit .* scale 2\.5( |$)/m.test(emitProps(scaled)), `a body's scale reaches the client's catalogue (${ks?.scale})`)
check(!/scale/.test(emitProps(module)), 'CONTROL: a body at scale 1 writes no scale')

console.log(`\nmobs: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
