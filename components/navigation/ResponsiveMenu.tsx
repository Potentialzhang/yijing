"use client";

import { useId, useRef, useState } from "react";
import Link from "next/link";

export type ResponsiveMenuItem = {
  href: string;
  label: string;
};

type ResponsiveMenuProps = {
  items: readonly ResponsiveMenuItem[];
  activeHref?: string;
  className: string;
  ariaLabel: string;
  showDots?: boolean;
};

/** Desktop keeps inline links; narrow screens get an accessible toggle. */
export function ResponsiveMenu({ items, activeHref, className, ariaLabel, showDots = false }: ResponsiveMenuProps) {
  const [open, setOpen] = useState(false);
  const toggleRef = useRef<HTMLButtonElement>(null);
  const menuId = useId();

  function closeMenuAndRestoreFocus() {
    setOpen(false);
    toggleRef.current?.focus();
  }

  return (
    <>
      <button
        type="button"
        ref={toggleRef}
        className="mobile-menu-toggle"
        aria-controls={menuId}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={open ? "关闭菜单" : "打开菜单"}
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape" && open) {
            event.preventDefault();
            closeMenuAndRestoreFocus();
          }
        }}
      >
        菜单
      </button>
      <nav
        id={menuId}
        className={`${className}${open ? " is-open" : ""}`}
        aria-label={ariaLabel}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            event.preventDefault();
            closeMenuAndRestoreFocus();
          }
        }}
      >
        {items.map((item) => (
          <Link
            href={item.href}
            key={item.href}
            className={item.href === activeHref ? "active" : undefined}
            aria-current={item.href === activeHref ? "page" : undefined}
            onClick={() => setOpen(false)}
          >
            {showDots && <span className="nav-dot" aria-hidden="true" />}
            {item.label}
          </Link>
        ))}
      </nav>
    </>
  );
}
