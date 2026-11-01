-- Relationships the Data API needs for embedding (found by checking every embedded select
-- in the app against PostgREST). profiles.id = auth.users.id, so these add no new constraint
-- on who can be referenced.
alter table public.stock_adjustments add constraint stock_adjustments_creator_profile_fk
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.production_scrap add constraint production_scrap_creator_profile_fk
  foreign key (created_by) references public.profiles (id) on delete set null;
-- Stock movements caused by production link to their order (same organisation enforced).
alter table public.inventory_transactions add constraint inventory_transactions_production_order_fk
  foreign key (organization_id, production_order_id) references public.production_orders (organization_id, id);
create index if not exists inventory_transactions_production_order_idx on public.inventory_transactions (production_order_id) where production_order_id is not null;
