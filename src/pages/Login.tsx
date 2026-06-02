import { useState } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useForm } from "react-hook-form";
import { supabase } from "@/lib/supabase";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Loader2 } from "lucide-react";

interface LoginForm {
  email: string;
  password: string;
}

/**
 * LCS sign-in. Mirrors the Hub's email/password flow (signInWithPassword)
 * against the SAME Supabase project. Today each sub-app logs in separately
 * (no token handoff from the Hub) — see CLAUDE.md "Auth" for the planned SSO
 * switch. The session is persisted in this origin's localStorage.
 */
export default function Login() {
  const navigate = useNavigate();
  const location = useLocation();
  const [loading, setLoading] = useState(false);
  const { register, handleSubmit, formState: { errors } } = useForm<LoginForm>();

  const redirectTo = (location.state as { from?: { pathname?: string } } | null)?.from?.pathname ?? "/";

  const onSubmit = async (data: LoginForm) => {
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: data.email.trim(),
      password: data.password,
    });
    if (error) {
      toast.error("Invalid email or password");
      setLoading(false);
      return;
    }
    navigate(redirectTo, { replace: true });
  };

  return (
    <div
      className="min-h-screen flex items-center justify-center p-4"
      style={{ background: "radial-gradient(ellipse at 30% 20%, #fef3c7 0%, #fffbf0 50%, #fde68a 100%)" }}
    >
      <div className="relative z-10 w-full max-w-sm">
        <div className="text-center mb-8">
          <div
            className="inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-4"
            style={{ background: "linear-gradient(135deg, #6b3f1d 0%, #b45309 100%)", boxShadow: "0 8px 28px rgba(107,63,29,0.40)" }}
          >
            <span className="text-white text-2xl font-bold tracking-tight">H</span>
          </div>
          <h1 className="text-2xl font-semibold text-stone-800 tracking-tight">Hagerstone LCS</h1>
          <p className="text-sm text-stone-500 mt-1">Labour &amp; Contractor System</p>
        </div>

        <div
          className="bg-white/80 backdrop-blur-sm rounded-2xl border border-amber-100 p-6"
          style={{ boxShadow: "0 8px 40px rgba(107,63,29,0.13)" }}
        >
          <form onSubmit={handleSubmit(onSubmit)} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-stone-600 text-xs">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="you@hagerstone.com"
                autoComplete="email"
                className="bg-stone-50/80 border-stone-200"
                {...register("email", { required: "Email is required" })}
              />
              {errors.email && <p className="text-xs text-red-500">{errors.email.message}</p>}
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="password" className="text-stone-600 text-xs">Password</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                autoComplete="current-password"
                className="bg-stone-50/80 border-stone-200"
                {...register("password", { required: "Password is required" })}
              />
              {errors.password && <p className="text-xs text-red-500">{errors.password.message}</p>}
            </div>
            <Button
              type="submit"
              disabled={loading}
              className="w-full text-white font-medium"
              style={{ background: "linear-gradient(135deg, #6b3f1d 0%, #b45309 100%)" }}
            >
              {loading ? <><Loader2 className="h-4 w-4 animate-spin" /> Signing in…</> : "Sign in"}
            </Button>
          </form>
        </div>

        <p className="text-center text-xs text-stone-400 mt-5">
          Use your Hagerstone Hub credentials. Need access?{" "}
          <a href="mailto:admin@hagerstone.com" className="text-amber-700 hover:underline">admin@hagerstone.com</a>
        </p>
      </div>
    </div>
  );
}
