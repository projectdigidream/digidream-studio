//
// A prop the studio writes is a body the server's catalogue reads and a
// picture the client's catalogue parser draws; deleting or renaming one
// follows it into every map it stands in.
//
// ORACLE: client/src/render/props.js's parseProps, on the text the studio
// emits -- the same parser the game runs.
//
import { moduleProps, newProp, deleteProp, renameProp, placementsOf, artFromPicture, artFromSheet } from '../src/props.js'
import { emitProps } from '../src/props_emit.js'
import { parseProps } from '../../engine/client/src/render/props.js'

let checks = 0
let fails = 0
const check = (ok, label) => {
  checks++
  if (!ok) { fails++; console.log(`  FAIL ${label}`) }
}

const module = {
  id: 't', propIdBase: 1000,
  props: [{ id: 1000, name: 'spirit', radius: 0.35, height: 1, speed: 5, solid: true, art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle' } } }],
  mobs: { missiles: {}, mobs: { spirit: { hp: 30, initial: 'look', states: {} } } },
  sprites: { SPIR: { image: 'SPIR.png', worldHeight: 1, animations: ['idle', 'walk'] } }
}
const docs = {
  first: { entities: [{ id: 'n1', kind: 'mob', name: 'spirit', x: 0, y: 0, z: 0 }] },
  second: { entities: [] }
}

// --- bodies without brains ---------------------------------------------------------
check(moduleProps(module).length === 0, 'a monster\'s body is not a prop')
const barrel = newProp(module, 'Barrel!')
check(barrel === 'barrel', `a new prop gets a clean name (${barrel})`)
check(module.props.find((p) => p.name === 'barrel')?.id === 1001, 'its id is the next in the module\'s range')
check(newProp(module, 'barrel') === null, 'CONTROL: a taken name is refused')
check(newProp(module, '!!') === null, 'CONTROL: an empty name is refused')
check(moduleProps(module).map((p) => p.name).join() === 'barrel', 'the prop is listed, the monster\'s body is not')

// --- the picture, through the game's own parser ---------------------------------------
const p = module.props.find((x) => x.name === 'barrel')
p.height = 1.5
p.art = artFromPicture('BARREL', p.height)
let parsed = parseProps(emitProps(module))
let k = parsed.kinds.get(1001)
check(k?.type === 'sprite' && k.size === 1.5 && k.billboard === true, `a single picture is a sprite record the client reads (${JSON.stringify({ type: k?.type, size: k?.size, billboard: k?.billboard })})`)
check(k?.states?.get(0)?.frames?.[0] === 'BARREL', 'drawn from the picture, state 0')
check(k?.radius === 0.5 && k.height === 1.5 && (k.flags & 1) === 1, `the body is there too: radius, height, solid (${JSON.stringify({ r: k?.radius, h: k?.height, f: k?.flags })})`)
check(parsed.warnings.length === 0, `no warnings from the parser (${parsed.warnings.join('; ')})`)

p.art = artFromSheet(module, 'SPIR')
parsed = parseProps(emitProps(module))
k = parsed.kinds.get(1001)
check(k?.type === 'atlas' && k.sheet === 'SPIR' && k.states?.get(0)?.anim === 'idle', `a sheet is an atlas record, first animation for state 0 (${JSON.stringify({ type: k?.type, sheet: k?.sheet })})`)

// --- placements follow the prop ---------------------------------------------------------
docs.first.entities.push({ id: 'n2', kind: 'prop', name: 'barrel', x: 1, y: 1, z: 0 }, { id: 'n3', kind: 'mob', name: 'barrel', x: 2, y: 2, z: 0 })
docs.second.entities.push({ id: 'n4', kind: 'prop', name: 'barrel', x: 3, y: 3, z: 0 })
check(placementsOf(docs, 'barrel').length === 2, 'placements are counted across maps, props only')
check(renameProp(module, docs, 'barrel', 'crate') === 'crate', 'a prop is renamed')
check(placementsOf(docs, 'crate').length === 2 && placementsOf(docs, 'barrel').length === 0, 'its placements are renamed with it')
check(renameProp(module, docs, 'crate', 'spirit') === null, 'CONTROL: renaming onto a body that exists is refused')
check(deleteProp(module, docs, 'crate') === 2, 'deleting removes the placements and says how many')
check(module.props.length === 1 && docs.first.entities.length === 2 && docs.second.entities.length === 0, 'the body is gone; the monster placements, even one with the same name, stay')

// --- everything that names a prop follows a rename ----------------------------------------
{
  const m = { props: [{ id: 1, name: 'bolt' }, { id: 2, name: 'gem' }],
    mobs: { missiles: { bolt: {}, arrow: { prop: 'bolt' }, other: { prop: 'gem' } },
      mobs: { grunt: { drops: [{ item: 'gem' }, { choices: [{ item: 'gem' }, { item: 'bolt' }] }], states: { look: { sequence: [{ at: 0, action: 'target_nearest', of: 'prop', prop: 'gem' }] } } } } },
    player: { prop: 'gem' } }
  const d = { a: { entities: [], triggers: [{ actions: [{ a: 'spawn_prop', name: 'gem' }, { a: 'spawn_prop', name: 'bolt' }] }] } }
  renameProp(m, d, 'bolt', 'shot')
  check(m.mobs.missiles.bolt.prop === 'shot' && m.mobs.missiles.arrow.prop === 'shot' && m.mobs.missiles.other.prop === 'gem',
    `a missile drawn as the prop, by its own name or by saying so, follows its rename (${JSON.stringify(m.mobs.missiles)})`)
  renameProp(m, d, 'gem', 'jewel')
  const g = m.mobs.mobs.grunt
  check(g.drops[0].item === 'jewel' && g.drops[1].choices[0].item === 'jewel' && g.drops[1].choices[1].item === 'shot' && g.states.look.sequence[0].prop === 'jewel',
    `so does what a monster drops and the nearest it looks for (${JSON.stringify(g)})`)
  check(m.player.prop === 'jewel' && d.a.triggers[0].actions[0].name === 'jewel' && d.a.triggers[0].actions[1].name === 'shot', 'and the player, and a trigger that spawns it')
  check(!('prop' in g), 'CONTROL: a monster whose body is another prop is not given this one')
}

console.log(`props: ${checks} checks, ${fails} failures`)
process.exit(fails ? 1 : 0)
