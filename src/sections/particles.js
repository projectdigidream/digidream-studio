//
// Particle kinds: the module's bursts and tracers, each played while it is edited.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { el, button, row, text, muted, number, ask, confirmDialog } from '../ui.js'
import { newVfx, vfxRows, VfxPreview } from '../vfxlib.js'

let S = null

// --- particles: the kinds, and one that plays while it is edited -----------------------
//
// A burst is entirely the client's, so there is nothing to bake and nothing to
// ask a server: the preview integrates the very functions the game does.
const vfxPreview = new VfxPreview()

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
      button('✕', async () => {
        if (!await confirmDialog(`delete particle kind ${v.id}? Anything naming it draws nothing.`)) return
        S.module.vfx = S.module.vfx.filter((x) => x !== v)
        S.moduleChanged(); showVfx()
      }, 'st-danger')
    ])
    r.addEventListener('click', (e) => { if (e.target.tagName !== 'BUTTON') showVfx(v.id) })
    return r
  })
  const body = [...rows]
  if (!list.length) body.push(muted('No kinds of your own yet. The app serves some already -- blood, a muzzle flash, an explosion -- and anything that names a number can use those.'))
  if (open) {
    body.push(el('div', { class: 'st-section-head', text: `✦ kind ${open.id}` }))
    body.push(vfxPreview.canvas)
    body.push(...vfxRows(open, { changed: () => { S.moduleChanged(); vfxPreview.show(open, { radius: open.attach ? 0 : 0.4 }); showVfx(open.id) } }))
    vfxPreview.show(open, { radius: open.attach ? 0 : 0.4 })
  }
  body.push(el('div', { class: 'st-row' }, [
    button('+ particles', () => { const v = newVfx(S.module, 'particles', [...(S.servedVfx?.keys() ?? [])]); S.moduleChanged(); showVfx(v.id) }),
    button('+ tracer', () => { const v = newVfx(S.module, 'tracer', [...(S.servedVfx?.keys() ?? [])]); S.moduleChanged(); showVfx(v.id) })
  ]))
  body.push(muted('A kind is a number anything can name: a swing\'s hit, a hitscan\'s, a blast, a monster\'s blood, a missile on impact. None of it crosses the wire -- the server says an effect happened and the client draws it.'))
  S.ui.showSheet('Particles', body.filter(Boolean), () => vfxPreview.stop())
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.vfxPreview = vfxPreview
  S.showVfx = S.sectionAlias('particles', showVfx)
}
