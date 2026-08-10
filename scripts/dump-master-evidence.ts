import { createClient } from "@supabase/supabase-js";
import { writeFileSync } from "node:fs";

async function main() {
  const supabase = createClient(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
  const { data, error } = await supabase
    .from("career_evidence_sets")
    .select("id, evidence, source_document_id, status")
    .eq("user_id", process.env.DEMO_USER_ID!)
    .eq("status", "verified")
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw error;
  writeFileSync(
    "tmp/evidence-retention/master-evidence.json",
    JSON.stringify(data, null, 2),
  );
  const e = data!.evidence as {
    profile: Record<string, unknown>;
    work_experience: Array<{ bullets: string[] }>;
    projects: Array<{ name: string; bullets: string[]; technologies: string[] }>;
    certifications: Array<{ name: string; issuer: string | null }>;
  };
  console.log(
    JSON.stringify(
      {
        profile: e.profile,
        workBullets: e.work_experience.flatMap((w) => w.bullets),
        projects: e.projects.map((p) => ({
          name: p.name,
          technologies: p.technologies,
          bullets: p.bullets,
        })),
        certs: e.certifications,
        source_document_id: data!.source_document_id,
      },
      null,
      2,
    ),
  );
}

main();
