export type CourseStatus = "" | "published" | "unpublished";
export type CourseSortKey = "name" | "term" | "period" | "status";
export type CourseSortDir = "asc" | "desc";

export type CourseFilters = {
  scope: "active" | "past";
  term: string;
  status: CourseStatus;
  sortKey: CourseSortKey;
  sortDir: CourseSortDir;
};

const SORT_KEYS: CourseSortKey[] = ["name", "term", "period", "status"];
const DEFAULTS: CourseFilters = { scope: "active", term: "", status: "", sortKey: "name", sortDir: "asc" };

function isSortKey(value: unknown): value is CourseSortKey {
  return typeof value === "string" && SORT_KEYS.includes(value as CourseSortKey);
}

const keyFor = (accountId: number | string) => `cursusbeheer:courseFilters:${accountId}`;

export function loadCourseFilters(accountId: number | string | undefined): CourseFilters {
  if (accountId === undefined) return DEFAULTS;
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw) as Partial<CourseFilters>;
    return {
      ...DEFAULTS,
      ...parsed,
      sortKey: isSortKey(parsed.sortKey) ? parsed.sortKey : DEFAULTS.sortKey,
      sortDir: parsed.sortDir === "desc" ? "desc" : "asc",
    };
  } catch {
    return DEFAULTS;
  }
}

export function saveCourseFilters(accountId: number | string | undefined, filters: CourseFilters): void {
  if (accountId === undefined) return;
  localStorage.setItem(keyFor(accountId), JSON.stringify(filters));
}
