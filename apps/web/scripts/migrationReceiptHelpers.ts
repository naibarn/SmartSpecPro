/** Check PostgreSQL errors even when an ORM wraps them through `cause`. */
export function hasDatabaseErrorCode(error: unknown, code: string): boolean {
  const visited = new Set<object>();
  let current: unknown = error;

  while (typeof current === "object" && current !== null && !visited.has(current)) {
    visited.add(current);
    if ("code" in current && (current as { code?: unknown }).code === code) return true;
    current = "cause" in current ? (current as { cause?: unknown }).cause : undefined;
  }

  return false;
}
