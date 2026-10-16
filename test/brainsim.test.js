// The preview's simulation (src/brainsim.js) against the engine's own runtime.
//
// ORACLE: maps/scripts/mobs.lua under LuaJIT in tools/mobcheck/world.lua. The
// same compiled brain and the same script -- a target held 1.5 m off (walking
// is not what is compared: the fake world's steering is its own), hits at fixed
// ticks -- are run in both, and the path through the states must be the same.
// (`chance` is a roll in the preview, as in the engine; these brains use none.)
// Controls: a brain that differs (no "only once", pain not resuming) gives a
// different path in both, so a match is not two runs agreeing on nothing.
//
// Run: node studio/test/brainsim.test.js
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { compileMob, compileWeapon } from '../src/brainc.js'
import { emitMobsLua } from '../src/mobs_emit.js'
import { BrainSim } from '../src/brainsim.js'

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..', '..')
const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')

let checks = 0
let fails = 0
const check = (ok, what) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${what}`) } }

const boss = () => ({
  hp: 100, pain_chance: 255, initial: 'idle', sight: '40', turn_speed: 12,
  vars: { phase: 0, roars: 0 },
  phases: [{ id: 'p1', name: 'Phase 1' }, { id: 'p2', name: 'Phase 2', speed: 6 }],
  any: [{ to: 'roar', when: [{ cond: 'hp_below', percent: 60 }], once: true }],
  states: {
    idle: { anim: 0, move: 'stop', face: 'target', phase: 'p1', transitions: [{ to: 'chase', when: [{ cond: 'has_target' }] }] },
    chase: { anim: 1, move: 'chase', face: 'target', phase: 'p1', transitions: [{ to: 'slam', when: [{ cond: 'target_within', distance: '2' }, { cond: 'cooldown_ready', var: 'slam_cd' }] }] },
    slam: { anim: 2, move: 'stop', face: 'target', phase: 'p1', ticks: 40, next: 'chase', sequence: [{ at: 20, action: 'set_cooldown', var: 'slam_cd', ticks: 120 }] },
    roar: { anim: 0, move: 'stop', face: 'target', phase: 'p2', ticks: 30, next: 'chase2',
            sequence: [{ at: 10, action: 'add_var', var: 'roars', by: 1 }],
            ends: [{ to: 'frenzy', when: [{ cond: 'var_at_least', var: 'phase', value: 3 }] }] },
    chase2: { anim: 1, move: 'chase', face: 'target', phase: 'p2' },
    frenzy: { anim: 1, move: 'chase', face: 'target', phase: 'p2' },
    pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: '@previous' },
    death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
  }
})
boss.vars = (b) => { b.vars.slam_cd = 0; return b }

// A script: [ [tick, 'hurt', amount] ... ], run for `until` ticks.
const SCRIPTS = {
  twoHits: { hits: [[40, 45], [200, 10]], until: 320 },
  hitInP2: { hits: [[40, 45], [200, 5]], until: 300 },
  roarOnly: { hits: [[40, 45]], until: 160 }
}

function simPath (brain, sc) {
  const c = compileMob(brain, { speed: 4 })
  const s = new BrainSim(c, { kind: 'mob', speed: 4 })
  s.dist = 1.5
  const path = [s.state]
  for (let t = 1; t <= sc.until; t++) {
    const was = s.state
    s.step()
    s.dist = 1.5
    for (const [at, n] of sc.hits) if (at === t) s.hurt(n, { force: true })
    if (s.state !== was) path.push(s.state)
    else if (path.at(-1) !== s.state) path.push(s.state)
  }
  return { path: dedupe(path), roars: s.vars.roars }
}
const dedupe = (p) => p.filter((x, i) => i === 0 || x !== p[i - 1])

function enginePath (brain, sc, dir, name) {
  const lua = emitMobsLua({ id: 't', mobs: { missiles: {}, mobs: { boss: brain } }, props: [{ name: 'boss', speed: 4 }] })
  const hits = sc.hits.map(([at, n]) => `if W.tick_n == ${at} then W.rolls = { 0 }; mobs.hurt(z, ${n}, nil) end`).join('\n    ')
  const f = join(dir, name)
  writeFileSync(f, `local W = dofile("tools/mobcheck/world.lua")
