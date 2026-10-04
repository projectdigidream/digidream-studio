//
// A form for a vocabulary entry's arguments, generated from its spec.
//
// The trigger and mob vocabularies describe every argument by name and type
// (docs/TRIGGERS.md, docs/MOBS.md). This turns one such list into controls
// that write into the object being edited, so a new action in the vocabulary
// is a new form with no studio change. The only knowledge here is what each
// TYPE looks like on screen; nothing here knows what a door is.
//
import { el, row, toggle, select, button, muted } from './ui.js'

/** "0.25" -> "0.25", "-4/48" -> [-4, 48], "2" -> 2. Null when unreadable. */
export function parseFx (s) {
  const t = String(s).trim()
  if (/^-?\d+$/.test(t)) return Number(t)
  if (/^-?\d+\.\d{1,9}$/.test(t)) return t
  const m = /^(-?\d+)\s*\/\s*(\d+)$/.exec(t)
  if (m && Number(m[2]) !== 0) return [Number(m[1]), Number(m[2])]
  return null
}

export function showFx (v) {
  if (Array.isArray(v)) return `${v[0]}/${v[1]}`
  return v === undefined || v === null ? '' : String(v)
}

let listSeq = 0
function input (value, onChange, { placeholder = '', type = 'text', choices = null } = {}) {
  const i = el('input', { type, value: value ?? '', placeholder })
  if (type === 'number') i.step = 'any'
  i.addEventListener('change', () => onChange(i.value))
  // Names the studio knows -- the bank's sounds, the sheets' frames -- offered
  // as the field is typed in, and never enforced: a name from another module
  // loaded beside this one is still a name.
  if (choices && choices.length) {
    const id = `st-choices-${++listSeq}`
    i.setAttribute('list', id)
    return el('span', { class: 'st-choice' }, [i, el('datalist', { id }, choices.map((c) => el('option', { value: c })))])
  }
  return i
}

/**
 * @param args   the spec list [{ name, type, optional, values, one_of, doc }]
 * @param obj    the object being edited (a condition, an action, a state ...)
 * @param ctx    { onChange(), pickSector(cb), pickEdge(cb), triggers: [{id,name}],
 *                 states: [names], vars: [names], missiles: [names], mobs: [names],
 *                 props: [names] -- the catalogue's records, for a `prop` argument,
 *                 vfxChoices() -> [[id, label]] -- particle kinds, for the ints that name one,
 *                 suggest(argName, owner) -> [names] | null -- what a string field might hold,
 *                 soundField(label, value, onChange) -> row -- the picker for a sound's name,
 *                 pickTag(cb) / pickPoint(cb) / pickThing(cb) -- a tag, a place or a thing
 *                 tapped on the map (S.mapPickers) }
 * @param skip   argument names handled elsewhere
 * @param owner  the entry these arguments belong to ('sound', 'ui_open' ...), so
 *               a `name` can mean a sound in one place and nothing in another
 */
// The arguments that are a PARTICLE KIND rather than a plain number. Every
// vocabulary types them `int`, because to the runtime that is all they are --
// the catalogue says what a 12 looks like and nothing else does. Recognised by
// name here so the studio can offer the kinds it has instead of asking someone
// to remember which number was the green blood.
const VFX_ARGS = new Set(['hit_vfx', 'kind', 'effect', 'tracer', 'blood'])

// Arguments that name a THING by its catalogue name, which can be taken from
// one placed on the map.
const THING_NAMES = new Set(['entity_kind_is', 'target_name_is', 'spawn_prop', 'spawn_enemy'])
// The graph's own nodes name things by other arguments: a prop's kind, what
// to spawn, which monster's death.
const THING_ARGS = { prop: null, what: new Set(['spawn']), kind: new Set(['when_dies', 'when_hurt']) }
const thingArg = (name, owner) => (name === 'name' && THING_NAMES.has(owner)) ||
  (name in THING_ARGS && (THING_ARGS[name] === null || THING_ARGS[name].has(owner)))

