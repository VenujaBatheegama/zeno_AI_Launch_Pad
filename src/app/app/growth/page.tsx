import { CareerGrowthError } from "@/modules/career-growth/domain/errors";
import { GrowthDashboard } from "@/modules/career-growth/presentation/growth-dashboard";
import { requireUserId } from "@/server/auth";
import { getCareerGrowthApplication } from "@/server/composition-root";

export const dynamic = "force-dynamic";

export default async function GrowthPage(props: { searchParams?: Promise<{ role?: string }> }) {
  const userId = await requireUserId();
  const searchParams = await props.searchParams;
  let dashboard: Awaited<
    ReturnType<ReturnType<typeof getCareerGrowthApplication>["getDashboard"]>
  >;
  try {
    dashboard = await getCareerGrowthApplication(userId).getDashboard();
  } catch (error) {
    if (isMissingSchema(error)) {
      return (
        <section className="rounded-[14px] border border-[var(--zeno-warning)] bg-[var(--zeno-warning-soft)] p-5 text-[14px] text-[var(--zeno-warning)]">
          Apply <code>supabase/migrations/0015_career_growth.sql</code> to enable Growth
          assessments and tracked projects.
        </section>
      );
    }
    throw error;
  }
  return <GrowthDashboard {...dashboard} initialTargetRole={searchParams?.role} />;
}

function isMissingSchema(error: unknown) {
  if (!(error instanceof CareerGrowthError) || error.code !== "PERSISTENCE_FAILED") {
    return false;
  }
  const cause = error.cause as { code?: string; message?: string } | undefined;
  const text = `${cause?.message ?? ""} ${error.message}`.toLocaleLowerCase();
  return (
    cause?.code === "PGRST205" ||
    text.includes("could not find the table") ||
    text.includes("schema cache")
  );
}
