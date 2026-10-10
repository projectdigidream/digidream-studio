//
// CONTROLS: how the module is played, and the keys of its own (docs/KEYS.md).
//
// The control mapper: the module's own actions -- reload, map, inventory --
// each a name graphs answer to (when_button_pressed ...), a keyboard key set
// by pressing it (or chosen, where there is no keyboard), and a touch button
// if it has a label. Beside them, the engine's own buttons and the keys the
// client gives them, so a clash is seen before it is played. Written as
// module.txt `key` lines (keys_emit.js); a touch button is placed in Screens.
//
import { el, button, muted, select, confirmDialog, withIcon, icon } from '../ui.js'
import { ENGINE_BUTTONS, MAX_KEYS, CODES, keyLabel, cleanKeyName, cleanLabel, keyProblems } from '../keys_emit.js'
import { graphsOf } from '../graphs_emit.js'

let S = null
let capturing = null       // the key whose code the next key press sets
let stopCapture = null

/** A key's name renamed in every graph that names it (a button node's `button`). */
function renameInGraphs (from, to) {
  let n = 0
  const owners = [S.module, ...Object.values(S.docs)]
  for (const o of owners) {
    for (const [, g] of graphsOf(o)) for (const node of g.nodes ?? []) if (node.button === from) { node.button = to; n++ }
  }
  return n
}

/** Wait for one key press, and give its code (Escape cancels). */
function capture (k) {
  stopCapture?.()
  capturing = k
  const on = (e) => {
    // Gone to another page while waiting: let the key be, and stop waiting.
    if (S.route() !== 'controls') { stopCapture(); return }
    if (['ShiftRight', 'ControlRight', 'AltRight', 'MetaLeft', 'MetaRight'].includes(e.code)) return
    e.preventDefault(); e.stopPropagation()
    stopCapture()
    if (e.code !== 'Escape') { k.code = e.code; S.moduleChanged() }
    showControls()
  }
  addEventListener('keydown', on, true)
  stopCapture = () => { removeEventListener('keydown', on, true); capturing = null; stopCapture = null }
  showControls()
}

function keyCard (k, i, problems) {
  const keys = S.module.keys
  const mine = problems.filter((p) => p.key === k.name)
  const waiting = capturing === k
  // One line a key: its number, name, key (pressed or chosen), touch label, order.
  const nameIn = el('input', { type: 'text', class: 'sd-key-name', value: k.name ?? '', placeholder: 'name', 'data-key-name': k.name ?? '' })
  nameIn.addEventListener('change', () => {
    const n = cleanKeyName(nameIn.value)
    if (!n || n === k.name) { showControls(); return }
    const moved = k.name ? renameInGraphs(k.name, n) : 0
    k.name = n
    S.moduleChanged()
    if (moved) S.status(`renamed in ${moved} graph node${moved > 1 ? 's' : ''} too`, 'ok')
    showControls()
  })
  const pressBtn = button(waiting ? 'press a key… (Esc)' : withIcon('action.keyboard', keyLabel(k.code)), () => (waiting ? (stopCapture?.(), showControls()) : capture(k)), waiting ? 'sd-key-wait' : 'sd-key')
  pressBtn.dataset.keyPress = k.name ?? String(i)
  const pick = select('', k.code ?? '', [['', '(choose)'], ...(k.code && !CODES.includes(k.code) ? [[k.code, keyLabel(k.code)]] : []), ...CODES.map((c) => [c, keyLabel(c)])], (v) => { k.code = v || undefined; S.moduleChanged(); showControls() }).lastChild
  pick.dataset.keyCode = k.name ?? String(i)
  pick.classList.add('sd-key-pick')
  const touchIn = el('input', { type: 'text', class: 'sd-key-touch', value: k.touch ?? '', placeholder: 'no touch button', maxlength: 12, 'data-key-touch': k.name ?? '', title: 'the touch button\'s label; empty for none' })
  touchIn.addEventListener('change', () => { const l = cleanLabel(touchIn.value); if (l) k.touch = l; else delete k.touch; S.moduleChanged(); showControls() })
  return el('div', { class: 'st-card sd-key-card', 'data-key': k.name ?? '' }, [
    el('div', { class: 'st-row sd-key-line' }, [
      el('span', { class: 'st-entry sd-key-n', text: `${i + 1}` }),
      nameIn, pressBtn, pick,
      el('span', { class: 'sd-key-tl', text: '👆' }), touchIn,
      i > 0 ? button(withIcon('action.up'), () => { [keys[i - 1], keys[i]] = [keys[i], keys[i - 1]]; S.moduleChanged(); showControls() }) : null,
      button(withIcon('action.close'), async () => {
        if (k.name && !await confirmDialog(`delete the key ${k.name}? A graph that answers it will be told it is gone.`)) return
        keys.splice(i, 1); S.moduleChanged(); showControls()
      }, 'st-danger')
    ].filter(Boolean)),
    ...mine.map((p) => el('div', { class: p.level === 'warn' ? 'sd-key-warn' : 'st-danger', text: p.msg }))
  ])
}

