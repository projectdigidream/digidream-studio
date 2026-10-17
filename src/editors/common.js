//
// What the monster and weapon editors share: sentences with their fields in
// them, the grouped chooser, rule cards, a state's timeline of steps.
//
// Everything here edits the module document in place (the engine's own shape,
// docs/MOBS.md and docs/WEAPONS.md) and calls `ctx.changed()`; the editor
// re-renders. The words come from phrases.js; anything the phrasebook lacks is
// edited with argform.js, so no part of the vocabulary is out of reach.
//
import { el, button, select, muted, withIcon } from '../ui.js'
import { shown, store, sentence, groupsOf, groupsWithMore, condKey, actKey, newCond, newAct, secs, ticksOf, shortOf } from '../phrases.js'
import { argFields } from '../argform.js'

export const CSS = `
.me{display:flex;flex-direction:column;min-height:0;height:100%;background:var(--dnp-color-bg-app);color:var(--dnp-color-text-primary);font-family:var(--dnp-font-ui);font-size:14px;line-height:1.4}
.me[hidden]{display:none}
.me{position:relative}
.me-toast{position:absolute;left:50%;bottom:16px;transform:translateX(-50%);max-width:min(640px,90%);z-index:60;background:var(--dnp-color-bg-panel);color:var(--dnp-color-text-primary);border:1px solid var(--dnp-color-line-strong);border-radius:10px;padding:10px 14px;font-size:13px;box-shadow:0 10px 30px var(--dnp-color-scrim)}
.me-toast[data-level="warn"]{border-color:var(--dnp-color-warn)}
.me-pvctl{display:flex;flex-direction:column;gap:5px}
.me-copt{white-space:normal;max-width:100%}
.me-chooser{max-width:100%;box-sizing:border-box;overflow:hidden}
.me-tl{margin:0 8px}
.me-ev{min-height:1.4em}
.me-top{display:flex;align-items:center;gap:6px;padding:4px 10px;border-bottom:1px solid var(--dnp-color-line-main);min-height:48px;flex:0 0 auto;flex-wrap:wrap}
.me-name{display:flex;align-items:center;gap:8px;font-weight:600;font-size:16px;cursor:pointer;padding:4px 8px;border-radius:var(--dnp-radius-control);background:transparent;border:0;color:inherit}
.me-name .me-thumb{width:28px;height:34px}
.me-tabs{display:flex;gap:0;align-self:stretch}
.me-tabs button{border:0;border-bottom:2px solid transparent;border-radius:0;background:transparent;color:var(--dnp-color-text-secondary);padding:0 10px;min-height:44px}
.me-tabs button[data-on="1"]{color:var(--dnp-color-text-primary);border-bottom-color:var(--dnp-color-accent);font-weight:600}
.me-grow{flex:1 1 auto}
.me-body{flex:1 1 auto;display:flex;min-height:0;position:relative}
.me-center{flex:1 1 auto;min-width:0;overflow:auto;padding:10px 12px;display:flex;flex-direction:column;gap:8px}
.me-center>*{flex-shrink:0}
.me-side{flex:0 0 400px;border-left:1px solid var(--dnp-color-line-main);display:flex;flex-direction:column;min-height:0;position:relative;overflow:hidden}
.me-side[data-gone="1"]{display:none}
.me-side[data-mini="1"]{flex-basis:56px}
.me-ins{flex:1 1 auto;min-height:0;overflow-y:auto;overflow-x:hidden;padding:8px 10px 24px;display:flex;flex-direction:column;gap:8px}
.me-panel{background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:12px;padding:10px 12px;display:flex;flex-direction:column;gap:6px}
.me-h{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dnp-color-text-secondary);margin-top:6px}
.me-h.first{margin-top:0}
.me-muted{color:var(--dnp-color-text-secondary);font-size:12px}
.me-warn{color:var(--dnp-color-warn);font-size:12px;overflow-wrap:anywhere}
.me-card{background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:12px;padding:8px 12px 10px;display:flex;flex-direction:column;gap:5px}
.me-card[data-on="1"]{border-color:var(--dnp-color-select);box-shadow:0 0 0 1px var(--dnp-color-select) inset}
.me-card[data-run="1"]{background:var(--dnp-color-bg-hover)}
.me-chead{display:flex;align-items:center;gap:8px}
.me-cname{font-weight:600;font-size:15px;font-family:var(--dnp-font-mono);background:transparent;border:0;color:inherit;padding:4px 0;cursor:pointer}
.me-line{display:flex;flex-wrap:wrap;align-items:baseline;gap:3px 6px;color:var(--dnp-color-text-secondary)}
.me-tok{border:0;border-radius:6px;padding:2px 8px;background:var(--dnp-color-bg-sunken);color:var(--dnp-color-text-primary);font:inherit;font-weight:500;cursor:pointer}
.me-tok.to{font-family:var(--dnp-font-mono)}
.me-tok.bad{color:var(--dnp-color-error)}
.me-rule{display:flex;flex-wrap:wrap;gap:3px 6px;align-items:center;padding:6px 8px;border-radius:9px;background:var(--dnp-color-bg-sunken)}
.me-rule[data-live="1"]{box-shadow:0 0 0 1px var(--dnp-color-warn) inset}
.me-rule[data-todo="1"]{box-shadow:0 0 0 1px var(--dnp-color-warn) inset}
.me-chip{border:0;border-radius:999px;padding:2px 10px;background:var(--dnp-color-bg-sunken);color:var(--dnp-color-text-primary);font:inherit;font-size:12px;cursor:pointer;text-align:left}
.me-chip[data-k="hit"]{color:var(--dnp-color-warn)}
.me-rcard{background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:6px}
.me-rcard[data-live="1"]{border-color:var(--dnp-color-warn)}
.me-rcard[data-todo="1"]{border-color:var(--dnp-color-warn);border-style:dashed}
.me-rhead{display:flex;align-items:center;gap:6px;flex-wrap:wrap;justify-content:flex-start}
.me-rnum{font-size:11px;font-weight:600;min-width:20px;height:20px;border-radius:999px;display:inline-flex;align-items:center;justify-content:center;background:var(--dnp-color-bg-sunken)}
.me-crow{display:flex;align-items:center;gap:6px;padding:2px 0 2px 4px}
.me-ctext{flex:1 1 auto;display:flex;flex-wrap:wrap;align-items:center;gap:4px 6px;min-width:0}
.me-ctext input{width:64px;text-align:right}
.me-ctext input.me-name-in{width:110px;text-align:left;font-family:var(--dnp-font-mono)}
.me-ctext select{max-width:170px}
.me-x{background:transparent;border:0;color:var(--dnp-color-text-secondary);cursor:pointer;font-size:16px;padding:2px 6px}
.me-lnk{background:transparent;border:0;color:var(--dnp-color-accent);cursor:pointer;padding:6px 4px;font:inherit;font-size:13px}
.me-lnk.danger{color:var(--dnp-color-error)}
.me-chooser{background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-strong);border-radius:10px;padding:8px 10px;display:flex;flex-direction:column;gap:8px}
.me-cgl{font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dnp-color-text-secondary)}
.me-copts{display:flex;flex-wrap:wrap;gap:6px}
.me-ctabs{display:flex;flex-wrap:wrap;gap:4px}
.me-ctab{border:1px solid var(--dnp-color-line-main);border-radius:999px;min-height:32px;padding:2px 11px;background:transparent;color:var(--dnp-color-text-secondary);font:inherit;font-size:12px;cursor:pointer}
.me-ctab[data-on="1"]{border-color:var(--dnp-color-select);color:var(--dnp-color-text-primary);font-weight:600;box-shadow:0 0 0 1px var(--dnp-color-select) inset}
.me-cfind{max-width:220px}
.me-chooser[data-tabs="1"]:not([data-q="1"]) .me-cgl{display:none}
.me-cgroup[hidden],.me-copt[hidden]{display:none}
.me-copt{border:0;border-radius:8px;padding:6px 10px;background:var(--dnp-color-bg-sunken);color:var(--dnp-color-text-primary);font:inherit;font-size:13px;cursor:pointer;text-align:left}
.me-tl{position:relative;height:44px;background:var(--dnp-color-bg-sunken);border-radius:9px;overflow:hidden}
.me-mk{position:absolute;top:5px;width:16px;height:16px;margin-left:-8px;border-radius:50%;border:0;padding:0;cursor:pointer;background:var(--dnp-color-accent)}
.me-mk[data-row="1"]{top:24px}
.me-mk[data-k="hit"]{background:var(--dnp-color-warn)}
.me-mk[data-k="clock"]{background:var(--dnp-color-tone-if)}
.me-mk[data-k="turn"]{background:var(--dnp-color-ok)}
.me-mk[data-on="1"]{box-shadow:0 0 0 3px var(--dnp-color-text-primary)}
.me-head{position:absolute;top:0;bottom:0;width:2px;background:var(--dnp-color-text-primary)}
.me-tlscale{display:flex;justify-content:space-between;font-size:11px;color:var(--dnp-color-text-secondary)}
.me-srow{display:flex;gap:8px;align-items:baseline;padding:7px 8px;border-radius:9px;cursor:pointer;font:inherit;font-size:13px;background:transparent;border:0;color:inherit;text-align:left}
.me-srow[data-on="1"]{background:var(--dnp-color-bg-hover)}
.me-srow .me-at{font-family:var(--dnp-font-mono);min-width:52px}
.me-step{background:var(--dnp-color-bg-sunken);border:1px solid var(--dnp-color-line-strong);border-radius:9px;padding:6px 10px;display:flex;flex-direction:column;gap:6px}
.me-sheet{position:absolute;left:6px;right:6px;bottom:6px;max-height:90%;overflow-y:auto;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-strong);border-radius:14px;padding:8px 10px 12px;z-index:20;display:flex;flex-direction:column;gap:8px}
.me-form{display:flex;flex-direction:column;gap:6px}
.me-frow{display:flex;flex-direction:column;gap:3px}
.me-frow.inline{flex-direction:row;align-items:center;justify-content:space-between;min-height:40px;gap:8px}
.me-frow label{font-size:13px;color:var(--dnp-color-text-secondary)}
.me-numw{display:flex;align-items:center;gap:6px}
.me-numw input{max-width:110px}
.me-ov{display:grid;grid-template-columns:repeat(auto-fill,minmax(300px,1fr));gap:10px;align-items:start}
.me-gal{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px}
.me-gcard{background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);border-radius:12px;padding:10px;display:flex;flex-direction:column;gap:4px;cursor:pointer;text-align:left;color:inherit;font:inherit}
.me-gcard[data-on="1"]{border-color:var(--dnp-color-select)}
.me-row{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
.me-badge{font-size:11px;border:1px solid var(--dnp-color-line-strong);border-radius:999px;padding:0 7px}
.me-phh{border-top:1px solid var(--dnp-color-line-main);padding-top:10px;margin-top:6px}
.me-phname{font:600 13px var(--dnp-font-ui);letter-spacing:.05em;text-transform:uppercase;background:transparent;border:1px solid transparent;color:inherit;border-radius:6px;padding:2px 6px;width:260px;max-width:100%}
.me-phname:hover{border-color:var(--dnp-color-line-main)}
.me-pv{padding:8px 10px;display:flex;flex-direction:column;gap:6px;border-bottom:1px solid var(--dnp-color-line-main);flex:0 0 auto}
.me-pvbar{display:flex !important;align-items:center;justify-content:flex-start !important;gap:8px;min-height:40px;background:transparent !important;border:0 !important;box-shadow:none !important;color:inherit;font:inherit;cursor:pointer;flex:1 1 auto;text-align:left}
.me-fp{position:relative;width:100%}
.me-fp .st-view-canvas{display:block;width:100%;max-width:none}
.me-fp .me-over{position:absolute;inset:0;width:100%;height:100%;background:transparent}
.me-stagewrap{position:relative;width:100%}
.me-stage{position:relative;width:100%;height:150px;background:var(--dnp-color-bg-sunken);border-radius:9px;overflow:hidden;display:block}
.me-now{font-size:12px;color:var(--dnp-color-text-secondary)}
.me-vars{font-size:12px;color:var(--dnp-color-text-secondary);font-family:var(--dnp-font-mono)}
.me-seen{min-width:5.6em}
.me-hp input{width:110px}
.me-side[data-compact="1"]{flex-basis:540px}
.me-side[data-compact="1"] .me-pv{gap:4px;padding:6px 10px}
.me-side[data-compact="1"] .me-stage{height:112px}
.me-side[data-compact="1"] .me-pvctl{gap:4px}
.me-side[data-compact="1"] .me-pvctl button{min-height:32px !important;height:32px;padding-top:0;padding-bottom:0}
.me-side[data-compact="1"] .me-ins .me-frow:has(> label):not(.inline){display:grid;grid-template-columns:110px minmax(0,1fr);align-items:center;column-gap:10px;row-gap:2px}
.me-side[data-compact="1"] .me-ins .me-frow:has(> label):not(.inline)>.me-muted{grid-column:2}
.me-side[data-compact="1"] .me-ins .me-numw input{max-width:160px}
.me-side[data-compact="1"] .me-vars:not([data-open="1"]){white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
.me-ctl{display:flex;gap:5px;align-items:center;flex-wrap:wrap}
.me-strip{display:flex;flex-direction:column;align-items:center;gap:6px;padding:6px 0}
.me-vlab{writing-mode:vertical-rl;font-size:12px}
.me-board{position:relative;flex:0 0 auto;height:max(320px,calc(100vh - 210px));overflow:hidden;touch-action:none;border-radius:12px;border:1px solid var(--dnp-color-line-main);
  background-color:var(--cv-graph-board);background-image:radial-gradient(var(--cv-graph-dot-fill) 1px,transparent 1px);background-size:var(--cv-graph-dot-size) var(--cv-graph-dot-size)}
.me-world{position:absolute;left:0;top:0;transform-origin:0 0}
.me-node{position:absolute;box-sizing:border-box;border:var(--cv-graph-state-width) solid var(--cv-graph-state);border-radius:var(--cv-graph-state-radius);background:var(--cv-graph-state-fill);
  padding:6px 9px;cursor:pointer;display:flex;flex-direction:column;gap:1px;font:inherit;font-size:11px;color:inherit;text-align:left}
.me-node b{font-family:var(--dnp-font-mono);font-size:13px}
.me-node[data-on="1"]{border-color:var(--cv-graph-state-selected);box-shadow:0 0 0 var(--cv-graph-state-selected-width) var(--cv-graph-state-selected) inset}
.me-node[data-run="1"]{background:var(--dnp-color-bg-hover)}
.me-node[data-react="1"]{border-style:dashed}
.me-edges{position:absolute;left:0;top:0;overflow:visible;pointer-events:none}
.me-edge{fill:none;stroke:var(--cv-graph-edge-transition);stroke-width:1.8}
.me-edge[data-k="then"]{stroke:var(--cv-graph-edge-next);stroke-dasharray:6 5}
.me-edge[data-k="any"]{stroke-dasharray:2 4}
.me-edge[data-live="1"]{stroke:var(--dnp-color-warn);stroke-width:2.6}
.me-lab{position:absolute;transform:translate(-50%,-50%);font-size:11px;min-height:0 !important;height:auto;line-height:1.35;background:var(--cv-graph-board);border:1px solid var(--dnp-color-line-main);border-radius:6px;padding:1px 6px;white-space:nowrap;cursor:pointer;color:inherit;font-family:inherit}
.me-lab[data-live="1"]{border-color:var(--dnp-color-warn)}
/* a phone: labels a finger can read and hit, the hit wider than the label */
.me-board[data-phone="1"] .me-lab{font-size:14px;padding:2px 8px}
.me-board[data-phone="1"] .me-lab::after{content:'';position:absolute;inset:-8px -4px}
.me-band{position:absolute;border-radius:14px;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-main);opacity:.55;pointer-events:none}
.me-lane{position:absolute;font-size:11px;letter-spacing:.06em;text-transform:uppercase;color:var(--dnp-color-text-secondary);white-space:nowrap}
.me-zoom{position:absolute;right:8px;bottom:8px;z-index:3;display:flex;gap:4px}
.me-menu{position:absolute;right:8px;top:48px;z-index:30;background:var(--dnp-color-bg-panel);border:1px solid var(--dnp-color-line-strong);border-radius:12px;padding:6px;width:210px;display:flex;flex-direction:column}
.me-menu button{background:transparent;border:0;color:inherit;text-align:left;padding:10px 12px;border-radius:8px;font:inherit;cursor:pointer}
.me-lookrow{display:flex;gap:10px;align-items:flex-start}
.me-lookside{flex:0 0 320px;display:flex;flex-direction:column;gap:6px;position:sticky;top:0}
.me-lookmain{flex:1 1 auto;min-width:0;display:flex;flex-direction:column;gap:8px}
.me-ins>.me-row:first-child{flex-wrap:nowrap}
.me-ins>.me-row:first-child input{min-width:0;flex:1 1 120px;max-width:200px}
.me-vbtn{border:1px solid var(--dnp-color-line-main);border-radius:8px;background:var(--dnp-color-bg-sunken);color:inherit;padding:6px 10px;font:inherit;font-size:13px;cursor:pointer}
.me-vbtn[data-on="1"]{border-color:var(--dnp-color-select);font-weight:600}
@media (max-height:560px) and (orientation:landscape){
  .me-copt{padding:4px 8px;font-size:12px;min-height:36px !important;height:auto}
  .me-ctab{min-height:30px !important;height:30px;padding:0 9px !important;font-size:12px}
  .me-ctabs{gap:3px}
  /* the keyboard would cover half the screen: the groups are the way in */
  .me-cfind{display:none}
  .me-chooser>.me-row:first-child>span.me-muted{display:none}
  .me-copts{gap:4px}
  .me-side{flex-basis:300px}
  .me-side[data-wide="1"]{flex-basis:350px}
  .me-lookside{flex-basis:250px}
  .me-stage{height:112px}
  .me-tabs button{padding:0 8px;font-size:13px}
}
`

