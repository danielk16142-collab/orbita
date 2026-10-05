"use client";
import { useEffect, useId, useState } from "react";
import { usePathname } from "next/navigation";

/**
 * The app sidebar. On desktop it is the usual left column. On phones it becomes a top bar with the logo and a
 * hamburger button that opens the menu; it closes when you pick a page, press Escape or tap the button again.
 */
export function Sidebar({ logo, foot, menuLabel, children }: { logo: React.ReactNode; foot?: React.ReactNode; menuLabel: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  const path = usePathname();
  const id = useId();
  useEffect(() => setOpen(false), [path]);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <aside className={`sidebar${open ? " open" : ""}`}>
      <div className="sidebar-top">
        {logo}
        <button type="button" className="menu-btn" aria-expanded={open} aria-controls={id} aria-label={menuLabel} onClick={() => setOpen((o) => !o)}>
          <span className="menu-icon" aria-hidden="true"><i /><i /><i /></span>
        </button>
      </div>
      <div id={id} className="sidebar-menu">
        {children}
        {foot}
      </div>
    </aside>
  );
}
