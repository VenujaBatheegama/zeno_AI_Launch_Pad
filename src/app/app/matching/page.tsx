import { redirect } from "next/navigation";

/** Matching workspace now lives at /app/jobs. */
export default function MatchingPage() {
  redirect("/app/jobs");
}
