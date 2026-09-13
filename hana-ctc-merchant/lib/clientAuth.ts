export interface StoredCreds {
  clientId: string;
  clientSecret: string;
  name: string;
  payoutAddress: string;
}

const KEY = "hana_merchant_creds";

export function saveCreds(creds: StoredCreds) {
  if (typeof window === "undefined") return;
  localStorage.setItem(KEY, JSON.stringify(creds));
}

export function loadCreds(): StoredCreds | null {
  if (typeof window === "undefined") return null;
  const raw = localStorage.getItem(KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as StoredCreds;
  } catch {
    return null;
  }
}

export function clearCreds() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(KEY);
}

export function authedFetch(path: string, creds: StoredCreds, init: RequestInit = {}): Promise<Response> {
  return fetch(path, {
    ...init,
    headers: {
      ...(init.headers ?? {}),
      "x-client-id": creds.clientId,
      "x-client-secret": creds.clientSecret,
    },
  });
}
