"use client";
import { TriangleAlert } from "lucide-react";
import { Button } from "@/components/ui/button";

export default function AppError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <div className="flex min-h-[50vh] items-center justify-center">
      <div className="max-w-md text-center">
        <div className="mx-auto mb-3 flex size-10 items-center justify-center rounded-full bg-danger-soft text-danger-ink">
          <TriangleAlert className="size-5" />
        </div>
        <h1 className="text-base font-semibold">This page couldn&apos;t load</h1>
        <p className="mt-1 text-[13px] text-muted">
          Something went wrong on our side. Your data is safe. Try again, and if it keeps happening share this reference with support:{" "}
          <code className="text-ink">{error.digest ?? "n/a"}</code>
        </p>
        <Button className="mt-4" onClick={reset}>
          Try again
        </Button>
      </div>
    </div>
  );
}
