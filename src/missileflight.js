//
// A missile's flight, seen from the side, as maps/scripts/mobs.lua flies it
// (launch, throw_vz, throw_at_speed, update_missiles) -- for the Missiles
// page's picture and its checks.
//
//   - `speed` is horizontal, units a second; each tick it moves speed/60.
//   - `gravity` (when set) is a fall in units/s² acting on a vertical speed:
//     each tick vz -= gravity/60, then the height moves vz/60. A monster
//     THROWS such a missile on the one arc that lands on the target's middle
//     (its eye, height/2); with `throw` = low|high, `speed` is the launch
//     speed instead and the angle is solved (45° when out of reach).
//   - with no gravity it flies straight along its aim: at a monster's target
//     the slope to its middle.
//   - off the floor, while it has `bounces` left, it turns its climb round and
//     keeps `bounce_keep` (0.6) of its speed.
//   - `life` (ticks) ends it; reaching the target's column below its top is a hit.
//
// Pure: no DOM. Doubles, where the engine is fixed point: right to the
// hundredth of a unit, which is what a picture needs.
//
import { fxNum } from './phrases.js'

const TPS = 60

/**
 * @param def   the missile (module.mobs.missiles[name])
 * @param o     { dist: to the target, height: the target's (1.8), fromPlayer: a level shot from a weapon }
 * @returns { pts: [[x, z]], end: 'hit'|'floor'|'up'|'over'|'expired'|'short', ticks, T, endX, endZ, peak, bounced }
 */
export function flight (def, o = {}) {
  const D = o.dist ?? 8
  const H = o.height ?? 1.8
  const eye = H / 2
  const z0 = fxNum(def.z_offset) ?? 0
  const g = fxNum(def.gravity) ?? 0
  let speed = fxNum(def.speed) ?? 0
  const life = def.life === undefined ? 12 * TPS : Number(def.life)
  let bounces = Number(def.bounces ?? 0)
  const keep = fxNum(def.bounce_keep) ?? 0.6
  let vz = null
  let slope = 0
  const aimed = !o.fromPlayer
  if (g) {
    if (def.throw && aimed && speed > 0) {
      // the angle that lands at a launch speed (throw_at_speed)
      const k = g * D / (speed * speed)
      const m = g * (eye - z0) / (speed * speed)
      const disc = 1 - k * k - m * 2
      const tan = disc < 0 ? 1 : (def.throw === 'high' ? (1 + Math.sqrt(disc)) : (1 - Math.sqrt(disc))) / k
      const h = speed / Math.sqrt(1 + tan * tan)
      vz = h * tan + g / 120
      speed = h
    } else if (aimed && speed > 0) {
      const t = D / speed
      vz = (eye - z0) / t + g * t / 2 + g / 120
    } else vz = 0
  } else if (aimed && D > 0) slope = (eye - z0) / D
  const pts = [[0, z0]]
  let x = 0
  let z = z0
  let n = 0
  let end = 'expired'
  let peak = z0
  let bounced = 0
  while (n < Math.min(life, 20 * TPS)) {
    const step = speed / TPS
    if (vz !== null) { vz -= g / TPS; z += vz / TPS } else z += slope * step
    x += step
    n++
    peak = Math.max(peak, z)
    if (z <= 0) {
      if (bounces > 0) { bounces--; bounced++; z = 0; if (vz !== null) vz = -vz * keep; else slope = -slope; speed *= keep; pts.push([x, 0]); continue }
      z = 0; end = 'floor'; pts.push([x, z]); break
    }
    if (z >= 12) { end = 'up'; pts.push([x, z]); break }
    pts.push([x, z])
    if (x >= D) { end = z <= H ? 'hit' : 'over'; break }
    if (speed <= 0) { end = 'short'; break }
  }
  return { pts, end, ticks: n, T: n / TPS, endX: x, endZ: z, peak: peak - z0, bounced }
}
