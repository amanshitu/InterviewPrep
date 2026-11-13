import type { ComponentType, SVGProps } from "react";
import {
  AboutIcon,
  AdminIcon,
  MockInterviewIcon,
  ReviewIcon,
  SelfTestIcon,
  SettingsIcon,
  StatsIcon,
  TestIcon,
  TodayIcon,
} from "../components/layout/icons";

export interface NavItem {
  href: string;
  label: string;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  adminOnly?: boolean;
  // True for the handful of pages that are deliberately still a separate
  // document (About) rather than part of the single-page app's router —
  // real navigation boundaries, not something a user clicks constantly,
  // so a full page load there isn't the "every click reloads" problem
  // this nav was converted to React Router to fix.
  external?: boolean;
}

// Mirrors the existing app's page list (public/app.js's PAGE_LOADERS) —
// same routes, same order, now rendered as a persistent sidebar with
// client-side routing between them (React Router), matching MealSathi's
// app-shell pattern, instead of each being its own full-page-reload document.
export const primaryNav: NavItem[] = [
  { href: "/", label: "Today", icon: TodayIcon },
  { href: "/review", label: "Review", icon: ReviewIcon },
  { href: "/test", label: "Daily Test", icon: TestIcon },
  { href: "/self-test", label: "Self Test", icon: SelfTestIcon },
  { href: "/mock-interview", label: "Mock Interview", icon: MockInterviewIcon },
  { href: "/stats", label: "Stats", icon: StatsIcon },
];

export const secondaryNav: NavItem[] = [
  { href: "/settings", label: "Settings", icon: SettingsIcon },
  { href: "/admin", label: "Admin", icon: AdminIcon, adminOnly: true },
  { href: "/about", label: "About", icon: AboutIcon, external: true },
];
