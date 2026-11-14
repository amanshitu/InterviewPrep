import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { Card, PublicPage, SectionTitle } from "../../components/layout/PublicPageParts";
import { BackIcon } from "../../components/layout/icons";
import { usePageTitle } from "../../hooks/use-page-title";

interface GuideSection {
  page: string;
  title: string;
  body: string;
  tips: string[];
}

const SECTIONS: GuideSection[] = [
  {
    page: "Today",
    title: "Today — your daily queue",
    body:
      "Your home screen. It shows a batch of questions sized to your daily quota, drawn from the categories you're " +
      "enrolled in. Anything left unfinished from a prior day shows up first (capped, so a few missed days never " +
      "turns into an overwhelming pile).",
    tips: [
      "Click \"Show Answer\" to reveal a question's model answer, then mark it \"Got it\" or \"Review again soon\" — that's what feeds Daily Review's spaced-repetition schedule.",
      "Once every question in today's batch is marked, a \"Request more\" button appears for an extra batch the same size as your quota.",
      "The cards below the queue launch Daily Review, Daily Test, Self Test and Mock Interview — all draw from questions you've already completed.",
    ],
  },
  {
    page: "Review",
    title: "Review — spaced repetition",
    body:
      "A batch pulled from everything you've completed, prioritizing questions that are actually due for review " +
      "today (the Today page tells you how many that is) and filling the rest from what you've covered before.",
    tips: [
      "Grading \"Got it\" pushes a question further out before it resurfaces — a question you keep nailing eventually stops competing for review slots.",
      "Grading \"Review again soon\" resets that schedule and brings it back the very next day.",
      "Use the slider before generating a batch to control how many questions you want in one sitting.",
    ],
  },
  {
    page: "Daily Test",
    title: "Daily Test — AI-generated multiple choice",
    body:
      "Ten multiple-choice questions generated from what you've completed. It's the same set all day, so closing the " +
      "tab and coming back picks up exactly where you left off.",
    tips: [
      "Generation uses the built-in shared AI by default; set your own OpenAI or Anthropic key in Settings for unlimited daily generations.",
      "A fresh set generates automatically the next day.",
    ],
  },
  {
    page: "Self Test",
    title: "Self Test — free-response with AI feedback",
    body:
      "Write or speak your own answer to a random question from your completed list, then get AI feedback on how it " +
      "compares to the model answer — useful for practicing how you'd actually phrase something out loud.",
    tips: [
      "The mic button dictates your answer if you'd rather speak it than type it.",
      "Feedback highlights what you covered well and what the model answer included that yours didn't.",
    ],
  },
  {
    page: "Mock Interview",
    title: "Mock Interview — back-to-back practice",
    body:
      "A short run of questions (3, 5, or 8) answered one after another without stopping to check feedback in " +
      "between, closer to how a real interview actually feels, with a session summary once you finish the batch.",
    tips: [
      "Pick the question count before starting — it can't be changed mid-session.",
      "The summary at the end recaps every question and answer from that run.",
    ],
  },
  {
    page: "Stats",
    title: "Stats — track your progress",
    body:
      "Your streak (current and longest), an accuracy trend chart over time, the topics and specific questions " +
      "you're weakest on, and an AI coaching insight personalized to your prep profile.",
    tips: [
      "Fill in your prep profile in Settings (role, experience, a short bio) — the coaching insight uses it to tailor its advice.",
      "\"Weakest questions\" is a good starting point for what to focus a Review session on.",
    ],
  },
  {
    page: "Settings",
    title: "Settings — your account",
    body: "Six tabs cover everything about your account:",
    tips: [
      "Account — name, email, password, and a list of your active sign-in sessions you can revoke individually.",
      "Profile — which categories you're enrolled in (switch your active one or join another), plus your prep profile (role, experience, bio).",
      "Appearance — theme, accent color, font size, and read-aloud voice/speed preferences.",
      "AI — choose the built-in shared AI or your own OpenAI/Anthropic key, and see how much of your daily AI usage you've used.",
      "Notifications — turn on push notifications for a daily reminder when you have questions waiting.",
      "Data — export everything ExamStreak has stored about your account and progress as a file.",
    ],
  },
];

const ADMIN_NOTE =
  "Shared question content (the curriculum every account draws from, plus sets other users submit) is curated by " +
  "admins rather than uploaded directly by every account — if you'd like to contribute questions or spotted " +
  "something that needs fixing, the Feedback button in the sidebar and the Report button under any question's " +
  "answer both reach an admin directly.";

export function Guide() {
  usePageTitle("Guide");
  return (
    <PublicPage>
      <Card className="bg-linear-to-br from-primary/10 to-transparent">
        <SectionTitle size="lg">Guide</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          A walkthrough of every page in ExamStreak, in the order they appear in the sidebar. For the bigger picture
          of what the app is and why, see the <a className="font-medium text-primary underline underline-offset-2" href="/about">About</a> page.
        </p>
      </Card>

      {SECTIONS.map((s) => (
        <Card key={s.page}>
          <SectionTitle>{s.title}</SectionTitle>
          <p className="mt-2 text-sm text-muted-foreground">{s.body}</p>
          <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
            {s.tips.map((tip, i) => (
              <li key={i}>{tip}</li>
            ))}
          </ul>
        </Card>
      ))}

      <Card>
        <SectionTitle>Where shared content comes from</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">{ADMIN_NOTE}</p>
      </Card>

      <RelatedPages exclude="guide" />

      <a
        className="inline-flex items-center justify-center gap-1.5 self-center rounded-md px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        href="/login"
      >
        <BackIcon /> Back to sign in
      </a>

      <PublicFooter />
    </PublicPage>
  );
}
