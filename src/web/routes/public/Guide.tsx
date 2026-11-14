// /guide — the illustrated visual guide, following the same structure as
// MealSathi's and CosmoTracker's own quick guides (both themselves modelled
// on each other): a hero, sticky section chips, groups of numbered cards
// (icon header strip + badge + title + body + optional numbered steps +
// chips quoting the real button labels so they never drift from the actual
// UI), a tips grid, and a closing call to action. Scoped down from those
// two references in one deliberate way: icon-based card art instead of
// ~20 bespoke hand-drawn illustrations, and no flow-diagram/"where is it"
// map sections — proportionate to ExamStreak's much smaller page count.
import { type ComponentType, type ReactNode, type SVGProps } from "react";
import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { PublicPage } from "../../components/layout/PublicPageParts";
import {
  ArrowRightIcon,
  BackIcon,
  DownloadIcon,
  FlagIcon,
  HelpCircleIcon,
  LayersIcon,
  MessageIcon,
  MockInterviewIcon,
  PlusIcon,
  ReviewIcon,
  SelfTestIcon,
  ShieldIcon,
  SparkleIcon,
  StatsIcon,
  TestIcon,
  TodayIcon,
} from "../../components/layout/icons";
import { ClipboardIcon, PaletteIcon } from "../../components/settings/icons";
import { usePageTitle } from "../../hooks/use-page-title";

type Icon = ComponentType<SVGProps<SVGSVGElement>>;

interface GuideCard {
  icon: Icon;
  title: string;
  body: string;
  steps?: string[];
  chips: string[];
  to: string;
}

interface GuideGroup {
  id: string;
  label: string;
  title: string;
  sub: string;
  cards: GuideCard[];
}

const GROUPS: GuideGroup[] = [
  {
    id: "start",
    label: "Get started",
    title: "Set up your prep",
    sub: "A few one-time choices before your first day.",
    cards: [
      {
        icon: PlusIcon,
        title: "Create your account",
        body: "Pick a starting category and a daily quota when you sign up — both are easy to change later.",
        chips: ["Create account", "Which category do you want to start with?", "Questions per day"],
        to: "/login?form=signup",
      },
      {
        icon: ClipboardIcon,
        title: "Fill in your prep profile",
        body: "Your target role, experience, and a short bio — used to personalize the AI coaching insight on Stats.",
        steps: ["Open Settings", "Go to the Profile tab", "Fill in role, experience, and bio"],
        chips: ["Prep profile", "Current role", "Bio"],
        to: "/settings?tab=profile",
      },
      {
        icon: PaletteIcon,
        title: "Pick your look",
        body: "Seven theme looks and nine accent colors, each recoloring the whole app, not just buttons.",
        chips: ["Appearance & Accessibility", "Theme", "Accent color"],
        to: "/settings?tab=appearance",
      },
      {
        icon: LayersIcon,
        title: "Enroll in more categories",
        body: "Not locked to one track — join additional categories any time and switch your active one from Settings.",
        chips: ["Prep profile", "Enroll"],
        to: "/settings?tab=profile",
      },
    ],
  },
  {
    id: "daily",
    label: "Daily loop",
    title: "Your daily loop",
    sub: "The six pages you'll actually use every day.",
    cards: [
      {
        icon: TodayIcon,
        title: "Today",
        body: "A batch of questions sized to your quota. Reveal an answer, then grade it — that's what drives Review.",
        chips: ["Show Answer", "Got it", "Review again soon", "Request more"],
        to: "/",
      },
      {
        icon: ReviewIcon,
        title: "Review",
        body: "Spaced repetition: due questions are prioritized first, filled out from everything else you've completed.",
        chips: ["Generate today's review", "Got it", "Review again soon"],
        to: "/review",
      },
      {
        icon: TestIcon,
        title: "Daily Test",
        body: "10 AI-generated multiple-choice questions from what you've completed — same set all day.",
        chips: ["Start today's test"],
        to: "/test",
      },
      {
        icon: SelfTestIcon,
        title: "Self Test",
        body: "Write or speak your own answer, then get AI feedback against the model answer.",
        chips: ["Start self test"],
        to: "/self-test",
      },
      {
        icon: MockInterviewIcon,
        title: "Mock Interview",
        body: "A back-to-back run of questions with a session summary at the end — pick 3, 5, or 8 before starting.",
        chips: ["Start mock interview", "3 Qs", "5 Qs", "8 Qs"],
        to: "/mock-interview",
      },
      {
        icon: StatsIcon,
        title: "Stats",
        body: "Streaks, an accuracy trend, your weakest topics, and an AI coaching insight tailored to your profile.",
        chips: ["Stats"],
        to: "/stats",
      },
    ],
  },
  {
    id: "help",
    label: "Get help",
    title: "Get help or fix something",
    sub: "Shared content is admin-curated — here's how to reach one.",
    cards: [
      {
        icon: FlagIcon,
        title: "Report a question",
        body: "Spotted a wrong answer or a confusing question? Flag it directly from wherever it's shown.",
        chips: ["Report"],
        to: "/",
      },
      {
        icon: MessageIcon,
        title: "Send feedback",
        body: "Bugs, feature ideas, or anything else — reaches an admin directly from the sidebar.",
        chips: ["Feedback"],
        to: "/",
      },
      {
        icon: DownloadIcon,
        title: "Export or delete your data",
        body: "Download everything ExamStreak has on your account, or schedule account deletion with a 30-day grace period.",
        chips: ["Export my progress (JSON)", "Delete my account"],
        to: "/settings?tab=data",
      },
    ],
  },
];

