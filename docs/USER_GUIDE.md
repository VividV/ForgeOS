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
- Mistakes are fixed with **Reverse** on the movement, which leaves a clear trail.

## 7. See how the factory is doing

**Mission Control** shows active and late orders, output, rejection rate, stock value and alerts. **Daily production** shows what happened on any day. **Operational reports** can be exported to CSV or printed to PDF.
