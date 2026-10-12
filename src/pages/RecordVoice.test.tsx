// @vitest-environment jsdom
import 'fake-indexeddb/auto'
import { act, cleanup, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import { MemoryRouter } from 'react-router-dom'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { App } from '../App'
import { createPlayer, createSession } from '../domain/poker/factories'
import type { HandRecord, Session } from '../domain/poker/models'
import type { HandNarrationParser, NarrationRequest } from '../domain/poker/narration/parser'
import { onDeviceParser } from '../domain/poker/narration/local'
import { SERVICE_NOTICE } from '../services/narrationParser'
import type * as NarrationParserModule from '../services/narrationParser'
import { fakeTranscriber, type FakeTranscriber } from '../services/speech/fakeTranscriber'
import { SPEECH_ERROR_TEXT } from '../services/speech/recorder'
import type * as SpeechModule from '../services/speech'
import { STORES, idb, resetDatabaseConnection } from '../storage/db'
import { PREFERENCE_KEYS } from '../storage/preferences'
import { indexedDbRepositories } from '../storage/repositories'
import { StoreProvider } from '../store/StoreProvider'

/**
 * Speaking a hand, against the real store and storage, with a scripted
 * transcriber in place of the microphone. The table is the one in
 * RecordNarration.test.tsx: six chairs, seat 4 empty, Hero on the button in
 * seat 6, "Hoodie guy" in the cutoff (seat 5).
 */

const swap = vi.hoisted(() => ({
  parser: null as HandNarrationParser | null,
  speech: null as FakeTranscriber | null,
}))

vi.mock('../services/narrationParser', async (importOriginal) => {
  const actual = await importOriginal<typeof NarrationParserModule>()
  return { ...actual, activeNarrationParser: () => swap.parser ?? actual.activeNarrationParser() }
})

vi.mock('../services/speech', async (importOriginal) => {
  const actual = await importOriginal<typeof SpeechModule>()
  return { ...actual, activeSpeechTranscriber: () => swap.speech?.transcriber ?? actual.activeSpeechTranscriber() }
})

function renderAt(route: string) {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <StoreProvider repositories={indexedDbRepositories}>
        <App />
      </StoreProvider>
    </MemoryRouter>,
  )
}

async function seed() {
  const session: Session = createSession({
    location: 'Commerce Casino',
    gameType: "No-Limit Hold'em",
    smallBlind: 200,
    bigBlind: 500,
    tableSize: 6,
    buyIn: 100_000,
    startingStack: 100_000,
    heroSeat: 6,
    buttonSeat: 6,
  })
  session.seatStatus = { ...session.seatStatus, 4: 'empty' }
  await indexedDbRepositories.sessions.save(session)
  await indexedDbRepositories.players.saveMany([{ ...createPlayer(session.id, 5), nickname: 'Hoodie guy', notes: 'PRIVATE: never send this' }])
}

const savedHands = () => indexedDbRepositories.hands.listAll()
const button = (name: string | RegExp) => screen.getByRole('button', { name })
const transcript = () => screen.getByLabelText('Transcript') as HTMLTextAreaElement
const stateLine = () => button(/recording hand|Finishing/).getAttribute('aria-describedby')!
const stateText = () => document.getElementById(stateLine())!.textContent
const storedNarration = () => JSON.parse(localStorage.getItem(`handforge:${PREFERENCE_KEYS.narration}`) ?? 'null') as { text: string; source: string } | null
const speech = () => swap.speech!

async function openVoiceMode() {
  renderAt('/record')
  await screen.findByRole('heading', { name: 'Who was in the hand?' })
  fireEvent.click(button('Speak hand'))
  expect(button('Speak hand').getAttribute('aria-pressed')).toBe('true')
  await screen.findByRole('heading', { name: 'Speak your hand' })
}

/** Tap the microphone and have the service start listening. */
function startRecording() {
  fireEvent.click(button('Start recording hand'))
  act(() => speech().current().begin())
}

