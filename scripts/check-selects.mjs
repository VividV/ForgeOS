// Runs every literal .from("table").select("...") in the app against PostgREST (limit 1) to catch
// wrong column names and unresolvable embeds, which supabase-js otherwise returns as silent errors.
// Usage: node scripts/check-selects.mjs src <service-role-key>   (local stack must be running)
import fs from "node:fs"; import path from "node:path";
const [root, key] = process.argv.slice(2);
const files = []; const walk = (d) => { for (const f of fs.readdirSync(d)) { const p = path.join(d, f); if (fs.statSync(p).isDirectory()) walk(p); else if (/\.tsx?$/.test(p)) files.push(p); } }; walk(root);
const re = /\.from\("([a-z_]+)"\)\s*\.select\(\s*"([^"]+)"/g;
let bad = 0, n = 0;
const API = process.env.SUPABASE_API_URL ?? "http://127.0.0.1:54321";
for (const f of files) {
  const s = fs.readFileSync(f, "utf8"); let m;
  while ((m = re.exec(s))) {
    const [, t, sel] = m; n++;
    const r = await fetch(`${API}/rest/v1/${t}?select=${encodeURIComponent(sel.replace(/\s+/g, ""))}&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
    if (!r.ok) { bad++; const j = await r.json(); console.log(`${path.relative(root, f)} [${t}] ${j.message}`); }
  }
  // filter / order columns used in the same statement (e.g. .eq("is_active", true))
  const fr = /\.from\("([a-z_]+)"\)([\s\S]*?)(?=\.from\(|\.rpc\(|;|\]\))/g; let m2;
  while ((m2 = fr.exec(s))) {
    const [, t, rest] = m2;
    const cols = new Set([...rest.matchAll(/\.(?:eq|neq|is|in|gt|gte|lt|lte|like|ilike|order|not)\("([a-z_]+)"/g)].map((x) => x[1]));
    for (const c of cols) {
      n++;
      const r = await fetch(`${API}/rest/v1/${t}?select=${c}&limit=1`, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
      if (!r.ok) { bad++; const j = await r.json(); console.log(`${path.relative(root, f)} [${t}.${c}] ${j.message}`); }
    }
  }
}
console.log(`${n} selects checked, ${bad} failing`);
if (bad) process.exit(1);
