import { expect, test, type Browser, type Page } from "@playwright/test";

// Acceptance tests 1–5 and 10 from the build brief, driven through the real UI.
// Runs serially: each step builds on the data created by the previous one.

const run = Date.now().toString(36);
const owner = { name: "Ada Okafor", email: `owner.${run}@e2e.forgeos.dev`, password: "Forge-test-2026" };
const worker = { name: "Tunde Bello", email: `worker.${run}@e2e.forgeos.dev`, password: "Forge-test-2026" };
const company = `Lagos Garments ${run}`;
let inviteLink = "";
let orderUrl = "";

test.describe.configure({ mode: "serial" });

async function signIn(page: Page, u: { email: string; password: string }) {
  await page.goto("/login");
  await page.getByLabel("Work email").fill(u.email);
  await page.getByLabel("Password").fill(u.password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((url) => !url.pathname.startsWith("/login"));
}

async function ownerPage(browser: Browser) {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await signIn(page, owner);
  return page;
}

async function toast(page: Page, text: string | RegExp) {
  await expect(page.locator("[data-sonner-toast]").filter({ hasText: text }).first()).toBeVisible();
}

test("1. a new manufacturer signs up, sets up the factory and invites a worker", async ({ page }) => {
  await page.goto("/signup");
  await page.getByLabel("Full name").fill(owner.name);
  await page.getByLabel("Work email").fill(owner.email);
  await page.getByLabel("Password").fill(owner.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);

  await page.getByLabel("Company name").fill(company);
  await page.getByLabel("Industry").selectOption("Garments & textiles");
  await page.getByLabel("Phone number").fill("+234 801 234 5678");
  await page.getByRole("button", { name: "Create organisation" }).click();
  await page.waitForURL(/step=profile/);

  await page.getByLabel("Main products you manufacture").fill("Shirts and uniforms");
  await page.getByLabel("Tracking raw materials").check();
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=factory/);

  await page.getByLabel("Factory name").fill("Ikeja Plant");
  await page.getByLabel("Short code").fill("IKJ");
  await page.getByLabel("Number of work centres").fill("2");
  await page.getByLabel("Production stages").selectOption("garment");
  await page.getByRole("button", { name: "Add factory" }).click();
  await page.waitForURL(/step=configuration/);

  await expect(page.getByLabel("Default currency")).toHaveValue("NGN");
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=team/);

  await page.getByLabel("Email").fill(worker.email);
  await page.getByLabel("Role").selectOption({ label: "Production Worker" });
  await page.getByRole("button", { name: "Invite" }).click();
  await toast(page, /Invitation/);
  // Email isn't configured locally, so the app offers the invite link instead of pretending it was sent.
  await page.getByRole("button", { name: "Copy invite link" }).waitFor();
  await page.getByRole("button", { name: /Continue/ }).click();
  await page.waitForURL(/step=data/);
  await expect(page.getByText("nothing has been added on your behalf")).toBeVisible();
  await page.getByRole("button", { name: "Go to Mission Control" }).click();
  await page.waitForURL(/\/overview/);
  await expect(page.getByRole("heading", { name: "Mission Control" })).toBeVisible();

  // fetch the invite link from the team page (owner can re-share from pending invitations via DB token is hashed,
  // so we create a fresh one through the Team page UI, which shows the link when email is off)
  await page.goto("/admin/team");
  await expect(page.getByText(worker.email)).toBeVisible();
  await page.getByRole("button", { name: "Revoke" }).click();
  await page.getByRole("button", { name: "Revoke" }).last().click();
  await toast(page, "Invitation revoked");
  await page.getByRole("button", { name: "Invite member" }).click();
  await page.getByLabel("Email").fill(worker.email);
  await page.getByLabel("Role").selectOption({ label: "Production Worker" });
  await page.getByRole("button", { name: "Send invitation" }).click();
  inviteLink = await page.getByLabel("Invitation link").inputValue();
  expect(inviteLink).toContain("/invite/");
});

test("1b. the invited worker joins and only sees their own work", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  await page.goto(new URL(inviteLink).pathname);
  await expect(page.getByText(`Join ${company}`)).toBeVisible();
  await page.getByRole("link", { name: "Create account" }).click();
  await page.getByLabel("Full name").fill(worker.name);
  await page.getByLabel("Work email").fill(worker.email);
  await page.getByLabel("Password").fill(worker.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/invite\//);
  await page.getByRole("button", { name: "Accept invitation" }).click();
  await page.waitForURL(/\/floor/);
  await expect(page.getByText("No jobs assigned to you")).toBeVisible();
  // Navigation is permission-aware…
  await expect(page.getByRole("link", { name: "Raw Materials" })).toHaveCount(0);
  // …and so is the server: direct URLs and exports are refused.
  await page.goto("/inventory/materials");
  await expect(page.getByText("You don't have access to this page")).toBeVisible();
  const res = await page.request.get("/api/export/materials");
  expect(res.status()).toBe(403);
  await ctx.close();
});

const materials = [
  { code: "FAB-COT", name: "Cotton fabric", unit: "Metres (m)", cost: "1500", qty: "300", perUnit: "2.2", wastage: "5" },
  { code: "BTN-WHT", name: "White buttons", unit: "Pieces (pcs)", cost: "20", qty: "1000", perUnit: "8", wastage: "0" },
  { code: "THR-WHT", name: "Sewing thread", unit: "Metres (m)", cost: "2", qty: "5000", perUnit: "35", wastage: "10" },
];

