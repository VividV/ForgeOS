# Data dictionary

Generated from the database by `scripts/gen-schema-docs.mjs`. Do not edit by hand.

All primary keys are UUIDs. Every organisation-owned table carries `organization_id` and has Row Level Security enabled (✔ below). Ledger tables (`inventory_transactions`, `audit_logs`, `production_logs`, `production_outputs`, `stock_adjustments`, `production_order_status_history`) are append-only: updates and deletes are rejected by trigger.

| Table | Columns | RLS |
|---|---|---|
| [`ai_usage`](#ai_usage) | 9 | ✔ |
| [`attachments`](#attachments) | 11 | ✔ |
| [`attendance_records`](#attendance_records) | 13 | ✔ |
| [`audit_logs`](#audit_logs) | 12 | ✔ |
| [`billing_events`](#billing_events) | 5 | ✔ |
| [`billing_payments`](#billing_payments) | 12 | ✔ |
| [`bills_of_materials`](#bills_of_materials) | 19 | ✔ |
| [`bom_items`](#bom_items) | 9 | ✔ |
| [`corrective_actions`](#corrective_actions) | 14 | ✔ |
| [`cost_rates`](#cost_rates) | 12 | ✔ |
| [`credit_notes`](#credit_notes) | 14 | ✔ |
| [`customer_payments`](#customer_payments) | 14 | ✔ |
| [`customers`](#customers) | 20 | ✔ |
| [`departments`](#departments) | 9 | ✔ |
| [`dispatch_items`](#dispatch_items) | 8 | ✔ |
| [`dispatches`](#dispatches) | 19 | ✔ |
| [`document_sequences`](#document_sequences) | 4 | ✔ |
| [`downtime_logs`](#downtime_logs) | 10 | ✔ |
| [`employee_pay`](#employee_pay) | 6 | ✔ |
| [`employees`](#employees) | 20 | ✔ |
| [`factories`](#factories) | 19 | ✔ |
| [`goods_receipt_items`](#goods_receipt_items) | 12 | ✔ |
| [`goods_receipts`](#goods_receipts) | 10 | ✔ |
| [`inventory_balances`](#inventory_balances) | 8 | ✔ |
| [`inventory_transactions`](#inventory_transactions) | 22 | ✔ |
| [`invitations`](#invitations) | 13 | ✔ |
| [`invoice_items`](#invoice_items) | 10 | ✔ |
| [`invoices`](#invoices) | 20 | ✔ |
| [`job_cards`](#job_cards) | 18 | ✔ |
| [`labour_cost_entries`](#labour_cost_entries) | 16 | ✔ |
| [`material_categories`](#material_categories) | 4 | ✔ |
| [`material_reservations`](#material_reservations) | 11 | ✔ |
| [`materials`](#materials) | 25 | ✔ |
| [`member_roles`](#member_roles) | 5 | ✔ |
| [`notification_preferences`](#notification_preferences) | 5 | ✔ |
| [`notifications`](#notifications) | 14 | ✔ |
| [`organization_members`](#organization_members) | 11 | ✔ |
| [`organization_settings`](#organization_settings) | 14 | ✔ |
| [`organizations`](#organizations) | 28 | ✔ |
| [`overhead_cost_entries`](#overhead_cost_entries) | 10 | ✔ |
| [`permissions`](#permissions) | 4 | ✔ |
| [`plans`](#plans) | 9 | ✔ |
| [`product_categories`](#product_categories) | 5 | ✔ |
| [`product_cost_snapshots`](#product_cost_snapshots) | 13 | ✔ |
| [`product_variants`](#product_variants) | 15 | ✔ |
| [`production_cost_snapshots`](#production_cost_snapshots) | 18 | ✔ |
| [`production_logs`](#production_logs) | 14 | ✔ |
| [`production_operations`](#production_operations) | 19 | ✔ |
| [`production_order_materials`](#production_order_materials) | 16 | ✔ |
| [`production_order_status_history`](#production_order_status_history) | 8 | ✔ |
| [`production_orders`](#production_orders) | 33 | ✔ |
| [`production_outputs`](#production_outputs) | 11 | ✔ |
| [`production_scrap`](#production_scrap) | 10 | ✔ |
| [`production_stages`](#production_stages) | 8 | ✔ |
| [`products`](#products) | 17 | ✔ |
| [`profiles`](#profiles) | 10 | ✔ |
| [`purchase_order_items`](#purchase_order_items) | 13 | ✔ |
| [`purchase_orders`](#purchase_orders) | 25 | ✔ |
| [`purchase_requisition_items`](#purchase_requisition_items) | 7 | ✔ |
| [`purchase_requisitions`](#purchase_requisitions) | 15 | ✔ |
| [`quality_check_items`](#quality_check_items) | 8 | ✔ |
| [`quality_checks`](#quality_checks) | 20 | ✔ |
| [`quality_defects`](#quality_defects) | 8 | ✔ |
| [`quality_template_items`](#quality_template_items) | 8 | ✔ |
| [`quality_templates`](#quality_templates) | 12 | ✔ |
| [`role_permissions`](#role_permissions) | 4 | ✔ |
| [`roles`](#roles) | 10 | ✔ |
| [`routing_steps`](#routing_steps) | 11 | ✔ |
| [`routing_templates`](#routing_templates) | 11 | ✔ |
| [`sales_allocations`](#sales_allocations) | 10 | ✔ |
| [`sales_order_items`](#sales_order_items) | 15 | ✔ |
| [`sales_orders`](#sales_orders) | 28 | ✔ |
| [`sales_return_items`](#sales_return_items) | 9 | ✔ |
| [`sales_returns`](#sales_returns) | 9 | ✔ |
| [`shifts`](#shifts) | 11 | ✔ |
| [`stock_adjustments`](#stock_adjustments) | 8 | ✔ |
| [`stock_count_lines`](#stock_count_lines) | 12 | ✔ |
| [`stock_counts`](#stock_counts) | 15 | ✔ |
| [`stock_items`](#stock_items) | 8 | ✔ |
| [`subscriptions`](#subscriptions) | 11 | ✔ |
| [`supplier_contacts`](#supplier_contacts) | 9 | ✔ |
| [`suppliers`](#suppliers) | 17 | ✔ |
| [`units_of_measure`](#units_of_measure) | 8 | ✔ |
| [`warehouse_locations`](#warehouse_locations) | 7 | ✔ |
| [`warehouses`](#warehouses) | 12 | ✔ |
| [`whatsapp_contacts`](#whatsapp_contacts) | 6 | ✔ |
| [`whatsapp_outbox`](#whatsapp_outbox) | 12 | ✔ |
| [`work_centres`](#work_centres) | 14 | ✔ |

## ai_usage

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint |  |  |
| `organization_id` | uuid |  |  |
| `user_id` | uuid | yes | `auth.uid()` |
| `model` | text | yes |  |
| `input_tokens` | integer |  | `0` |
| `output_tokens` | integer |  | `0` |
| `tool_calls` | integer |  | `0` |
| `ok` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

## attachments

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `entity_type` | text |  |  |
| `entity_id` | uuid |  |  |
| `file_name` | text |  |  |
| `content_type` | text |  |  |
| `size_bytes` | integer |  |  |
| `data` | bytea |  |  |
| `caption` | text | yes |  |
| `uploaded_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## attendance_records

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `employee_id` | uuid |  |  |
| `work_date` | date |  |  |
| `shift_id` | uuid | yes |  |
| `status` | text |  |  |
| `clock_in` | time without time zone | yes |  |
| `clock_out` | time without time zone | yes |  |
| `hours_worked` | numeric |  | `0` |
| `overtime_hours` | numeric |  | `0` |
| `notes` | text | yes |  |
| `recorded_by` | uuid | yes | `auth.uid()` |
| `recorded_at` | timestamp with time zone |  | `now()` |

## audit_logs

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid | yes |  |
| `actor_id` | uuid | yes |  |
| `action` | text |  |  |
| `entity_type` | text |  |  |
| `entity_id` | uuid | yes |  |
| `summary` | text | yes |  |
| `old_values` | jsonb | yes |  |
| `new_values` | jsonb | yes |  |
| `source` | text |  | `'app'::text` |
| `request_id` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## billing_events

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | text |  |  |
| `organization_id` | uuid | yes |  |
| `event` | text |  |  |
| `payload` | jsonb |  |  |
| `received_at` | timestamp with time zone |  | `now()` |

## billing_payments

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `reference` | text |  |  |
| `plan_key` | text | yes |  |
| `amount` | numeric |  |  |
| `currency` | text |  | `'NGN'::text` |
| `status` | text |  |  |
| `paid_at` | timestamp with time zone | yes |  |
| `period_end` | timestamp with time zone | yes |  |
| `provider` | text |  | `'paystack'::text` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## bills_of_materials

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `product_id` | uuid |  |  |
| `variant_id` | uuid | yes |  |
| `version` | integer |  |  |
| `name` | text | yes |  |
| `status` | text |  | `'draft'::text` |
| `output_quantity` | numeric |  | `1` |
| `effective_from` | date | yes |  |
| `notes` | text | yes |  |
| `based_on_id` | uuid | yes |  |
| `submitted_by` | uuid | yes |  |
| `submitted_at` | timestamp with time zone | yes |  |
| `approved_by` | uuid | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## bom_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `bom_id` | uuid |  |  |
| `line_no` | integer |  |  |
| `stock_item_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `wastage_pct` | numeric |  | `0` |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## corrective_actions

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `quality_check_id` | uuid |  |  |
| `defect_id` | uuid | yes |  |
| `description` | text |  |  |
| `assigned_to` | uuid | yes |  |
| `due_date` | date | yes |  |
| `status` | text |  | `'open'::text` |
| `resolution` | text | yes |  |
| `completed_by` | uuid | yes |  |
| `completed_at` | timestamp with time zone | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

## cost_rates

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `kind` | text |  |  |
| `name` | text |  |  |
| `basis` | text |  |  |
| `rate` | numeric |  |  |
| `is_default` | boolean |  | `true` |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## credit_notes

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `sales_order_id` | uuid |  |  |
| `customer_id` | uuid |  |  |
| `sales_return_id` | uuid | yes |  |
| `amount` | numeric |  |  |
| `reason` | text |  |  |
| `status` | text |  | `'issued'::text` |
| `issued_by` | uuid | yes | `auth.uid()` |
| `issued_at` | timestamp with time zone |  | `now()` |
| `voided_at` | timestamp with time zone | yes |  |
| `voided_by` | uuid | yes |  |
| `void_reason` | text | yes |  |

## customer_payments

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `sales_order_id` | uuid |  |  |
| `customer_id` | uuid |  |  |
| `amount` | numeric |  |  |
| `paid_on` | date |  | `CURRENT_DATE` |
| `method` | text |  | `'bank_transfer'::text` |
| `reference` | text | yes |  |
| `notes` | text | yes |  |
| `recorded_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `voided_at` | timestamp with time zone | yes |  |
| `voided_by` | uuid | yes |  |
| `void_reason` | text | yes |  |

## customers

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `customer_type` | text |  | `'business'::text` |
| `contact_name` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `billing_address` | text | yes |  |
| `shipping_address` | text | yes |  |
| `tax_id` | text | yes |  |
| `payment_terms` | text | yes |  |
| `credit_limit` | numeric | yes |  |
| `notes` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## departments

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `factory_id` | uuid | yes |  |
| `description` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## dispatch_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `dispatch_id` | uuid |  |  |
| `sales_order_item_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `unit_cost` | numeric |  | `0` |
| `inventory_transaction_id` | uuid | yes |  |

## dispatches

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `sales_order_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `dispatched_at` | timestamp with time zone |  | `now()` |
| `carrier` | text | yes |  |
| `vehicle` | text | yes |  |
| `driver_name` | text | yes |  |
| `tracking_reference` | text | yes |  |
| `notes` | text | yes |  |
| `status` | text |  | `'dispatched'::text` |
| `delivered_at` | timestamp with time zone | yes |  |
| `received_by` | text | yes |  |
| `delivery_notes` | text | yes |  |
| `idempotency_key` | text | yes |  |
| `dispatched_by` | uuid | yes | `auth.uid()` |
| `delivery_confirmed_by` | uuid | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## document_sequences

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `doc_type` | text |  |  |
| `prefix` | text |  |  |
| `next_value` | bigint |  | `1` |

## downtime_logs

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid | yes |  |
| `operation_id` | uuid | yes |  |
| `work_centre_id` | uuid | yes |  |
| `reason` | text |  |  |
| `minutes` | integer |  |  |
| `started_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## employee_pay

| Column | Type | Null | Default |
|---|---|---|---|
| `employee_id` | uuid |  |  |
| `organization_id` | uuid |  |  |
| `hourly_rate` | numeric | yes |  |
| `overtime_multiplier` | numeric |  | `1.5` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes | `auth.uid()` |

## employees

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `full_name` | text |  |  |
| `department_id` | uuid | yes |  |
| `factory_id` | uuid | yes |  |
| `default_shift_id` | uuid | yes |  |
| `job_title` | text | yes |  |
| `phone` | text | yes |  |
| `email` | text | yes |  |
| `employment_type` | text |  | `'full_time'::text` |
| `skills` | ARRAY |  | `'{}'::text[]` |
| `user_id` | uuid | yes |  |
| `start_date` | date | yes |  |
| `status` | text |  | `'active'::text` |
| `notes` | text | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## factories

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `code` | text |  |  |
| `address` | text | yes |  |
| `capacity_per_day` | numeric | yes |  |
| `capacity_unit` | text | yes |  |
| `planned_work_centres` | integer | yes |  |
| `opens_at` | time without time zone | yes |  |
| `closes_at` | time without time zone | yes |  |
| `working_days` | ARRAY |  | `'{1,2,3,4,5,6}'::smallint[]` |
| `timezone` | text |  | `'Africa/Lagos'::text` |
| `is_active` | boolean |  | `true` |
| `default_warehouse_id` | uuid | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## goods_receipt_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `goods_receipt_id` | uuid |  |  |
| `purchase_order_item_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `quantity_received` | numeric |  |  |
| `quantity_accepted` | numeric |  |  |
| `quantity_rejected` | numeric |  | `0` |
| `unit_cost` | numeric |  | `0` |
| `rejection_reason` | text | yes |  |
| `discrepancy_note` | text | yes |  |
| `inventory_transaction_id` | uuid | yes |  |

## goods_receipts

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `purchase_order_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `received_at` | timestamp with time zone |  | `now()` |
| `delivery_note` | text | yes |  |
| `notes` | text | yes |  |
| `received_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## inventory_balances

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `on_hand` | numeric |  | `0` |
| `reserved` | numeric |  | `0` |
| `available` | numeric | yes |  |
| `last_movement_at` | timestamp with time zone | yes |  |
| `updated_at` | timestamp with time zone |  | `now()` |

## inventory_transactions

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `txn_type` | text |  |  |
| `quantity` | numeric |  |  |
| `unit_cost` | numeric |  | `0` |
| `total_cost` | numeric |  |  |
| `balance_after` | numeric |  |  |
| `reference_type` | text | yes |  |
| `reference_id` | uuid | yes |  |
| `production_order_id` | uuid | yes |  |
| `production_operation_id` | uuid | yes |  |
| `transfer_group_id` | uuid | yes |  |
| `reversal_of_id` | uuid | yes |  |
| `reason` | text | yes |  |
| `notes` | text | yes |  |
| `negative_override` | boolean |  | `false` |
| `idempotency_key` | text | yes |  |
| `occurred_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## invitations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `email` | text |  |  |
| `role_id` | uuid |  |  |
| `token_hash` | text |  |  |
| `status` | text |  | `'pending'::text` |
| `expires_at` | timestamp with time zone |  | `(now() + '14 days'::interval)` |
| `invited_by` | uuid | yes |  |
| `accepted_by` | uuid | yes |  |
| `accepted_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## invoice_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `invoice_id` | uuid |  |  |
| `sales_order_item_id` | uuid |  |  |
| `description` | text |  |  |
| `quantity` | numeric |  |  |
| `unit_price` | numeric |  |  |
| `discount_pct` | numeric |  |  |
| `tax_pct` | numeric |  |  |
| `line_total` | numeric | yes |  |

## invoices

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `sales_order_id` | uuid |  |  |
| `customer_id` | uuid |  |  |
| `issue_date` | date |  | `CURRENT_DATE` |
| `due_date` | date | yes |  |
| `status` | text |  | `'issued'::text` |
| `currency` | text |  |  |
| `subtotal` | numeric |  |  |
| `discount_total` | numeric |  |  |
| `tax_total` | numeric |  |  |
| `shipping_charge` | numeric |  | `0` |
| `total` | numeric |  |  |
| `notes` | text | yes |  |
| `issued_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `voided_at` | timestamp with time zone | yes |  |
| `voided_by` | uuid | yes |  |
| `void_reason` | text | yes |  |

## job_cards

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `production_order_id` | uuid |  |  |
| `operation_id` | uuid |  |  |
| `assigned_user_id` | uuid | yes |  |
| `assigned_team` | text | yes |  |
| `target_quantity` | numeric |  |  |
| `quantity_completed` | numeric |  | `0` |
| `quantity_rejected` | numeric |  | `0` |
| `status` | text |  | `'open'::text` |
| `instructions` | text | yes |  |
| `issued_by` | uuid | yes | `auth.uid()` |
| `issued_at` | timestamp with time zone |  | `now()` |
| `started_at` | timestamp with time zone | yes |  |
| `completed_at` | timestamp with time zone | yes |  |
| `updated_at` | timestamp with time zone |  | `now()` |
| `assigned_employee_id` | uuid | yes |  |

## labour_cost_entries

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `operation_id` | uuid | yes |  |
| `entry_type` | text |  | `'labour'::text` |
| `worker_id` | uuid | yes |  |
| `worker_name` | text | yes |  |
| `work_centre_id` | uuid | yes |  |
| `hours` | numeric |  |  |
| `rate` | numeric |  |  |
| `amount` | numeric | yes |  |
| `entry_date` | date |  | `CURRENT_DATE` |
| `notes` | text | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `employee_id` | uuid | yes |  |

## material_categories

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

## material_reservations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `production_order_material_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `status` | text |  | `'active'::text` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

## materials

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `description` | text | yes |  |
| `kind` | text |  | `'raw_material'::text` |
| `category_id` | uuid | yes |  |
| `sku` | text | yes |  |
| `stock_uom_id` | uuid |  |  |
| `purchase_uom_id` | uuid | yes |  |
| `purchase_conversion_factor` | numeric |  | `1` |
| `standard_cost` | numeric | yes |  |
| `preferred_supplier_id` | uuid | yes |  |
| `min_stock` | numeric |  | `0` |
| `reorder_level` | numeric |  | `0` |
| `reorder_quantity` | numeric | yes |  |
| `max_stock` | numeric | yes |  |
| `default_warehouse_id` | uuid | yes |  |
| `storage_location` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## member_roles

| Column | Type | Null | Default |
|---|---|---|---|
| `member_id` | uuid |  |  |
| `role_id` | uuid |  |  |
| `organization_id` | uuid |  |  |
| `assigned_by` | uuid | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## notification_preferences

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `type` | text |  |  |
| `in_app` | boolean |  | `true` |
| `email` | boolean |  | `false` |

## notifications

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `type` | text |  |  |
| `severity` | text |  | `'info'::text` |
| `title` | text |  |  |
| `body` | text | yes |  |
| `link` | text | yes |  |
| `entity_type` | text | yes |  |
| `entity_id` | uuid | yes |  |
| `dedupe_key` | text | yes |  |
| `read_at` | timestamp with time zone | yes |  |
| `emailed_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## organization_members

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `status` | text |  | `'active'::text` |
| `job_title` | text | yes |  |
| `factory_id` | uuid | yes |  |
| `invited_by` | uuid | yes |  |
| `joined_at` | timestamp with time zone |  | `now()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## organization_settings

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `currency` | text |  | `'NGN'::text` |
| `measurement_system` | text |  | `'metric'::text` |
| `date_format` | text |  | `'dd/MM/yyyy'::text` |
| `fiscal_year_start_month` | smallint |  | `1` |
| `inventory_valuation` | text |  | `'weighted_average'::text` |
| `costing_method` | text |  | `'actual'::text` |
| `timezone` | text |  | `'Africa/Lagos'::text` |
| `allow_negative_stock` | boolean |  | `false` |
| `require_production_approval` | boolean |  | `true` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `require_final_inspection` | boolean |  | `false` |
| `po_approval_threshold` | numeric |  | `0` |

## organizations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `name` | text |  |  |
| `slug` | text |  |  |
| `business_type` | text | yes |  |
| `industry` | text | yes |  |
| `country` | text |  | `'NG'::text` |
| `address` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `website` | text | yes |  |
| `logo_url` | text | yes |  |
| `main_products` | text | yes |  |
| `employee_count_range` | text | yes |  |
| `factory_count` | integer | yes |  |
| `production_model` | text | yes |  |
| `production_challenges` | ARRAY |  | `'{}'::text[]` |
| `is_demo` | boolean |  | `false` |
| `status` | text |  | `'active'::text` |
| `onboarding_completed_at` | timestamp with time zone | yes |  |
| `onboarding_state` | jsonb |  | `'{}'::jsonb` |
| `created_by` | uuid | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |
| `tax_id` | text | yes |  |
| `invoice_bank_details` | text | yes |  |
| `invoice_footer` | text | yes |  |

## overhead_cost_entries

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `category` | text |  | `'overhead'::text` |
| `description` | text |  |  |
| `amount` | numeric |  |  |
| `is_allocated` | boolean |  | `false` |
| `cost_rate_id` | uuid | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## permissions

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text |  |  |
| `module` | text |  |  |
| `action` | text |  |  |
| `description` | text |  |  |

## plans

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text |  |  |
| `name` | text |  |  |
| `price_monthly` | numeric | yes |  |
| `max_users` | integer | yes |  |
| `max_factories` | integer | yes |  |
| `ai_requests_monthly` | integer | yes |  |
| `description` | text |  |  |
| `features` | ARRAY |  | `'{}'::text[]` |
| `sort` | integer |  |  |

## product_categories

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `parent_id` | uuid | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## product_cost_snapshots

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `product_id` | uuid |  |  |
| `bom_id` | uuid | yes |  |
| `material_cost` | numeric |  |  |
| `labour_cost` | numeric |  |  |
| `machine_cost` | numeric |  |  |
| `overhead_cost` | numeric |  |  |
| `total_cost` | numeric |  |  |
| `selling_price` | numeric | yes |  |
| `breakdown` | jsonb |  | `'{}'::jsonb` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## product_variants

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `product_id` | uuid |  |  |
| `sku` | text | yes |  |
| `name` | text |  | `'Standard'::text` |
| `size` | text | yes |  |
| `colour` | text | yes |  |
| `attributes` | jsonb |  | `'{}'::jsonb` |
| `selling_price` | numeric | yes |  |
| `is_default` | boolean |  | `false` |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## production_cost_snapshots

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `product_id` | uuid |  |  |
| `quantity_planned` | numeric |  |  |
| `quantity_accepted` | numeric |  |  |
| `quantity_rejected` | numeric |  |  |
| `material_cost` | numeric |  |  |
| `labour_cost` | numeric |  |  |
| `machine_cost` | numeric |  |  |
| `overhead_cost` | numeric |  |  |
| `other_cost` | numeric |  |  |
| `total_cost` | numeric |  |  |
| `unit_cost` | numeric |  |  |
| `estimated_total` | numeric |  |  |
| `estimated_unit_cost` | numeric |  |  |
| `selling_price` | numeric | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## production_logs

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `operation_id` | uuid | yes |  |
| `job_card_id` | uuid | yes |  |
| `log_type` | text |  |  |
| `quantity_good` | numeric | yes |  |
| `quantity_rejected` | numeric | yes |  |
| `message` | text | yes |  |
| `metadata` | jsonb |  | `'{}'::jsonb` |
| `client_ref` | text | yes |  |
| `occurred_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## production_operations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `sequence` | integer |  |  |
| `stage_id` | uuid |  |  |
| `work_centre_id` | uuid | yes |  |
| `name` | text |  |  |
| `instructions` | text | yes |  |
| `requires_quality_check` | boolean |  | `false` |
| `standard_minutes_per_unit` | numeric | yes |  |
| `status` | text |  | `'pending'::text` |
| `quantity_completed` | numeric |  | `0` |
| `quantity_rejected` | numeric |  | `0` |
| `planned_start` | timestamp with time zone | yes |  |
| `planned_end` | timestamp with time zone | yes |  |
| `started_at` | timestamp with time zone | yes |  |
| `completed_at` | timestamp with time zone | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

## production_order_materials

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `line_no` | integer |  |  |
| `bom_item_id` | uuid | yes |  |
| `stock_item_id` | uuid |  |  |
| `quantity_per_unit` | numeric |  |  |
| `wastage_pct` | numeric |  | `0` |
| `quantity_required` | numeric |  |  |
| `quantity_reserved` | numeric |  | `0` |
| `quantity_issued` | numeric |  | `0` |
| `quantity_returned` | numeric |  | `0` |
| `quantity_wasted` | numeric |  | `0` |
| `issued_cost` | numeric |  | `0` |
| `returned_cost` | numeric |  | `0` |
| `estimated_unit_cost` | numeric |  | `0` |

## production_order_status_history

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `from_status` | text | yes |  |
| `to_status` | text |  |  |
| `note` | text | yes |  |
| `changed_by` | uuid | yes | `auth.uid()` |
| `changed_at` | timestamp with time zone |  | `now()` |

## production_orders

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `factory_id` | uuid |  |  |
| `product_id` | uuid |  |  |
| `variant_id` | uuid |  |  |
| `bom_id` | uuid | yes |  |
| `bom_version` | integer | yes |  |
| `bom_snapshot` | jsonb | yes |  |
| `routing_id` | uuid | yes |  |
| `source` | text |  | `'manual'::text` |
| `source_reference` | text | yes |  |
| `quantity_planned` | numeric |  |  |
| `quantity_completed` | numeric |  | `0` |
| `quantity_rejected` | numeric |  | `0` |
| `priority` | text |  | `'normal'::text` |
| `status` | text |  | `'draft'::text` |
| `planned_start_date` | date | yes |  |
| `due_date` | date | yes |  |
| `actual_start_at` | timestamp with time zone | yes |  |
| `actual_end_at` | timestamp with time zone | yes |  |
| `manager_id` | uuid | yes |  |
| `material_warehouse_id` | uuid |  |  |
| `output_warehouse_id` | uuid |  |  |
| `notes` | text | yes |  |
| `cancel_reason` | text | yes |  |
| `approved_by` | uuid | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `sales_order_item_id` | uuid | yes |  |

## production_outputs

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `quantity_good` | numeric |  |  |
| `quantity_rejected` | numeric |  | `0` |
| `warehouse_id` | uuid |  |  |
| `unit_cost` | numeric |  | `0` |
| `material_cost` | numeric |  | `0` |
| `inventory_transaction_id` | uuid | yes |  |
| `recorded_by` | uuid | yes | `auth.uid()` |
| `recorded_at` | timestamp with time zone |  | `now()` |

## production_scrap

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `production_order_id` | uuid |  |  |
| `production_order_material_id` | uuid | yes |  |
| `operation_id` | uuid | yes |  |
| `stock_item_id` | uuid | yes |  |
| `quantity` | numeric |  |  |
| `reason` | text |  |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## production_stages

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `sequence` | integer |  |  |
| `colour` | text |  | `'slate'::text` |
| `is_quality_stage` | boolean |  | `false` |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

## products

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `sku` | text | yes |  |
| `category_id` | uuid | yes |  |
| `description` | text | yes |  |
| `uom_id` | uuid |  |  |
| `standard_minutes_per_unit` | numeric | yes |  |
| `target_cost` | numeric | yes |  |
| `selling_price` | numeric | yes |  |
| `status` | text |  | `'active'::text` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## profiles

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  |  |
| `email` | text |  |  |
| `full_name` | text |  | `''::text` |
| `phone` | text | yes |  |
| `avatar_url` | text | yes |  |
| `last_organization_id` | uuid | yes |  |
| `is_platform_admin` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## purchase_order_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `purchase_order_id` | uuid |  |  |
| `line_no` | integer |  |  |
| `stock_item_id` | uuid |  |  |
| `description` | text | yes |  |
| `quantity` | numeric |  |  |
| `unit_price` | numeric |  |  |
| `discount_pct` | numeric |  | `0` |
| `tax_pct` | numeric |  | `0` |
| `line_total` | numeric | yes |  |
| `quantity_received` | numeric |  | `0` |
| `quantity_rejected` | numeric |  | `0` |

## purchase_orders

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `supplier_id` | uuid |  |  |
| `requisition_id` | uuid | yes |  |
| `status` | text |  | `'draft'::text` |
| `order_date` | date |  | `CURRENT_DATE` |
| `expected_date` | date | yes |  |
| `warehouse_id` | uuid |  |  |
| `currency` | text |  | `'NGN'::text` |
| `payment_terms` | text | yes |  |
| `notes` | text | yes |  |
| `shipping_cost` | numeric |  | `0` |
| `subtotal` | numeric |  | `0` |
| `discount_total` | numeric |  | `0` |
| `tax_total` | numeric |  | `0` |
| `total` | numeric |  | `0` |
| `approved_by` | uuid | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `sent_at` | timestamp with time zone | yes |  |
| `cancel_reason` | text | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## purchase_requisition_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `requisition_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `notes` | text | yes |  |
| `purchase_order_item_id` | uuid | yes |  |

## purchase_requisitions

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `status` | text |  | `'submitted'::text` |
| `source` | text |  | `'manual'::text` |
| `production_order_id` | uuid | yes |  |
| `warehouse_id` | uuid | yes |  |
| `needed_by` | date | yes |  |
| `notes` | text | yes |  |
| `requested_by` | uuid | yes | `auth.uid()` |
| `decided_by` | uuid | yes |  |
| `decided_at` | timestamp with time zone | yes |  |
| `decision_note` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

## quality_check_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `quality_check_id` | uuid |  |  |
| `template_item_id` | uuid | yes |  |
| `name` | text |  |  |
| `result` | text |  |  |
| `value` | text | yes |  |
| `notes` | text | yes |  |

## quality_checks

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `check_type` | text |  |  |
| `is_final` | boolean |  | `false` |
| `production_order_id` | uuid | yes |  |
| `operation_id` | uuid | yes |  |
| `goods_receipt_id` | uuid | yes |  |
| `product_id` | uuid | yes |  |
| `template_id` | uuid | yes |  |
| `inspector_id` | uuid | yes | `auth.uid()` |
| `inspected_at` | timestamp with time zone |  | `now()` |
| `quantity_inspected` | numeric |  |  |
| `quantity_passed` | numeric |  |  |
| `quantity_rejected` | numeric |  |  |
| `result` | text |  |  |
| `conditional_note` | text | yes |  |
| `approved_by` | uuid | yes |  |
| `notes` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## quality_defects

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `quality_check_id` | uuid |  |  |
| `category` | text |  |  |
| `severity` | text |  | `'minor'::text` |
| `quantity` | numeric |  |  |
| `description` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |

## quality_template_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `template_id` | uuid |  |  |
| `sequence` | integer |  |  |
| `name` | text |  |  |
| `check_type` | text |  | `'pass_fail'::text` |
| `target` | text | yes |  |
| `required` | boolean |  | `true` |

## quality_templates

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `applies_to` | text |  | `'production'::text` |
| `stage_id` | uuid | yes |  |
| `product_id` | uuid | yes |  |
| `description` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## role_permissions

| Column | Type | Null | Default |
|---|---|---|---|
| `role_id` | uuid |  |  |
| `permission_key` | text |  |  |
| `organization_id` | uuid |  |  |
| `created_at` | timestamp with time zone |  | `now()` |

## roles

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `key` | text |  |  |
| `name` | text |  |  |
| `description` | text | yes |  |
| `is_system` | boolean |  | `false` |
| `is_owner` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## routing_steps

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `routing_id` | uuid |  |  |
| `sequence` | integer |  |  |
| `stage_id` | uuid |  |  |
| `work_centre_id` | uuid | yes |  |
| `name` | text |  |  |
| `standard_minutes_per_unit` | numeric | yes |  |
| `instructions` | text | yes |  |
| `requires_quality_check` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |

## routing_templates

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `factory_id` | uuid | yes |  |
| `product_id` | uuid | yes |  |
| `is_default` | boolean |  | `false` |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## sales_allocations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `sales_order_id` | uuid |  |  |
| `sales_order_item_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `status` | text |  | `'active'::text` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |

## sales_order_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `sales_order_id` | uuid |  |  |
| `line_no` | integer |  |  |
| `stock_item_id` | uuid |  |  |
| `description` | text | yes |  |
| `quantity` | numeric |  |  |
| `unit_price` | numeric |  |  |
| `discount_pct` | numeric |  | `0` |
| `tax_pct` | numeric |  | `0` |
| `line_total` | numeric | yes |  |
| `quantity_allocated` | numeric |  | `0` |
| `quantity_dispatched` | numeric |  | `0` |
| `quantity_returned` | numeric |  | `0` |
| `quantity_invoiced` | numeric |  | `0` |

## sales_orders

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `customer_id` | uuid |  |  |
| `status` | text |  | `'draft'::text` |
| `order_date` | date |  | `CURRENT_DATE` |
| `requested_date` | date | yes |  |
| `customer_reference` | text | yes |  |
| `warehouse_id` | uuid |  |  |
| `currency` | text |  | `'NGN'::text` |
| `payment_terms` | text | yes |  |
| `shipping_address` | text | yes |  |
| `notes` | text | yes |  |
| `shipping_charge` | numeric |  | `0` |
| `subtotal` | numeric |  | `0` |
| `discount_total` | numeric |  | `0` |
| `tax_total` | numeric |  | `0` |
| `total` | numeric |  | `0` |
| `amount_paid` | numeric |  | `0` |
| `confirmed_by` | uuid | yes |  |
| `confirmed_at` | timestamp with time zone | yes |  |
| `cancel_reason` | text | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `amount_credited` | numeric |  | `0` |
| `shipping_invoiced` | boolean |  | `false` |

## sales_return_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `sales_return_id` | uuid |  |  |
| `sales_order_item_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `quantity` | numeric |  |  |
| `condition` | text |  |  |
| `unit_cost` | numeric |  | `0` |
| `inventory_transaction_id` | uuid | yes |  |

## sales_returns

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `sales_order_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `received_at` | timestamp with time zone |  | `now()` |
| `reason` | text |  |  |
| `notes` | text | yes |  |
| `received_by` | uuid | yes | `auth.uid()` |

## shifts

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `factory_id` | uuid | yes |  |
| `start_time` | time without time zone |  |  |
| `end_time` | time without time zone |  |  |
| `break_minutes` | integer |  | `0` |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |

## stock_adjustments

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `warehouse_id` | uuid |  |  |
| `reason` | text |  |  |
| `notes` | text | yes |  |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |

## stock_count_lines

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `stock_count_id` | uuid |  |  |
| `stock_item_id` | uuid |  |  |
| `expected` | numeric |  |  |
| `counted` | numeric | yes |  |
| `unit_cost` | numeric |  | `0` |
| `note` | text | yes |  |
| `counted_by` | uuid | yes |  |
| `counted_at` | timestamp with time zone | yes |  |
| `adjustment` | numeric | yes |  |
| `inventory_transaction_id` | uuid | yes |  |

## stock_counts

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `number` | text |  |  |
| `warehouse_id` | uuid |  |  |
| `scope` | text |  | `'all'::text` |
| `blind` | boolean |  | `false` |
| `status` | text |  | `'in_progress'::text` |
| `notes` | text | yes |  |
| `started_at` | timestamp with time zone |  | `now()` |
| `created_by` | uuid | yes | `auth.uid()` |
| `submitted_by` | uuid | yes |  |
| `submitted_at` | timestamp with time zone | yes |  |
| `approved_by` | uuid | yes |  |
| `approved_at` | timestamp with time zone | yes |  |
| `decision_note` | text | yes |  |

## stock_items

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `kind` | text |  |  |
| `material_id` | uuid | yes |  |
| `product_variant_id` | uuid | yes |  |
| `uom_id` | uuid |  |  |
| `average_cost` | numeric |  | `0` |
| `created_at` | timestamp with time zone |  | `now()` |

## subscriptions

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `plan_key` | text |  | `'growth'::text` |
| `status` | text |  | `'trialing'::text` |
| `trial_ends_at` | timestamp with time zone | yes |  |
| `current_period_end` | timestamp with time zone | yes |  |
| `cancel_at_period_end` | boolean |  | `false` |
| `paystack_customer_code` | text | yes |  |
| `paystack_subscription_code` | text | yes |  |
| `paystack_email_token` | text | yes |  |
| `billing_email` | text | yes |  |
| `updated_at` | timestamp with time zone |  | `now()` |

## supplier_contacts

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `supplier_id` | uuid |  |  |
| `name` | text |  |  |
| `role` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `is_primary` | boolean |  | `false` |
| `created_at` | timestamp with time zone |  | `now()` |

## suppliers

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `contact_name` | text | yes |  |
| `email` | text | yes |  |
| `phone` | text | yes |  |
| `address` | text | yes |  |
| `payment_terms` | text | yes |  |
| `lead_time_days` | integer | yes |  |
| `notes` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## units_of_measure

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `kind` | text |  | `'count'::text` |
| `decimals` | smallint |  | `2` |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

## warehouse_locations

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `warehouse_id` | uuid |  |  |
| `code` | text |  |  |
| `name` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_at` | timestamp with time zone |  | `now()` |

## warehouses

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `factory_id` | uuid | yes |  |
| `code` | text |  |  |
| `name` | text |  |  |
| `address` | text | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## whatsapp_contacts

| Column | Type | Null | Default |
|---|---|---|---|
| `organization_id` | uuid |  |  |
| `user_id` | uuid |  |  |
| `phone` | text |  |  |
| `opted_in_at` | timestamp with time zone |  | `now()` |
| `alerts` | boolean |  | `true` |
| `daily_summary` | boolean |  | `false` |

## whatsapp_outbox

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | bigint |  |  |
| `organization_id` | uuid |  |  |
| `user_id` | uuid | yes |  |
| `phone` | text |  |  |
| `body` | text |  |  |
| `link` | text | yes |  |
| `status` | text |  | `'pending'::text` |
| `attempts` | integer |  | `0` |
| `error` | text | yes |  |
| `provider_id` | text | yes |  |
| `created_at` | timestamp with time zone |  | `now()` |
| `sent_at` | timestamp with time zone | yes |  |

## work_centres

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `factory_id` | uuid |  |  |
| `name` | text |  |  |
| `code` | text |  |  |
| `description` | text | yes |  |
| `capacity_units_per_hour` | numeric | yes |  |
| `hourly_cost` | numeric | yes |  |
| `is_active` | boolean |  | `true` |
| `created_by` | uuid | yes | `auth.uid()` |
| `created_at` | timestamp with time zone |  | `now()` |
| `updated_at` | timestamp with time zone |  | `now()` |
| `updated_by` | uuid | yes |  |
| `deleted_at` | timestamp with time zone | yes |  |

## Database functions (Data API / RPC)

| Function | Arguments |
|---|---|
| `accept_invitation` | `p_token text` |
| `ai_finish_request` | `p_usage bigint, p_model text, p_in integer, p_out integer, p_tools integer, p_ok boolean` |
| `ai_reserve_request` | `p_org uuid` |
| `apply_stage_template` | `p_org uuid, p_template text` |
| `attendance_record` | `p_org uuid, p jsonb` |
| `attendance_summary` | `p_org uuid, p_from date, p_to date` |
| `billing_record_payment` | `p_org uuid, p_reference text, p_plan text, p_amount numeric, p_paid_at timestamp with time zone, p_customer_code text, p_email text` |
| `billing_start_checkout` | `p_org uuid, p_plan text, p_reference text` |
| `billing_state` | `p_org uuid` |
| `billing_update_subscription` | `p_org uuid, p jsonb` |
| `bom_cost_estimate` | `p_bom uuid` |
| `bom_create_version` | `p_product uuid, p_variant uuid, p_copy_from uuid` |
| `bom_transition` | `p_bom uuid, p_action text, p_note text` |
| `bottleneck_analysis` | `p_org uuid, p_days integer` |
| `complete_onboarding` | `p_org uuid` |
| `corrective_action_update` | `p_action uuid, p_status text, p_resolution text` |
| `cost_entry_add` | `p_order uuid, p jsonb` |
| `cost_entry_remove` | `p_entry uuid, p_kind text` |
| `create_demo_organization` | `` |
| `create_factory` | `p_org uuid, p jsonb` |
| `create_invitation` | `p_org uuid, p_email text, p_role uuid` |
| `create_organization` | `p jsonb` |
| `credit_note_issue` | `p_so uuid, p_amount numeric, p_reason text` |
| `credit_note_void` | `p_note uuid, p_reason text` |
| `dashboard_summary` | `p_org uuid, p_factory uuid, p_from date, p_to date` |
| `defect_summary` | `p_org uuid, p_from date, p_to date` |
| `demand_forecast` | `p_org uuid, p_weeks integer` |
| `detect_anomalies` | `p_org uuid` |
| `dispatch_confirm_delivery` | `p_dispatch uuid, p_received_by text, p_notes text, p_delivered_at timestamp with time zone` |
| `dispatch_post` | `p_so uuid, p jsonb, p_idem text` |
| `get_invitation` | `p_token text` |
| `get_job_card` | `p_card uuid` |
| `goods_receipt_post` | `p_po uuid, p jsonb, p_idem text` |
| `import_materials` | `p_org uuid, p_rows jsonb, p_warehouse uuid` |
| `import_products` | `p_org uuid, p_rows jsonb` |
| `inventory_adjust` | `p_org uuid, p_warehouse uuid, p_reason text, p_lines jsonb, p_notes text, p_allow_negative boolean, p_idem text` |
| `inventory_receive` | `p_org uuid, p_item uuid, p_warehouse uuid, p_quantity numeric, p_unit_cost numeric, p_type text, p_reference text, p_notes text, p_idem text` |
| `inventory_reverse` | `p_txn uuid, p_reason text` |
| `inventory_transfer` | `p_org uuid, p_item uuid, p_from uuid, p_to uuid, p_quantity numeric, p_notes text, p_idem text` |
| `invoice_issue` | `p_so uuid, p jsonb` |
| `invoice_void` | `p_invoice uuid, p_reason text` |
| `job_card_action` | `p_card uuid, p_action text, p_good numeric, p_rejected numeric, p_message text, p_client_ref text` |
| `job_card_issue` | `p_operation uuid, p_assignee uuid, p_team text, p_target numeric, p_instructions text, p_employee uuid` |
| `leave_demo_organization` | `p_org uuid` |
| `material_requirements` | `p_org uuid, p_weeks integer` |
| `my_job_cards` | `p_org uuid, p_include_completed boolean` |
| `my_organizations` | `` |
| `my_permissions` | `p_org uuid` |
| `operational_alerts` | `p_org uuid, p_factory uuid` |
| `overdue_purchase_orders` | `p_org uuid` |
| `payment_record` | `p_so uuid, p jsonb` |
| `payment_void` | `p_payment uuid, p_reason text` |
| `platform_organizations` | `p_search text` |
| `platform_overview` | `` |
| `platform_update_organization` | `p_org uuid, p jsonb` |
| `procurement_suggestions` | `p_org uuid` |
| `product_cost_estimate` | `p_product uuid, p_save boolean` |
| `production_add_note` | `p_order uuid, p_operation uuid, p_message text` |
| `production_cost_summary` | `p_order uuid` |
| `production_cost_summary_internal` | `p_order uuid` |
| `production_issue_materials` | `p_order uuid, p_lines jsonb, p_operation uuid, p_idem text` |
| `production_operation_action` | `p_op uuid, p_action text, p_good numeric, p_rejected numeric, p_message text` |
| `production_order_complete` | `p_order uuid, p_good numeric, p_rejected numeric, p_note text, p_allow_material_exception boolean, p_idem text` |
| `production_order_create` | `p_org uuid, p jsonb` |
| `production_order_reserve` | `p_order uuid` |
| `production_order_transition` | `p_order uuid, p_to text, p_note text` |
| `production_record_downtime` | `p_order uuid, p_operation uuid, p_minutes integer, p_reason text` |
| `production_record_wastage` | `p_order uuid, p_material uuid, p_quantity numeric, p_reason text, p_operation uuid` |
| `production_return_materials` | `p_order uuid, p_lines jsonb, p_idem text` |
| `purchase_order_save` | `p_org uuid, p_po uuid, p jsonb` |
| `purchase_order_transition` | `p_po uuid, p_action text, p_note text` |
| `quality_check_record` | `p_org uuid, p jsonb` |
| `requisition_create` | `p_org uuid, p jsonb` |
| `requisition_decide` | `p_req uuid, p_decision text, p_note text` |
| `revoke_invitation` | `p_invitation uuid` |
| `run_scheduled_checks` | `` |
| `sales_order_allocate` | `p_so uuid` |
| `sales_order_lines` | `p_so uuid` |
| `sales_order_make` | `p_item uuid, p jsonb` |
| `sales_order_save` | `p_org uuid, p_so uuid, p jsonb` |
| `sales_order_transition` | `p_so uuid, p_action text, p_note text` |
| `sales_return_post` | `p_so uuid, p jsonb, p_idem text` |
| `set_active_organization` | `p_org uuid` |
| `set_member_roles` | `p_member uuid, p_roles uuid[]` |
| `set_role_permissions` | `p_role uuid, p_permissions text[]` |
| `stock_count_record` | `p_count uuid, p_lines jsonb` |
| `stock_count_sheet` | `p_count uuid` |
| `stock_count_start` | `p_org uuid, p jsonb` |
| `stock_count_transition` | `p_count uuid, p_action text, p_note text` |
| `update_member` | `p_member uuid, p_status text, p_job_title text, p_factory uuid` |
| `whatsapp_daily_summary` | `p_org uuid` |
| `whatsapp_handle_message` | `p_phone text, p_text text` |
