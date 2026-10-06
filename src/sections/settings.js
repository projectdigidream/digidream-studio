//
// The module's settings: what module.txt says about how it is played.
//
// Moved out of main.js as a section of the module (app/router.js); it reaches
// the studio's shared state and verbs through S, given at install.
//
import { PERSIST } from '../module_emit.js'
import { text, muted, select, toggle, button } from '../ui.js'

let S = null

/** The module's own settings: what module.txt says, and the ids its props take. */
function showSettings () {
  S.ui.showSheet('Module settings', [
    text('id', S.module.id, (v) => { const id = v.toLowerCase().replace(/[^a-z0-9_-]/g, ''); if (id) { S.module.id = id; S.rec.id = id; S.save(); S.shell.drawRail() } }),
    text('name', S.module.name, (v) => { S.module.name = v; S.shell.moduleName = v || S.module.id; S.save(); S.shell.drawRail() }),
    text('about', S.module.about, (v) => { S.module.about = v; S.save() }, { multiline: true }),
    // How it is played and what it remembers: module.txt's own switches
    // (docs/MODULES.md, docs/SAVING.md), written on the next Play or Export.
    select('controls', S.module.controls ?? 'platformer', [['platformer', 'platformer — third person'], ['fps', 'first person (fps)']],
           (v) => { S.module.controls = v; S.save() }),
    muted('First person puts the camera at the eyes and aims where the player looks; a touch drag looks around. The module decides, not the player.'),
    // The engine's debug overlay: the module's (what ships), and this device's Play.
    toggle('show the debug overlay in the game', S.module.debug !== false, (v) => { if (v) delete S.module.debug; else S.module.debug = false; S.moduleChanged(); showSettings() }),
    select('when I press Play', S.playDebug(), [['module', `as the module says (${S.module.debug === false ? 'hidden' : 'shown'})`], ['on', 'always show it'], ['off', 'never show it']],
           (v) => { S.setPlayDebug(v); showSettings() }),
    muted('The overlay is the engine\'s numbers in the top-left corner (tick, fps, position, prediction), the controls legend, and the swing and facing drawings. Off, a game launches clean -- module.txt `debug off`. The Play choice is this device\'s, for your play-tests only; an exported pack says what the module says.'),
    ...PERSIST.map((k) => toggle({ levels: 'levels keep their state', saves: 'save and load games', server: 'survive a server restart' }[k],
      (S.module.persist ?? []).includes(k), (v) => {
        const set = new Set(S.module.persist ?? [])
        v ? set.add(k) : set.delete(k)
        S.module.persist = PERSIST.filter((p) => set.has(p))
        S.save()
      })),
    muted(`Prop ids start at ${S.module.propIdBase}.`),
    button('🕘 snapshots: the module as it was…', () => S.go('snapshots'))
  ])
}

/** Hand it the studio's state, and publish what others call. */
export function install (s) {
  S = s
  S.showSettings = S.sectionAlias('settings', showSettings)
}
