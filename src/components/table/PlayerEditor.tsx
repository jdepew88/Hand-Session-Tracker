import { useId, useState } from 'react'
import { formatCents, type Cents } from '../../domain/money'
import { PLAYER_TAGS, type PlayerProfile, type PlayerTag } from '../../domain/poker/models'
import { legacyStyle, playerAliases, playerTags, type PlayerDetails } from '../../domain/poker/players'
import { formatDateTime } from '../../utils/labels'
import { MoneyField } from '../MoneyField'

/**
 * A player at the table, as a small table-side card: label, tags in words,
 * stack, and the first lines of the notes. No avatars, no colour coding --
 * nothing is read into a label like "Old Man Coffee".
 */
export function PlayerCard({
  player,
  stack,
  stackIsDefault,
  fallback,
}: {
  player: PlayerProfile | null
  stack: Cents
  stackIsDefault: boolean
  /** Shown when the player has no label: "You", "Seat 4". */
  fallback: string
}) {
  const tags = player ? playerTags(player) : []
  const style = player ? legacyStyle(player) : null
  const label = player?.nickname.trim()
  return (
    <div className="rounded-lg border border-room-700 bg-room-850 px-3 py-2.5">
      <div className="flex items-baseline justify-between gap-3">
        <p className={`min-w-0 truncate text-sm font-bold uppercase tracking-[0.08em] ${label ? 'text-bone-50' : 'text-room-400'}`}>
          {label || fallback}
        </p>
        <p className="shrink-0 text-sm font-semibold tabular text-bone-50">
          {formatCents(stack)}
          {stackIsDefault && <span className="ml-1 text-xs font-normal text-room-400">default</span>}
        </p>
      </div>
      {(tags.length > 0 || style) && (
        <p className="mt-0.5 text-xs text-room-300">
          {tags.join(' · ')}
          {style && `${tags.length > 0 ? ' · ' : ''}${style}`}
        </p>
      )}
      {player && player.notes.trim() !== '' && (
        <p className="mt-1.5 line-clamp-2 whitespace-pre-line text-xs text-room-300">{player.notes.trim()}</p>
      )}
    </div>
  )
}

export interface PlayerEdit extends PlayerDetails {
  stack: Cents
  stackChanged: boolean
}

/**
 * Edit a player at the table: label, stack, quick tags, notes, and -- folded
 * away -- other names they go by. Save sits at the top as well as the bottom,
 * so the phone keyboard never hides it while typing notes.
 */
export function PlayerEditor({
  player,
  stack,
  isHero,
  onSave,
  onCancel,
}: {
  player: PlayerProfile | null
  stack: Cents
  isHero: boolean
  onSave: (edit: PlayerEdit) => Promise<void>
  onCancel?: () => void
}) {
  const id = useId()
  const [nickname, setNickname] = useState(player?.nickname ?? '')
  const [value, setValue] = useState<Cents>(stack)
  const [tags, setTags] = useState<PlayerTag[]>(playerTags(player))
  const [notes, setNotes] = useState(player?.notes ?? '')
  const [aliases, setAliases] = useState(playerAliases(player).join(', '))
  const [saving, setSaving] = useState(false)

  const original = {
    nickname: player?.nickname ?? '',
    tags: playerTags(player).join(','),
    notes: player?.notes ?? '',
    aliases: playerAliases(player).join(', '),
  }
  const dirty =
    nickname.trim() !== original.nickname.trim() ||
    tags.join(',') !== original.tags ||
    notes !== original.notes ||
    aliases.trim() !== original.aliases ||
    value !== stack

  const toggle = (tag: PlayerTag) => setTags((current) => (current.includes(tag) ? current.filter((entry) => entry !== tag) : [...current, tag]))

  const save = async () => {
    if (!dirty || saving) return
    setSaving(true)
    try {
      await onSave({
        nickname,
        tags,
        notes,
        aliases: aliases.split(','),
        stack: value,
        stackChanged: value !== stack,
      })
    } finally {
      setSaving(false)
    }
  }

  const actions = (
    <div className="flex gap-2">
      {onCancel && (
        <button type="button" className="btn-ghost px-3" onClick={onCancel}>
          Cancel
        </button>
      )}
      <button type="submit" className="btn-primary px-4" disabled={!dirty || saving}>
        Save player
      </button>
    </div>
  )

  return (
    <form
      aria-labelledby={`${id}-title`}
      className="space-y-3"
      onSubmit={(event) => {
        event.preventDefault()
        void save()
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <h3 id={`${id}-title`} className="text-sm font-semibold text-room-300">
          {player ? 'Edit player' : isHero ? 'You' : 'Who is here?'}
        </h3>
        {actions}
      </div>

      <div className="grid grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] gap-3">
        <div>
          <label className="label" htmlFor={`${id}-name`}>
            Player
          </label>
          <input
            id={`${id}-name`}
            className="field"
            value={nickname}
            maxLength={120}
            autoComplete="off"
            placeholder={isHero ? 'You' : 'Hoodie Guy'}
            onChange={(event) => setNickname(event.target.value)}
          />
        </div>
        <MoneyField label="Stack" value={value} onChange={setValue} />
      </div>

      <fieldset>
        <legend className="label">Tags</legend>
        <div className="flex flex-wrap gap-1.5">
          {PLAYER_TAGS.map((tag) => {
            const on = tags.includes(tag)
            return (
              <button
                key={tag}
                type="button"
                aria-pressed={on}
                onClick={() => toggle(tag)}
                className={`tap rounded-lg border px-2.5 text-sm ${
                  on ? 'border-bone-200/70 bg-room-700 font-semibold text-bone-50' : 'border-room-700 bg-room-850 text-room-300'
                }`}
              >
                {on && (
                  <span aria-hidden="true" className="mr-1">
                    ✓
                  </span>
                )}
                {tag}
              </button>
            )
          })}
        </div>
      </fieldset>

      <div>
        <label className="label" htmlFor={`${id}-notes`}>
          Notes
        </label>
        <textarea
          id={`${id}-notes`}
          className="field min-h-20"
          rows={3}
          maxLength={4000}
          placeholder="Limp-calls too wide. Bluffed river with missed clubs."
          value={notes}
          aria-describedby={player?.notesUpdatedAt ? `${id}-noted` : undefined}
          onChange={(event) => setNotes(event.target.value)}
        />
        {player?.notesUpdatedAt && (
          <p id={`${id}-noted`} className="mt-1 text-xs text-room-400">
            Notes updated {formatDateTime(player.notesUpdatedAt)}
          </p>
        )}
      </div>

      <details>
        <summary className="cursor-pointer text-sm text-room-300">Other names{aliases.trim() ? `: ${aliases}` : ''}</summary>
        <div className="mt-2">
          <label className="label" htmlFor={`${id}-aliases`}>
            Also called
          </label>
          <input
            id={`${id}-aliases`}
            className="field"
            value={aliases}
            maxLength={400}
            autoComplete="off"
            placeholder="hoodie, sunglasses guy"
            aria-describedby={`${id}-aliases-hint`}
            onChange={(event) => setAliases(event.target.value)}
          />
          <p id={`${id}-aliases-hint`} className="mt-1 text-xs text-room-400">
            Separate with commas. Used to recognise who you mean; notes never are.
          </p>
        </div>
      </details>

      <div className="flex justify-end">{actions}</div>
    </form>
  )
}
