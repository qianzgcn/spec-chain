export const DEFAULT_PAGE_SIZE = 10;
export const DEFAULT_PAGE_SIZE_OPTIONS = [10, 20, 50, 100];

export function parsePageSize(
  value: string | undefined,
  fallback = DEFAULT_PAGE_SIZE,
  options = DEFAULT_PAGE_SIZE_OPTIONS,
): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return options.includes(parsed) ? parsed : fallback;
}

export function parsePage(value: string | undefined, fallback = 1): number {
  const parsed = Number.parseInt(value ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}
