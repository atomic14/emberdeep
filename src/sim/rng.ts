/** Small, fast, seedable PRNG (sfc32). Deterministic runs = reproducible bugs and daily seeds later. */
export class Rng {
  private a: number; private b: number; private c: number; private d: number;
  constructor(seed: number | string) {
    let s = typeof seed === 'string' ? hashString(seed) : seed >>> 0;
    // splitmix-ish seeding
    this.a = (s ^ 0x9e3779b9) >>> 0;
    this.b = (s * 0x85ebca6b) >>> 0;
    this.c = (s ^ 0xc2b2ae35) >>> 0;
    this.d = (s + 0x27d4eb2f) >>> 0;
    for (let i = 0; i < 12; i++) this.next();
  }
  /** [0,1) */
  next(): number {
    this.a >>>= 0; this.b >>>= 0; this.c >>>= 0; this.d >>>= 0;
    let t = (this.a + this.b) | 0;
    this.a = this.b ^ (this.b >>> 9);
    this.b = (this.c + (this.c << 3)) | 0;
    this.c = (this.c << 21) | (this.c >>> 11);
    this.d = (this.d + 1) | 0;
    t = (t + this.d) | 0;
    this.c = (this.c + t) | 0;
    return (t >>> 0) / 4294967296;
  }
  int(min: number, max: number): number { // inclusive
    return min + Math.floor(this.next() * (max - min + 1));
  }
  chance(p: number): boolean { return this.next() < p; }
  pick<T>(arr: readonly T[]): T { return arr[Math.floor(this.next() * arr.length)]; }
  shuffle<T>(arr: T[]): T[] {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = Math.floor(this.next() * (i + 1));
      [arr[i], arr[j]] = [arr[j], arr[i]];
    }
    return arr;
  }
  weighted<T>(items: readonly { item: T; w: number }[]): T {
    let total = 0; for (const it of items) total += it.w;
    let r = this.next() * total;
    for (const it of items) { r -= it.w; if (r <= 0) return it.item; }
    return items[items.length - 1].item;
  }
  fork(label: string): Rng { return new Rng(hashString(label + ':' + Math.floor(this.next() * 1e9))); }
}

export function hashString(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
  return h >>> 0;
}
