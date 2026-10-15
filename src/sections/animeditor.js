//
// AN IMPORTED SHEET'S ANIMATIONS, on its card on the Sprites page: which
// animations it has, and for the one picked its name, fps, loop and frames --
// reordered, repeated, removed, added from any frame the sheet has -- with
// the animation playing beside them. The pixels are never touched: this
// edits the manifest (animedit.js), checked by the client's own parser before
// it is kept, and one undo step each.
//
import { el, button, muted, ask, number, toggle, text, confirmDialog, withIcon } from '../ui.js'
import { framePalette, renameAnim, setAnim, setFrames, addAnim, removeAnim, renameReferences, referencesTo } from '../animedit.js'
import { parseAtlas } from '/src/render/atlas.js'

const asText = async (b) => (typeof b === 'string' ? b : await b?.text?.())

/** The sheet's manifest as the module keeps it (assets/sprites/NAME.json), or null. */
export async function sheetManifest (S, n) {
  const t = await asText(S.rec.assets?.[`sprites/${n}.json`])
  try { return t ? JSON.parse(t) : null } catch { return null }
}

/** May its animations be edited here? An imported sheet the module owns; not one baked from a project (the bake would undo it). */
export const editableSheet = (S, n) => !!S.rec.assets?.[`sprites/${n}.json`] && !S.rec.assets?.[`sources/sprites/${n}.tsprite`]

// One frame of the sheet -- its front view, or the first it has -- drawn into `c`.
function drawFrame (c, img, atlas, views) {
  const key = views?.['1'] ?? Object.values(views ?? {})[0]
  const r = atlas?.frames?.[key]?.rect
  const g = c.getContext('2d')
  g.clearRect(0, 0, c.width, c.height)
  if (!r || !img?.naturalWidth) return
  g.imageSmoothingEnabled = false
  const k = Math.min((c.width - 6) / r.w, (c.height - 6) / r.h)
  g.drawImage(img, r.x, r.y, r.w, r.h, (c.width - r.w * k) / 2, (c.height - r.h * k) / 2, r.w * k, r.h * k)
}

let playTimer = null

/**
 * The editor, for sheet `n` and animation `pick` (its first when null).
 * `reopen(n, pick)` draws the Sprites page again on this sheet and animation.
 */
