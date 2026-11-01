# Entity relationship diagram

Generated from foreign keys by `scripts/gen-schema-docs.mjs`. Links to `organizations` (present on every tenant table) are omitted for readability.

## Identity & RBAC

```mermaid
erDiagram
  profiles ||--o{ invitations : "invited_by"
  roles ||--o{ invitations : "role_id"
  organization_members ||--o{ member_roles : "member_id"
  roles ||--o{ member_roles : "role_id"
  profiles ||--o{ organization_members : "user_id"
  organizations ||--o{ profiles : "last_organization_id"
  permissions ||--o{ role_permissions : "permission_key"
  roles ||--o{ role_permissions : "role_id"
```

## Factory

```mermaid
erDiagram
  warehouses ||--o{ factories : "default_warehouse_id"
  production_stages ||--o{ routing_steps : "stage_id"
  routing_templates ||--o{ routing_steps : "routing_id"
  work_centres ||--o{ routing_steps : "work_centre_id"
  factories ||--o{ routing_templates : "factory_id"
  warehouses ||--o{ warehouse_locations : "warehouse_id"
  factories ||--o{ warehouses : "factory_id"
  factories ||--o{ work_centres : "factory_id"
```

## Catalogue & inventory

```mermaid
erDiagram
  product_variants ||--o{ bills_of_materials : "variant_id"
  products ||--o{ bills_of_materials : "product_id"
  bills_of_materials ||--o{ bom_items : "bom_id"
  stock_items ||--o{ bom_items : "stock_item_id"
  stock_items ||--o{ inventory_balances : "stock_item_id"
  stock_items ||--o{ inventory_transactions : "stock_item_id"
  material_categories ||--o{ materials : "category_id"
  suppliers ||--o{ materials : "preferred_supplier_id"
  units_of_measure ||--o{ materials : "purchase_uom_id"
  units_of_measure ||--o{ materials : "stock_uom_id"
  products ||--o{ product_variants : "product_id"
  product_categories ||--o{ products : "category_id"
  units_of_measure ||--o{ products : "uom_id"
  materials ||--o{ stock_items : "material_id"
  product_variants ||--o{ stock_items : "product_variant_id"
  units_of_measure ||--o{ stock_items : "uom_id"
```

## Production

```mermaid
erDiagram
  production_operations ||--o{ downtime_logs : "operation_id"
  production_orders ||--o{ downtime_logs : "production_order_id"
  production_operations ||--o{ job_cards : "operation_id"
  production_orders ||--o{ job_cards : "production_order_id"
  production_order_materials ||--o{ material_reservations : "production_order_material_id"
  production_orders ||--o{ material_reservations : "production_order_id"
  job_cards ||--o{ production_logs : "job_card_id"
  production_operations ||--o{ production_logs : "operation_id"
  production_orders ||--o{ production_logs : "production_order_id"
  production_orders ||--o{ production_operations : "production_order_id"
  production_orders ||--o{ production_order_materials : "production_order_id"
  production_orders ||--o{ production_order_status_history : "production_order_id"
  production_orders ||--o{ production_outputs : "production_order_id"
  production_operations ||--o{ production_scrap : "operation_id"
  production_order_materials ||--o{ production_scrap : "production_order_material_id"
  production_orders ||--o{ production_scrap : "production_order_id"
```