/**
 * A message on the editor's own page: the studio's status strip is hidden while
 * a section page is open, so a message sent only there is never seen.
 */
export function toast (root, msg, level = 'ok') {
  if (!root?.isConnected || !msg) return
  root.querySelector(':scope > .me-toast')?.remove()
  const t = el('div', { class: 'me-toast', role: 'status', 'data-level': level, text: msg })
  root.appendChild(t)
  setTimeout(() => t.remove(), Math.min(9000, 2500 + msg.length * 45))
}

/**
 * Keeps the focus where the person was taking it across a re-render.
 *
 * A field's change event fires as the finger (or Tab) leaves it, BEFORE the
 * next field takes the focus; the editor re-renders right then, and the field
 * that was about to be focused is gone -- what was typed into it went nowhere.
 * So where the focus is going is noted first (a press on a field, which comes
 * before the old one's change; or Tab, the next field in order), and after a
 * render the new copy of that field is focused.
 */
const FIELDS = 'input,select,textarea'
const keyOf = (root, e) => {
  if (!e) return null
  const label = e.getAttribute('aria-label') ?? e.id ?? ''
  const same = [...root.querySelectorAll(FIELDS)].filter((x) => (x.getAttribute('aria-label') ?? x.id ?? '') === label)
  return { label, i: same.indexOf(e), tag: e.tagName }
}
export function trackFocus (root) {
  root.addEventListener('pointerdown', (ev) => { root._next = keyOf(root, ev.target.closest?.(FIELDS)) }, true)
  root.addEventListener('keydown', (ev) => {
    if (ev.key !== 'Tab') return
    const all = [...root.querySelectorAll(FIELDS)].filter((x) => x.offsetParent !== null)
    const i = all.indexOf(document.activeElement)
    root._next = i >= 0 ? keyOf(root, all[i + (ev.shiftKey ? -1 : 1)]) : null
  }, true)
}
export function restoreFocus (root) {
  const key = root._next
  root._next = null
  if (!key || key.i < 0) return
  requestAnimationFrame(() => {
    if (root.contains(document.activeElement) && document.activeElement.matches(FIELDS)) return
    const same = [...root.querySelectorAll(FIELDS)].filter((x) => (x.getAttribute('aria-label') ?? x.id ?? '') === key.label)
    const b = same[key.i]
    if (b && b.tagName === key.tag) { b.focus(); try { b.select?.() } catch { /* not a text field */ } }
  })
}

