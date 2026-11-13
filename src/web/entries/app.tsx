import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter, Route, Routes } from "react-router";
import "../styles/globals.css";
import { AppShell } from "../components/layout/AppShell";
import { Today } from "../routes/app/Today";
import { Review } from "../routes/app/Review";
import { DailyTest } from "../routes/app/DailyTest";
import { SelfTest } from "../routes/app/SelfTest";
import { MockInterview } from "../routes/app/MockInterview";
import { Stats } from "../routes/app/Stats";
import { Settings } from "../routes/app/Settings";
import { AdminHome } from "../routes/admin/AdminHome";

const root = document.getElementById("root");
if (!root) throw new Error("#root not found");

// Single-page app for the whole authenticated area: one document, one
// AppShell (sidebar/header mounted once as a layout route — see
// AppShell.tsx), React Router swaps only the <Outlet/> content between
// these routes. Matches MealSathi's own persistent-shell architecture.
// Login and About stay separate documents on purpose (real navigation
// boundaries: signed-out <-> signed-in, and a rarely-visited info page),
// not something a user clicks between constantly the way these 8 pages
// are, so the "every click reloads" complaint doesn't apply to them.
createRoot(root).render(
  <StrictMode>
    <BrowserRouter>
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
      </Routes>
    </BrowserRouter>
  </StrictMode>,
);
