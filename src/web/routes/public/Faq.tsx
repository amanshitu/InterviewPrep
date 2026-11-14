import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { Card, PublicPage, SectionTitle } from "../../components/layout/PublicPageParts";
import { BackIcon } from "../../components/layout/icons";
import { usePageTitle } from "../../hooks/use-page-title";

interface Faq {
  q: string;
  a: string;
}

const FAQS: Faq[] = [
  {
    q: "Is ExamStreak free to use?",
    a: "Yes. The daily queue, spaced-repetition review, and stats cost nothing. AI-generated features (Daily Test, Self Test, Mock Interview, the Stats coaching insight) use a shared built-in AI with a daily per-user cap by default; adding your own OpenAI or Anthropic key in Settings → AI removes that cap.",
  },
  {
    q: "How is my daily quota decided?",
    a: "You set it when you sign up, and can change it any time from Settings → Profile — each category you're enrolled in tracks its own quota and queue separately.",
  },
  {
    q: "What happens if I miss a day?",
    a: "Unfinished questions from that day roll forward and get priority in the next day's queue, capped so a few missed days never turns into an overwhelming pile. Your streak does reset, but nothing you were working through gets lost.",
  },
  {
    q: "Can I prepare for more than one category at once?",
    a: "Yes — enroll in additional categories from Settings → Profile and switch your active one any time. Progress, quota, and queue are all tracked per category.",
  },
  {
    q: "How does Review decide what to show me?",
    a: "A Leitner-box-style schedule: marking a question \"Got it\" pushes its next appearance further out each time (up to 180 days), while \"Review again soon\" resets that and brings it back the very next day. Review always prioritizes whatever's actually due before filling the rest of the batch from everything else you've completed.",
  },
  {
    q: "Can I add my own questions?",
    a: "Shared content — the curriculum every account draws from — is curated by admins. If you'd like to suggest content or correct something, use the Feedback button in the sidebar, or the Report button under any question's answer to flag that specific question.",
  },
  {
    q: "What AI models power the AI features?",
    a: "By default, Cloudflare Workers AI (a choice of a few open models). You can switch to your own OpenAI or Anthropic API key in Settings → AI for a different model and unlimited use — your key is encrypted at rest and only used for your own requests.",
  },
  {
    q: "Is my resume stored if I paste it to get a suggested target role?",
    a: "No. That text is never saved anywhere — it only exists in your browser and the one request used to suggest a role.",
  },
  {
    q: "Can I export or delete my data?",
    a: "Settings → Data lets you export everything ExamStreak has stored about your account and progress. There's no self-serve delete yet — email support@xynora.in and we'll remove your account and its data (see the Privacy Policy for details).",
  },
  {
    q: "Does it work offline, and can I install it?",
    a: "It's installable as a PWA on desktop or mobile. The app shell loads from cache when you're offline, but the daily queue, AI features, and stats all need a connection to fetch fresh data.",
  },
  {
    q: "I forgot my password — now what?",
    a: "Use the \"Forgot password?\" link on the sign-in form to get a reset link by email.",
  },
];

export function Faq() {
  usePageTitle("FAQ");
  return (
    <PublicPage>
      <Card className="bg-linear-to-br from-primary/10 to-transparent">
        <SectionTitle size="lg">Frequently asked questions</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Didn't find what you're looking for? See the <a className="font-medium text-primary underline underline-offset-2" href="/guide">Guide</a> for
          a page-by-page walkthrough, or reach us through the Feedback button once you're signed in.
        </p>
      </Card>

      <Card className="divide-y divide-border p-0">
        {FAQS.map((f) => (
          <details key={f.q} className="group p-5 open:bg-secondary/40">
            <summary className="flex cursor-pointer list-none items-center justify-between gap-3 text-sm font-semibold text-foreground marker:content-none">
              {f.q}
              <span aria-hidden className="shrink-0 text-muted-foreground transition-transform group-open:rotate-45">+</span>
            </summary>
            <p className="mt-2.5 text-sm leading-relaxed text-muted-foreground">{f.a}</p>
          </details>
        ))}
      </Card>

      <RelatedPages exclude="faq" />

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
