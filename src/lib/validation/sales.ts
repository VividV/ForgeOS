import { z } from "zod";
import { optText, reqText, shortCode } from "./common";

export const customerSchema = z.object({
  code: shortCode,
  name: reqText("a customer name"),
  customer_type: z.enum(["business", "individual", "retailer", "distributor"]).default("business"),
  contact_name: optText(120),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).nullish().transform((v) => v || null),
  phone: optText(40),
  billing_address: optText(400),
  shipping_address: optText(400),
  tax_id: optText(40),
  payment_terms: optText(120),
  credit_limit: z.preprocess((v) => (v === "" || v == null ? null : Number(String(v).replace(/,/g, ""))), z.number().min(0).nullable()),
  notes: optText(2000),
});
