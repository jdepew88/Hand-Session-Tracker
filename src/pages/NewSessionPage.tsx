import { useId, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { MoneyField } from '../components/MoneyField'
import { Page } from '../components/Page'
import { RakeEditor } from '../components/RakeEditor'
import type { Cents } from '../domain/money'
import { createSession } from '../domain/poker/factories'
import { GAME_TYPES, type AnteMode, type RakeStructure } from '../domain/poker/models'
import { TABLE_SIZES, positionsForTableSize } from '../domain/poker/positions'
import { NO_RAKE } from '../domain/poker/rake'
import { useStore } from '../store/context'

export function NewSessionPage() {
  const navigate = useNavigate()
  const { settings, rakePresets, saveSession, saveRakePreset, setActiveSessionId } = useStore()

  const locationId = useId()
  const gameId = useId()
  const tableId = useId()
  const anteModeId = useId()
  const notesId = useId()

  const [location, setLocation] = useState(settings.defaultLocation)
  const [gameType, setGameType] = useState<string>(GAME_TYPES[0])
  const [smallBlind, setSmallBlind] = useState<Cents>(500)
  const [bigBlind, setBigBlind] = useState<Cents>(500)
  const [ante, setAnte] = useState<Cents>(0)
  const [anteMode, setAnteMode] = useState<AnteMode>('none')
  const [straddle, setStraddle] = useState<Cents>(0)
  const [tableSize, setTableSize] = useState(settings.defaultTableSize)
  const [buyIn, setBuyIn] = useState<Cents>(50_000)
  const [startingStack, setStartingStack] = useState<Cents>(50_000)
  const [notes, setNotes] = useState('')
  const [rake, setRake] = useState<RakeStructure>(
    () => rakePresets.find((preset) => preset.id === settings.defaultRakePresetId) ?? NO_RAKE,
  )
  const [saving, setSaving] = useState(false)

  const positions = positionsForTableSize(tableSize)

  const submit = async (event: React.FormEvent) => {
    event.preventDefault()
    if (saving) return
    setSaving(true)
    const session = createSession({
      location: location.trim(),
      gameType,
      smallBlind,
      bigBlind,
      ante,
      anteMode: ante > 0 ? anteMode : 'none',
      straddleAmount: straddle > 0 ? straddle : null,
      tableSize,
      buyIn,
      startingStack,
      rake,
      notes,
    })
    await saveSession(session)
    setActiveSessionId(session.id)
    void navigate(`/sessions/${session.id}`, { replace: true })
  }

  return (
    <Page title="New session" back={{ to: '/sessions', label: 'Sessions' }}>
      <form onSubmit={submit} className="space-y-6 pb-8">
        <section className="card-surface space-y-4 p-3">
          <div>
            <label className="label" htmlFor={locationId}>
              Location
            </label>
            <input
              id={locationId}
              className="field"
              value={location}
              maxLength={120}
              autoComplete="off"
              placeholder="Commerce Casino"
              onChange={(event) => setLocation(event.target.value)}
            />
          </div>

          <div>
            <label className="label" htmlFor={gameId}>
              Game
            </label>
            <select
              id={gameId}
              className="field"
              value={gameType}
              onChange={(event) => setGameType(event.target.value)}
            >
              {GAME_TYPES.map((game) => (
                <option key={game} value={game}>
                  {game}
                </option>
              ))}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyField label="Small blind" value={smallBlind} onChange={setSmallBlind} />
            <MoneyField label="Big blind" value={bigBlind} onChange={setBigBlind} />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <MoneyField label="Buy-in" value={buyIn} onChange={setBuyIn} />
            <MoneyField
              label="Starting stack"
              value={startingStack}
              onChange={setStartingStack}
              hint="Used as the default stack for each seat."
            />
          </div>

          <div>
            <label className="label" htmlFor={tableId}>
              Table
            </label>
            <select
              id={tableId}
              className="field"
              value={tableSize}
              onChange={(event) => setTableSize(Number(event.target.value))}
            >
              {TABLE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}-handed
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-room-400">
              Positions in play: {positions.join(', ')}
            </p>
          </div>
        </section>

        <details className="card-surface p-3">
          <summary className="cursor-pointer text-sm font-semibold">Antes and straddles</summary>
          <div className="mt-4 space-y-4">
            <div className="grid grid-cols-2 gap-3">
              <MoneyField label="Ante" value={ante} onChange={setAnte} />
              <div>
                <label className="label" htmlFor={anteModeId}>
                  Ante posted by
                </label>
                <select
                  id={anteModeId}
                  className="field"
                  value={anteMode}
                  disabled={ante === 0}
                  onChange={(event) => setAnteMode(event.target.value as AnteMode)}
                >
                  <option value="all">Every player</option>
                  <option value="bb">Big blind</option>
                  <option value="button">Button</option>
                </select>
              </div>
            </div>
            <MoneyField
              label="Default straddle"
              value={straddle}
              onChange={setStraddle}
              hint="Offered when starting a hand. Leave at $0 if the game does not straddle."
            />
          </div>
        </details>

        <details className="card-surface p-3">
          <summary className="cursor-pointer text-sm font-semibold">
            Rake and drop
            <span className="ml-2 font-normal text-room-400">{rake.name}</span>
          </summary>
          <div className="mt-4">
            <RakeEditor
              value={rake}
              onChange={setRake}
              presets={rakePresets}
              onSavePreset={(preset) => void saveRakePreset(preset)}
            />
          </div>
        </details>

        <div>
          <label className="label" htmlFor={notesId}>
            Session notes
          </label>
          <textarea
            id={notesId}
            className="field min-h-20"
            rows={2}
            maxLength={4000}
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
          />
        </div>

        <button type="submit" className="btn-primary h-14 w-full text-base" disabled={saving}>
          Start session
        </button>
      </form>
    </Page>
  )
}
