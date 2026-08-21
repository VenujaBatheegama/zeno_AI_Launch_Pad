export type GrowthProfileHandoffDraft = {
  projectId: string;
  title: string;
  objective: string;
  expectedEvidence: string[];
  startDate: string | null;
  endDate: string | null;
};

export function GrowthProfileHandoff(props: { draft: GrowthProfileHandoffDraft }) {
  return (
    <section className="rounded-[14px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--zeno-ink-faint)]">
        From Growth project
      </p>
      <h2 className="mt-1 text-[16px] font-semibold text-[var(--zeno-ink)]">
        {props.draft.title}
      </h2>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--zeno-ink-muted)]">
        {props.draft.objective} Review these claims and confirm them before they become
        verified career evidence. Zeno will not add them automatically.
      </p>
      {props.draft.expectedEvidence.length > 0 ? (
        <ul className="mt-3 list-disc pl-5 text-[13px] text-[var(--zeno-ink)]">
          {props.draft.expectedEvidence.map((item) => (
            <li key={item}>{item}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
