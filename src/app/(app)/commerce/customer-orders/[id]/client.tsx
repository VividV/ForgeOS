"use client";
import { Ban, Check, CreditCard, Factory, FileText, RefreshCw, Undo2, X } from "lucide-react";
import { z } from "zod";
import { allocateCustomerOrder, planProductionForLine, recordPayment, transitionCustomerOrder, voidPayment } from "@/app/actions/sales";
import { issueCreditNote, issueInvoice, voidCreditNote } from "@/app/actions/ops";
import { ActionButton } from "@/components/forms/action-button";
import { FormDialog } from "@/components/forms/form-dialog";

export function OrderActions({ id, status, can }: { id: string; status: string; can: { create: boolean; manage: boolean; allocate: boolean } }) {
  return (
    <>
      {status === "draft" && can.create && (
        <ActionButton variant="primary" action={() => transitionCustomerOrder(id, "confirm")} confirm={{ title: "Confirm this order?", description: "Finished goods in stock are held for it. Lines that are short can then go to production." }} confirmLabel="Confirm order">
          <Check /> Confirm order
        </ActionButton>
      )}
      {["confirmed", "partially_dispatched"].includes(status) && can.allocate && (
        <ActionButton variant="ghost" action={() => allocateCustomerOrder(id)}>
          <RefreshCw /> Re-check stock
        </ActionButton>
      )}
      {["partially_dispatched", "dispatched", "delivered"].includes(status) && can.manage && (
        <ActionButton variant="ghost" action={(n) => transitionCustomerOrder(id, "close", n)} noteLabel="Note (e.g. customer no longer needs the rest)" confirm={{ title: "Close this order?", description: "Nothing more will be dispatched. Stock still held for it is released." }} confirmLabel="Close order">
          <Ban /> Close
        </ActionButton>
      )}
      {["draft", "confirmed"].includes(status) && can.manage && (
        <ActionButton variant="danger-outline" action={(n) => transitionCustomerOrder(id, "cancel", n)} noteLabel="Reason for cancelling" noteRequired confirm={{ title: "Cancel this order?", description: "Stock held for it is released. Production already planned for it continues as stock." }} confirmLabel="Cancel order">
          <X /> Cancel
        </ActionButton>
      )}
    </>
  );
}

export function PlanProduction({ lineId, shortfall, factories, dueDate, name }: { lineId: string; shortfall: number; factories: { value: string; label: string }[]; dueDate: string; name: string }) {
  return (
    <FormDialog
      triggerLabel="Plan production"
      triggerIcon={<Factory />}
      triggerSize="sm"
      title={`Plan production · ${name}`}
      description="Creates a production order for this line, linked to the customer order. When it completes, the finished goods are held for this customer automatically."
      schema={z.object({ factory_id: z.string().min(1, "Choose a factory"), quantity: z.string().min(1, "Enter a quantity") })}
      fields={[
        { name: "factory_id", label: "Factory", type: "select", required: true, options: factories },
        { name: "quantity", label: "Quantity to produce", type: "number", required: true, min: "0", step: "any" },
        { name: "due_date", label: "Due", type: "date" },
        { name: "priority", label: "Priority", type: "select", options: ["low", "normal", "high", "urgent"].map((v) => ({ value: v, label: v[0].toUpperCase() + v.slice(1) })) },
      ]}
      defaultValues={{ factory_id: factories[0]?.value ?? "", quantity: String(+shortfall.toFixed(4)), due_date: dueDate, priority: "normal" }}
      action={(v) => planProductionForLine(lineId, v)}
      submitLabel="Create production order"
    />
  );
}

export function RecordPayment({ orderId, balance }: { orderId: string; balance: number }) {
  return (
    <FormDialog
      triggerLabel="Record payment"
      triggerIcon={<CreditCard />}
      triggerSize="sm"
      title="Record payment"
      description={`Balance due: ${balance.toLocaleString("en-NG", { minimumFractionDigits: 2 })}`}
      schema={z.object({ amount: z.string().min(1, "Enter an amount") })}
      fields={[
        { name: "amount", label: "Amount", type: "number", required: true, min: "0", step: "any" },
        { name: "paid_on", label: "Date", type: "date" },
        {
          name: "method",
          label: "Method",
          type: "select",
          required: true,
          options: [
            { value: "bank_transfer", label: "Bank transfer" },
            { value: "cash", label: "Cash" },
            { value: "pos", label: "POS" },
            { value: "card", label: "Card" },
            { value: "mobile_money", label: "Mobile money" },
            { value: "cheque", label: "Cheque" },
            { value: "other", label: "Other" },
          ],
        },
        { name: "reference", label: "Reference", placeholder: "Transfer reference / receipt no." },
        { name: "notes", label: "Notes", span: 2 },
      ]}
      defaultValues={{ amount: String(+balance.toFixed(2)), method: "bank_transfer" }}
      action={(v) => recordPayment(orderId, v)}
    />
  );
}

export function VoidPayment({ id }: { id: string }) {
  return (
    <ActionButton size="sm" variant="ghost" action={(n) => voidPayment(id, n)} noteLabel="Reason" noteRequired confirm={{ title: "Void this payment?", description: "The payment stays on record, marked void, and the balance is updated." }} confirmLabel="Void payment">
      <Undo2 /> Void
    </ActionButton>
  );
}

export function InvoiceButton({ orderId, hasDispatched }: { orderId: string; hasDispatched: boolean }) {
  return (
    <FormDialog
      triggerLabel="Invoice"
      triggerIcon={<FileText />}
      triggerSize="sm"
      title="Issue tax invoice"
      description="Invoices are numbered in sequence and can't be edited. Mistakes are corrected by voiding and re-issuing."
      schema={z.object({ basis: z.string() })}
      fields={[
        {
          name: "basis",
          label: "Invoice for",
          type: "select",
          options: [
            { value: "dispatched", label: "What has been dispatched (not yet invoiced)" },
            { value: "ordered", label: "The whole order, in advance" },
          ],
        },
        { name: "due_date", label: "Payment due", type: "date" },
        { name: "notes", label: "Notes on the invoice", type: "textarea", span: 2 },
      ]}
      defaultValues={{ basis: hasDispatched ? "dispatched" : "ordered" }}
      action={(v) => issueInvoice(orderId, v)}
      submitLabel="Issue invoice"
    />
  );
}

export function CreditNoteButton({ orderId, max }: { orderId: string; max: number }) {
  return (
    <FormDialog
      triggerLabel="Credit"
      triggerIcon={<Undo2 />}
      triggerSize="sm"
      triggerVariant="ghost"
      title="Issue credit note"
      description={`Reduces what the customer owes (up to ${max.toLocaleString("en-NG", { minimumFractionDigits: 2 })}). For returned goods, use Record return instead and tick 'issue a credit note'.`}
      schema={z.object({ amount: z.string().min(1, "Enter an amount"), reason: z.string().trim().min(2, "Give a reason") })}
      fields={[
        { name: "amount", label: "Amount", type: "number", required: true, min: "0", step: "any" },
        { name: "reason", label: "Reason", required: true, placeholder: "e.g. Discount agreed for late delivery" },
      ]}
      action={(v) => issueCreditNote(orderId, v)}
      submitLabel="Issue credit note"
    />
  );
}

export function VoidCreditNote({ id }: { id: string }) {
  return (
    <ActionButton size="icon-sm" variant="ghost" aria-label="Void credit note" action={(n) => voidCreditNote(id, n)} noteLabel="Reason" noteRequired confirm={{ title: "Void this credit note?" }} confirmLabel="Void">
      <X />
    </ActionButton>
  );
}
