/**
 * Voice-style transcripts: hands as a browser's speech recognition hands
 * them back -- no punctuation, numbers as words, filler, self-corrections
 * left in, and poker words misheard the way speech services mishear them.
 *
 * SYNTHETIC INPUT, written for these fixtures; no real player's speech.
 *
 * Told at `corpusTable()`: nine-handed $2/$5, Hero in seat 5, the table's
 * button on Hero; 4 is Hoodie Guy, 8 Old Man Coffee. `misheard` names what
 * a real transcript got wrong, for the reader -- nothing here corrects it.
 */

export interface VoiceTranscript {
  id: string
  text: string
  /** Speech-recognition mistakes in `text`, as "heard → meant". */
  misheard: string[]
}

export const VOICE_TRANSCRIPTS: readonly VoiceTranscript[] = [
  {
    id: 'v01',
    text: 'okay im cutoff four hundred effective folds to me make it seventeen big blind calls flop ace king queen all spades he checks i bet ten he calls',
    misheard: [],
  },
  {
    id: 'v02',
    text: 'hoodie guy opens twenty i make sixty five on button he calls ten eight deuce two clubs bet fifty call king clubs turn bet one twenty he makes it three hundred i call',
    misheard: [],
  },
  {
    id: 'v03',
    text: 'i raise to fifteen on the button big blind calls flop jack seven three rainbow check check turn nine clubs no sorry river nine clubs turn low diamond check check river he bets twenty i fold',
    misheard: [],
  },
  {
    id: 'v04',
    text: 'folds to the hi jack he opens to fifteen i three bet to forty five on the button with ace queen suit it he calls flop queen seven deuce rainbow he checks i bet thirty he folds',
    misheard: ['hi jack → hijack', 'suit it → suited'],
  },
  {
    id: 'v05',
    text: 'cut off opens twenty i make sixty five button big blind folds cut off calls flop ten eight deuce two clubs',
    misheard: ['cut off → cutoff'],
  },
  {
    id: 'v06',
    text: 'okay im in the cutoff with about four hundred behind folds to me and i make it seventeen big blind calls flop ace king queen all spades i have jack ten of hearts he checks i bet ten he calls turn was a brick he bets two thirds i call river nine of clubs he bets one point two x pot i jam he tanks and calls i show jack ten he mucks i win',
    misheard: [],
  },
  {
    id: 'v07',
    text: 'um so uh i had pocket jacks under the gun opened to fifteen uh coffee called and the big blind called flop came uh jack six juice two hearts big blind checks i bet forty both call turn eight of spades check check check river ace check i bet one ten coffee folds big blind calls and mucks when i show',
    misheard: ['juice → deuce'],
  },
  {
    id: 'v08',
    text: 'i raise to twelve with king queen off suit big blind three bets to forty i call flop king for tree he bets thirty i call',
    misheard: ['off suit → offsuit', 'for tree → four three'],
  },
  {
    id: 'v09',
    text: 'hoodie raises to thirty i call in the big blind flop seven seven two i check he see bets twenty five i check raise to eighty he jams i fold',
    misheard: ['see bets → c-bets'],
  },
]
