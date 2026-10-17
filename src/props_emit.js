//
// The module's prop catalogue: assets/props.txt, from the module document.
//
// A prop record is the body the server simulates; the atlas or sprite records
// are the picture the client draws (docs/MOBS.md, docs/MODULES.md). Ids are
// wire ids and never renumbered, so each module declares a base and the
// studio hands them out upward from it; two modules with the same base cannot
// be loaded together, and the server says so rather than guessing.
//
// A prop in the module document:
//
//   { id, name, radius, height, speed?, solid?, usable?, scale?,
//     art: { kind: 'atlas', sheet: 'SPIR', states: { 0: 'idle', 1: 'walk' } }
//        | { kind: 'sprite', size, billboard?, states: [{ state, fps, once?, frames: [...] }] }
//        | null }
//
// Not mapfmt's num(): that one rounds to the map grid, and a radius of 0.35
// is not a map coordinate. Six decimals is past anything a body needs and
// short of where a double starts inventing digits.
const num = (v) => Number(Number(v).toFixed(6)).toString()

// The particle and tracer kinds, exactly as client/src/render/vfx.js parses
// them. ONE LINE EACH and no continuation: a wrapped entry keeps the
// attributes before the break and loses every one after it, without a warning.
//
// Written in the parser's own order so two modules' catalogues diff cleanly.
const VFX_NUM = [
  ['count', 'count'], ['life', 'life'], ['life_var', 'lifeVar'],
  ['speed', 'speed'], ['speed_var', 'speedVar'], ['cone', 'cone'],
  ['gravity', 'gravity'], ['drag', 'drag'], ['size', 'size'], ['size_end', 'sizeEnd'],
  ['attach', 'attach'], ['rate', 'rate'], ['linger', 'linger']
]
const hex6 = (n) => (Number(n) >>> 0).toString(16).padStart(6, '0')

/** One `vfx` record: a burst of particles, or a tracer. */
/** The shapes a particle can be drawn as (engine 0.2.1.2, render/vfx.js PARTICLE_SHAPES): the soft dot, and four hard ones. */
export const SHAPES = [['soft', 'a soft dot'], ['disc', 'a hard disc'], ['square', 'a hard square'], ['hexagon', 'a hard hexagon'], ['star', 'a hard star']]

export function vfxLine (v) {
  if (v.type === 'tracer') {
    return `vfx ${v.id} tracer colour ${hex6(v.colour ?? 0xffdd55)} width ${num(v.width ?? 0.04)} life ${num(v.life ?? 0.12)}`
  }
  const out = [`vfx ${v.id} particles`]
  for (const [word, key] of VFX_NUM) {
    // An attached emitter counts nothing and a one-shot burst has no rate, so
    // neither writes the other's fields: a line that says both is a line whose
    // reader has to guess which was meant.
    if (v.attach ? (key === 'count') : (key === 'rate' || key === 'linger' || key === 'attach')) continue
    if (v[key] === undefined || v[key] === null) continue
    out.push(`${word} ${num(v[key])}`)
  }
  out.push(`colour ${hex6(v.colour ?? 0xffaa33)}`)
  out.push(`colour_end ${hex6(v.colourEnd ?? 0x662200)}`)
  if (v.blend === 'alpha') out.push('blend alpha')
  // what each particle is drawn as (engine 0.2.1.2): a module picture, else a
  // hard shape; the soft dot every particle had is the default, never written
  if (v.sprite) out.push(`sprite ${v.sprite}`)
  else if (v.shape && v.shape !== 'soft') out.push(`shape ${v.shape}`)
  return out.join(' ')
}

export function emitProps (module) {
  const L = [
    `# props.txt -- written by the studio for module ${module.id}.`,
    `# Ids ${module.propIdBase}.. are this module's; the studio hands them out.`,
    ''
  ]
  const vfx = [...(module.vfx ?? [])].sort((a, b) => a.id - b.id)
  if (vfx.length) {
    L.push('# Transient visuals: bursts of particles and tracers. Drawn entirely by')
    L.push('# the client -- none of this crosses the wire or enters a hash.')
    for (const v of vfx) L.push(vfxLine(v))
    L.push('')
  }
  for (const p of module.props ?? []) {
    const rec = [`prop ${p.id} ${p.name} radius ${num(p.radius)} height ${num(p.height)}`]
    if (p.speed) rec.push(`speed ${num(p.speed)}`)
    // How big it is DRAWN, as a multiplier on its picture's own size. The
    // server reads and ignores it; the body it collides as stays radius and
    // height (server/src/props.hpp, client/src/render/props.js).
    if (p.scale && p.scale !== 1) rec.push(`scale ${num(p.scale)}`)
    if (p.solid) rec.push('solid')
    if (p.usable) rec.push('usable')
    L.push(rec.join(' '))
    const art = p.art
    if (art?.kind === 'atlas') {
      for (const [state, anim] of Object.entries(art.states ?? {})) {
        // A state given no animation yet (just added, or "(choose)"): not written.
        if (!String(anim ?? '').trim()) continue
        L.push(`atlas ${p.id}${Number(state) ? ` state ${state}` : ''} sheet ${art.sheet} anim ${anim}`)
      }
    } else if (art?.kind === 'sprite') {
      for (const s of art.states ?? []) {
        const rec2 = [`sprite ${p.id}`]
        if (s.once) rec2.push('once')
        rec2.push(`size ${num(art.size)}`)
        if (art.billboard !== false) rec2.push('billboard')
        if (s.state) rec2.push(`state ${s.state}`)
        if (s.fps !== undefined) rec2.push(`fps ${s.fps}`)
        rec2.push(`frames ${s.frames.join(',')}`)
        L.push(rec2.join(' '))
      }
    }
    L.push('')
  }

  // WHICH RECORD DRAWS A PLAYER. A line rather than a record of its own,
  // because a player is kind 0 on the wire and kind 0 is structurally "no
  // prop" in both readers -- so the art is an ordinary record and only its
  // addressing is special (assets/props.txt).
  const player = module.player
  const avatar = player && (module.props ?? []).find((p) => p.name === player.prop)
  if (avatar) {
    L.push("# The player's own art.")
    L.push(`avatar ${avatar.id}${player.blend ? ` blend ${num(player.blend)}` : ''}`)
    for (const [cond, state] of Object.entries(player.when ?? {})) {
      if (state === undefined || state === null || state === '') continue
      L.push(`avatar ${avatar.id} when ${cond} state ${Math.round(state)}`)
    }
    L.push('')
  }
  return L.join('\n')
}

/** The next free id in the module's range. */
export function nextPropId (module) {
  const used = (module.props ?? []).map((p) => p.id)
  return used.length ? Math.max(...used) + 1 : module.propIdBase
}
