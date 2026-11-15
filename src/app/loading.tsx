const cards = Array.from({ length: 4 }, (_, index) => index);

export default function DashboardLoading() {
  return (
    <main aria-busy="true" aria-label="ERP 대시보드 불러오는 중" className="mx-auto max-w-[1480px] animate-pulse space-y-5 px-4 py-6 sm:px-6 lg:px-8">
      <section className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
        <div className="h-4 w-32 rounded-full bg-[var(--color-cloud-veil)]" />
        <div className="mt-4 h-9 w-72 max-w-full rounded-xl bg-[var(--color-cloud-veil)]" />
        <div className="mt-4 h-4 w-[30rem] max-w-full rounded-full bg-[var(--color-cloud-veil)]" />
      </section>
      <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {cards.map((card) => (
          <div className="h-32 rounded-[24px] border border-[var(--color-soft-border)] bg-white p-5" key={card}>
            <div className="h-4 w-24 rounded-full bg-[var(--color-cloud-veil)]" />
            <div className="mt-5 h-8 w-28 rounded-lg bg-[var(--color-cloud-veil)]" />
          </div>
        ))}
      </section>
      <section className="grid gap-4 lg:grid-cols-2">
        <div className="h-72 rounded-[24px] border border-[var(--color-soft-border)] bg-white" />
        <div className="h-72 rounded-[24px] border border-[var(--color-soft-border)] bg-white" />
      </section>
      <p className="sr-only">대시보드 자료를 불러오고 있어.</p>
    </main>
  );
}
