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
  const phs = o.phases ?? []
  // Phases apart: each lane on a band of its own, its title at the top.
  const GY = phs.length ? (o.phone ? 200 : 250) : (o.phone ? 150 : 180)
  const TOP = o.phone ? 84 : 96          // a band starts this far over its states
  const X0 = 24
  const Y0 = phs.length ? TOP + 10 : 60
  const names = Object.keys(o.nodes)
  const react = (n) => n === 'death' || o.nodes[n].next === '@previous' || n === 'pain'
  const lanes = []
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
  for (const L of lanes) {
    if (!L.label) continue
    const y = pos[L.ids[0]]?.y ?? Y0
    world.insertBefore(el('div', { class: 'me-band', style: `left:8px;top:${y - TOP}px;width:${w - 16}px;height:${GY - 12}px` }), svg)
    world.appendChild(el('span', { class: 'me-lane', style: `left:${X0}px;top:${y - TOP + 8}px`, text: L.label }))
  }

  const pairs = new Set()
  for (const n of names) { for (const t of o.nodes[n].transitions ?? []) pairs.add(`${n}>${t.to}`); if (o.nodes[n].next) pairs.add(`${n}>${o.nodes[n].next}`) }
  let up = 0
  let down = 0
  const P = (p) => `${p[0].toFixed(1)} ${p[1].toFixed(1)}`
  const cub = (p0, p1, p2, p3) => ({ d: `M ${P(p0)} C ${P(p1)}, ${P(p2)}, ${P(p3)}`, mx: 0.125 * p0[0] + 0.375 * p1[0] + 0.375 * p2[0] + 0.125 * p3[0], my: 0.125 * p0[1] + 0.375 * p1[1] + 0.375 * p2[1] + 0.125 * p3[1], pts: [p0, p1, p2, p3] })
  // A point a way along a curve: where its label may go when the middle is taken.
  const at = ([p0, p1, p2, p3], t) => { const u = 1 - t; const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t]; return [0, 1].map((j) => k[0] * p0[j] + k[1] * p1[j] + k[2] * p2[j] + k[3] * p3[j]) }
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
    const along = [0.36, 0.64, 0.24, 0.76].map((t) => at(r.pts, t).map((v, j) => Math.round(v + (j ? r.oy ?? 0 : 0))))
    world.appendChild(el('button', { class: 'me-lab', 'data-live': live ? '1' : '0', 'data-along': JSON.stringify(along), style: `left:${r.mx.toFixed(0)}px;top:${(r.my + (r.oy ?? 0)).toFixed(0)}px`, text: label, onclick: pick }))
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
  spreadLabels(world, 0)
  const v = o.view
  const apply = () => { world.style.transform = `translate(${v.x}px,${v.y}px) scale(${v.z})` }
  // On opening, as large as fits but not below what can be read; the fit button fits everything.
  const fit = (least = 0.25) => {
    const r = box.getBoundingClientRect()
    if (!r.width) return
    v.z = Math.max(least, Math.min(1, (r.width - 20) / w, (r.height - 20) / h)); v.x = 10; v.y = 10; apply()
  }
  if (v.fit !== false) requestAnimationFrame(() => fit(0.6))
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

/**
 * The edges' labels, moved so none covers another or a lane's title: two
 * rules between the same states share a path, and a label at its middle
 * would sit on the other's. A label moves along its own edge first, so it
 * stays by its arrow. Measured once the board is drawn.
 */
function spreadLabels (world, tries) {
  if (!world.isConnected || !world.offsetWidth) { if (tries < 30) requestAnimationFrame(() => spreadLabels(world, tries + 1)); return }
  const box = (e, centred) => {
    const x = parseFloat(e.style.left) || 0, y = parseFloat(e.style.top) || 0, w = e.offsetWidth, h = e.offsetHeight
    return centred ? { x, y, w, h } : { x: x + w / 2, y: y + h / 2, w, h }
  }
  const lanes = [...world.querySelectorAll('.me-lane')].map((e) => box(e, false))
  const nodes = [...world.querySelectorAll('.me-node')].map((e) => box(e, false))
  const placed = []
  const over = (L, y, list) => list.some((p) => Math.abs(p.x - L.x) * 2 < p.w + L.w + 4 && Math.abs(p.y - y) * 2 < p.h + L.h + 2)
  const labs = [...world.querySelectorAll('.me-lab')].map((b) => ({ b, ...box(b, true) })).sort((p, q) => p.y - q.y || p.x - q.x)
  for (const L of labs) {
    // Where it is, if that is free (a label between two states may straddle
    // them); else further along its own edge; else a step above or below.
    // A moved label goes on no state.
    if (over(L, L.y, [...placed, ...lanes])) {
      const all = [...placed, ...lanes, ...nodes]
      const step = L.h + 3
      const spots = [...JSON.parse(L.b.dataset.along ?? '[]'), ...[1, -1, 2, -2].map((k) => [L.x, L.y + k * step])]
      const free = spots.find(([x, y]) => !over({ ...L, x }, y, all))
      if (free) [L.x, L.y] = free
    }
    placed.push(L)
    L.b.style.left = `${Math.round(L.x)}px`
    L.b.style.top = `${Math.round(L.y)}px`
  }
}
