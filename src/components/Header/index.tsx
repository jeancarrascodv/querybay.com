"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Menu, X } from "lucide-react";
import Brand from "@/components/Common/Brand";
import ThemeToggler from "./ThemeToggler";
import menuData from "./menuData";

const Header = () => {
  const [navbarOpen, setNavbarOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const headerRef = useRef<HTMLElement>(null);
  const pathname = usePathname();

  useEffect(() => {
    setNavbarOpen(false);
  }, [pathname]);
  useEffect(() => {
    if (!navbarOpen) return;
    const close = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setNavbarOpen(false);
        toggleRef.current?.focus();
      }
    };
    const outside = (event: PointerEvent) => {
      if (!headerRef.current?.contains(event.target as Node))
        setNavbarOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("pointerdown", outside);
    return () => {
      document.removeEventListener("keydown", close);
      document.removeEventListener("pointerdown", outside);
    };
  }, [navbarOpen]);

  return (
    <header className="qb-header" ref={headerRef}>
      <div className="qb-header-inner container">
        <Brand />
        <nav className="qb-desktop-nav" aria-label="Main navigation">
          {menuData.map((item) => (
            <Link
              key={item.id}
              href={item.path || "/"}
              aria-current={pathname === item.path ? "page" : undefined}
            >
              {item.title}
            </Link>
          ))}
        </nav>
        <div className="qb-header-actions">
          <ThemeToggler />
          <a className="qb-signin" href="https://app.querybay.com/signin">
            Sign in
          </a>
          <Link
            href="/#contact"
            className="qb-button qb-button-dark qb-header-cta"
          >
            Let&apos;s talk <ArrowUpRight size={16} />
          </Link>
          <button
            ref={toggleRef}
            className="qb-icon-button qb-menu-toggle"
            type="button"
            onClick={() => setNavbarOpen(!navbarOpen)}
            aria-label={navbarOpen ? "Close menu" : "Open menu"}
            aria-expanded={navbarOpen}
            aria-controls="mobile-navigation"
            title={navbarOpen ? "Close menu" : "Open menu"}
          >
            {navbarOpen ? <X size={21} /> : <Menu size={21} />}
          </button>
        </div>
      </div>
      <nav
        id="mobile-navigation"
        className="qb-mobile-nav"
        aria-label="Mobile navigation"
        hidden={!navbarOpen}
      >
        <div className="container">
          {menuData.map((item) => (
            <Link
              key={item.id}
              href={item.path || "/"}
              onClick={() => setNavbarOpen(false)}
            >
              {item.title}
              <ArrowUpRight size={16} />
            </Link>
          ))}
          <a href="https://app.querybay.com/signin">
            Sign in <ArrowUpRight size={16} />
          </a>
          <Link
            href="/#contact"
            onClick={() => setNavbarOpen(false)}
            className="qb-mobile-contact"
          >
            Let&apos;s talk <ArrowUpRight size={16} />
          </Link>
        </div>
      </nav>
    </header>
  );
};

export default Header;
