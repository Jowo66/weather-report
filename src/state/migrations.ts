/**
 * Versioned persisted-state migrations (TDD §9). Each store's `migrate(state, fromVersion)`
 * applies every step from `fromVersion` up to the current version, in order.
 */
export type MigrationStep = (state: Record<string, unknown>) => Record<string, unknown>;

export function runMigrations(
  steps: Record<number, MigrationStep>,
  persisted: unknown,
  fromVersion: number,
  toVersion: number,
): Record<string, unknown> {
  let s: Record<string, unknown> =
    persisted && typeof persisted === 'object' ? { ...(persisted as Record<string, unknown>) } : {};
  for (let v = fromVersion; v < toVersion; v++) {
    const step = steps[v];
    if (step) s = step(s);
  }
  return s;
}