const TIPS: { icon: Icon; title: string; body: string }[] = [
  { icon: ShieldIcon, title: "Your data stays yours", body: "Passwords are hashed, your own AI key (if you add one) is encrypted, and you can export or delete everything from Settings → Data." },
  { icon: SparkleIcon, title: "Built-in AI, or bring your own", body: "Free by default with a daily cap — add your own OpenAI or Anthropic key in Settings → AI for unlimited use." },
  { icon: HelpCircleIcon, title: "Something wrong? Just flag it", body: "Report and Feedback both reach an admin directly — shared content is curated, not a free-for-all." },
];

function Chip({ children }: { children: ReactNode }) {
  return (
    <li className="inline-flex min-h-7 items-center rounded-full border border-primary/25 bg-background px-2.5 text-xs font-medium shadow-xs">
      {children}
    </li>
  );
}

function CardItem({ card, n }: { card: GuideCard; n: number }) {
  return (
    <li className="flex h-full flex-col overflow-hidden rounded-2xl border border-border bg-card shadow-xs">
      <div className="relative flex h-24 items-center justify-center bg-primary/8">
        <span aria-hidden className="inline-flex size-12 items-center justify-center rounded-2xl bg-primary/12 text-primary">
          <card.icon width={22} height={22} />
        </span>
        <span
          aria-hidden
          className="absolute left-3 top-3 inline-flex size-8 items-center justify-center rounded-full bg-primary text-sm font-bold text-primary-foreground shadow-md ring-4 ring-card"
        >
          {n}
        </span>
      </div>
      <div className="flex flex-1 flex-col gap-2.5 p-4">
        <h3 className="text-base font-semibold leading-snug text-foreground">{card.title}</h3>
        <p className="text-sm leading-relaxed text-muted-foreground">{card.body}</p>
        {card.steps && (
          <ol className="space-y-1.5">
            {card.steps.map((s, i) => (
              <li key={i} className="flex items-start gap-2 text-sm">
                <span aria-hidden className="mt-0.5 inline-flex size-5 shrink-0 items-center justify-center rounded-full bg-primary/15 text-xs font-bold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0 leading-snug text-foreground">{s}</span>
              </li>
            ))}
          </ol>
        )}
        <ul className="mt-auto flex flex-wrap gap-1.5 pt-1">
          {[...new Set(card.chips)].map((c) => (
            <Chip key={c}>{c}</Chip>
          ))}
        </ul>
        <a
          href={card.to}
          className="mt-1 inline-flex min-h-9 w-fit items-center gap-1.5 self-start rounded-lg border border-border bg-background px-3 text-sm font-semibold text-primary outline-none hover:bg-primary/8"
        >
          Open <ArrowRightIcon width={14} height={14} />
        </a>
      </div>
    </li>
  );
}

