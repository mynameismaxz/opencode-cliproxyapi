/**
 * Integration harness: runs real OpenCode binaries headless against a temp project.
 *
 * Verified host commands (spike, 2026-10-20):
 *   v1 (opencode-ai 1.19.3):  `opencode models`                       -> one "provider/model" per line
 *                             `opencode run -m <provider/model> <msg>` -> one chat turn
 *   v2 (@opencode/cli 2.0.32): same subcommands with `--standalone` (private server; the managed
 *                             background service is shared with the developer's real setup).
 *
 * Loader facts that shape the plugin spec used here:
 *   - v2 resolves a local path plugin as `<dir>/server.*` or `<dir>/index.*` files only (it ignores
 *     package.json), so tests point both hosts at the built `dist/` directory.
 *   - Tests load the built `dist/` by path, never by npm name, so hosts never download anything.
 *     (The unscoped name `opencode-cliproxyapi` on npm is a different, third-party package.)
 *
 * Isolation: HOME and XDG_* point at a temp dir, the inherited environment is reduced to an
 * allow-list, and models.dev fetching / auto-update are disabled, so the developer's real OpenCode
 * config is never read or written.
 */
import { createHash } from "node:crypto"
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs"
import { join } from "node:path"

export type Line = "v1" | "v2"

export const REPO = join(import.meta.dir, "..", "..")
export const DIST = join(REPO, "dist")
export const PROVIDER = "cliproxyapi"

export function hostBin(line: Line): string {
  return join(REPO, ".hosts", line, "bin", "opencode")
}

export function hostInstalled(line: Line): boolean {
  return existsSync(hostBin(line)) && existsSync(join(DIST, "index.js"))
}

export interface HostRun {
  exitCode: number | null
  stdout: string
  stderr: string
  ms: number
}

export interface HostOptions {
  /** Plugin options block; omitted means the zero-config form. */
  pluginOptions?: Record<string, unknown>
  /** Extra env vars (e.g. CLIPROXYAPI_BASE_URL). */
  env?: Record<string, string>
  /** Additional top-level config merged into opencode.json (e.g. a user-owned provider). */
  extraConfig?: Record<string, unknown>
  /** Plugin specs to reference; defaults to [DIST]. */
  pluginSpecs?: string[]
  /** Skip the plugin entirely (baseline timing). */
  noPlugin?: boolean
}

export interface HostHandle {
  line: Line
  root: string
  project: string
  run(args: string[], timeoutMs?: number): Promise<HostRun>
  listModels(opts?: { printLogs?: boolean }): Promise<{ run: HostRun; all: string[]; proxied: string[] }>
  prompt(model: string, text?: string): Promise<HostRun>
  /** Files under the isolated config home and project whose content changed since setup. */
  changedConfigFiles(): string[]
}

const ENV_ALLOW = ["PATH", "TMPDIR", "LANG", "LC_ALL", "TERM", "SHELL", "USER", "LOGNAME", "SYSTEMROOT", "TEMP", "TMP"]

function snapshot(dir: string, out = new Map<string, string>()): Map<string, string> {
  if (!existsSync(dir)) return out
  for (const name of readdirSync(dir)) {
    const p = join(dir, name)
    const st = statSync(p)
    if (st.isDirectory()) {
      if (name === "node_modules") continue
      snapshot(p, out)
    } else if (st.isFile()) {
      out.set(p, createHash("sha256").update(readFileSync(p)).digest("hex"))
    }
  }
  return out
}

export function pluginEntry(line: Line, spec: string, options?: Record<string, unknown>): unknown {
  if (!options) return spec
  return line === "v1" ? [spec, options] : { package: spec, options }
}

export async function withHost<T>(line: Line, opts: HostOptions, fn: (h: HostHandle) => Promise<T>): Promise<T> {
  mkdirSync(join(REPO, ".tmp"), { recursive: true })
  const root = mkdtempSync(join(REPO, ".tmp", `it-${line}-`))
  const project = join(root, "proj")
  const dirs = { HOME: "home", XDG_CONFIG_HOME: "cfg", XDG_DATA_HOME: "data", XDG_CACHE_HOME: "cache", XDG_STATE_HOME: "state" }
  for (const d of Object.values(dirs)) mkdirSync(join(root, d), { recursive: true })
  mkdirSync(project, { recursive: true })

  const config: Record<string, unknown> = { ...opts.extraConfig }
  if (!opts.noPlugin) {
    const entries = (opts.pluginSpecs ?? [DIST]).map((s) => pluginEntry(line, s, opts.pluginOptions))
    config[line === "v1" ? "plugin" : "plugins"] = entries
  }
  if (line === "v1") config.$schema = "https://opencode.ai/config.json"
  writeFileSync(join(project, "opencode.json"), JSON.stringify(config, null, 2))

  const env: Record<string, string> = {}
  for (const k of ENV_ALLOW) if (process.env[k]) env[k] = process.env[k]!
  for (const [k, v] of Object.entries(dirs)) env[k] = join(root, v)
  env.OPENCODE_DISABLE_MODELS_FETCH = "1"
  env.OPENCODE_DISABLE_AUTOUPDATE = "1"
  Object.assign(env, opts.env)

  const before = new Map([...snapshot(join(root, "cfg")), ...snapshot(project)])

  const run = async (args: string[], timeoutMs = 120_000): Promise<HostRun> => {
    const full = line === "v2" && ["models", "run"].includes(args[0]!) ? [args[0]!, "--standalone", ...args.slice(1)] : args
    const t0 = performance.now()
    const proc = Bun.spawn([hostBin(line), ...full], { cwd: project, env, stdout: "pipe", stderr: "pipe", stdin: "ignore" })
    const timer = setTimeout(() => proc.kill(), timeoutMs)
    const [stdout, stderr] = await Promise.all([new Response(proc.stdout).text(), new Response(proc.stderr).text()])
    await proc.exited
    clearTimeout(timer)
    return { exitCode: proc.exitCode, stdout, stderr, ms: performance.now() - t0 }
  }

  const handle: HostHandle = {
    line,
    root,
    project,
    run,
    async listModels(o) {
      const logFlags = o?.printLogs ? ["--print-logs", "--log-level", line === "v1" ? "INFO" : "info"] : []
      const r = await run(["models", ...logFlags])
      const all = r.stdout.split("\n").map((l) => l.trim()).filter((l) => /^[\w.-]+\/\S+$/.test(l))
      return { run: r, all, proxied: all.filter((m) => m.startsWith(`${PROVIDER}/`)).map((m) => m.slice(PROVIDER.length + 1)) }
    },
    prompt(model, text = "Reply with the single word ok.") {
      return run(["run", "-m", model, text])
    },
    changedConfigFiles() {
      const after = new Map([...snapshot(join(root, "cfg")), ...snapshot(project)])
      const changed: string[] = []
      for (const [file, hash] of before) if (after.get(file) !== hash) changed.push(file)
      return changed
    },
  }

  try {
    return await fn(handle)
  } finally {
    if (!process.env.KEEP_IT_TMP) rmSync(root, { recursive: true, force: true })
  }
}

/** Every output line mentioning the plugin's user-facing messages. */
export function pluginMessages(run: HostRun): string[] {
  const text = `${run.stdout}\n${run.stderr}`
  return text
    .split("\n")
    .filter((l) => /CLIProxyAPI at |CLIPROXYAPI_BASE_URL \/ baseURL|@mynameismaxz\/opencode-cliproxyapi supports|\[cliproxyapi\]/.test(l))
}