let injected = false
export function injectCss () {
  if (injected) return
  injected = true
  document.head.appendChild(el('style', { 'data-me': '1', text: CSS }))
}

// ---- a sentence with its fields ----------------------------------------------------------

/**
 * The parts of a phrase as elements: words, and fields that write into `obj`.
 * @param ctx  { vars: [names], mobs: [names], states: [names], missiles: [names], fx: [[id, label]],
 *               soundField(label, value, onChange), changed(), live: bool (fields, or read-only words) }
 */
export function sentenceEl (table, obj, ctx, key = null) {
  const k = key ?? ('cond' in obj ? condKey(table, obj) : actKey(table, obj))
  const ph = table[k]
  const out = el('div', { class: 'me-ctext' })
  if (!ph) {
    // the phrasebook has no words for it: the vocabulary's own form
    out.append(el('span', { class: 'me-muted', text: sentence(table, obj, k) }))
    if (ctx.live && ctx.spec) for (const r of argFields(ctx.spec.args ?? [], obj, { ...ctx.argCtx, onChange: () => ctx.changed() }, ['cond', 'action', 'at', 'negate'], k)) out.append(r)
    return out
  }
  for (const part of ph.p) {
    const [kind, arg] = part
    if (kind === 't') { out.append(el('span', { text: arg })); continue }
    if (!ctx.live) { const v = sentence(table, { ...obj }, k); out.replaceChildren(el('span', { text: v })); return out }
    const set = (v) => { store(part, obj, v); ctx.changed() }
    const v = shown(part, obj)
    if (kind === 'n') {
      const i = el('input', { type: 'text', inputmode: 'decimal', value: v ?? '', 'aria-label': arg })
      i.addEventListener('change', () => { if (i.value.trim() !== '' && Number.isFinite(Number(i.value))) set(Number(i.value)) })
      i.addEventListener('focus', () => i.select())
      const unit = part[2] === 'mps' ? 'm/s' : part[2] === 's' ? 's' : part[2] === 'm' ? 'm' : part[2] === 'n+1' ? '' : part[2]
      out.append(el('span', { class: 'me-numw' }, [i, unit ? el('span', { class: 'me-muted', text: unit }) : null]))
    } else if (kind === 'var' || kind === 'text') {
      const i = el('input', { type: 'text', class: 'me-name-in', value: v ?? '', 'aria-label': `${arg} (a name)` })
      if (kind === 'var' && ctx.vars?.length) { const id = `me-vars-${Math.random().toString(36).slice(2)}`; i.setAttribute('list', id); out.append(el('datalist', { id }, ctx.vars.map((n) => el('option', { value: n })))) }
      i.addEventListener('change', () => set(i.value.trim().replace(/[^A-Za-z0-9_]/g, '_')))
      out.append(i)
    } else if (kind === 'bool') {
      const c = el('input', { type: 'checkbox', 'aria-label': part[2] })
      c.checked = !!v
      c.addEventListener('change', () => set(c.checked))
      out.append(el('label', { class: 'me-muted' }, [c, ` ${part[2]}`]))
    } else if (kind === 'sound') {
      const r = ctx.soundField('', v ?? '', (nv) => set(nv))
      r.classList.add('me-inline')
      out.append(r)
    } else {
      const opts = kind === 'mob' ? [['any', 'any kind'], ...(ctx.mobs ?? []).map((n) => [n, n])]
        : kind === 'prop' ? [['', 'any prop'], ...(ctx.props ?? []).map((n) => [n, n])]
        : kind === 'state' ? (ctx.states ?? []).map((n) => [n, n])
          : kind === 'missile' ? (ctx.missiles ?? []).map((n) => [n, n])
            : kind === 'fx' ? (ctx.fx ?? []).map(([id, l]) => [String(id), l])
            : kind === 'fx?' ? [['', part[3]], ...(ctx.fx ?? []).map(([id, l]) => [String(id), l])]
              : kind === 'enum' ? part[2].map((x) => [x, x])
                : kind === 'bool' ? [['', `—`], ['1', part[2]]] : []
      const cur = kind === 'bool' ? (v ? '1' : '') : String(v ?? '')
      if (cur && !opts.some(([x]) => x === cur)) opts.unshift([cur, `${cur} (missing)`])
      const s = el('select', { 'aria-label': arg }, opts.map(([x, l]) => el('option', { value: x, text: l })))
      s.value = cur
      s.addEventListener('change', () => set(kind === 'fx' || (kind === 'fx?' && s.value !== '') ? Number(s.value) : kind === 'bool' ? s.value === '1' : s.value))
      out.append(s)
    }
  }
  return out
}

