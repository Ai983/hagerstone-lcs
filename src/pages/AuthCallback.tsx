import { useEffect, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/lib/supabase";
import { Loader2 } from "lucide-react";

/**
 * Token-receiver route. DEFENSIVE / FORWARD-COMPATIBLE.
 *
 * The Hub does NOT currently hand tokens to sub-apps — it opens each module
 * with window.open(url) and each sub-app logs in independently (confirmed in
 * the hagerstone-hub repo: ModuleCard → window.open). So today this route is a
 * no-op pass-through that just lands the user in the app (or /login).
 *
 * It ALSO already handles the future single-sign-on switch: if the Hub later
 * redirects here with access_token + refresh_token (in the URL hash or query),
 * we call supabase.auth.setSession() and the user is logged in without a second
 * login. Flipping to SSO then needs only the Hub-side change — no edit here.
 */
export default function AuthCallback() {
  const navigate = useNavigate();
  const ran = useRef(false);
  const [msg, setMsg] = useState("Signing you in…");

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      const hash = new URLSearchParams(window.location.hash.replace(/^#/, ""));
      const query = new URLSearchParams(window.location.search);
      const access_token = hash.get("access_token") ?? query.get("access_token");
      const refresh_token = hash.get("refresh_token") ?? query.get("refresh_token");

      if (access_token && refresh_token) {
        const { error } = await supabase.auth.setSession({ access_token, refresh_token });
        if (error) {
          setMsg("Sign-in link was invalid. Redirecting to login…");
          navigate("/login", { replace: true });
          return;
        }
        navigate("/", { replace: true });
        return;
      }

      // No tokens passed — rely on any existing session, else go to login.
      const { data: { session } } = await supabase.auth.getSession();
      navigate(session ? "/" : "/login", { replace: true });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="flex items-center gap-3 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
        <span className="text-sm">{msg}</span>
      </div>
    </div>
  );
}
