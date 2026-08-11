import { MatchedJobsPicker } from "@/modules/cv-tailoring/presentation/matched-jobs-picker";

export default async function CvsMatchedPage({
  searchParams,
}: {
  searchParams: Promise<{ job?: string }>;
}) {
  const params = await searchParams;
  return <MatchedJobsPicker initialListingId={params.job} />;
}
