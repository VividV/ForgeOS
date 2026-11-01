# Data dictionary

Generated from the database by `scripts/gen-schema-docs.mjs`. Do not edit by hand.

All primary keys are UUIDs. Every organisation-owned table carries `organization_id` and has Row Level Security enabled (✔ below). Ledger tables (`inventory_transactions`, `audit_logs`, `production_logs`, `production_outputs`, `stock_adjustments`, `production_order_status_history`) are append-only: updates and deletes are rejected by trigger.

| Table | Columns | RLS |
|---|---|---|
| [`audit_logs`](#audit_logs) | 12 | ✔ |
| [`bills_of_materials`](#bills_of_materials) | 19 | ✔ |
| [`bom_items`](#bom_items) | 9 | ✔ |
| [`document_sequences`](#document_sequences) | 4 | ✔ |
| [`downtime_logs`](#downtime_logs) | 10 | ✔ |
| [`factories`](#factories) | 19 | ✔ |
| [`inventory_balances`](#inventory_balances) | 8 | ✔ |
| [`inventory_transactions`](#inventory_transactions) | 22 | ✔ |
| [`invitations`](#invitations) | 13 | ✔ |
| [`job_cards`](#job_cards) | 17 | ✔ |
| [`material_categories`](#material_categories) | 4 | ✔ |
| [`material_reservations`](#material_reservations) | 11 | ✔ |
| [`materials`](#materials) | 25 | ✔ |
| [`member_roles`](#member_roles) | 5 | ✔ |
| [`notification_preferences`](#notification_preferences) | 5 | ✔ |
| [`notifications`](#notifications) | 14 | ✔ |
| [`organization_members`](#organization_members) | 11 | ✔ |
| [`organization_settings`](#organization_settings) | 12 | ✔ |
| [`organizations`](#organizations) | 25 | ✔ |
| [`permissions`](#permissions) | 4 | ✔ |
| [`product_categories`](#product_categories) | 5 | ✔ |
| [`product_variants`](#product_variants) | 15 | ✔ |
| [`production_logs`](#production_logs) | 14 | ✔ |
| [`production_operations`](#production_operations) | 19 | ✔ |
| [`production_order_materials`](#production_order_materials) | 16 | ✔ |
| [`production_order_status_history`](#production_order_status_history) | 8 | ✔ |
| [`production_orders`](#production_orders) | 32 | ✔ |
| [`production_outputs`](#production_outputs) | 11 | ✔ |
| [`production_scrap`](#production_scrap) | 10 | ✔ |
| [`production_stages`](#production_stages) | 8 | ✔ |
| [`products`](#products) | 17 | ✔ |
| [`profiles`](#profiles) | 10 | ✔ |
| [`role_permissions`](#role_permissions) | 4 | ✔ |
| [`roles`](#roles) | 10 | ✔ |
| [`routing_steps`](#routing_steps) | 11 | ✔ |
| [`routing_templates`](#routing_templates) | 11 | ✔ |
| [`stock_adjustments`](#stock_adjustments) | 8 | ✔ |
| [`stock_items`](#stock_items) | 8 | ✔ |
| [`suppliers`](#suppliers) | 17 | ✔ |
| [`units_of_measure`](#units_of_measure) | 8 | ✔ |
| [`warehouse_locations`](#warehouse_locations) | 7 | ✔ |
| [`warehouses`](#warehouses) | 12 | ✔ |
| [`work_centres`](#work_centres) | 14 | ✔ |

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

## permissions

| Column | Type | Null | Default |
|---|---|---|---|
| `key` | text |  |  |
| `module` | text |  |  |
| `action` | text |  |  |
| `description` | text |  |  |

## product_categories

| Column | Type | Null | Default |
|---|---|---|---|
| `id` | uuid |  | `gen_random_uuid()` |
| `organization_id` | uuid |  |  |
| `name` | text |  |  |
| `parent_id` | uuid | yes |  |
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
| `apply_stage_template` | `p_org uuid, p_template text` |
| `bom_cost_estimate` | `p_bom uuid` |
| `bom_create_version` | `p_product uuid, p_variant uuid, p_copy_from uuid` |
| `bom_transition` | `p_bom uuid, p_action text, p_note text` |
| `complete_onboarding` | `p_org uuid` |
| `create_factory` | `p_org uuid, p jsonb` |
| `create_invitation` | `p_org uuid, p_email text, p_role uuid` |
| `create_organization` | `p jsonb` |
| `dashboard_summary` | `p_org uuid, p_factory uuid, p_from date, p_to date` |
| `get_invitation` | `p_token text` |
| `get_job_card` | `p_card uuid` |
| `import_materials` | `p_org uuid, p_rows jsonb, p_warehouse uuid` |
| `import_products` | `p_org uuid, p_rows jsonb` |
| `inventory_adjust` | `p_org uuid, p_warehouse uuid, p_reason text, p_lines jsonb, p_notes text, p_allow_negative boolean, p_idem text` |
| `inventory_receive` | `p_org uuid, p_item uuid, p_warehouse uuid, p_quantity numeric, p_unit_cost numeric, p_type text, p_reference text, p_notes text, p_idem text` |
| `inventory_reverse` | `p_txn uuid, p_reason text` |
| `inventory_transfer` | `p_org uuid, p_item uuid, p_from uuid, p_to uuid, p_quantity numeric, p_notes text, p_idem text` |
| `job_card_action` | `p_card uuid, p_action text, p_good numeric, p_rejected numeric, p_message text, p_client_ref text` |
| `job_card_issue` | `p_operation uuid, p_assignee uuid, p_team text, p_target numeric, p_instructions text` |
| `my_job_cards` | `p_org uuid, p_include_completed boolean` |
| `my_organizations` | `` |
| `my_permissions` | `p_org uuid` |
| `operational_alerts` | `p_org uuid, p_factory uuid` |
| `production_add_note` | `p_order uuid, p_operation uuid, p_message text` |
| `production_issue_materials` | `p_order uuid, p_lines jsonb, p_operation uuid, p_idem text` |
| `production_operation_action` | `p_op uuid, p_action text, p_good numeric, p_rejected numeric, p_message text` |
| `production_order_complete` | `p_order uuid, p_good numeric, p_rejected numeric, p_note text, p_allow_material_exception boolean, p_idem text` |
| `production_order_create` | `p_org uuid, p jsonb` |
| `production_order_reserve` | `p_order uuid` |
| `production_order_transition` | `p_order uuid, p_to text, p_note text` |
| `production_record_downtime` | `p_order uuid, p_operation uuid, p_minutes integer, p_reason text` |
| `production_record_wastage` | `p_order uuid, p_material uuid, p_quantity numeric, p_reason text, p_operation uuid` |
| `production_return_materials` | `p_order uuid, p_lines jsonb, p_idem text` |
| `revoke_invitation` | `p_invitation uuid` |
| `run_scheduled_checks` | `` |
| `set_active_organization` | `p_org uuid` |
| `set_member_roles` | `p_member uuid, p_roles uuid[]` |
| `set_role_permissions` | `p_role uuid, p_permissions text[]` |
| `update_member` | `p_member uuid, p_status text, p_job_title text, p_factory uuid` |
