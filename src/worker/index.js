// ExamStreak — Cloudflare Worker
//
// Serves the static app (public/) and a small JSON API backed by D1 for
// email+password auth and per-user progress state. The question bank
// itself is static content shipped with the app (public/questions.js) —
// only per-user progress lives in the database.
//
// Split into src/worker/{lib,routes}/ domain modules (matching the
// sibling MealSathi project's backend folder convention) from a single
// 2,512-line src/worker.js — a pure code-organization refactor, same
// logic/behavior throughout. See DEVELOPMENT.md for the phase that did
// this split and how it was verified.

import { json, applySecurityHeaders } from "./lib/http.js";
import { checkRateLimit } from "./lib/ratelimit.js";
import { getUserFromRequest } from "./lib/session.js";

import {
  handleSignup,
  handleLogin,
  handleLogout,
  handleForgotPassword,
  handleResetPassword,
  handleChangePassword,
  handleRevokeAllSessions,
} from "./routes/auth.js";
import {
  handleGetMe,
  handleUpdateAccount,
  handleUpdateProfile,
  handleGetState,
  handlePutState,
  handleGetActivity,
  handleExportProgress,
} from "./routes/account.js";
import {
  handleListPublicCategories,
  handleListCategories,
  handleEnrollCategory,
  handleSwitchCategory,
  handleUnenrollCategory,
  handleCreateCategory,
} from "./routes/categories.js";
import {
  handleGetTodayQueue,
  handleCompleteQuestion,
  handleFlagQuestionForReview,
  handleRequestMore,
  handleReviewResult,
  handleGetReview,
} from "./routes/queue.js";
import {
  handleCreateQuestionSet,
  handleListMySets,
  handleGetBankCount,
  handleSubmitSet,
  handleSubscribeSet,
  handleListSuggestions,
  handleGenerateCategoryPrompt,
} from "./routes/questionsets.js";
import {
  handleGetSelfTestQuota,
  handleGetSelfTestQuestion,
  handleSelfTestAnalyze,
  handleGetSelfTestHistory,
} from "./routes/selftest.js";
import { handleGetTodayTest, handleAnswerTest } from "./routes/dailytest.js";
import { handleGetStatsProgress, handleGetStatsInsight, handleGetAiUsage } from "./routes/stats.js";
import { handleSuggestTargetRole, handleGenerateResumePrompt } from "./routes/resume.js";
import {
  handleAdminPendingSets,
  handleApproveSet,
  handleRejectSet,
  handleAdminGetSetQuestions,
  handleAdminApprovalHistory,
  handleAdminOverview,
  handleAdminUsers,
  handleAdminUserStats,
  handleAdminSearchQuestions,
  handleAdminUpdateQuestion,
} from "./routes/admin.js";
import { handleReportQuestion, handleAdminListReports, handleAdminResolveReport } from "./routes/reports.js";
import { handlePushSubscribe, handlePushUnsubscribe, handleScheduled } from "./routes/push.js";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname.startsWith("/api/")) {
      try {
        if (url.pathname === "/api/signup" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "signup");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleSignup(request, env));
        }
        if (url.pathname === "/api/login" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "login");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleLogin(request, env));
        }
        if (url.pathname === "/api/logout" && request.method === "POST") {
          return applySecurityHeaders(await handleLogout(request, env));
        }
        if (url.pathname === "/api/password/forgot" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "password-forgot");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleForgotPassword(request, env));
        }
        if (url.pathname === "/api/password/reset" && request.method === "POST") {
          const limited = await checkRateLimit(env, request, "password-reset");
          if (limited) return applySecurityHeaders(limited);
          return applySecurityHeaders(await handleResetPassword(request, env));
        }
        if (url.pathname === "/api/categories/public" && request.method === "GET") {
          return applySecurityHeaders(await handleListPublicCategories(request, env));
        }

        // Everything below requires an authenticated session.
        const user = await getUserFromRequest(request, env);
        if (!user) return applySecurityHeaders(json({ error: "Not authenticated." }, { status: 401 }));

        if (url.pathname === "/api/me" && request.method === "GET") {
          return applySecurityHeaders(await handleGetMe(request, env, user));
        }
        if (url.pathname === "/api/categories" && request.method === "GET") {
          return applySecurityHeaders(await handleListCategories(request, env, user));
        }
        if (url.pathname === "/api/categories/enroll" && request.method === "POST") {
          return applySecurityHeaders(await handleEnrollCategory(request, env, user));
        }
        if (url.pathname === "/api/categories/switch" && request.method === "POST") {
          return applySecurityHeaders(await handleSwitchCategory(request, env, user));
        }
        if (url.pathname === "/api/categories/unenroll" && request.method === "POST") {
          return applySecurityHeaders(await handleUnenrollCategory(request, env, user));
        }
        if (url.pathname === "/api/state" && request.method === "GET") {
          return applySecurityHeaders(await handleGetState(request, env, user));
        }
        if (url.pathname === "/api/state" && request.method === "PUT") {
          return applySecurityHeaders(await handlePutState(request, env, user));
        }
        if (url.pathname === "/api/activity" && request.method === "GET") {
          return applySecurityHeaders(await handleGetActivity(request, env, user));
        }
        if (url.pathname === "/api/export/progress" && request.method === "GET") {
          return applySecurityHeaders(await handleExportProgress(request, env, user));
        }
        if (url.pathname === "/api/password/change" && request.method === "POST") {
          return applySecurityHeaders(await handleChangePassword(request, env, user));
        }
        if (url.pathname === "/api/account" && request.method === "PATCH") {
          return applySecurityHeaders(await handleUpdateAccount(request, env, user));
        }
        if (url.pathname === "/api/profile" && request.method === "PATCH") {
          return applySecurityHeaders(await handleUpdateProfile(request, env, user));
        }
        if (url.pathname === "/api/sessions/revoke-all" && request.method === "POST") {
          return applySecurityHeaders(await handleRevokeAllSessions(request, env, user));
        }
        if (url.pathname === "/api/queue/today" && request.method === "GET") {
          return applySecurityHeaders(await handleGetTodayQueue(request, env, user));
        }
        if (url.pathname === "/api/questions/complete" && request.method === "POST") {
          return applySecurityHeaders(await handleCompleteQuestion(request, env, user));
        }
        if (url.pathname === "/api/questions/flag-review" && request.method === "POST") {
          return applySecurityHeaders(await handleFlagQuestionForReview(request, env, user));
        }
        if (url.pathname === "/api/questions/request-more" && request.method === "POST") {
          return applySecurityHeaders(await handleRequestMore(request, env, user));
        }
        if (url.pathname === "/api/questions/review-result" && request.method === "POST") {
          return applySecurityHeaders(await handleReviewResult(request, env, user));
        }
        if (url.pathname === "/api/review" && request.method === "GET") {
          return applySecurityHeaders(await handleGetReview(request, env, user));
        }
        if (url.pathname === "/api/question-sets" && request.method === "POST") {
          return applySecurityHeaders(await handleCreateQuestionSet(request, env, user));
        }
        if (url.pathname === "/api/question-sets/mine" && request.method === "GET") {
          return applySecurityHeaders(await handleListMySets(request, env, user));
        }
        if (url.pathname === "/api/questions/bank-count" && request.method === "GET") {
          return applySecurityHeaders(await handleGetBankCount(request, env, user));
        }
        if (url.pathname === "/api/ai-usage" && request.method === "GET") {
          return applySecurityHeaders(await handleGetAiUsage(request, env, user));
        }
        if (url.pathname === "/api/stats/progress" && request.method === "GET") {
          return applySecurityHeaders(await handleGetStatsProgress(request, env, user));
        }
        if (url.pathname === "/api/stats/insight" && request.method === "GET") {
          return applySecurityHeaders(await handleGetStatsInsight(request, env, user));
        }
        if (url.pathname === "/api/resume/suggest-role" && request.method === "POST") {
          return applySecurityHeaders(await handleSuggestTargetRole(request, env, user));
        }
        if (url.pathname === "/api/resume/generate-prompt" && request.method === "POST") {
          return applySecurityHeaders(await handleGenerateResumePrompt(request, env, user));
        }
        if (url.pathname === "/api/question-sets/suggestions" && request.method === "GET") {
          return applySecurityHeaders(await handleListSuggestions(request, env, user));
        }
        if (url.pathname === "/api/question-sets/generate-prompt" && request.method === "POST") {
          return applySecurityHeaders(await handleGenerateCategoryPrompt(request, env, user));
        }
        if (url.pathname === "/api/self-test/quota" && request.method === "GET") {
          return applySecurityHeaders(await handleGetSelfTestQuota(request, env, user));
        }
        if (url.pathname === "/api/self-test/question" && request.method === "GET") {
          return applySecurityHeaders(await handleGetSelfTestQuestion(request, env, user));
        }
        if (url.pathname === "/api/self-test/analyze" && request.method === "POST") {
          return applySecurityHeaders(await handleSelfTestAnalyze(request, env, user));
        }
        if (url.pathname === "/api/self-test/history" && request.method === "GET") {
          return applySecurityHeaders(await handleGetSelfTestHistory(request, env, user));
        }

        const setAction = url.pathname.match(/^\/api\/question-sets\/([^/]+)\/(submit|subscribe)$/);
        if (setAction && request.method === "POST") {
          const [, setId, action] = setAction;
          if (action === "submit") return applySecurityHeaders(await handleSubmitSet(request, env, user, setId));
          return applySecurityHeaders(await handleSubscribeSet(request, env, user, setId));
        }

        const adminSetAction = url.pathname.match(/^\/api\/admin\/question-sets\/([^/]+)\/(approve|reject)$/);
        if (adminSetAction && request.method === "POST") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          const [, setId, action] = adminSetAction;
          if (action === "approve") return applySecurityHeaders(await handleApproveSet(request, env, user, setId));
          return applySecurityHeaders(await handleRejectSet(request, env, user, setId));
        }
        if (url.pathname === "/api/admin/pending-sets" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminPendingSets(request, env, user));
        }
        if (url.pathname === "/api/admin/approval-history" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminApprovalHistory(request, env, user));
        }
        const adminSetQuestions = url.pathname.match(/^\/api\/admin\/question-sets\/([^/]+)\/questions$/);
        if (adminSetQuestions && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminGetSetQuestions(request, env, user, adminSetQuestions[1]));
        }
        if (url.pathname === "/api/admin/categories" && request.method === "POST") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleCreateCategory(request, env, user));
        }
        if (url.pathname === "/api/admin/overview" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminOverview(request, env, user));
        }
        if (url.pathname === "/api/admin/users" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminUsers(request, env, user));
        }
        const adminUserStats = url.pathname.match(/^\/api\/admin\/users\/([^/]+)\/stats$/);
        if (adminUserStats && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminUserStats(request, env, user, adminUserStats[1]));
        }

        const reportAction = url.pathname.match(/^\/api\/questions\/([^/]+)\/report$/);
        if (reportAction && request.method === "POST") {
          return applySecurityHeaders(await handleReportQuestion(request, env, user, reportAction[1]));
        }
        if (url.pathname === "/api/admin/question-reports" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminListReports(request, env, user));
        }
        const resolveReport = url.pathname.match(/^\/api\/admin\/question-reports\/([^/]+)\/resolve$/);
        if (resolveReport && request.method === "POST") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminResolveReport(request, env, user, resolveReport[1]));
        }
        if (url.pathname === "/api/admin/questions/search" && request.method === "GET") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminSearchQuestions(request, env, user));
        }
        const adminUpdateQuestion = url.pathname.match(/^\/api\/admin\/questions\/([^/]+)$/);
        if (adminUpdateQuestion && request.method === "PATCH") {
          if (user.role !== "admin") return applySecurityHeaders(json({ error: "Forbidden." }, { status: 403 }));
          return applySecurityHeaders(await handleAdminUpdateQuestion(request, env, user, adminUpdateQuestion[1]));
        }

        if (url.pathname === "/api/test/today" && request.method === "GET") {
          return applySecurityHeaders(await handleGetTodayTest(request, env, user));
        }
        if (url.pathname === "/api/test/answer" && request.method === "POST") {
          return applySecurityHeaders(await handleAnswerTest(request, env, user));
        }

        if (url.pathname === "/api/push/vapid-public-key" && request.method === "GET") {
          return applySecurityHeaders(json({ publicKey: env.VAPID_PUBLIC_KEY || null }));
        }
        if (url.pathname === "/api/push/subscribe" && request.method === "POST") {
          return applySecurityHeaders(await handlePushSubscribe(request, env, user));
        }
        if (url.pathname === "/api/push/unsubscribe" && request.method === "POST") {
          return applySecurityHeaders(await handlePushUnsubscribe(request, env, user));
        }

        return applySecurityHeaders(json({ error: "Not found." }, { status: 404 }));
      } catch (err) {
        return applySecurityHeaders(
          json({ error: "Server error.", detail: String(err && err.message ? err.message : err) }, { status: 500 }),
        );
      }
    }

    // Static app (public/) — index.html, app.js, styles.css, questions.js
    const assetResponse = await env.ASSETS.fetch(request);
    return applySecurityHeaders(assetResponse);
  },

  async scheduled(event, env) {
    await handleScheduled(env);
  },
};
