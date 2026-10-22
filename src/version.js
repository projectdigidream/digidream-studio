//
// THE STUDIO'S VERSION, separate from the engine's (engine/VERSION).
//
// studio/VERSION is the one place it is decided; this mirrors it for the
// browser, which cannot read a file beside the page synchronously, and
// studio/test/version.test.js fails if the two differ. It changes only with
// the user's permission. Plugins name the range they need against it
// (plugin.json `suite`, docs/PLUGINS.md).
//
export const STUDIO_VERSION = '0.4.2.3'
