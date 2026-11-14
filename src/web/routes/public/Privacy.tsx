import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { Card, PublicPage, SectionTitle } from "../../components/layout/PublicPageParts";
import { BackIcon } from "../../components/layout/icons";
import { usePageTitle } from "../../hooks/use-page-title";

const EFFECTIVE_DATE = "November 14, 2026";
const VERSION = "1.0";
const CONTACT_EMAIL = "support@xynora.in";

interface LegalSection {
  n: number;
  title: string;
  paras?: string[];
  items?: string[];
}

const SECTIONS: LegalSection[] = [
  {
    n: 1,
    title: "What we collect",
    items: [
      "Account info — your name, email, and a password. Passwords are salted and hashed (PBKDF2-SHA256); we never store or see your password in plain text.",
      "Prep profile (optional) — your target role/track, experience level, and a short bio, used to personalize your AI coaching insight on the Stats page.",
      "Activity — the questions you've completed, how you graded them, your streak, your daily quota, and which categories you're enrolled in.",
      "Content you submit — question sets you upload or import, feedback you send us, and reports you file on specific questions.",
      "Your own AI key (optional) — if you add an OpenAI or Anthropic key in Settings instead of using the built-in AI, it's encrypted at rest (AES-GCM) and used only to make requests on your behalf.",
      "Push notification subscription (optional) — only created if you turn on notifications in Settings.",
      "Sign-in security — we briefly record the IP address behind login, signup, and password-reset attempts purely to throttle abuse; these records are automatically deleted on a rolling basis and aren't used for anything else.",
      "Resume text (optional, never stored) — if you paste your resume to get an AI-suggested target role, that text is sent for that one request only and is never written to our database.",
    ],
  },
  {
    n: 2,
    title: "How we use it",
    items: [
      "To run the features you actually see — your daily queue, spaced-repetition review, tests, and stats.",
      "To personalize the AI coaching insight on Stats using your prep profile.",
      "To send the daily reminder push notification, only if you've turned it on.",
      "To prevent abuse of the sign-in and account-recovery endpoints.",
    ],
  },
  {
    n: 3,
    title: "AI processing & third parties",
    paras: [
      "By default, AI features (question generation, coaching insight, Self Test feedback) run on Cloudflare Workers AI, as part of the same Cloudflare infrastructure that hosts ExamStreak — your data doesn't leave that environment for this path.",
      "If you choose to add your own OpenAI or Anthropic key, the specific request for that feature (e.g. the questions you've completed, for generating a test) is sent directly to that provider using your key. We don't retain the response beyond what's needed to show it to you.",
      `We don't sell personal data, and ExamStreak has no ads or third-party trackers. If you have questions about a specific AI exchange, contact us at ${CONTACT_EMAIL}.`,
    ],
  },
  {
    n: 4,
    title: "Cookies & local storage",
    items: [
      "One session cookie keeps you signed in. We don't use third-party advertising or analytics cookies.",
      "Display preferences (theme, accent color, font size, read-aloud settings) are stored in your browser's local storage and never leave your device.",
    ],
  },
  {
    n: 5,
    title: "Data retention",
    paras: [
      "Your account data is kept for as long as your account exists. Sign-in security records age out automatically within minutes of the attempt. If you submit a question report or feedback, it may remain visible in admin history after it's resolved, so the resolution stays auditable.",
    ],
  },
  {
    n: 6,
    title: "Your rights",
    items: [
      "Export everything we have on your account and progress any time from Settings → Data.",
      "Correct your profile, email, or password directly in Settings.",
      `Request full account deletion by emailing ${CONTACT_EMAIL} — there's no self-serve delete button yet.`,
    ],
  },
  {
    n: 7,
    title: "Children's privacy",
    paras: ["ExamStreak isn't directed at children under 13, and we don't knowingly collect data from them."],
  },
  {
    n: 8,
    title: "Changes to this policy",
    paras: ["If this policy changes in a meaningful way, we'll update the effective date above."],
  },
];

export function Privacy() {
  usePageTitle("Privacy Policy");
  return (
    <PublicPage>
      <Card className="bg-linear-to-br from-primary/10 to-transparent">
        <SectionTitle size="lg">Privacy Policy</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          What ExamStreak collects, why, and how you're in control of it.
        </p>
        <p className="mt-3 text-xs text-muted-foreground">
          Version {VERSION} &middot; Effective {EFFECTIVE_DATE}
        </p>
      </Card>

      {SECTIONS.map((s) => (
        <Card key={s.n}>
          <SectionTitle>
            <span className="mr-2 inline-flex size-6 items-center justify-center rounded-md bg-primary/12 align-middle text-sm tabular-nums text-primary">{s.n}</span>
            {s.title}
          </SectionTitle>
          <div className="mt-3 space-y-2.5 text-sm leading-relaxed text-foreground">
            {s.paras?.map((p, i) => <p key={i}>{p}</p>)}
            {s.items && (
              <ul className="list-disc space-y-2 pl-5 marker:text-primary">
                {s.items.map((item, i) => (
                  <li key={i}>{item}</li>
                ))}
              </ul>
            )}
          </div>
        </Card>
      ))}

      <Card>
        <SectionTitle>Questions?</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Reach us at{" "}
          <a className="font-medium text-primary underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}`}>{CONTACT_EMAIL}</a>.
        </p>
      </Card>

      <RelatedPages exclude="privacy" />

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
