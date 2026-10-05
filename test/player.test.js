//
// The player: what the studio may author about one, and what it may not.
//
// HOW A PLAYER MOVES IS THE MODULE'S TO SAY: `player` lines in module.txt
// (docs/PLAYER.md), values the server builds each arriving player from. This
// holds the studio's table to the engine's names, types and defaults, and its
// lines to what the server reads.
//
// The other half is the merge. Everything a module defines is one file now
// (a map may declare eight scripts and three runtimes cost six), and the
// server harvests hooks PER CHUNK -- so two parts of that file both defining
// `on_tick` would leave one of them. That is the case with real teeth here.
//
// ORACLES: maps/scripts/*.lua under LuaJIT against the stub world;
// core/include/dnp/physics/params_table.hpp for the names and types;
// docs/PLAYER.md's tables for the defaults; dnp-server reading the lines.
//
import { readFileSync, existsSync, mkdtempSync, writeFileSync, mkdirSync } from 'node:fs'
import { spawnSync, spawn } from 'node:child_process'
import { join, dirname } from 'node:path'
import { tmpdir } from 'node:os'
import { paramNames, paramOf, PLAYER_PARAMS, paramText, playerLines, playerProblems, baseValue, newPlayer, playerFor, migratePlayer, overrides, emitPlayerSoundsLua, emitPlayerHurtLua, emitPickupSoundsLua, hasMoveSounds } from '../src/player.js'
import { emitModuleLua, emitGameLua, moduleTxt, gameScripts, newModule, emitModule, RUNTIME_SCRIPTS } from '../src/module_emit.js'
import { newDoc, addSector, addSpawn } from '../src/doc.js'
import { bake } from '../src/bake.js'
import { ROOT } from './oracle.js'

const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')
const HOOKS = JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'trigger_vocab.json'), 'utf8')).events.map((e) => e.name)

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

