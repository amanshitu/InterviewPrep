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
}

// Mirrors the existing app's page list (public/app.js's PAGE_LOADERS) —
// same routes, same order, now rendered as a real sidebar/tab-bar instead
// of a client-side router's active-state highlighting.
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
  { href: "/about", label: "About", icon: AboutIcon },
];
