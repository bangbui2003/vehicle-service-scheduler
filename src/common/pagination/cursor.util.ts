/**
 * Opaque cursor structure containing the pagination keys.
 */
export interface CursorPayload {
  id: string;
  startTime: string; // ISO string
}

/**
 * Encodes a database row's key properties into a URL-safe, opaque base64 string.
 */
export function encodeCursor(payload: CursorPayload): string {
  const jsonStr = JSON.stringify(payload);
  return Buffer.from(jsonStr, 'utf-8')
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, ''); // base64url encoding
}

/**
 * Decodes a client-provided cursor string back into its original payload structure.
 * Returns null if the cursor is invalid or cannot be parsed.
 */
export function decodeCursor(cursorStr: string): CursorPayload | null {
  try {
    // Add padding if missing
    let base64 = cursorStr.replace(/-/g, '+').replace(/_/g, '/');
    while (base64.length % 4) {
      base64 += '=';
    }
    const jsonStr = Buffer.from(base64, 'base64').toString('utf-8');
    const parsed = JSON.parse(jsonStr);
    if (typeof parsed === 'object' && parsed !== null && 'id' in parsed && 'startTime' in parsed) {
      return parsed as CursorPayload;
    }
    return null;
  } catch {
    return null;
  }
}
