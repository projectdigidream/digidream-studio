// The Echo editor: a text box over the suite's editor protocol (src/plugins/sdk.js).
// It is what docs/PLUGINS.md shows a plugin to be, and what the page test drives.
import { inSuite, connectSuite } from '../../src/plugins/sdk.js'
globalThis.__echo = { skins: [] }

const head = document.getElementById('head')
const text = document.getElementById('text')
let given = ''

if (inSuite()) {
  const suite = await connectSuite({
    onInit ({ kind, name, payload }) {
      given = typeof payload === 'string' ? payload : new TextDecoder().decode(payload)
      text.value = given
      head.textContent = `${kind} ${name}`
    },
    onSave: () => text.value,
    onRevert ({ payload }) { text.value = typeof payload === 'string' ? payload : new TextDecoder().decode(payload) },
    onSaved () { given = text.value; suite.dirty(false) },
    // The studio's skin: kept, for the page test to see what came and when.
    onSkin (bundle, mode, pointer) { globalThis.__echo.skins.push({ id: bundle?.id, mode, pointer, css: !!bundle?.css }) }
  })
  text.addEventListener('input', () => {
    suite.dirty(text.value !== given)
    suite.draft(text.value)
  })
  Object.assign(globalThis.__echo, { suite, text })
}
