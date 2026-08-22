import { Suspense } from "react";

import { CvsHub } from "@/modules/cv-tailoring/presentation/cvs-hub";
import CvsLoading from "./loading";

export const dynamic = "force-dynamic";

export default function CvsPage() {
  return (
    <Suspense fallback={<CvsLoading />}>
      <CvsHub />
    </Suspense>
  );
}