test("2. product, three materials and an approved BOM with correct calculations", async ({ browser }) => {
  const page = await ownerPage(browser);
  for (const m of materials) {
    await page.goto("/inventory/materials/new");
    await page.getByLabel(/^Material name\*?$/).fill(m.name);
    await page.getByLabel(/^Material code\*?$/).fill(m.code);
    await page.getByLabel(/^Stock unit\*?$/).selectOption({ label: m.unit });
    await page.getByLabel("Standard cost per stock unit").fill(m.cost);
    await page.getByLabel(/^Reorder level\*?$/).fill(m.code === "FAB-COT" ? "50" : "0");
    await page.getByRole("button", { name: "Create material" }).click();
    await page.waitForURL(/\/inventory\/materials\/[0-9a-f-]{36}/);
    await expect(page.getByRole("heading", { name: m.name })).toBeVisible();
  }

  await page.goto("/commerce/products/new");
  await page.getByLabel("Product name").fill("Men's Cotton Shirt");
  await page.getByLabel("Product code").fill("SHIRT-M");
  await page.getByLabel("Selling price").fill("15000");
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL(/\/commerce\/products\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Create BOM" }).click();
  await page.waitForURL(/\/commerce\/boms\//);

  for (const [i, m] of materials.entries()) {
    await page.getByLabel("Material", { exact: true }).selectOption({ label: `${m.name} (${m.code}) · ${m.unit.match(/\((.+)\)/)![1]}` });
    await page.getByLabel("Quantity", { exact: true }).fill(m.perUnit);
    await page.getByLabel("Wastage percent").fill(m.wastage);
    await page.getByRole("button", { name: "Add", exact: true }).click();
    await expect(page.locator("tbody tr")).toHaveCount(i + 1);
  }
  // 2.2 m × 1.05 × ₦1,500 + 8 × ₦20 + 35 m × 1.10 × ₦2 = ₦3,702.00 per shirt (estimate)
  await expect(page.locator("tfoot")).toContainText("3,702.00");
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("button", { name: "Approve" }).last().click();
  await toast(page, "BOM approved");
  await expect(page.getByText("Approved", { exact: true }).first()).toBeVisible();
});

test("3. inventory: receive, transfer, adjust, available stock and audit history", async ({ browser }) => {
  const page = await ownerPage(browser);
  // second warehouse
  await page.goto("/inventory/warehouses");
  await page.getByRole("button", { name: "Add warehouse" }).click();
  await page.getByRole("dialog").getByLabel("Code").fill("OVERFLOW");
  await page.getByRole("dialog").getByLabel("Name").fill("Overflow store");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Warehouse added");

  for (const m of materials) {
    await page.goto("/inventory/materials");
    await page.getByRole("link", { name: m.name }).click();
    await page.getByRole("button", { name: "Receive stock" }).click();
    await page.getByRole("dialog").getByLabel("Warehouse").selectOption({ label: "Ikeja Plant store (IKJ-STR)" });
    await page.getByRole("dialog").getByLabel("Quantity").fill(m.qty);
    await page.getByRole("dialog").getByLabel(/Unit cost per/).fill(m.cost);
    await page.getByRole("dialog").getByLabel("Reference").fill("DN-1001");
    await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
    await toast(page, "Stock received");
  }
  // Fabric: transfer 30 m to overflow, then write off 5 m as damaged there
  await page.goto("/inventory/materials");
  await page.getByRole("link", { name: "Cotton fabric" }).click();
  await page.getByRole("button", { name: "Transfer" }).click();
  await page.getByRole("dialog").getByLabel("From").selectOption({ label: "Ikeja Plant store (IKJ-STR)" });
  await page.getByRole("dialog").getByLabel("To").selectOption({ label: "Overflow store (OVERFLOW)" });
  await page.getByRole("dialog").getByLabel("Quantity").fill("30");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Stock transferred");
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.getByRole("dialog").getByLabel("Warehouse").selectOption({ label: "Overflow store (OVERFLOW)" });
  await page.getByRole("dialog").getByLabel("Reason").selectOption("damaged");
  await page.getByRole("dialog").getByLabel(/Quantity/).fill("-5");
  await page.getByRole("dialog").getByLabel("Notes").fill("Water damage in overflow store");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Adjustment posted");
  // Removing more than is available is refused (no negative stock by default)
  await page.getByRole("button", { name: "Adjust" }).click();
  await page.getByRole("dialog").getByLabel("Warehouse").selectOption({ label: "Overflow store (OVERFLOW)" });
  await page.getByRole("dialog").getByLabel("Reason").selectOption("wastage");
  await page.getByRole("dialog").getByLabel(/Quantity/).fill("-100");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await expect(page.getByText(/Insufficient available stock/)).toBeVisible();
  await page.keyboard.press("Escape");

  await page.reload();
  // 300 received − 5 damaged = 295 on hand; nothing reserved, so available = 295
  await expect(page.getByText("295 m").first()).toBeVisible();
  await expect(page.getByRole("cell", { name: "Overflow store" })).toBeVisible();
  await page.goto("/admin/audit?action=stock_adjustment");
  await expect(page.getByText(/Stock adjustment ADJ-/)).toBeVisible();
});
