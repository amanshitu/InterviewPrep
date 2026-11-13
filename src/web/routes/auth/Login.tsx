import { useState, type FormEvent, type ComponentType, type ReactNode, type SVGProps } from "react";
import { forgotPassword, login, resetPassword, signup } from "../../api/auth";
import { ApiError } from "../../api/client";
import { markAuthed } from "../../lib/auth-flag";
import { BackIcon, CheckIcon, KeyIcon, PlusIcon, SendIcon, SpinnerIcon } from "../../components/layout/icons";
import { PasswordField } from "../../components/layout/PasswordField";

type FormKind = "login" | "signup" | "forgot" | "reset";

function errorMessage(err: unknown): string {
  if (err instanceof ApiError) return err.message;
  if (err instanceof Error) return err.message;
  return "Something went wrong.";
}

function detectTimezone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch {
    return "UTC";
  }
}

// The one pre-login page in this true-MPA architecture — sign-in,
// create-account, forgot-password, and reset-password all live here as
// one page with tab/form switching, faithfully matching the behavior of
// the old #auth-screen in public/index.html + public/app.js's
// setupAuthScreen()/showAuthForm(). On success, markAuthed() before
// redirecting to "/" so the very next page load's AuthGate doesn't
// bounce the freshly-signed-in user back here before /api/me gets a
// chance to confirm the new session cookie.
export function Login() {
  const resetToken = new URLSearchParams(window.location.search).get("reset");
  const [form, setForm] = useState<FormKind>(resetToken ? "reset" : "login");
  const [loginSuccessMessage, setLoginSuccessMessage] = useState<string | null>(null);

  return (
    <div className="flex min-h-dvh items-center justify-center bg-background px-4 py-10">
      <div className="w-full max-w-md rounded-lg border border-border bg-card p-6 text-card-foreground shadow-sm sm:p-8">
        <div className="mb-1 flex items-center gap-2">
          <svg width="30" height="30" viewBox="0 0 24 24" fill="none" aria-hidden="true" className="text-primary">
            <path d="M12 2 3 6.5v6C3 17.2 6.9 21.3 12 22.5 17.1 21.3 21 17.2 21 12.5v-6L12 2Z" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round" />
            <path d="M8.5 12.2l2.3 2.3 4.7-4.9" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <span className="text-lg font-bold">Interview Prep</span>
        </div>
        <p className="mb-5 text-sm text-muted-foreground">
          A daily interview-prep tracker: everyone gets the shared HR/behavioral curriculum, plus whatever question
          sets you or others upload — a fresh batch every day sized to your own pace, plus spaced-repetition review
          of everything you've covered.
        </p>

        {form === "login" || form === "signup" ? (
          <div className="mb-5 flex gap-1 rounded-md bg-muted p-1" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={form === "login"}
              onClick={() => setForm("login")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                form === "login" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <SendIcon width={14} height={14} /> Sign in
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={form === "signup"}
              onClick={() => setForm("signup")}
              className={`inline-flex flex-1 items-center justify-center gap-1.5 rounded-sm px-3 py-2 text-sm font-medium transition-colors ${
                form === "signup" ? "bg-card text-foreground shadow-sm" : "text-muted-foreground"
              }`}
            >
              <PlusIcon width={14} height={14} /> Create account
            </button>
          </div>
        ) : null}

        {form === "login" ? (
          <LoginForm
            successMessage={loginSuccessMessage}
            onForgot={() => {
              setLoginSuccessMessage(null);
              setForm("forgot");
            }}
          />
        ) : null}
        {form === "signup" ? <SignupForm /> : null}
        {form === "forgot" ? <ForgotForm onCancel={() => setForm("login")} /> : null}
        {form === "reset" ? (
          <ResetForm
            token={resetToken ?? ""}
            onDone={() => {
              history.replaceState(null, "", location.pathname);
              setLoginSuccessMessage("Password updated — please sign in.");
              setForm("login");
            }}
          />
        ) : null}
      </div>
    </div>
  );
}

function Field({ label, children, hint }: { label: string; children: React.ReactNode; hint?: string }) {
  return (
    <label className="mb-3 flex flex-col gap-1.5 text-sm font-medium text-muted-foreground">
      <span>{label}</span>
      {children}
      {hint ? <small className="font-normal text-muted-foreground">{hint}</small> : null}
    </label>
  );
}

const inputClass =
  "rounded-md border border-input bg-background px-3 py-2 text-sm text-foreground outline-none focus:border-ring focus:ring-1 focus:ring-ring";

function ErrorText({ children }: { children: string | null }) {
  if (!children) return null;
  return <p className="mb-3 text-sm font-medium text-destructive">{children}</p>;
}

function SuccessText({ children }: { children: string | null }) {
  if (!children) return null;
  return <p className="mb-3 text-sm font-medium text-success">{children}</p>;
}

function SubmitButton({
  children,
  icon: Icon,
  loading,
  loadingText,
}: {
  children: ReactNode;
  icon: ComponentType<SVGProps<SVGSVGElement>>;
  loading?: boolean;
  loadingText?: string;
}) {
  return (
    <button
      type="submit"
      disabled={loading}
      aria-busy={loading}
      className="flex w-full items-center justify-center gap-2 rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-70"
    >
      {loading ? <SpinnerIcon width={16} height={16} /> : <Icon width={16} height={16} />}
      {loading ? loadingText ?? children : children}
    </button>
  );
}

function LoginForm({ successMessage, onForgot }: { successMessage: string | null; onForgot: () => void }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await login({ email: email.trim(), password });
      markAuthed();
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Email">
        <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password">
        <PasswordField required autoComplete="current-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <SuccessText>{successMessage}</SuccessText>
      <SubmitButton icon={SendIcon} loading={submitting} loadingText="Signing in…">
        Sign in
      </SubmitButton>
      <button
        type="button"
        onClick={onForgot}
        className="mt-2 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted"
      >
        <KeyIcon width={15} height={15} />
        Forgot password?
      </button>
    </form>
  );
}

