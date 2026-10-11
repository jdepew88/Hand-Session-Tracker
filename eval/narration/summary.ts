import type { CaseKind, EvalCase } from './cases'
import type { CaseScore, Tally } from './score'

/** One provider call, as recorded by the live runner. Structured output and normal metadata only. */
export interface RunRecord {
  caseId: string
  attempt: number
  /** The endpoint's HTTP status (200, or the error it translated to). */
  status: number
  error: string | null
  /** Provider HTTP status, when the provider was reached. */
  providerStatus: number | null
  latencyMs: number
  retries: number
  usage: { input: number; output: number; cacheRead: number; cacheWrite: number } | null
  stopReason: string | null
  score: CaseScore
}

export interface Pricing {
  /** US dollars per million tokens. */
  input: number
  output: number
  source: string
}

const rate = (tally: Tally) => (tally.total === 0 ? null : tally.passed / tally.total)
const pct = (value: number | null) => (value === null ? 'n/a' : `${(value * 100).toFixed(1)}%`)
const sum = (tallies: Tally[]): Tally => tallies.reduce((all, entry) => ({ passed: all.passed + entry.passed, total: all.total + entry.total }), { passed: 0, total: 0 })

function quantile(values: number[], q: number): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  return sorted[Math.min(sorted.length - 1, Math.floor(q * sorted.length))]!
}

export const costOf = (usage: RunRecord['usage'], pricing: Pricing) =>
  usage ? (usage.input * pricing.input + usage.cacheWrite * pricing.input * 1.25 + usage.cacheRead * pricing.input * 0.1 + usage.output * pricing.output) / 1_000_000 : 0

const classOf = (check: string) => {
  if (check === 'participants' || check === 'button') return 'players / positions'
  if (check === 'heroCards' || check.startsWith('board') || check.startsWith('shown')) return 'cards / board'
  if (check.startsWith('actions')) return 'actions'
  if (check.startsWith('amounts')) return 'amounts'
  if (check.startsWith('ratio')) return 'pot fractions'
  if (check.startsWith('showdown') || check === 'winners') return 'showdown / result'
  if (check.startsWith('asks')) return 'resolved what it should have asked'
  if (check === 'contradiction') return 'missed contradiction'
  return check
}

export function summarize(cases: EvalCase[], records: RunRecord[], pricing: Pricing) {
  const firstRuns = records.filter((record) => record.attempt === 1)
  const scores = firstRuns.map((record) => record.score)
  const n = scores.length
  const by = (verdict: CaseScore['verdict']) => scores.filter((score) => score.verdict === verdict).length
  const tallies = (key: keyof CaseScore['tallies']) => sum(scores.map((score) => score.tallies[key]))
  const contradictionCases = cases.filter((entry) => entry.expect.contradiction).map((entry) => entry.id)
  const contradictionScores = scores.filter((score) => contradictionCases.includes(score.caseId))

  const failureClasses = new Map<string, number>()
  for (const score of scores) {
    const classes = new Set(Object.entries(score.checks).filter(([, ok]) => !ok).map(([name]) => classOf(name)))
    if (score.draftInventions.length > 0) classes.add('invented fact in the hand')
    if (score.unanswered.length > 0) classes.add('question the narrator could not answer')
    if (score.verdict === 'failed') classes.add('parse failed')
    for (const entry of classes) failureClasses.set(entry, (failureClasses.get(entry) ?? 0) + 1)
  }
  const inventionKinds = new Map<string, number>()
  for (const score of scores) for (const entry of score.inventions) inventionKinds.set(entry.split(' ')[0]!, (inventionKinds.get(entry.split(' ')[0]!) ?? 0) + 1)

  const kinds = new Map<CaseKind, { n: number; ok: number }>()
  for (const score of scores) {
    for (const kind of cases.find((entry) => entry.id === score.caseId)?.kinds ?? []) {
      const entry = kinds.get(kind) ?? { n: 0, ok: 0 }
      kinds.set(kind, { n: entry.n + 1, ok: entry.ok + (score.verdict === 'correct' || score.verdict === 'clarified' ? 1 : 0) })
    }
  }

  // Repeatability: the same narration, several runs.
  const repeated = new Map<string, string[]>()
  for (const record of records) repeated.set(record.caseId, [...(repeated.get(record.caseId) ?? []), record.score.fingerprint])
  const repeatability = [...repeated.entries()]
    .filter(([, prints]) => prints.length > 1)
    .map(([caseId, prints]) => ({
      caseId,
      runs: prints.length,
      distinct: new Set(prints).size,
      verdicts: records.filter((record) => record.caseId === caseId).map((record) => record.score.verdict),
    }))

  const ok = records.filter((record) => record.status === 200)
  const latencies = records.filter((record) => record.usage).map((record) => record.latencyMs)
  const usages = records.map((record) => record.usage).filter((usage): usage is NonNullable<RunRecord['usage']> => usage !== null)
  const totalCost = records.reduce((total, record) => total + costOf(record.usage, pricing), 0)

  return {
    cases: n,
    calls: records.length,
    fullyCorrect: by('correct') / n,
    acceptableWithClarification: by('clarified') / n,
    acceptableTotal: (by('correct') + by('clarified')) / n,
    wrong: by('wrong') / n,
    failedParse: by('failed') / n,
    hallucinationRaw: scores.filter((score) => score.inventions.length > 0).length / n,
    hallucinationInHand: scores.filter((score) => score.draftInventions.length > 0).length / n,
    overInterpretation: scores.filter((score) => score.overInterpretations.length > 0).length / n,
    playerAmbiguity: scores.filter((score) => score.asked.includes('who') || score.asked.includes('actor')).length / n,
    anyClarification: scores.filter((score) => score.asked.length > 0).length / n,
    contradictionDetection: contradictionScores.length ? contradictionScores.filter((score) => score.contradictionFlagged).length / contradictionScores.length : null,
    falseContradictions: scores.filter((score) => score.falseContradiction).length,
    accuracy: {
      players: rate(tallies('players')),
      cards: rate(tallies('cards')),
      actions: rate(tallies('actions')),
      amounts: rate(tallies('amounts')),
      ratios: rate(tallies('ratios')),
      showdown: rate(tallies('showdown')),
    },
    failureClasses: Object.fromEntries([...failureClasses.entries()].sort((a, b) => b[1] - a[1])),
    inventionKinds: Object.fromEntries(inventionKinds),
    kinds: Object.fromEntries([...kinds.entries()].map(([kind, entry]) => [kind, `${entry.ok}/${entry.n}`])),
    repeatability,
    latencyMs: { median: quantile(latencies, 0.5), p90: quantile(latencies, 0.9), max: latencies.length ? Math.max(...latencies) : null },
    tokens: {
      inputMean: usages.length ? Math.round(usages.reduce((total, usage) => total + usage.input + usage.cacheRead + usage.cacheWrite, 0) / usages.length) : null,
      outputMean: usages.length ? Math.round(usages.reduce((total, usage) => total + usage.output, 0) / usages.length) : null,
      outputMax: usages.length ? Math.max(...usages.map((usage) => usage.output)) : null,
    },
    cost: { total: totalCost, perParse: ok.length ? totalCost / records.length : null, pricing },
    httpErrors: records.filter((record) => record.status !== 200).map((record) => `${record.caseId}#${record.attempt}: ${record.status} ${record.error ?? ''} (provider ${record.providerStatus ?? '-'})`),
  }
}

