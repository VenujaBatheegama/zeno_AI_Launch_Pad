import { redirect } from "next/navigation";

/** Jobs discovery lives on the matching workspace for now. */
export default function JobsPage() {
  redirect("/app/matching");
}
