import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { it } from 'vitest'
import { corpusTable } from '../../src/domain/poker/narration/fixtures/table'
import { InterpretationError, NARRATION_SCHEMA_VERSION, fillUnsaid, readInterpretation, type NarrationInterpretation } from '../../src/domain/poker/narration/schema'
import { SYSTEM_PROMPT, handleNarrationRequest, type NarrationEnv } from '../../src/server/narration'
import { EVAL_CASES, REPEAT_IDS, type EvalCase } from './cases'
import { scoreCase } from './score'
import { summarize, summaryText, type Pricing, type RunRecord } from './summary'

/**
 * LIVE provider evaluation: `npm run eval:narration`.
 *
 * Sends every case in the evaluation corpus through the real `/api/narration`
 * handler to the real provider, scores what comes back, and writes a run
 * file to `eval/narration/runs/` (git-ignored). Never part of `npm test`,
 * `npm run verify`, the build or a deploy.
 *
 * The provider key is read from `.dev.vars` (git-ignored), the same local
 * secret file `wrangler pages dev` uses, and goes only into the handler's
 * server-side env. It is never printed, logged or written to the run file.
 *
 * Options (environment variables):
 *   EVAL_LABEL        name for the run file (default "run")
 *   EVAL_CASES        comma-separated case ids (default: all)
 *   EVAL_REPEATS      extra runs for the repeatability set (default 0)
 *   EVAL_CONCURRENCY  parallel calls (default 3)
 *   EVAL_MODEL        model override (default: NARRATION_MODEL, else the endpoint default)
 *   EVAL_PRICE_INPUT / EVAL_PRICE_OUTPUT   USD per million tokens, for the cost estimate
 *   EVAL_RESCORE      path to an earlier run file: re-score its saved responses
 *                     against the current app code and cases. No provider calls.
 */

const ROOT = resolve(import.meta.dirname, '..', '..')
const ORIGIN = 'https://eval.invalid'

