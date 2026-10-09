import { cachedFetch, clearAll, fetchedAt, invalidateCourse, invalidateKey, onInvalidate } from "./apiCache";
import type {
  Assignment,
  BulkResult,
  CoursesResponse,
  GradeRow,
  GroupCategory,
  MeResponse,
  Section,
  Student,
  Submission,
} from "./types";

async function json<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: { "Content-Type": "application/json", ...init?.headers },
  });
  if (!res.ok) {
    let detail = res.statusText;
    try {
      const body = await res.json();
      detail = body.detail ?? JSON.stringify(body);
    } catch {
      /* ignore */
    }
    throw new Error(detail);
  }
  if (res.status === 204) return undefined as T;
  return res.json() as Promise<T>;
}

export const api = {
  me: () => cachedFetch("/api/me", () => json<MeResponse>("/api/me")),

  courses: () => cachedFetch("/api/courses", () => json<CoursesResponse>("/api/courses")),

  students: (courseId: number, q?: string) => {
    const qs = q ? `?q=${encodeURIComponent(q)}` : "";
    const key = `/api/courses/${courseId}/students${qs}`;
    return cachedFetch(key, () => json<Student[]>(`/api/courses/${courseId}/students${qs}`));
  },

  sections: (courseId: number) =>
    cachedFetch(`/api/courses/${courseId}/sections`, () =>
      json<Section[]>(`/api/courses/${courseId}/sections`),
    ),

  createSection: async (courseId: number, name: string) => {
    const r = await json<Section>(`/api/courses/${courseId}/sections`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    invalidateCourse(courseId, ["sections"]);
    return r;
  },

  bulkPlaceSection: async (courseId: number, userIds: number[], sectionId: number) => {
    const r = await json<{ results: BulkResult[] }>(`/api/courses/${courseId}/sections/bulk-place`, {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds, section_id: sectionId }),
    });
    invalidateCourse(courseId, ["students", "sections", "grade-summary"]);
    return r;
  },

  placeSection: async (courseId: number, userId: number, sectionId: number) => {
    const r = await json(`/api/courses/${courseId}/sections/place`, {
      method: "POST",
      body: JSON.stringify({ user_id: userId, section_id: sectionId }),
    });
    invalidateCourse(courseId, ["students", "sections", "grade-summary"]);
    return r;
  },

  groups: (courseId: number) =>
    cachedFetch(`/api/courses/${courseId}/groups`, () =>
      json<GroupCategory[]>(`/api/courses/${courseId}/groups`),
    ),

  createGroupCategory: async (courseId: number, name: string) => {
    const r = await json(`/api/courses/${courseId}/groups/categories`, {
      method: "POST",
      body: JSON.stringify({ name }),
    });
    invalidateCourse(courseId, ["groups"]);
    return r;
  },

  createGroup: async (courseId: number, categoryId: number, name: string) => {
    const r = await json(`/api/courses/${courseId}/groups`, {
      method: "POST",
      body: JSON.stringify({ category_id: categoryId, name }),
    });
    invalidateCourse(courseId, ["groups"]);
    return r;
  },

  bulkAddGroup: async (courseId: number, userIds: number[], groupId: number, categoryId: number) => {
    const r = await json<{ results: BulkResult[] }>(`/api/courses/${courseId}/groups/bulk-members`, {
      method: "POST",
      body: JSON.stringify({ user_ids: userIds, group_id: groupId, category_id: categoryId }),
    });
    invalidateCourse(courseId, ["groups", "students"]);
    return r;
  },

  removeGroupMember: async (courseId: number, groupId: number, userId: number, categoryId: number) => {
    await json(`/api/courses/${courseId}/groups/members`, {
      method: "DELETE",
      body: JSON.stringify({ user_id: userId, group_id: groupId, category_id: categoryId }),
    });
    invalidateCourse(courseId, ["groups", "students"]);
  },

  assignments: (courseId: number) =>
    cachedFetch(`/api/courses/${courseId}/assignments`, () =>
      json<Assignment[]>(`/api/courses/${courseId}/assignments`),
    ),

  submissions: (courseId: number, assignmentId: number) =>
    cachedFetch(`/api/courses/${courseId}/assignments/${assignmentId}/submissions`, () =>
      json<Submission[]>(`/api/courses/${courseId}/assignments/${assignmentId}/submissions`),
    ),

  gradeSummary: (courseId: number) =>
    cachedFetch(`/api/courses/${courseId}/grade-summary`, () =>
      json<GradeRow[]>(`/api/courses/${courseId}/grade-summary`),
    ),

  refreshMe: () => cachedFetch("/api/me", () => json<MeResponse>("/api/me"), { force: true }),
  refreshCourses: async () => {
    await json("/api/cache/clear", { method: "POST" });
    return cachedFetch("/api/courses", () => json<CoursesResponse>("/api/courses"), { force: true });
  },
  refreshAll: async () => {
    await json("/api/cache/clear?all=true", { method: "POST" });
    clearAll();
    return cachedFetch("/api/courses", () => json<CoursesResponse>("/api/courses"));
  },
  refreshCourse: async (courseId: number) => {
    await json(`/api/cache/clear?course_id=${courseId}`, { method: "POST" });
    invalidateCourse(courseId);
  },

  studentsFetchedAt: (courseId: number) => fetchedAt(`/api/courses/${courseId}/students`),

  invalidateCourse,
  invalidateKey,
  onInvalidate,
};
