//constants/sections

// Generate: A..Z, then A1..Z1, A2..Z2, ...
export function generateSections(count: number): string[] {
  const base = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const out: string[] = [];
  let pass = 0;
  while (out.length < count) {
    const suffix = pass === 0 ? "" : String(pass);
    for (const ch of base) {
      if (out.length >= count) break;
      out.push(`${ch}${suffix}`);
    }
    pass++;
  }
  return out.slice(0, count);
}