export async function animationEditor (S, n, pick, reopen) {
  clearInterval(playTimer)
  const m = await sheetManifest(S, n)
  if (!m) return null
  const src = S.sheets.get(n)
  const img = new Image()
  if (src?.imageUrl) img.src = src.imageUrl
  const anim = m.animations.find((a) => a.name === pick) ?? m.animations[0]
  const atlas = src?.atlas ?? null

  // Keep a changed manifest: checked by the client's parser, then the module's.
  const keep = async (next, said, again = anim.name) => {
    let parsed
    try { parsed = parseAtlas(next, n) } catch (e) { S.status(`not kept: ${e.message}`, 'error'); return }
    S.rec.assets[`sprites/${n}.json`] = new Blob([JSON.stringify(next)], { type: 'application/json' })
    S.sheets.set(n, { atlas: parsed, imageUrl: src?.imageUrl })
    S.module.sprites[n] = { ...(S.module.sprites[n] ?? {}), animations: next.animations.map((a) => a.name) }
    S.sprites?.forgetAll?.()
    S.moduleChanged()
    if (said) S.status(said, 'ok')
    reopen(n, again)
  }
  const tryKeep = (fn, said, again) => { try { return keep(fn(), said, again) } catch (e) { S.status(e.message, 'warn') } }

  const thumb = (views, size = 64) => {
    const c = el('canvas', { class: 'st-anim-frame', width: size, height: size })
    const go = () => drawFrame(c, img, atlas, views)
    if (img.complete) go(); else img.addEventListener('load', go, { once: true })
    return c
  }

  // The animations, one chip each.
  const chips = el('div', { class: 'st-row st-anim-list' }, m.animations.map((a) => el('button', {
    class: 'st-chip', 'data-anim': a.name, 'data-on': a === anim ? '1' : '0', text: `${a.name} · ${a.frames.length}`,
    onclick: () => reopen(n, a.name)
  })))

  // The picked one, playing.
  const play = el('canvas', { class: 'st-anim-play', width: 128, height: 128, 'data-playing': anim.name })
  let i = 0
  const step = () => { drawFrame(play, img, atlas, anim.frames[i % anim.frames.length]?.views); i = anim.loop === false ? Math.min(i + 1, anim.frames.length - 1) : i + 1 }
  const start = () => { step(); playTimer = setInterval(() => { if (!play.isConnected) { clearInterval(playTimer); return } step() }, 1000 / Math.max(1, anim.fps ?? 10)) }
  if (img.complete) start(); else img.addEventListener('load', start, { once: true })

  // Its frames, each with its moves.
  const frames = anim.frames.map((f) => ({ views: f.views }))
  const setTo = (list, said) => tryKeep(() => setFrames(m, anim.name, list), said)
  const strip = el('div', { class: 'st-anim-strip' }, frames.map((f, k) => el('div', { class: 'st-anim-cell', 'data-frame': k }, [
    thumb(f.views),
    el('div', { class: 'st-anim-moves' }, [
      el('button', { title: 'earlier', 'data-move': 'left', disabled: k === 0 ? '' : null, onclick: () => { const l = frames.slice(); [l[k - 1], l[k]] = [l[k], l[k - 1]]; setTo(l) } }, withIcon('action.left')),
      el('button', { title: 'later', 'data-move': 'right', disabled: k === frames.length - 1 ? '' : null, onclick: () => { const l = frames.slice(); [l[k + 1], l[k]] = [l[k], l[k + 1]]; setTo(l) } }, withIcon('action.right')),
      el('button', { title: 'repeat it', 'data-move': 'repeat', onclick: () => { const l = frames.slice(); l.splice(k + 1, 0, f); setTo(l) } }, withIcon('action.duplicate')),
      el('button', { title: 'remove it', 'data-move': 'remove', disabled: frames.length === 1 ? '' : null, onclick: () => { const l = frames.slice(); l.splice(k, 1); setTo(l) } }, withIcon('action.close'))
    ])
  ])))

  // Any frame of the sheet, to add at the end.
  const pal = framePalette(m)
  const picker = el('div', { class: 'st-anim-palette', hidden: '' }, [
    pal.length > 24 ? el('input', { class: 'st-chips-find', type: 'search', placeholder: `find among ${pal.length} frames (an animation's name)…`, oninput: (e) => { const q = e.target.value.trim().toLowerCase(); for (const b of picker.querySelectorAll('[data-pick]')) b.hidden = !!q && !b.dataset.from.toLowerCase().includes(q) } }) : null,
    el('div', { class: 'st-anim-grid' }, pal.map((p) => el('button', { class: 'st-anim-pick', 'data-pick': p.id, 'data-from': p.from, title: p.from, onclick: () => setTo([...frames, { views: p.views }], `${anim.name}: ${p.from} added`) }, [thumb(p.views, 48)])))
  ].filter(Boolean))

  return el('div', { class: 'st-anim-editor', 'data-anim-editor': n }, [
    el('div', { class: 'st-section-head' }, withIcon('section.sprites', 'animations')),
    chips,
    el('div', { class: 'st-anim-top' }, [
      play,
      el('div', { class: 'st-anim-fields' }, [
        text('name', anim.name, async (v) => {
          const to = String(v ?? '').trim()
          if (!to || to === anim.name) return
          let next
          try { next = renameAnim(m, anim.name, to) } catch (e) { S.status(e.message, 'warn'); reopen(n, anim.name); return }
          const moved = renameReferences(S.module, n, anim.name, to)
          await keep(next, `${anim.name} is ${to}${moved ? ` (${moved} reference${moved > 1 ? 's' : ''} followed)` : ''}`, to)
        }),
        number('fps', anim.fps ?? 10, { min: 1, max: 120, step: 1 }, (v) => tryKeep(() => setAnim(m, anim.name, { fps: v }))),
        toggle('loops', anim.loop !== false, (v) => tryKeep(() => setAnim(m, anim.name, { loop: v })))
      ])
    ]),
    muted(`${frames.length} frame${frames.length > 1 ? 's' : ''}: the arrows move one, the copy repeats it, the cross takes it out. The pictures are the sheet's; nothing here changes its pixels.`),
    strip,
    el('div', { class: 'st-row' }, [
      button('+ a frame…', () => { picker.hidden = !picker.hidden }),
      button('+ new animation', async () => {
        const raw = await ask('the new animation\'s name', `${anim.name}_2`)
        if (!raw) return
        // It starts as the one shown, to change from there.
        tryKeep(() => addAnim(m, raw.trim(), frames, { fps: anim.fps ?? 10, loop: anim.loop !== false }), `${raw.trim()}: a new animation`, raw.trim())
      }),
      button('delete it', async () => {
        const uses = referencesTo(S.module, n, anim.name)
        if (!await confirmDialog(`Delete the animation ${anim.name}?${uses.length ? ` It is used by ${uses.join(', ')}, which would then name nothing.` : ''} Undo brings it back.`)) return
        tryKeep(() => removeAnim(m, anim.name), `${anim.name} deleted`, null)
      }, 'st-danger')
    ]),
    picker
  ])
}

export const ANIM_CSS = `
.st-anim-editor{display:flex;flex-direction:column;gap:8px;margin-top:8px}
.st-anim-list{flex-wrap:wrap}
.st-anim-top{display:flex;gap:12px;align-items:flex-start;flex-wrap:wrap}
.st-anim-play{width:128px;height:128px;border:1px solid var(--dnp-color-line-main);border-radius:8px;background:var(--dnp-color-bg-sunken,var(--dnp-color-bg-app))}
.st-anim-fields{display:flex;flex-direction:column;gap:6px;flex:1 1 220px;min-width:0}
.st-anim-strip{display:flex;gap:6px;overflow-x:auto;padding-bottom:4px}
.st-anim-cell{display:flex;flex-direction:column;align-items:center;gap:2px;flex:none}
.st-anim-frame{width:64px;height:64px;border:1px solid var(--dnp-color-line-main);border-radius:6px;background:var(--dnp-color-bg-sunken,var(--dnp-color-bg-app))}
.st-anim-moves{display:flex;gap:2px}
.sd-body.st-page .st-anim-moves button{height:24px;min-height:0;min-width:0;padding:0 5px;font-size:11px}
.st-anim-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(52px,1fr));gap:4px;max-height:260px;overflow:auto}
.sd-body.st-page .st-anim-pick{height:auto;min-height:0;padding:1px}
.st-anim-pick canvas{width:48px;height:48px;display:block}
`
