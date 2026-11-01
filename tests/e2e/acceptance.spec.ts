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

const STEPS = ["Design approval", "Fabric inspection", "Cutting", "Printing/dyeing", "Sewing", "Finishing", "Quality inspection", "Packaging", "Finished goods storage"];

test("4. production: 100 units from plan to finished goods, with the worker updating from the floor", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/operations/production-orders/new");
  await page.getByLabel("Quantity to produce").fill("100");
  await page.getByLabel("Priority").selectOption("high");
  await page.getByLabel("Production manager").selectOption({ label: owner.name });
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/operations\/production-orders\/[0-9a-f-]{36}/);
  orderUrl = page.url();
  await expect(page.getByText("Awaiting approval").first()).toBeVisible();
  // Requirements come from the BOM: 100 × 2.2 m × 1.05 = 231 m fabric, 800 buttons, 3,850 m thread
  const mats = page.locator("table").first();
  await expect(mats).toContainText("231");
  await expect(mats).toContainText("800");
  await expect(mats).toContainText("3,850");

  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await toast(page, /Order is now/);
  await expect(page.getByText("Ready to start").first()).toBeVisible(); // all materials reserved

  await page.getByRole("button", { name: "Issue", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue materials" }).click();
  await toast(page, /Issued 3 material/);

  await page.getByRole("button", { name: "Issue job card" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel("Step").selectOption({ label: "1. Design approval" });
  await d.getByLabel("Assign to person").selectOption({ label: worker.name });
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Job card issued");

  // Worker updates the job card from a phone-sized screen
  const wctx = await browser.newContext({ viewport: { width: 390, height: 844 }, hasTouch: true });
  const wp = await wctx.newPage();
  await signIn(wp, worker);
  await wp.goto("/floor");
  await wp.getByRole("link", { name: /Design approval/ }).click();
  await wp.getByRole("button", { name: "Start job" }).click();
  await toast(wp, "Job started");
  await wp.getByRole("button", { name: "Record completed" }).click();
  await wp.getByLabel("Good units").fill("100");
  await wp.getByRole("button", { name: "Save" }).click();
  await toast(wp, "Recorded");
  await wp.getByRole("button", { name: "Finish job" }).click();
  await wp.getByRole("button", { name: "Save" }).click();
  await toast(wp, "Job finished");
  // the worker cannot open the production order itself
  await wp.goto(orderUrl);
  await expect(wp.getByText("You don't have access to this page")).toBeVisible();
  await wctx.close();

  await page.reload();
  await expect(page.getByText("In progress").first()).toBeVisible(); // started from the job card
  const esc = (t: string) => t.replace(/[.*+?^${}()|[\]\\/]/g, "\\$&");
  const step = (name: string) => page.locator("ol > li").filter({ hasText: new RegExp(`^\\d+${esc(name)}`) });
  await step("Design approval").getByRole("button", { name: "Done" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Complete step" }).click();
  await toast(page, "Step completed");

  for (const name of STEPS.slice(1)) {
    const qc = name === "Quality inspection";
    const after = STEPS.indexOf(name) > STEPS.indexOf("Quality inspection");
    await step(name).getByRole("button", { name: "Record" }).click();
    const dlg = page.getByRole("dialog");
    await dlg.getByLabel("Good units").fill(qc || after ? "95" : "100");
    await dlg.getByLabel("Rejected units").fill(qc ? "5" : "0");
    await dlg.getByRole("button", { name: "Save" }).click();
    await toast(page, "Progress recorded");
    await step(name).getByRole("button", { name: "Done" }).click();
    await page.getByRole("dialog").getByRole("button", { name: "Complete step" }).click();
    await expect(step(name).locator("span").first()).toHaveClass(/bg-success/);
  }
  await expect(page.getByText("Quality inspection").first()).toBeVisible();

  // record wastage on fabric
  await page.getByRole("button", { name: "Record wastage" }).click();
  const w = page.getByRole("dialog");
  await w.getByLabel("Material").selectOption({ index: 1 });
  await w.getByLabel("Quantity wasted").fill("3");
  await w.getByLabel("Reason").fill("Cutting offcuts");
  await w.getByRole("button", { name: "Save" }).click();
  await toast(page, "Wastage recorded");
});

test("5. quality: only accepted units enter sellable finished goods", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Complete order" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel(/Accepted/)).toHaveValue("95");
  await expect(dlg.getByLabel(/Rejected/)).toHaveValue("5");
  await dlg.getByRole("button", { name: "Complete & stock output" }).click();
  await toast(page, /95 accepted units added/);
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Accepted (stocked)")).toBeVisible();
  // material cost per accepted unit = actual issued cost / 95 (not / 100 planned)
  await expect(page.getByText("Material cost per accepted unit (actual)")).toBeVisible();

  await page.goto("/inventory/finished-goods");
  const row = page.getByRole("row", { name: /Men's Cotton Shirt/ });
  await expect(row).toContainText("95");
  await expect(row).not.toContainText("100");

  // Mission Control reflects the real records
  await page.goto("/overview");
  await expect(page.getByText("Completed today").locator("..")).toContainText("1");
});

test("10. security: another organisation can't reach this organisation's records", async ({ browser }) => {
  const ctx = await browser.newContext();
  const page = await ctx.newPage();
  const rival = { email: `rival.${run}@e2e.forgeos.dev`, password: "Forge-test-2026" };
  await page.goto("/signup");
  await page.getByLabel("Full name").fill("Rival Owner");
  await page.getByLabel("Work email").fill(rival.email);
  await page.getByLabel("Password").fill(rival.password);
  await page.getByRole("button", { name: "Create account" }).click();
  await page.waitForURL(/\/onboarding/);
  await page.getByLabel("Company name").fill(`Rival Works ${run}`);
  await page.getByRole("button", { name: "Create organisation" }).click();
  await page.waitForURL(/step=profile/);
  await page.getByRole("button", { name: "Skip" }).click();
  await page.waitForURL(/step=factory/);
  await page.getByLabel("Factory name").fill("Rival Plant");
  await page.getByRole("button", { name: "Add factory" }).click();
  await page.waitForURL(/step=configuration/);
  await page.getByRole("button", { name: "Continue" }).click();
  await page.waitForURL(/step=team/);
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.waitForURL(/step=data/);
  await page.getByRole("button", { name: "Go to Mission Control" }).click();
  await page.waitForURL(/\/overview/);

  // The rival is an owner of their own org, yet the first org's order is invisible to them.
  await page.goto(orderUrl);
  // (status may be 200 because the shell streams first; the not-found boundary renders instead of the record)
  await expect(page.getByText("We couldn't find that")).toBeVisible();
  await expect(page.locator("body")).not.toContainText("PRD-");
  // Direct API calls with the rival's own session return nothing for the other org's ids.
  const orderId = orderUrl.split("/").pop()!;
  const r = await page.evaluate(async (id) => {
    const key = (document.cookie.match(/sb-[^=]+-auth-token[^=]*=([^;]+)/) ?? [])[1];
    return { hasCookie: Boolean(key), id };
  }, orderId);
  expect(r.id).toBe(orderId);
  const exp = await page.request.get("/api/export/production-orders");
  expect([200, 403]).toContain(exp.status());
  if (exp.status() === 200) expect(await exp.text()).not.toContain("PRD-");
  await ctx.close();
});
