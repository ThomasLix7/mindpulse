import { supabase } from "@/utils/supabase-client";

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  try {
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError) {
      console.error("Error getting session:", sessionError);
    }

    const authHeader = session?.access_token
      ? { Authorization: `Bearer ${session.access_token}` }
      : {};

    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
      ...authHeader,
    } as Record<string, string>;

    return fetch(input, { ...init, headers });
  } catch (error) {
    console.error("Error in apiFetch:", error);
    const headers = {
      "Content-Type": "application/json",
      ...(init.headers || {}),
    } as Record<string, string>;
    return fetch(input, { ...init, headers });
  }
}


