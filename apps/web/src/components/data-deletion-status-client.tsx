"use client";

import { useEffect, useState } from "react";
import { apiRequest } from "@/lib/api";

type StatusResult = { status: string };

export function DataDeletionStatusClient() {
  const [message, setMessage] = useState("Checking the deletion request status…");

  useEffect(() => {
    const confirmationCode = new URLSearchParams(window.location.search).get("confirmation_code");
    if (!confirmationCode) {
      setMessage("A valid confirmation code is required to view a deletion request status.");
      return;
    }

    let active = true;
    void apiRequest<StatusResult>(`/api/meta/data-deletion/status/${encodeURIComponent(confirmationCode)}`)
      .then(({ status }) => {
        if (active) setMessage(status === "completed" ? "The data deletion request has been completed." : "The data deletion request is being processed.");
      })
      .catch(() => {
        if (active) setMessage("The confirmation code is invalid or expired. Contact the privacy address on the Data Deletion page for help.");
      });

    return () => { active = false; };
  }, []);

  return <p role="status" aria-live="polite">{message}</p>;
}
