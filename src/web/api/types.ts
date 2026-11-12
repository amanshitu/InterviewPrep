// Shared response shapes used across multiple api/*.ts domain modules.
// Mirrors userPayloadWithCategories()/mapUserRow() in src/worker.js.

export interface EnrolledCategory {
  id: string;
  name: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  createdAt: string;
  track: string | null;
  role: "user" | "admin";
  activeCategoryId: string | null;
  dailyQuota: number;
  streak: {
    count: number;
    longest: number;
    lastActiveDate: string | null;
  };
  aiProvider: "openai" | "anthropic" | null;
  hasAiKey: boolean;
  headline: string;
  yearsExperience: number | null;
  bio: string;
  timezone: string;
  workersAiModel: string;
  avatarData: string | null;
  enrolledCategories: EnrolledCategory[];
}

export interface Category {
  id: string;
  name: string;
  description: string | null;
  enrolled: boolean;
}

export interface Question {
  id: string;
  q: string;
  a: string;
  topic_label: string;
  set_id?: string;
  status?: string;
  last_result?: string | null;
}
