//
// A PLUGIN EDITOR, OPEN: the page over the studio that holds it, and the way back.
//
// Opening a document in a plugin is a route, #/edit/<editor>~<kind>~<key>, so a
// reload lands back in the editor (and is offered the draft) and the phone's
// back button asks before it leaves. The studio draws the bar itself -- "← back
// to studio", which saves, and "discard" -- so every editor, whatever it is
// built with, leaves the same way:
//
//   Back     ask the editor for its document (request-save), and if it differs
//            from what it was given: check it and put it in the module (the
//            kind's write), one undo step (S.moduleChanged), draft cleared.
//            A refused document keeps the editor open with the reason.
//   Discard  confirmed when there is anything to lose; the draft goes too.
//
// Plugin SECTIONS (a page in the rail, like the packager) are iframes on a
// page too, with the same protocol but no document.
//
import { el, withIcon, icon } from '../ui.js'
import { handshake, sameBytes, sendSkin } from './protocol.js'
import { getDraft, putDraft, clearDraft } from './drafts.js'

const SEP = '~'
export const editArg = (editorKey, kind, key) => [editorKey, kind, key].map((s) => String(s).replaceAll(SEP, '')).join(SEP)
export function parseEditArg (arg) {
  const [editorKey, kind, ...rest] = String(arg ?? '').split(SEP)
  return editorKey && kind && rest.length ? { editorKey, kind, key: rest.join(SEP) } : null
}

/** Where the studio's own page for a kind is: the way back when there was no "from". */
const HOME_OF = { 'file:texture': 'textures', 'file:sfxproj': 'sounds', 'file:tsprite': 'sprites', 'file:msproj': 'music', 'record:script': 'scripts', 'record:mob': 'monsters' }

/** A question with several answers; resolves the chosen value, or null. */
export function choose (question, answers) {
  return new Promise((resolve) => {
    const dlg = el('dialog', { class: 'st-dialog sx-choose' }, [
      el('div', { text: question }),
      el('div', { class: 'st-row st-actions' }, answers.map((a) => el('button', { type: 'button', text: a.label, class: a.cls ?? '', 'data-answer': a.value, onclick: () => { dlg.close(); resolve(a.value) } })))
    ])
    dlg.addEventListener('cancel', () => resolve(null))
    dlg.addEventListener('close', () => dlg.remove())
    document.body.appendChild(dlg)
    dlg.showModal()
  })
}

// EVERY PLUGIN PAGE THAT IS RUNNING -- a service, a section on show, an
// editor -- with the plugin it belongs to: where the studio's events go
// (module-opened, module-saved, foreground), and how a page's `status` and
// `query` are answered as that plugin (S.pluginQuery checks its permissions).
const live = new Set()

/** Wire a page's port to the studio as plugin `plugin`; returns the detach. */
export function attachPort (S, port, { plugin, where = {} }) {
  const entry = { port, plugin }
  live.add(entry)
  port.on('query', async (m) => {
    try { port.send('query-result', { reqId: m.reqId, result: await S.pluginQuery(m.what, m.arg, { ...where, plugin }) }) } catch (e) { port.send('query-result', { reqId: m.reqId, error: String(e.message ?? e) }) }
  })
  // A badge on Home and the rail (a sync's state), for a module: { module, text, level }.
  port.on('status', (m) => S.pluginStatus?.(plugin, m))
  return () => live.delete(entry)
}

/** Tell every running plugin page: { t: 'event', name, ...data }. */
export function emitPluginEvent (name, data = {}) {
  for (const e of live) { try { e.port.send('event', { name, ...data }) } catch {} }
}

/** One document open in one plugin editor. */
class EditorSession {
  constructor (S, { editor, kind, key, from }) {
    this.S = S
    this.editor = editor
    this.kindId = kind
    this.kind = S.docKinds[kind]
    this.key = key
    this.from = from
    this.dirty = false
    this.done = false
    this.port = null
  }

