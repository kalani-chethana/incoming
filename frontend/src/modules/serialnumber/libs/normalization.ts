export function extractDigits(value: string): string {
  if (!value) return "";
  const charMap: Record<string, string> = {
    O: "0",
    Q: "0",
    I: "1",
    L: "1",
    "|": "1",
    Z: "2",
    S: "5",
    G: "6",
    B: "8",
  };
  const mapped = value.toUpperCase().replace(/[OQIL|SZGB]/g, (ch) => charMap[ch] || ch);
  return mapped.replace(/\D/g, "");
}

export function normalize(value: string): string {
  if (!value) return "";
  return value.trim().toUpperCase().replace(/[_–—\s]+/g, "-");
}

/**
 * Normalizes a part number while remaining STRICTLY SENSITIVE to spaces and dashes.
 * "07-1076 05" has a dash and a space.
 * "07-107605" has a dash but no space.
 * They will NOT match.
 */
export function normalizePartNumber(value: string): string {
  if (!value) return "";
  let clean = value.trim().toUpperCase();
  // Standardize hyphens / en-dash / em-dash to regular hyphen
  clean = clean.replace(/[–—_]+/g, "-");
  // Collapse multiple consecutive spaces to a single space
  clean = clean.replace(/\s+/g, " ");
  // Collapse multiple consecutive dashes to a single dash
  clean = clean.replace(/-+/g, "-");
  return clean;
}

/**
 * Strict comparison for part numbers:
 * Space and dash are strictly sensitive.
 */
export function isPartMatched(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  return normalizePartNumber(actual) === normalizePartNumber(expected);
}

export function normalizeCapacity(value: string): string {
  if (!value) return "";
  let clean = value.trim().toUpperCase().replace(/\s+/g, "");
  // Normalize KLB variations: 1k1b, 1kib, 1klbs, 1kb -> 1KLB
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:K(?:1B|IB|LB)S?|KB)$/i, "$1KLB");
  // Normalize force units: KGF & LBF
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:KGF)$/i, "$1KGF");
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:LBF)$/i, "$1LBF");
  // Normalize LB variations: 251b, 25ib, 25lbs -> 25LB
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:1B|IB|LBS?)$/i, "$1LB");
  // Normalize KG variations: 50kgs, 50k9 -> 50KG
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:KGS?|K9)$/i, "$1KG");
  // Normalize KN & N (Kilonewton & Newton)
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:KN)$/i, "$1KN");
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:N)$/i, "$1N");
  // Normalize Metric Tonne & Gram
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:TONNE?S?|T)$/i, "$1T");
  clean = clean.replace(/(\d+(?:\.\d+)?)(?:GRAMS?|G)$/i, "$1G");
  return clean;
}

export const normalizeWeight = normalizeCapacity;

export function isCapacityMatched(actual: string, expected: string): boolean {
  if (!actual) return false;
  if (!expected || !expected.trim()) return true;
  const normActual = normalizeCapacity(actual);
  const normExpected = normalizeCapacity(expected);
  if (normActual === normExpected) return true;

  // Extract number and unit to allow flexible unit comparison
  const matchActual = normActual.match(/^(\d+(?:\.\d+)?)([A-Z]+)?$/);
  const matchExpected = normExpected.match(/^(\d+(?:\.\d+)?)([A-Z]+)?$/);
  if (matchActual && matchExpected) {
    const numActual = matchActual[1];
    const unitActual = matchActual[2] || "";
    const numExpected = matchExpected[1];
    const unitExpected = matchExpected[2] || "";

    // If both specify units, units MUST match (e.g. KLB must match KLB, not LB)
    if (unitActual && unitExpected && unitActual !== unitExpected) {
      return false;
    }
    if (
      numActual === numExpected ||
      (!isNaN(Number(numActual)) && !isNaN(Number(numExpected)) && Number(numActual) === Number(numExpected))
    ) {
      return true;
    }
  }

  return false;
}