function readDevVars(): Record<string, string> {
  const file = join(ROOT, '.dev.vars')
  if (!existsSync(file)) return {}
  const vars: Record<string, string> = {}
  for (const line of readFileSync(file, 'utf8').split(/\r?\n/)) {
    const match = /^\s*([A-Z0-9_]+)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) vars[match[1]!] = match[2]!.replace(/^(['"])(.*)\1$/, '$2')
  }
  return vars
}

const write = (text: string) => process.stdout.write(`${text}\n`)
const sleep = (ms: number) => new Promise((done) => setTimeout(done, ms))

interface Captured {
  providerStatus: number | null
  latencyMs: number
  usage: RunRecord['usage']
  stopReason: string | null
  toolInput: unknown
  /** The provider's own error message, when it refused the request. */
  providerError: string | null
}

/** A fetch that records the provider's metadata. It never records the request: that carries the key. */
function capturingFetch(captured: Captured): typeof fetch {
  return async (input, init) => {
    const started = performance.now()
    const response = await fetch(input, init)
    const body = await response.clone().text()
    captured.latencyMs = Math.round(performance.now() - started)
    captured.providerStatus = response.status
    try {
      const parsed = JSON.parse(body) as {
        usage?: { input_tokens?: number; output_tokens?: number; cache_read_input_tokens?: number; cache_creation_input_tokens?: number }
        stop_reason?: string
        content?: { type?: string; input?: unknown }[]
        error?: { type?: string; message?: string }
      }
      if (parsed.error) captured.providerError = `${parsed.error.type ?? 'error'}: ${parsed.error.message ?? ''}`.slice(0, 500)
      if (parsed.usage) {
        captured.usage = {
          input: parsed.usage.input_tokens ?? 0,
          output: parsed.usage.output_tokens ?? 0,
          cacheRead: parsed.usage.cache_read_input_tokens ?? 0,
          cacheWrite: parsed.usage.cache_creation_input_tokens ?? 0,
        }
      }
      captured.stopReason = parsed.stop_reason ?? null
      captured.toolInput = parsed.content?.find((block) => block.type === 'tool_use')?.input ?? null
    } catch {
      // Not JSON: the handler reports it.
    }
    return response
  }
}

async function runCase(entry: EvalCase, attempt: number, env: NarrationEnv): Promise<RunRecord & { interpretation: NarrationInterpretation | null; rawToolInput: unknown }> {
  const table = corpusTable()
  let retries = 0
  for (;;) {
    const captured: Captured = { providerStatus: null, latencyMs: 0, usage: null, stopReason: null, toolInput: null, providerError: null }
    const started = performance.now()
    const response = await handleNarrationRequest(
      new Request(`${ORIGIN}/api/narration`, {
        method: 'POST',
        headers: { Origin: ORIGIN, 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: entry.text, context: table.context }),
      }),
      env,
      capturingFetch(captured),
    )
    const body = (await response.json()) as { interpretation?: unknown; error?: string }
    // Rate limits and overload are the provider's weather, not the parser's quality: wait and retry.
    if (response.status === 502 && (captured.providerStatus === 429 || captured.providerStatus === 529 || (captured.providerStatus ?? 0) >= 500) && retries < 3) {
      retries++
      await sleep(5000 * retries)
      continue
    }
    let interpretation: NarrationInterpretation | null = null
    let failure: string | null = null
    if (response.status === 200) interpretation = readInterpretation(body.interpretation)
    else {
      failure = `${response.status} ${body.error ?? ''}`.trim()
      if (body.error === 'malformed' && captured.toolInput) {
        try {
          readInterpretation(captured.toolInput)
        } catch (error) {
          if (error instanceof InterpretationError) failure += `: ${error.issues.slice(0, 4).join(' ')}`
        }
      }
      if (captured.providerError) failure += ` (${captured.providerError})`
      if (captured.stopReason === 'max_tokens') failure += ' (output hit max_tokens)'
    }
    return {
      caseId: entry.id,
      attempt,
      status: response.status,
      error: body.error ?? null,
      providerStatus: captured.providerStatus,
      latencyMs: captured.latencyMs || Math.round(performance.now() - started),
      retries,
      usage: captured.usage,
      stopReason: captured.stopReason,
      score: scoreCase(entry, interpretation, failure),
      interpretation,
      // Kept only when the response was rejected, to see why. Structured output only.
      rawToolInput: response.status === 200 ? null : captured.toolInput,
    }
  }
}

async function pool<T, R>(items: T[], size: number, work: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length)
  let next = 0
  await Promise.all(
    Array.from({ length: Math.min(size, items.length) }, async () => {
      while (next < items.length) {
        const index = next++
        results[index] = await work(items[index]!)
      }
    }),
  )
  return results
}

const pricingFromEnv = (): Pricing => ({
  input: Number(process.env.EVAL_PRICE_INPUT ?? 3),
  output: Number(process.env.EVAL_PRICE_OUTPUT ?? 15),
  source: process.env.EVAL_PRICE_INPUT ? 'EVAL_PRICE_* override' : 'ASSUMED $3 / $15 per million input / output tokens; confirm against current pricing',
})

/** Re-score a saved run: same model output, current deterministic code. */
function rescore(file: string) {
  const saved = JSON.parse(readFileSync(resolve(ROOT, file), 'utf8')) as {
    results: (RunRecord & { interpretation: NarrationInterpretation | null; rawToolInput?: unknown })[]
  }
  const records: RunRecord[] = saved.results.map(({ interpretation, ...record }) => {
    const entry = EVAL_CASES.find((item) => item.id === record.caseId)!
    // A rejected response is re-read through the current server repair, as the endpoint would now.
    const read = (() => {
      try {
        return interpretation ? readInterpretation(interpretation) : record.rawToolInput ? readInterpretation(fillUnsaid(record.rawToolInput)) : null
      } catch {
        return null
      }
    })()
    const { interpretation: _unused, rawToolInput: _raw, ...rest } = record as RunRecord & { interpretation?: unknown; rawToolInput?: unknown }
    return { ...rest, score: scoreCase(entry, read, read ? null : record.score.failure) }
  })
  const ids = new Set(records.map((record) => record.caseId))
  const summary = summarize(EVAL_CASES.filter((entry) => ids.has(entry.id)), records, pricingFromEnv())
  write(`Re-scored ${file} against the current code (no provider calls).
`)
  write(summaryText(summary, records))
}

