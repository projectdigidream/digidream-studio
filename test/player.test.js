//
// The player: what the studio may author about one, and what it may not.
//
// THE ENGINE OWNS A PLAYER'S BODY. `set_body_param` refuses a player outright
// -- "a player's body comes from the catalogue and their session" -- so the
// studio cannot write a speed. What it can do is modify it through the EFFECT
// STACK, which is what the generated block does, and this is where that is
// held to the runtime's own words.
//
// The other half is the merge. Everything a module defines is one file now
// (a map may declare eight scripts and three runtimes cost six), and the
// server harvests hooks PER CHUNK -- so two parts of that file both defining
// `on_tick` would leave one of them. That is the case with real teeth here.
//
// ORACLES: maps/scripts/*.lua under LuaJIT against the stub world, and
// core/include/dnp/physics/params_table.hpp for the parameter names.
//
import { readFileSync, existsSync, mkdtempSync, writeFileSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { emitPlayerLua, paramNames, newPlayer, playerFor, migratePlayer, overrides, emitPlayerSoundsLua, emitPlayerHurtLua, emitPickupSoundsLua, hasMoveSounds } from '../src/player.js'
import { emitModuleLua, emitGameLua, moduleTxt, gameScripts } from '../src/module_emit.js'
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

// --- what it writes -----------------------------------------------------------------------
const module = {
  id: 'p', scripts: {},
  player: { prop: 'hero', blend: null, when: {}, moves: { move_speed: { mul: 1.5 }, jump_impulse: { add: 2 } }, start: { weapons: ['fists', 'shotgun'] } }
}
const lua = emitPlayerLua(module)
// What they hold is the GAME's: the weapons run once for the whole game, so
// the starting kit is written into the game file, not into any map.
const armed = { ...module, weapons: { ammo: {}, weapons: { fists: { phases: { ready: {} }, initial: 'ready' }, shotgun: { phases: { ready: {} }, initial: 'ready' } } } }
const game = emitGameLua(armed)
check(/weapons\.initial_weapons = \{ "fists", "shotgun" \}/.test(game ?? ''), `what the player starts holding is named, in the game file (${/initial_weapons[^\n]*/.exec(game ?? '')?.[0]})`)
check(!/initial_weapons/.test(lua), 'and not in a map, where a level would hand them a fresh kit on arrival')
check(/add_effect\("move_speed", "mul", fx\.parse\("1\.5"\), nil, "studio_player"\)/.test(lua) ||
      /add_effect\("move_speed", "mul", /.test(lua), 'a modifier goes through the effect stack, tagged so a second arrival replaces it')
check(/e:add_effect\("jump_impulse", "add", fx\.int\(2\)/.test(lua), 'and an addition is written as the whole number it is')
check(emitPlayerLua({ id: 'x' }) === null, 'CONTROL: a module that says nothing about the player writes nothing')
check(emitPlayerLua({ id: 'x', player: newPlayer() }) === null, 'CONTROL: nor does an untouched one')

// --- the module's player, and a map's override -----------------------------------------
//
// The player is set up once for the module; a map overrides exactly what it
// names and follows the module in everything else.
{
  const mod = { id: 'm', player: { ...newPlayer(), body: { radius: 0.5, height: 2 }, moves: { move_speed: { mul: 1.5 }, gravity_scale: { mul: 0.5 } }, start: { weapons: ['fists'] } } }
  const plain = {}
  const giant = { playerOverride: { body: { radius: 1, height: 4 }, moves: { gravity_scale: {}, jump_impulse: { add: 3 } } } }
  const a = playerFor(mod, plain)
  const b = playerFor(mod, giant)
  check(a.body.height === 2 && a.moves.move_speed.mul === 1.5, 'a map with no override is the module\'s player')
  check(b.body.height === 4 && b.moves.move_speed.mul === 1.5 && b.moves.jump_impulse.add === 3, 'an override replaces what it names and inherits the rest')
  check(!('gravity_scale' in b.moves), 'an override that modifies nothing turns the module\'s modifier off on that map')
  check(overrides(giant).join() === 'size,moves' && overrides(plain).length === 0, `what a map overrides is listed by name (${overrides(giant)})`)
  const lua = emitPlayerLua(mod, giant)
  check(/jump_impulse/.test(lua) && !/gravity_scale/.test(lua), 'a map\'s Lua carries its resolved player, not the module\'s plus a correction')
  check(/gravity_scale/.test(emitPlayerLua(mod, plain)), 'CONTROL: the plain map still carries the module\'s modifier')

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

  // And the player's own block loads against the real runtimes, in a map's
  // chunk -- after the map's own Lua, whose on_tick it must keep.
  const g = join(dir, 'player.lua')
  writeFileSync(g, 'MAP_TICKS = 0\nfunction on_tick() MAP_TICKS = MAP_TICKS + 1 end\n' + emitPlayerLua(module, {}))
  const r2 = run(`dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/weapon_vocab.lua")\ndofile("maps/scripts/weapons.lua")\ndofile("${g}")\non_tick()\nprint("ok", type(on_tick), MAP_TICKS)\n`)
  check(r2.status === 0 && /ok\s+function\s+1/.test(r2.out), `the player's block loads, and the map's own on_tick still runs:\n${r2.out}`)
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
