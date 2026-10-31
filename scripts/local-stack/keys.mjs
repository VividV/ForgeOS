// Prints local anon / service_role API keys signed with the local JWT secret.
import crypto from "node:crypto";

const secret = process.env.LOCAL_JWT_SECRET ?? "super-secret-jwt-token-with-at-least-32-characters-long";
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString("base64url");
export function sign(payload) {
  const head = b64({ alg: "HS256", typ: "JWT" });
  const body = b64(payload);
  const sig = crypto.createHmac("sha256", secret).update(`${head}.${body}`).digest("base64url");
  return `${head}.${body}.${sig}`;
}
const exp = 2000000000;
const anon = sign({ iss: "supabase-local", role: "anon", exp });
const service = sign({ iss: "supabase-local", role: "service_role", exp });

if (process.argv.includes("--env")) {
  console.log(`NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:54321`);
  console.log(`NEXT_PUBLIC_SUPABASE_ANON_KEY=${anon}`);
  console.log(`SUPABASE_SERVICE_ROLE_KEY=${service}`);
} else {
  console.log(`anon key:    ${anon}`);
  console.log(`service key: ${service}`);
}
