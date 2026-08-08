revoke all on table public.provider_sync_runs from service_role;
grant select, insert, update on table public.provider_sync_runs to service_role;

alter function public.set_updated_at() set search_path = '';
