//
// Particle kinds: the module's bursts and tracers, each played while it is edited.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { el, button, row, text, muted, number, ask, confirmDialog, withIcon, icon } from '../ui.js'
import { newVfx, vfxRows, VfxPreview } from '../vfxlib.js'

let S = null

// --- particles: the kinds, and one that plays while it is edited -----------------------
//
// A burst is entirely the client's, so there is nothing to bake and nothing to
// ask a server: the preview integrates the very functions the game does.
const vfxPreview = new VfxPreview()
// A particle drawn as a picture: the module's own single pictures, then its textures,
// as the client looks one up (sprites/NAME.png, then textures/NAME.png).
function particlePictures () {
  const a = S.rec?.assets ?? {}
  const pics = Object.keys(a).filter((p) => /^sprites\/[^/]+\.png$/.test(p) && !a[p.replace(/\.png$/, '.json')]).map((p) => p.slice(8, -4))
  return [...new Set([...pics, ...Object.keys(S.module?.textures ?? {})])].sort()
}
vfxPreview.resolveImage = (name) => S?.spriteUrls?.get(name) ?? S?.imageUrls?.get(name) ?? null

function showVfx (openId = null) {
  S.module.vfx ??= []
  const list = [...S.module.vfx].sort((a, b) => a.id - b.id)
  const open = openId != null ? S.module.vfx.find((v) => v.id === openId) : null
  const rows = list.map((v) => {
    const r = el('div', { class: 'st-trow', 'data-vfx': String(v.id), 'data-on': open === v ? '1' : '0' }, [
      el('div', { class: 'st-trow-text' }, [
        el('div', { class: 'st-trow-name', text: `${v.id} · ${v.type === 'tracer' ? 'tracer' : 'particles'}` }),
        el('div', { class: 'st-muted', text: v.type === 'tracer'
          ? `${v.life ?? 0.12}s, ${v.width ?? 0.04} wide`
          : `${v.attach ? `${v.rate ?? 40}/s attached` : `${v.count ?? 0} specks`} · ${v.life ?? 0.5}s · ${v.blend === 'alpha' ? 'alpha' : 'additive'}` })
      ]),
      button(withIcon('action.close'), async () => {
        if (!await confirmDialog(`delete particle kind ${v.id}? Anything naming it draws nothing.`)) return
        S.module.vfx = S.module.vfx.filter((x) => x !== v)
        S.moduleChanged(); showVfx()
      }, 'st-danger')
    ])
    r.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') showVfx(v.id) })
    return r
  })
  const kinds = el('div', { class: 'sd-vfx-kinds' }, [...rows])
  if (!list.length) kinds.append(muted('No kinds of your own yet. The app serves some already -- blood, a muzzle flash, an explosion -- and anything that names a number can use those.'))
  kinds.append(el('div', { class: 'st-row' }, [
    button('+ particles', () => { const v = newVfx(S.module, 'particles', [...(S.servedVfx?.keys() ?? [])]); S.moduleChanged(); showVfx(v.id) }),
    button('+ tracer', () => { const v = newVfx(S.module, 'tracer', [...(S.servedVfx?.keys() ?? [])]); S.moduleChanged(); showVfx(v.id) })
  ]))
  // LANDSCAPE: the preview and the kinds on the left, held in place, the form
  // on the right scrolling past them. PORTRAIT: one column -- the kinds, the
  // preview held at the top while the form scrolls under it (the wrappers are
  // display:contents there, so the preview sticks to the page itself).
  const side = el('div', { class: 'sd-vfx-side' })
  const form = el('div', { class: 'sd-vfx-form' })
  if (open) {
    side.append(el('div', { class: 'sd-vfx-view' }, [vfxPreview.canvas]))
    form.append(el('div', { class: 'st-section-head', text: `✦ kind ${open.id} · ${open.type === 'tracer' ? 'tracer' : 'particles'}` }),
      ...vfxRows(open, { changed: () => { S.moduleChanged(); vfxPreview.show(open, { radius: open.attach ? 0 : 0.4 }); showVfx(open.id) }, pictures: () => particlePictures() }))
    vfxPreview.show(open, { radius: open.attach ? 0 : 0.4 })
  }
  side.append(kinds)
  form.append(muted('A kind is a number anything can name: a swing\'s hit, a hitscan\'s, a blast, a monster\'s blood, a missile on impact. None of it crosses the wire -- the server says an effect happened and the client draws it.'))
  const body = [el('div', { class: 'sd-vfx', 'data-open': open ? '1' : '0' }, [side, form])]
  S.ui.showSheet('Particles', body.filter(Boolean), () => vfxPreview.stop())
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  document.head.appendChild(el('style', { text: STYLE }))
  S = s
  S.vfxPreview = vfxPreview
  vfxPreview.skin = () => S.skin
  S.onSkin?.(() => vfxPreview.reskin())
  S.showVfx = S.sectionAlias('particles', showVfx)
}

const STYLE = `
.sd-vfx,.sd-vfx-side,.sd-vfx-form{display:contents}
.sd-vfx-kinds{display:flex;flex-direction:column;gap:6px;order:-1}
.sd-vfx-view{position:sticky;top:0;z-index:3;background:var(--dnp-color-bg-app);padding-bottom:4px}
.st-vfx-wrap{position:relative;width:100%}
.sd-body.st-page .st-vfx-canvas,.st-vfx-canvas{display:block;width:100%;max-width:none;height:auto;aspect-ratio:16/10;max-height:38vh;cursor:grab;touch-action:none}
.st-vfx-label{position:absolute;left:8px;bottom:6px;font-weight:600;font-size:11px;font-family:var(--dnp-font-ui);color:var(--dnp-color-text-secondary);text-shadow:0 1px 2px var(--dnp-color-text-inverse);pointer-events:none}
.st-vfx-tools{position:absolute;right:6px;top:6px;display:flex;gap:6px}
.st-vfx-tools button{min-width:36px;height:32px;padding:0 6px}
@media (orientation:landscape) and (min-width:640px){
  .sd-vfx[data-open="1"]{display:grid;grid-template-columns:minmax(0,1.15fr) minmax(260px,1fr);gap:12px;align-items:start}
  .sd-vfx[data-open="1"] .sd-vfx-side{display:flex;flex-direction:column;gap:8px;position:sticky;top:0;max-height:calc(100dvh - 72px);overflow:auto;-webkit-overflow-scrolling:touch}
  .sd-vfx[data-open="1"] .sd-vfx-form{display:flex;flex-direction:column;gap:6px;min-width:0}
  .sd-vfx[data-open="1"] .sd-vfx-view{position:static;padding:0}
  .sd-vfx[data-open="1"] .st-vfx-canvas{max-height:calc(100dvh - 150px)}
  .sd-vfx[data-open="1"] .sd-vfx-kinds{order:0}
}
`
