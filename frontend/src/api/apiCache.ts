type Entry<T> = { data: T; fetchedAt: number };

const store = new Map<string, Entry<unknown>>();
const inflight = new Map<string, Promise<unknown>>();

const TTL = {
  courses: 45 * 60 * 1000,
  students: 45 * 60 * 1000,
  sections: 30 * 60 * 1000,
  groups: 30 * 60 * 1000,
  grades: 10 * 60 * 1000,
  me: 60 * 60 * 1000,
} as const;

function ttlForKey(key: string): number {
  if (key.includes("/grade") || key.includes("/assignments")) return TTL.grades;
  if (key.includes("/students")) return TTL.students;
  if (key.includes("/sections")) return TTL.sections;
  if (key.includes("/groups")) return TTL.groups;
  if (key === "/api/me") return TTL.me;
  if (key === "/api/courses") return TTL.courses;
  return 30 * 60 * 1000;
}

type InvalidateListener = (courseId: number | null) => void;
const listeners = new Set<InvalidateListener>();

export function onInvalidate(listener: InvalidateListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function invalidateKey(key: string): void {
  store.delete(key);
  listeners.forEach((l) => l(null));
}

export function invalidateCourse(courseId: number): void {
  const prefix = `/api/courses/${courseId}/`;
  for (const k of store.keys()) {
    if (k.startsWith(prefix)) store.delete(k);
  }
  listeners.forEach((l) => l(courseId));
}

export function clearAll(): void {
  store.clear();
  listeners.forEach((l) => l(null));
}

export function fetchedAt(key: string): number | null {
  return store.get(key)?.fetchedAt ?? null;
}

export async function cachedFetch<T>(
  key: string,
  fetcher: () => Promise<T>,
  options?: { force?: boolean },
): Promise<T> {
  const now = Date.now();
  const existing = store.get(key) as Entry<T> | undefined;
  const stale = existing && now - existing.fetchedAt > ttlForKey(key);

  if (existing && !options?.force && !stale) {
    return existing.data;
  }

  if (existing && stale && !options?.force) {
    void revalidate(key, fetcher);
    return existing.data;
  }

  return revalidate(key, fetcher);
}

async function revalidate<T>(key: string, fetcher: () => Promise<T>): Promise<T> {
  let p = inflight.get(key) as Promise<T> | undefined;
  if (!p) {
    p = fetcher().then((data) => {
      store.set(key, { data, fetchedAt: Date.now() });
      inflight.delete(key);
      return data;
    });
    inflight.set(key, p);
  }
  return p;
}
