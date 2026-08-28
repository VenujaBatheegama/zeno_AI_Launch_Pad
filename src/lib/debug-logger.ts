import { createSupabaseClient } from "@/server/supabase-client";
import { getServerConfig } from "@/server/config";

export interface DebugLog {
  timestamp: string;
  type: string;
  data: any;
}

export async function logDebug(type: string, data: any) {
  try {
    const config = getServerConfig();
    const supabase = createSupabaseClient(config);
    
    await supabase.from("app_debug_logs").insert({
      type,
      data,
    });
  } catch (error) {
    console.error("Failed to write debug log to Supabase", error);
  }
}

export async function getDebugLogs(): Promise<DebugLog[]> {
  try {
    const config = getServerConfig();
    const supabase = createSupabaseClient(config);
    
    const { data, error } = await supabase
      .from("app_debug_logs")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(50);
      
    if (error) throw error;
    
    return (data || []).map(row => ({
      timestamp: row.created_at,
      type: row.type,
      data: row.data,
    }));
  } catch (error) {
    console.error("Failed to read debug logs from Supabase", error);
  }
  return [];
}
