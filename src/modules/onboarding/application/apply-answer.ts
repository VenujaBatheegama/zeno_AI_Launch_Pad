import { randomUUID } from "node:crypto";

import type { CareerEvidence } from "@/modules/career-evidence/domain/evidence";
import {
  advanceStage,
  nextQuestion,
  type OnboardingStage,
} from "../domain/conversation-machine";
import {
  distillBullets,
  distillTechnologies,
  extractTechnologies,
} from "../domain/distill-cv-content";

export function applyConversationAnswer(input: {
  stage: OnboardingStage;
  questionKey: string;
  answer: string;
  evidence: CareerEvidence;
}): {
  evidence: CareerEvidence;
  stage: OnboardingStage;
  zenoReply: string;
} {
  const answer = input.answer.trim();
  const evidence = structuredClone(input.evidence);
  let stage = input.stage;
  let zenoReply = "Got it — I've updated your profile.";

  const lower = answer.toLocaleLowerCase();
  const wantsContinue =
    lower.includes("continue") ||
    lower.includes("looks good") ||
    lower.startsWith("no") ||
    lower.includes("skip");

  switch (input.questionKey) {
    case "full_name":
    case "preferred_name":
      evidence.profile.full_name = answer;
      zenoReply = `Thanks, ${answer}.`;
      break;
    case "email":
      evidence.profile.email = answer;
      break;
    case "location":
      evidence.profile.location =
        lower.includes("prefer not") ? null : answer;
      break;
    case "education_entry": {
      const parts = answer.split(/,| at | from /i).map((part) => part.trim());
      evidence.education.push({
        id: randomUUID(),
        origin: "user_edited",
        source_quote: answer,
        institution: parts[2] || parts[1] || answer,
        qualification: parts[0] || answer,
        field_of_study: parts[1] && parts[2] ? parts[1] : null,
        start_date: null,
        end_date: null,
        details: [],
      });
      zenoReply = "I've added that education record.";
      break;
    }
    case "education_more":
      if (wantsContinue) {
        stage = advanceStage(stage);
        zenoReply = "Moving on to skills.";
      } else {
        zenoReply = "Okay — tell me the next qualification.";
      }
      break;
    case "experience_entry": {
      const match = answer.match(/(.+?)\s+at\s+(.+)/i);
      evidence.work_experience.push({
        id: randomUUID(),
        origin: "user_edited",
        source_quote: answer,
        role: match?.[1]?.trim() || answer,
        employer: match?.[2]?.trim() || "Unknown employer",
        location: null,
        start_date: null,
        end_date: null,
        is_current: true,
        bullets: [],
      });
      zenoReply =
        "I've added that role. What did you personally build, improve or maintain there?";
      break;
    }
    case "experience_bullets":
    case "experience_details": {
      const latest = evidence.work_experience.at(-1);
      if (latest) {
        latest.bullets = distillBullets(answer);
        if (latest.bullets.length === 0) {
          latest.bullets = distillBullets(
            answer.replace(
              /[.;,]?\s*(and\s+)?(we|i)\s+(didn'?t|did\s+not)[^.!?]*/gi,
              "",
            ),
          );
        }
        for (const tech of extractTechnologies(answer)) {
          if (
            evidence.skills.some(
              (skill) =>
                skill.name.toLocaleLowerCase() === tech.toLocaleLowerCase(),
            )
          ) {
            continue;
          }
          evidence.skills.push({
            id: randomUUID(),
            origin: "user_edited",
            source_quote: tech,
            name: tech,
          });
        }
      }
      zenoReply = "I've added that to your experience.";
      break;
    }
    case "experience_dates": {
      const latest = evidence.work_experience.at(-1);
      if (latest) {
        const years = answer.match(/\d{4}(?:-\d{2})?/g) ?? [];
        latest.start_date = years[0] ?? null;
        if (years[1]) {
          latest.end_date = years[1];
          latest.is_current = false;
        } else if (/present|current|now/i.test(answer)) {
          latest.is_current = true;
          latest.end_date = null;
        }
      }
      zenoReply = "Thanks — I’ve noted those dates.";
      break;
    }
    case "experience_more":
      if (wantsContinue) {
        stage = advanceStage(stage);
        zenoReply = "Next, let's capture a project.";
      } else {
        zenoReply = "Sure — what's the next role title and company?";
      }
      break;
    case "project_entry": {
      const firstSentence = answer.split(/[.!\n]/u)[0]?.trim() || answer;
      const technologies = distillTechnologies(answer);
      evidence.projects.push({
        id: randomUUID(),
        origin: "user_edited",
        source_quote: answer.slice(0, 160),
        name: firstSentence.slice(0, 80),
        role: "Developer",
        start_date: null,
        end_date: null,
        bullets: distillBullets(answer),
        technologies,
      });
      zenoReply = "Project added to your profile.";
      break;
    }
    case "project_more":
      if (wantsContinue) {
        stage = advanceStage(stage);
        zenoReply = "Next, let's capture your education.";
      } else {
        zenoReply = "Tell me about the next project.";
      }
      break;
    case "skills_entry":
    case "skills_more": {
      if (input.questionKey === "skills_more" && wantsContinue) {
        stage = advanceStage(stage);
        zenoReply = "Optional certifications next — skip if you don't have any.";
        break;
      }
      const names = answer
        .split(/,| and |\n/u)
        .map((part) => part.trim())
        .filter((part) => part.length > 1);
      for (const name of names) {
        if (
          evidence.skills.some(
            (skill) => skill.name.toLocaleLowerCase() === name.toLocaleLowerCase(),
          )
        ) {
          continue;
        }
        evidence.skills.push({
          id: randomUUID(),
          origin: "user_edited",
          source_quote: answer,
          name,
        });
      }
      zenoReply = `Added ${names.length} skill${names.length === 1 ? "" : "s"}.`;
      break;
    }
    case "certifications_entry":
      if (!wantsContinue && answer.length > 2) {
        evidence.certifications.push({
          id: randomUUID(),
          origin: "user_edited",
          source_quote: answer,
          name: answer,
          issuer: null,
          issued_date: null,
        });
        zenoReply = "Certification noted.";
      }
      stage = advanceStage(stage);
      break;
    case "achievements_entry":
      if (!wantsContinue && answer.length > 2) {
        evidence.achievements.push({
          id: randomUUID(),
          origin: "user_edited",
          source_quote: answer,
          name: answer,
          result: null,
          issuer: null,
          date: null,
        });
        zenoReply = "Achievement noted.";
      }
      stage = advanceStage(stage);
      break;
    case "links_entry": {
      if (!wantsContinue) {
        const linkedin = answer.match(/linkedin\.com\/[^\s]+/i)?.[0];
        const github = answer.match(/github\.com\/[^\s]+/i)?.[0];
        if (linkedin) evidence.profile.linkedin_url = `https://${linkedin}`;
        if (github) evidence.profile.github_url = `https://${github}`;
        if (!linkedin && !github && answer.startsWith("http")) {
          evidence.profile.portfolio_url = answer;
        }
      }
      stage = "review";
      zenoReply =
        "Your draft is ready on the right. Edit anything that looks off, then verify when you're happy.";
      break;
    }
    case "advance":
      stage = advanceStage(stage);
      zenoReply = nextQuestion({ stage, evidence }).prompt;
      break;
    default:
      break;
  }

  // If experience was just created and next user message looks like bullets.
  if (
    input.stage === "experience" &&
    input.questionKey === "experience_entry" &&
    evidence.work_experience.length > 0
  ) {
    // Leave stage; follow-up bullet capture happens via experience_bullets key from client.
  }

  if (
    input.questionKey !== "advance" &&
    input.questionKey.endsWith("_entry") === false &&
    input.questionKey !== "experience_entry" &&
    stage === input.stage &&
    !input.questionKey.endsWith("_more")
  ) {
    // Stay for follow-up questions determined by nextQuestion.
  }

  // Auto-advance about_you when basics filled.
  if (stage === "about_you") {
    const next = nextQuestion({ stage, evidence });
    if (next.questionKey === "advance") {
      stage = advanceStage(stage);
      zenoReply = `${zenoReply} ${nextQuestion({ stage, evidence }).prompt}`;
    }
  }

  return { evidence, stage, zenoReply };
}
