//
// WHERE THE STUDIO IS SERVED: /studio/ by the dev server and the shells, but
// a shell may serve it elsewhere, so every URL of its own is built from this
// file's location instead of a literal.
//
// test/paths_abs.test.js fails on any '/studio/' literal left in src/.
//
export const BASE = new URL('../', import.meta.url).pathname   // e.g. '/studio/'
export const RUNTIME = BASE + 'runtime/'                       // engine/maps/scripts
export const WASM = BASE + 'wasm/dist/'                        // the mapc wasm (engine/scripts/build_mapc_wasm.sh)
export const PLUGINS = BASE + 'plugins/'                       // bundled plugins
