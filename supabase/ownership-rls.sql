begin;

alter table public.restaurants
add column if not exists created_by uuid
references public.profiles(id) on delete set null;

create index if not exists foodmap_restaurants_owner
on public.restaurants(created_by);

-- 현재 로그인 사용자가 활성 회원인지 확인합니다.
create or replace function public.foodmap_is_active_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
  );
$$;

-- 역할은 사용자가 수정할 수 있는 metadata 대신 DB에서 확인합니다.
create or replace function public.foodmap_is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles
    where id = (select auth.uid())
      and is_active
      and user_type = 'admin'
  );
$$;

revoke all on function
  public.foodmap_is_active_member(),
  public.foodmap_is_active_admin()
from public, anon;

grant execute on function
  public.foodmap_is_active_member(),
  public.foodmap_is_active_admin()
to authenticated;

-- 등록자는 사용자 토큰에서 정하고 이후 변경을 금지합니다.
create or replace function public.foodmap_restaurant_owner_guard()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'INSERT' then
    if new.source_submission_id is not null then
      select submitter_id
      into new.created_by
      from public.submissions
      where id = new.source_submission_id;

    elsif auth.uid() is not null then
      new.created_by = auth.uid();
    end if;

  elsif new.created_by is distinct from old.created_by then
    raise exception 'Restaurant owner cannot be changed'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function
  public.foodmap_restaurant_owner_guard()
from public, anon, authenticated;

drop trigger if exists foodmap_restaurant_owner
on public.restaurants;

create trigger foodmap_restaurant_owner
before insert or update on public.restaurants
for each row
execute function public.foodmap_restaurant_owner_guard();

alter table public.restaurants
enable row level security;

grant usage on schema public to anon, authenticated;

grant select on public.restaurants
to anon, authenticated;

revoke insert on public.restaurants from authenticated;

grant insert (
  name, category, location, price_range,
  rating, description, recommended_menu,
  image, created_by
)
on public.restaurants to authenticated;

revoke update on public.restaurants from authenticated;

grant update (
  name, category, location, price_range,
  rating, description, recommended_menu, image
)
on public.restaurants to authenticated;

grant delete on public.restaurants to authenticated;

grant usage, select
on sequence public.restaurants_id_seq
to authenticated;

-- 비회원도 조회할 수 있습니다.
drop policy if exists foodmap_restaurants_read
on public.restaurants;

create policy foodmap_restaurants_read
on public.restaurants
for select
to anon, authenticated
using (true);

-- 활성 회원이 본인 명의로 등록합니다.
drop policy if exists foodmap_restaurants_insert
on public.restaurants;

create policy foodmap_restaurants_insert
on public.restaurants
for insert
to authenticated
with check (
  public.foodmap_is_active_member()
  and created_by = (select auth.uid())
  and source_submission_id is null
);

-- 등록자 본인 또는 활성 관리자만 수정합니다.
drop policy if exists foodmap_restaurants_update
on public.restaurants;

create policy foodmap_restaurants_update
on public.restaurants
for update
to authenticated
using (
  public.foodmap_is_active_member()
  and (
    created_by = (select auth.uid())
    or public.foodmap_is_active_admin()
  )
)
with check (
  public.foodmap_is_active_member()
  and (
    created_by = (select auth.uid())
    or public.foodmap_is_active_admin()
  )
);

-- 등록자 본인 또는 활성 관리자만 삭제합니다.
drop policy if exists foodmap_restaurants_delete
on public.restaurants;

create policy foodmap_restaurants_delete
on public.restaurants
for delete
to authenticated
using (
  public.foodmap_is_active_member()
  and (
    created_by = (select auth.uid())
    or public.foodmap_is_active_admin()
  )
);

notify pgrst, 'reload schema';

commit;