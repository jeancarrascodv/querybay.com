import Link from "next/link";
import { Metadata } from "next";

export const metadata: Metadata = {
  title: "Sign in | QueryBay",
  description: "Access your QueryBay customer portal.",
};

const SigninPage = () => {
  return (
    <section className="relative min-h-screen overflow-hidden pt-28 pb-16 md:pt-32 lg:pt-36">
      <div className="pointer-events-none absolute inset-0 -z-10">
        <div className="absolute left-1/2 top-0 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.25),transparent_70%)] blur-3xl" />
        <div className="absolute -right-40 top-40 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.25),transparent_70%)] blur-3xl" />
        <div className="absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.2),transparent_70%)] blur-3xl" />
      </div>

      <div className="container">
        <div className="mx-auto grid max-w-[1100px] grid-cols-1 overflow-hidden rounded-3xl border border-black/10 bg-white/80 backdrop-blur-xl lg:grid-cols-2 dark:border-white/10 dark:bg-[#0f1220]/80">
          {/* Left panel - branding */}
          <div className="relative hidden overflow-hidden bg-[linear-gradient(135deg,#1e1b4b,#4c1d95,#831843)] p-10 lg:block lg:p-12">
            <div className="absolute inset-0 opacity-40">
              <div className="absolute left-20 top-20 h-60 w-60 rounded-full bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.6),transparent_70%)] blur-3xl" />
              <div className="absolute right-10 bottom-20 h-72 w-72 rounded-full bg-[radial-gradient(circle_at_center,rgba(99,102,241,0.6),transparent_70%)] blur-3xl" />
            </div>

            <div className="relative flex h-full flex-col">
              <Link
                href="/"
                className="inline-flex items-center gap-2 text-lg font-bold text-white"
              >
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 backdrop-blur-md">
                  <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
                  </svg>
                </span>
                QueryBay
              </Link>

              <div className="mt-auto">
                <h2 className="mb-4 text-3xl font-bold leading-tight text-white">
                  Your portal for growth,
                  <br />
                  outreach, and talent.
                </h2>
                <p className="mb-8 text-sm leading-relaxed text-white/70">
                  Manage campaigns, track metrics, approve hires, and control
                  payments — all from one place.
                </p>

                <div className="space-y-4">
                  {[
                    "Real-time pipeline dashboard",
                    "LATAM + Ghana team roster",
                    "Centralized billing and payments",
                  ].map((item) => (
                    <div key={item} className="flex items-center gap-3 text-sm text-white/90">
                      <span className="flex h-5 w-5 items-center justify-center rounded-full bg-white/15 backdrop-blur-md">
                        <svg className="h-3 w-3" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round">
                          <path d="M20 6L9 17l-5-5" />
                        </svg>
                      </span>
                      {item}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Right panel - form */}
          <div className="p-8 sm:p-10 lg:p-12">
            <div className="mb-8">
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-white">
                Welcome back
              </h1>
              <p className="text-sm text-black/60 dark:text-white/60">
                Access your customer portal.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-black/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30">
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none">
                  <path d="M20.0001 10.2216C20.0122 9.53416 19.9397 8.84776 19.7844 8.17725H10.2042V11.8883H15.8277C15.7211 12.539 15.4814 13.1618 15.1229 13.7194C14.7644 14.2769 14.2946 14.7577 13.7416 15.1327L13.722 15.257L16.7512 17.5567L16.961 17.5772C18.8883 15.8328 19.9997 13.266 19.9997 10.2216" fill="#4285F4" />
                  <path d="M10.2042 20.0001C12.9592 20.0001 15.2721 19.1111 16.9616 17.5778L13.7416 15.1332C12.88 15.7223 11.7235 16.1334 10.2042 16.1334C8.91385 16.126 7.65863 15.7206 6.61663 14.9747C5.57464 14.2287 4.79879 13.1802 4.39915 11.9778L4.27957 11.9878L1.12973 14.3766L1.08856 14.4888C1.93689 16.1457 3.23879 17.5387 4.84869 18.512C6.45859 19.4852 8.31301 20.0005 10.2046 20.0001" fill="#34A853" />
                  <path d="M4.39911 11.9777C4.17592 11.3411 4.06075 10.673 4.05819 9.99996C4.0623 9.32799 4.17322 8.66075 4.38696 8.02225L4.38127 7.88968L1.19282 5.4624L1.08852 5.51101C0.372885 6.90343 0.00012207 8.4408 0.00012207 9.99987C0.00012207 11.5589 0.372885 13.0963 1.08852 14.4887L4.39911 11.9777Z" fill="#FBBC05" />
                  <path d="M10.2042 3.86663C11.6663 3.84438 13.0804 4.37803 14.1498 5.35558L17.0296 2.59996C15.1826 0.901848 12.7366 -0.0298855 10.2042 -3.6784e-05C8.3126 -0.000477834 6.45819 0.514732 4.8483 1.48798C3.2384 2.46124 1.93649 3.85416 1.08813 5.51101L4.38775 8.02225C4.79132 6.82005 5.56974 5.77231 6.61327 5.02675C7.6568 4.28118 8.91279 3.87541 10.2042 3.86663Z" fill="#EB4335" />
                </svg>
                Google
              </button>
              <button className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-black/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30">
                <svg width="16" height="16" viewBox="0 0 64 64" fill="currentColor">
                  <path d="M32 1.7998C15 1.7998 1 15.5998 1 32.7998C1 46.3998 9.9 57.9998 22.3 62.1998C23.9 62.4998 24.4 61.4998 24.4 60.7998V55.3998C15.7 57.3998 13.9 51.1998 13.9 51.1998C12.5 47.6998 10.4 46.6998 10.4 46.6998C7.6 44.6998 10.5 44.6998 10.5 44.6998C13.6 44.7998 15.3 47.8998 15.3 47.8998C18 52.6998 22.6 51.2998 24.3 50.3998C24.6 48.3998 25.4 46.9998 26.3 46.1998C19.5 45.4998 12.2 42.7998 12.2 30.9998C12.2 27.5998 13.5 24.8998 15.4 22.7998C15.1 22.0998 14 18.8998 15.7 14.5998C15.7 14.5998 18.4 13.7998 24.3 17.7998C26.8 17.0998 29.4 16.6998 32.1 16.6998C34.8 16.6998 37.5 16.9998 39.9 17.7998C45.8 13.8998 48.4 14.5998 48.4 14.5998C50.1 18.7998 49.1 22.0998 48.7 22.7998C50.7 24.8998 51.9 27.6998 51.9 30.9998C51.9 42.7998 44.6 45.4998 37.8 46.1998C38.9 47.1998 39.9 49.1998 39.9 51.9998V60.4998C39.9 61.2998 40.4 62.1998 41.9 61.8998C54.1 57.7998 63 46.2998 63 32.5998C62.9 15.5998 49 1.7998 32 1.7998Z" />
                </svg>
                GitHub
              </button>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-black/40 dark:text-white/40">
                or with email
              </span>
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <form className="space-y-5">
              <div>
                <label htmlFor="email" className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                  Email
                </label>
                <input
                  id="email"
                  type="email"
                  placeholder="you@company.com"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>
              <div>
                <div className="mb-2 flex items-center justify-between">
                  <label htmlFor="password" className="text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                    Password
                  </label>
                  <a href="#" className="text-xs font-medium text-[#a855f7] hover:underline">
                    Forgot your password?
                  </a>
                </div>
                <input
                  id="password"
                  type="password"
                  placeholder="••••••••"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <label className="flex cursor-pointer items-center gap-2 text-sm text-black/70 dark:text-white/70">
                <input type="checkbox" className="h-4 w-4 rounded border-black/20 text-[#a855f7] focus:ring-[#a855f7]" />
                Keep me signed in
              </label>

              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)]"
              >
                Sign in
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-black/60 dark:text-white/60">
              Don&apos;t have an account?{" "}
              <Link href="/signup" className="font-semibold text-[#a855f7] hover:underline">
                Create account
              </Link>
            </p>
          </div>
        </div>
      </div>
    </section>
  );
};

export default SigninPage;
