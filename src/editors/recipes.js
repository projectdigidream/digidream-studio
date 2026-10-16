//
// Where a new monster or weapon starts: a recipe in the engine's own shape
// (docs/MOBS.md, docs/WEAPONS.md), with the editor's few words (phases, rules
// for any state, end branches) that brainc.js compiles.
//
// A recipe names its animations ('walk', 'slam') rather than the body-state
// numbers a brain holds: `bindAnims` gives each name the number the body's
// sheet plays it under (prop.art.states), adding one past the five when the
// sheet has an animation the five do not cover, and falling back to the
// nearest of the five when the sheet lacks it.
//
// Pure: no DOM.
//
const S = (s) => Math.round(s * 60) // seconds to ticks

const P = (at, action, args = {}) => ({ at: S(at), action, ...args })
const pain = (t = 0.3, sound = null) => ({ anim: 'pain', move: 'stop', face: 'hold', ticks: S(t), next: '@previous', ...(sound ? { sequence: [P(0, 'sound', { name: sound })] } : {}) })
const death = () => ({ anim: 'death', move: 'stop', face: 'hold', solid: false, ticks: 100, next: 'death' })

export const MOB_RECIPES = {
  blank: { label: 'Blank', note: 'stands there; can be hurt and dies', hp: 50, speed: 4,
    brain: () => ({ initial: 'idle', vars: {}, states: { idle: { anim: 'idle', move: 'stop', face: 'target', interruptible: true }, pain: pain(), death: death() } }) },
  grunt: { label: 'Melee grunt', note: 'walks up and hits', hp: 40, speed: 4,
    brain: () => ({ initial: 'look', vars: { ready: 0 }, states: {
      look: { anim: 'idle', move: 'stop', face: 'hold', transitions: [{ to: 'chase', when: [{ cond: 'has_target' }, { cond: 'target_visible' }] }] },
      chase: { anim: 'walk', move: 'chase', face: 'target', interruptible: true,
               transitions: [{ to: 'look', when: [{ cond: 'has_target', negate: true }] }, { to: 'attack', when: [{ cond: 'target_within', distance: '1.5' }, { cond: 'cooldown_ready', var: 'ready' }] }] },
      attack: { anim: 'attack', move: 'stop', face: 'target', ticks: S(0.45), next: 'chase', interruptible: true,
                sequence: [P(0, 'face'), P(0.2, 'melee', { damage: 9, range: '1.6', knockback: 4 }), P(0.2, 'set_cooldown', { var: 'ready', ticks: S(0.5) })] },
      pain: pain(0.17), death: death() } }) },
  shooter: { label: 'Shooter', note: 'keeps its distance, warns, fires a missile', hp: 30, speed: 4, missile: true,
    brain: (m) => ({ initial: 'idle', vars: { ready: 0 }, states: {
      idle: { anim: 'idle', move: 'stop', face: 'target', transitions: [{ to: 'chase', when: [{ cond: 'target_visible' }] }] },
      chase: { anim: 'walk', move: 'chase', face: 'target', interruptible: true,
               transitions: [{ to: 'back_off', when: [{ cond: 'target_within', distance: '4' }] }, { to: 'aim', when: [{ cond: 'target_within', distance: '12' }, { cond: 'cooldown_ready', var: 'ready' }] }, { to: 'idle', when: [{ cond: 'has_target', negate: true }] }] },
      back_off: { anim: 'walk', move: 'flee', face: 'target', ticks: S(0.8), next: 'chase', interruptible: true },
      aim: { anim: 'aim', move: 'stop', face: 'target', ticks: S(0.4), next: 'fire', interruptible: true, sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.4) })] },
      fire: { anim: 'fire', move: 'stop', face: 'target', ticks: S(0.5), next: 'chase', sequence: [P(0.1, 'missile', { kind: m }), P(0.1, 'set_cooldown', { var: 'ready', ticks: S(2) })] },
      pain: pain(), death: death() } }) },
  flyer: { label: 'Flyer', note: 'hovers, keeps away, fires from range', hp: 25, speed: 4, missile: true, flying: true,
    brain: (m) => ({ initial: 'idle', vars: { ready: 0 }, flying: true, hover_z: '2', states: {
      idle: { anim: 'idle', move: 'stop', face: 'target', transitions: [{ to: 'keep_away', when: [{ cond: 'target_visible' }] }] },
      keep_away: { anim: 'walk', move: 'chase', face: 'target', interruptible: true,
                   transitions: [{ to: 'back_off', when: [{ cond: 'target_within', distance: '6' }] }, { to: 'shoot', when: [{ cond: 'target_within', distance: '14' }, { cond: 'cooldown_ready', var: 'ready' }] }, { to: 'idle', when: [{ cond: 'has_target', negate: true }] }] },
      back_off: { anim: 'walk', move: 'flee', face: 'target', ticks: S(0.6), next: 'keep_away', interruptible: true },
      shoot: { anim: 'fire', move: 'stop', face: 'target', ticks: S(0.5), next: 'keep_away', interruptible: true,
               sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.2) }), P(0.2, 'missile', { kind: m }), P(0.2, 'set_cooldown', { var: 'ready', ticks: S(1.8) })] },
      pain: pain(0.2), death: death() } }) },
  charger: { label: 'Charger', note: 'winds up where you can see it, then rushes you', hp: 60, speed: 7,
    brain: () => ({ initial: 'idle', vars: { rush_cd: 0 }, states: {
      idle: { anim: 'idle', move: 'stop', face: 'target', transitions: [{ to: 'chase', when: [{ cond: 'target_visible' }] }] },
      chase: { anim: 'walk', move: 'chase', face: 'target', interruptible: true,
               transitions: [{ to: 'wind_up', when: [{ cond: 'target_within', distance: '10' }, { cond: 'cooldown_ready', var: 'rush_cd' }] }, { to: 'idle', when: [{ cond: 'has_target', negate: true }] }] },
      wind_up: { anim: 'idle', move: 'stop', face: 'target', ticks: S(0.5), next: 'rush', interruptible: true, sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.5) })] },
      rush: { anim: 'leap', move: 'charge', face: 'movement', ticks: S(0.7), next: 'chase', interruptible: false,
              sequence: [P(0, 'impulse', { speed: 14, towards: 'target' }), P(0.3, 'melee', { damage: 20, range: '1.8', knockback: 8 }), P(0.3, 'set_cooldown', { var: 'rush_cd', ticks: S(3) })] },
      pain: pain(0.25), death: death() } }) },
  boss: { label: 'Boss (3 phases)', note: 'three phases at 66% and 33%, summons and a leap', hp: 900, speed: 4, missile: true,
    brain: (m, kin) => ({ initial: 'idle', pain_chance: 26, vars: { phase: 1, slam_cd: 0, shot_cd: 0, leap_cd: 0, adds_cd: 0 },
      phases: [{ id: 'p1', name: 'Phase 1: slam and shells' }, { id: 'p2', name: 'Phase 2: the roar', speed: 5 }, { id: 'p3', name: 'Phase 3: frenzy', speed: 6.5 }],
      any: [{ to: 'roar', when: [{ cond: 'hp_below', percent: 66 }], once: true }, { to: 'enrage', when: [{ cond: 'hp_below', percent: 33 }], once: true }],
      states: {
        idle: { anim: 'idle', move: 'stop', face: 'target', phase: 'p1', transitions: [{ to: 'chase', when: [{ cond: 'target_visible' }] }] },
        chase: { anim: 'walk', move: 'chase', face: 'target', phase: 'p1', interruptible: true,
                 transitions: [{ to: 'slam', when: [{ cond: 'target_within', distance: '3' }, { cond: 'cooldown_ready', var: 'slam_cd' }] }, { to: 'lob', when: [{ cond: 'target_within', distance: '16' }, { cond: 'cooldown_ready', var: 'shot_cd' }] }] },
        slam: { anim: 'slam', move: 'stop', face: 'target', phase: 'p1', ticks: S(1.1), next: 'chase', interruptible: true,
                sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.5) }), P(0.55, 'damage_area', { damage: 35, radius: '3' }), P(0.55, 'set_cooldown', { var: 'slam_cd', ticks: S(3) })] },
        lob: { anim: 'fire', move: 'stop', face: 'target', phase: 'p1', ticks: S(0.7), next: 'chase', interruptible: true,
               sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.3) }), P(0.3, 'missile', { kind: m }), P(0.3, 'set_cooldown', { var: 'shot_cd', ticks: S(2.5) })] },
        roar: { anim: 'idle', move: 'stop', face: 'target', phase: 'p2', ticks: S(1.5), next: 'chase2', interruptible: false,
                sequence: [P(0, 'set_var', { var: 'phase', value: 2 }), P(0.6, 'spawn', { mob: kin, count: 3 }), P(0.6, 'alert_nearby', { radius: '20' })] },
        chase2: { anim: 'walk', move: 'chase', face: 'target', phase: 'p2', interruptible: true,
                  transitions: [{ to: 'slam2', when: [{ cond: 'target_within', distance: '3' }, { cond: 'cooldown_ready', var: 'slam_cd' }] }, { to: 'barrage', when: [{ cond: 'target_within', distance: '18' }, { cond: 'cooldown_ready', var: 'shot_cd' }] }] },
        slam2: { anim: 'slam', move: 'stop', face: 'target', phase: 'p2', ticks: S(0.8), next: 'chase2', interruptible: true,
                 sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.4) }), P(0.45, 'damage_area', { damage: 45, radius: '3.5' }), P(0.45, 'set_cooldown', { var: 'slam_cd', ticks: S(2.5) })] },
        barrage: { anim: 'fire', move: 'stop', face: 'target', phase: 'p2', ticks: S(1.2), next: 'chase2', interruptible: true,
                   ends: [{ to: 'frenzy', when: [{ cond: 'var_at_least', var: 'phase', value: 3 }] }],
                   sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.4) }), P(0.4, 'missile', { kind: m }), P(0.6, 'missile', { kind: m }), P(0.8, 'missile', { kind: m }), P(0.8, 'set_cooldown', { var: 'shot_cd', ticks: S(3) })] },
        enrage: { anim: 'slam', move: 'stop', face: 'target', phase: 'p3', ticks: S(1.2), next: 'frenzy', interruptible: false,
                  sequence: [P(0, 'set_var', { var: 'phase', value: 3 }), P(0.5, 'spawn', { mob: kin, count: 2 }), P(0.5, 'set_cooldown', { var: 'adds_cd', ticks: S(8) })] },
        frenzy: { anim: 'walk', move: 'chase', face: 'target', phase: 'p3', interruptible: true,
                  transitions: [{ to: 'leap', when: [{ cond: 'target_within', distance: '9' }, { cond: 'cooldown_ready', var: 'leap_cd' }] }, { to: 'call_adds', when: [{ cond: 'cooldown_ready', var: 'adds_cd' }] }, { to: 'barrage', when: [{ cond: 'target_within', distance: '18' }, { cond: 'cooldown_ready', var: 'shot_cd' }] }] },
        leap: { anim: 'slam', move: 'stop', face: 'target', phase: 'p3', ticks: S(0.9), next: 'frenzy', interruptible: true,
                sequence: [P(0, 'telegraph', { effect: 12, ticks: S(0.3) }), P(0.3, 'impulse', { speed: 14, towards: 'target' }), P(0.6, 'melee', { damage: 40, range: '2.5', knockback: 10 }), P(0.6, 'set_cooldown', { var: 'leap_cd', ticks: S(2) })] },
        call_adds: { anim: 'idle', move: 'stop', face: 'target', phase: 'p3', ticks: S(0.8), next: 'frenzy', interruptible: true,
                     sequence: [P(0.4, 'spawn', { mob: kin, count: 2 }), P(0.4, 'set_cooldown', { var: 'adds_cd', ticks: S(8) })] },
        pain: pain(0.3), death: death()
      } }) }
}

