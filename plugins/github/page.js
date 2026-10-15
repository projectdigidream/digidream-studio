//
// THE SYNC PAGE (the plugin's rail section): connecting a repository, which
// modules sync, how each stands, and the choice when a file changed both here
// and on GitHub. The syncing itself is the service's (service.js); this page
// asks it over the channel and reads what it wrote (state.js).
//
import { inSuite, connectSuite } from './suite-sdk.js'
import { wearSkin } from './suite-skin.js'
import { GitHub } from './github.js'
import { remoteModules } from './sync.js'
import { CHANNEL, getConfig, setConfig, modules, status, deviceName } from './state.js'

const NEW_REPO = 'https://github.com/new?name=digidream-modules&visibility=private'
const NEW_TOKEN = 'https://github.com/settings/personal-access-tokens/new'

const app = document.getElementById('app')
const chan = new BroadcastChannel(CHANNEL)
let api = null
let draft = { repo: '', token: '', branch: '', device: deviceName() }
let connectError = ''
let busy = false
let remote = null // [{ id }] on the branch, or null while not known
let remoteError = ''
// Module id -> { path: 'local'|'remote' }. Kept for the session: a pull into
// the open module re-mounts this page, and half-made choices should survive it.
const CHOICES = 'dnp.github.choices'
const choices = new Map((() => { try { return Object.entries(JSON.parse(sessionStorage.getItem(CHOICES) ?? '{}')) } catch { return [] } })())
const keepChoices = () => { try { sessionStorage.setItem(CHOICES, JSON.stringify(Object.fromEntries(choices))) } catch {} }

// ------------------------------------------------------------ bits of DOM

function h (tag, attrs = {}, kids = []) {
  const e = document.createElement(tag)
  for (const [k, v] of Object.entries(attrs)) {
    if (v === undefined || v === null || v === false) continue
    if (k.startsWith('on')) e.addEventListener(k.slice(2), v)
    else if (k === 'text') e.textContent = v
    else e.setAttribute(k, v === true ? '' : v)
  }
  for (const c of [].concat(kids)) if (c !== null && c !== undefined && c !== false) e.append(c)
  return e
}

// In the apps the studio opens it in the system's browser; in a browser it
// says false and this page opens a tab itself, still inside the click.
const open = async (url) => {
  const done = api ? await api.query('open-url', { url }).catch(() => false) : false
  if (!done) window.open(url, '_blank', 'noopener')
}
const ago = (t) => {
  if (!t) return ''
  const s = Math.round((Date.now() - t) / 1000)
  if (s < 60) return 'just now'
  if (s < 3600) return `${Math.round(s / 60)} min ago`
  if (s < 86400) return `${Math.round(s / 3600)} h ago`
  return new Date(t).toLocaleDateString()
}

// ------------------------------------------------------------ not connected

function connectView () {
  const field = (key, label, type = 'text', placeholder = '') => h('label', {}, [label, h('input', {
    type, value: draft[key], placeholder, autocomplete: 'off', spellcheck: 'false', 'data-field': key,
    oninput: (e) => { draft[key] = e.target.value.trim() }
  })])
  return [
    h('h1', { text: 'Sync with GitHub' }),
    h('p', { class: 'dim', text: 'Keep your modules in a GitHub repository and open them on your other devices. Each sync is a commit, so GitHub keeps every version.' }),
    h('section', { class: 'card' }, [
      h('ol', {}, [
        h('li', {}, [h('p', {}, ['Make a private repository for your modules. ', h('button', { class: 'link', onclick: () => open(NEW_REPO), text: 'New repository on GitHub' })])]),
        h('li', {}, [
          h('p', {}, ['Make a token for it. ', h('button', { class: 'link', onclick: () => open(NEW_TOKEN), text: 'New token on GitHub' })]),
          h('p', { class: 'dim', text: 'Under Repository access choose "Only select repositories" and pick that repository. Under Permissions, set Contents to "Read and write". Copy the token.' })
        ]),
        h('li', {}, [h('p', { text: 'Paste both here.' })])
      ]),
      h('div', { class: 'fields' }, [
        field('repo', 'Repository', 'text', 'owner/name'),
        field('token', 'Token', 'password', 'github_pat_…'),
        field('branch', 'Branch (empty: the repository\'s own)', 'text', 'main'),
        field('device', 'This device, in commit messages', 'text', deviceName())
      ]),
      connectError ? h('p', { class: 'err', role: 'alert', text: connectError }) : null,
      h('div', { class: 'row' }, [
        h('button', { class: 'primary', 'data-action': 'connect', disabled: busy, onclick: connect, text: busy ? 'Connecting…' : 'Connect' }),
        h('span', { class: 'dim', text: 'The token stays on this device.' })
      ])
    ])
  ]
}

