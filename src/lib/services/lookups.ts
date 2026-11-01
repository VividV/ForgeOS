import "server-only";
import { getSession } from "@/lib/auth";

export type Option = { value: string; label: string };

/** Reference data for selects. All queries go through RLS with the user's session. */
export async function lookups(orgId: string, which: ("uoms" | "factories" | "warehouses" | "suppliers" | "stages" | "workCentres" | "members" | "roles")[]) {
  const { supabase } = await getSession();
  const out: Partial<Record<(typeof which)[number], Option[]>> = {};
  await Promise.all(
    which.map(async (w) => {
      if (w === "uoms") {
        const { data } = await supabase.from("units_of_measure").select("id, code, name").eq("organization_id", orgId).eq("is_active", true).order("name");
        out.uoms = (data ?? []).map((u) => ({ value: u.id, label: `${u.name} (${u.code})` }));
      } else if (w === "factories") {
        const { data } = await supabase.from("factories").select("id, name, code").eq("organization_id", orgId).is("deleted_at", null).eq("is_active", true).order("name");
        out.factories = (data ?? []).map((f) => ({ value: f.id, label: `${f.name}` }));
      } else if (w === "warehouses") {
        const { data } = await supabase.from("warehouses").select("id, name, code").eq("organization_id", orgId).is("deleted_at", null).eq("is_active", true).order("name");
        out.warehouses = (data ?? []).map((f) => ({ value: f.id, label: `${f.name} (${f.code})` }));
      } else if (w === "suppliers") {
        const { data } = await supabase.from("suppliers").select("id, name, code").eq("organization_id", orgId).is("deleted_at", null).eq("is_active", true).order("name");
        out.suppliers = (data ?? []).map((f) => ({ value: f.id, label: f.name }));
      } else if (w === "stages") {
        const { data } = await supabase.from("production_stages").select("id, name").eq("organization_id", orgId).eq("is_active", true).order("sequence");
        out.stages = (data ?? []).map((f) => ({ value: f.id, label: f.name }));
      } else if (w === "workCentres") {
        const { data } = await supabase.from("work_centres").select("id, name, factories(name)").eq("organization_id", orgId).eq("is_active", true).is("deleted_at", null).order("name");
        out.workCentres = (data ?? []).map((f) => ({ value: f.id, label: `${f.name} · ${(f.factories as unknown as { name: string } | null)?.name ?? ""}` }));
      } else if (w === "members") {
        const { data } = await supabase.from("organization_members").select("user_id, profiles:user_id(full_name, email)").eq("organization_id", orgId).eq("status", "active");
        out.members = (data ?? [])
          .map((m) => {
            const p = m.profiles as unknown as { full_name: string; email: string } | null;
            return { value: m.user_id as string, label: p?.full_name || p?.email || "Member" };
          })
          .sort((a, b) => a.label.localeCompare(b.label));
      } else if (w === "roles") {
        const { data } = await supabase.from("roles").select("id, name, is_owner").eq("organization_id", orgId).order("name");
        out.roles = (data ?? []).map((r) => ({ value: r.id, label: r.name }));
      }
    }),
  );
  return out as Record<(typeof which)[number], Option[]>;
}
