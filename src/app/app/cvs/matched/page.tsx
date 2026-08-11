import { MatchedJobsPicker } from "@/modules/cv-tailoring/presentation/matched-jobs-picker";

export default async function CvsMatchedPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const params = await searchParams;
  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6 sm:py-8">
      <MatchedJobsPicker initialListingId={params.job} />
    </div>
  );
}
