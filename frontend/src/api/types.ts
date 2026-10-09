export type MeResponse = {
  connected: boolean;
  host: string;
  token_preview: string;
  user: { id: number; name: string; email?: string; login_id?: string };
};

export type Course = {
  id: number;
  name: string;
  course_code?: string;
  workflow_state?: string;
  term?: string | null;
  start_at?: string | null;
  end_at?: string | null;
};

export type CoursesResponse = { active: Course[]; past: Course[] };

export type Student = {
  id: number;
  name: string;
  email?: string;
  sis_user_id?: string;
  login_id?: string;
  section_ids: number[];
  section_names: string[];
  groups: { id: number; name: string; category_id: number }[];
};

export type Section = {
  id: number;
  name: string;
  sis_section_id?: string;
  total_students?: number;
};

export type GroupMember = { id: number; name: string; email?: string };

export type Group = {
  id: number;
  name: string;
  max_membership?: number;
  member_count: number;
  members: GroupMember[];
};

export type GroupCategory = {
  id: number;
  name: string;
  groups: Group[];
};

export type Assignment = {
  id: number;
  name: string;
  due_at?: string | null;
  points_possible?: number;
  published?: boolean;
};

export type Submission = {
  user_id: number;
  user_name?: string;
  score?: number | null;
  grade?: string | null;
  workflow_state?: string;
  submitted_at?: string | null;
};

export type GradeRow = {
  user_id: number;
  name?: string;
  current_score?: number | null;
  final_score?: number | null;
  current_grade?: string | null;
  final_grade?: string | null;
};

export type BulkResult = {
  user_id: number;
  status: "ok" | "error" | "skipped";
  detail?: unknown;
};
