# Third-party components

The studio's own code is MIT (see LICENSE). These parts keep their own licences:

| What | Where | Licence |
|---|---|---|
| fflate (zip) | `vendor/fflate.js` | MIT -- `vendor/fflate.LICENSE` |
| Pixelify Sans (the ps1 skin's font, baked into `vendor/uikit`) | `vendor/uikit/` | SIL OFL 1.1 -- `src/templates/licenses/PixelifySans-OFL.txt` |
| Gem Hollow example: Kenney art, OpenGameArt chiptunes | `src/templates/gemhollow.zip` | CC0 -- `src/templates/licenses/gemhollow-LICENSE.txt` |
| Cinderfall example: Freedoom textures and music | `src/templates/cinderfall.zip` | BSD-3-Clause (Freedoom) -- `src/templates/licenses/cinderfall-LICENSE.txt` |
| Cinderfall example: Special Elite font | `src/templates/cinderfall.zip` | Apache 2.0 -- `src/templates/licenses/SPECIAL_ELITE_LICENSE.txt` |
| Cinderfall example: Bebas Neue font | `src/templates/cinderfall.zip` | SIL OFL 1.1 -- `src/templates/licenses/BEBAS_NEUE_OFL.txt` |

`src/templates/licenses/` is copied into every studio build with the templates, so these
notices travel with the apps. The bundled plugin editors (ThreeSprite, qPainter,
DigidreamSound, DigidreamSynth, the Packager) are MIT, from their own repositories.
