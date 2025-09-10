// constants/classKey.ts
// One place to normalize class identifiers.
// Goal: always use a canonical key like "CSE-C" (UPPERCASE, hyphen).

/**
 * Turn any display string like:
 *  - "CSE C"
 *  - "CSE-C"
 *  - "cse-c (Year 1)"
 *  - "CSE-C-Y3"   ← yearful passed in by mistake
 *  - just "C"
 * into a canonical legacy key, e.g. "CSE-C".
 *
 * If only a section is given ("C", "B1"), department defaults to "CSE".
 */
export function canonicalClassKey(input: string, department = "CSE"): string {
  const raw = (input ?? "").toString().trim().toUpperCase();

  // strip trailing "(Year X)" if present
  const noYearTag = raw.replace(/\s*\(YEAR\s*\d+\)\s*$/i, "").trim();

  // strip trailing "-Y<1-4>" if a yearful canon was passed
  const noYearful = noYearTag.replace(/-Y[1-4]\s*$/i, "").trim();

  // collapse spaces
  const cleaned = noYearful.replace(/\s+/g, " ");

  // Patterns:
  // 1) "<DEPT>-<SEC>" or "<DEPT> <SEC>"
  const m1 = cleaned.match(/^([A-Z]+)\s*[-\s]\s*([A-Z][0-9]?)$/);
  if (m1) return `${m1[1]}-${m1[2]}`;

  // 2) just "<DEPT>"
  const onlyDept = cleaned.match(/^[A-Z]+$/);
  if (onlyDept && cleaned !== department) {
    // It's some dept string, return as-is (e.g., "CSE")
    return cleaned;
  }

  // 3) just "<SEC>" (e.g., "C", "B1")
  const onlySection = cleaned.match(/^[A-Z][0-9]?$/);
  if (onlySection) return `${department}-${cleaned}`;

  // 4) last fallback: replace first space with hyphen
  return cleaned.replace(/\s+/, "-");
}

/** Strip the "-Y<year>" suffix if present. "CSE-C-Y3" -> "CSE-C". */
export function legacyCanonFromYearful(canon: string): string {
  return (canon || "").toUpperCase().replace(/-Y[1-4]$/, "");
}

/** Returns true if the given canon looks like "DEPT-SEC-Y3". */
export function isYearfulCanon(canon: string): boolean {
  return /^[A-Z]+-[A-Z][0-9]?-(?:Y[1-4])$/.test((canon || "").toUpperCase());
}

/** Extract the SECTION from a canonical key. Works for "CSE-C" and "CSE-C-Y3". */
export function extractSectionFromCanon(canon: string): string {
  const base = legacyCanonFromYearful((canon || "").toUpperCase()); // drop -Yx if present
  const m = base.match(/^[A-Z]+-([A-Z][0-9]?)$/);
  return m ? m[1] : "";
}

/** Optional helper to build a nice display from canonical + year. */
export function classDisplayFromCanon(canon: string, year?: number | null): string {
  const base = legacyCanonFromYearful(canon || "").toUpperCase();
  if (year && [1, 2, 3, 4].includes(year)) return `${base} (Year ${year})`;
  return base;
}

/* ========================= YEAR-AWARE HELPERS ========================= */

/**
 * Build a year-aware canonical key.
 * Examples:
 *  - yearfulCanon("CSE", "C", 3)  -> "CSE-C-Y3"
 *  - yearfulCanon("CSE", "C", 1)  -> "CSE-C-Y1"
 *  - yearfulCanon("CSE", "C", null) -> "CSE-C" (legacy fallback if year missing)
 */
export function yearfulCanon(dept: string, section: string, year?: number | null): string {
  const dep = (dept || "").trim().toUpperCase();
  const sec = (section || "").trim().toUpperCase();
  const y = typeof year === "number" ? year : null;
  return y ? `${dep}-${sec}-Y${y}` : `${dep}-${sec}`;
}

/**
 * Try to parse a trailing "(Year X)" from a display string.
 * Returns the numeric year (1..4) or null if absent.
 */
export function parseYearFromDisplay(input: string): number | null {
  const m = (input || "").toUpperCase().match(/\(YEAR\s*([1-4])\)\s*$/i);
  if (!m) return null;
  const y = Number(m[1]);
  return y >= 1 && y <= 4 ? y : null;
}