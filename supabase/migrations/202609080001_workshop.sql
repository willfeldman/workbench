create table public.beta_members(user_id uuid primary key references auth.users(id) on delete cascade,created_at timestamptz not null default now());
alter table public.beta_members enable row level security;
revoke all on public.beta_members from anon,authenticated;
create table public.project_records (
 id uuid primary key,
 owner_id uuid not null references auth.users(id) on delete cascade,
 version bigint not null default 0,
 data jsonb not null,
 updated_at timestamptz not null default now(),
 check (data->>'id' = id::text),
 check (data->>'ownerId' = owner_id::text)
);
create index project_owner_updated on public.project_records(owner_id,updated_at desc);
alter table public.project_records enable row level security;
create policy project_read_own on public.project_records for select to authenticated using (auth.uid()=owner_id);
-- Server routes authorize the user and perform all writes. Browser clients cannot replace project documents.
revoke insert,update,delete on public.project_records from anon,authenticated;
grant select on public.project_records to authenticated;
create function public.save_project(p_id uuid,p_owner uuid,p_version bigint,p_data jsonb)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 update public.project_records set data=p_data, version=version+1, updated_at=now()
 where id=p_id and owner_id=p_owner and version=p_version;
 return found;
end; $$;
revoke all on function public.save_project(uuid,uuid,bigint,jsonb) from public,anon,authenticated;
grant execute on function public.save_project(uuid,uuid,bigint,jsonb) to service_role;
create table public.generation_usage(owner_id uuid not null references auth.users(id) on delete cascade,request_id uuid not null,created_at timestamptz not null default now(),primary key(owner_id,request_id));
alter table public.generation_usage enable row level security;
create function public.reserve_run(p_owner uuid,p_request uuid,p_limit int)
returns boolean language plpgsql security invoker set search_path=public as $$
begin
 perform pg_advisory_xact_lock(hashtextextended(p_owner::text,0));
 if exists(select 1 from public.generation_usage where owner_id=p_owner and request_id=p_request) then return true; end if;
 if (select count(*) from public.generation_usage where owner_id=p_owner and created_at >= date_trunc('day',now() at time zone 'UTC') at time zone 'UTC') >= p_limit then return false; end if;
 insert into public.generation_usage(owner_id,request_id) values(p_owner,p_request);
 return true;
end; $$;
revoke all on function public.reserve_run(uuid,uuid,int) from public,anon,authenticated;
grant execute on function public.reserve_run(uuid,uuid,int) to service_role;
create table public.events(id bigint generated always as identity primary key,owner_id uuid not null references auth.users(id) on delete cascade,project_id uuid references public.project_records(id) on delete cascade,event text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.events enable row level security;
revoke all on public.events,public.generation_usage from anon,authenticated;
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types) values('project-photos','project-photos',false,10485760,array['image/jpeg','image/png','image/webp']) on conflict(id) do nothing;
create policy photo_read_own on storage.objects for select to authenticated using(bucket_id='project-photos' and (storage.foldername(name))[1]=auth.uid()::text);
-- Uploads go through authenticated server routes, which validate image bytes and enforce project ownership.
grant all on public.project_records,public.beta_members,public.generation_usage,public.events to service_role;
grant usage,select on sequence public.events_id_seq to service_role;
