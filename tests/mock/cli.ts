/** CLI wrapper: bun tests/mock/cli.ts --port 8317 --api-key k --fixture models.json --delay-ms 0 --status 200 */
import { startMockProxy } from "./cliproxyapi"

const args = process.argv.slice(2)
const get = (flag: string) => {
  const i = args.indexOf(flag)
  return i >= 0 ? args[i + 1] : undefined
}

const proxy = startMockProxy({
  port: Number(get("--port") ?? 8317),
  apiKey: get("--api-key"),
  fixture: get("--fixture") ?? "models.json",
  delayMs: get("--delay-ms") ? Number(get("--delay-ms")) : undefined,
  status: get("--status") ? Number(get("--status")) : undefined,
})
console.log(`mock CLIProxyAPI listening on ${proxy.url}`)
let seen = 0
setInterval(() => {
  for (; seen < proxy.requests.length; seen++) {
    const r = proxy.requests[seen]!
    console.log(`${r.method} ${r.path}${r.model ? ` model=${r.model}` : ""} auth=${r.headers.authorization ? "yes" : "no"}`)
  }
}, 250)
