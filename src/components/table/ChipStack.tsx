import type { Depth } from './depth'
import './table.css'

const DEPTH_STACKS: Record<Depth, readonly number[]> = {
  short: [3],
  medium: [6],
  deep: [7, 4],
  'very-deep': [8, 7, 5],
}

type ChipColour = 'r' | 'k' | 'g' | 'i'
const PALETTE: readonly ChipColour[] = ['k', 'r', 'g', 'i']

/** Chip columns for a depth bucket; `seed` varies the colours from seat to seat. */
export function ChipStacks({ depth, seed = 0 }: { depth: Depth; seed?: number }) {
  return <ChipColumns heights={DEPTH_STACKS[depth]} seed={seed} />
}

export function ChipColumns({ heights, seed = 0 }: { heights: readonly number[]; seed?: number }) {
  return (
    <span className="hf-stacks" aria-hidden="true">
      {heights.map((height, column) => {
        const colour = PALETTE[(seed + column) % PALETTE.length]!
        return (
          <span key={column} className={`hf-stack hf-top-${colour}`}>
            {Array.from({ length: height }, (_, index) => (
              <span key={index} className={`hf-chip hf-c-${colour}`} />
            ))}
          </span>
        )
      })}
    </span>
  )
}
