/**
 * Stack depth, bucketed for the chip illustration. The chips only say roughly
 * how deep a seat is; the printed figure beside them is the exact amount.
 */
export type Depth = 'short' | 'medium' | 'deep' | 'very-deep'

export function stackDepth(bigBlinds: number): Depth {
  if (bigBlinds < 40) return 'short'
  if (bigBlinds < 100) return 'medium'
  if (bigBlinds < 200) return 'deep'
  return 'very-deep'
}
