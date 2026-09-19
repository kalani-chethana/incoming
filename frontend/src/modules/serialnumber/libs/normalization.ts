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
  // Normalize OCR / typing variations: 251b, 25ib, 25lbs -> 25LB
  clean = clean.replace(/(\d+)(?:1B|IB|LBS?)$/i, "$1LB");
  clean = clean.replace(/(\d+)(?:KGS?|K9)$/i, "$1KG");
  return clean;
}

export const normalizeWeight = normalizeCapacity;

export function isCapacityMatched(actual: string, expected: string): boolean {
  if (!actual || !expected) return false;
  const normActual = normalizeCapacity(actual);
  const normExpected = normalizeCapacity(expected);
  if (normActual === normExpected) return true;

  const actualDigits = extractDigits(normActual);
  const expectedDigits = extractDigits(normExpected);
  if (actualDigits && expectedDigits && actualDigits === expectedDigits) {
    return true;
  }
  return false;
}
