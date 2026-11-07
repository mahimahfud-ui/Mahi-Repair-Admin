/** Stable JSON serialization. The signature must cover this exact UTF-8 string. */
export function canonicalJson(value: unknown): string {
  const normalize = (item: unknown): unknown => {
    if (Array.isArray(item)) return item.map(normalize);
    if (item && typeof item === 'object') {
      return Object.fromEntries(Object.entries(item as Record<string, unknown>)
        .sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, normalize(child)]));
    }
    if (typeof item === 'number' && !Number.isFinite(item)) throw new TypeError('Non-finite numbers are not permitted.');
    if (item === undefined || typeof item === 'function' || typeof item === 'symbol') throw new TypeError('Unsupported JSON value.');
    return item;
  };
  return JSON.stringify(normalize(value));
}
