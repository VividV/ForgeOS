-- Foreign keys to profiles so the Data API can embed people's names
-- (auth.users is not exposed). profiles.id = auth.users.id, created by trigger.
alter table public.organization_members add constraint organization_members_profile_fk
  foreign key (user_id) references public.profiles (id) on delete cascade;
alter table public.production_orders add constraint production_orders_manager_profile_fk
  foreign key (manager_id) references public.profiles (id) on delete set null;
alter table public.job_cards add constraint job_cards_assignee_profile_fk
  foreign key (assigned_user_id) references public.profiles (id) on delete set null;
alter table public.audit_logs add constraint audit_logs_actor_profile_fk
  foreign key (actor_id) references public.profiles (id) on delete set null;
alter table public.inventory_transactions add constraint inventory_transactions_creator_profile_fk
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.production_logs add constraint production_logs_creator_profile_fk
  foreign key (created_by) references public.profiles (id) on delete set null;
alter table public.invitations add constraint invitations_inviter_profile_fk
  foreign key (invited_by) references public.profiles (id) on delete set null;
