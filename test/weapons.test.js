//
// The arsenal the studio writes is the arsenal the weapon runtime loads.
//
// A weapon is a phase machine (maps/scripts/weapon_vocab.lua): automatic fire,
// a charge, a combo and an alt-fire are arrangements of the graph rather than
// flags, which is why the studio can edit it with the same graph it edits a
// monster's brain with. What has to be proven is that the table it emits is one
// the real loader accepts, and that the studio names the same faults the
// loader does -- a studio that passes a table the runtime refuses is a studio
// that lets you ship a weapon nobody can fire.
//
// ORACLE: maps/scripts/weapons.lua itself, under LuaJIT, against the stub world
// tools/mobcheck/stub.lua -- never a second opinion about what it accepts.
//
import { writeFileSync, existsSync, mkdtempSync } from 'node:fs'
import { spawnSync } from 'node:child_process'
import { join } from 'node:path'
import { tmpdir } from 'node:os'
import { readFileSync } from 'node:fs'
import { emitWeaponsLua, newArsenal, newWeapon, deleteWeapon, hasWeapons } from '../src/weapons_emit.js'
import { emitMobsLua } from '../src/mobs_emit.js'
import { emitModuleLua, scriptDecls, MODULE_FILE, moduleTxt, emitGameLua, GAME_FILE } from '../src/module_emit.js'
import { CAP } from '../src/doc.js'
import { newDoc, addSector, addSpawn, validate } from '../src/doc.js'
import { emitProps, vfxLine } from '../src/props_emit.js'
import { Vocab } from '../src/vocab.js'
import { ROOT } from './oracle.js'
import { parseVfx } from '../../engine/client/src/render/vfx.js'
import { parseProps } from '../../engine/client/src/render/props.js'

const LUAJIT = join(ROOT, 'engine', 'third_party', 'luajit', 'src', 'luajit')

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const vocab = new Vocab(
  JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'trigger_vocab.json'), 'utf8')),
  JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'mob_vocab.json'), 'utf8')),
  JSON.parse(readFileSync(join(ROOT, 'engine', 'maps', 'scripts', 'weapon_vocab.json'), 'utf8')))

// A shotgun with a reload, a fist that swings, and a pistol that fires on the
// press -- three shapes of the same graph, which is the point of the graph.
const module = {
  id: 'arms', propIdBase: 1000, props: [], mobs: { missiles: {}, mobs: {} },
  weapons: {
    ammo: { shells: { label: 'Shells', max: 50, initial: 8, order: 1 } },
    health: { max: 100, bonus_max: 200 },
    weapons: {
      fists: {
        label: 'Fists',
        order: 1,
        swing: { damage: 10, reach: '1.333', half_arc: [1, 8], sweep_from: [-1, 8], sweep_to: [1, 8], ticks: 16, cooldown: 20 },
        initial: 'ready',
        phases: {
          ready: { anim: 0, transitions: [{ when: [{ cond: 'button_pressed' }], to: 'jab' }] },
          jab: { anim: 2, ticks: 10, next: 'ready', swing: { damage: 14, reach: '1.5', ticks: 8, knockback: '1.25' } }
        }
      },
      shotgun: {
        label: 'Shotgun',
        order: 3,
        ammo: 'shells',
        per: 1,
        initial: 'ready',
        vars: { fired: 0 },
        phases: {
          ready: { anim: 0, transitions: [{ when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 1 }], to: 'fire' }] },
          fire: {
            anim: 2,
            ticks: 8,
            next: 'reload',
            sequence: [{ at: 0, action: 'consume', n: 1 },
                       { at: 0, action: 'hitscan', damage: 5, range: '40', count: 7, spread: 5, tracer: 1, hit_vfx: 10 },
                       { at: 0, action: 'add_var', var: 'fired', value: 1 }]
          },
          reload: { anim: 3, ticks: 40, next: 'ready', sequence: [{ at: 20, action: 'switch_if_empty' }] }
        }
      }
    },
    pickups: { shotgun_pickup: { weapon: 'shotgun', ammo: { shells: 8 } } }
  }
}

check(hasWeapons(module), 'a module with weapons says so')
check(!hasWeapons({ id: 'x' }), 'CONTROL: and one without does not')
check(emitWeaponsLua({ id: 'x' }) === null, 'a module that arms nobody writes no file')
check(MODULE_FILE === 'module.lua', 'the module writes one file, and not one named after a runtime')

