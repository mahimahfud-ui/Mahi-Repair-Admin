alter table public.profiles
  add column if not exists member_code text;

alter table public.profiles
  drop constraint if exists profiles_member_code_format_check;

alter table public.profiles
  add constraint profiles_member_code_format_check
  check (member_code is null or (role = 'member' and member_code ~ '^MR-[A-HJ-NP-Z2-9]{8}$'));

create unique index if not exists profiles_member_code_unique
  on public.profiles(member_code)
  where member_code is not null;

comment on column public.profiles.member_code is
  'Owner-issued, non-email login identifier for Android members. PIN credentials are stored only by Supabase Auth.';
