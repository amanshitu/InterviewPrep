import { useState } from "react";
import { EyeIcon, EyeOffIcon } from "./icons";

// A password <input> with a show/hide toggle button inside it, reused by
// every password field in the app (Login/Signup/Reset, Settings' change-
// password form). Defaults hidden (type="password"); the toggle button is
// purely presentational — it doesn't submit the form and isn't included
// in tab order ahead of the actual field content, consistent with other
// icon-only controls in this app (aria-label since there's no visible text).
export function PasswordField({
  className = "",
  ...inputProps
}: Omit<React.InputHTMLAttributes<HTMLInputElement>, "type">) {
  const [visible, setVisible] = useState(false);
  return (
    <div className="relative">
      <input {...inputProps} type={visible ? "text" : "password"} className={`w-full pr-10 ${className}`} />
      <button
        type="button"
        onClick={() => setVisible((v) => !v)}
        aria-label={visible ? "Hide password" : "Show password"}
        aria-pressed={visible}
        aria-controls={inputProps.id}
        tabIndex={-1}
        className="absolute inset-y-0 right-0 flex w-9 items-center justify-center text-muted-foreground hover:text-foreground"
      >
        {visible ? <EyeOffIcon width={17} height={17} /> : <EyeIcon width={17} height={17} />}
      </button>
    </div>
  );
}
