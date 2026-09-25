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

function input (value, onChange, { placeholder = '', type = 'text' } = {}) {
  const i = el('input', { type, value: value ?? '', placeholder })
  i.addEventListener('change', () => onChange(i.value))
  return i
}

/**
 * @param args   the spec list [{ name, type, optional, values, one_of, doc }]
 * @param obj    the object being edited (a condition, an action, a state ...)
 * @param ctx    { onChange(), pickSector(cb), pickEdge(cb), triggers: [{id,name}],
 *                 states: [names], vars: [names], missiles: [names], mobs: [names],
 *                 props: [names] -- the catalogue's records, for a `prop` argument }
 * @param skip   argument names handled elsewhere
 */
export function argFields (args, obj, ctx, skip = []) {
  const rows = []
  for (const a of args) {
    if (skip.includes(a.name)) continue
    const label = a.optional ? `${a.name}?` : a.name
    const set = (v) => { if (v === undefined || v === '' || v === null) delete obj[a.name]; else obj[a.name] = v; ctx.onChange() }
    const cur = obj[a.name]
    let control
    switch (a.type) {
      case 'int':
        control = input(cur, (v) => set(v === '' ? undefined : Math.round(Number(v))), { type: 'number' })
        break
      case 'fx':
        control = input(showFx(cur), (v) => { const p = v === '' ? undefined : parseFx(v); if (v !== '' && p === null) { ctx.status?.(`${a.name}: write a whole number, a decimal or n/d`, 'warn'); return } set(p) },
                        { placeholder: 'e.g. 0.25 or -4/48' })
        break
      case 'string': case 'value':
        control = input(cur, (v) => set(v))
        break
      case 'bool':
        rows.push(toggle(label, !!cur, (v) => set(v)))
        continue
      case 'enum':
        rows.push(select(label, cur ?? '', [['', a.optional ? '(default)' : '(choose)'], ...a.values], (v) => set(v || undefined)))
        continue
      case 'sector': {
        const label2 = refLabel(cur, ctx)
        const b = button(label2, () => ctx.pickSector?.((hit) => set({ sector: hit.id })))
        b.style.flex = '1 1 auto'
        const sym = select('', typeof cur === 'string' ? cur : '', [['', 'tap…'], ['event', 'the event\'s sector'], ['behind', 'behind the side']],
                           (v) => { if (v) set(v) })
        sym.style.flex = '0 0 auto'
        rows.push(row(label, b, sym.lastChild))
        continue
      }
      case 'trigger': {
        const opts = [['', '(choose)'], ...(ctx.triggers ?? []).map((t) => [t.id, t.name])]
        rows.push(select(label, cur?.trigger ?? '', opts, (v) => set(v ? { trigger: v } : undefined)))
        continue
      }
      case 'state':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.states ?? [])], (v) => set(v || undefined)))
        continue
      case 'var':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.vars ?? [])], (v) => set(v || undefined)))
        continue
      case 'missile':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.missiles ?? [])], (v) => set(v || undefined)))
        continue
      case 'mob':
        rows.push(select(label, cur ?? '', [['', '(choose)'], ...(ctx.mobs ?? [])], (v) => set(v || undefined)))
        continue
      case 'prop':
        rows.push(select(label, cur ?? '', [['', a.optional ? '(any)' : '(choose)'], ...(ctx.props ?? [])], (v) => set(v || undefined)))
        continue
      default:
        continue                      // tables, functions: not edited here
    }
    rows.push(row(label, control))
  }
  return rows
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
