"use client";
import { Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

/** Uses the browser's print dialog ("Save as PDF") with the app's print stylesheet. */
export function PrintReport() {
  return (
    <Button onClick={() => window.print()}>
      <Printer /> Print / PDF
    </Button>
  );
}
