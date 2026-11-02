import { createHmac } from "node:crypto";
import { beforeAll, describe, expect, it } from "vitest";

describe("Paystack webhook signatures", () => {
  let validSignature: (raw: string, sig: string | null) => boolean;
  beforeAll(async () => {
    process.env.PAYSTACK_SECRET_KEY = "sk_test_unit_secret";
    process.env.SUPABASE_SERVICE_ROLE_KEY = "x".repeat(40);
    ({ validSignature } = await import("@/lib/paystack"));
  });
  it("accepts the HMAC-SHA512 of the raw body and rejects anything else", () => {
    const raw = JSON.stringify({ event: "charge.success", data: { reference: "abc" } });
    const sig = createHmac("sha512", "sk_test_unit_secret").update(raw).digest("hex");
    expect(validSignature(raw, sig)).toBe(true);
    expect(validSignature(raw + " ", sig)).toBe(false);
    expect(validSignature(raw, sig.replace(/^./, "0"))).toBe(sig.startsWith("0") ? true : false);
    expect(validSignature(raw, null)).toBe(false);
    expect(validSignature(raw, "short")).toBe(false);
  });
});
