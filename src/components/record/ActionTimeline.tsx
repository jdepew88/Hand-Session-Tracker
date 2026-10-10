import type { ActionWords } from '../../domain/poker/draft/text'
import './record.css'

/**
 * One street's action as a row of tokens: "CO RAISE → Hero 3-BET → CO CALL".
 * Each token is read as a sentence ("Cutoff raised to $20."), and a token for
 * an action that cannot have happened is marked in words as well as colour.
 */
export function ActionTimeline({
  words,
  label,
  heroSeat,
  empty = 'Nothing recorded yet.',
}: {
  words: readonly ActionWords[]
  label: string
  heroSeat: number
  empty?: string
}) {
  if (words.length === 0) return <p className="text-sm text-room-400">{empty}</p>
  return (
    <ol aria-label={label} className="flex flex-wrap items-center gap-x-1 gap-y-1.5">
      {words.map((word, index) => (
        <li key={word.id} className="flex items-center gap-1">
          {index > 0 && (
            <span aria-hidden="true" className="rc-arrow">
              &rarr;
            </span>
          )}
          <span
            aria-hidden="true"
            className={`rc-token ${word.seat === heroSeat ? 'rc-token--hero' : ''} ${word.problem ? 'rc-token--problem' : ''}`}
          >
            <span className="rc-token__who">{word.who}</span>
            <span className="rc-token__verb">{word.token}</span>
            {word.amount && <span className="rc-token__amount">{word.amount}</span>}
            {word.problem && <span className="text-[0.7rem] font-bold text-chip-red">!</span>}
          </span>
          <span className="sr-only">
            {word.spoken}
            {word.problem ? ' This action does not fit the hand.' : ''}
          </span>
        </li>
      ))}
    </ol>
  )
}