function showControls () {
  const m = S.module
  m.keys ??= []
  const problems = keyProblems(m)
  const rows = [
    select('how it is played', m.controls ?? 'platformer', [['platformer', 'platformer — third person'], ['fps', 'first person (fps)']],
           (v) => { m.controls = v; S.moduleChanged(); showControls() }),
    el('div', { class: 'st-section-head', text: `⌨ the module's own keys (${m.keys.length} of ${MAX_KEYS})` }),
    muted('Actions of the module\'s own -- reload, map, inventory. A graph answers one by its name (when button pressed, released, held). Each is a key -- tap ⌨ and press it, or choose it -- and, with a 👆 label, a button on a touch screen. The order is the bit order scripts see. Players cannot rebind them yet: this list is the key map.')
  ]
  m.keys.forEach((k, i) => rows.push(keyCard(k, i, problems)))
  for (const p of problems.filter((x) => x.key === null)) rows.push(el('div', { class: 'st-danger', text: p.msg }))
  rows.push(el('div', { class: 'st-row' }, [
    button('+ key', () => {
      const taken = new Set(m.keys.map((k) => k.name))
      let n = 'action'; let i = 2
      while (taken.has(n)) n = `action${i++}`
      const k = { name: n }
      m.keys.push(k)
      S.moduleChanged()
      capture(k)
    }),
    m.keys.some((k) => k.touch) ? button('place the touch buttons…', () => S.showScreensTouch?.() ?? S.go('screens')) : null
  ].filter(Boolean)))
  if (m.keys.length >= MAX_KEYS) rows.push(muted(`A game has ${MAX_KEYS} keys of its own at most.`))
  rows.push(el('div', { class: 'st-section-head' }, withIcon('section.controls', 'the engine\'s buttons')),
    muted('Every module has these. A graph names them as its own keys (jump, use, attack ...); their keys are the engine\'s, and a module key on one of them fires both.'))
  for (const b of ENGINE_BUTTONS) {
    rows.push(el('div', { class: 'st-row sd-engine-btn', 'data-engine-button': b.name }, [
      el('span', { class: 'st-entry', text: b.name }),
      el('span', { style: 'flex:1 1 auto', class: 'st-muted', text: b.keys.length ? b.keys.map((c) => (c.startsWith('mouse') ? c : keyLabel(c))).join(' or ') : 'no key -- by touch or script' }),
      el('span', { class: 'st-muted', text: b.touch ? `touch: ${b.touch}` : '' })
    ]))
  }
  rows.push(muted('Also the engine\'s: W A S D and the arrows move, Q and R turn the camera, 1-9 choose a weapon, F2 a new game, F5 save, F9 load.'))
  S.ui.showSheet('Controls', rows)
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showControls = S.sectionAlias('controls', showControls)
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.sd-key-line{display:flex;flex-wrap:wrap;align-items:center;gap:6px}
.sd-key-n{min-width:18px}
.sd-key-name{flex:1 1 110px;min-width:90px}
.sd-key-pick{flex:0 1 110px;min-width:70px}
.sd-key-touch{flex:0 1 120px;min-width:90px}
.sd-key-tl{opacity:.7}
.sd-key-card .sd-key,.sd-key-card .sd-key-wait{min-width:72px;font-weight:700}
.sd-key-wait{border-color:var(--dnp-color-select) !important;color:var(--dnp-color-select) !important;animation:sd-key-blink 1s steps(2) infinite}
@keyframes sd-key-blink{50%{opacity:.55}}
.sd-key-warn{color:var(--dnp-color-warn);font-size:12px}
` }))
