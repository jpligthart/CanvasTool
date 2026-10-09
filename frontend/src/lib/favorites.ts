const keyFor = (accountId: number | string) => `cursusbeheer:favorites:${accountId}`;

export function loadFavorites(accountId: number | string): Set<number> {
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    if (!raw) return new Set();
    const ids = JSON.parse(raw) as number[];
    return new Set(ids);
  } catch {
    return new Set();
  }
}

export function saveFavorites(accountId: number | string, ids: Set<number>): void {
  localStorage.setItem(keyFor(accountId), JSON.stringify([...ids]));
}

export function toggleFavorite(accountId: number | string, courseId: number): Set<number> {
  const set = loadFavorites(accountId);
  if (set.has(courseId)) set.delete(courseId);
  else set.add(courseId);
  saveFavorites(accountId, set);
  return set;
}
