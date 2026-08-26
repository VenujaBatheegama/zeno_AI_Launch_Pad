import { createSupabaseClient } from "../src/server/supabase-client";
import { getServerConfig } from "../src/server/config";

async function main() {
  const config = getServerConfig();
  const supabase = createSupabaseClient(config);
  
  const { data, error } = await supabase.from("career_messages").select("user_id").limit(1);
  if (error) {
    console.error("DB error:", error);
    return;
  }
  if (!data || data.length === 0) {
    console.error("No users found");
    return;
  }
  console.log("User ID:", data[0].user_id);
}
main();
