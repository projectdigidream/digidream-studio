// THE PLAYER'S MOVEMENT (src/movement.js, docs/MOVEMENT.md): the lines the
// studio writes for states, ways, meters and moves are read by the engine's
// own parser -- the core's, the server's -- every recipe alone and all of
// them together; a line it refuses names the card that wrote it; renaming a
// state, a meter or a move follows it into every line; and a state's
// animation reaches the avatar as the client reads it.
//
//   node studio/test/movement.test.js
//
// ORACLE: the core wasm's WasmWorld.setMoveDefs (core movedefs.cpp).

import { movementLines, checkMovement, addRecipe, renameThing, RECIPES, movementOf, movementAnims } from '../src/movement.js'
import { moduleTxt } from '../src/module_emit.js'
import { emitProps } from '../src/props_emit.js'
import { parseProps } from '../../engine/client/src/render/props.js'
import { requireOracles, core } from './oracle.js'

requireOracles('movement', { mapc: false })
let checks = 0
let fails = 0
const check = (ok, label) => { checks++; if (!ok) { fails++; console.log(`  FAIL ${label}`) } else console.log(`  ok   ${label}`) }

const world = (await core()).createWorld()
const blank = () => ({ id: 't', propIdBase: 1000, props: [] })

// --- every recipe, alone and together --------------------------------------------------
for (const id of Object.keys(RECIPES)) {
  const m = blank(); addRecipe(m, id)
  const v = checkMovement(world, m)
  check(v === null, `the ${id} recipe is read by the engine (${v ? `${v.why} -- ${v.line}` : movementLines(m).lines.length + ' lines'})`)
}
const all = blank()
for (const id of Object.keys(RECIPES)) addRecipe(all, id)
const together = checkMovement(world, all)
check(together === null, `all of them together too (${together ? `${together.why} -- ${together.line}` : movementLines(all).lines.length + ' lines'})`)
check(movementOf(all).meters.filter((t) => t.name === 'stamina').length === 1, 'two recipes with a stamina meter make one')
addRecipe(all, 'slide')
check(movementOf(all).transitions.length === movementLines(all).lines.filter((l) => l.startsWith('transition')).length && checkMovement(world, all) === null, 'adding a recipe twice adds nothing twice')

// --- in module.txt -----------------------------------------------------------------------
const txt = moduleTxt({ ...all, name: 't' }, [])
check(/^movestate swim group liquid speed 5 accel 20 friction 3 gravity 0\.3 buoyancy 8 jump 7 anim swim flags no_dash$/m.test(txt), 'module.txt has the swim state as docs/MOVEMENT.md writes it')
check(/^transition swim -> wade when pressed jump depth below eyes do jump$/m.test(txt) && /^meter air in swim rate -2 when depth eyes$/m.test(txt) && /^move dash set facing 18 for 0\.2 cost stamina 20 when pressed use$/m.test(txt), 'and its ways, meter rules and moves, word for word')
check(!/^(movestate|transition|meter|move) /m.test(moduleTxt({ ...blank(), name: 't' }, [])), 'CONTROL: a module without any writes none of it')

// --- a refusal names its card --------------------------------------------------------------
{
  const m = blank(); addRecipe(m, 'swimming')
  movementOf(m).transitions[2].to = 'floating'
  const v = checkMovement(world, m)
  check(v?.owner?.kind === 'transition' && v.owner.i === 2 && /no movestate line declares/.test(v.why), `a way to a state nobody declared: the engine says so, of that way (${JSON.stringify(v)})`)
  const t = movementOf(m).transitions[0]
  t.when = [{ k: 'grounded' }, { k: 'falling' }, { k: 'rising' }, { k: 'airborne' }, { k: 'asked' }]
  movementOf(m).transitions[2].to = 'wade'
  const five = checkMovement(world, m)
  check(five?.owner?.kind === 'transition' && five.owner.i === 0 && /at most 4/.test(five.why), `five conditions: refused, of the first way (${five?.why})`)
  t.when = []
  check(/needs at least one condition/.test(checkMovement(world, m)?.why ?? ''), 'none: refused too')
  t.when = [{ k: 'depth', level: 'feet' }]
  movementOf(m).moves.push({ name: 'kick', mix: 'set', way: 'up', speed: 5, for: 0, when: [] })
  const v2 = checkMovement(world, m)
  check(v2?.owner?.kind === 'move' && /needs to last/.test(v2.why), `a move that holds for no time: refused, of the move (${v2?.why})`)
}

// --- switched off at the start (engine 318e003) ------------------------------------------
{
  const m = blank(); addRecipe(m, 'glide'); addRecipe(m, 'dash')
  movementOf(m).states[0].flags.push('off'); movementOf(m).moves[0].off = true
  const { lines } = movementLines(m)
  check(lines.some((l) => /^movestate glide .* flags off$/.test(l)) && lines.some((l) => /^move dash set facing 18 for 0\.2 cost stamina 20 off when pressed use$/.test(l)), 'a state and a move that start switched off are written so')
  const v = checkMovement(world, m)
  check(v === null, `and the engine reads them (${v?.why ?? 'ok'})`)
  movementOf(m).moves[0].when = []; movementOf(m).moves[0].cost = { meter: 'stamina', n: 5 }
  check(checkMovement(world, m) === null, 'a switched-off move with no condition, after its cost, too')
}

// --- renames ----------------------------------------------------------------------------
{
  const m = blank(); addRecipe(m, 'swimming'); addRecipe(m, 'dash')
  check(renameThing(m, 'state', 'swim', 'Swimming!') === 'swimming', 'a state is renamed, to a name the engine takes')
  const mv = movementOf(m)
  check(mv.transitions.some((t) => t.to === 'swimming') && mv.transitions.some((t) => t.from === 'swimming') && mv.meters[0].rules[0].in === 'swimming', 'and every way and meter rule follows it')
  check(renameThing(m, 'meter', 'stamina', 'energy') === 'energy' && mv.moves[0].cost.meter === 'energy', 'a meter renamed, the move that costs it follows')
  check(renameThing(m, 'meter', 'air', 'breath') === 'breath' && mv.meters[0].rules.length === 1, 'and so does a meter with rules')
  check(checkMovement(world, m) === null, 'the renamed set is still read by the engine')
  check(renameThing(m, 'state', 'wade', 'default') === null && renameThing(m, 'state', 'wade', 'swimming') === null, 'CONTROL: default, or a name taken, is refused')
}

// --- the avatar draws a state's animation ---------------------------------------------------
{
  const m = blank(); addRecipe(m, 'swimming')
  m.props.push({ id: 1000, name: 'hero', radius: 0.4, height: 1.8, art: { kind: 'atlas', sheet: 'HERO', states: { 0: 'idle' } } })
  m.player = { prop: 'hero', when: { swim: 7 } }
  check(movementAnims(m).join() === 'wade,swim', 'the states offer their animations to the avatar')
  const parsed = parseProps(emitProps(m))
  const av = [...parsed.avatars.values()][0]
  check(av?.when?.swim === 7 && parsed.warnings.length === 0, `"avatar ... when swim state 7", read by the client (${JSON.stringify(av?.when?.swim)}; ${parsed.warnings.join('; ')})`)
}

console.log(`\nmovement: ${checks} checks, ${fails} failures`)
process.exit(fails === 0 ? 0 : 1)
