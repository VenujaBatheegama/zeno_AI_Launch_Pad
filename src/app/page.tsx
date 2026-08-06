import { CareerEvidenceWorkspace } from "@/modules/career-evidence/presentation/career-evidence-workspace";
import { getCareerEvidenceApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function Home() {
  const evidenceSet = await getCareerEvidenceApplication().getCurrent();

  return (
    <main className="min-h-screen bg-slate-50 px-4 py-6 sm:px-6">
      <div className="mx-auto max-w-5xl">
        <header className="mb-5">
          <p className="text-sm font-semibold uppercase tracking-[0.2em] text-emerald-700">
            Zeno
          </p>
          <h1 className="mt-1 max-w-3xl text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
            Build your verified career evidence.
          </h1>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-600">
            Zeno extracts facts from your CV, then asks you to review every
            detail before it can become trusted evidence.
          </p>
        </header>
        <CareerEvidenceWorkspace initialEvidenceSet={evidenceSet} />
      </div>
    </main>
  );
}
