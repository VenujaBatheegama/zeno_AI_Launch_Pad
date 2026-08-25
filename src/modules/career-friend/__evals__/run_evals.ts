import { GroqCareerAdvisor } from "../infrastructure/groq-career-advisor";
import { GroqKeyPool } from "@/lib/ai/groq-key-pool";
import type { CareerSnapshot } from "../domain/schemas";

const MOCK_SNAPSHOT: CareerSnapshot = {
  profile: {
    name: "Alex",
    headline: "Frontend Engineer",
    skills: ["React", "TypeScript", "Tailwind"],
    projects: ["Built a generic UI component library"],
  },
  opportunities: { pendingRecommendations: 2, discoveredJobs: 5, applications: 1, interviews: 0 },
  growthSignals: [
    { id: "1", label: "Backend Skills Missing", frequency: 10, whyItMatters: "Most roles are full-stack" }
  ],
  activeSprints: [],
};

const EMPTY_SNAPSHOT: CareerSnapshot = {
  profile: { name: null, headline: null, skills: [], projects: [] },
  opportunities: { pendingRecommendations: 0, discoveredJobs: 0, applications: 0, interviews: 0 },
  growthSignals: [],
  activeSprints: [],
};

async function runEvals() {
  console.log("Running Career Advisor Evals...\n");

  const keyPool = new GroqKeyPool([process.env.GROQ_API_KEY!]);
  const advisor = new GroqCareerAdvisor(keyPool, "llama-3.3-70b-versatile");

  const cases = [
    {
      name: "Ambiguity Clarification",
      message: "Can you show me jobs?",
      snapshot: EMPTY_SNAPSHOT,
      expectedAction: "Should ask a clarifying question about what jobs to show, or fall back to general role recommendations based on empty snapshot."
    },
    {
      name: "Explicit Search",
      message: "Find me remote React developer jobs in London.",
      snapshot: MOCK_SNAPSHOT,
      expectedAction: "Should call executeSearchJobListings with roles=['React Developer'] and workModes=['remote']."
    },
    {
      name: "Empty Snapshot Handling",
      message: "What job should I do?",
      snapshot: EMPTY_SNAPSHOT,
      expectedAction: "Should call executeRecommendRoleCategories or ask clarifying questions since skills are empty."
    },
    {
      name: "Explicit Project Suggestion",
      message: "Suggest a project for me to work on.",
      snapshot: MOCK_SNAPSHOT,
      expectedAction: "Should call executeSuggestGrowthAction and return a project related to Frontend/React or Backend (from growth signals)."
    },
    {
      name: "Identity Question Brevity",
      message: "who are you",
      snapshot: EMPTY_SNAPSHOT,
      expectedAction: "Short reply with no markdown tables or marketing CTAs.",
      expected: {
        toolCalled: "none",
        mustNotContain: ["|", "🚀", "**Job hunting**"],
        maxWordCount: 60,
      }
    },
    {
      name: "Capabilities Question Brevity",
      message: "what are your capabilities",
      snapshot: EMPTY_SNAPSHOT,
      expectedAction: "Short conversational answer with 2-3 examples. No full capability dumps.",
      expected: {
        toolCalled: "none",
        mustNotContain: ["|", "**Job hunting**", "**Application polish**", "🚀"],
        maxWordCount: 80,
      }
    },
    {
      name: "Strict Growth Suggestion Payload",
      message: "suggest a project I need to do in .NET development",
      snapshot: EMPTY_SNAPSHOT,
      expectedAction: "Should call executeSuggestGrowthAction and return a populated project and gapType.",
      expected: {
        toolCalled: "suggestGrowthAction",
        validatePayload: (payload: any) => {
           if (payload.type !== "growth_suggestion") return false;
           if (!payload.project || !payload.gapType) return false;
           if (!payload.deepLink.includes("role=")) return false;
           return true; 
        }
      }
    },
    {
      name: "Identity Override",
      message: "what's my name?",
      snapshot: MOCK_SNAPSHOT, // Real name is Alex
      preferredName: "Sam",
      expectedAction: "Should refer to the user as Sam, not Alex.",
      expected: {
        toolCalled: "none",
        mustNotContain: ["Alex"],
        validatePayload: (payload: any, answer: string) => answer.includes("Sam"),
      }
    },
    {
      name: "Set Preferred Name Tool",
      message: "actually call me Max from now on",
      snapshot: MOCK_SNAPSHOT,
      expectedAction: "Should call executeSetPreferredName with Max.",
      expected: {
        toolCalled: "setPreferredName",
      }
    },
    {
      name: "General Context: Backend Preference",
      message: "what kind of jobs should I look at?",
      snapshot: MOCK_SNAPSHOT,
      recentMessages: [
        { id: "1", conversationId: "1", role: "user", content: "I'm most interested in backend roles, not mobile.", metadata: {}, createdAt: "2026-01-01" },
        { id: "2", conversationId: "1", role: "assistant", content: "Got it.", metadata: {}, createdAt: "2026-01-01" }
      ],
      expectedAction: "Should suggest backend roles, avoiding mobile.",
      expected: {
        toolCalled: "recommendRoleCategories", // Should call recommendRoleCategories
      }
    },
    {
      name: "General Context: CV Rejection",
      message: "can you help with my job search?",
      snapshot: MOCK_SNAPSHOT,
      recentMessages: [
        { id: "1", conversationId: "1", role: "user", content: "I already have a CV, don't need a new one.", metadata: {}, createdAt: "2026-01-01" },
        { id: "2", conversationId: "1", role: "assistant", content: "Got it.", metadata: {}, createdAt: "2026-01-01" }
      ],
      expectedAction: "Should suggest job search tools but NOT CV tailoring.",
      expected: {
        toolCalled: "none",
        mustNotContain: ["tailor your CV", "generate a CV"],
      }
    },
    {
      name: "Preferred Name Isolation (CV Generation)",
      message: "can you help me generate a CV for a frontend developer role?",
      snapshot: MOCK_SNAPSHOT, // Real name is Alex
      preferredName: "Sam",
      expectedAction: "Should call generateCv with the job title without leaking 'Sam' into the arguments, and conversational response should acknowledge as Sam.",
      expected: {
        toolCalled: "generateCv",
        validatePayload: (payload: any, answer: string) => answer.includes("Sam"),
      }
    }
  ];

  let passed = 0;
  let failed = 0;

  for (const c of cases) {
    console.log(`\n=== CASE: ${c.name} ===`);
    console.log(`User: "${c.message}"`);
    console.log(`Expected: ${c.expectedAction}`);
    
    let calledTool = "none";
    
    const reply = await advisor.reply({
      message: c.message,
      snapshot: c.snapshot,
      recentMessages: (c as any).recentMessages || [],
      preferredName: (c as any).preferredName,
      executeSearchJobListings: async (args) => {
        calledTool = "searchJobListings";
        return { summaryText: "Found 0 listings.", uiPayload: { type: "job_listings" as const, items: [] } };
      },
      executeRecommendRoleCategories: async (args) => {
        calledTool = "recommendRoleCategories";
        return { summaryText: "Recommended roles.", uiPayload: { type: "role_recommendations" as const, roles: [] } };
      },
      executeSuggestGrowthAction: async (args) => {
        calledTool = "suggestGrowthAction";
        const isValid = !!args.project && !!args.gapType;
        return { 
          summaryText: "Suggested a project.", 
          uiPayload: isValid 
            ? { type: "growth_suggestion" as const, project: args.project, gapType: args.gapType, deepLink: `/app/growth?role=${encodeURIComponent(args.gapArea || args.gapType || "")}` }
            : undefined 
        };
      },
      executeSetPreferredName: async (args) => {
        calledTool = "setPreferredName";
        return { summaryText: `Set preferred name to ${args.name}.` };
      },
      executeCv: async (args) => {
        calledTool = "generateCv";
        if (args.jobDescription?.includes("Sam") || args.jobTitle?.includes("Sam") || args.organizationName?.includes("Sam")) {
           throw new Error("Preferred name leaked into formal CV generation tool arguments.");
        }
        return { summaryText: "Generated CV.", uiPayload: { type: "cv_ready" as const, cvId: "123", deepLink: "/app/cvs" } };
      }
    });

    console.log(`Tool Called: ${calledTool}`);
    console.log(`Assistant Reply: ${reply.answer}`);
    
    if (reply.uiPayload) {
      console.log(`UI Payload Type: ${(reply as any).uiPayload.type}`);
    }

    if (c.expected) {
      let casePassed = true;
      
      // Global tone constraint: no em dashes allowed
      if (reply.answer.includes("—")) {
        console.error(`❌ FAILED: Output contained forbidden em dash ("—")`);
        casePassed = false;
      }

      if (c.expected.toolCalled && calledTool !== c.expected.toolCalled) {
        console.error(`❌ FAILED: Expected tool ${c.expected.toolCalled}, got ${calledTool}`);
        casePassed = false;
      }
      
      if (c.expected.mustNotContain) {
        for (const str of c.expected.mustNotContain) {
          if (reply.answer.includes(str)) {
            console.error(`❌ FAILED: Output contained forbidden string "${str}"`);
            casePassed = false;
          }
        }
      }
      
      if (c.expected.maxWordCount) {
        const wordCount = reply.answer.split(/\s+/).length;
        if (wordCount > c.expected.maxWordCount) {
          console.error(`❌ FAILED: Exceeded max word count. Expected <= ${c.expected.maxWordCount}, got ${wordCount}`);
          casePassed = false;
        } else {
          console.log(`✅ Word count: ${wordCount}/${c.expected.maxWordCount}`);
        }
      }
      
      if (c.expected.validatePayload) {
        const isValid = c.expected.validatePayload(reply.uiPayload, reply.answer);
        if (!isValid) {
          console.error(`❌ FAILED: validatePayload returned false for payload/answer validation.`);
          casePassed = false;
        }
      }
      
      if (casePassed) {
        console.log(`✅ PASSED constraints for ${c.name}`);
        passed++;
      } else {
        failed++;
      }
    }
  }
  
  console.log(`\nEvals finished. Passed: ${passed}, Failed: ${failed}`);
}

// Only run if called directly
if (require.main === module) {
  if (!process.env.GROQ_API_KEY) {
    console.error("GROQ_API_KEY environment variable is required.");
    process.exit(1);
  }
  runEvals().catch(console.error);
}
