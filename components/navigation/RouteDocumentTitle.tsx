"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { documentTitleForPathname } from "@/core/navigation/document-title";

/** Keep the browser title and Next's route announcement aligned after client navigation. */
export function RouteDocumentTitle() {
  const pathname = usePathname();

  useEffect(() => {
    document.title = documentTitleForPathname(pathname);
  }, [pathname]);

  return null;
}