async function connect () {
  const repo = draft.repo.replace(/^https?:\/\/github\.com\//, '').replace(/\.git$/, '').replace(/\/+$/, '')
  if (!/^[\w.-]+\/[\w.-]+$/.test(repo)) { connectError = 'The repository is owner/name, as in its address on GitHub.'; return render() }
  if (!draft.token) { connectError = 'Paste the token from GitHub.'; return render() }
  busy = true; connectError = ''; render()
  try {
    const probe = new GitHub({ token: draft.token, repo })
    const user = await probe.user()
    let info
    try { info = await probe.info() } catch (e) {
      throw new Error(e.status === 404 ? `${user.login} cannot see ${repo}: check the name, and that the token is for that repository.` : e.message)
    }
    if (info.permissions && info.permissions.push === false) throw new Error(`${user.login} cannot write to ${repo}.`)
    const branch = draft.branch || info.default_branch || 'main'
    const gh = new GitHub({ token: draft.token, repo, branch })
    await gh.ensureBranch()
    // Every module here syncs to begin with; untick the ones that should not.
    const local = api ? await api.query('modules') : []
    await modules.clear()
    await status.clear()
    await setConfig({ token: draft.token, repo, branch, login: user.login, device: draft.device || deviceName(), tracked: local.map((m) => m.id), private: !!info.private })
    draft.token = ''
    chan.postMessage({ t: 'config' })
  } catch (e) {
    connectError = /token|credentials/i.test(e.message) ? 'GitHub refused the token: check it was copied whole and has not expired.' : e.message
  } finally { busy = false }
  render()
}

// ------------------------------------------------------------ connected

async function connectedView (cfg) {
  const local = api ? await api.query('modules') : []
  const states = Object.fromEntries((await modules.all()).map((s) => [s.id, s]))
  const said = await status.all()
  const here = new Set(local.map((m) => m.id))
  const elsewhere = (remote ?? []).filter((m) => !here.has(m.id))
  const repoUrl = `https://github.com/${cfg.repo}`

  const head = h('section', { class: 'card' }, [
    h('div', { class: 'row' }, [
      h('div', { class: 'grow' }, [
        h('div', { class: 'name' }, [h('button', { class: 'link', onclick: () => open(repoUrl), text: cfg.repo }), ` · ${cfg.branch}`]),
        h('div', { class: 'dim', text: `Signed in as ${cfg.login}. This device: ${cfg.device}.${cfg.private === false ? ' The repository is public: anyone can read these modules.' : ''}` })
      ]),
      h('button', { class: 'primary', 'data-action': 'sync-all', onclick: () => { chan.postMessage({ t: 'sync' }); refreshRemote() }, text: 'Sync now' }),
      h('button', { 'data-action': 'disconnect', onclick: disconnect, text: 'Disconnect' })
    ])
  ])

  const rows = local.map((m) => moduleRow(m, cfg, states[m.id], said[m.id]))
  const mine = h('section', { class: 'card' }, [
    h('h2', { text: 'On this device' }),
    local.length ? h('div', { class: 'mods' }, rows) : h('p', { class: 'dim', text: 'No modules yet.' })
  ])

  const theirs = h('section', { class: 'card' }, [
    h('h2', { text: 'On GitHub, not on this device' }),
    remoteError ? h('p', { class: 'err', text: remoteError })
      : remote === null ? h('p', { class: 'dim', text: 'Looking…' })
        : elsewhere.length ? h('div', { class: 'mods' }, elsewhere.map((m) => h('div', { class: 'mod', 'data-remote': m.id }, [
          h('div', { class: 'row' }, [
            h('div', { class: 'grow' }, [h('div', { class: 'name', text: m.id }), said[m.id] && said[m.id].text !== 'not on this device' ? h('div', { class: `state ${said[m.id].level}` }, [h('span', { class: 'dot' }), said[m.id].text]) : null]),
            h('button', { 'data-action': 'get', onclick: () => chan.postMessage({ t: 'sync', id: m.id, get: true }), text: 'Get' })
          ])
        ])))
          : h('p', { class: 'dim', text: 'Nothing: every module on GitHub is here too.' })
  ])
  return [h('h1', { text: 'Sync with GitHub' }), head, mine, theirs]
}

function moduleRow (m, cfg, st, said) {
  const on = cfg.tracked.includes(m.id)
  const kids = [h('div', { class: 'row' }, [
    h('div', { class: 'grow' }, [
      h('div', {}, [h('span', { class: 'name', text: m.name }), m.name !== m.id ? h('span', { class: 'id', text: `  ${m.id}` }) : null]),
      on && said ? h('div', { class: `state ${said.level}`, 'data-state': said.level }, [h('span', { class: 'dot' }), said.note && said.level === 'ok' ? said.note : said.text, said.level === 'ok' && st?.synced ? h('span', { class: 'dim', text: ` · ${ago(st.synced)}` }) : null])
        : h('div', { class: 'state dim', text: on ? 'waiting for its first sync' : 'not synced' })
    ]),
    on ? h('button', { 'data-action': 'sync', onclick: () => chan.postMessage({ t: 'sync', id: m.id }), text: 'Sync' }) : null,
    h('label', { class: 'switch' }, [h('input', { type: 'checkbox', checked: on, 'data-track': m.id, onchange: (e) => track(m.id, e.target.checked) }), 'sync'])
  ])]
  if (on && st?.conflicts?.length) kids.push(conflictBox(m.id, st.conflicts))
  if (on && said?.text?.startsWith('gone from GitHub')) {
    kids.push(h('div', { class: 'row' }, [
      h('span', { class: 'dim grow', text: 'It was removed from the repository after it was synced. Upload this device\'s copy again, or stop syncing it.' }),
      h('button', { 'data-action': 'reupload', onclick: () => chan.postMessage({ t: 'forget', id: m.id }), text: 'Upload again' })
    ]))
  }
  return h('div', { class: 'mod', 'data-module': m.id }, kids)
}

/** A file as the author knows it: 'map first', 'module settings', 'textures/BRICK.png'. */
function label (path) {
  if (path === 'module.studio.json') return 'module settings'
  const m = /^maps\/(.+)\.studio\.json$/.exec(path)
  if (m) return `map ${m[1]}`
  return path.replace(/^(assets|sources)\//, '')
}

function conflictBox (id, conflicts) {
  const pick = choices.get(id) ?? {}
  choices.set(id, pick)
  const set = (side) => { for (const c of conflicts) pick[c.path] = side; keepChoices(); render() }
  const ready = conflicts.every((c) => pick[c.path])
  const what = (c) => (!c.local ? ' (deleted here)' : !c.remote ? ' (deleted on GitHub)' : '')
  return h('div', { class: 'conflict', 'data-conflict': id }, [
    h('p', { text: 'Changed here and on GitHub since the last sync. Choose which to keep; the other stays in history (GitHub\'s commits, or the studio\'s Snapshots for this device\'s).' }),
    ...conflicts.map((c) => h('div', { class: 'file' }, [
      h('span', { class: 'what', title: c.path, text: label(c.path) + what(c) }),
      h('span', { class: 'pick' }, [
        h('label', {}, [h('input', { type: 'radio', name: `${id}:${c.path}`, checked: pick[c.path] === 'local', onchange: () => { pick[c.path] = 'local'; keepChoices(); render() } }), 'this device']),
        h('label', {}, [h('input', { type: 'radio', name: `${id}:${c.path}`, checked: pick[c.path] === 'remote', onchange: () => { pick[c.path] = 'remote'; keepChoices(); render() } }), 'GitHub'])
      ])
    ])),
    h('div', { class: 'row' }, [
      h('button', { 'data-action': 'keep-local', onclick: () => set('local'), text: 'All this device\'s' }),
      h('button', { 'data-action': 'keep-remote', onclick: () => set('remote'), text: 'All GitHub\'s' }),
      h('span', { class: 'grow' }),
      h('button', {
        class: 'primary',
        'data-action': 'resolve',
        disabled: !ready,
        onclick: () => {
          const keep = Object.fromEntries(conflicts.map((c) => [c.path, { side: pick[c.path], remote: c.remote }]))
          choices.delete(id)
          keepChoices()
          chan.postMessage({ t: 'sync', id, keep })
        },
        text: 'Keep these'
      })
    ])
  ])
}

async function track (id, on) {
  const cfg = await getConfig()
  cfg.tracked = on ? [...new Set([...cfg.tracked, id])] : cfg.tracked.filter((x) => x !== id)
  await setConfig(cfg)
  chan.postMessage({ t: 'config' })
  render()
}

async function disconnect () {
  if (!confirm('Disconnect from GitHub? The modules stay on this device and on GitHub; this device forgets the token.')) return
  await setConfig(null)
  await modules.clear()
  await status.clear()
  remote = null
  chan.postMessage({ t: 'config' })
  render()
}

async function refreshRemote () {
  const cfg = await getConfig()
  if (!cfg) return
  try {
    remote = await remoteModules(new GitHub({ token: cfg.token, repo: cfg.repo, branch: cfg.branch }))
    remoteError = ''
  } catch (e) { remoteError = `Could not list the repository: ${e.message}` }
  render()
}

// ------------------------------------------------------------ drawing

let drawing = null
let again = false
async function render () {
  if (drawing) { again = true; return drawing }
  drawing = (async () => {
    do {
      again = false
      const cfg = await getConfig()
      const kids = cfg ? await connectedView(cfg) : connectView()
      // Keep what is being typed and where the caret is across a redraw.
      const focus = document.activeElement?.dataset?.field
      app.replaceChildren(...kids)
      if (focus) app.querySelector(`[data-field="${focus}"]`)?.focus()
    } while (again)
  })()
  try { await drawing } finally { drawing = null }
}

// The connect form is not redrawn under someone typing a token.
const quiet = () => !!app.querySelector('[data-action="connect"]')

chan.onmessage = (e) => {
  if (e.data?.t !== 'changed') return
  if (quiet() && !e.data.id) return render()
  if (quiet()) return
  // A module that came from GitHub is now here: the lists move.
  if (e.data.id && remote?.some((m) => m.id === e.data.id)) refreshRemote()
  else render()
}

const fonts = { '--bg': 'color.bg.app', '--panel': 'color.bg.panel', '--raised': 'color.bg.raised', '--line': 'color.line.main', '--fg': 'color.text.primary', '--dim': 'color.text.secondary', '--accent': 'color.accent', '--on-accent': 'color.text.inverse', '--ok': 'color.ok', '--warn': 'color.warn', '--bad': 'color.error', '--info': 'color.info' }
if (inSuite()) {
  api = await connectSuite({
    onSectionInit: () => { render(); refreshRemote() },
    onEvent: () => { if (!quiet()) render() },
    onSkin: (bundle, mode, pointer) => wearSkin(bundle, mode, pointer, { vars: fonts })
  })
} else render()

globalThis.__githubPage = { render, refreshRemote, get remote () { return remote } }