  status (text, tone = '') { this.statusEl.textContent = text; this.statusEl.dataset.tone = tone }

  async open () {
    const S = this.S
    const { payload, name } = await this.kind.read(this.key)
    this.original = payload
    this.name = name
    let initial = payload
    const draft = await getDraft(S.module.id, this.kindId, this.key).catch(() => null)
    if (draft && !sameBytes(draft.payload, payload)) {
      const when = new Date(draft.at).toLocaleString()
      const a = await choose(`${name} has unsaved work from ${when}${draft.editor !== this.editor.key ? ` (made in ${draft.editor})` : ''}. Go on with it?`,
        [{ label: 'go on with it', value: 'resume' }, { label: 'start from the saved one', value: 'drop', cls: 'st-danger' }])
      if (a === 'resume') { initial = draft.payload; this.dirty = true } else await clearDraft(S.module.id, this.kindId, this.key)
    }
    this.statusEl = el('span', { class: 'sx-status' })
    this.iframe = el('iframe', { class: 'sx-frame', title: this.editor.label, allow: 'autoplay; clipboard-read; clipboard-write; fullscreen' })
    this.root = el('div', { class: 'sx-editor', 'data-editor': this.editor.key, 'data-kind': this.kindId }, [
      el('div', { class: 'sx-bar ui-topbar' }, [
        el('button', { class: 'sx-back ui-button ui-button--primary ui-button--small', 'data-action': 'editor-back', title: 'back to the studio, saving', onclick: () => this.finish(true) }, withIcon('action.back', 'studio')),
        el('span', { class: 'sx-title ui-topbar__title', text: `${this.editor.label} · ${this.kind.label} ${name}` }),
        this.statusEl,
        el('button', { class: 'st-danger sx-discard ui-button ui-button--danger ui-button--small ui-button--icon', 'data-action': 'editor-discard', title: 'discard: back without saving', onclick: () => this.finish(false) }, withIcon('action.close'))
      ]),
      this.iframe
    ])
    document.body.appendChild(this.root)
    const url = new URL(this.editor.url, location.href)
    url.searchParams.set('host', 'suite')
    url.searchParams.set('proto', '1')
    this.status('starting…')
    this.iframe.src = url.href
    this.hs = handshake(this.iframe.contentWindow, { origin: location.origin })
    try {
      const { port, ready } = await this.hs.done
      this.port = port
      this.ready = ready
    } catch (e) {
      this.status(`${this.editor.label} did not start: ${e.message}`, 'error')
      return
    }
    this.wire()
    this.port.send('init', {
      kind: this.kindId, key: this.key, name, payload: initial,
      caps: { hideOpen: true, hideSaveAs: true, hideLibrary: true, hideExport: true, fixedName: true }
    })
    this.offSkin = sendSkin(S, this.port, this.ready)
    this.status(this.dirty ? 'unsaved work, from a draft' : '')
    this.onHide = () => { if (document.visibilityState === 'hidden') this.keepDraft() }
    document.addEventListener('visibilitychange', this.onHide)
  }

  wire () {
    const S = this.S
    const p = this.port
    p.on('dirty', (m) => { this.dirty = !!m.dirty; this.status(this.dirty ? 'changed' : '') })
    p.on('edit', () => { this.dirty = true; this.status('changed') })
    p.on('draft', (m) => { this.dirty = true; putDraft(S.module.id, this.kindId, this.key, { editor: this.editor.key, payload: m.payload }).catch(() => {}) })
    p.on('close', (m) => this.finish(m.save !== false))
    p.on('error', (m) => this.status(m.message, 'error'))
    p.on('diagnostics', (m) => { const n = (m.items ?? []).length; this.status(n ? `${n} problem${n > 1 ? 's' : ''}` : '', n ? 'warn' : '') })
    this.detach = attachPort(S, p, { plugin: this.editor.plugin, where: { kind: this.kindId, key: this.key } })
  }

