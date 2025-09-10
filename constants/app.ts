// constants/app.ts

/** HOD super account (can change later). */
export const SUPERMAIL = "r42607611@gmail.com";

/** Single department for now. */
export const DEPARTMENT = "CSE";

/** IST window (hours in 24h clock). */
export const MARK_OPEN_HOUR = 6;        // 06:00 IST
export const MARK_CUTOFF_HOUR = 10;     // 10:00 IST
export const CORRECTION_CUTOFF_HOUR = 15; // 15:00 IST

/** Generate CAPs sections: A..Z, then A1..Z1, A2..Z2 ... */
export function generateSectionLabels(count: number): string[] {
  const out: string[] = [];
  if (!Number.isFinite(count) || count <= 0) return out;
  let i = 0, cycle = 0;
  while (out.length < count) {
    const base = String.fromCharCode(65 + (i % 26));
    out.push(cycle === 0 ? base : `${base}${cycle}`);
    i++;
    if (i % 26 === 0) cycle++;
  }
  return out;
}