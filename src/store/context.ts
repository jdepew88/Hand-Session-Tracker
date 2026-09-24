import { createContext, useContext } from 'react'
import type {
  AppSettings,
  HandRecord,
  PlayerProfile,
  RakeStructure,
  Session,
} from '../domain/poker/models'

export interface StoreValue {
  ready: boolean
  error: string | null
  sessions: Session[]
  hands: HandRecord[]
  players: PlayerProfile[]
  rakePresets: RakeStructure[]
  settings: AppSettings
  activeSessionId: string | null
  setActiveSessionId: (id: string | null) => void

  saveSession: (session: Session) => Promise<void>
  deleteSession: (id: string) => Promise<void>
  saveHand: (hand: HandRecord) => Promise<void>
  deleteHand: (id: string) => Promise<void>
  savePlayers: (players: readonly PlayerProfile[]) => Promise<void>
  deletePlayer: (id: string) => Promise<void>
  saveRakePreset: (preset: RakeStructure) => Promise<void>
  deleteRakePreset: (id: string) => Promise<void>
  saveSettings: (settings: AppSettings) => Promise<void>
  reload: () => Promise<void>
}

export const StoreContext = createContext<StoreValue | null>(null)

export function useStore(): StoreValue {
  const value = useContext(StoreContext)
  if (!value) throw new Error('useStore must be used inside <StoreProvider>')
  return value
}
