"use client";

import { useState } from "react";
import { Target, Briefcase, Rocket, Sparkles } from "lucide-react";
import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";

const POPULAR_SKILLS = [
  "TypeScript",
  "JavaScript",
  "React",
  "Next.js",
  "Node.js",
  "Python",
  "Go",
  "Java",
  "SQL",
  "PostgreSQL",
  "Docker",
  "Kubernetes",
  "AWS",
  "Tailwind CSS",
  "GraphQL",
  "Git",
  "CI/CD",
];

const POPULAR_ROLES = [
  "Frontend Engineer",
  "Backend Engineer",
  "Full Stack Developer",
  "Software Engineer",
  "DevOps Engineer",
  "Data Engineer",
  "Mobile Developer (React Native / Flutter)",
  "Cloud Architect",
];

/**
 * 1. Basics & Contact Details Card
 */
export function BasicsContactCard(props: {
  initialEvidence: CareerEvidence;
  onSubmit: (formattedMessage: string) => void;
  disabled?: boolean;
}) {
  const [fullName, setFullName] = useState(
    props.initialEvidence.profile.full_name ?? "",
  );
  const [location, setLocation] = useState(
    props.initialEvidence.profile.location ?? "",
  );
  const [email, setEmail] = useState(props.initialEvidence.profile.email ?? "");
  const [phone, setPhone] = useState(props.initialEvidence.profile.phone ?? "");
  const [linkedin, setLinkedin] = useState(
    props.initialEvidence.profile.linkedin_url ?? "",
  );
  const [summary, setSummary] = useState(
    props.initialEvidence.profile.summary ?? "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!fullName.trim()) return;

    const parts: string[] = [`My full name is ${fullName.trim()}.`];
    if (location.trim()) parts.push(`I am based in ${location.trim()}.`);
    if (email.trim()) parts.push(`Email: ${email.trim()}.`);
    if (phone.trim()) parts.push(`Phone: ${phone.trim()}.`);
    if (linkedin.trim()) parts.push(`LinkedIn / Portfolio: ${linkedin.trim()}.`);
    if (summary.trim()) parts.push(`Professional summary: "${summary.trim()}".`);

    props.onSubmit(parts.join(" "));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3.5 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-4 shadow-[var(--zeno-shadow-md)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-2.5">
        <span className="text-[13px] font-semibold text-[var(--zeno-ink)]">
          👤 Your Basics & Contact Details
        </span>
        <span className="text-[11px] font-medium text-[var(--zeno-primary)]">
          Step 1 of 5
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Full Name <span className="text-[var(--zeno-danger)]">*</span>
          </span>
          <input
            type="text"
            required
            placeholder="e.g. Alex Silva"
            value={fullName}
            onChange={(e) => setFullName(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Location <span className="text-[var(--zeno-ink-faint)]">(City, Country)</span>
          </span>
          <input
            type="text"
            placeholder="e.g. Colombo, Sri Lanka or Remote"
            value={location}
            onChange={(e) => setLocation(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Email address
          </span>
          <input
            type="email"
            placeholder="e.g. alex@example.com"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Phone number <span className="text-[var(--zeno-ink-faint)]">(optional)</span>
          </span>
          <input
            type="tel"
            placeholder="e.g. +94 77 123 4567"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
          LinkedIn or Portfolio Link <span className="text-[var(--zeno-ink-faint)]">(optional)</span>
        </span>
        <input
          type="url"
          placeholder="e.g. https://linkedin.com/in/alex-silva"
          value={linkedin}
          onChange={(e) => setLinkedin(e.target.value)}
          disabled={props.disabled}
          className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
        />
      </label>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
          Brief Summary / Headline <span className="text-[var(--zeno-ink-faint)]">(optional)</span>
        </span>
        <input
          type="text"
          placeholder="e.g. Full-Stack Engineer passionate about scalable web apps and cloud architecture"
          value={summary}
          onChange={(e) => setSummary(e.target.value)}
          disabled={props.disabled}
          className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
        />
      </label>

      <button
        type="submit"
        disabled={props.disabled || !fullName.trim()}
        className="flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--zeno-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
      >
        Save & Continue to Roles & Skills →
      </button>
    </form>
  );
}

/**
 * 2. Target Roles & Core Skills Card
 */
export function RolesAndSkillsCard(props: {
  initialEvidence: CareerEvidence;
  onSubmit: (formattedMessage: string) => void;
  disabled?: boolean;
}) {
  const [roles, setRoles] = useState<string[]>([]);
  const [roleInput, setRoleInput] = useState("");

  const [skills, setSkills] = useState<string[]>(
    props.initialEvidence.skills.map((s) => s.name),
  );
  const [skillInput, setSkillInput] = useState("");

  const addRole = (role: string) => {
    const trimmed = role.trim();
    if (trimmed && !roles.includes(trimmed)) {
      setRoles([...roles, trimmed]);
      setRoleInput("");
    }
  };

  const removeRole = (index: number) => {
    setRoles(roles.filter((_, i) => i !== index));
  };

  const addSkill = (skill: string) => {
    const trimmed = skill.trim();
    if (trimmed && !skills.includes(trimmed)) {
      setSkills([...skills, trimmed]);
      setSkillInput("");
    }
  };

  const removeSkill = (index: number) => {
    setSkills(skills.filter((_, i) => i !== index));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (roles.length === 0 && skills.length === 0) return;

    const parts: string[] = [];
    if (roles.length > 0) {
      parts.push(`I am targeting these roles: ${roles.join(", ")}.`);
    }
    if (skills.length > 0) {
      parts.push(`My core technical skills and technologies are: ${skills.join(", ")}.`);
    }

    props.onSubmit(parts.join(" "));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-4 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-4 shadow-[var(--zeno-shadow-md)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-2.5">
        <h2 className="text-lg font-bold text-[var(--zeno-ink)] flex items-center">
          <Target className="h-5 w-5 mr-2" /> Target Roles & Core Skills
        </h2>
        <span className="text-[11px] font-medium text-[var(--zeno-primary)]">
          Step 2 of 5
        </span>
      </div>

      {/* Target Roles Section */}
      <div className="space-y-2">
        <label className="block text-xs font-medium text-[var(--zeno-ink-muted)]">
          Target Roles <span className="text-[var(--zeno-danger)]">*</span>
        </label>
        
        {/* Selected Roles Chips */}
        {roles.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {roles.map((r, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--zeno-border-hover)] bg-[var(--zeno-surface)] px-3 py-1 text-xs font-semibold text-[var(--zeno-primary)]"
              >
                {r}
                <button
                  type="button"
                  onClick={() => removeRole(index)}
                  className="hover:text-[var(--zeno-danger)]"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Backend Engineer, Full Stack Developer"
            value={roleInput}
            onChange={(e) => setRoleInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addRole(roleInput);
              }
            }}
            disabled={props.disabled}
            className="h-10 flex-1 rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => addRole(roleInput)}
            disabled={!roleInput.trim()}
            className="h-10 rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink)] transition hover:border-[var(--zeno-border-hover)] disabled:opacity-40"
          >
            + Add Role
          </button>
        </div>

        {/* Quick Role Suggestions */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-[var(--zeno-ink-faint)]">Popular:</span>
          {POPULAR_ROLES.slice(0, 4).map((r) => (
            <button
              key={r}
              type="button"
              onClick={() => addRole(r)}
              className="rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2.5 py-0.5 text-[11px] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
            >
              + {r}
            </button>
          ))}
        </div>
      </div>

      {/* Core Skills Section */}
      <div className="space-y-2 border-t border-[var(--zeno-border)] pt-3">
        <label className="block text-xs font-medium text-[var(--zeno-ink-muted)]">
          Core Skills & Tools <span className="text-[var(--zeno-danger)]">*</span>
        </label>

        {/* Selected Skills Chips */}
        {skills.length > 0 ? (
          <div className="flex flex-wrap gap-1.5">
            {skills.map((s, index) => (
              <span
                key={index}
                className="inline-flex items-center gap-1.5 rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-2.5 py-1 text-xs font-medium text-[var(--zeno-ink)]"
              >
                {s}
                <button
                  type="button"
                  onClick={() => removeSkill(index)}
                  className="hover:text-[var(--zeno-danger)] text-[var(--zeno-ink-muted)]"
                >
                  ✕
                </button>
              </span>
            ))}
          </div>
        ) : null}

        <div className="flex gap-2">
          <input
            type="text"
            placeholder="e.g. Python, Docker, AWS, React"
            value={skillInput}
            onChange={(e) => setSkillInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                addSkill(skillInput);
              }
            }}
            disabled={props.disabled}
            className="h-10 flex-1 rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
          <button
            type="button"
            onClick={() => addSkill(skillInput)}
            disabled={!skillInput.trim()}
            className="h-10 rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-3 text-xs font-semibold text-[var(--zeno-ink)] transition hover:border-[var(--zeno-border-hover)] disabled:opacity-40"
          >
            + Add Skill
          </button>
        </div>

        {/* Quick Skill Suggestion Chips */}
        <div className="flex flex-wrap items-center gap-1.5 pt-1">
          <span className="text-[11px] text-[var(--zeno-ink-faint)]">Quick add:</span>
          {POPULAR_SKILLS.filter((s) => !skills.includes(s))
            .slice(0, 8)
            .map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => addSkill(s)}
                className="rounded-full border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-2.5 py-0.5 text-[11px] text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
              >
                + {s}
              </button>
            ))}
        </div>
      </div>

      <button
        type="submit"
        disabled={props.disabled || (roles.length === 0 && skills.length === 0)}
        className="flex min-h-[44px] w-full items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--zeno-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
      >
        Save & Continue to Work Experience →
      </button>
    </form>
  );
}

/**
 * 3. Recent Work Experience Card
 */
export function ExperienceCard(props: {
  initialEvidence: CareerEvidence;
  onSubmit: (formattedMessage: string) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const latest = props.initialEvidence.work_experience[0];

  const [role, setRole] = useState(latest?.role ?? "");
  const [employer, setEmployer] = useState(latest?.employer ?? "");
  const [startDate, setStartDate] = useState(latest?.start_date ?? "");
  const [endDate, setEndDate] = useState(latest?.end_date ?? "");
  const [isCurrent, setIsCurrent] = useState(latest?.is_current ?? true);
  const [bulletsText, setBulletsText] = useState(
    latest?.bullets ? latest.bullets.join("\n") : "",
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!role.trim() || !employer.trim()) return;

    const parts: string[] = [
      `I worked as a ${role.trim()} at ${employer.trim()}.`,
    ];
    if (startDate.trim()) {
      parts.push(
        isCurrent
          ? `From ${startDate.trim()} to Present.`
          : `From ${startDate.trim()} to ${endDate.trim() || "Finished"}.`,
      );
    }
    if (bulletsText.trim()) {
      parts.push(`Key contributions and responsibilities:\n${bulletsText.trim()}`);
    }

    props.onSubmit(parts.join(" "));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-3.5 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-4 shadow-[var(--zeno-shadow-md)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-2.5">
        <h2 className="text-lg font-bold text-[var(--zeno-ink)] flex items-center">
          <Briefcase className="h-5 w-5 mr-2" /> Recent Work Experience
        </h2>
        <span className="text-[11px] font-medium text-[var(--zeno-primary)]">
          Step 3 of 5
        </span>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Job Title / Role <span className="text-[var(--zeno-danger)]">*</span>
          </span>
          <input
            type="text"
            required
            placeholder="e.g. Software Engineer"
            value={role}
            onChange={(e) => setRole(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Company / Employer <span className="text-[var(--zeno-danger)]">*</span>
          </span>
          <input
            type="text"
            required
            placeholder="e.g. Acme Corp / Tech Startups"
            value={employer}
            onChange={(e) => setEmployer(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            Start Date <span className="text-[var(--zeno-ink-faint)]">(Month & Year)</span>
          </span>
          <input
            type="text"
            placeholder="e.g. Jan 2022"
            value={startDate}
            onChange={(e) => setStartDate(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>

        <div className="space-y-1">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">End Date</span>
            <label className="inline-flex items-center gap-1.5 text-xs text-[var(--zeno-ink-muted)]">
              <input
                type="checkbox"
                checked={isCurrent}
                onChange={(e) => setIsCurrent(e.target.checked)}
                className="rounded border-[var(--zeno-border)]"
              />
              Currently working here
            </label>
          </div>
          <input
            type="text"
            placeholder={isCurrent ? "Present" : "e.g. Dec 2023"}
            value={isCurrent ? "Present" : endDate}
            disabled={isCurrent || props.disabled}
            onChange={(e) => setEndDate(e.target.value)}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </div>
      </div>

      <label className="block space-y-1">
        <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
          What did you build, improve, or maintain? <span className="text-[var(--zeno-ink-faint)]">(1–3 key points)</span>
        </span>
        <textarea
          rows={3}
          placeholder="• Built microservices using Go and PostgreSQL&#10;• Led CI/CD automation with GitHub Actions&#10;• Reduced latency by 35%"
          value={bulletsText}
          onChange={(e) => setBulletsText(e.target.value)}
          disabled={props.disabled}
          className="w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3 text-[16px] sm:text-[13px] leading-relaxed text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
        />
      </label>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={props.onSkip}
          className="h-11 rounded-[10px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 text-xs font-medium text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
        >
          Skip Experience
        </button>
        <button
          type="submit"
          disabled={props.disabled || !role.trim() || !employer.trim()}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--zeno-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
        >
          Save & Continue to Projects & Education →
        </button>
      </div>
    </form>
  );
}

/**
 * 4. Projects & Education Card
 */
export function ProjectsEducationCard(props: {
  initialEvidence: CareerEvidence;
  onSubmit: (formattedMessage: string) => void;
  onSkip: () => void;
  disabled?: boolean;
}) {
  const latestProject = props.initialEvidence.projects[0];
  const latestEdu = props.initialEvidence.education[0];

  const [projectName, setProjectName] = useState(latestProject?.name ?? "");
  const [projectTech, setProjectTech] = useState(
    latestProject?.technologies?.join(", ") ?? "",
  );
  const [projectDesc, setProjectDesc] = useState(
    latestProject?.bullets ? latestProject.bullets.join(" ") : "",
  );

  const [degree, setDegree] = useState(
    latestEdu?.qualification ?? latestEdu?.field_of_study ?? "",
  );
  const [institution, setInstitution] = useState(latestEdu?.institution ?? "");

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const parts: string[] = [];

    if (projectName.trim()) {
      parts.push(`Project: ${projectName.trim()}.`);
      if (projectTech.trim()) parts.push(`Technologies: ${projectTech.trim()}.`);
      if (projectDesc.trim()) parts.push(`Description: ${projectDesc.trim()}.`);
    }

    if (degree.trim() || institution.trim()) {
      parts.push(
        `Education: ${degree.trim() || "Qualification"} at ${institution.trim() || "University"}.`,
      );
    }

    if (parts.length === 0) {
      props.onSkip();
      return;
    }

    props.onSubmit(parts.join(" "));
  };

  return (
    <form
      onSubmit={handleSubmit}
      className="mt-3 space-y-4 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-4 shadow-[var(--zeno-shadow-md)]"
    >
      <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-2.5">
        <h2 className="text-lg font-bold text-[var(--zeno-ink)] flex items-center">
          <Rocket className="h-5 w-5 mr-2" /> Featured Project & Education
        </h2>
        <span className="text-[11px] font-medium text-[var(--zeno-primary)]">
          Step 4 of 5
        </span>
      </div>

      {/* Featured Project */}
      <div className="space-y-2.5">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
          Featured Project
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
              Project Name
            </span>
            <input
              type="text"
              placeholder="e.g. AI Cloud Platform"
              value={projectName}
              onChange={(e) => setProjectName(e.target.value)}
              disabled={props.disabled}
              className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
              Technologies Used
            </span>
            <input
              type="text"
              placeholder="e.g. React, Next.js, Go, AWS"
              value={projectTech}
              onChange={(e) => setProjectTech(e.target.value)}
              disabled={props.disabled}
              className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
            />
          </label>
        </div>

        <label className="block space-y-1">
          <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
            What did you build & what was the outcome?
          </span>
          <input
            type="text"
            placeholder="e.g. Full-stack dashboard for metrics with real-time alerts and WebSocket streaming"
            value={projectDesc}
            onChange={(e) => setProjectDesc(e.target.value)}
            disabled={props.disabled}
            className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
          />
        </label>
      </div>

      {/* Education */}
      <div className="space-y-2.5 border-t border-[var(--zeno-border)] pt-3">
        <p className="text-xs font-semibold uppercase tracking-wider text-[var(--zeno-ink-faint)]">
          Education
        </p>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
              Degree / Qualification
            </span>
            <input
              type="text"
              placeholder="e.g. BSc in Computer Science"
              value={degree}
              onChange={(e) => setDegree(e.target.value)}
              disabled={props.disabled}
              className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
            />
          </label>

          <label className="block space-y-1">
            <span className="text-xs font-medium text-[var(--zeno-ink-muted)]">
              Institution / University
            </span>
            <input
              type="text"
              placeholder="e.g. University of Colombo"
              value={institution}
              onChange={(e) => setInstitution(e.target.value)}
              disabled={props.disabled}
              className="h-10 w-full rounded-[8px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] px-3 text-[16px] sm:text-[13px] text-[var(--zeno-ink)] outline-none transition focus:border-[var(--zeno-primary)] disabled:opacity-50"
            />
          </label>
        </div>
      </div>

      <div className="flex items-center gap-2 pt-1">
        <button
          type="button"
          onClick={props.onSkip}
          className="h-11 rounded-[10px] border border-[var(--zeno-border)] bg-[var(--zeno-surface)] px-4 text-xs font-medium text-[var(--zeno-ink-muted)] hover:border-[var(--zeno-border-hover)] hover:text-[var(--zeno-ink)]"
        >
          Skip to Review
        </button>
        <button
          type="submit"
          disabled={props.disabled}
          className="flex min-h-[44px] flex-1 items-center justify-center rounded-[10px] bg-[var(--zeno-primary)] px-4 py-2.5 text-sm font-semibold text-white shadow-[var(--zeno-shadow-sm)] transition hover:opacity-90 disabled:opacity-50"
        >
          Save & Review Profile →
        </button>
      </div>
    </form>
  );
}

/**
 * 5. Final Verification Card
 */
export function ReviewVerificationCard(props: {
  evidence: CareerEvidence;
  progress: number;
  onVerify: () => void;
  disabled?: boolean;
}) {
  return (
    <div className="mt-3 space-y-4 rounded-[16px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-elevated)] p-4 shadow-[var(--zeno-shadow-md)]">
      <div className="flex items-center justify-between border-b border-[var(--zeno-border)] pb-2.5">
        <h2 className="text-lg font-bold text-[var(--zeno-ink)] flex items-center">
          <Sparkles className="h-5 w-5 mr-2 text-amber-500" /> Ready to Verify Your Profile
        </h2>
        <span className="text-[11px] font-medium text-[var(--zeno-success)]">
          {props.progress}% Complete
        </span>
      </div>

      <p className="text-xs leading-relaxed text-[var(--zeno-ink-muted)]">
        Zeno has captured your core career evidence. You can verify now to unlock
        instant job matching and AI CV tailoring!
      </p>

      {/* Quick Summary Preview */}
      <div className="space-y-2 rounded-[10px] border border-[var(--zeno-border)] bg-[var(--zeno-surface-sunken)] p-3 text-xs">
        <div className="flex justify-between">
          <span className="font-semibold text-[var(--zeno-ink)]">
            {props.evidence.profile.full_name || "Name provided"}
          </span>
          <span className="text-[var(--zeno-ink-muted)]">
            {props.evidence.profile.location || ""}
          </span>
        </div>
        <div className="flex flex-wrap gap-1">
          {props.evidence.skills.slice(0, 6).map((s) => (
            <span
              key={s.name}
              className="rounded bg-[var(--zeno-surface)] px-2 py-0.5 text-[11px] text-[var(--zeno-primary)]"
            >
              {s.name}
            </span>
          ))}
          {props.evidence.skills.length > 6 ? (
            <span className="text-[11px] text-[var(--zeno-ink-faint)]">
              +{props.evidence.skills.length - 6} more
            </span>
          ) : null}
        </div>
      </div>

      <button
        type="button"
        disabled={props.disabled}
        onClick={props.onVerify}
        className="flex min-h-[46px] w-full items-center justify-center gap-2 rounded-[10px] bg-[var(--zeno-primary)] px-4 py-3 text-sm font-semibold text-white shadow-[var(--zeno-shadow-md)] transition hover:opacity-90 disabled:opacity-50"
      >
        <span className="flex items-center gap-2">Verify Profile & Launch Zeno <Rocket className="h-4 w-4" /></span>
      </button>
    </div>
  );
}
