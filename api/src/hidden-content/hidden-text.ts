const decoder = new TextDecoder("utf-8", { fatal: true });
export function collectCandidateText(bytes: Uint8Array, found: string[]): void {
  if (found.length >= 3) return;
  let start = 0;
  for (let end = 0; end <= bytes.length; end++) {
    const b = end < bytes.length ? bytes[end] : 0;
    const eligible = b === 9 || b === 10 || b === 13 || b >= 32 && b <= 126 || b >= 128 && b <= 244;
    if (eligible && end - start < 4096) continue;
    if (end - start >= 32) {
      try {
        const text = decoder.decode(bytes.subarray(start, end)).trim();
        const words = text.match(/\p{L}{2,}/gu)?.length ?? 0;
        const letters = text.match(/\p{L}/gu)?.length ?? 0;
        const url = /https?:\/\/[a-zA-Z0-9][a-zA-Z0-9.-]+\.[a-zA-Z]{2,}(?:[/?#][^\s]*)?/.test(text);
        if (words >= 6 && letters >= text.length * 0.55 || url) {
          const bounded = text.slice(0, 600);
          if (!found.some(old => old.includes(bounded) || bounded.includes(old))) found.push(bounded);
          if (found.length >= 3) return;
        }
      } catch { /* Binary data is not recovered text. */ }
    }
    start = end + 1;
  }
}

/** RGB low bytes or PCM16 low bytes; caller must establish lossless provenance. */
export function recoverLowBitText(data: Uint8Array, stride: number, orders: number[][],
  deadlineAt = Infinity): string[] {
  if (!Number.isInteger(stride) || stride < 1 || stride > 8 ||
      orders.length > 5 || orders.some(o => o.length < 1 || o.some(c => c < 0 || c >= stride))) {
    throw new Error("Invalid low-bit scan layout");
  }
  const frames = Math.min(65536, Math.floor(data.length / stride));
  const found: string[] = [];
  for (const order of orders) for (const depth of [1, 2]) {
    if (Date.now() >= deadlineAt) throw new Error("Hidden-content scan budget exceeded");
    const bits = new Uint8Array(frames * order.length * depth);
    let cursor = 0;
    for (let i = 0; i < frames; i++) {
      if (i % 4096 === 0 && Date.now() >= deadlineAt) throw new Error("Hidden-content scan budget exceeded");
      for (const c of order) for (let bit = depth - 1; bit >= 0; bit--) {
        bits[cursor++] = data[i * stride + c] >> bit & 1;
      }
    }
    for (const littleEndian of [false, true]) for (let alignment = 0; alignment < 8; alignment++) {
      if (Date.now() >= deadlineAt) throw new Error("Hidden-content scan budget exceeded");
      const length = Math.floor((bits.length - alignment) / 8);
      if (length <= 0) continue;
      const packed = new Uint8Array(length);
      for (let i = 0; i < length; i++) for (let bit = 0; bit < 8; bit++) {
        packed[i] |= bits[alignment + i * 8 + bit] << (littleEndian ? bit : 7 - bit);
      }
      collectCandidateText(packed, found);
      if (found.length >= 3) return found;
    }
  }
  return found;
}