dofile("maps/scripts/mob_vocab.lua")
dofile("maps/scripts/mobs.lua")
${lua}
W.reset(); mobs.reset()
local z = mobs.spawn("boss", { x = W.mkfx(0), y = W.mkfx(0), z = W.mkfx(0) })
local p = W.add("player", 1.5, 0, 0)
W.see = true
local path = { mobs.live[z:index()].state }
for _ = 1, ${sc.until} do
  W.tick_n = W.tick_n + 1; W.advance(); on_tick()
  p.p.x = z.p.x + W.mkfx(1.5); p.p.y = z.p.y
  ${hits}
  local s = mobs.live[z:index()].state
  if s ~= path[#path] then path[#path + 1] = s end
end
print("PATH " .. table.concat(path, ","))
print("ROARS " .. tostring(mobs.live[z:index()].vars.roars or 0))
`)
  const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
  const out = (r.stdout ?? '') + (r.stderr ?? '')
  return { path: (/PATH (.*)/.exec(out)?.[1] ?? '').split(','), roars: Number(/ROARS (\d+)/.exec(out)?.[1] ?? -1), out }
}

// ---- the simulation on its own -------------------------------------------------------
{
  const a = simPath(boss.vars(boss()), SCRIPTS.twoHits)
  check(a.path.filter((x) => x === 'roar').length === 1 && a.roars === 1, `the preview: two hits, one roar (${a.path.join(' → ')})`)
  const b = simPath(boss.vars(boss()), SCRIPTS.hitInP2)
  const after = b.path.slice(b.path.lastIndexOf('pain') + 1)
  check(after[0] === 'chase2', `the preview: a hit in phase 2 resumes chase2 (${b.path.join(' → ')})`)
  // a weapon: a press during the draw is lost (pressed is an edge); a held charge fires once
  const w = compileWeapon({ label: 'G', order: 1, initial: 'draw', phases: {
    draw: { anim: 0, ticks: 18, next: 'ready' },
    ready: { anim: 0, transitions: [{ to: 'charge', when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 5 }] }] },
    charge: { anim: 1, transitions: [{ to: 'release', when: [{ cond: 'held_for', ticks: 60 }] }, { to: 'ready', when: [{ cond: 'button_released' }] }] },
    release: { anim: 2, ticks: 40, next: 'ready', sequence: [{ at: 0, action: 'consume', n: 5 }] } } })
  const g = new BrainSim(w, { kind: 'weapon', ammo: 50 })
  g.press(); g.run(30)
  check(g.state === 'ready', `a press during the draw is lost, as the engine's button_pressed is an edge (${g.state})`)
  g.release(); g.press(); const p = g.run(200)
  check(p.filter((x) => x === 'release').length === 1 && g.ammo === 45, `a held charge releases once, using 5 ammo (${p.join(' → ')}, ammo ${g.ammo})`)
  g.release(); g.run(2); g.press(); g.run(10); g.release(); g.run(5)
  check(g.state === 'ready' && g.ammo === 45, 'letting go early goes back to ready and costs nothing')
}

