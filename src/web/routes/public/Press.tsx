import { useEffect, useState } from "react";
import { listPublicCategories } from "../../api/categories";
import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { Card, PublicPage, SectionTitle } from "../../components/layout/PublicPageParts";
import { BackIcon } from "../../components/layout/icons";
import { usePageTitle } from "../../hooks/use-page-title";

const CONTACT_EMAIL = "support@xynora.in";

const BOILERPLATE =
  "ExamStreak is a daily interview and exam prep companion built by Xynora. Every day, it gives each user a " +
  "personalized batch of questions sized to their own pace, spaced-repetition review of everything they've " +
  "covered, and AI-generated practice — covering interview curriculum (HR & behavioral, program management, " +
  "people management, technical architecture, AI automation) and competitive-exam categories like Railway, " +
  "Police, SSC, Banking, Teaching, and Mathematics.";

interface Stats {
  categories: number;
  questions: number;
}

export function Press() {
  usePageTitle("Press");
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    listPublicCategories()
      .then((res) => {
        const categories = res.categories.length;
        const questions = res.categories.reduce((sum, c) => sum + c.questionCount, 0);
        setStats({ categories, questions });
      })
      .catch(() => setStats(null));
  }, []);

  return (
    <PublicPage>
      <Card className="bg-linear-to-br from-primary/10 to-transparent">
        <SectionTitle size="lg">Press & media</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          Fact sheet, boilerplate description, and a contact for media and partnership inquiries.
        </p>
      </Card>

      <Card>
        <SectionTitle>Boilerplate</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{BOILERPLATE}</p>
      </Card>

      <Card>
        <SectionTitle>At a glance</SectionTitle>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="Categories" value={stats ? String(stats.categories) : "—"} />
          <Stat label="Questions" value={stats ? stats.questions.toLocaleString() : "—"} />
          <Stat label="AI providers" value="3" />
          <Stat label="Launched" value="2026" />
        </div>
        <p className="mt-3 text-xs text-muted-foreground">Category and question counts are live, pulled directly from the app.</p>
      </Card>

      <Card>
        <SectionTitle>Fact sheet</SectionTitle>
        <dl className="mt-3 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2">
          <Fact term="Product" desc="ExamStreak — daily interview & exam prep" />
          <Fact term="Built by" desc="Xynora" />
          <Fact term="Platform" desc="Installable web app (PWA), desktop & mobile" />
          <Fact term="Pricing" desc="Free, with optional bring-your-own AI key for unlimited AI use" />
          <Fact term="Categories" desc="Interview curriculum plus competitive-exam tracks" />
          <Fact term="Core loop" desc="Daily queue → spaced-repetition review → AI-generated test" />
        </dl>
      </Card>

      <Card>
        <SectionTitle>Media contact</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          For interviews, partnership inquiries, or anything else press-related, reach us at{" "}
          <a className="font-medium text-primary underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Press inquiry")}`}>
            {CONTACT_EMAIL}
          </a>.
        </p>
      </Card>

      <RelatedPages exclude="press" />

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

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-md bg-secondary p-3 text-center">
      <div className="text-xl font-bold tabular-nums text-foreground">{value}</div>
      <div className="text-xs text-muted-foreground">{label}</div>
    </div>
  );
}

function Fact({ term, desc }: { term: string; desc: string }) {
  return (
    <div>
      <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">{term}</dt>
      <dd className="mt-0.5 text-foreground">{desc}</dd>
    </div>
  );
}
