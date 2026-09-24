import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { Page } from '../components/Page'
import { RakeEditor } from '../components/RakeEditor'
import { newId } from '../domain/poker/factories'
import type { RakeStructure } from '../domain/poker/models'
import { parseHandExport } from '../domain/poker/serialize'
import { NO_RAKE } from '../domain/poker/rake'
import { MAX_IMPORT_BYTES, ValidationError } from '../domain/poker/validation'
import { TABLE_SIZES } from '../domain/poker/positions'
import { useStore } from '../store/context'
import { useActiveSession } from '../store/useActiveSession'
import { readTextFile } from '../utils/files'

export function SettingsPage() {
  const navigate = useNavigate()
  const {
    settings,
    saveSettings,
    rakePresets,
    saveRakePreset,
    deleteRakePreset,
    saveHand,
    hands,
    sessions,
  } = useStore()
  const { session: activeSession } = useActiveSession()

  const fileInput = useRef<HTMLInputElement>(null)
  const [importIssues, setImportIssues] = useState<string[]>([])
  const [importedName, setImportedName] = useState<string | null>(null)
  const [editingPreset, setEditingPreset] = useState<RakeStructure | null>(null)

  const importHand = async (file: File) => {
    setImportIssues([])
    setImportedName(null)
    try {
      const text = await readTextFile(file, MAX_IMPORT_BYTES)
      const record = parseHandExport(text, {
        newId,
        ...(activeSession ? { sessionId: activeSession.id } : {}),
      })
      const nextNumber =
        hands.filter((hand) => hand.sessionId === record.sessionId).reduce(
          (max, hand) => Math.max(max, hand.handNumber),
          0,
        ) + 1
      const stored = { ...record, handNumber: record.handNumber || nextNumber }
      await saveHand(stored)
      setImportedName(file.name)
      void navigate(`/hands/${stored.id}`)
    } catch (cause) {
      if (cause instanceof ValidationError) setImportIssues(cause.issues)
      else setImportIssues([cause instanceof Error ? cause.message : 'That file could not be read.'])
    }
  }

  return (
    <Page title="Settings">
      <div className="space-y-5 pb-8">
        <section className="card-surface space-y-4 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
            Defaults for new sessions
          </h2>

          <label className="block">
            <span className="label">Default location</span>
            <input
              className="field"
              maxLength={120}
              value={settings.defaultLocation}
              onChange={(event) =>
                void saveSettings({ ...settings, defaultLocation: event.target.value })
              }
            />
          </label>

          <label className="block">
            <span className="label">Default table size</span>
            <select
              className="field"
              value={settings.defaultTableSize}
              onChange={(event) =>
                void saveSettings({ ...settings, defaultTableSize: Number(event.target.value) })
              }
            >
              {TABLE_SIZES.map((size) => (
                <option key={size} value={size}>
                  {size}-handed
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="label">Default drop</span>
            <select
              className="field"
              value={settings.defaultRakePresetId ?? ''}
              onChange={(event) =>
                void saveSettings({
                  ...settings,
                  defaultRakePresetId: event.target.value || null,
                })
              }
            >
              <option value="">No default</option>
              {rakePresets.map((preset) => (
                <option key={preset.id} value={preset.id}>
                  {preset.name}
                </option>
              ))}
            </select>
          </label>
        </section>

        <section className="card-surface space-y-3 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
            Rake presets
          </h2>
          <p className="text-xs text-room-400">
            The presets shipped with the app are examples, not a record of any room's current
            structure. Check the posted drop and edit before relying on them.
          </p>
          <ul className="space-y-2">
            {rakePresets.map((preset) => (
              <li key={preset.id} className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn-secondary flex-1 justify-start"
                  onClick={() => setEditingPreset(preset)}
                >
                  {preset.name}
                </button>
                {preset.id !== NO_RAKE.id && (
                  <button
                    type="button"
                    className="btn-ghost"
                    aria-label={`Delete preset ${preset.name}`}
                    onClick={() => void deleteRakePreset(preset.id)}
                  >
                    Delete
                  </button>
                )}
              </li>
            ))}
          </ul>
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => setEditingPreset({ ...NO_RAKE, id: newId(), name: 'New preset' })}
          >
            New preset
          </button>

          {editingPreset && (
            <div className="mt-3 rounded-lg border border-room-700 p-3">
              <RakeEditor
                value={editingPreset}
                onChange={setEditingPreset}
                presets={rakePresets}
              />
              <div className="mt-3 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={() => setEditingPreset(null)}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={async () => {
                    await saveRakePreset(editingPreset)
                    setEditingPreset(null)
                  }}
                >
                  Save preset
                </button>
              </div>
            </div>
          )}
        </section>

        <section className="card-surface space-y-3 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
            Import a hand
          </h2>
          <p className="text-xs text-room-400">
            Imported files are validated against the hand schema before anything is stored, and the
            hand is replayed from its action history rather than trusting the totals in the file.
          </p>
          <input
            ref={fileInput}
            type="file"
            accept="application/json,.json"
            className="sr-only"
            onChange={(event) => {
              const file = event.target.files?.[0]
              if (file) void importHand(file)
              event.target.value = ''
            }}
          />
          <button
            type="button"
            className="btn-secondary w-full"
            onClick={() => fileInput.current?.click()}
          >
            Choose a .json file
          </button>
          {importedName && (
            <p role="status" className="text-sm text-felt-200">
              Imported {importedName}.
            </p>
          )}
          {importIssues.length > 0 && (
            <div role="alert" className="rounded-lg border border-chip-red/40 bg-chip-red/10 p-3">
              <p className="text-sm font-semibold text-chip-red">That file was rejected.</p>
              <ul className="mt-1 list-inside list-disc text-sm text-chip-red">
                {importIssues.slice(0, 8).map((issue) => (
                  <li key={issue}>{issue}</li>
                ))}
              </ul>
            </div>
          )}
        </section>

        <section className="card-surface space-y-2 p-3">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-room-400">
            Your data
          </h2>
          <p className="text-sm text-room-300 tabular">
            {sessions.length} session{sessions.length === 1 ? '' : 's'} · {hands.length} hand
            {hands.length === 1 ? '' : 's'}
          </p>
          <p className="text-xs text-room-400">
            Everything lives in this browser on this device. Nothing is uploaded anywhere. Clearing
            site data removes it, so export any hand you want to keep.
          </p>
        </section>
      </div>
    </Page>
  )
}
