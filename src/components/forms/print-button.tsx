"use client";

import { Printer } from "lucide-react";

import { Button } from "@/components/ui/button";

/** Print to paper or "Save as PDF" — the line sheet is generated from the live catalog. */
export function PrintButton() {
  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => window.print()}
    >
      <Printer className="h-4 w-4" aria-hidden="true" />
      Print / save as PDF
    </Button>
  );
}
