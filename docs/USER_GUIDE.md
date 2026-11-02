# Getting started with ForgeOS

## 1. Set up your organisation (about 10 minutes)

1. **Create your account** with your work email and confirm it from the email we send.
2. **Company**: name, country (Nigerian companies default to naira), contact details.
3. **Manufacturing profile** (optional): what you make and your main challenges.
4. **Factory**: name, short code, capacity, working days and hours. A store is created for it automatically, plus the number of work centres you enter (rename them later). Pick a production-stage template (general, garments, food, furniture); you can change stages any time before your first order.
5. **Configuration**: currency, date format, fiscal year, valuation (weighted average) and whether production orders need approval.
6. **Invite your team** by email and role. If email isn't set up yet, copy the invite link and send it on WhatsApp or SMS.
7. **Initial data**: nothing is added on your behalf. Start by adding a product or importing materials from a spreadsheet.

## 2. Load your materials and stock

- **Raw materials → Import CSV**: download the template, fill it from your spreadsheet (code, name, unit, reorder level, opening quantity and cost), upload, match columns, fix any highlighted rows, then import. Opening quantities are recorded as *opening balances*, not as purchases.
- Or add materials one by one, then use **Receive stock** on the material page.
- Set **reorder levels** so ForgeOS warns you before you run out.

## 3. Define what you make

1. **Products → New product**, then add variants (sizes, colours) if needed.
2. On the product page choose **Create BOM** and add each material with its quantity per unit and expected wastage %. The page shows the estimated material cost per unit.
3. **Approve** the BOM (or submit it for approval). Approved BOMs are locked; make a new version to change them. Orders already created keep the version they used.

## 4. Run production

1. **Production orders → New order**: product, quantity, factory, due date, priority. Required materials are calculated from the BOM.
2. **Approve**: available materials are reserved for the order. If something is short, the order shows *Materials pending* and the store is notified; receive stock and choose **Re-check & reserve**.
3. **Issue** materials to the order when work starts.
4. **Issue job cards** to workers for each step. Print them (with a QR code) or let workers use their phones.
5. Track progress on **Production planning** (board, table or timeline). Record output, defects, wastage and downtime on the order page.
6. When all steps are done the order goes to **quality inspection**. Choose **Complete order** and enter accepted and rejected units. Only accepted units go into finished-goods stock, valued at the actual material cost per accepted unit.

## 5. For workers on the factory floor

Open ForgeOS on your phone (add it to your home screen) → **My job cards** → tap a job → **Start job** → **Record completed** as you go → **Report defect** or **Material short** if needed → **Finish job**. If the network drops, keep working: updates are saved on the phone and sent when you're back online.

## 6. Keep stock accurate

- **Transfer** between stores, **Adjust** after a stock count (enter the counted quantity; ForgeOS calculates the difference), write off damaged or expired stock. Every adjustment needs a reason and is recorded in the audit log.
- Mistakes are fixed with **Reverse** on the movement, which leaves a clear trail. Goods received and goods dispatched are corrected from their purchase or customer order (or with an adjustment), not reversed.

## 7. Buy materials

1. **Purchase requisitions**: anyone allowed can request materials (from **Reorder alerts** or a production order that's short). An approver approves or rejects with a reason.
2. **Purchase orders**: create one from an approved requisition or from scratch, with discounts, VAT and shipping. Submit it for approval (small orders can auto-approve under the threshold in Settings), print it, and mark it sent.
3. **Receive goods** when the delivery arrives: count what came, reject anything damaged with a reason. Only accepted goods go into stock, valued at the price after discount (VAT excluded). Partial deliveries are fine; the order stays open for the rest.

## 8. Check quality and costs

- Build **checklists** under Quality → Checklists, then **Record inspection** on a production order or a delivery. Log defects and corrective actions with an owner and a due date.
- A **final inspection** limits completion: you can't stock more units than passed. Settings can make it mandatory.
- Under **Product costing**, set a labour rate per hour and overheads. On each production order, record labour hours, machine time and other costs (packaging, transport). Finished goods are valued at the full cost per accepted unit, and the order shows estimate vs actual.

## 9. Sell and deliver

1. Add **customers** (delivery address, payment terms, optional credit limit).
2. Create a **customer order**. When you **confirm** it, finished goods in stock are held for that customer.
3. Anything short shows in the **Short** column. **Plan production** creates a linked production order; when it completes, the goods are held for this customer automatically.
4. **Dispatch goods** (print the delivery note), then **Confirm delivery** with the name of the person who received them.
5. **Record payments** (deposits and balances) as they come in. Print a **pro-forma invoice** from the order.

## 10. Manage your people

- Add **employees** under Workforce, even if they never sign in. Set departments, their usual shift and (for managers) an hourly rate.
- Take **attendance** each day: mark everyone present in one click, then adjust. Enter in and out times to capture actual hours; time beyond the shift counts as overtime.
- When recording labour on a production order, pick the employee and their own hourly rate is used.

## 11. See how the factory is doing

**Mission Control** shows active and late orders, output, rejection rate, stock value and alerts. **Daily production** shows what happened on any day. **Operational reports** can be exported to CSV or printed to PDF.

## 12. Count stock, handle returns and invoice

- **Inventory → Stock Counts**: start a count for a warehouse, print the blind sheet (quantities hidden), enter what was counted, submit. A manager approves and the differences are posted as count adjustments.
- **Customer order → Return**: record goods coming back (to stock or written off) and issue a credit note; the customer's balance is reduced.
- **Customer order → Tax invoice**: issue a numbered invoice for what's been dispatched. Add your tax ID, bank details and invoice footer in Settings → Organisation. Upload your logo there too; it appears on printouts.
- Attach photos or PDFs (up to 4 MB) to inspections, receipts, dispatches, orders, counts and job cards.

## 13. Your plan

- Every new organisation gets a 14-day Growth trial. **Admin → Billing** shows your plan, limits and days left, and takes payment through Paystack.
- If a payment lapses you get 7 days' grace; after that the workspace is read-only until you pay. Nothing is deleted.
- Want to explore first? Use **Try the demo workspace** from the organisation menu. It's a separate sample company; leave it from the same menu.

## 14. Insights, the AI copilot and WhatsApp

- **Insights & Forecasts**: demand for each product over the next weeks, materials to order (through your BOMs, after stock and open purchase orders), where work is piling up, and unusual activity (reject spikes, material over-use, big adjustments, output drops, late suppliers).
- **AI Copilot**: ask questions in plain language ("what's late this week?", "which materials will run out?"). It sees only what you're allowed to see. When it suggests a requisition or production order, it shows you a card; nothing is created until you press Confirm.
- **WhatsApp** (Account → WhatsApp): add your number to receive warnings and a daily summary. Reply `HELP`, `STATUS PRD-00012`, or `JC-xxxx 12 1` (12 good, 1 rejected) to update a job card.