it('live narration evaluation', async () => {
  if (process.env.EVAL_RESCORE) return rescore(process.env.EVAL_RESCORE)
  const vars = readDevVars()
  const key = vars.ANTHROPIC_API_KEY ?? process.env.ANTHROPIC_API_KEY
  if (!key?.trim()) {
    throw new Error(
      'ANTHROPIC_API_KEY is not available. Put a DEVELOPMENT key in .dev.vars at the repository root (ANTHROPIC_API_KEY=...). ' +
        'It is git-ignored. Never use a VITE_ variable for it.',
    )
  }
  const model = process.env.EVAL_MODEL || vars.NARRATION_MODEL || undefined
  const env: NarrationEnv = { ANTHROPIC_API_KEY: key, ...(model ? { NARRATION_MODEL: model } : {}) }
  const pricing = pricingFromEnv()

  const only = process.env.EVAL_CASES?.split(',').map((id) => id.trim()).filter(Boolean)
  const cases = only ? EVAL_CASES.filter((entry) => only.includes(entry.id)) : EVAL_CASES
  const repeats = Number(process.env.EVAL_REPEATS ?? 0)
  const jobs = [
    ...cases.map((entry) => ({ entry, attempt: 1 })),
    ...cases.filter((entry) => REPEAT_IDS.includes(entry.id)).flatMap((entry) => Array.from({ length: repeats }, (_, index) => ({ entry, attempt: index + 2 }))),
  ]
  write(`Evaluating ${jobs.length} provider calls (${cases.length} cases) with model ${model ?? '(endpoint default)'}…`)

  const results = await pool(jobs, Number(process.env.EVAL_CONCURRENCY ?? 3), async ({ entry, attempt }) => {
    const result = await runCase(entry, attempt, env)
    write(`  ${entry.id}#${attempt} ${result.score.verdict}${result.score.problems.length ? ` — ${result.score.problems[0]}` : ''} (${result.latencyMs} ms)`)
    return result
  })
  const records: RunRecord[] = results.map(({ interpretation: _i, rawToolInput: _r, ...record }) => record)
  const summary = summarize(cases, records, pricing)

  const label = (process.env.EVAL_LABEL ?? 'run').replace(/[^a-z0-9-]/gi, '-')
  const date = new Date().toISOString()
  const dir = join(ROOT, 'eval', 'narration', 'runs')
  mkdirSync(dir, { recursive: true })
  const file = join(dir, `${date.slice(0, 19).replace(/[:T]/g, '-')}-${label}.json`)
  writeFileSync(
    file,
    JSON.stringify(
      {
        meta: {
          input: 'SYNTHETIC evaluation corpus (eval/narration/cases.ts); no real or production narrations',
          model: model ?? 'endpoint default',
          date,
          schemaVersion: NARRATION_SCHEMA_VERSION,
          promptSha256: createHash('sha256').update(SYSTEM_PROMPT).digest('hex').slice(0, 16),
          label,
          note: 'Structured tool output and usage metadata only. No request headers, no hidden reasoning.',
        },
        summary,
        results,
      },
      null,
      2,
    ),
  )
  write('')
  write(summaryText(summary, records))
  write(`\nRun file: ${file}`)
}, 60 * 60 * 1000)
