import { CvTailorWorkspace } from "@/modules/cv-tailoring/presentation/cv-tailor-workspace";

export default async function CvsTailorPage({
  params,
}: {
  params: Promise<{ listingId: string }>;
}) {
  const { listingId } = await params;
  return <CvTailorWorkspace listingId={listingId} />;
}