export const WEAPON_RECIPES = {
  blank: { label: 'Blank', note: 'drawn, then waits for a rule', phases: () => ({ draw: { anim: 0, ticks: S(0.3), next: 'ready' }, ready: { anim: 0 } }) },
  pistol: { label: 'Pistol', note: 'one instant shot each press', per: 1, phases: () => ({
    draw: { anim: 0, ticks: S(0.3), next: 'ready' },
    ready: { anim: 0, transitions: [{ to: 'fire', when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 1 }] }] },
    fire: { anim: 2, ticks: S(0.3), next: 'ready', sequence: [P(0, 'hitscan', { damage: 12, range: '32', spread: 1, tracer: 1, hit_vfx: 12 }), P(0, 'consume', { n: 1 }), P(0, 'vfx', { effect: 12 })] } }) },
  launcher: { label: 'Launcher', note: 'one heavy shot and a kick', per: 1, missile: true, phases: (m) => ({
    draw: { anim: 0, ticks: S(0.3), next: 'ready' },
    ready: { anim: 0, transitions: [{ to: 'fire', when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 1 }] }] },
    fire: { anim: 2, ticks: S(0.6), next: 'ready', sequence: [P(0, 'launch', { missile: m }), P(0, 'consume', { n: 1 }), P(0, 'vfx', { effect: 12 }), P(0, 'impulse', { speed: 3, towards: 'away' })] } }) },
  charge: { label: 'Charge shot', note: 'hold fire 1 s to release; let go early and nothing happens', per: 5, missile: true, phases: (m) => ({
    draw: { anim: 0, ticks: S(0.3), next: 'ready' },
    ready: { anim: 0, transitions: [{ to: 'charge', when: [{ cond: 'button_pressed' }, { cond: 'has_ammo', n: 5 }] }] },
    charge: { anim: 1, transitions: [{ to: 'release', when: [{ cond: 'held_for', ticks: S(1) }] }, { to: 'ready', when: [{ cond: 'button_released' }] }], sequence: [P(0.5, 'vfx', { effect: 12 })] },
    release: { anim: 2, ticks: S(0.8), next: 'ready', sequence: [P(0, 'launch', { missile: m }), P(0, 'consume', { n: 5 }), P(0, 'impulse', { speed: 6, towards: 'away' })] } }) }
}

