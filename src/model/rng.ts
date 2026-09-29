/**
 * SplitMix64 plus exact ports of the Swift standard library's bounded-random algorithms.
 *
 * The iOS app draws tiles with `Int.random(in: 1...5, using: &splitMix)`. Reproducing Swift's
 * algorithm bit for bit (Lemire's multiply-shift with rejection, on unsigned 64-bit values) is what
 * makes the Daily Puzzle identical on iPhone and on the web. BigInt keeps the 64/128-bit maths exact.
 */

const MASK64 = (1n << 64n) - 1n;
const TWO64 = 1n << 64n;

export class SplitMix64 {
  private state: bigint;

  constructor(seed: bigint) {
    this.state = seed & MASK64;
  }

  /** Next raw 64-bit value (matches `SplitMix64.next()` in GameEngine.swift). */
  next(): bigint {
    this.state = (this.state + 0x9e3779b97f4a7c15n) & MASK64;
    let z = this.state;
    z = ((z ^ (z >> 30n)) * 0xbf58476d1ce4e5b9n) & MASK64;
    z = ((z ^ (z >> 27n)) * 0x94d049bb133111ebn) & MASK64;
    return z ^ (z >> 31n);
  }

  /** Swift `RandomNumberGenerator.next(upperBound:)` for UInt64: uniform in 0 ..< upper. */
  nextBelow(upper: bigint): bigint {
    if (upper <= 0n) throw new RangeError('upper bound must be positive');
    let product = this.next() * upper;
    let low = product & MASK64;
    if (low < upper) {
      const threshold = (TWO64 - upper) % upper; // (0 &- upperBound) % upperBound
      while (low < threshold) {
        product = this.next() * upper;
        low = product & MASK64;
      }
    }
    return product >> 64n;
  }

  /** Swift `Int.random(in: lower...upper, using:)`. */
  intInClosedRange(lower: number, upper: number): number {
    const delta = BigInt(upper) - BigInt(lower);
    return lower + Number(this.nextBelow(delta + 1n));
  }

  /** Swift `Int.random(in: lower..<upper, using:)`. */
  intInRange(lower: number, upper: number): number {
    const delta = BigInt(upper) - BigInt(lower);
    return lower + Number(this.nextBelow(delta));
  }
}

/** A random 64-bit seed from the platform's secure generator. */
export function randomSeed(): bigint {
  const buf = new BigUint64Array(1);
  globalThis.crypto.getRandomValues(buf);
  return buf[0];
}
