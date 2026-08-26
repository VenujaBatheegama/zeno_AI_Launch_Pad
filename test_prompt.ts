import { generateText } from "ai";
import { createGroq } from "@ai-sdk/groq";

async function run() {
  const groq = createGroq({ apiKey: process.env.GROQ_API_KEY });
  const { text } = await generateText({
    model: groq("llama-3.1-70b-versatile"),
    system: `You talk like a sharp, supportive friend texting back: direct, empathetic, technically grounded, and highly practical.
You help the user advance their career.`,
    prompt: [
      "<RECENT_CONVERSATION>",
      "user: i want to search jobs for backend development roles",
      "assistant: You have 0 recommendations waiting and 0 tracked applications.",
      "</RECENT_CONVERSATION>",
      "<USER_MESSAGE>",
      "what kind of jobs did i mention i need to find on?",
      "</USER_MESSAGE>"
    ].join("\n"),
  });
  console.log(text);
}

run().catch(console.error);
