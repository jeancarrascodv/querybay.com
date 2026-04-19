"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import ThemeToggler from "./ThemeToggler";
import menuData from "./menuData";

const Header = () => {
  const [navbarOpen, setNavbarOpen] = useState(false);
  const navbarToggleHandler = () => setNavbarOpen(!navbarOpen);

  const [sticky, setSticky] = useState(false);
  useEffect(() => {
    const handleStickyNavbar = () => setSticky(window.scrollY >= 40);
    window.addEventListener("scroll", handleStickyNavbar);
    return () => window.removeEventListener("scroll", handleStickyNavbar);
  }, []);

  const pathname = usePathname();

  return (
    <header
      className={`fixed top-0 left-0 z-40 w-full transition-all duration-300 ${
        sticky
          ? "border-b border-black/5 bg-white/70 backdrop-blur-xl dark:border-white/10 dark:bg-[#0b0d1a]/70"
          : "bg-transparent"
      }`}
    >
      <div className="container">
        <div className="flex items-center justify-between py-4">
          {/* Logo */}
          <Link
            href="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-black dark:text-white"
          >
            <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-[linear-gradient(135deg,#6366f1,#a855f7,#ec4899)] text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.6)]">
              <svg className="h-4 w-4" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z" />
              </svg>
            </span>
            QueryBay
          </Link>

          {/* Desktop nav */}
          <nav className="hidden lg:block">
            <ul className="flex items-center gap-8">
              {menuData.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.path || "/"}
                    className={`text-sm font-medium transition ${
                      pathname === item.path
                        ? "text-black dark:text-white"
                        : "text-black/60 hover:text-black dark:text-white/60 dark:hover:text-white"
                    }`}
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {/* Right side */}
          <div className="flex items-center gap-3">
            <Link
              href="/signin"
              className="hidden text-sm font-medium text-black/70 transition hover:text-black md:block dark:text-white/70 dark:hover:text-white"
            >
              Sign in
            </Link>
            <Link
              href="/checkout"
              className="hidden rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-5 py-2.5 text-sm font-semibold text-white shadow-[0_8px_24px_-8px_rgba(168,85,247,0.6)] transition hover:shadow-[0_12px_32px_-8px_rgba(168,85,247,0.8)] md:block"
            >
              Get started
            </Link>
            <ThemeToggler />

            {/* Mobile toggle */}
            <button
              onClick={navbarToggleHandler}
              aria-label="Menu"
              className="ml-2 flex h-10 w-10 flex-col items-center justify-center rounded-lg border border-black/10 lg:hidden dark:border-white/10"
            >
              <span
                className={`block h-0.5 w-5 bg-black transition dark:bg-white ${
                  navbarOpen ? "translate-y-1 rotate-45" : ""
                }`}
              />
              <span
                className={`my-1 block h-0.5 w-5 bg-black transition dark:bg-white ${
                  navbarOpen ? "opacity-0" : ""
                }`}
              />
              <span
                className={`block h-0.5 w-5 bg-black transition dark:bg-white ${
                  navbarOpen ? "-translate-y-1.5 -rotate-45" : ""
                }`}
              />
            </button>
          </div>
        </div>

        {/* Mobile nav */}
        {navbarOpen && (
          <div className="rounded-2xl border border-black/10 bg-white/90 p-4 backdrop-blur-xl lg:hidden dark:border-white/10 dark:bg-[#0f1220]/90">
            <ul className="space-y-2">
              {menuData.map((item) => (
                <li key={item.id}>
                  <Link
                    href={item.path || "/"}
                    onClick={() => setNavbarOpen(false)}
                    className="block rounded-lg px-3 py-2 text-sm font-medium text-black/70 hover:bg-black/5 dark:text-white/70 dark:hover:bg-white/5"
                  >
                    {item.title}
                  </Link>
                </li>
              ))}
              <li className="border-t border-black/5 pt-2 dark:border-white/10">
                <Link
                  href="/signin"
                  onClick={() => setNavbarOpen(false)}
                  className="block rounded-lg px-3 py-2 text-sm font-medium text-black/70 dark:text-white/70"
                >
                  Sign in
                </Link>
              </li>
              <li>
                <Link
                  href="/checkout"
                  onClick={() => setNavbarOpen(false)}
                  className="block rounded-full bg-[linear-gradient(110deg,#6366f1,#a855f7,#ec4899)] px-5 py-2.5 text-center text-sm font-semibold text-white"
                >
                  Get started
                </Link>
              </li>
            </ul>
          </div>
        )}
      </div>
    </header>
  );
};

export default Header;
