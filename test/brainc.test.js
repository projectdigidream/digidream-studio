// The editor's words compiled to the engine's (src/brainc.js), checked by the engine.
//
// ORACLES: maps/scripts/mobs.lua itself, under LuaJIT, in the fake world of
// tools/mobcheck/world.lua -- the brain is loaded by mobs.load and RUN, and
// what it does is read from the runtime's own records. Every claim has a
// control: the same brain without the editor's word must fail it, so a pass is
// the compiler's doing and not a brain that happens to behave.
//
// Run: node studio/test/brainc.test.js
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileMob, compileMobs, compileWeapon, onceVar } from '../src/brainc.js'
import { emitMobsLua } from '../src/mobs_emit.js'
import { emitWeaponsLua } from '../src/weapons_emit.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')

let checks = 0
let fails = 0
const check = (ok, what) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${what}`) } }

// A small boss: phase 1 chases; below 60% it roars ONCE into phase 2, which is faster; its
// roar ends in frenzy when `phase` is at least 3, else in chase2; pain goes back to what it was doing.
const boss = () => ({
  hp: 100, pain_chance: 255, initial: 'idle', sight: '40', turn_speed: 12,
  vars: { phase: 0, roars: 0 },
  phases: [{ id: 'p1', name: 'Phase 1' }, { id: 'p2', name: 'Phase 2', speed: 6 }],
  any: [{ to: 'roar', when: [{ cond: 'hp_below', percent: 60 }], once: true },
        { to: 'idle', when: [] }],
  states: {
    idle: { anim: 0, move: 'stop', face: 'target', phase: 'p1', transitions: [{ to: 'chase', when: [{ cond: 'has_target' }] }, { to: 'chase', when: [] }] },
    chase: { anim: 1, move: 'chase', face: 'target', phase: 'p1',
             transitions: [{ to: 'idle', when: [{ cond: 'target_within', distance: '30', negate: true, with_target: true }] }] },
    roar: { anim: 0, move: 'stop', face: 'target', phase: 'p2', ticks: 30, next: 'chase2',
            sequence: [{ at: 10, action: 'add_var', var: 'roars', by: 1 }],
            ends: [{ to: 'frenzy', when: [{ cond: 'var_at_least', var: 'phase', value: 3 }] }] },
    chase2: { anim: 1, move: 'chase', face: 'target', phase: 'p2' },
    frenzy: { anim: 1, move: 'chase', face: 'target', phase: 'p2' },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: '@previous' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
  }
})

// ---- what the compiler writes ----------------------------------------------------------
{
  const c = compileMob(boss(), { speed: 4 })
  const chase = c.states.chase.transitions
  check(chase[0].to === 'roar' && chase[0].when.some((x) => x.cond === 'hp_below') && chase[0].when.some((x) => x.cond === 'var_is' && x.var === onceVar(0) && x.value === 0),
    'a rule for any state goes first in a state, and "only once" needs its var still 0')
  check(!c.states.roar.transitions?.some((t) => t.to === 'roar'), 'a rule for any state is not put in its own target (it would restart it)')
  check(!c.states.death.transitions, 'death follows no rule for any state')
  check(c.states.pain.transitions?.[0]?.to === 'roar', 'pain follows the rules for any state like any state')
  check(c.states.roar.sequence[0].action === 'set_var' && c.states.roar.sequence[0].var === onceVar(0) && c.states.roar.sequence[0].value === 1,
    'the state a once-rule enters sets its var first thing')
  check(c.vars[onceVar(0)] === 0, 'and the var is declared')
  check(!c.states.chase.transitions.some((t) => t.to === 'idle' && t.when.length === 0) && !c.states.idle.transitions.some((t) => !t.when.length),
    'an unfinished rule (no condition yet) is not written, for any state or its own')
  const ends = c.states.roar.transitions.at(-1)
  check(ends.to === 'frenzy' && ends.when.some((x) => x.cond === 'state_elapsed' && x.ticks === 30), 'an end branch is a transition on the state\'s elapsed time, after its own')
  const far = c.states.chase.transitions.find((t) => t.to === 'idle')
  check(far.when.some((x) => x.cond === 'has_target' && !x.negate) && !far.when.some((x) => 'with_target' in x), '"further than" (the editor\'s, marked) also needs a target, and the marker is not written')
  const hand = compileMob({ hp: 5, initial: 'a', states: { a: { anim: 0, transitions: [{ to: 'a', when: [{ cond: 'target_within', distance: '3', negate: true }] }], sequence: [{ at: 12, action: 'face' }, { at: 0, action: 'set_cooldown', var: 'r', ticks: 9 }] } } })
  check(hand.states.a.transitions[0].when.length === 1, 'a negated target_within written by hand keeps its meaning (no has_target added)')
  check(hand.states.a.sequence[0].at === 12 && hand.states.a.sequence[1].at === 0, 'and a sequence keeps its order: the runtime walks it in order, so a reorder would change when a step runs')
  const sp = (st) => c.states[st].sequence?.find((x) => x.action === 'set_param')
  check(sp('chase2')?.value === 6 && sp('chase2')?.param === 'move_speed', 'a phase\'s speed is set as its states begin')
  check(sp('chase')?.value === 4, 'a state of a phase with no speed of its own goes back to the body\'s')
  check(!sp('pain') && !sp('death'), 'reactions keep the speed they interrupted (pain resumes without re-running a first step)')
  for (const k of ['phases', 'any', 'label']) check(!(k in c), `the editor's \`${k}\` is not written`)
  for (const k of ['phase', 'ends', 'no_any']) check(!Object.values(c.states).some((s) => k in s), `nor a state's \`${k}\``)
  const plain = compileMob({ hp: 5, initial: 'a', states: { a: { anim: 0, transitions: [{ to: 'a' }] } } })
  check(plain.states.a.transitions.length === 1 && !plain.states.a.sequence && !plain.vars, 'a brain with none of the editor\'s words is written as it is (a transition with no `when` list stays)')
  const opt = boss(); opt.states.chase2.no_any = true
  check(!compileMob(opt).states.chase2.transitions, 'a state that opts out of the rules for any state gets none')
  const w = compileWeapon({ label: 'Gun', order: 1, initial: 'ready', any: [{ to: 'ready', when: [{ cond: 'no_ammo' }] }],
    phases: { ready: { anim: 0, transitions: [{ to: 'fire', when: [{ cond: 'button_pressed' }] }] }, fire: { anim: 2, ticks: 12, next: 'ready', ends: [{ to: 'fire', when: [{ cond: 'button_held' }] }] } } })
  check(w.label === 'Gun', 'a weapon keeps its `label` (the engine\'s own)')
  check(w.phases.fire.transitions[0].to === 'ready' && w.phases.fire.transitions.at(-1).when.some((x) => x.cond === 'phase_elapsed' && x.ticks === 12), 'a weapon\'s rules for any phase and its end branches compile with phase_elapsed')
  check(!w.phases.ready.transitions.some((t) => t.to === 'ready'), 'and not into the phase the rule goes to')
}