// ---- the chooser ---------------------------------------------------------------------------

/** The grouped list of what can be added. `groups` from phrases.groupsOf. */
// The group each chooser was last picked from, so the next pick starts there.
const lastGroup = new Map()

/**
 * The grouped chooser: one group shown at a time, picked from a row of chips
 * (a phone held in one hand gets a short list, not a long scroll), and a
 * "find" box over all of them when there are many. Every option stays in the
 * page; the groups not shown are hidden.
 */
export function chooser (title, note, groups, onPick, onCancel) {
  let on = groups.some((g) => g.label === lastGroup.get(title)) ? lastGroup.get(title) : groups[0]?.label
  const tabbed = groups.length > 1
  const secs = groups.map((g) => el('div', { class: 'me-cgroup', 'data-group': g.label }, [el('div', { class: 'me-cgl', text: g.label }),
    el('div', { class: 'me-copts' }, g.opts.map((o) => el('button', { class: 'me-copt', text: o.label, onclick: () => { lastGroup.set(title, g.label); onPick(o.key) } })))]))
  const total = groups.reduce((n, g) => n + g.opts.length, 0)
  const find = total > 12 ? el('input', { type: 'search', class: 'me-cfind', placeholder: `find among ${total}…`, 'aria-label': `Find: ${title}`, autocomplete: 'off' }) : null
  const tabs = tabbed ? groups.map((g) => el('button', { class: 'me-ctab', text: g.label, onclick: () => { on = g.label; lastGroup.set(title, on); if (find) find.value = ''; show() } })) : []
  const none = el('span', { class: 'me-muted', text: 'nothing called that' })
  const box = el('div', { class: 'me-chooser', 'data-tabs': tabbed ? '1' : '0' }, [
    el('div', { class: 'me-row' }, [el('b', { class: 'me-muted', text: title }), note ? el('span', { class: 'me-muted', text: note }) : null, el('span', { class: 'me-grow' }),
      el('button', { class: 'me-lnk', text: 'cancel', onclick: onCancel })]),
    tabbed ? el('div', { class: 'me-ctabs' }, tabs) : null,
    find, ...secs, none
  ])
  function show () {
    const q = find?.value.trim().toLowerCase() ?? ''
    box.dataset.q = q ? '1' : '0'
    groups.forEach((g, i) => {
      let any = false
      for (const b of secs[i].querySelectorAll('.me-copt')) { const hit = !q || b.textContent.toLowerCase().includes(q); b.hidden = !hit; any ||= hit }
      secs[i].hidden = q ? !any : tabbed && g.label !== on
      if (tabs[i]) tabs[i].dataset.on = !q && g.label === on ? '1' : '0'
    })
    none.hidden = !q || secs.some((x) => !x.hidden)
  }
  find?.addEventListener('input', show)
  show()
  return box
}

