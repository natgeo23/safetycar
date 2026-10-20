// Acceso simple por PIN compartido del taller. La cookie guarda un hash, nunca el PIN.
export const AUTH_COOKIE = "sc_auth";

export async function authToken(pin: string) {
  const data = new TextEncoder().encode(`${pin}:${process.env.AUTH_SECRET ?? "safetycar"}`);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash), (b) => b.toString(16).padStart(2, "0")).join("");
}