// ---- what the engine does with it -------------------------------------------------------
if (!existsSync(LUAJIT)) {
  console.log('brainc: no luajit (engine/scripts/setup_luajit.sh) -- runtime checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-brainc-'))
  const run = (brain, script, name) => {
    const lua = emitMobsLua({ id: 't', mobs: { missiles: {}, mobs: { boss: brain } }, props: [{ name: 'boss', speed: 4 }] })
    const f = join(dir, name)
    writeFileSync(f, `local W = dofile("tools/mobcheck/world.lua")
dofile("maps/scripts/mob_vocab.lua")
dofile("maps/scripts/mobs.lua")
local okl, probs = true, {}
local real = mobs.load
mobs.load = function(d) okl, probs = real(d); return okl, probs end
${lua}
mobs.load = real
if not okl then for _, p in ipairs(probs) do print("PROBLEM " .. p) end os.exit(2) end
local function step(n) for _ = 1, n do W.tick_n = W.tick_n + 1; W.advance(); on_tick() end end
local entered = {}
local last
local function watch(z, n) for _ = 1, n do step(1); local s = mobs.live[z:index()].state; if s ~= last then entered[#entered + 1] = s; last = s end end end
W.reset(); mobs.reset()
local z = mobs.spawn("boss", { x = W.mkfx(0), y = W.mkfx(0), z = W.mkfx(0) })
local p = W.add("player", 6, 0, 0)
W.see = true
W.rolls = { 0 }
${script}
print("PATH " .. table.concat(entered, ","))
local r = mobs.live[z:index()]
print("ROARS " .. tostring(r.vars.roars or 0))
`)
    const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    return { status: r.status, out, path: (/PATH (.*)/.exec(out)?.[1] ?? '').split(','), roars: Number(/ROARS (\d+)/.exec(out)?.[1] ?? -1) }
  }
  const count = (path, s) => path.filter((x) => x === s).length

  // Two hits below 60%: the roar happens once.
  const hits = 'watch(z, 40); mobs.hurt(z, 45, nil); watch(z, 80); mobs.hurt(z, 10, nil); watch(z, 80)'
  const a = run(boss(), hits, 'once.lua')
  check(a.status === 0, `the compiled boss loads and runs in the engine's mobs.lua:\n${a.out}`)
  check(count(a.path, 'roar') === 1, `two hits below 60%: it roars once (${a.path.join(' → ')})`)
  check(a.roars === 1, `and the roar's step ran once (${a.roars})`)
  const noOnce = boss(); delete noOnce.any[0].once
  const a2 = run(noOnce, hits, 'once_ctl.lua')
  check(count(a2.path, 'roar') > 1, `CONTROL: without "only once" it roars again (${a2.path.join(' → ')})`)

  // A hit in phase 2: pain, then back to chase2 -- not to phase 1's chase.
  const inP2 = 'watch(z, 40); mobs.hurt(z, 45, nil); watch(z, 100); mobs.hurt(z, 5, nil); watch(z, 40)'
  const b = run(boss(), inP2, 'resume.lua')
  const afterPain = b.path.slice(b.path.lastIndexOf('pain') + 1)
  check(b.path.includes('chase2') && afterPain[0] === 'chase2', `a hit in phase 2 goes back to chase2 (${b.path.join(' → ')})`)
  const noBack = boss(); noBack.states.pain.next = 'chase'
  const b2 = run(noBack, inP2, 'resume_ctl.lua')
  const after2 = b2.path.slice(b2.path.lastIndexOf('pain') + 1)
  check(after2[0] === 'chase', `CONTROL: with pain going on to chase, a hit in phase 2 drops it to phase 1 (${b2.path.join(' → ')})`)

  // The roar's end: frenzy when phase >= 3 (set at spawn), else chase2.
  const roarOnly = 'watch(z, 40); mobs.hurt(z, 45, nil); watch(z, 80)'
  const third = boss(); third.vars.phase = 3
  const c1 = run(third, roarOnly, 'ends.lua')
  check(c1.path.includes('frenzy') && !c1.path.includes('chase2'), `with phase 3 the roar ends in frenzy (${c1.path.join(' → ')})`)
  const c2 = run(boss(), roarOnly, 'ends_ctl.lua')
  check(c2.path.includes('chase2') && !c2.path.includes('frenzy'), `CONTROL: with phase 0 it ends in chase2, its plain next (${c2.path.join(' → ')})`)

  // "Further than 30": with a target 6 away it keeps chasing; with none it does not go idle on that rule alone.
  const d = run(boss(), 'watch(z, 60)', 'far.lua')
  check(d.path.includes('chase') && !d.path.slice(d.path.indexOf('chase')).includes('idle'), `a target 6 m away is not "further than 30" (${d.path.join(' → ')})`)
  const farOff = run(boss(), 'watch(z, 30); p.p.x = W.mkfx(35); watch(z, 40)', 'far2.lua')
  check(farOff.path.slice(farOff.path.indexOf('chase')).includes('idle'), `a target 35 m away (still in its 40 m sight) is (${farOff.path.join(' → ')})`)

  // The weapons file the compiler writes for a weapon with rules for any phase loads too.
  const wl = emitWeaponsLua({ id: 't', weapons: { ammo: { cells: { label: 'Cells', max: 50, initial: 50, order: 1 } }, health: { max: 100, bonus_max: 200 }, pickups: {},
    weapons: { gun: { label: 'Gun', order: 1, ammo: 'cells', per: 1, initial: 'ready', any: [{ to: 'ready', when: [{ cond: 'no_ammo' }] }],
      phases: { ready: { anim: 0, transitions: [{ to: 'fire', when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 1 }] }] },
                fire: { anim: 2, ticks: 12, next: 'ready', sequence: [{ at: 0, action: 'consume', n: 1 }, { at: 0, action: 'set_cooldown', var: 'cd', ticks: 30 }],
                        ends: [{ to: 'fire', when: [{ cond: 'button_held' }, { cond: 'cooldown_ready', var: 'cd', negate: true }] }] } }, vars: { cd: 0 } } } } })
  const wf = join(dir, 'w.lua')
  writeFileSync(wf, `dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/weapon_vocab.lua")\ndofile("maps/scripts/weapons.lua")\n${wl}\nprint(weapons.load_errors())\n`)
  const wr = spawnSync(LUAJIT, [wf], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
  check(wr.status === 0 && Number((wr.stdout ?? '').trim().split('\n').pop()) === 0, `the weapon runtime loads a compiled weapon with rules for any phase, end branches, a cooldown and negate:\n${wr.stdout}${wr.stderr}`)
}

// the module-level helper hands every brain its body
{
  const t = compileMobs({ missiles: { m: { speed: 10, label: 'x' } }, mobs: { boss: boss() } }, [{ name: 'boss', speed: 5 }])
  check(t.mobs.boss.states.chase.sequence.find((x) => x.action === 'set_param').value === 5, 'compileMobs gives a brain its body\'s speed')
  check(!('label' in t.missiles.m), 'and writes missiles without the editor\'s label')
}

console.log(`brainc: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
