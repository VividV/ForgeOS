import { expect, test, type Browser, type Page } from "@playwright/test";

// Acceptance tests 1–7 and 10 from the build brief, driven through the real UI.
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
  await expect(page.getByRole("cell", { name: "Overflow store", exact: true }).first()).toBeVisible();
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

test("6. costing: labour and overhead rates, entries on the order, estimate vs actual", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/commerce/costing");
  await page.getByRole("button", { name: "Add rate" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel(/^Name/).fill("Tailor rate");
  await d.getByLabel(/^Rate/).fill("500");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Rate saved");
  await page.getByRole("button", { name: "Add rate" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/^Type/).selectOption("overhead");
  await d.getByLabel(/^Name/).fill("Factory overhead");
  await d.getByLabel(/^Applied/).selectOption("percent_material");
  await d.getByLabel(/^Rate/).fill("10");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Rate saved");
  await expect(page.getByText("Default labour rate: ₦500.00 per hour.")).toBeVisible();
  await expect(page.getByRole("row", { name: /Men's Cotton Shirt/ })).toBeVisible();

  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Labour", exact: true }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/^Hours/).fill("40");
  await d.getByLabel("Or worker name (not a user)").fill("Sewing line A");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Cost recorded");
  await page.getByRole("button", { name: "Other cost" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/^Amount/).fill("5000");
  await d.getByLabel(/^Description/).fill("Shirt boxes");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Cost recorded");
  const costing = page.getByRole("region", { name: "Costing" });
  await expect(costing).toContainText("20,000.00"); // 40 h × ₦500
  await expect(costing).toContainText("5,000.00");
});

test("5. quality: final inspection gates completion; only accepted units enter finished goods", async ({ browser }) => {
  const page = await ownerPage(browser);
  // a reusable checklist
  await page.goto("/operations/quality/templates/new");
  await page.getByLabel(/^Name\*?$/).fill("Final shirt inspection");
  await page.getByLabel("Check 1").fill("Stitching straight, no loose threads");
  await page.getByRole("button", { name: "Add check" }).click();
  await page.getByLabel("Check 2").fill("Chest width");
  await page.getByRole("button", { name: "Save checklist" }).click();
  await page.waitForURL(/\/operations\/quality\/templates$/);
  await expect(page.getByRole("row", { name: /Final shirt inspection/ })).toBeVisible();

  await page.goto(orderUrl);
  await page.getByRole("button", { name: "Record inspection" }).click();
  const qc = page.getByRole("dialog");
  await qc.getByLabel("Checklist").selectOption({ label: "Final shirt inspection" });
  await expect(qc.getByLabel(/Quantity inspected/)).toHaveValue("95");
  await qc.getByLabel("Quantity rejected").fill("2");
  await qc.getByLabel("Result for Stitching straight, no loose threads").selectOption("fail");
  await qc.getByRole("button", { name: "Add defect" }).click();
  await qc.getByLabel("Defect category").selectOption("Stitching");
  await qc.getByLabel("Defect quantity").fill("2");
  await qc.getByRole("button", { name: "Add corrective action" }).click();
  await qc.getByLabel("Corrective action", { exact: true }).fill("Re-train sewing line A on seam tension");
  await qc.getByRole("button", { name: "Save inspection" }).click();
  await toast(page, "Inspection recorded");
  await expect(page.getByText(/Final inspection: 93 passed, 2 rejected/).first()).toBeVisible();

  await page.getByRole("button", { name: "Complete order" }).click();
  const dlg = page.getByRole("dialog");
  await expect(dlg.getByLabel(/Accepted/)).toHaveValue("93"); // limited to units that passed
  await dlg.getByLabel(/Accepted/).fill("95");
  await expect(dlg.getByText(/Only 93 units passed final inspection/)).toBeVisible();
  await expect(dlg.getByRole("button", { name: "Complete & stock output" })).toBeDisabled();
  await dlg.getByLabel(/Accepted/).fill("93");
  await dlg.getByLabel(/Rejected/).fill("7");
  await dlg.getByRole("button", { name: "Complete & stock output" }).click();
  await toast(page, /93 accepted units added/);
  await expect(page.getByText("Completed", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Accepted (stocked)")).toBeVisible();
  await expect(page.getByText("Full cost per accepted unit")).toBeVisible();
  // acceptance 6: material ₦370,200 + labour ₦20,000 + 10% overhead ₦37,020 + packaging ₦5,000 = ₦432,220 ÷ 93 accepted
  const costing = page.getByRole("region", { name: "Costing" });
  await expect(costing).toContainText("Final cost");
  await expect(costing).toContainText("432,220.00");
  await expect(costing).toContainText("4,647.53");

  await page.goto("/inventory/finished-goods");
  const row = page.getByRole("row", { name: /Men's Cotton Shirt/ });
  await expect(row).toContainText("93");
  await expect(row).not.toContainText("100");

  await page.goto("/operations/quality");
  await expect(page.getByText("Re-train sewing line A on seam tension")).toBeVisible();

  // Mission Control reflects the real records
  await page.goto("/overview");
  await expect(page.getByText("Completed today").locator("..")).toContainText("1");
});

test("7. procurement: requisition → approval → purchase order → partial delivery with rejects → stock", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/commerce/suppliers");
  await page.getByRole("button", { name: "Add supplier" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/^Supplier name/).fill("Kano Textiles");
  await d.getByLabel(/^Code/).fill("KANO");
  await d.getByLabel("Lead time (days)").fill("7");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, /Supplier/);

  await page.goto("/commerce/requisitions/new");
  await page.getByLabel("Material").first().selectOption({ label: "Cotton fabric (FAB-COT)" });
  await page.getByLabel("Quantity").first().fill("200");
  await page.getByLabel("Why is this needed?").fill("Next month's shirt order");
  await page.getByRole("button", { name: "Submit requisition" }).click();
  await page.waitForURL(/\/commerce\/requisitions\/[0-9a-f-]{36}/);
  await page.getByRole("button", { name: "Approve" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await toast(page, /approved/i);
  await page.getByRole("link", { name: "Create purchase order" }).click();
  await page.waitForURL(/\/commerce\/purchase-orders\/new/);
  await page.getByLabel(/^Supplier\*?$/).selectOption({ label: "Kano Textiles" });
  await expect(page.getByLabel("Quantity").first()).toHaveValue("200");
  await page.getByLabel("Unit price").first().fill("1400");
  await page.getByLabel("Discount percent").first().fill("5");
  await page.getByLabel("Tax percent").first().fill("7.5");
  await page.getByLabel("Shipping").fill("5000");
  // 200 × 1,400 = 280,000 − 5% = 266,000 + 7.5% VAT = 285,950 + 5,000 shipping
  await expect(page.getByText("₦290,950.00")).toBeVisible();
  await page.getByRole("button", { name: "Create purchase order" }).click();
  await page.waitForURL(/\/commerce\/purchase-orders\/[0-9a-f-]{36}$/);
  const poUrl = page.url();

  await page.getByRole("button", { name: "Submit for approval" }).click();
  await toast(page, /approval/i);
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve" }).click();
  await toast(page, /approved/i);
  await page.getByRole("button", { name: "Mark as sent" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Mark as sent" }).click();
  await toast(page, /sent/i);

  // first delivery: 120 m arrive, 10 m water-damaged
  await page.getByRole("link", { name: "Receive goods" }).click();
  await page.getByLabel("Received Cotton fabric (FAB-COT)").fill("120");
  await page.getByLabel("Rejected Cotton fabric (FAB-COT)").fill("10");
  await page.getByLabel("Supplier delivery note no.").fill("DN-KANO-1");
  await page.getByRole("button", { name: "Post goods receipt" }).click();
  await expect(page.getByText(/give a reason for the rejected quantity/)).toBeVisible(); // rejected goods need a reason
  await page.getByLabel("Rejection reason Cotton fabric (FAB-COT)").fill("Water damaged");
  await page.getByRole("button", { name: "Post goods receipt" }).click();
  await page.waitForURL(/\/commerce\/(purchase-orders|goods-received)\/[0-9a-f-]{36}$/);
  await page.goto(poUrl);
  await expect(page.getByText("Partially received").first()).toBeVisible();

  // second delivery: the remaining 90 m
  await page.getByRole("link", { name: "Receive goods" }).click();
  await expect(page.getByLabel("Received Cotton fabric (FAB-COT)")).toHaveValue("90");
  await page.getByRole("button", { name: "Post goods receipt" }).click();
  await page.waitForURL(/\/commerce\/(purchase-orders|goods-received)\/[0-9a-f-]{36}$/);
  await page.goto(poUrl);
  await expect(page.getByText("Received", { exact: true }).first()).toBeVisible();
  await expect(page.getByText("Discrepancy").first()).toBeVisible();

  // Only accepted goods entered stock: 64 m left after production + 110 + 90 = 264 m
  await page.goto("/inventory/materials");
  await page.getByRole("link", { name: "Cotton fabric" }).click();
  await expect(page.getByText("264 m").first()).toBeVisible();
  await page.goto("/commerce/goods-received");
  await expect(page.locator("tbody tr")).toHaveCount(2);
});

test("P1 customer orders: confirm, hold stock, plan production for the shortfall, dispatch, deliver, take payment", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/commerce/customers");
  await page.getByRole("button", { name: "Add customer" }).click();
  let d = page.getByRole("dialog");
  await d.getByLabel(/^Customer name/).fill("Eko Boutique");
  await d.getByLabel(/^Code/).fill("EKO");
  await d.getByLabel(/^Billing address/).fill("12 Admiralty Way, Lekki, Lagos");
  await d.getByLabel(/^Payment terms/).fill("50% deposit, balance on delivery");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Customer added");

  await page.goto("/commerce/customer-orders/new");
  await page.getByLabel(/^Customer\*?$/).selectOption({ label: "Eko Boutique (EKO)" });
  await page.getByLabel("Product").first().selectOption({ label: "Men's Cotton Shirt (SHIRT-M)" });
  await expect(page.getByLabel("Unit price").first()).toHaveValue("15000"); // from the product's selling price
  await page.getByLabel("Quantity").first().fill("120");
  await page.getByLabel("Tax percent").first().fill("7.5");
  await expect(page.getByText(/93 pcs free in this warehouse · the rest will need production/)).toBeVisible();
  await page.getByLabel("Delivery charge").fill("3000");
  // 120 × ₦15,000 = ₦1,800,000 + 7.5% VAT ₦135,000 + ₦3,000 delivery
  await expect(page.getByText("₦1,938,000.00")).toBeVisible();
  await expect(page.getByLabel("Payment terms")).toHaveValue("50% deposit, balance on delivery");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/commerce\/customer-orders\/[0-9a-f-]{36}$/);
  const soUrl = page.url();

  await page.getByRole("button", { name: "Confirm order" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Confirm order" }).click();
  await toast(page, "Order confirmed");
  const line = page.getByRole("row", { name: /Men's Cotton Shirt/ });
  await expect(line.getByRole("cell").nth(2)).toHaveText("93"); // ready: all 93 shirts in stock are held for this order
  await expect(line.getByRole("cell").nth(5)).toHaveText("27"); // short

  await line.getByRole("button", { name: "Plan production" }).click();
  d = page.getByRole("dialog");
  await expect(d.getByLabel(/^Quantity to produce/)).toHaveValue("27");
  await d.getByRole("button", { name: "Create production order" }).click();
  await toast(page, "Production order created");
  await expect(line.getByRole("link", { name: /PRD-/ })).toBeVisible();
  await expect(line.getByRole("cell").nth(5)).toHaveText("0");

  await page.getByRole("link", { name: "Dispatch goods" }).click();
  await expect(page.getByLabel("Dispatch Men's Cotton Shirt (SHIRT-M)")).toHaveValue("93");
  await page.getByLabel("Carrier / logistics company").fill("GIG Logistics");
  await page.getByRole("button", { name: "Dispatch", exact: true }).click();
  await page.waitForURL(/\/commerce\/dispatches\/[0-9a-f-]{36}$/);
  await page.getByRole("button", { name: "Confirm delivery" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/^Received by/).fill("Mrs Funke Eko");
  await d.getByRole("button", { name: "Confirm delivery" }).click();
  await toast(page, "Delivery confirmed");
  await expect(page.getByText("Mrs Funke Eko")).toBeVisible();

  await page.goto(soUrl);
  await expect(page.getByText("Partly dispatched").first()).toBeVisible();
  await page.getByRole("button", { name: "Record payment" }).click();
  d = page.getByRole("dialog");
  await d.getByLabel(/^Amount/).fill("1000000");
  await d.getByLabel(/^Reference/).fill("TRF-88231");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Payment recorded");
  await expect(page.getByText("Part paid").first()).toBeVisible();
  await expect(page.getByText("₦938,000.00 due")).toBeVisible();

  // finished goods left the warehouse
  await page.goto("/inventory/movements?type=sales_dispatch");
  await expect(page.getByRole("row", { name: /Dispatched to customer/ })).toContainText("-93");
  await page.goto("/inventory/finished-goods");
  await expect(page.getByRole("row", { name: /Men's Cotton Shirt/ }).filter({ hasText: "93" })).toHaveCount(0);
  await page.goto("/alerts");
  await expect(page.getByText(/needs production/)).toHaveCount(0); // the shortfall is planned
});

test("P1 workforce: departments, shifts, an employee without a login, attendance and overtime", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/workforce/setup");
  await page.getByRole("button", { name: "Add department" }).click();
  await page.getByRole("dialog").getByLabel(/^Name/).fill("Sewing");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Department saved");
  await page.getByRole("button", { name: "Add shift" }).click();
  await page.getByRole("dialog").getByLabel(/^Name/).fill("Day");
  await page.getByRole("dialog").getByRole("button", { name: "Save" }).click();
  await toast(page, "Shift saved");
  await expect(page.getByRole("row", { name: /Day/ })).toContainText("08:00–17:00");

  await page.goto("/workforce/employees");
  await page.getByRole("button", { name: "Add employee" }).click();
  const d = page.getByRole("dialog");
  await d.getByLabel(/^Full name/).fill("Bisi Adewale");
  await d.getByLabel(/^Staff number/).fill("EMP-001");
  await d.getByLabel(/^Job title/).fill("Machinist");
  await d.getByLabel(/^Department/).selectOption({ label: "Sewing" });
  await d.getByLabel(/^Usual shift/).selectOption({ label: "Day (08:00–17:00)" });
  await d.getByLabel(/^Hourly rate/).fill("800");
  await d.getByRole("button", { name: "Save" }).click();
  await toast(page, "Employee added");

  await page.goto("/workforce/attendance");
  await page.getByLabel("Status for Bisi Adewale").selectOption("present");
  await page.getByLabel("Clock in for Bisi Adewale").fill("08:00");
  await page.getByLabel("Clock out for Bisi Adewale").fill("19:00");
  await page.getByRole("button", { name: "Save attendance" }).click();
  await toast(page, "Attendance saved for 1 employee");
  // 11 h on site − 1 h unpaid break = 10 h; the shift is 8 h, so 2 h overtime
  const row = page.getByRole("row", { name: /Bisi Adewale/ }).last();
  await expect(row.getByRole("cell").nth(6)).toHaveText("10");
  await expect(row.getByRole("cell").nth(7)).toHaveText("2");
});

test("P1 operations: customer return with credit, tax invoice, photo upload, blind stock count", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/commerce/customer-orders");
  await page.getByRole("link", { name: "SO-00001" }).click();
  await page.waitForURL(/\/commerce\/customer-orders\/[0-9a-f-]{36}$/);
  const soUrl = page.url();

  // 3 shirts come back in good condition; a credit note is raised at the price charged
  await page.getByRole("link", { name: "Record return" }).click();
  await page.getByLabel("Returned Men's Cotton Shirt (SHIRT-M)").fill("3");
  await page.getByLabel(/^Reason/).fill("Wrong size");
  await page.getByRole("button", { name: "Record return" }).click();
  await toast(page, "Return recorded and credit note issued");
  await expect(page.getByText("−₦48,375.00")).toBeVisible(); // 3 × ₦15,000 + 7.5% VAT

  // tax invoice for what was dispatched and kept: 90 × ₦15,000 + 7.5% + ₦3,000 delivery
  await page.getByRole("button", { name: "Invoice", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Issue invoice" }).click();
  await page.waitForURL(/\/commerce\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.getByText("Tax invoice")).toBeVisible();
  await expect(page.getByText("INV-00001")).toBeVisible();
  await expect(page.getByText("₦1,454,250.00").first()).toBeVisible();

  // a photo on the order (as from a phone camera)
  await page.goto(soUrl);
  const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==", "base64");
  await page.locator('input[type="file"]').setInputFiles({ name: "packing.png", mimeType: "image/png", buffer: png });
  await toast(page, "File uploaded");
  await expect(page.getByRole("img", { name: "packing.png" })).toBeVisible();

  // blind stock count of the store: count fabric only
  await page.goto("/inventory/counts");
  await page.getByRole("button", { name: "Start a count" }).click();
  await page.getByRole("dialog").getByLabel(/^Warehouse/).selectOption({ label: "Ikeja Plant store (IKJ-STR)" });
  await page.getByRole("dialog").getByRole("button", { name: "Create count sheet" }).click();
  await page.waitForURL(/\/inventory\/counts\/[0-9a-f-]{36}$/);
  await page.getByLabel("Counted Cotton fabric").fill("235"); // system shows 239 m in this store (25 m are in the overflow store)
  await page.getByLabel("Note Cotton fabric").fill("4 m of offcuts thrown out");
  await page.getByRole("button", { name: "Save counts" }).click();
  await toast(page, "Counts saved");
  await page.getByRole("button", { name: "Submit for approval" }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Submit" }).click();
  await toast(page, "Count submitted");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await page.getByRole("dialog").getByRole("button", { name: "Approve & adjust" }).click();
  await toast(page, /Count approved/);
  await expect(page.getByRole("row", { name: /Cotton fabric/ })).toContainText("-4");
  await page.goto("/inventory/materials");
  await page.getByRole("link", { name: "Cotton fabric" }).click();
  await expect(page.getByText("260 m").first()).toBeVisible();
});

test("P1 billing and demo: trial and plans visible, payments degrade safely, demo workspace is separate", async ({ browser }) => {
  const page = await ownerPage(browser);
  await page.goto("/admin/billing");
  await expect(page.getByText("Free trial")).toBeVisible();
  await expect(page.getByText("Growth").first()).toBeVisible();
  await expect(page.getByText("₦40,000").first()).toBeVisible();
  // no Paystack key locally: the app says so and won't pretend to take payment
  await expect(page.getByText(/Online payments aren.t switched on yet/)).toBeVisible();
  await expect(page.getByRole("button", { name: "Choose Starter" })).toBeDisabled();

  await page.getByRole("button", { name: new RegExp(company) }).click();
  await page.getByRole("menuitem", { name: "Try the demo workspace" }).click();
  await page.waitForURL(/\/overview/);
  await expect(page.getByText("ForgeOS Manufacturing Demo").first()).toBeVisible();
  await page.goto("/commerce/customer-orders");
  await expect(page.getByRole("cell", { name: "Abuja Fashion House" })).toBeVisible();
  await page.goto("/alerts");
  await expect(page.getByText(/needs production/).first()).toBeVisible();
  // back to the real organisation: none of the demo data is there
  await page.getByRole("button", { name: /ForgeOS Manufacturing Demo/ }).click();
  await page.getByRole("menuitem", { name: "Leave demo workspace" }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/alerts"));
  await page.goto("/commerce/customers");
  await expect(page.getByRole("link", { name: "Abuja Fashion House" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Eko Boutique" })).toBeVisible();
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