  /** The app is going to the background: what the editor has now, kept. */
  async keepDraft () {
    if (!this.port || this.done) return
    try {
      const m = await this.port.request('request-save', {}, { timeout: 1500 })
      if (!m.error && !sameBytes(m.payload, this.original)) await putDraft(this.S.module.id, this.kindId, this.key, { editor: this.editor.key, payload: m.payload })
    } catch {}
  }

  /** Save (Back) or discard; true when the editor may close. */
  async settle (save) {
    const S = this.S
    if (!this.port) return true                               // never started: nothing to lose
    if (!save) {
      if (this.dirty && !await choose(`Throw away the changes to ${this.name}?`, [{ label: 'keep editing', value: false }, { label: 'throw them away', value: true, cls: 'st-danger' }])) return false
      await clearDraft(S.module.id, this.kindId, this.key).catch(() => {})
      return true
    }
    this.status('saving…')
    let m
    try { m = await this.port.request('request-save', {}, { timeout: 20000 }) } catch (e) { this.status(`the editor did not hand its work back: ${e.message}`, 'error'); return false }
    if (m.error) { this.status(m.error, 'error'); return false }
    if (sameBytes(m.payload, this.original)) {
      await clearDraft(S.module.id, this.kindId, this.key).catch(() => {})
      return true
    }
    const r = await this.kind.write(this.key, m.payload)
    if (!r.ok) { this.status(`not saved: ${r.error}`, 'error'); return false }
    S.moduleChanged()
    this.port.send('saved')
    await clearDraft(S.module.id, this.kindId, this.key).catch(() => {})
    S.status(`${this.kind.label} ${r.said ?? this.name} saved from ${this.editor.label}`, 'ok')
    return true
  }

  async finish (save) {
    if (this.done || this.busy) return
    this.busy = true
    try {
      if (!await this.settle(save)) return
      this.done = true
      this.S.go(this.from?.id && this.from.id !== 'edit' ? this.from.id : HOME_OF[this.kindId] ?? 'home', this.from?.id !== 'edit' ? this.from?.arg ?? null : null)
    } finally { this.busy = false }
  }

  /** The router is leaving (the back button, a rail tap): ask, unless already settled. */
  async leave () {
    if (this.done) return true
    if (!this.port) return true
    const a = await choose(`Leave ${this.editor.label}?`, [
      { label: 'save and go', value: 'save' }, { label: 'discard', value: 'discard', cls: 'st-danger' }, { label: 'stay', value: 'stay' }])
    if (a === 'save') { const ok = await this.settle(true); this.done = ok; return ok }
    if (a === 'discard') { await clearDraft(this.S.module.id, this.kindId, this.key).catch(() => {}); this.done = true; return true }
    return false
  }

  close () {
    this.hs?.stop()
    this.detach?.()
    this.offSkin?.()
    try { this.port?.send('dispose') } catch {}
    this.port?.close()
    if (this.onHide) document.removeEventListener('visibilitychange', this.onHide)
    if (this.iframe) this.iframe.src = 'about:blank'
    this.root?.remove()
  }
}

/** A plugin section's route id: 'p-<plugin>-<section>'. */
export const sectionRoute = (plugin, section) => `p-${plugin}-${section}`.toLowerCase().replace(/[^a-z0-9_-]/g, '-')

/**
 * The rail pages plugins bring (a packager, say): an iframe filling the page,
 * on the same protocol as an editor but with no document -- it is told
 * `section-init` and asks what it needs (`query`). Registered at boot; a
 * plugin installed later calls this again (only the new ones are added).
 */