/** A missile a recipe can fire when the module has none of its own. */
export const RECIPE_MISSILE = () => ({ speed: '16', life: 120, on_hit: [{ action: 'damage_area', damage: 15, radius: '2', falloff: true }, { action: 'vfx', kind: 11, at: 'impact' }] })

const FALLBACK = { idle: 0, walk: 1, attack: 2, pain: 3, death: 4, aim: 0, fire: 2, slam: 2, leap: 2 }

/**
 * Gives every state's animation NAME the body-state number its sheet plays it
 * under, adding states to `art.states` past the five as needed (mutates both).
 * @param animations  the sheet's animation names
 */
export function bindAnims (brain, art, animations) {
  art.states ??= {}
  const has = (n) => animations.includes(n)
  const numOf = (name) => {
    for (const [k, v] of Object.entries(art.states)) if (v === name) return Number(k)
    if (!has(name)) return FALLBACK[name] ?? 0
    let k = 5
    while (art.states[k] !== undefined) k++
    art.states[k] = name
    return k
  }
  for (const st of Object.values(brain.states)) if (typeof st.anim === 'string') st.anim = numOf(st.anim)
  return brain
}

/** The name an animation number plays on a body: `art.states[n]`. */
export const animName = (art, n) => art?.states?.[n] ?? null
