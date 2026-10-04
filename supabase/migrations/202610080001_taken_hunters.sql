-- A hunter that already has an account cannot be requested again when registering.
-- Run once after 202610070001_trophies.sql. Additive: no existing record or account is changed.
begin;

-- Published hunters already linked to an account, so registration can leave them out. Only IDs are returned.
create function public.hunters_taken() returns text[] language sql stable security definer set search_path='' as $$
 select coalesce(array_agg(a.member order by a.member),'{}') from private.hunter_accounts a join public.members m on m.id=a.member where m.published and not m.archived;
$$;
revoke all on function public.hunters_taken() from public;
grant execute on function public.hunters_taken() to anon,authenticated;

-- A request for a hunter someone already plays is dropped, as a request for an unknown hunter already is.
create or replace function private.create_profile() returns trigger language plpgsql security definer set search_path='' as $$
declare requested text:=new.raw_user_meta_data->>'member';
begin
 insert into private.profiles(user_id,username,note,requested_member) values(new.id,nullif(trim(new.raw_user_meta_data->>'username'),''),nullif(left(trim(new.raw_user_meta_data->>'note'),500),''),
  case when exists(select 1 from public.members where id=requested and published and not archived)
   and not exists(select 1 from private.hunter_accounts where member=requested) then requested end);
 return new;
end; $$;
revoke all on function private.create_profile() from public;
commit;