export function installPluginSections (S) {
  for (const { plugin, section, url } of S.plugins.sections()) {
    const id = sectionRoute(plugin, section.id)
    if (S.router.sections.has(id)) continue
    let hs = null, port = null, iframe = null, offSkin = null, detach = null
    S.router.register({
      id, label: section.label, icon: section.icon,
      mount: async (arg) => {
        const body = S.shell.openPage(section.label, { kind: 'window' })
        S.ui.layer.dataset.page = '1'
        S.ui.hideSheet()
        const u = new URL(url, location.href)
        u.searchParams.set('host', 'suite')
        u.searchParams.set('proto', '1')
        iframe = el('iframe', { class: 'sx-frame sx-section', title: section.label, src: u.href, allow: 'autoplay; clipboard-read; clipboard-write; fullscreen' })
        body.appendChild(iframe)
        hs = handshake(iframe.contentWindow, { origin: location.origin })
        let ready = null
        try { ({ port, ready } = await hs.done) } catch (e) { S.status(`${section.label} did not start: ${e.message}`, 'error'); return }
        detach = attachPort(S, port, { plugin, where: { section: id } })
        port.on('error', (m) => S.status(`${section.label}: ${m.message}`, 'error'))
        port.on('close', () => S.go('home'))
        port.send('section-init', { section: section.id, arg })
        offSkin = sendSkin(S, port, ready)
      },
      unmount: () => {
        hs?.stop()
        detach?.(); detach = null
        offSkin?.(); offSkin = null
        try { port?.send('dispose') } catch {}
        port?.close()
        if (iframe) iframe.src = 'about:blank'
        hs = port = iframe = null
      }
    })
  }
  S.shell?.drawRail?.()
}

/**
 * THE PLUGINS' SERVICES (plugin.json `services`, which need the `background`
 * permission): a hidden page each, started once at boot and never unmounted,
 * so a sync goes on whatever page is shown. Same protocol: it is told
 * `service-init`, asks with `query`, hears `event`s, sets badges with `status`.
 * A plugin installed later starts its services when this is called again.
 */
const started = new Map() // 'plugin/service' -> { iframe, port }
export function startPluginServices (S) {
  for (const { plugin, service, url } of S.plugins.services()) {
    const key = `${plugin}/${service.id}`
    if (started.has(key) || !S.plugins.can(plugin, 'background')) continue
    const u = new URL(url, location.href)
    u.searchParams.set('host', 'suite')
    u.searchParams.set('proto', '1')
    const iframe = el('iframe', { class: 'sx-service', title: `${plugin} (background)`, 'data-service': key, src: u.href, 'aria-hidden': 'true', tabindex: '-1' })
    document.body.appendChild(iframe)
    const rec = { iframe, port: null }
    started.set(key, rec)
    const hs = handshake(iframe.contentWindow, { origin: location.origin, timeout: 60000 })
    hs.done.then(({ port }) => {
      rec.port = port
      attachPort(S, port, { plugin, where: { service: service.id } })
      port.on('error', (m) => console.warn(`[studio] ${key}:`, m.message))
      port.send('service-init', { service: service.id, module: S.module?.id ?? null, rev: S.rec?.rev ?? 0 })
    }, (e) => console.warn(`[studio] ${key} did not start: ${e.message}`))
  }
}

/**
 * The plugin system in the studio: S.plugins (registry.js), S.docKinds
 * (kinds.js), S.openWith, the 'edit' route, and the plugins' rail sections.
 */
