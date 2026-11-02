import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** Serves an attachment to signed-in users allowed to see its record (enforced by RLS). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) return new NextResponse("Not found", { status: 404 });
  const supabase = await createClient();
  const { data: auth } = await supabase.auth.getUser();
  if (!auth.user) return new NextResponse("Sign in required", { status: 401 });
  const { data } = await supabase.from("attachments").select("file_name, content_type, data").eq("id", id).maybeSingle();
  if (!data) return new NextResponse("Not found", { status: 404 });
  const hex = String(data.data).replace(/^\\x/, "");
  const body = Buffer.from(hex, "hex");
  const safeName = String(data.file_name).replace(/[^\w.\- ]+/g, "_");
  return new NextResponse(body, {
    headers: {
      "Content-Type": data.content_type,
      "Content-Length": String(body.length),
      "Content-Disposition": `${data.content_type === "application/pdf" ? "inline" : "inline"}; filename="${safeName}"`,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
      "Content-Security-Policy": "default-src 'none'; img-src 'self'; style-src 'unsafe-inline'; sandbox",
    },
  });
}
