import { PublicFooter, RelatedPages } from "../../components/layout/PublicPageChrome";
import { Card, PublicPage, SectionTitle } from "../../components/layout/PublicPageParts";
import { BackIcon } from "../../components/layout/icons";

const CONTACT_EMAIL = "support@xynora.in";

export function Grievance() {
  return (
    <PublicPage>
      <Card className="bg-linear-to-br from-primary/10 to-transparent">
        <SectionTitle size="lg">Grievance redressal</SectionTitle>
        <p className="mt-2 text-sm text-muted-foreground">
          How to raise a concern about your data or this app's content, and how we handle it.
        </p>
      </Card>

      <Card>
        <SectionTitle>Grievance Officer</SectionTitle>
        <p className="mt-2 text-sm leading-relaxed text-foreground">
          For any complaint or concern about your personal data, a question's content, or how this app handles
          either, contact our Grievance Officer directly:
        </p>
        <dl className="mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Organization</dt>
            <dd className="mt-0.5 text-foreground">Xynora</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">Email</dt>
            <dd className="mt-0.5">
              <a className="font-medium text-primary underline underline-offset-2" href={`mailto:${CONTACT_EMAIL}?subject=${encodeURIComponent("Grievance")}`}>
                {CONTACT_EMAIL}
              </a>
            </dd>
          </div>
        </dl>
      </Card>

      <Card>
        <SectionTitle>What you can raise here</SectionTitle>
        <ul className="mt-3 flex list-disc flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>A privacy concern — how your data is collected, used, or stored (see the Privacy Policy).</li>
          <li>A request to export or delete your account and data.</li>
          <li>A complaint about question or answer content, beyond what the in-app Report button covers.</li>
          <li>Any other concern about how ExamStreak is operated.</li>
        </ul>
      </Card>

      <Card>
        <SectionTitle>What happens after you write in</SectionTitle>
        <ol className="mt-3 flex list-decimal flex-col gap-2 pl-5 text-sm leading-relaxed text-foreground">
          <li>You'll get an acknowledgment that your message was received.</li>
          <li>We'll look into it and respond with the outcome or next steps, typically within a few business days.</li>
          <li>If it's a data request (export or deletion), we'll confirm once it's done — self-serve options for both already exist in Settings for signed-in accounts.</li>
        </ol>
      </Card>

      <RelatedPages exclude="grievance" />

      <a
        className="inline-flex items-center justify-center gap-1.5 self-center rounded-(--radius-md) px-3 py-2 text-sm font-medium text-muted-foreground transition hover:bg-secondary hover:text-foreground"
        href="/login"
      >
        <BackIcon /> Back to sign in
      </a>

      <PublicFooter />
    </PublicPage>
  );
}