// ---- against the engine ---------------------------------------------------------------
if (!existsSync(LUAJIT)) {
  console.log('brainsim: no luajit (engine/scripts/setup_luajit.sh) -- parity checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-brainsim-'))
  const variants = {
    boss: () => boss.vars(boss()),
    'no once': () => { const b = boss.vars(boss()); delete b.any[0].once; return b },
    'pain to chase': () => { const b = boss.vars(boss()); b.states.pain.next = 'chase'; return b },
    'phase 3': () => { const b = boss.vars(boss()); b.vars.phase = 3; return b }
  }
  const seen = new Set()
  for (const [vname, mk] of Object.entries(variants)) {
    for (const [sname, sc] of Object.entries(SCRIPTS)) {
      const e = enginePath(mk(), sc, dir, `${vname.replace(/ /g, '_')}_${sname}.lua`)
      const s = simPath(mk(), sc)
      check(e.path.length > 1, `the engine ran ${vname} / ${sname}:\n${e.out}`)
      check(e.path.join(',') === s.path.join(','), `${vname} / ${sname}: the preview takes the engine's path\n    engine:  ${e.path.join(' → ')}\n    preview: ${s.path.join(' → ')}`)
      check(e.roars === s.roars, `${vname} / ${sname}: and its steps ran as often (${e.roars} / ${s.roars})`)
      seen.add(e.path.join(",")); if (vname === "boss" && sname === "twoHits") console.log("  e.g. " + e.path.join(" → "))
    }
  }
  check(seen.size >= 5, `CONTROL: the variants take different paths (${seen.size} distinct), so agreeing is not agreeing on nothing`)

  // ITS OWN SUMMONS are the crowd the preview has: "no more than 2 spirits
  // within 6 m" stops it calling more, as in the engine, where the spirits
  // stand where they landed. Controls: summoned 3 m off, a 1 m count never
  // sees them and the calling goes on (in both); a spawn's limit stops it too.
  const caller = (cond, spawn = {}) => ({
    hp: 100, initial: 'idle', sight: '40', turn_speed: 12,
    states: {
      idle: { anim: 0, move: 'stop', face: 'hold', transitions: [{ to: 'call', when: cond ? [cond] : [] }] },
      call: { anim: 2, move: 'stop', face: 'hold', ticks: 16, next: 'idle', sequence: [{ at: 0, action: 'spawn', mob: 'spirit', count: 2, ...spawn }] },
      pain: { anim: 3, move: 'stop', face: 'hold', ticks: 10, next: '@previous' },
      death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' }
    }
  })
  const spirit = { hp: 10, initial: 'idle', states: { idle: { anim: 0, move: 'stop', face: 'hold' }, death: { anim: 4, move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' } } }
  const fewer = (distance) => ({ cond: 'count_within', at_least: 3, mob: 'spirit', distance, negate: true })
  const UNTIL = 200
  const engineKids = (brain, name) => {
    const lua = emitMobsLua({ id: 't', mobs: { missiles: {}, mobs: { caller: brain, spirit } }, props: [{ name: 'caller', speed: 4 }, { name: 'spirit', speed: 4 }] })
    const f = join(dir, name)
    writeFileSync(f, `local W = dofile("tools/mobcheck/world.lua")
dofile("maps/scripts/mob_vocab.lua")
dofile("maps/scripts/mobs.lua")
${lua}
W.reset(); mobs.reset()
local z = mobs.spawn("caller", { x = W.mkfx(0), y = W.mkfx(0), z = W.mkfx(0) })
W.add("player", 9, 0, 0)
W.see = true
for _ = 1, ${UNTIL} do W.tick_n = W.tick_n + 1; W.advance(); on_tick() end
local n = 0
for _, o in pairs(mobs.live) do if o.def.name == "spirit" and o.e:valid() then n = n + 1 end end
print("KIDS " .. n)
`)
    const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    const out = (r.stdout ?? '') + (r.stderr ?? '')
    return { n: Number(/KIDS (\d+)/.exec(out)?.[1] ?? -1), out }
  }
  const simKids = (brain) => {
    const sim = new BrainSim(compileMob(brain, { speed: 4 }), { kind: 'mob', speed: 4 })
    for (let t = 0; t < UNTIL; t++) sim.step()
    return sim.brood.length
  }
  const cases = {
    'no more than 2 within 6 m': caller(fewer('6')),
    'CONTROL summoned 3 m off, counted within 1 m': caller(fewer('1'), { offset: '3' }),
    'a limit of 3, no rule': caller({ cond: 'state_elapsed', ticks: 8 }, { limit: 3 })
  }
  const kids = {}
  for (const [cname, brain] of Object.entries(cases)) {
    const e = engineKids(brain, `kids_${Object.keys(kids).length}.lua`)
    const p = simKids(brain)
    kids[cname] = p
    check(e.n >= 0, `the engine ran "${cname}":\n${e.out}`)
    check(e.n === p, `${cname}: the preview summons as many as the engine (${e.n} / ${p})`)
  }
  check(kids['no more than 2 within 6 m'] === 4 && kids['a limit of 3, no rule'] === 4, `"no more than 2" and a limit of 3 each stop it at 4, two calls of 2 (${JSON.stringify(kids)})`)
  check(kids['CONTROL summoned 3 m off, counted within 1 m'] > 8, `CONTROL: summons it cannot count do not stop it (${kids['CONTROL summoned 3 m off, counted within 1 m']})`)
}

console.log(`brainsim: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