beforeEach(async () => {
  resetDatabaseConnection()
  for (const store of Object.values(STORES)) await idb.clear(store)
  localStorage.clear()
  swap.parser = null
  swap.speech = fakeTranscriber()
  await seed()
})

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('speaking a hand', () => {
  it('offers three ways to reconstruct, and asks for nothing until the microphone is tapped', async () => {
    await openVoiceMode()
    expect(screen.getByRole('group', { name: 'How to reconstruct' }).querySelectorAll('button')).toHaveLength(3)
    expect(button('Build manually')).toBeTruthy()
    expect(button('Paste / type')).toBeTruthy()
    // Two separate notices: speech to text, and reading the hand.
    expect(screen.getByText('Speech to text:')).toBeTruthy()
    expect(screen.getByText('Reading the hand:')).toBeTruthy()
    expect(screen.getByText(/Practice parser: reads common shorthand on this device/)).toBeTruthy()
    expect(stateText()).toBe('Ready')
    expect(speech().recordings).toHaveLength(0)

    fireEvent.click(button('Start recording hand'))
    expect(speech().recordings).toHaveLength(1)
    expect(stateText()).toBe('Waiting for the microphone…')
  })

  it('shows unsettled words as temporary, settles them into the transcript, and stops on a tap', async () => {
    await openVoiceMode()
    startRecording()
    expect(stateText()).toBe('Listening…')
    expect(button('Stop recording hand')).toBeTruthy()
    // Locked while recording: Build draft waits for the player.
    expect(transcript().readOnly).toBe(true)

    act(() => speech().current().hearing(true))
    expect(screen.getByText('hearing you')).toBeTruthy()
    act(() => speech().current().guess('okay im cut off'))
    expect(screen.getByText('Still hearing:').parentElement!.textContent).toBe('Still hearing: okay im cut off…')
    expect(transcript().value).toBe('')
    expect(storedNarration()).toBeNull()

    act(() => speech().current().say('okay im cutoff four hundred effective'))
    expect(transcript().value).toBe('okay im cutoff four hundred effective')
    expect(screen.queryByText('Still hearing:')).toBeNull()
    expect(storedNarration()).toMatchObject({ text: 'okay im cutoff four hundred effective', source: 'voice' })

    act(() => speech().current().guess('folds to me'))
    fireEvent.click(button('Stop recording hand'))
    expect(speech().current().stopped).toBe(true)
    expect(stateText()).toBe('Stopped')
    // The guess that never settled is not kept.
    expect(transcript().value).toBe('okay im cutoff four hundred effective')
    expect(transcript().readOnly).toBe(false)
  })

  it('never builds the draft by itself; the player edits the transcript, then builds the same draft a typed hand gets', async () => {
    const parse = vi.fn(async (request: NarrationRequest) => onDeviceParser.parse(request))
    swap.parser = { kind: 'on-device', description: onDeviceParser.description, parse }
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say("I'm on the button with ace king suited hoodie guy opens to 20 I make it 65 he calls"))
    act(() => speech().current().say('flop ten eight two two clubs he checks I bet 50 he folds'))
    fireEvent.click(button('Stop recording hand'))
    expect(parse).not.toHaveBeenCalled()

    // Tidy the transcript (the practice parser reads sentences), then build.
    const tidy = transcript()
      .value.replace('suited hoodie', 'suited. Hoodie')
      .replace('20 I make', '20, I make')
      .replace('65 he calls flop', '65, he calls. Flop')
      .replace('clubs he checks I bet', 'clubs. He checks, I bet')
      .replace('50 he folds', '50, he folds.')
    fireEvent.change(transcript(), { target: { value: tidy } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Build draft' })[0]!)
    await screen.findByRole('heading', { name: 'Check the draft' })
    const spoken = parse.mock.calls[0]![0]

    // The original words stay one tap away.
    const original = screen.getByText('Original narration').closest('details')!
    expect(within(original).getByText('(voice transcript)')).toBeTruthy()
    expect(original.textContent).toContain('I make it 65, he calls')
    expect(button('Edit transcript')).toBeTruthy()
    expect(await savedHands()).toHaveLength(0)

    fireEvent.click(button('Confirm draft'))
    await screen.findByRole('heading', { name: 'Review and save' })
    expect(await savedHands()).toHaveLength(0)
    fireEvent.click(button('Save hand'))
    await waitFor(async () => expect(await savedHands()).toHaveLength(1))
    const [hand] = (await savedHands()) as [HandRecord]
    expect(hand.reconstruction!.streets[0]!.actions.map((action) => [action.seat, action.action, action.amount])).toEqual([
      [5, 'raise', 2000],
      [6, 'raise', 6500],
      [5, 'call', null],
    ])

    // Typed, the same words make the same request to the same parser.
    fireEvent.click(await screen.findByRole('link', { name: /Record/ }))
    await screen.findByRole('heading', { name: 'Who was in the hand?' })
    fireEvent.click(button('Paste / type'))
    fireEvent.change(screen.getByLabelText('Hand description'), { target: { value: spoken.text } })
    fireEvent.click(screen.getAllByRole('button', { name: 'Build draft' })[0]!)
    await screen.findByRole('heading', { name: 'Check the draft' })
    expect(parse.mock.calls[1]![0]).toEqual(spoken)
    expect(within(screen.getByText('Original narration').closest('details')!).getByText('(typed)')).toBeTruthy()
  })

  it('keeps the transcript across a reload and reopens Speak hand without opening the microphone', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('hoodie guy opens twenty i make sixty five on button'))
    cleanup()

    swap.speech = fakeTranscriber()
    renderAt('/record')
    await screen.findByRole('heading', { name: 'Speak your hand' })
    expect(transcript().value).toBe('hoodie guy opens twenty i make sixty five on button')
    expect(stateText()).toBe('Ready')
    expect(speech().recordings).toHaveLength(0)

    // Recording more adds to it.
    fireEvent.click(button('Start recording hand'))
    act(() => speech().current().begin())
    act(() => speech().current().say('he calls'))
    expect(transcript().value).toBe('hoodie guy opens twenty i make sixty five on button he calls')
  })

  it('keeps self-corrections exactly as spoken', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('turn nine clubs'))
    act(() => speech().current().say('no sorry river nine clubs'))
    act(() => speech().current().say('turn low diamond'))
    expect(transcript().value).toBe('turn nine clubs no sorry river nine clubs turn low diamond')
  })

  it('a blocked microphone is explained once, keeps the words, and offers retry, editing and typing', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('big blind calls'))
    act(() => {
      speech().current().fail('denied')
      speech().current().end()
    })
    const alert = screen.getByRole('alert')
    expect(within(alert).getByText(SPEECH_ERROR_TEXT.denied)).toBeTruthy()
    expect(SPEECH_ERROR_TEXT.denied).toBe('Microphone access is blocked. Allow microphone access in your browser settings, or type the hand instead.')
    expect(within(alert).getByText('Everything already transcribed is kept.')).toBeTruthy()
    expect(transcript().value).toBe('big blind calls')
    // Not asked again on its own.
    expect(speech().recordings).toHaveLength(1)

    fireEvent.click(within(alert).getByRole('button', { name: 'Continue editing' }))
    expect(document.activeElement).toBe(transcript())
    fireEvent.click(within(alert).getByRole('button', { name: 'Retry recording' }))
    expect(speech().recordings).toHaveLength(2)
  })

  it('shows an already-blocked microphone without prompting', async () => {
    swap.speech = fakeTranscriber()
    // The blocked state is read from the Permissions API only for the real browser transcriber.
    const query = vi.fn(async () => ({ state: 'denied' }) as PermissionStatus)
    Object.defineProperty(navigator, 'permissions', { configurable: true, value: { query } })
    const browserLike = { ...swap.speech.transcriber, kind: 'browser' as const }
    swap.speech = { ...swap.speech, transcriber: browserLike }
    await openVoiceMode()
    expect(await screen.findByText(SPEECH_ERROR_TEXT.denied)).toBeTruthy()
    expect(query).toHaveBeenCalledWith({ name: 'microphone' })
    expect(swap.speech.recordings).toHaveLength(0)
    Reflect.deleteProperty(navigator, 'permissions')
  })

  it('a network failure keeps what was settled, and the practice parser still builds it offline', async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(false)
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('hoodie guy opens to 20 i call'))
    act(() => speech().current().guess('flop ten eight'))
    act(() => {
      speech().current().fail('network')
      speech().current().end()
    })
    expect(within(screen.getByRole('alert')).getByText(SPEECH_ERROR_TEXT.network)).toBeTruthy()
    expect(transcript().value).toBe('hoodie guy opens to 20 i call')
    fireEvent.click(screen.getAllByRole('button', { name: 'Build draft' })[0]!)
    expect(await screen.findByRole('heading', { name: 'Check the draft' })).toBeTruthy()
  })

  it('a recording the service ends by itself, or that finds no speech, keeps the words', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('flop ace king queen all spades'))
    act(() => speech().current().end())
    expect(stateText()).toBe('Stopped')
    expect(screen.getByText(/Recording stopped on its own/)).toBeTruthy()
    expect(button('Start recording hand')).toBeTruthy()

    fireEvent.click(button('Start recording hand'))
    act(() => {
      speech().current().fail('no-speech')
      speech().current().end()
    })
    expect(within(screen.getByRole('alert')).getByText(SPEECH_ERROR_TEXT['no-speech'])).toBeTruthy()
    expect(transcript().value).toBe('flop ace king queen all spades')
  })

  it('stops when the player leaves the app, keeping the words', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('turn was a brick'))
    const visibility = vi.spyOn(document, 'visibilityState', 'get').mockReturnValue('hidden')
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'))
    })
    expect(speech().current().stopped).toBe(true)
    expect(screen.getByText('Stopped when you left the app. Everything heard is kept.')).toBeTruthy()
    expect(transcript().value).toBe('turn was a brick')
    visibility.mockRestore()
  })

  it('a service parse failure keeps the transcript, with Retry and Continue manually', async () => {
    swap.parser = {
      kind: 'service',
      description: SERVICE_NOTICE,
      parse: async () => {
        throw new TypeError('Failed to fetch')
      },
    }
    await openVoiceMode()
    expect(screen.getByText(SERVICE_NOTICE)).toBeTruthy()
    startRecording()
    act(() => speech().current().say('i raise to 15 big blind calls'))
    fireEvent.click(button('Stop recording hand'))
    fireEvent.click(screen.getAllByRole('button', { name: 'Build draft' })[0]!)
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByRole('button', { name: 'Retry' })).toBeTruthy()
    expect(transcript().value).toBe('i raise to 15 big blind calls')
  })

  it('without speech recognition, says so and offers typing instead', async () => {
    swap.speech = fakeTranscriber({ supported: false })
    await openVoiceMode()
    expect(screen.getByText('Voice transcription isn’t available in this browser.')).toBeTruthy()
    expect(screen.queryByRole('button', { name: 'Start recording hand' })).toBeNull()
    fireEvent.click(button('Type / paste instead'))
    expect(await screen.findByRole('heading', { name: 'Tell me the hand however you remember it.' })).toBeTruthy()
    expect(button('Paste / type').getAttribute('aria-pressed')).toBe('true')
  })

  it('leaving the screen mid-recording drops the recording but keeps settled words', async () => {
    await openVoiceMode()
    startRecording()
    act(() => speech().current().say('river nine of clubs'))
    fireEvent.click(button('Build manually'))
    expect(speech().current().aborted).toBe(true)
    fireEvent.click(button('Speak hand'))
    expect(transcript().value).toBe('river nine of clubs')
  })

  it('typed and manual entry are unchanged', async () => {
    renderAt('/record')
    await screen.findByRole('heading', { name: 'Who was in the hand?' })
    fireEvent.click(button('Paste / type'))
    await screen.findByRole('heading', { name: 'Tell me the hand however you remember it.' })
    expect(screen.queryByText('Speech to text:')).toBeNull()
    expect(screen.queryByText('Reading the hand:')).toBeNull()
    expect(screen.getByLabelText('Hand description')).toBeTruthy()
    fireEvent.click(button('Build manually'))
    expect(await screen.findByRole('heading', { name: 'Who was in the hand?' })).toBeTruthy()
    expect(swap.speech!.recordings).toHaveLength(0)
  })
})
