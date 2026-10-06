import { formatCents } from '../../domain/money'
import { describeCard } from '../../domain/poker/cards'
import {
  BIG_BLIND,
  FLOP,
  HERO_CARDS,
  HERO_SEATS,
  POT_ON_FLOP,
  depthOf,
  type DemoSeat,
} from './demoHand'
import { CardBacks, EmptySlot, FeltCard } from '../table/Cards'
import { ChipColumns, ChipStacks } from '../table/ChipStack'
import { DealerButton } from '../table/DealerButton'

const DESCRIPTION =
  `Illustration of an eight-handed $2/$5 table on the flop. You are on the button with ` +
  `${HERO_CARDS.map(describeCard).join(' and ')}, ${formatCents(HERO_SEATS[0]!.stack)} behind, and it is your turn. ` +
  `The flop is ${FLOP.map(describeCard).join(', ')}; turn and river are still to come. ` +
  `The pot is ${formatCents(POT_ON_FLOP)}. The big blind checked, the hijack bet $55 and the cutoff called. ` +
  `The small blind, under the gun, UTG+1 and lojack have folded.`

/**
 * The homepage centrepiece: one frozen moment of a hand, laid out the way it
 * looked at the table. Static by design -- it shows what the app reconstructs,
 * it is not the hand-entry tool.
 */
export function HeroTable() {
  return (
    <figure className="hf-stage hf-enter" role="img" aria-label={DESCRIPTION}>
      <div className="hf-rail">
        <div className="hf-felt" />
      </div>

      <p className="hf-hud" aria-hidden="true">
        <b>Hand 14</b>
        <span>NL $2/$5</span>
        <span>Flop</span>
      </p>

      <div className="hf-place hf-pot" aria-hidden="true">
        <div className="hf-pot-wrap">
          <span className="text-[clamp(5px,1.15cqi,9px)]">
            <ChipColumns heights={[4, 3, 5]} seed={1} />
          </span>
          <span className="hf-pot-label">
            <span>Pot</span>
            <strong>{formatCents(POT_ON_FLOP)}</strong>
          </span>
        </div>
      </div>

      <div className="hf-place hf-board" aria-hidden="true">
        <div className="hf-board-row">
          {FLOP.map((card) => (
            <FeltCard key={card} card={card} />
          ))}
          <EmptySlot />
          <EmptySlot />
        </div>
      </div>

      {HERO_SEATS.map((seat) => (
        <Seat key={seat.slot} seat={seat} />
      ))}

      <div className="hf-place hf-hole" aria-hidden="true">
        <div className="hf-hole-row">
          {HERO_CARDS.map((card) => (
            <FeltCard key={card} card={card} />
          ))}
        </div>
      </div>

      <div className="hf-place hf-dealer" aria-hidden="true">
        <DealerButton />
      </div>
    </figure>
  )
}

function Seat({ seat }: { seat: DemoSeat }) {
  const hero = seat.slot === 0
  const folded = seat.status === 'folded'
  const bigBlinds = Math.round(seat.stack / BIG_BLIND)
  const where = `hf-seat-${seat.slot}`

  return (
    <>
      <div className={`hf-place hf-front ${where}`} aria-hidden="true">
        <div className={`hf-cluster ${folded ? 'hf-cluster--folded' : ''}`}>
          {!hero && seat.status === 'in' && <CardBacks />}
          <ChipStacks depth={depthOf(seat.stack)} seed={seat.slot} />
        </div>
      </div>

      {seat.bet !== undefined && (
        <div className={`hf-place hf-bet ${where}`} aria-hidden="true">
          <div className="hf-cluster justify-center">
            <ChipColumns heights={[3, 2]} seed={seat.slot + 1} />
          </div>
          <p className="hf-bet-amount">{formatCents(seat.bet)}</p>
        </div>
      )}

      <div
        className={`hf-place hf-pod ${where} ${hero ? 'hf-pod--hero' : ''} ${folded ? 'hf-pod--folded' : ''}`}
        aria-hidden="true"
      >
        <div className="hf-pod__pos">{hero ? `YOU · ${seat.position}` : seat.position}</div>
        <div className="hf-pod__stack">{formatCents(seat.stack)}</div>
        <div className="hf-pod__meta">
          <span className="hf-pod__bb">{bigBlinds} BB</span>
          {seat.note && (
            <>
              <span className="hf-pod__bb"> · </span>
              {seat.note}
            </>
          )}
        </div>
        {hero && <span className="hf-to-act">To act</span>}
      </div>
    </>
  )
}
