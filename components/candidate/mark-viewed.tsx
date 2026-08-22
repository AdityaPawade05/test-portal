"use client";

import { useEffect, useRef } from "react";

// Marking invitations as viewed is a write, so it must not happen inside the
// dashboard's server-rendered GET (a refresh/prefetch would silently consume
// the "new" state before the candidate ever sees the notification). Firing it
// from a client effect after mount means it only runs once real content has
// painted.
export function MarkInvitationsViewed({ ids }: { ids: string[] }) {
  const sent = useRef(false);

  useEffect(() => {
    if (sent.current || ids.length === 0) return;
    sent.current = true;
    fetch("/api/candidate/invitations/mark-viewed", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ids }),
    }).catch(() => {});
  }, [ids]);

  return null;
}