// ---- rule cards ------------------------------------------------------------------------------

/**
 * One card per rule of a list (a state's transitions, its end branches, or the rules for any state).
 * @param o  { list, table, ctx, targets: [[value, label]], key: 'rules' | 'ends' | 'any', canOnce,
 *             live: index of the rule firing now, picking: index whose chooser is open, setPicking(i|null),
 *             warn(rule) -> string | null }
 */
export function ruleCards (o) {
  const { list, table, ctx } = o
  return list.map((r, ri) => {
    const todo = !r.to || !(r.when ?? []).length
    const to = el('select', { 'aria-label': 'goes to', id: `to-${o.id}-${ri}` }, [el('option', { value: '', text: '(choose a state)' }), ...o.targets.map(([v, l]) => el('option', { value: v, text: l }))])
    to.value = r.to ?? ''
    to.addEventListener('change', () => { r.to = to.value; ctx.changed() })
    const swap = (d) => { const j = ri + d; [list[ri], list[j]] = [list[j], list[ri]]; o.setPicking(null); ctx.changed() }
    const head = el('div', { class: 'me-rhead' }, [
      el('span', { class: 'me-rnum', text: String(ri + 1) }),
      el('span', { class: 'me-muted', text: 'go to' }), to,
      ri > 0 ? el('button', { class: 'me-x', 'aria-label': 'Check this rule earlier', icon: 'action.up', onclick: () => swap(-1) }) : null,
      ri < list.length - 1 ? el('button', { class: 'me-x', 'aria-label': 'Check this rule later', icon: 'action.down', onclick: () => swap(1) }) : null,
      o.canOnce ? el('label', { class: 'me-muted' }, [(() => { const c = el('input', { type: 'checkbox' }); c.checked = !!r.once; c.addEventListener('change', () => { r.once = c.checked || undefined; ctx.changed() }); return c })(), ' only once']) : null,
      o.fired?.(ri) ? el('span', { class: 'me-badge', text: 'fired in this run' }) : null,
      el('span', { class: 'me-grow' }),
      el('button', { class: 'me-lnk danger', text: 'remove', onclick: () => { list.splice(ri, 1); o.setPicking(null); ctx.changed() } })
    ])
    const when = r.when ?? (r.when = [])
    const whenWord = !when.length ? `${o.key === 'ends' ? 'if' : 'when'}: nothing yet. Until it has a condition this ${o.key === 'ends' ? 'branch' : 'rule'} is never taken.`
      : o.key === 'ends' ? (when.length > 1 ? 'as it ends, if all of these hold:' : 'as it ends, if:') : when.length > 1 ? 'when all of these hold:' : 'when:'
    const w = o.warn?.(r)
    // the preview has no other monsters (they are a level's business): say so where a rule leans on them
    const crowd = (r.when ?? []).some((c) => ['prop_within', 'ally_in_front', 'hurt_by_mob'].includes(c.cond))
    const own = !crowd && (r.when ?? []).some((c) => ['mob_within', 'count_within'].includes(c.cond))
    const conds = when.map((c, i) => el('div', { class: 'me-crow' }, [
      sentenceEl(table, c, { ...ctx, live: true, spec: ctx.condSpec?.(c.cond) }),
      el('button', { class: 'me-x', 'aria-label': 'Remove this condition', icon: 'action.close', onclick: () => { when.splice(i, 1); ctx.changed() } })
    ]))
    const picking = o.picking === ri
    return el('div', { class: 'me-rcard', 'data-live': o.live === ri ? '1' : '0', 'data-todo': todo ? '1' : '0', 'data-rule': String(ri) }, [
      head,
      el('span', { class: 'me-muted', text: whenWord }),
      w ? el('span', { class: 'me-warn', icon: 'status.warning', text: ` ${w}` }) : null,
      crowd ? el('span', { class: 'me-muted', text: 'The preview has no other monsters or props: it reads this as nobody being near. Check it in a level.' }) : null,
      own ? el('span', { class: 'me-muted', text: 'In the preview the only monsters near it are the ones it summons, standing where they landed. Others are checked in a level.' }) : null,
      ...conds,
      picking
        ? chooser('Add a condition', 'every condition must hold', groupsWithMore(table, 'cond', ctx.moreConds), (key) => { when.push(newCond(table, key)); o.setPicking(null); ctx.changed() }, () => o.setPicking(null))
        : el('button', { class: 'me-lnk', text: '+ add a condition', onclick: () => o.setPicking(ri) })
    ])
  })
}

