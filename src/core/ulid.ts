// ULID generator. 48-bit millisecond time + 80 bits of randomness, Crockford base32.
// REQ-PER-004
// IDs from one process are monotonic. IDs from two processes do not collide in practice
// because 80 random bits remain after the time part.

import { randomBytes } from "node:crypto";

const ALPHABET = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
export const ULID_PATTERN = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type RandomSource = (bytes: number) => Uint8Array;

function encodeTime(ms: number): string {
  if (!Number.isInteger(ms) || ms < 0 || ms > 2 ** 48 - 1) throw new RangeError("ULID time out of range");
  let out = "";
  let t = ms;
  for (let i = 0; i < 10; i++) {
    out = ALPHABET[t % 32] + out;
    t = Math.floor(t / 32);
  }
  return out;
}

function encodeRandom(bytes: Uint8Array): string {
  // 80 bits -> 16 base32 characters.
  let bits = 0n;
  for (const b of bytes) bits = (bits << 8n) | BigInt(b);
  let out = "";
  for (let i = 0; i < 16; i++) {
    out = ALPHABET[Number(bits & 31n)] + out;
    bits >>= 5n;
  }
  return out;
}

function incrementRandom(bytes: Uint8Array): Uint8Array {
  const next = Uint8Array.from(bytes);
  for (let i = next.length - 1; i >= 0; i--) {
    if (next[i]! < 255) {
      next[i]! += 1;
      return next;
    }
    next[i] = 0;
  }
  throw new RangeError("ULID random part overflow");
}

export function createUlidFactory(now: () => number = Date.now, random: RandomSource = randomBytes) {
  let lastTime = -1;
  let lastRandom: Uint8Array = new Uint8Array(10);
  return function ulid(): string {
    let time = now();
    if (time <= lastTime) {
      // Same or earlier millisecond (or clock moved back): keep monotonic order.
      time = lastTime;
      lastRandom = incrementRandom(lastRandom);
    } else {
      lastTime = time;
      lastRandom = Uint8Array.from(random(10));
    }
    return encodeTime(time) + encodeRandom(lastRandom);
  };
}

export function isUlid(value: unknown): value is string {
  return typeof value === "string" && ULID_PATTERN.test(value);
}
