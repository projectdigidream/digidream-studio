//
// The Graph view: a monster's states (a weapon's phases) as boxes in lanes,
// one lane per phase, in the order the arrows read; every way out of a state
// an arrow labelled with what it waits for. One finger or the mouse pans, two
// pinch, the wheel zooms about the pointer, as the workshop's board did.
//
import { el, button, withIcon, icon } from '../ui.js'
import { shortOf } from '../phrases.js'

const SVG = 'http://www.w3.org/2000/svg'

/**
 * @param o  { nodes, initial, phases: [{id, name, speed}], any: [rules], table, sel, running, live: { state, rule, any },
 *             word: 'state', pick(name), pickRule(name, i), pickAny(i), view: { x, y, z, fit } (kept by the caller), phone }
 */
export function board (o) {
  const NW = o.phone ? 128 : 150
  const NH = o.phone ? 64 : 72
  const GX = o.phone ? 210 : 240
  const GY = o.phone ? 150 : 180
  const X0 = 24
  const Y0 = 60
  const names = Object.keys(o.nodes)
  const react = (n) => n === 'death' || o.nodes[n].next === '@previous' || n === 'pain'
  const lanes = []
  const phs = o.phases ?? []
  if (phs.length) {
    const rest = names.filter((n) => !react(n) && !phs.some((p) => p.id === o.nodes[n].phase))
    if (rest.length) lanes.push({ label: 'not in a phase', ids: rest })
    for (const p of phs) lanes.push({ label: p.speed ? `${p.name} · runs at ${p.speed} m/s` : p.name, ids: flowOrder(o, names.filter((n) => !react(n) && o.nodes[n].phase === p.id)) })
  } else lanes.push({ label: '', ids: flowOrder(o, names.filter((n) => !react(n))) })
  const pos = {}
  lanes.forEach((L, li) => L.ids.forEach((id, i) => { pos[id] = { x: X0 + i * GX, y: Y0 + li * GY, row: li, i } }))
  let ri = 0
  for (const n of names) if (react(n)) { const slot = 1 + ri * 2; pos[n] = { x: X0 + slot * GX, y: Y0 + lanes.length * GY, row: lanes.length, i: slot }; ri++ }
  const cols = Math.max(1, ...lanes.map((L) => L.ids.length), ri ? 2 * ri : 0)
  const w = X0 * 2 + (cols - 1) * GX + NW
  const h = Y0 + (lanes.length - 1 + (ri ? 1 : 0)) * GY + NH + 80

  const world = el('div', { class: 'me-world', style: `width:${w}px;height:${h}px` })
  const svg = document.createElementNS(SVG, 'svg')
  svg.setAttribute('class', 'me-edges'); svg.setAttribute('width', w); svg.setAttribute('height', h)
  svg.innerHTML = '<defs><marker id="me-arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="7" markerHeight="7" orient="auto"><path d="M0,0 L10,5 L0,10 z" style="fill:var(--cv-graph-edge-transition)"/></marker></defs>'
  world.appendChild(svg)
  for (const L of lanes) if (L.label) world.appendChild(el('span', { class: 'me-lane', style: `left:${X0}px;top:${(pos[L.ids[0]]?.y ?? Y0) - 30}px`, text: L.label }))

  const pairs = new Set()
  for (const n of names) { for (const t of o.nodes[n].transitions ?? []) pairs.add(`${n}>${t.to}`); if (o.nodes[n].next) pairs.add(`${n}>${o.nodes[n].next}`) }
  let up = 0
  let down = 0
  const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  const cub = (p0, p1, p2, p3) => ({ d: `M ${P(p0)} C ${P(p1)}, ${P(p2)}, ${P(p3)}`, mx: 0.125 * p0[0] + 0.375 * p1[0] + 0.375 * p2[0] + 0.125 * p3[0], my: 0.125 * p0[1] + 0.375 * p1[1] + 0.375 * p2[1] + 0.125 * p3[1] })
  const route = (from, to) => {
    const a = pos[from]; const b = pos[to]
    if (from === to) return cub([a.x + NW * 0.3, a.y], [a.x + NW * 0.12, a.y - 52], [a.x + NW * 0.88, a.y - 52], [a.x + NW * 0.7, a.y])
    if (a.row === b.row) {
      const both = pairs.has(`${to}>${from}`)
      if (b.i === a.i + 1) { const y = a.y + NH / 2 + (both ? -10 : 0); return { ...cub([a.x + NW, y], [a.x + NW + 12, y], [b.x - 12, y], [b.x, y]), oy: -13 } }
      if (b.i === a.i - 1) { const y = a.y + NH / 2 + (both ? 10 : 0); return { ...cub([a.x, y], [a.x - 12, y], [b.x + NW + 12, y], [b.x + NW, y]), oy: 13 } }
      if (b.i > a.i) { const lift = 48 + 22 * up++; return cub([a.x + NW * 0.62, a.y], [a.x + NW * 0.62, a.y - lift], [b.x + NW * 0.38, b.y - lift], [b.x + NW * 0.38, b.y]) }
      const drop = 40 + 34 * down++
      return cub([a.x + NW * 0.38, a.y + NH], [a.x + NW * 0.38, a.y + NH + drop], [b.x + NW * 0.62, b.y + NH + drop], [b.x + NW * 0.62, b.y + NH])
    }
    if (b.row > a.row) return cub([a.x + NW * 0.3, a.y + NH], [a.x + NW * 0.3, a.y + NH + GY * 0.3], [b.x + NW * 0.7, b.y - GY * 0.3], [b.x + NW * 0.7, b.y])
    return cub([a.x + NW * 0.7, a.y], [a.x + NW * 0.7, a.y - GY * 0.3], [b.x + NW * 0.3, b.y + NH + GY * 0.3], [b.x + NW * 0.3, b.y + NH])
  }
  const short = (when) => {
    if (!(when ?? []).length) return 'incomplete'
    const sees = when.some((c) => c.cond === 'target_visible')
    const s = when.filter((c) => !(sees && c.cond === 'has_target' && !c.negate)).map((c) => shortOf(o.table, c)).join(' · ')
    return s.length > 24 ? s.slice(0, 23) + '…' : s
  }
  const edge = (from, to, label, kind, live, pick) => {
    if (!pos[from] || !pos[to]) return
    const r = route(from, to)
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', r.d); path.setAttribute('class', 'me-edge'); path.dataset.k = kind; path.dataset.live = live ? '1' : '0'; path.setAttribute('marker-end', 'url(#me-arrow)')
    svg.appendChild(path)
    world.appendChild(el('button', { class: 'me-lab', 'data-live': live ? '1' : '0', style: `left:${r.mx.toFixed(0)}px;top:${(r.my + (r.oy ?? 0)).toFixed(0)}px`, text: label, onclick: pick }))
  }
  for (const n of names) {
    const st = o.nodes[n]
    ;(st.transitions ?? []).forEach((t, i) => edge(n, t.to, short(t.when), 'rule', o.live?.state === n && o.live.rule === i, () => o.pickRule(n, i)))
    for (const t of st.ends ?? []) edge(n, t.to, `at the end: ${short(t.when)}`, 'then', false, () => o.pick(n))
    if (st.next && st.next !== '@previous' && st.ticks !== undefined) edge(n, st.next, `${(st.ends ?? []).length ? 'otherwise, ' : ''}${Math.round(st.ticks / 60 * 100) / 100} s`, 'then', false, () => o.pick(n))
  }
  ;(o.any ?? []).forEach((r, i) => {
    const a = pos[r.to]
    if (!a) return
    const x = a.x + NW * 0.86
    const path = document.createElementNS(SVG, 'path')
    path.setAttribute('d', `M ${x} ${a.y - 46} L ${x} ${a.y}`); path.setAttribute('class', 'me-edge'); path.dataset.k = 'any'; path.dataset.live = o.live?.any === i ? '1' : '0'; path.setAttribute('marker-end', 'url(#me-arrow)')
    svg.appendChild(path)
    world.appendChild(el('button', { class: 'me-lab', style: `left:${x}px;top:${a.y - 54}px`, text: `any ${o.word}: ${short(r.when)}${r.once ? ' (once)' : ''}`, onclick: () => o.pickAny(i) }))
  })
  const MS = { stop: 'stands', wander: 'wanders', chase: 'chases', charge: 'charges', flee: 'backs off', strafe: 'circles', free: 'moved by steps' }
  for (const n of names) {
    const st = o.nodes[n]
    const p = pos[n]
    if (!p) continue
    world.appendChild(el('button', { class: 'me-node', 'data-on': o.sel === n ? '1' : '0', 'data-run': o.running === n ? '1' : '0', 'data-react': react(n) ? '1' : '0', 'data-node': n,
      style: `left:${p.x}px;top:${p.y}px;width:${NW}px;height:${NH}px`, onclick: () => o.pick(n) }, [
      el('b', {}, [o.initial === n ? icon('status.initial') : null, n]),
      el('span', { class: 'me-muted', text: o.lineOf?.(n, st) ?? MS[st.move ?? 'stop'] ?? '' }),
      el('span', { class: 'me-muted', text: st.ticks !== undefined ? `${Math.round(st.ticks / 60 * 100) / 100} s` : (st.transitions ?? []).length ? 'until a rule' : 'stays' })
    ]))
  }

  const box = el('div', { class: 'me-board' }, [world])
  const v = o.view
  const apply = () => { world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})` }
  const fit = () => {
    const r = box.getBoundingClientRect()
    if (!r.width) return
    v.z = Math.max(0.6, Math.min(1, (r.width - 20) / w, (r.height - 20) / h)); v.x = 10; v.y = 10; apply()
  }
  if (v.fit !== false) requestAnimationFrame(fit)
  apply()
  gestures(box, world, v, apply)
  box.appendChild(el('div', { class: 'me-zoom' }, [
    el('button', { icon: 'action.zoomout', 'aria-label': 'zoom out', onclick: () => { v.z = Math.max(0.25, v.z / 1.25); v.fit = false; apply() } }),
    el('button', { text: '+', 'aria-label': 'zoom in', onclick: () => { v.z = Math.min(2.5, v.z * 1.25); v.fit = false; apply() } }),
    el('button', { text: 'fit', 'aria-label': 'every state in view', onclick: () => { v.fit = true; fit() } })
  ]))
  return box
}

/** A lane in the order you read it: entered from outside first, then along its own arrows. */
function flowOrder (o, ids) {
  const inside = new Set(ids)
  const outs = (n) => { const st = o.nodes[n]; return [st.next, ...(st.transitions ?? []).map((t) => t.to), ...(st.ends ?? []).map((t) => t.to)].filter((t) => t && inside.has(t) && t !== n) }
  const doors = new Set([o.initial, ...(o.any ?? []).map((r) => r.to)])
  const entered = new Set()
  for (const [n, st] of Object.entries(o.nodes)) if (!inside.has(n)) for (const t of [st.next, ...(st.transitions ?? []).map((x) => x.to)]) if (t) entered.add(t)
  const seen = new Set()
  const out = []
  const walk = (starts) => { const q = [...starts]; while (q.length) { const id = q.shift(); if (seen.has(id)) continue; seen.add(id); out.push(id); for (const t of outs(id)) if (!seen.has(t)) q.push(t) } }
  walk(ids.filter((id) => doors.has(id))); walk(ids.filter((id) => entered.has(id))); walk(ids)
  return out
}

function gestures (box, world, v, apply) {
  const pts = new Map()
  let last = null
  let moved = 0
  box.addEventListener('pointerdown', (e) => {
    if (e.target.closest('.me-node,.me-lab,.me-zoom')) return
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY }); last = null; moved = 0
    try { box.setPointerCapture(e.pointerId) } catch { /* a synthetic pointer */ }
  })
  box.addEventListener('pointermove', (e) => {
    if (!pts.has(e.pointerId)) return
    const prev = pts.get(e.pointerId)
    pts.set(e.pointerId, { x: e.clientX, y: e.clientY })
    if (pts.size === 1) { v.x += e.clientX - prev.x; v.y += e.clientY - prev.y; moved += Math.abs(e.clientX - prev.x) + Math.abs(e.clientY - prev.y) } else if (pts.size === 2) {
      const [a, b] = [...pts.values()]
      const d = Math.hypot(a.x - b.x, a.y - b.y)
      if (last) v.z = Math.min(2.5, Math.max(0.25, v.z * d / last))
      last = d
    }
    if (moved > 3) v.fit = false
    apply()
  })
  const end = (e) => { pts.delete(e.pointerId); last = null }
  box.addEventListener('pointerup', end); box.addEventListener('pointercancel', end)
  box.addEventListener('wheel', (e) => {
    e.preventDefault()
    const r = box.getBoundingClientRect()
    const z = Math.min(2.5, Math.max(0.25, v.z * Math.exp(-e.deltaY / 400)))
    const k = z / v.z; const px = e.clientX - r.left; const py = e.clientY - r.top
    v.x = px - (px - v.x) * k; v.y = py - (py - v.y) * k; v.z = z; v.fit = false; apply()
  }, { passive: false })
}

export { button, withIcon }
