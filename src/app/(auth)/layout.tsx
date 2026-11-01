export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-screen lg:grid-cols-[1fr_minmax(0,560px)]">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-sidebar p-10 text-white lg:flex">
        <div className="flex items-center gap-2">
          <div className="flex size-8 items-center justify-center rounded-md bg-accent text-sm font-bold">F</div>
          <span className="text-[15px] font-semibold">ForgeOS</span>
        </div>
        <div className="max-w-md">
          <p className="text-3xl font-semibold leading-tight tracking-tight">Know your factory. Control your production. Grow your business.</p>
          <ul className="mt-8 space-y-3 text-[14px] text-sidebar-text">
            <li>Every metre of fabric and every unit produced, traced from receipt to finished goods.</li>
            <li>Production orders, job cards and live progress from the factory floor.</li>
            <li>Built for manufacturers in Nigeria and beyond: naira by default, works on a phone.</li>
          </ul>
        </div>
        <p className="text-xs text-sidebar-muted">© ForgeOS</p>
        <div className="pointer-events-none absolute -right-24 -top-24 size-96 rounded-full bg-accent/10 blur-3xl" aria-hidden />
      </div>
      <main className="flex items-center justify-center bg-surface px-6 py-12">
        <div className="w-full max-w-sm">{children}</div>
      </main>
    </div>
  );
}
