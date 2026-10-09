export type CourseStatus = "" | "published" | "unpublished";

export type CourseFilters = {
  scope: "active" | "past";
  term: string;
  status: CourseStatus;
};

const DEFAULTS: CourseFilters = { scope: "active", term: "", status: "" };
const keyFor = (accountId: number | string) => `cursusbeheer:courseFilters:${accountId}`;

export function loadCourseFilters(accountId: number | string | undefined): CourseFilters {
  if (accountId === undefined) return DEFAULTS;
  try {
    const raw = localStorage.getItem(keyFor(accountId));
    return raw ? { ...DEFAULTS, ...(JSON.parse(raw) as Partial<CourseFilters>) } : DEFAULTS;
  } catch {
    return DEFAULTS;
  }
}

export function saveCourseFilters(accountId: number | string | undefined, filters: CourseFilters): void {
  if (accountId === undefined) return;
  localStorage.setItem(keyFor(accountId), JSON.stringify(filters));
}
