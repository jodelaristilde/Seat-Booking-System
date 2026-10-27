"use client";

// Sign in: just the logo and the form. (What Seating4U is lives on the homepage.)
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { toast } from "sonner";
import Image from "next/image";
import Link from "next/link";
import { Eye, EyeOff } from "lucide-react";

export default function LoginPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [show, setShow] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    const formData = new FormData(e.currentTarget);
    const response = await signIn("credentials", {
      email: String(formData.get("email") ?? "").trim(),
      password: formData.get("password"),
      redirect: false,
    }).catch(() => null);

    if (!response || response.error) {
      setError(!response ? "No internet? Check your connection and try again." : "Wrong username or password. Please try again.");
      setLoading(false);
      return;
    }
    toast.success("Welcome back!");
    router.push("/dashboard");
    router.refresh();
  };

  const input =
    "block w-full rounded-lg border border-zinc-300 bg-white px-4 py-3 text-base text-black placeholder-zinc-400 focus:border-lime-500 focus:outline-none focus:ring-2 focus:ring-lime-200";

  return (
    <div className="flex min-h-[calc(100vh-6rem)] items-center justify-center px-4 py-10">
      <div className="w-full max-w-sm">
        <Link href="/" className="mb-6 flex justify-center">
          <Image src="/seating4u-logo.png" alt="Seating4U" width={300} height={92} className="h-auto w-[260px]" priority />
        </Link>
        <form onSubmit={handleSubmit} className="space-y-4 rounded-2xl border border-zinc-200 bg-white p-6 shadow-lg">
          <h1 className="text-center text-2xl font-bold text-black">Sign in</h1>
          <div>
            <label htmlFor="email" className="mb-1 block text-sm font-semibold text-zinc-700">
              Username
            </label>
            <input id="email" name="email" required autoComplete="username" autoCapitalize="none" className={input} placeholder="Your username" />
          </div>
          <div>
            <label htmlFor="password" className="mb-1 block text-sm font-semibold text-zinc-700">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                name="password"
                type={show ? "text" : "password"}
                required
                autoComplete="current-password"
                className={`${input} pr-12`}
                placeholder="Your password"
              />
              <button
                type="button"
                onClick={() => setShow((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-zinc-500 hover:bg-zinc-100"
                aria-label={show ? "Hide password" : "Show password"}
              >
                {show ? <EyeOff className="h-5 w-5" /> : <Eye className="h-5 w-5" />}
              </button>
            </div>
          </div>
          {error && <p className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700">{error}</p>}
          <button
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-lime-600 py-3.5 text-lg font-bold text-white hover:bg-lime-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {loading ? "Signing in…" : "Sign in"}
          </button>
          <a href="/forgot" className="block text-center text-sm text-zinc-500 underline hover:text-zinc-800">
            Forgot your password?
          </a>
        </form>
        <p className="mt-5 text-center text-sm text-zinc-600">
          New to Seating4U?{" "}
          <Link href="/#request" className="font-semibold text-lime-700 underline">
            Request access
          </Link>
        </p>
      </div>
    </div>
  );
}
