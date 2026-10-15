//
// THE SYNC, IN THE BACKGROUND (plugin.json `services`): a hidden page the
// studio starts once and never closes, so modules sync whatever page is
// shown. It syncs a module when it is opened, a few seconds after it is
// saved, when the app comes back to the front, every few minutes for the open
// one, and when the Sync page asks. One sync at a time, so this device never
// races itself on the branch.
//
// The Sync page (page.js) talks to it over a BroadcastChannel: it asks
// (`sync`, `config`, `forget`), this answers `changed` whenever a module's
// state or the settings move, and the page reads them from state.js.
//
import { inSuite, connectSuite } from './suite-sdk.js'
import { GitHub, GitHubError, isOffline } from './github.js'
import { syncModule } from './sync.js'
import { CHANNEL, getConfig, setConfig, modules, status, deviceName } from './state.js'

const SAVED_DELAY = 4000
const POLL = 120000

const chan = new BroadcastChannel(CHANNEL)
let api = null
let cfg = null
let openId = null

const changed = (id = null) => chan.postMessage({ t: 'changed', id })

// The studio, as sync.js wants it.
const studio = {
  async files (id) {
    try { return await api.query('record-files', { id }, { timeout: 30000 }) } catch (e) {
      if (/^no module called/.test(e.message)) return null
      throw e
    }
  },
  write: (id, baseRev, files) => api.query('module-write', { id, baseRev, files }, { timeout: 60000 })
}

const tracked = (id) => !!cfg?.tracked?.includes(id)

async function say (id, text, level, extra = {}) {
  await status.put(id, { text, level, at: Date.now(), ...extra })
  api?.status({ module: id, text, level })
  changed(id)
}

// ------------------------------------------------------------ the queue

const queue = new Map() // id -> opts, waiting
let working = false

function schedule (id, opts = {}) {
  if (!cfg || !id) return
  if (!tracked(id) && !opts.get) return
  queue.set(id, { ...(queue.get(id) ?? {}), ...opts })
  if (!working) work()
}

async function work () {
  working = true
  try {
    while (queue.size) {
      const [id, opts] = queue.entries().next().value
      queue.delete(id)
      await syncOne(id, opts)
    }
  } finally { working = false }
}

async function syncOne (id, { get = false, keep = {} } = {}) {
  if (!cfg) return
  const gh = new GitHub({ token: cfg.token, repo: cfg.repo, branch: cfg.branch })
  await say(id, 'syncing…', 'info')
  try {
    const r = await syncModule({ id, studio, gh, store: modules, device: cfg.device || deviceName(), keep, get })
    if (r.result === 'synced') {
      if (get && !tracked(id)) { cfg.tracked = [...(cfg.tracked ?? []), id]; await saveConfig() }
      const took = r.pulled.length ? `, ${r.pulled.length} file${r.pulled.length > 1 ? 's' : ''} from GitHub` : ''
      await say(id, 'synced', 'ok', { pulled: r.pulled.length, pushed: r.pushed.length, note: `synced${took}` })
    } else if (r.result === 'conflict') {
      await say(id, `${r.conflicts.length} file${r.conflicts.length > 1 ? 's' : ''} changed here and on GitHub`, 'warn')
    } else if (r.result === 'missing-local') {
      await say(id, 'not on this device', 'info')
    } else if (r.result === 'missing-remote') {
      await say(id, 'gone from GitHub; this device keeps its copy', 'warn')
    }
  } catch (e) {
    if (isOffline(e)) await say(id, 'offline; it will sync when GitHub can be reached', 'info')
    else await say(id, `sync failed: ${e.message}`, 'error', { error: e instanceof GitHubError ? e.status : 0 })
  }
}

async function syncAll () {
  for (const id of cfg?.tracked ?? []) schedule(id)
}

async function saveConfig () {
  await setConfig(cfg)
  changed()
}

// ------------------------------------------------------------ the studio's events

const savedTimers = new Map()

/** Every tracked module's badge, as last said (the studio forgets them on a reload). */
async function badges () {
  const all = await status.all()
  for (const id of cfg?.tracked ?? []) if (all[id]) api.status({ module: id, text: all[id].text === 'syncing…' ? '' : all[id].text, level: all[id].level })
}

async function start () {
  cfg = await getConfig()
  if (!cfg) return
  await badges()
  syncAll()
}

if (inSuite()) {
  api = await connectSuite({
    async onServiceInit (m) {
      openId = m.module
      await start()
    },
    onEvent (name, m) {
      if (name === 'module-opened') { openId = m.id; schedule(m.id) }
      else if (name === 'module-saved') {
        clearTimeout(savedTimers.get(m.id))
        savedTimers.set(m.id, setTimeout(() => { savedTimers.delete(m.id); schedule(m.id) }, SAVED_DELAY))
      } else if (name === 'foreground') syncAll()
    }
  })
  setInterval(() => { if (openId) schedule(openId) }, POLL)
}

// ------------------------------------------------------------ the Sync page's asks

chan.onmessage = async (e) => {
  const m = e.data ?? {}
  if (m.t === 'ping') chan.postMessage({ t: 'pong', running: !!api, busy: working })
  else if (m.t === 'config') {
    // Settings changed on the page: connected, disconnected, modules ticked.
    const was = cfg
    cfg = await getConfig()
    for (const id of was?.tracked ?? []) if (!tracked(id)) api?.status({ module: id, text: '' })
    if (cfg) syncAll()
  } else if (m.t === 'sync') {
    if (m.id) schedule(m.id, { get: !!m.get, keep: m.keep ?? {} })
    else syncAll()
  } else if (m.t === 'forget') {
    // Sync this module as if for the first time (after it was removed from GitHub).
    await modules.put(m.id, null)
    schedule(m.id)
  }
}

globalThis.__githubSync = { get cfg () { return cfg }, schedule, get working () { return working }, queue }