function SignupForm() {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [track, setTrack] = useState("");
  const [headline, setHeadline] = useState("");
  const [dailyQuota, setDailyQuota] = useState(10);
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await signup({
        name: name.trim(),
        email: email.trim(),
        password,
        track: track.trim(),
        headline: headline.trim(),
        dailyQuota: dailyQuota || 10,
        timezone: detectTimezone(),
      });
      markAuthed();
      window.location.href = "/";
    } catch (err) {
      setError(errorMessage(err));
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Your name">
        <input type="text" required autoComplete="name" className={inputClass} value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Email">
        <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <Field label="Password" hint="At least 8 characters.">
        <PasswordField required minLength={8} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <Field label="What are you preparing for?" hint="Optional — helps us suggest relevant question sets later.">
        <input type="text" placeholder="e.g. Engineering Management" className={inputClass} value={track} onChange={(e) => setTrack(e.target.value)} />
      </Field>
      <Field label="Current role (optional)">
        <input type="text" placeholder="e.g. Senior Backend Engineer" className={inputClass} value={headline} onChange={(e) => setHeadline(e.target.value)} />
      </Field>
      <Field label="Questions per day" hint="You can change this any time in Settings.">
        <input type="number" min={5} max={50} className={inputClass} value={dailyQuota} onChange={(e) => setDailyQuota(parseInt(e.target.value, 10) || 10)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <SubmitButton icon={PlusIcon} loading={submitting} loadingText="Creating account…">
        Create account
      </SubmitButton>
    </form>
  );
}

function ForgotForm({ onCancel }: { onCancel: () => void }) {
  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setSubmitting(true);
    try {
      const data = await forgotPassword(email.trim());
      setSuccess(data.message || "If that email is registered, we've sent a reset link.");
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="mb-4 text-sm text-muted-foreground">Enter your account email and we'll send a link to reset your password.</p>
      <Field label="Email">
        <input type="email" required autoComplete="email" className={inputClass} value={email} onChange={(e) => setEmail(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <SuccessText>{success}</SuccessText>
      <SubmitButton icon={KeyIcon} loading={submitting} loadingText="Sending…">
        Send reset link
      </SubmitButton>
      <button type="button" onClick={onCancel} className="mt-2 flex w-full items-center justify-center gap-2 rounded-md px-4 py-2.5 text-sm font-medium text-muted-foreground hover:bg-muted">
        <BackIcon width={15} height={15} />
        Back to sign in
      </button>
    </form>
  );
}

function ResetForm({ token, onDone }: { token: string; onDone: () => void }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await resetPassword(token, password);
      onDone();
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <p className="mb-4 text-sm text-muted-foreground">Choose a new password for your account.</p>
      <Field label="New password" hint="At least 8 characters.">
        <PasswordField required minLength={8} autoComplete="new-password" className={inputClass} value={password} onChange={(e) => setPassword(e.target.value)} />
      </Field>
      <ErrorText>{error}</ErrorText>
      <SubmitButton icon={CheckIcon} loading={submitting} loadingText="Updating…">
        Update password
      </SubmitButton>
    </form>
  );
}
