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

export function emitProps (module) {
  const L = [
    `# props.txt -- written by the studio for module ${module.id}.`,
    `# Ids ${module.propIdBase}.. are this module's; the studio hands them out.`,
    ''
  ]
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
  return L.join('\n')
}

/** The next free id in the module's range. */
export function nextPropId (module) {
  const used = (module.props ?? []).map((p) => p.id)
  return used.length ? Math.max(...used) + 1 : module.propIdBase
}
