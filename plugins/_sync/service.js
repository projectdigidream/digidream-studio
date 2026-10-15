// A background service over the studio's protocol (src/plugins/sdk.js): it
// records the events it is told and hands its API to the page test, which
// drives the queries a sync makes. Hidden; nothing else uses it.
import { inSuite, connectSuite } from '../../src/plugins/sdk.js'

globalThis.__sync = { events: [], init: null, api: null }
if (inSuite()) {
  globalThis.__sync.api = await connectSuite({
    onServiceInit (m) { globalThis.__sync.init = { service: m.service, module: m.module, rev: m.rev } },
    onEvent (name, m) { globalThis.__sync.events.push({ name, id: m.id, rev: m.rev }) }
  })
}
