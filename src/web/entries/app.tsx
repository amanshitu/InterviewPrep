import { lazy, StrictMode, Suspense } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Navigate, Route, Routes } from "react-router";
import "../styles/globals.css";
import { AppShell } from "../components/layout/AppShell";
import { likelyAuthed } from "../lib/auth-flag";
import { listenForInstallEvents } from "../lib/pwa-install";
import { registerPwaUpdateWatcher } from "../lib/pwa-update";

// Lazy, not static, imports for every route — one document now covers
// every page (see the architecture note below), so without this the whole
// bundle (every app page, every public/legal page, Admin, everything)
// would load up front even for a visitor who only ever opens /privacy.
// Each entry becomes its own chunk, fetched only when that route is hit.
const Today = lazy(() => import("../routes/app/Today").then((m) => ({ default: m.Today })));
const Review = lazy(() => import("../routes/app/Review").then((m) => ({ default: m.Review })));
const DailyTest = lazy(() => import("../routes/app/DailyTest").then((m) => ({ default: m.DailyTest })));
const SelfTest = lazy(() => import("../routes/app/SelfTest").then((m) => ({ default: m.SelfTest })));
const MockInterview = lazy(() => import("../routes/app/MockInterview").then((m) => ({ default: m.MockInterview })));
const Stats = lazy(() => import("../routes/app/Stats").then((m) => ({ default: m.Stats })));
const Settings = lazy(() => import("../routes/app/Settings").then((m) => ({ default: m.Settings })));
const AdminHome = lazy(() => import("../routes/admin/AdminHome").then((m) => ({ default: m.AdminHome })));
const Login = lazy(() => import("../routes/auth/Login").then((m) => ({ default: m.Login })));
const Home = lazy(() => import("../routes/public/Home").then((m) => ({ default: m.Home })));
const About = lazy(() => import("../routes/public/About").then((m) => ({ default: m.About })));
const Guide = lazy(() => import("../routes/public/Guide").then((m) => ({ default: m.Guide })));
const Faq = lazy(() => import("../routes/public/Faq").then((m) => ({ default: m.Faq })));
const Privacy = lazy(() => import("../routes/public/Privacy").then((m) => ({ default: m.Privacy })));
const Terms = lazy(() => import("../routes/public/Terms").then((m) => ({ default: m.Terms })));
const Press = lazy(() => import("../routes/public/Press").then((m) => ({ default: m.Press })));
const Grievance = lazy(() => import("../routes/public/Grievance").then((m) => ({ default: m.Grievance })));

function RouteFallback() {
  return (
    <div className="flex min-h-dvh items-center justify-center bg-background">
      <div className="h-8 w-8 animate-spin rounded-full border-[3px] border-border border-t-primary" />
    </div>
  );
}

// Catch-all for a path that matches nothing below (a typo'd URL, an old
// bookmark, someone guessing at a route that doesn't exist like
// "/today") — without this, React Router renders nothing at all for an
// unmatched path, a blank page with no indication of what went wrong.
// Same signed-in guess AuthGate itself uses: likely signed in -> "/",
// where AuthGate's real GET /api/me check still runs and will bounce to
// /login anyway if that guess was wrong; not likely signed in -> straight
// to /login, per the same "fast-path, no wasted round trip" reasoning.
function NotFoundRedirect() {
  return <Navigate to={likelyAuthed() ? "/" : "/login"} replace />;
}

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// Module scope, before React renders, so an early beforeinstallprompt (or
// an already-waiting service worker from a deploy that landed while this
// tab was closed) is never missed — same reasoning as MealSathi's
// `listenForInstallEvents()` call in its own entry point.
listenForInstallEvents();
registerPwaUpdateWatcher();

// Single document, single bundle for the whole app — authenticated pages
// under the AppShell layout route (sidebar/header mounted once, React
// Router swaps only the <Outlet/> content), and every public/auth page as
// sibling top-level routes that render on their own, bypassing AppShell
// and AuthGate entirely (they don't need a session). Previously these
// public pages were each their own separate HTML document/entry/build
// target (about.html, login.html, etc.) — consolidated here so there's
// exactly one document, matching MealSathi's own persistent-shell
// architecture, and so Cloudflare's assets `not_found_handling:
// "single-page-application"` fallback (see wrangler.toml) is the only
// routing path that ever needs to exist. Every route is lazy-loaded (see
// above) specifically so this consolidation doesn't turn into "every
// visitor downloads the entire app" — each page's own chunk is fetched
// only once its route actually matches.
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
      <Suspense fallback={<RouteFallback />}>
        <Routes>
          <Route element={<AppShell />}>
            <Route path="/" element={<Today />} />
            <Route path="/review" element={<Review />} />
            <Route path="/test" element={<DailyTest />} />
            <Route path="/self-test" element={<SelfTest />} />
            <Route path="/mock-interview" element={<MockInterview />} />
            <Route path="/stats" element={<Stats />} />
            <Route path="/settings" element={<Settings />} />
            <Route path="/admin" element={<AdminHome />} />
          </Route>
          <Route path="/login" element={<Login />} />
          <Route path="/home" element={<Home />} />
          <Route path="/about" element={<About />} />
          <Route path="/guide" element={<Guide />} />
          <Route path="/faq" element={<Faq />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/press" element={<Press />} />
          <Route path="/grievance" element={<Grievance />} />
          <Route path="*" element={<NotFoundRedirect />} />
        </Routes>
      </Suspense>
    </BrowserRouter>
  </StrictMode>,
);