// ---- a state's steps -----------------------------------------------------------------------

/**
 * The timeline, the list of steps, the one being edited and the add-step chooser.
 * @param o  { node, table, ctx, length: ticks shown, head: ticks | null, sel: index | null, setSel(i|null),
 *             picking: bool, setPicking(bool), addAt: ticks, actCtx: { missile, sound, state }, onMissile(name) }
 */
export function stepsBlock (o) {
  const { node, table, ctx } = o
  const seq = node.sequence ?? []
  const len = Math.max(1, o.length)
  // THE RUNTIME WALKS A SEQUENCE IN ITS ORDER (mobs.lua run_due): a step runs
  // once its `at` has passed AND every step before it has run, so a step at 0
  // listed after one at 12 runs at 12. The list is in that order, and says
  // when each step really runs.
  const when = []
  for (let i = 0; i < seq.length; i++) when.push(Math.max(Number(seq[i].at ?? 0), i ? when[i - 1] : 0))
  const late = seq.map((p, i) => when[i] > Number(p.at ?? 0))
  const rows = {}
  const marks = seq.map((p, i) => {
    const r = rows[when[i]] = (rows[when[i]] ?? -1) + 1
    return el('button', { class: 'me-mk', 'data-k': kindOf(table, p), 'data-row': r ? '1' : '0', 'data-on': o.sel === i ? '1' : '0', style: `left:${Math.min(100, (when[i] / len) * 100)}%`,
      'aria-label': `${secs(when[i])} s: ${sentence(table, p)}`, onclick: () => o.setSel(i) })
  })
  const tl = el('div', { class: 'me-tl' }, [...marks, o.head !== null ? el('div', { class: 'me-head', style: `left:${Math.min(100, (o.head / len) * 100)}%` }) : null])
  const list = seq.map((p, i) => el('button', { class: 'me-srow', 'data-on': o.sel === i ? '1' : '0', 'data-k': kindOf(table, p), onclick: () => o.setSel(i) },
    [el('span', { class: 'me-at', text: `${secs(p.at)} s` }), el('span', { text: sentence(table, p) }), late[i] ? el('span', { class: 'me-warn', text: `(runs at ${secs(when[i])} s, after the step before it)` }) : null]))
  if (late.some(Boolean)) {
    list.push(el('div', { class: 'me-row' }, [el('span', { class: 'me-warn', icon: 'status.warning', text: ' Steps run in their order here: one listed after a later one waits for it.' }),
      el('button', { class: 'me-lnk', text: 'put them in time order', onclick: () => { const keep = seq[o.sel]; seq.sort((a, b) => (a.at ?? 0) - (b.at ?? 0)); o.setSel(keep ? seq.indexOf(keep) : null); ctx.changed() } })]))
  }
  return {
    timeline: [tl, el('div', { class: 'me-tlscale' }, [el('span', { text: '0 s' }), el('span', { text: `${secs(len)} s` })])],
    list,
    editor: o.sel !== null && seq[o.sel] ? stepEditor(seq, o.sel, table, ctx, o) : null,
    adder: o.picking
      ? chooser('Add a step', 'what happens, at that moment of the state', groupsWithMore(table, 'act', ctx.moreActs, o.actCtx), (key) => {
        const p = newAct(table, key, o.addAt, o.actCtx)
        node.sequence = seq
        insertByTime(seq, p)
        o.setPicking(false)
        o.setSel(seq.indexOf(p))
        ctx.changed()
      }, () => o.setPicking(false))
      : null
  }
}
/** Puts a step after the last one due no later than it, leaving the others where they are. */
function insertByTime (seq, p) {
  let i = seq.length
  while (i > 0 && Number(seq[i - 1].at ?? 0) > Number(p.at ?? 0)) i--
  seq.splice(i, 0, p)
}
const kindOf = (table, p) => table[actKey(table, p)]?.k ?? 'turn'

