/**
 * Single entry point for both OpenCode lines.
 *
 * - OpenCode 2.x reads `id` + `setup` (the `Plugin.define` shape; `define` is an identity function).
 * - OpenCode 1.19.3+ reads the default export's `server()` (the v1 `PluginModule` shape).
 *
 * The module has exactly one export, the default object, so neither host mistakes a helper for a
 * plugin. No runtime import of either host SDK is needed.
 */
import { v1Server } from "./entry-v1.js"
import { v2Setup } from "./entry-v2.js"

const plugin = {
  id: "cliproxyapi",
  setup: v2Setup,
  server: v1Server,
}

export default plugin