export function Guide() {
  usePageTitle("Guide");
  return (
    <PublicPage>
      {/* Hero */}
      <header className="-mx-4 -mt-10 rounded-b-3xl border-b border-border bg-linear-to-b from-primary/10 to-background px-4 pb-8 pt-10 sm:mx-0 sm:mt-0 sm:rounded-3xl sm:border sm:px-6">
        <p className="inline-flex items-center gap-1.5 rounded-full bg-primary/12 px-3 py-1 text-xs font-semibold text-primary">
          <SparkleIcon width={14} height={14} /> Visual guide
        </p>
        <h1 className="mt-3 text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">See how ExamStreak fits together</h1>
        <p className="mt-2 max-w-xl text-pretty text-muted-foreground">
          Every page, what it's for, and the exact buttons you'll click — grouped the way you'll actually use them.
        </p>
        <div className="mt-5 flex flex-wrap gap-2.5">
          <a href="#start" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">
            See the steps
          </a>
          <a href="/login" className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-foreground hover:bg-secondary">
            <BackIcon width={14} height={14} /> Back to sign in
          </a>
        </div>
      </header>

      {/* Section chips */}
      <nav aria-label="Guide sections" className="sticky top-(--public-header-h,0px) z-20 -mx-4 overflow-x-auto border-b border-border bg-background/90 px-4 py-2.5 backdrop-blur sm:mx-0 sm:rounded-xl sm:border">
        <div className="flex gap-2">
          {GROUPS.map((g) => (
            <a
              key={g.id}
              href={`#${g.id}`}
              className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              {g.label}
            </a>
          ))}
          <a href="#tips" className="inline-flex min-h-9 shrink-0 items-center whitespace-nowrap rounded-full border border-border bg-card px-3.5 text-sm font-medium text-muted-foreground hover:text-foreground">
            Tips
          </a>
        </div>
      </nav>

      {GROUPS.map((group) => (
        <section key={group.id} id={group.id} aria-labelledby={`${group.id}-h`} className="scroll-mt-16">
          <h2 id={`${group.id}-h`} className="text-xl font-bold tracking-tight text-foreground">
            {group.title}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{group.sub}</p>
          <ol className="mt-4 grid gap-4 sm:grid-cols-2">
            {group.cards.map((c, i) => (
              <CardItem key={c.title} card={c} n={i + 1} />
            ))}
          </ol>
        </section>
      ))}

      {/* Tips */}
      <section id="tips" aria-labelledby="tips-h" className="scroll-mt-16">
        <h2 id="tips-h" className="text-xl font-bold tracking-tight text-foreground">Good to know</h2>
        <ul className="mt-4 grid gap-4 sm:grid-cols-3">
          {TIPS.map((tip) => (
            <li key={tip.title} className="rounded-2xl border border-border bg-card p-4">
              <span aria-hidden className="inline-flex size-10 items-center justify-center rounded-xl bg-primary/12 text-primary">
                <tip.icon width={18} height={18} />
              </span>
              <h3 className="mt-3 text-sm font-semibold leading-snug text-foreground">{tip.title}</h3>
              <p className="mt-1 text-sm text-muted-foreground">{tip.body}</p>
            </li>
          ))}
        </ul>
      </section>

      {/* Closing CTA */}
      <section className="rounded-2xl bg-linear-to-br from-primary/15 to-primary/5 p-6">
        <div className="flex flex-col items-start gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h2 className="text-lg font-bold tracking-tight text-foreground">That's the whole loop</h2>
            <p className="mt-1 text-sm text-muted-foreground">Questions about anything specific? The FAQ has quick answers.</p>
          </div>
          <div className="flex flex-wrap gap-2.5">
            <a href="/faq" className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm hover:opacity-90">
              Read the FAQ <ArrowRightIcon width={14} height={14} />
            </a>
            <a
              href="#top"
              onClick={(e) => {
                e.preventDefault();
                window.scrollTo({ top: 0, behavior: "smooth" });
              }}
              className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-medium text-muted-foreground hover:text-foreground"
            >
              Back to top
            </a>
          </div>
        </div>
      </section>

      <RelatedPages exclude="guide" />
      <PublicFooter />
    </PublicPage>
  );
}
