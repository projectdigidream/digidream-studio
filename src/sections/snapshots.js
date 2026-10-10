//
// SNAPSHOTS: the module as it was, to go back to (snapshots.js).
//
// A list, newest first: when, why, how many maps. Each can be restored whole,
// or one map at a time from what it holds -- a map changed since, or deleted.
// Restoring takes a snapshot of the module as it is first, so a restore is
// never a step that cannot be taken back.
//
import { el, button, muted, ask, confirmDialog } from '../ui.js'
import { when, compareMaps, missingAssets, digest } from '../snapshots.js'

let S = null
let open = null          // the snapshot whose maps are listed

const kb = (n) => (n > 1024 * 1024 ? `${(n / 1048576).toFixed(1)} MB` : `${Math.max(1, Math.round(n / 1024))} KB`)

async function showSnapshots () {
  if (!S.snaps) {
    S.ui.showSheet('Snapshots', [muted('Snapshots need the browser\'s storage (IndexedDB), which this page could not open.')])
    return
  }
  const list = await S.snaps.list(S.rec.id)
  if (!S.ui.pageTitles?.test('Snapshots')) return
  const now = digest(S.module, S.docs)
  const rows = [
    muted('Copies of this module kept on this device: when it is opened, every few minutes while it is edited, and before anything that replaces work (a pack imported over it, a map deleted, a restore). The newest 20 are kept, and one a day for two weeks. Imported pictures, sounds and fonts are not copied: a restore says if one it names is gone.'),
    el('div', { class: 'st-row' }, [
      button('＋ snapshot now', async () => {
        const label = await ask('A name for it (optional)', '')
        if (label === null) return
        S.save.flush?.()
        const snap = await S.snapshot(label.trim() || 'by hand', { force: true })
        S.status(snap ? 'snapshot taken' : 'could not take a snapshot', snap ? 'ok' : 'warn')
        showSnapshots()
      })
    ]),
    el('div', { class: 'st-section-head', text: `🕘 ${list.length} snapshot${list.length === 1 ? '' : 's'} of ${S.module.name || S.module.id}` })
  ]
  if (!list.length) rows.push(muted('None yet. One is taken the next time the module is opened, or now with the button above.'))
  for (const s of list) {
    const same = s.digest === now
    const card = el('div', { class: 'st-card sd-snap', 'data-snap': s.key, 'data-on': open === s.key ? '1' : '0' }, [
      el('div', { class: 'st-row' }, [
        el('div', { class: 'st-trow-text', style: 'flex:1 1 auto' }, [
          el('div', { class: 'st-trow-name', text: `${when(s.at)} · ${s.reason}` }),
          el('div', { class: 'st-muted', text: `${s.maps.length} map${s.maps.length === 1 ? '' : 's'}: ${s.maps.join(', ')} · ${kb(s.size)}${same ? ' · the same as now' : ''}` })
        ]),
        button(open === s.key ? '▴ maps' : '▾ maps', () => { open = open === s.key ? null : s.key; showSnapshots() }),
        same ? null : button('restore', () => restoreAll(s)),
        button('✕', async () => { if (await confirmDialog(`forget the snapshot from ${when(s.at)}?`)) { await S.snaps.remove(s.key); showSnapshots() } }, 'st-danger')
      ].filter(Boolean))
    ])
    if (open === s.key) card.appendChild(await mapRows(s))
    rows.push(card)
  }
  S.ui.showSheet('Snapshots', rows)
}

/** A snapshot's maps against the module now, each changed or deleted one restorable alone. */
async function mapRows (s) {
  const snap = await S.snaps.get(s.key)
  const box = el('div', { class: 'sd-snap-maps' })
  for (const m of compareMaps(snap.data.docs, S.docs)) {
    const says = { same: 'the same as now', changed: 'changed since', gone: 'deleted since', new: 'made since -- not in this snapshot' }[m.state]
    box.appendChild(el('div', { class: 'st-row', 'data-snap-map': m.name, 'data-state': m.state }, [
      el('span', { style: 'flex:1 1 auto', text: `🗺 ${m.name} -- ${says}` }),
      m.state === 'changed' || m.state === 'gone' ? button(`restore ${m.name}`, () => restoreMap(s, snap, m.name)) : null
    ].filter(Boolean)))
  }
  return box
}

async function restoreAll (s) {
  if (!await confirmDialog(`restore the whole module as it was ${when(s.at)}? It is snapshotted as it is now first, so this can be taken back.`)) return
  const snap = await S.snaps.get(s.key)
  S.save.flush?.()
  await S.snapshot(`before restoring ${when(s.at)}`, { force: true })
  S.rec.module = JSON.parse(JSON.stringify(snap.data.module))
  S.rec.docs = JSON.parse(JSON.stringify(snap.data.docs))
  await finish(snap, `restored the module as it was ${when(s.at)}`)
}

async function restoreMap (s, snap, name) {
  if (!await confirmDialog(`restore map ${name} as it was ${when(s.at)}? The module is snapshotted as it is now first.`)) return
  S.save.flush?.()
  await S.snapshot(`before restoring ${name} from ${when(s.at)}`, { force: true })
  S.rec.docs[name] = JSON.parse(JSON.stringify(snap.data.docs[name]))
  await finish(snap, `restored ${name} as it was ${when(s.at)}`)
}

/** Reopen the module from what was restored, and say what it names that is gone. */
async function finish (snap, said) {
  await S.store.save(S.rec)
  await S.openModule(S.rec.id, { show: false })
  const gone = missingAssets(snap, S.rec.assets)
  S.status(gone.length ? `${said} -- it names ${gone.length} file${gone.length > 1 ? 's' : ''} deleted since: ${gone.slice(0, 3).join(', ')}` : said, gone.length ? 'warn' : 'ok')
  showSnapshots()
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showSnapshots = S.sectionAlias('snapshots', showSnapshots)
}

document.head.appendChild(Object.assign(document.createElement('style'), { textContent: `
.sd-snap[data-on="1"]{border-color:var(--dnp-color-accent)}
.sd-snap-maps{display:flex;flex-direction:column;gap:4px;margin-top:6px;padding-top:6px;border-top:1px solid var(--dnp-color-line-main)}
` }))
