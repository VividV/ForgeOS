import { Card } from "@/components/ui/card";
import { PageHeader } from "@/components/ui/misc";
import { getSession, requirePermission } from "@/lib/auth";
import { integrations } from "@/lib/server-env";
import { CopilotChat } from "./chat";

export const metadata = { title: "AI copilot" };

export default async function CopilotPage() {
  const ctx = await requirePermission("ai.use");
  const { supabase } = await getSession();
  const monthStart = new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString();
  const { count } = await supabase.from("ai_usage").select("id", { count: "exact", head: true }).eq("organization_id", ctx.org.id).gte("created_at", monthStart);
  const limit = ctx.billing?.ai_requests_monthly;
  return (
    <>
      <PageHeader
        title="Forge AI copilot"
        description={`Ask questions in plain language. Forge reads only what you're allowed to see and can suggest actions for you to confirm.${limit != null ? ` This month: ${count ?? 0} of ${limit} questions used${ctx.can("billing.manage") ? "" : " (yours)"}.` : ""}`}
      />
      <Card>
        <CopilotChat configured={integrations.ai} />
      </Card>
    </>
  );
}
