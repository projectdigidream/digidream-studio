//
// THE SPRITE BAKER: a ThreeSprite project (.tsprite) -> the sheet the game
// draws (assets/sprites/NAME.json and NAME.png). A baker (docs/PLUGINS.md,
// Bakers): no DOM, the same bytes in a page's Worker and in node.
//
// ThreeSprite composes its own projects: its runtime poses the rig, renders
// every view of every frame and packs the sheet (vendor/tsprite.js, the same
// file the studio's import uses). The sheet takes the module's name for it,
// not the project's sprite name: a renamed sheet stays renamed.
//
import { loadTsprite } from '../../vendor/tsprite.js'

// 2: ThreeSprite's runtime with each view's own layer order (partOrderByView);
// sheets baked by 1 drew every view in the one order, so they are baked again.
export const version = '2'

export async function bake ({ key, bytes }) {
  const r = loadTsprite(bytes)
  const manifest = JSON.parse(JSON.stringify(r.sheet.manifest))
  manifest.sprite = key
  manifest.image = `${key}.png`
  return {
    files: {
      [`sprites/${key}.json`]: new TextEncoder().encode(JSON.stringify(manifest)),
      [`sprites/${key}.png`]: r.png
    },
    meta: { manifest },
    problems: r.warnings ?? []
  }
}
