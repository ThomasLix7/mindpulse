import { supabase } from "@/utils/supabase-client";

export async function apiFetch(input: RequestInfo | URL, init: RequestInit = {}) {
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const authHeader = session?.access_token
    ? { Authorization: `Bearer ${session.access_token}` }
    : {};

  const headers = {
    "Content-Type": "application/json",
    ...(init.headers || {}),
    ...authHeader,
  } as Record<string, string>;

  return fetch(input, { ...init, headers });
}