export function argFields (args, obj, ctx, skip = [], owner = null) {
  const rows = []
  const names = new Set(args.map((a) => a.name))
  const fx = (v) => (Number.isInteger(v) ? v : String(Number(v.toFixed(3))))
  for (const a of args) {
    if (skip.includes(a.name)) continue
    argRows(a)
    // The argument's own row says whose it is, for a caller that adds to it
    // (the graph board puts the argument's data pin there).
    const own = rows[rows.length - 1]
    if (own && own.dataset && !own.dataset.arg) own.dataset.arg = a.name
  }
  return rows

  function argRows (a) {
    // A PLACE: x, y (and z) together, from one tap on the floor.
    for (const [px, py, pz, what] of [['x', 'y', 'z', 'where'], ['pivot_x', 'pivot_y', null, 'turning about']]) {
      if (a.name !== px || !names.has(py) || !ctx.pickPoint) continue
      rows.push(row(`📍 ${what}`, button('pick a point on the map', () => ctx.pickPoint((p) => {
        obj[px] = fx(p.x); obj[py] = fx(p.y)
        if (pz && names.has(pz)) obj[pz] = fx(p.z ?? 0)
        ctx.onChange()
      }))))
    }
    const label = a.optional ? `${a.name}?` : a.name
    const set = (v) => { if (v === undefined || v === '' || v === null) delete obj[a.name]; else obj[a.name] = v; ctx.onChange() }
    const cur = obj[a.name]
    let control
    switch (a.type) {
      case 'int':
        // A ROOM or a WALL as its index: picked on the map and held as a
        // reference, which the emitter writes as the index (a graph's world nodes).
        // A CAMERA PATH by its tag: the map's paths, each with its length, and
        // for a flythrough how long the shot lasts at its speed (the engine
        // times `done` the same way: length / speed).
        if (a.name === 'path' && ctx.paths) {
          const list = ctx.paths()
          const opts = [['', list.length ? '(choose a path)' : '(no camera paths on this map)'],
            ...(cur !== undefined && !list.some((p) => p.tag === cur) ? [[String(cur), `tag ${cur} -- not on this map`]] : []),
            ...list.map((p) => [String(p.tag), `tag ${p.tag}${p.length !== null ? ` · ${p.length.toFixed(1)} u` : ' · needs 2 points'}`])]
          rows.push(row(label, selectOf(cur === undefined ? '' : String(cur), opts, (v) => set(v === '' ? undefined : Number(v))),
            ctx.editPath ? button('✎', () => ctx.editPath(cur)) : null))
          const info = list.find((p) => p.tag === cur)
          if (info?.length && owner === 'camera_flythrough') {
            const speed = Math.abs(Number(obj.speed ?? 6)) || 6
            rows.push(muted(`the shot lasts ${(info.length / speed).toFixed(1)} s at ${speed} u/s`))
          }
          return
        }
        // A panel's widget by its number (widget_is): chosen by its panel and name.
        if (a.name === 'widget' && ctx.widgetIds) {
          rows.push(row(label, selectOf(cur === undefined ? '' : String(cur), [['', '(choose)'], ...ctx.widgetIds().map(([id, t]) => [String(id), t])], (v) => set(v === '' ? undefined : Number(v)))))
          return
        }
        if (a.name === 'sector' && ctx.pickSector) {
          const b = button(refLabel(cur, ctx), () => ctx.pickSector((hit) => set({ sector: hit.id })))
          b.style.flex = '1 1 auto'
          rows.push(row(label, b, cur !== undefined ? button('✕', () => set(undefined)) : null))
          return
        }
        if (a.name === 'side' && ctx.pickEdge) {
          const b = button(cur?.edge ? `wall ${cur.edge}` : 'tap a wall', () => ctx.pickEdge((hit) => set({ edge: hit.id })))
          b.style.flex = '1 1 auto'
          rows.push(row(label, b, cur !== undefined ? button('✕', () => set(undefined)) : null))
          return
        }
        // A ROOM'S TAG, from tapping the room (which is given one if it has none).
        if (a.name === 'tag' && ctx.pickTag) {
          const i = input(cur, (v) => set(v === '' ? undefined : Math.round(Number(v))), { type: 'number' })
          rows.push(row(label, i, button('📍', () => ctx.pickTag((t) => { if (t) set(t) }))))
          return
        }
        if (VFX_ARGS.has(a.name) && ctx.vfxChoices) {
          rows.push(select(label, cur === undefined || cur === null ? '' : String(cur),
                           [['', a.optional ? '(none)' : '(choose)'], ...ctx.vfxChoices()],
                           (v) => set(v === '' ? undefined : Number(v))))
          return
        }
        control = input(cur, (v) => set(v === '' ? undefined : Math.round(Number(v))), { type: 'number' })
        break
      // A plain number: units, seconds, degrees.
      case 'number':
        control = input(cur, (v) => set(v === '' || !Number.isFinite(Number(v)) ? undefined : Number(v)), { type: 'number' })
        break
      case 'fx':
        control = input(showFx(cur), (v) => { const p = v === '' ? undefined : parseFx(v); if (v !== '' && p === null) { ctx.status?.(`${a.name}: write a whole number, a decimal or n/d`, 'warn'); return } set(p) },
                        { placeholder: 'e.g. 0.25 or -4/48' })
        break
      case 'string': case 'value':
        // ANOTHER MAP of the module, by the name the server lists it under.
        if (a.name === 'level' && ctx.maps) {
          const names = ctx.maps()
          rows.push(row(label, selectOf(cur === undefined ? '' : String(cur), [['', '(choose a map)'], ...(cur !== undefined && cur !== '' && !names.includes(String(cur)) ? [[String(cur), `${cur} -- not a map of the module`]] : []), ...names.map((n) => [n, n])], (v) => set(v || undefined))))
          return
        }
        // A SPAWN POINT by its tag: on the map a change_map goes to, or on this one.
        if (a.name === 'spawn' && ctx.spawnsOf) {
          const there = owner === 'change_map' ? obj.level : null
          const tags = ctx.spawnsOf(there)
          rows.push(row(label, selectOf(cur ?? '', [['', owner === 'change_map' ? '(the map\'s start)' : '(none)'], ...(cur && !tags.includes(cur) ? [[cur, `${cur} -- not on ${there ?? 'this map'}`]] : []), ...tags.map((t) => [t, t])], (v) => set(v || undefined))))
          if (cur && !tags.includes(cur) && owner === 'change_map') rows.push(muted(`${there ?? 'that map'} has no spawn point tagged ${cur}: the player would arrive at its start`))
          return
        }
        // A PANEL of the module's, and a widget of it by name: chosen, not typed.
        if (a.type === 'string' && a.name === 'panel' && ctx.panels) {
          const names = ctx.panels()
          rows.push(row(label, selectOf(cur ?? '', [['', a.optional ? '(none)' : '(choose)'], ...(cur && !names.includes(cur) ? [[cur, `${cur} -- no such panel`]] : []), ...names.map((n) => [n, n])], (v) => set(v || undefined)),
            ctx.editPanel ? button('✎', () => ctx.editPanel(cur)) : null))
          return
        }
        if (a.type === 'string' && a.name === 'widget' && ctx.widgetsOf) {
          const names = ctx.widgetsOf(obj.panel)
          rows.push(row(label, selectOf(cur ?? '', [['', a.optional ? '(any)' : '(choose)'], ...(cur && !names.includes(cur) ? [[cur, `${cur} -- not on that panel`]] : []), ...names.map((n) => [n, n])], (v) => set(v || undefined))))
          return
        }
        // A sound is picked from the module's packs and heard, not typed.
        if (ctx.soundField && (a.name === 'sound' || (a.name === 'name' && owner === 'sound'))) {
          rows.push(ctx.soundField(label, cur, (v) => set(v || undefined)))
          return
        }
        control = input(cur, (v) => set(v), { choices: ctx.suggest?.(a.name, owner) ?? null })
        // A THING'S NAME, from tapping one placed on the map.
        if (thingArg(a.name, owner) && ctx.pickThing) {
          rows.push(row(label, control, button('📍', () => ctx.pickThing((e) => { if (e) set(e.name) }))))
          return
        }
        break
      // A list of names, written as the comma-separated line a person types.
      case 'string_list':
        control = input(Array.isArray(cur) ? cur.join(', ') : '', (v) => {
          const list = v.split(',').map((x) => x.trim()).filter(Boolean)
          set(list.length ? list : undefined)
        }, { placeholder: 'red, green, blue' })
        break
      case 'bool':
        rows.push(toggle(label, !!cur, (v) => set(v)))
        return
      case 'enum':
        rows.push(select(label, cur ?? '', [['', a.optional ? '(default)' : '(choose)'], ...a.values], (v) => set(v || undefined)))
        return
      case 'sector': {
        const label2 = refLabel(cur, ctx)
        const b = button(label2, () => ctx.pickSector?.((hit) => set({ sector: hit.id })))
        b.style.flex = '1 1 auto'
        const sym = select('', typeof cur === 'string' ? cur : '', [['', 'tap…'], ['event', 'the event\'s sector'], ['behind', 'behind the side']],
                           (v) => { if (v) set(v) })
        sym.style.flex = '0 0 auto'
        rows.push(row(label, b, sym.lastChild))
        return
      }
      case 'trigger': {
        const opts = [['', '(choose)'], ...(ctx.triggers ?? []).map((t) => [t.id, t.name])]
        rows.push(select(label, cur?.trigger ?? '', opts, (v) => set(v ? { trigger: v } : undefined)))
        return
      }
      case 'state':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.states ?? [])], (v) => set(v || undefined)))
        return
      case 'var':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.vars ?? [])], (v) => set(v || undefined)))
        return
      case 'missile':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.missiles ?? [])], (v) => set(v || undefined)))
        return
      case 'mob':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.mobs ?? [])], (v) => set(v || undefined)))
        return
      // The weapon vocabulary's references: a pool, a weapon, a phase.
      case 'ammo':
        rows.push(select(label, cur ?? '', [['', a.optional ? '(never runs out)' : '(choose)'], ...(ctx.ammo ?? [])], (v) => set(v || undefined)))
        return
      case 'weapon':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.weapons ?? [])], (v) => set(v || undefined)))
        return
      case 'phase':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.phases ?? ctx.states ?? [])], (v) => set(v || undefined)))
        return
      case 'prop':
        rows.push(select(label, cur ?? '', [['', a.optional ? '(any)' : '(choose)'], ...(ctx.props ?? [])], (v) => set(v || undefined)))
        return
      default:
        return                      // tables, functions: not edited here
    }
    rows.push(row(label, control))
  }
}

/** A bare select, its value kept even when not among the options. */
function selectOf (value, options, onChange) {
  const s = el('select', {}, options.map(([v, t]) => el('option', { value: v, text: t })))
  s.value = value
  s.addEventListener('change', () => onChange(s.value))
  return s
}

export function refLabel (v, ctx) {
  if (v === undefined || v === null) return 'tap a sector'
  if (typeof v === 'string') return v
  if (typeof v === 'number') return `sector #${v}`
  if (v.sector) return `sector ${v.sector}`
  if (v.edge) return `wall ${v.edge}`
  if (v.edgeTwin) return `the side facing wall ${v.edgeTwin}`
  return JSON.stringify(v)
}

/** A one-line description of an entry for a card header. */
export function docLine (spec) { return spec?.doc ? muted(spec.doc) : null }