const CSS = `
.sx-editor{position:fixed;inset:0;z-index:150;display:flex;flex-direction:column;background:var(--dnp-color-bg-app)}
/* One slim line: the editor's own header sits under it, and on a phone held
   sideways every row of chrome is a slice of the editor. */
.sx-bar{display:flex;align-items:center;gap:8px;height:auto;padding:3px 6px;padding-top:max(3px,env(safe-area-inset-top));flex:0 0 auto;white-space:nowrap;font-size:12px}
.sx-bar .ui-button{height:26px;padding:0 10px;font-size:12px;flex:none}
.sx-bar .sx-discard{padding:0 9px}
@media (max-height:520px){.sx-bar{padding-top:max(2px,env(safe-area-inset-top));padding-bottom:2px}.sx-bar .ui-button{height:22px;padding:0 8px;font-size:11px}.sx-title{font-size:11px}}

.sx-title{flex:0 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dnp-color-text-primary)}
.sx-status{flex:1 1 auto;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--dnp-color-text-secondary);font-size:12px}
.sx-status[data-tone=error]{color:var(--dnp-color-error)}.sx-status[data-tone=warn]{color:var(--dnp-color-warn)}
.sx-frame{flex:1 1 auto;width:100%;border:0;background:var(--dnp-color-bg-app);display:block}
.sx-section{height:100%}
/* A service runs, but is not seen and takes no room or focus. */
.sx-service{position:fixed;width:0;height:0;border:0;left:-10px;top:-10px;opacity:0;pointer-events:none}
.sx-choose .st-actions{flex-wrap:wrap}
`

export function installEditors (S) {
  if (!document.getElementById('sx-css')) document.head.appendChild(el('style', { id: 'sx-css', text: CSS }))
  let session = null
  S.router.register({
    id: 'edit', label: 'Edit', icon: 'action.edit', rail: false,
    mount: async (arg, from) => {
      const a = parseEditArg(arg)
      const editor = a && S.plugins.editor(a.editorKey)
      if (!a || !editor || editor.builtin || !S.docKinds[a.kind]) { S.status('that editor is not here any more', 'warn'); S.go('home'); return }
      S.shell.hidePage()
      session = new EditorSession(S, { editor, kind: a.kind, key: a.key, from })
      S.editorSession = session
      await session.open()
    },
    leave: () => session?.leave() ?? true,
    unmount: () => { session?.close(); session = null; S.editorSession = null }
  })

  /**
   * Open a document in an editor: the one chosen for its kind, or -- `pick`, or
   * several and none chosen -- the author picks (and may keep the choice).
   */
  S.openWith = async (kind, key, { pick = false } = {}) => {
    const editors = S.plugins.editorsFor(kind)
    if (!editors.length) { S.status(`nothing here edits a ${S.docKinds[kind]?.label ?? kind}`, 'warn'); return }
    let e = editors[0]
    if (pick || (editors.length > 1 && !S.plugins.prefs?.get(`editor.${kind}`))) {
      const choice = await choose(`Open ${key} with…`, [...editors.map((x) => ({ label: x.label + (x.builtin ? ' (the studio)' : ''), value: x.key })), { label: 'cancel', value: null }])
      if (!choice) return
      e = editors.find((x) => x.key === choice)
      S.plugins.setDefaultEditor(kind, e.key)
    }
    if (e.builtin) return e.open(key)
    return S.go('edit', editArg(e.key, kind, key))
  }

  /** Straight into the first plugin editor for a kind (a new document the studio's own pages cannot make). */
  S.editInPlugin = (kind, key) => {
    const e = S.plugins.editorsFor(kind).find((x) => !x.builtin)
    if (!e) { S.status(`nothing here edits a ${S.docKinds[kind]?.label ?? kind}`, 'warn'); return }
    return S.go('edit', editArg(e.key, kind, key))
  }

  /** The buttons a section shows for a document: "edit in X" and, when there are several, "open with…". */
  S.editButtons = (kind, key) => {
    if (!S.plugins.hasPluginEditor(kind)) return []
    const editors = S.plugins.editorsFor(kind).filter((x) => !x.builtin)
    const first = editors[0]
    const out = [el('button', { 'data-edit-in': first.key, onclick: () => S.go('edit', editArg(first.key, kind, key)) }, withIcon('action.edit', `edit in ${first.label}`))]
    if (S.plugins.editorsFor(kind).length > 1) out.push(el('button', { text: 'open with…', 'data-open-with': kind, onclick: () => S.openWith(kind, key, { pick: true }) }))
    return out
  }
}
