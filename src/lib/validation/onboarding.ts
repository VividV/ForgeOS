import { z } from "zod";

const opt = (max = 200) => z.string().trim().max(max).optional().or(z.literal(""));
const optNum = z.preprocess((v) => (v === "" || v === null || v === undefined ? undefined : Number(v)), z.number().min(0).max(1_000_000).optional());

export const COUNTRIES = [
  { value: "NG", label: "Nigeria" }, { value: "GH", label: "Ghana" }, { value: "KE", label: "Kenya" }, { value: "ZA", label: "South Africa" },
  { value: "CI", label: "Côte d'Ivoire" }, { value: "SN", label: "Senegal" }, { value: "EG", label: "Egypt" }, { value: "MA", label: "Morocco" },
  { value: "GB", label: "United Kingdom" }, { value: "US", label: "United States" }, { value: "IE", label: "Ireland" }, { value: "NL", label: "Netherlands" },
  { value: "FR", label: "France" }, { value: "DE", label: "Germany" }, { value: "AE", label: "United Arab Emirates" },
];

export const INDUSTRIES = [
  "Garments & textiles", "Food & beverage", "Furniture & wood", "Cosmetics & personal care", "Plastics & packaging",
  "Metal fabrication", "Leather & footwear", "Chemicals", "Building materials", "Electronics assembly", "Other",
].map((v) => ({ value: v, label: v }));

export const BUSINESS_TYPES = ["Limited company", "Business name / sole proprietor", "Partnership", "Cooperative", "Other"].map((v) => ({ value: v, label: v }));

export const orgSchema = z.object({
  name: z.string().trim().min(2, "Enter your company name").max(120),
  business_type: opt(80),
  industry: opt(80),
  country: z.string().regex(/^[A-Z]{2}$/, "Choose a country"),
  address: opt(300),
  email: z.union([z.email("Enter a valid email"), z.literal("")]).optional(),
  phone: opt(40),
  website: z.union([z.url("Enter a full URL, e.g. https://example.com"), z.literal("")]).optional(),
});

export const PRODUCTION_MODELS = [
  { value: "make_to_order", label: "Make to order" },
  { value: "make_to_stock", label: "Make to stock" },
  { value: "mixed", label: "Mixed" },
  { value: "batch", label: "Batch production" },
  { value: "job_shop", label: "Job shop / custom" },
  { value: "continuous", label: "Continuous" },
];

export const CHALLENGES = [
  "Tracking raw materials", "Knowing production progress", "Accurate product costing", "Material wastage",
  "Quality problems", "Late deliveries", "Staff accountability", "Reporting takes too long",
];

export const profileSchema = z.object({
  main_products: opt(300),
  employee_count_range: opt(20),
  factory_count: optNum,
  production_model: opt(30),
  production_challenges: z.array(z.string().max(60)).max(12).optional(),
});

export const factorySchema = z.object({
  name: z.string().trim().min(2, "Name your factory").max(120),
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9][A-Z0-9_-]{0,9}$/, "Letters and numbers only, up to 10 characters").optional().or(z.literal("")),
  address: opt(300),
  capacity_per_day: optNum,
  capacity_unit: opt(30),
  work_centre_count: z.preprocess((v) => (v === "" || v == null ? undefined : Number(v)), z.number().int().min(0).max(30).optional()),
  opens_at: opt(5),
  closes_at: opt(5),
  working_days: z.array(z.coerce.number().int().min(1).max(7)).min(1, "Choose at least one working day").optional(),
  timezone: z.string().min(3).max(60),
  stage_template: z.enum(["generic", "garment", "food", "furniture"]),
});

export const configSchema = z.object({
  currency: z.enum(["NGN", "USD", "GBP", "EUR"]),
  measurement_system: z.enum(["metric", "imperial"]),
  date_format: z.enum(["dd/MM/yyyy", "MM/dd/yyyy", "yyyy-MM-dd"]),
  fiscal_year_start_month: z.coerce.number().int().min(1).max(12),
  inventory_valuation: z.enum(["weighted_average", "fifo"]),
  costing_method: z.enum(["actual", "standard"]),
  require_production_approval: z.boolean().optional(),
});

export const TIMEZONES = ["Africa/Lagos", "Africa/Accra", "Africa/Nairobi", "Africa/Johannesburg", "Africa/Cairo", "Africa/Casablanca", "Europe/London", "Europe/Amsterdam", "Europe/Paris", "America/New_York", "Asia/Dubai", "UTC"];
