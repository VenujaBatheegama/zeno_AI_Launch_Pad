import { redirect } from "next/navigation";

export default function LegacyJobsPage() {
  redirect("/app/jobs");
}
