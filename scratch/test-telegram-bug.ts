import { getCareerFriendApplication } from "../src/server/composition-root";

async function main() {
  const userId = process.argv[2];
  if (!userId) {
    console.error("Provide userId");
    process.exit(1);
  }
  const app = getCareerFriendApplication(userId);
  console.log("Asking: i would like to tailor it for a backend development role for company xyz and their main focus is java.");
  const r1 = await app.askTelegram("i would like to tailor it for a backend development role for company xyz and their main focus is java.");
  console.log("Reply 1:", r1.answer);

  console.log("Asking: what was the role i asked for?");
  const r2 = await app.askTelegram("what was the role i asked for?");
  console.log("Reply 2:", r2.answer);
}
main().catch(console.error);