const lua = emitWeaponsLua(module)
check(/^-- >>> level editor: weapons\n/.test(lua) && /-- <<< level editor: weapons\n$/.test(lua), 'the weapons block is marked')
check(/weapons\.load\{/.test(lua) && /shotgun = \{/.test(lua), 'weapons.load{} carries the arsenal')

// --- the studio's own rules ----------------------------------------------------------
check(vocab.validateWeapons(module).length === 0, `the arsenal validates (${vocab.validateWeapons(module).join(' | ')})`)
const noPhase = structuredClone(module)
noPhase.weapons.weapons.shotgun.phases.ready.transitions[0].to = 'nowhere'
check(vocab.validateWeapons(noPhase).some((p) => /`to` must name a phase/.test(p)), 'CONTROL: a transition to nowhere is named')
const badAmmo = structuredClone(module)
badAmmo.weapons.weapons.shotgun.ammo = 'plasma'
check(vocab.validateWeapons(badAmmo).some((p) => /`ammo` should be the name of an ammunition pool/.test(p)), 'CONTROL: eating a pool that was never declared is named')
const noDamage = structuredClone(module)
delete noDamage.weapons.weapons.fists.swing.damage
check(vocab.validateWeapons(noDamage).some((p) => /needs `damage`/.test(p)), 'CONTROL: a swing with no damage is named')
const badAction = structuredClone(module)
badAction.weapons.weapons.shotgun.phases.fire.sequence[1].action = 'hug'
check(vocab.validateWeapons(badAction).some((p) => /unknown action "hug"/.test(p)), 'CONTROL: an action the vocabulary lacks is named')
const badInitial = structuredClone(module)
badInitial.weapons.weapons.fists.initial = 'elsewhere'
check(vocab.validateWeapons(badInitial).some((p) => /`initial` names no phase/.test(p)), 'CONTROL: resting in a phase that does not exist is named')
const negated = structuredClone(module)
negated.weapons.weapons.shotgun.phases.ready.transitions[0].when[0].negate = true
check(vocab.validateWeapons(negated).some((p) => /unknown field `negate`/.test(p)), 'CONTROL: `negate` on a weapon condition is named (only a monster\'s takes it)')
const emptyWhen = structuredClone(module)
emptyWhen.weapons.weapons.shotgun.phases.ready.transitions[0].when = []
check(vocab.validateWeapons(emptyWhen).some((p) => /`when` is an empty list/.test(p)), 'CONTROL: a transition with no conditions is named')
const healed = structuredClone(module)
healed.weapons.pickups = { medkit: { heal: 25, ceiling: 'max' } }
check(vocab.validateWeapons(healed).length === 0, `a new pickup's defaults are valid (${vocab.validateWeapons(healed).join(' | ')})`)

// --- the real loader ------------------------------------------------------------------
if (!existsSync(LUAJIT)) {
  console.log('weapons: no luajit (scripts/setup_luajit.sh) -- runtime checks skipped')
} else {
  const dir = mkdtempSync(join(tmpdir(), 'dnp-arms-'))
  const run = (text, name) => {
    const f = join(dir, name)
    writeFileSync(f, `dofile("tools/mobcheck/stub.lua")\ndofile("maps/scripts/weapon_vocab.lua")\ndofile("maps/scripts/weapons.lua")\n${text}\nprint(weapons.load_errors())\n`)
    const r = spawnSync(LUAJIT, [f], { cwd: join(ROOT, 'engine'), encoding: 'utf8' })
    return { status: r.status, errors: Number((r.stdout ?? '').trim().split('\n').pop()), out: r.stdout + r.stderr }
  }
  const good = run(lua, 'good.lua')
  check(good.status === 0 && good.errors === 0, `the weapon runtime loads the studio's arsenal with no complaints:\n${good.out}`)
  // The game file as module.txt runs it: after the two runtime copies, in
  // the game VM, with the starting kit set.
  const kitted = { ...module, player: { start: { weapons: ['fists'] } } }
  const asGame = run(emitGameLua(kitted) + '\nprint(weapons.initial_weapons[1])', 'game.lua')
  check(asGame.status === 0 && /^fists$/m.test(asGame.out) && asGame.errors === 0, `the game file loads after the runtime and sets the starting kit:\n${asGame.out}`)
  // CONTROL: the runtime refuses what the studio refuses. Without this the
  // checks above are satisfied by a validator agreeing with itself.
  const bad = run(emitWeaponsLua(noPhase), 'bad.lua')
  check(bad.errors > 0, `CONTROL: the runtime also refuses the transition to nowhere (${bad.errors} complaint(s))`)
  const bad2 = run(emitWeaponsLua(badAmmo), 'bad2.lua')
  check(bad2.errors > 0, `CONTROL: and the undeclared ammunition pool (${bad2.errors})`)
  check(run(emitWeaponsLua(negated), 'bad3.lua').errors > 0, 'CONTROL: and `negate` on a weapon condition')
  check(run(emitWeaponsLua(emptyWhen), 'bad4.lua').errors > 0, 'CONTROL: and a transition with no conditions')
  const heal = run(emitWeaponsLua(healed), 'heal.lua')
  check(heal.errors === 0, `the runtime takes a new pickup's defaults:\n${heal.out}`)
}

// --- making and unmaking one ------------------------------------------------------------
const m2 = { id: 'm2', props: [], weapons: newArsenal() }
const made = newWeapon(m2, 'Plasma Rifle!')
check(made === 'plasmarifle', `a new weapon gets a clean name (${made})`)
check(newWeapon(m2, 'plasmarifle') === null, 'CONTROL: a taken name is refused')
check(vocab.validateWeapons(m2).length === 0, `and it is valid the moment it is made (${vocab.validateWeapons(m2).join(' | ')})`)
m2.weapons.pickups.p1 = { weapon: 'plasmarifle' }
deleteWeapon(m2, 'plasmarifle')
check(!m2.weapons.weapons.plasmarifle && !m2.weapons.pickups.p1, 'deleting a weapon takes its pickup with it')

// --- particles and the player's art, through the client's own parsers ---------------------
const vmodule = {
  id: 'v', propIdBase: 1000,
  props: [{ id: 1000, name: 'player', radius: 0.35, height: 1.2, solid: true, art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle', 1: 'walk' } } }],
  player: { prop: 'player', blend: 0.1, when: { climb: 7, run: 1 } },
  vfx: [
    { id: 10, type: 'particles', count: 12, life: 0.5, lifeVar: 0.25, speed: 5, cone: 0.2, gravity: 26, size: 0.07, sizeEnd: 0.07, colour: 0xff2018, colourEnd: 0x400604 },
    { id: 15, type: 'particles', attach: 1, rate: 90, linger: 0.18, life: 0.3, colour: 0xffdd66, colourEnd: 0x662200 },
    { id: 13, type: 'particles', count: 14, life: 1.8, colour: 0x666666, colourEnd: 0x222222, blend: 'alpha' },
    { id: 1, type: 'tracer', colour: 0xffee88, width: 0.09, life: 0.35 }
  ]
}
const text = emitProps(vmodule)
const { kinds, warnings } = parseVfx(text)
check(warnings.length === 0, `the client's parser accepts every vfx line (${warnings.join(' | ')})`)
check(kinds.get(10)?.count === 12 && kinds.get(10)?.colour === 0xff2018 && kinds.get(10)?.colourEnd === 0x400604,
      `a burst round-trips through the catalogue (${JSON.stringify({ count: kinds.get(10)?.count, colour: kinds.get(10)?.colour?.toString(16) })})`)
check(kinds.get(15)?.attach === 1 && kinds.get(15)?.rate === 90 && kinds.get(15)?.linger === 0.18, 'an attached emitter keeps its rate and linger')
check(!/^vfx 15 .*\bcount\b/m.test(text), 'CONTROL: and writes no count, which it does not use')
check(!/^vfx 10 .*\brate\b/m.test(text), 'CONTROL: a one-shot burst writes no rate')
check(kinds.get(13)?.blend === 'alpha', 'smoke keeps its blend')
check(kinds.get(1)?.type === 'tracer' && kinds.get(1)?.width === 0.09, 'a tracer is written too')
check(/^vfx 1 /m.test(text.split('\n')[3] ?? '') || text.indexOf('vfx 1 ') < text.indexOf('vfx 10 '), 'the kinds are written in id order')

const parsed = parseProps(text)
const avatar = parsed.avatar ?? parsed.kinds?.get(1000)
check(/^avatar 1000 blend 0\.1$/m.test(text), `the player's art is addressed by an avatar line (${/avatar.*/.exec(text)?.[0]})`)
check(/^avatar 1000 when climb state 7$/m.test(text), 'and a condition points at the state that draws it')
check((parsed.warnings ?? []).length === 0, `the client's prop parser is content (${(parsed.warnings ?? []).join(' | ')})`)
check(avatar !== undefined, 'and it reads the record back')

// --- a monster and a weapon belong to the MODULE, not to a map ----------------------------
//
// Both runtimes load once per level from one file the module owns, so a
// definition kept on a map would exist in that level and silently nowhere
// else. The studio has always kept them apart; this is what makes staying
// that way a rule rather than a habit.
{
  const doc = newDoc('first')
  addSector(doc, [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }])
  addSpawn(doc, 'start', 1, 1)
  check(validate(doc).length === 0, `a plain map validates (${validate(doc).map((p) => p.msg).join(' | ')})`)
  for (const key of ['mobs', 'weapons', 'props', 'vfx', 'player']) {
    const bad = { ...doc, [key]: key === 'vfx' ? [] : {} }
    check(validate(bad).some((p) => new RegExp(`carries \\\`${key}\\\``).test(p.msg)),
          `CONTROL: a map carrying \`${key}\` is refused, because that belongs to the module`)
  }
  // And the module's own definitions are what every map of it declares: one
  // monsters.lua and one arms.lua however many maps there are.
  const second = newDoc('second')
  addSector(second, [{ x: 0, y: 0 }, { x: 8, y: 0 }, { x: 8, y: 8 }, { x: 0, y: 8 }])
  addSpawn(second, 'start', 1, 1)
  const shared = { ...module, props: [], scripts: { 'hooks.lua': 'local n = 1\nfunction on_attack(a, t) end' },
                   mobs: { missiles: {}, mobs: { imp: { hp: 10, initial: 'look', states: { look: { anim: 0 } } } } } }
  const one = emitModuleLua(shared)
  check(/imp = \{/.test(one) && /function on_attack/.test(one) && !/weapons\.load/.test(one),
        'the module file carries the monsters and the module\'s own scripts, and not the arsenal')
  check(/do\nlocal n = 1/.test(one), "and each script keeps its own scope, which being a separate chunk is what bought it")

  // THE WEAPONS ARE THE GAME'S. Run per level, every level had its own
  // inventory and handed the player a fresh pistol; module.txt names them as
  // game scripts instead, and the files are in the module's own maps/.
  const txt = moduleTxt(shared)
  check(/^game weapon_vocab\.lua\ngame weapons\.lua\ngame arsenal\.lua$/m.test(txt), `module.txt runs the arsenal once, for the game (${txt.split('\n').filter((l) => /^game/.test(l)).join(' | ')})`)
  check(/weapons\.load\{/.test(emitGameLua(shared)) && GAME_FILE === 'arsenal.lua', 'the game file carries the arsenal')
  check(!/^game/m.test(moduleTxt({ id: 'u', name: 'u' })), 'CONTROL: a module that arms nobody runs no game script')

  // And the levels: no weapon runtime, but the MOB runtime, because the game's
  // weapons shoot through the level the player is in.
  const decls = scriptDecls(shared, { hasMobs: true, hasTriggers: true, hasWeapons: true })
  check(!decls.some((d) => /weapon/.test(d)), `a level declares no weapon runtime (${decls.map((d) => d.split('/').pop()).join(', ')})`)
  check(decls.length + 1 === 6, `so monsters, triggers and weapons leave two of a map's ${CAP.scripts} slots free (${decls.length + 1} used)`)
  const unarmedMobs = scriptDecls({ id: 'w', scripts: {} }, { hasMobs: false, hasTriggers: false, hasWeapons: true })
  check(unarmedMobs.some((d) => d.endsWith('/mobs.lua')), 'a module with weapons and no monsters still gives each level the mob runtime the weapons shoot through')
  check(decls.filter((d) => !d.includes('/')).join() === MODULE_FILE,
        `and only one of them is the module's own (${decls.filter((d) => !d.includes('/')).join() || 'none'})`)
  const bare = scriptDecls({ id: 'b' }, { hasMobs: false, hasTriggers: true, hasWeapons: false })
  check(bare.length === 2, `CONTROL: a module that defines nothing declares only the trigger runtime (${bare.length})`)
}

console.log(`weapons: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