function stepEditor (seq, i, table, ctx, o) {
  const p = seq[i]
  const at = el('input', { type: 'text', inputmode: 'decimal', value: String(secs(p.at)), 'aria-label': 'at, in seconds' })
  at.addEventListener('change', () => { const t = ticksOf(at.value); if (t !== undefined) { p.at = t; seq.splice(seq.indexOf(p), 1); insertByTime(seq, p); o.setSel(seq.indexOf(p)); ctx.changed() } })
  const mis = p.kind ?? p.missile
  return el('div', { class: 'me-step' }, [
    el('div', { class: 'me-rhead' }, [el('span', { class: 'me-muted', text: 'at' }), at, el('span', { class: 'me-muted', text: 's' }),
      mis && o.onMissile ? el('button', { class: 'me-lnk', text: `edit ${mis}`, onclick: () => o.onMissile(mis) }) : null,
      el('span', { class: 'me-grow' }),
      el('button', { class: 'me-lnk danger', text: 'remove step', onclick: () => { seq.splice(i, 1); o.setSel(null); ctx.changed() } })]),
    sentenceEl(table, p, { ...ctx, live: true, spec: ctx.actSpec?.(p.action) })
  ])
}

// ---- forms ------------------------------------------------------------------------------------

/** A labelled number field kept in range; out of range says so and keeps the nearest. */
export function numField (label, value, unit, apply, { hint = '', lo = null, hi = null, placeholder = '', say = null } = {}) {
  const i = el('input', { type: 'text', inputmode: 'decimal', value: value ?? '', placeholder, 'aria-label': label })
  i.addEventListener('focus', () => i.select())
  i.addEventListener('change', () => {
    if (i.value.trim() === '') { apply(null); return }
    let n = Number(i.value)
    if (!Number.isFinite(n)) return
    if (lo !== null && (n < lo || n > hi)) { const c = Math.max(lo, Math.min(hi, n)); say?.(`${label}: ${lo} to ${hi}. Kept at ${c}.`); n = c }
    apply(n)
  })
  return el('div', { class: 'me-frow' }, [el('label', { text: label }), el('span', { class: 'me-numw' }, [i, unit ? el('span', { class: 'me-muted', text: unit }) : null]), hint ? el('span', { class: 'me-muted', text: hint }) : null])
}
export function checkField (label, value, apply, hint = '') {
  const c = el('input', { type: 'checkbox' })
  c.checked = !!value
  c.addEventListener('change', () => apply(c.checked))
  return el('div', { class: 'me-frow' }, [el('div', { class: 'me-frow inline' }, [el('label', { text: label }), c]), hint ? el('span', { class: 'me-muted', text: hint }) : null])
}
export function selectField (label, value, opts, apply, hint = '') {
  const s = el('select', { 'aria-label': label }, opts.map(([v, l]) => el('option', { value: v, text: l })))
  s.value = value ?? ''
  s.addEventListener('change', () => apply(s.value))
  return el('div', { class: 'me-frow' }, [el('label', { text: label }), s, hint ? el('span', { class: 'me-muted', text: hint }) : null])
}

export { shortOf, sentence, secs, ticksOf, button, select, muted, withIcon }
