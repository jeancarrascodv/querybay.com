"use client";

import { useEffect } from "react";

export default function ScrollUp() {
  useEffect(() => {
    if (!window.location.hash) window.document.scrollingElement?.scrollTo(0, 0);
  }, []);

  return null;
}