// --- the parameter names are the engine's ------------------------------------------------
//
// A mirror of a C header is a copy, and a copy rots. This reads the header the
// engine compiles and fails if the studio offers a name it does not have.
const header = readFileSync(join(ROOT, 'engine', 'core', 'include', 'dnp', 'physics', 'params_table.hpp'), 'utf8')
const engine = new Set([...header.matchAll(/DNP_PARAM\(\s*(\w+)/g)].map((m) => m[1]))
check(engine.size > 20, `the header names the parameters (${engine.size})`)
const offered = paramNames()
const unknown = offered.filter((n) => !engine.has(n))
check(unknown.length === 0, `every parameter the studio offers is one the engine has (${unknown.join(', ') || 'all of them'})`)
check(offered.includes('move_speed') && offered.includes('jump_impulse'), 'including the two anybody asks for first')
// Every parameter but the body's size (the size tab's, written into each map),
// each of the engine's type.
const TYPES = { Fx: 'number', Bool: 'switch', U8: 'count' }
const typed = new Map([...header.matchAll(/DNP_PARAM\(\s*(\w+),\s*ParamType::(\w+)/g)].map((m) => [m[1], TYPES[m[2]]]))
const missing = [...engine].filter((n) => n !== 'field' && n !== 'radius' && n !== 'height' && !paramOf(n))
check(missing.length === 0, `every parameter the engine has is offered (${missing.join(', ') || 'all of them'})`)
const wrongType = paramNames().filter((n) => typed.get(n) !== paramOf(n).type)
check(wrongType.length === 0, `each as the engine types it (${wrongType.map((n) => `${n} ${paramOf(n).type}, engine ${typed.get(n)}`).join('; ') || 'all agree'})`)
// The defaults are docs/PLAYER.md §3's, read out of its tables.
{
  const doc = readFileSync(join(ROOT, 'docs', 'PLAYER.md'), 'utf8')
  const def = new Map()
  for (const m of doc.matchAll(/^\| `(\w+)`(?: \/ `(\w+)`)? \| ([^|]+) \|/gm)) {
    const vals = m[3].trim().replace(/−/g, '-').split(/\s*\/\s*/)
    def.set(m[1], vals[0]); if (m[2]) def.set(m[2], vals[1] ?? vals[0])
  }
  const read = (n, t) => t === 'switch' ? t && def.get(n) === 'on' : Number(def.get(n))
  const off = paramNames().filter((n) => !def.has(n) || read(n, paramOf(n).type) !== paramOf(n).def)
  check(def.size > 30 && off.length === 0, `each default is PLAYER.md's (${off.map((n) => `${n} ${paramOf(n).def}, doc ${def.get(n)}`).join('; ') || `${def.size} read, all agree`})`)
}

// --- what it writes -----------------------------------------------------------------------
check(paramText('move_speed', 9.5) === '9.5' && paramText('jump_impulse', 11) === '11' && paramText('swing_damping', 0.003) === '0.003' &&
      paramText('attack_sweep_from', -0.125) === '-0.125' && paramText('hover_enabled', true) === 'on' && paramText('climb_enabled', false) === 'off' &&
      paramText('max_jumps', 1.4) === '1' && paramText('move_speed', 1e-7) === '0' && paramText('dash_speed', 0.1 + 0.2) === '0.3',
      'values are written in the server\'s words: exact decimals, never an exponent; on/off; whole counts')
const module = {
  id: 'p', scripts: {},
  player: { prop: 'hero', blend: null, when: {}, set: { jump_impulse: 11, move_speed: 9.5, max_jumps: 1, hover_enabled: true }, start: { weapons: ['fists', 'shotgun'] } }
}
const docsP = [{ name: 'moon', playerOverride: { set: { gravity_scale: 0.6 } } }, { name: 'plain' }]
check(playerLines(module, docsP).join('|') === 'player move_speed 9.5|player jump_impulse 11|player max_jumps 1|player hover_enabled on|player moon gravity_scale 0.6',
      `the lines: the module's in the table's order, then a map's own under its name (${playerLines(module, docsP).join(' | ')})`)
check(/^player jump_impulse 11$/m.test(moduleTxt(module, docsP)) && /^player moon gravity_scale 0.6$/m.test(moduleTxt(module, docsP)), 'module.txt carries them')
check(!/^player /m.test(moduleTxt({ id: 'x', name: 'x', player: newPlayer() }, [{ name: 'a' }])), 'CONTROL: an untouched player says nothing, so the engine\'s defaults hold')
check(baseValue({ controls: 'fps' }, 'turn_speed') === 1000 && baseValue({ controls: 'fps' }, 'move_relative') === true && baseValue({}, 'turn_speed') === 4,
      'what is unset is the engine\'s, or what first-person controls set')
check(playerProblems({ player: { set: { max_jumps: 300, hover_enabled: 'yes', nope: 1 } } }).length === 3 && playerProblems(module, docsP).length === 0,
      'a count out of range, a switch that is not one, a name the engine lacks are said; CONTROL: good values are not')
// What they hold is the GAME's: the weapons run once for the whole game, so
// the starting kit is written into the game file, not into any map.
const armed = { ...module, weapons: { ammo: {}, weapons: { fists: { phases: { ready: {} }, initial: 'ready' }, shotgun: { phases: { ready: {} }, initial: 'ready' } } } }
const game = emitGameLua(armed)
check(/weapons\.initial_weapons = \{ "fists", "shotgun" \}/.test(game ?? ''), `what the player starts holding is named, in the game file (${/initial_weapons[^\n]*/.exec(game ?? '')?.[0]})`)

// --- the module's player, and a map's override -----------------------------------------
//
// The player is set up once for the module; a map overrides exactly what it
// names and follows the module in everything else.
{
  const mod = { id: 'm', player: { ...newPlayer(), body: { radius: 0.5, height: 2 }, set: { move_speed: 12, gravity_scale: 0.5 }, start: { weapons: ['fists'] } } }
  const plain = {}
  const giant = { playerOverride: { body: { radius: 1, height: 4 }, set: { gravity_scale: 1, jump_impulse: 12 } } }
  const a = playerFor(mod, plain)
  const b = playerFor(mod, giant)
  check(a.body.height === 2 && a.set.move_speed === 12, 'a map with no override is the module\'s player')
  check(b.body.height === 4 && b.set.move_speed === 12 && b.set.jump_impulse === 12 && b.set.gravity_scale === 1, 'an override replaces what it names and inherits the rest')
  check(overrides(giant).join() === 'size,moves' && overrides(plain).length === 0, `what a map overrides is listed by name (${overrides(giant)})`)

  // Maps written when the size was each map's own.
  const docs = { one: { body: { radius: 0.5, height: 2 } }, two: { body: { radius: 0.5, height: 2 } }, big: { body: { radius: 1, height: 3 } } }
  const m2 = { id: 'x' }
  check(migratePlayer(m2, docs), 'old maps are migrated')
  check(m2.player.body.height === 2, `the module takes the size most maps had (${JSON.stringify(m2.player.body)})`)
  check(!docs.one.playerOverride && docs.big.playerOverride?.body?.height === 3, 'and the map that differed keeps its size as its own')
  check(Object.values(docs).every((d) => !('body' in d)), 'the old field is gone')
  check(Object.entries(docs).every(([n, d]) => playerFor(m2, d).body.height === (n === 'big' ? 3 : 2)), 'CONTROL: no map changed size, so none changed hash')
  check(!migratePlayer(m2, docs), 'and a second run finds nothing to do')
  check(playerFor({ id: 'y' }, { body: { radius: 0.25, height: 1 } }).body.height === 1, 'an unmigrated map still bakes at its own size')
  // A per-map starting kit from before the weapons ran game-wide is dropped:
  // the player arrives holding what they held in the last map.
  const kit = { k: { playerOverride: { weapons: ['fists'] } }, both: { playerOverride: { weapons: null, body: { radius: 1, height: 3 } } } }
  check(migratePlayer({ id: 'z', player: newPlayer() }, kit) && !kit.k.playerOverride && kit.both.playerOverride.body && !('weapons' in kit.both.playerOverride),
        `a map's own starting kit is dropped, and an override with nothing left goes with it (${JSON.stringify(kit)})`)
  // MODIFIERS, from when movement went through the effect stack, become the
  // values they came to: the engine's (or the scheme's) value × mul + add.
  const old = { id: 'o', controls: 'fps', player: { ...newPlayer(), set: undefined, moves: { move_speed: { mul: 1.5 }, jump_impulse: { add: 2 }, turn_speed: { mul: 0.5 }, max_jumps: { add: -1 }, swing_damping: { mul: 2 } } } }
  delete old.player.set
  const oldDocs = { low: { playerOverride: { moves: { gravity_scale: { mul: 0.5 }, move_speed: {} } } }, bare: { playerOverride: { moves: {} } } }
  check(migratePlayer(old, oldDocs), 'old modifiers are migrated')
  const s = old.player.set
  check(s.move_speed === 12 && s.jump_impulse === 11 && s.turn_speed === 500 && s.max_jumps === 1 && s.swing_damping === 0.006 && !('moves' in old.player),
        `each modifier becomes its value, on top of the scheme's (${JSON.stringify(s)})`)
  check(oldDocs.low.playerOverride.set.gravity_scale === 0.5 && oldDocs.low.playerOverride.set.move_speed === 8 && !oldDocs.bare.playerOverride,
        `a map's own: a modifier its value, one that modified nothing the plain value, an empty override gone (${JSON.stringify(oldDocs)})`)
  check(!migratePlayer(old, oldDocs), 'and a second run finds nothing to do')
}

// --- the server reads every line the studio writes ---------------------------------------
const SERVER = join(ROOT, 'engine', 'build', 'server', 'dnp-server')
if (!existsSync(SERVER)) console.log('player: no server build -- the server check is skipped')
else {
  const runtime = {}
  for (const n of RUNTIME_SCRIPTS) runtime[n] = readFileSync(join(ROOT, 'engine', 'maps', 'scripts', n), 'utf8')
  const rect = (x0, y0, x1, y1) => [{ x: x0, y: y0 }, { x: x1, y: y0 }, { x: x1, y: y1 }, { x: x0, y: y1 }]
  const serve = async (mod, ds, port, extraTxt = '') => {
    const real = ds.map((d) => { const doc = newDoc(d.name); addSector(doc, rect(0, 0, 16, 8), { floorTex: 'F', ceilTex: 'C' }); addSpawn(doc, 'start', 2, 2); if (d.playerOverride) doc.playerOverride = d.playerOverride; return doc })
    const r = await emitModule(mod, real, { bake, runtime })
    const dir = mkdtempSync(join(tmpdir(), 'dnp-player-srv-'))
    for (const f of r.files) { const p = join(dir, f.path); mkdirSync(dirname(p), { recursive: true }); writeFileSync(p, (typeof f.bytes === 'string' ? f.bytes : Buffer.from(f.bytes))) }
    if (extraTxt) writeFileSync(join(dir, 'module.txt'), readFileSync(join(dir, 'module.txt'), 'utf8') + extraTxt)
    const srv = spawn(SERVER, ['--port', String(port), '--module', dir], { cwd: join(ROOT, 'engine') })
    let log = ''
    srv.stderr.on('data', (d) => { log += d }); srv.stdout.on('data', (d) => { log += d })
    await new Promise((res) => setTimeout(res, 2000))
    srv.kill()
    return { ok: r.ok, txt: readFileSync(join(dir, 'module.txt'), 'utf8'), log }
  }
  // Every parameter set to a value of its type, module-wide and on one map.
  const every = {}
  for (const g of PLAYER_PARAMS) for (const p of g.params) every[p.name] = p.type === 'switch' ? !p.def : p.type === 'count' ? 3 : p.def + 0.125
  const full = { ...newModule('players', 'players'), player: { ...newPlayer(), set: every } }
  const fdocs = [{ name: 'moon', playerOverride: { set: { gravity_scale: 0.6, max_jumps: 0, flight_enabled: true } } }, { name: 'plain' }]
  const good = await serve(full, fdocs, 34717)
  const said = good.log.split('\n').filter((l) => /module\.txt: .*player/.test(l))
  check(good.ok && (good.txt.match(/^player /gm) ?? []).length === paramNames().length + 3 && said.length === 0 && /level\(s\)/.test(good.log),
        `the server reads every player line the studio writes, without a word (${(good.txt.match(/^player /gm) ?? []).length} lines; ${said.join(' | ') || 'none said'})`)
  const bad = await serve(full, fdocs, 34718, 'player max_jumps lots\n')
  check(/module\.txt: player max_jumps lots -- a count is a whole number/.test(bad.log), `CONTROL: a line it cannot read it reports, so the silence above means something (${bad.log.split('\n').filter((l) => /player max_jumps lots/.test(l)).join(' | ')})`)
}

// --- the merge must not lose a hook ---------------------------------------------------------
const twoHooks = {
  id: 'h',
  scripts: {
    'a.lua': 'COUNT_A = 0\nfunction on_tick() COUNT_A = COUNT_A + 1 end',
    'b.lua': 'COUNT_B = 0\nfunction on_tick() COUNT_B = COUNT_B + 1 end'
  }
}
const merged = emitModuleLua(twoHooks, { hooks: HOOKS })
check(/__take\(\)/.test(merged) && /__chained/.test(merged), 'two parts that define a hook are chained rather than left to clobber')
const oneHook = emitModuleLua({ id: 'o', scripts: { 'a.lua': 'function on_tick() end' } }, { hooks: HOOKS })
check(!/__chained/.test(oneHook) || /#list == 1/.test(oneHook), 'a single part needs no chain, and a chain of one is still one call')

if (!existsSync(LUAJIT)) {
  console.log('player: no luajit (scripts/setup_luajit.sh) -- runtime checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-player-'))
  const run = (body) => {
    const f = join(dir, 'run.lua')
    writeFileSync(f, body)
    const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') }
  }
  // BOTH HANDLERS RUN. Before the merge they were separate chunks and the
  // server harvested each; in one chunk the second assignment would have been
  // the only one left.
  const f = join(dir, 'mod.lua')
  writeFileSync(f, merged)
  const r = run(`dofile("${f}")\non_tick()\nprint(COUNT_A, COUNT_B)\n`)
  check(r.status === 0 && /^1\s+1/m.test(r.out), `both handlers run, as two chunks did (${r.out.trim().split('\n').pop()})`)

}

// --- the player's sounds -----------------------------------------------------------------
//
// Three runtimes play them: jump and landing the player_sounds.lua game script,
// pain and death the mob runtime, pickups the weapons runtime.
{
  const loud = { id: 'snd', name: 'snd', scripts: {}, player: { ...newPlayer(), sounds: { jump: 'hero.jump', land: 'hero.thud', fall: 15, pain: 'hero.ow', death: 'hero.down', pickup: { health: 'hero.heal' } } },
                 weapons: { ammo: {}, weapons: { fists: { phases: { ready: {} }, initial: 'ready' } } } }
  check(hasMoveSounds(loud) && !hasMoveSounds({ player: newPlayer() }), 'a jump or landing sound is what needs the game script')
  const txt = moduleTxt(loud)
  check(/^game player_sounds\.lua\ngame player_setup\.lua$/m.test(txt) && gameScripts(loud).indexOf('player_sounds.lua') > gameScripts(loud).indexOf('arsenal.lua'),
        `module.txt runs the runtime's player_sounds.lua, then the studio's settings (${gameScripts(loud).join(', ')})`)
  check(!/player_sounds/.test(moduleTxt({ id: 'q', name: 'q', player: newPlayer() })), 'CONTROL: a silent player runs no sound script')
  check(/mobs\.player_sounds = \{ pain = "hero\.ow", death = "hero\.down" \}/.test(emitModuleLua(loud) ?? ''), 'pain and death go to the mob runtime, in each level')
  check(/weapons\.pickup_sounds = \{ health = "hero\.heal" \}/.test(emitGameLua(loud) ?? ''), 'and pickups to the weapons runtime, in the arsenal')
  check(emitPlayerHurtLua({ player: newPlayer() }) === null && emitPickupSoundsLua({ player: newPlayer() }) === null && emitPlayerSoundsLua({ player: newPlayer() }) === null, 'CONTROL: nothing set, nothing written')
  if (existsSync(LUAJIT)) {
    const dir = mkdtempSync(join(tmpdir(), 'dnp-psnd-'))
    const run = (body) => { const f = join(dir, 'r.lua'); writeFileSync(f, body); const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' }); return { status: r.status, out: (r.stdout ?? '') + (r.stderr ?? '') } }
    const g = join(dir, 'setup.lua'); writeFileSync(g, emitPlayerSoundsLua(loud))
    const r1 = run(`dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/player_sounds.lua")\ndofile("${g}")\nprint(player_sounds.jump, player_sounds.land, fx.tonumber and fx.tonumber(player_sounds.fall) or player_sounds.fall)\n`)
    check(r1.status === 0 && /hero\.jump\s+hero\.thud/.test(r1.out), `the runtime's player_sounds takes the studio's settings:\n${r1.out}`)
    const h = join(dir, 'hurt.lua'); writeFileSync(h, emitPlayerHurtLua(loud))
    const r2 = run(`dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/mob_vocab.lua")\ndofile("maps/scripts/mobs.lua")\ndofile("${h}")\nprint(mobs.player_sounds.pain, mobs.player_sounds.death)\n`)
    check(r2.status === 0 && /hero\.ow\s+hero\.down/.test(r2.out), `the mob runtime has the player's pain and death:\n${r2.out.slice(-300)}`)
    const a = join(dir, 'arsenal.lua'); writeFileSync(a, emitGameLua(loud))
    const r3 = run(`dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/weapon_vocab.lua")\ndofile("maps/scripts/weapons.lua")\ndofile("${a}")\nprint(weapons.pickup_sounds.health)\n`)
    check(r3.status === 0 && /hero\.heal/.test(r3.out), `and the weapons runtime the pickup sound:\n${r3.out.slice(-300)}`)
  }
}

console.log(`player: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