export type Summary = ReturnType<typeof summarize>

/** The summary and every problem, as plain text for the terminal. */
export function summaryText(summary: Summary, records: RunRecord[]): string {
  const lines = [
    `Cases ${summary.cases}, provider calls ${summary.calls}`,
    `Fully correct ${pct(summary.fullyCorrect)} · correct after clarification ${pct(summary.acceptableWithClarification)} · acceptable total ${pct(summary.acceptableTotal)}`,
    `Wrong ${pct(summary.wrong)} · failed parse ${pct(summary.failedParse)}`,
    `Hallucination: raw response ${pct(summary.hallucinationRaw)} · surviving into the hand ${pct(summary.hallucinationInHand)} · over-interpretation ${pct(summary.overInterpretation)}`,
    `Clarification asked ${pct(summary.anyClarification)} · player-reference questions ${pct(summary.playerAmbiguity)}`,
    `Contradiction detection ${pct(summary.contradictionDetection)} · false contradictions ${summary.falseContradictions}`,
    `Accuracy: players ${pct(summary.accuracy.players)} · cards ${pct(summary.accuracy.cards)} · actions ${pct(summary.accuracy.actions)} · amounts ${pct(summary.accuracy.amounts)} · pot fractions ${pct(summary.accuracy.ratios)} · showdown ${pct(summary.accuracy.showdown)}`,
    `Latency median ${summary.latencyMs.median} ms · p90 ${summary.latencyMs.p90} ms · max ${summary.latencyMs.max} ms`,
    `Tokens per call: input ${summary.tokens.inputMean}, output ${summary.tokens.outputMean} (max ${summary.tokens.outputMax})`,
    `Cost: $${summary.cost.total.toFixed(4)} total, $${(summary.cost.perParse ?? 0).toFixed(4)} per parse (${summary.cost.pricing.source})`,
    `Failure classes: ${JSON.stringify(summary.failureClasses)}`,
    `Raw invention kinds: ${JSON.stringify(summary.inventionKinds)}`,
    `By kind (acceptable/n): ${JSON.stringify(summary.kinds)}`,
    `Repeatability: ${summary.repeatability.map((entry) => `${entry.caseId} ${entry.distinct}/${entry.runs} distinct [${entry.verdicts.join(',')}]`).join(' · ') || 'none'}`,
    ...(summary.httpErrors.length ? [`HTTP errors: ${summary.httpErrors.join('; ')}`] : []),
    '',
    ...records
      .filter((record) => record.score.problems.length > 0 || record.score.overInterpretations.length > 0)
      .map(
        (record) =>
          `${record.caseId}#${record.attempt} ${record.score.verdict.toUpperCase()}: ${[...record.score.problems, ...record.score.overInterpretations.map((entry) => `Over-interpreted: ${entry}`)].join(' ')}`,
      ),
  ]
  return lines.join('\n')
}
