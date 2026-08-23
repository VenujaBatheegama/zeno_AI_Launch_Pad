export type JobListing = {
  id: string;
  title: string;
  company?: string;
  location?: string;
  mode?: string;
  url?: string;
};

export type RoleRecommendation = {
  title: string;
  rationale: string;
};

export type AgentUIPayload =
  | { type: "job_listings"; items: JobListing[] }
  | { type: "role_recommendations"; roles: RoleRecommendation[] }
  | { type: "growth_suggestion"; project: string; gapType: string; deepLink: string }
  | { type: "cv_ready"; cvId: string; deepLink: string }
  | { type: "cover_letter_ready"; letterId: string; deepLink: string };
