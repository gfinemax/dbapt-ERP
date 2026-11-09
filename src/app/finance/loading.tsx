const blocks = Array.from({ length: 6 }, (_, index) => index);

export default function FinanceLoading() {
  return (
    <main aria-busy="true" aria-label="회계·자금 화면 불러오는 중" className="mx-auto max-w-[1480px] animate-pulse space-y-5">
      <section className="rounded-[28px] border border-[var(--color-soft-border)] bg-white p-6">
        <div className="h-4 w-36 rounded-full bg-[var(--color-cloud-veil)]" />
        <div className="mt-4 h-9 w-64 max-w-full rounded-xl bg-[var(--color-cloud-veil)]" />
        <div className="mt-4 h-4 w-[32rem] max-w-full rounded-full bg-[var(--color-cloud-veil)]" />
      </section>
      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {blocks.map((block) => (
          <div className="h-36 rounded-[24px] border border-[var(--color-soft-border)] bg-white p-5" key={block}>
            <div className="h-5 w-32 rounded-full bg-[var(--color-cloud-veil)]" />
            <div className="mt-5 h-8 w-24 rounded-lg bg-[var(--color-cloud-veil)]" />
            <div className="mt-4 h-3 w-full rounded-full bg-[var(--color-cloud-veil)]" />
          </div>
        ))}
      </section>
      <p className="sr-only">회계·자금 자료를 불러오고 있어.</p>
    </main>
  );
}
