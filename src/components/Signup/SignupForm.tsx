"use client";
import Link from "next/link";
import { useState } from "react";
import LegalModal from "@/components/Legal/LegalModal";
import {
  LegalContent,
  termsContent,
  privacyContent,
} from "@/data/legalContent";

const SignupForm = () => {
  const [modalContent, setModalContent] = useState<LegalContent | null>(null);

  const openModal = (content: LegalContent) => (e: React.MouseEvent) => {
    e.preventDefault();
    setModalContent(content);
  };

  return (
    <>
      <section className="relative min-h-screen overflow-hidden pt-28 pb-16 md:pt-32 lg:pt-36">
        <div className="pointer-events-none absolute inset-0 -z-10">
          <div className="absolute left-1/2 top-0 h-[640px] w-[640px] -translate-x-1/2 rounded-full bg-[radial-gradient(circle_at_center,rgba(168,85,247,0.25),transparent_70%)] blur-3xl" />
          <div className="absolute -left-40 bottom-0 h-[420px] w-[420px] rounded-full bg-[radial-gradient(circle_at_center,rgba(236,72,153,0.2),transparent_70%)] blur-3xl" />
        </div>

        <div className="container">
          <div className="mx-auto max-w-[500px] rounded-3xl border border-black/10 bg-white/80 p-8 backdrop-blur-xl sm:p-10 dark:border-white/10 dark:bg-[#0f1220]/80">
            <div className="mb-8 text-center">
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-black sm:text-3xl dark:text-white">
                Create account
              </h1>
              <p className="text-sm text-black/60 dark:text-white/60">
                Start for free. No credit card required.
              </p>
            </div>

            <div className="mb-6 grid grid-cols-2 gap-3">
              <button className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-black/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30">
                <svg width="16" height="16" viewBox="0 0 20 20">
                  <path d="M20.0001 10.2216C20.0122 9.53416 19.9397 8.84776 19.7844 8.17725H10.2042V11.8883H15.8277C15.7211 12.539 15.4814 13.1618 15.1229 13.7194C14.7644 14.2769 14.2946 14.7577 13.7416 15.1327L16.961 17.5772C18.8883 15.8328 19.9997 13.266 19.9997 10.2216" fill="#4285F4" />
                  <path d="M10.2042 20.0001C12.9592 20.0001 15.2721 19.1111 16.9616 17.5778L13.7416 15.1332C12.88 15.7223 11.7235 16.1334 10.2042 16.1334C7.65863 15.7206 4.79879 13.1802 4.39915 11.9778L1.08856 14.4888C2.93689 17.1457 6.45859 19.4852 10.2046 20.0001" fill="#34A853" />
                  <path d="M4.39911 11.9777C4.17592 11.3411 4.06075 10.673 4.05819 9.99996C4.0623 9.32799 4.17322 8.66075 4.38696 8.02225L1.08852 5.51101C0.372885 6.90343 0 8.4408 0 9.99987C0 11.5589 0.372885 13.0963 1.08852 14.4887L4.39911 11.9777Z" fill="#FBBC05" />
                  <path d="M10.2042 3.86663C11.6663 3.84438 13.0804 4.37803 14.1498 5.35558L17.0296 2.59996C15.1826 0.901848 12.7366 -0.029 10.2042 0C6.45819 0.514 3.2384 2.461 1.08813 5.511L4.38775 8.022C5.56974 5.772 7.6568 4.281 10.2042 3.866Z" fill="#EB4335" />
                </svg>
                Google
              </button>
              <button className="flex items-center justify-center gap-2 rounded-xl border border-black/10 bg-white px-4 py-3 text-sm font-medium text-black transition hover:border-black/30 dark:border-white/15 dark:bg-white/5 dark:text-white dark:hover:border-white/30">
                <svg width="16" height="16" viewBox="0 0 64 64" fill="currentColor">
                  <path d="M32 1.8C15 1.8 1 15.6 1 32.8C1 46.4 9.9 58 22.3 62.2C23.9 62.5 24.4 61.5 24.4 60.8V55.4C15.7 57.4 13.9 51.2 13.9 51.2C12.5 47.7 10.4 46.7 10.4 46.7C7.6 44.7 10.5 44.7 10.5 44.7C13.6 44.8 15.3 47.9 15.3 47.9C18 52.7 22.6 51.3 24.3 50.4C24.6 48.4 25.4 47 26.3 46.2C19.5 45.5 12.2 42.8 12.2 31C12.2 27.6 13.5 24.9 15.4 22.8C15.1 22.1 14 18.9 15.7 14.6C15.7 14.6 18.4 13.8 24.3 17.8C26.8 17.1 29.4 16.7 32.1 16.7C34.8 16.7 37.5 17 39.9 17.8C45.8 13.9 48.4 14.6 48.4 14.6C50.1 18.8 49.1 22.1 48.7 22.8C50.7 24.9 51.9 27.7 51.9 31C51.9 42.8 44.6 45.5 37.8 46.2C38.9 47.2 39.9 49.2 39.9 52V60.5C39.9 61.3 40.4 62.2 41.9 61.9C54.1 57.8 63 46.3 63 32.6C62.9 15.6 49 1.8 32 1.8Z" />
                </svg>
                GitHub
              </button>
            </div>

            <div className="mb-6 flex items-center gap-3">
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
              <span className="text-xs text-black/40 dark:text-white/40">or with email</span>
              <span className="h-px flex-1 bg-black/10 dark:bg-white/10" />
            </div>

            <form className="space-y-5">
              <div>
                <label htmlFor="name" className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                  Full name
                </label>
                <input
                  id="name"
                  type="text"
                  placeholder="Your name"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>
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
                <label htmlFor="password" className="mb-2 block text-xs font-medium uppercase tracking-wider text-black/60 dark:text-white/60">
                  Password
                </label>
                <input
                  id="password"
                  type="password"
                  placeholder="At least 8 characters"
                  className="w-full rounded-xl border border-black/10 bg-white px-4 py-3 text-sm text-black outline-none transition placeholder:text-black/30 focus:border-[#a855f7] focus:ring-2 focus:ring-[#a855f7]/20 dark:border-white/10 dark:bg-white/5 dark:text-white dark:placeholder:text-white/30"
                />
              </div>

              <label className="flex cursor-pointer items-start gap-2 text-xs text-black/60 dark:text-white/60">
                <input type="checkbox" className="mt-0.5 h-4 w-4 rounded border-black/20 text-[#a855f7] focus:ring-[#a855f7]" />
                <span>
                  I agree to the{" "}
                  <button
                    type="button"
                    onClick={openModal(termsContent)}
                    className="text-[#a855f7] hover:underline"
                  >
                    Terms
                  </button>{" "}
                  and{" "}
                  <button
                    type="button"
                    onClick={openModal(privacyContent)}
                    className="text-[#a855f7] hover:underline"
                  >
                    Privacy Policy
                  </button>
                  .
                </span>
              </label>

              <button
                type="submit"
                className="flex w-full items-center justify-center rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-6 py-3.5 text-sm font-semibold text-white shadow-[0_10px_30px_-10px_rgba(168,85,247,0.6)] transition hover:shadow-[0_15px_40px_-10px_rgba(168,85,247,0.8)]"
              >
                Create account
              </button>
            </form>

            <p className="mt-6 text-center text-sm text-black/60 dark:text-white/60">
              Already have an account?{" "}
              <Link href="/signin" className="font-semibold text-[#a855f7] hover:underline">
                Sign in
              </Link>
            </p>
          </div>
        </div>
      </section>

      <LegalModal content={modalContent} onClose={() => setModalContent(null)} />
    </>
  );
};

export default SignupForm;
