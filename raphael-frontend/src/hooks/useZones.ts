import { useQuery } from "@tanstack/react-query";

const API_URL = import.meta.env.VITE_CANOPY_API_URL ?? "http://127.0.0.1:8000";

let hasWarned = false;

async function getAuthToken(): Promise<string | null> {
  const isAutoLoginEnabled = import.meta.env.VITE_DEV_AUTO_LOGIN === "true";
  
  if (!isAutoLoginEnabled) {
    return sessionStorage.getItem("raphael_token");
  }

  if (!hasWarned) {
    console.warn("DEV MODE: auto-authenticating as admin — remove before production build.");
    hasWarned = true;
  }

  let token = sessionStorage.getItem("raphael_token");
  if (!token) {
    try {
      const res = await fetch(`${API_URL}/api/v1/users/auth/login`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: "admin", password: "raphael_admin" }),
      });
      if (res.ok) {
        const data = await res.json();
        token = data?.data?.token || null;
        if (token) {
          sessionStorage.setItem("raphael_token", token);
        }
      } else {
        console.error("Auto-login failed with status:", res.status);
      }
    } catch (e) {
      console.error("Auto-login request failed:", e);
    }
  }
  return token;
}

export async function fetchWithAuth(path: string, options: RequestInit = {}) {
  const token = await getAuthToken();
  const headers = {
    ...options.headers,
    "Content-Type": "application/json",
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
  };
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    throw new Error(`API error: ${res.statusText} (${res.status})`);
  }
  return res.json();
}

export function useActiveRegion() {
  return useQuery({
    queryKey: ["activeRegion"],
    queryFn: async () => {
      const data = await fetchWithAuth("/api/v1/regions/");
      const regions = data.data || [];
      const active = regions.find((r: any) => r.is_active) || regions[0] || null;
      return active;
    },
    staleTime: 5 * 60 * 1000,
  });
}

export function useZones(regionId?: string) {
  return useQuery({
    queryKey: ["zones", regionId],
    queryFn: async () => {
      if (!regionId) return [];
      const data = await fetchWithAuth(`/api/v1/zones/?region_id=${regionId}`);
      return data.data || [];
    },
    enabled: !!regionId,
    staleTime: 60 * 1000,
  });
}
