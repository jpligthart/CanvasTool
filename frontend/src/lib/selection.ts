const keyFor = (courseId: number) => `cursusbeheer:selection:${courseId}`;

export function loadSelection(courseId: number): Set<number> {
  try {
    const raw = sessionStorage.getItem(keyFor(courseId));
    if (!raw) return new Set();
    return new Set(JSON.parse(raw) as number[]);
  } catch {
    return new Set();
  }
}

export function saveSelection(courseId: number, ids: Set<number>): void {
  sessionStorage.setItem(keyFor(courseId), JSON.stringify([...ids]));
}
