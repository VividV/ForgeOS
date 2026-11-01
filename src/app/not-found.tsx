import Link from "next/link";

export default function NotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center px-6">
      <div className="max-w-sm text-center">
        <p className="tabular text-sm font-semibold text-accent-ink">404</p>
        <h1 className="mt-1 text-lg font-semibold">We couldn&apos;t find that</h1>
        <p className="mt-2 text-[13px] text-muted">The record may have been removed, or it belongs to another organisation.</p>
        <Link href="/" className="mt-6 inline-block text-[13px] font-medium text-accent-ink hover:underline">
          Go home
        </Link>
      </div>
    </div>
  );
}
