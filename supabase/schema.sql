create extension if not exists pgcrypto;

create table if not exists public.trip_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  created_at timestamptz not null default now(),
  ended_at timestamptz
);

create table if not exists public.trip_room_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.trip_rooms(id) on delete cascade,
  device_token_hash bytea not null,
  seat text not null check (seat ~ '^[A-H]$'),
  name text not null check (char_length(name) between 1 and 12),
  total_score integer not null default 0 check (total_score >= 0),
  attendance_days integer not null default 0 check (attendance_days >= 0),
  joined_at timestamptz not null default now(),
  unique (room_id, device_token_hash),
  unique (room_id, seat)
);

create table if not exists public.trip_score_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.trip_rooms(id) on delete cascade,
  player_id uuid not null references public.trip_room_players(id) on delete cascade,
  witness_id uuid not null references public.trip_room_players(id),
  task_uid text not null unique,
  task_code text not null,
  task_id text not null,
  points integer not null check (points between 1 and 3),
  target_name text not null,
  note text not null default '' check (char_length(note) <= 80),
  played_on date not null,
  created_at timestamptz not null default now()
);

create table if not exists public.trip_attendance (
  room_id uuid not null references public.trip_rooms(id) on delete cascade,
  player_id uuid not null references public.trip_room_players(id) on delete cascade,
  played_on date not null,
  created_at timestamptz not null default now(),
  primary key (player_id, played_on)
);

create table if not exists public.trip_reviews (
  room_id uuid not null references public.trip_rooms(id) on delete cascade,
  player_id uuid not null references public.trip_room_players(id) on delete cascade,
  reviewed_on date not null,
  bonus boolean not null default false,
  note text not null default '' check (char_length(note) <= 120),
  reviewed boolean not null default false,
  updated_at timestamptz not null default now(),
  primary key (player_id, reviewed_on)
);

alter table public.trip_rooms enable row level security;
alter table public.trip_room_players enable row level security;
alter table public.trip_score_events enable row level security;
alter table public.trip_attendance enable row level security;
alter table public.trip_reviews enable row level security;

revoke all on public.trip_rooms from anon, authenticated;
revoke all on public.trip_room_players from anon, authenticated;
revoke all on public.trip_score_events from anon, authenticated;
revoke all on public.trip_attendance from anon, authenticated;
revoke all on public.trip_reviews from anon, authenticated;

create or replace function public.trip_token_hash(p_token uuid)
returns bytea
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select digest(p_token::text, 'sha256');
$$;

create or replace function public.get_trip_room(p_room_code text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_self public.trip_room_players;
begin
  select * into v_room
  from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_self
  from public.trip_room_players
  where room_id = v_room.id
    and device_token_hash = public.trip_token_hash(p_device_token);

  if not found then
    raise exception 'INVALID_MEMBER';
  end if;

  return jsonb_build_object(
    'roomId', v_room.id,
    'roomCode', v_room.code,
    'createdAt', v_room.created_at,
    'self', jsonb_build_object(
      'id', v_self.id,
      'seat', v_self.seat,
      'name', v_self.name
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'seat', player.seat,
        'name', player.name,
        'totalScore', player.total_score,
        'attendanceDays', player.attendance_days,
        'joinedAt', player.joined_at
      ) order by player.seat)
      from public.trip_room_players player
      where player.room_id = v_room.id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_trip_room(p_name text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_attempt integer := 0;
begin
  if char_length(trim(p_name)) not between 1 and 12 then
    raise exception 'INVALID_NAME';
  end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.trip_rooms(code)
      values ((floor(random() * 900000) + 100000)::integer::text)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 20 then raise; end if;
    end;
  end loop;

  insert into public.trip_room_players(room_id, device_token_hash, seat, name)
  values (v_room.id, public.trip_token_hash(p_device_token), 'A', trim(p_name));

  return public.get_trip_room(v_room.code, p_device_token);
end;
$$;

create or replace function public.join_trip_room(p_room_code text, p_name text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_existing public.trip_room_players;
  v_seat text;
begin
  if char_length(trim(p_name)) not between 1 and 12 then
    raise exception 'INVALID_NAME';
  end if;

  select * into v_room
  from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null
  for update;

  if not found then
    raise exception 'ROOM_NOT_FOUND';
  end if;

  select * into v_existing
  from public.trip_room_players
  where room_id = v_room.id
    and device_token_hash = public.trip_token_hash(p_device_token);

  if found then
    update public.trip_room_players
    set name = trim(p_name)
    where id = v_existing.id;
    return public.get_trip_room(v_room.code, p_device_token);
  end if;

  select candidate into v_seat
  from unnest(array['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) as candidate
  where not exists (
    select 1 from public.trip_room_players player
    where player.room_id = v_room.id and player.seat = candidate
  )
  order by candidate
  limit 1;

  if v_seat is null then
    raise exception 'ROOM_FULL';
  end if;

  insert into public.trip_room_players(room_id, device_token_hash, seat, name)
  values (v_room.id, public.trip_token_hash(p_device_token), v_seat, trim(p_name));

  return public.get_trip_room(v_room.code, p_device_token);
end;
$$;

create or replace function public.record_trip_score(
  p_room_code text,
  p_device_token uuid,
  p_task_uid text,
  p_task_code text,
  p_task_id text,
  p_points integer,
  p_target_name text,
  p_witness_id uuid,
  p_note text,
  p_played_on date
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_player public.trip_room_players;
  v_inserted integer;
begin
  if p_points not between 1 and 3 then raise exception 'INVALID_SCORE'; end if;

  select * into v_room from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.trip_room_players
  where room_id = v_room.id
    and device_token_hash = public.trip_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  if not exists (
    select 1 from public.trip_room_players
    where id = p_witness_id and room_id = v_room.id and id <> v_player.id
  ) then
    raise exception 'INVALID_WITNESS';
  end if;

  insert into public.trip_score_events(
    room_id, player_id, witness_id, task_uid, task_code, task_id,
    points, target_name, note, played_on
  ) values (
    v_room.id, v_player.id, p_witness_id, left(p_task_uid, 80),
    left(p_task_code, 32), left(p_task_id, 12), p_points,
    left(p_target_name, 40), left(coalesce(p_note, ''), 80), p_played_on
  ) on conflict (task_uid) do nothing;

  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.trip_room_players
    set total_score = total_score + p_points
    where id = v_player.id;
    return true;
  end if;
  return false;
end;
$$;

create or replace function public.set_trip_attendance(
  p_room_code text,
  p_device_token uuid,
  p_played_on date,
  p_present boolean
)
returns integer
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_player public.trip_room_players;
  v_days integer;
begin
  select * into v_room from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.trip_room_players
  where room_id = v_room.id
    and device_token_hash = public.trip_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  if p_present then
    insert into public.trip_attendance(room_id, player_id, played_on)
    values (v_room.id, v_player.id, p_played_on)
    on conflict (player_id, played_on) do nothing;
  else
    delete from public.trip_attendance
    where player_id = v_player.id and played_on = p_played_on;
  end if;

  select count(*)::integer into v_days
  from public.trip_attendance where player_id = v_player.id;
  update public.trip_room_players set attendance_days = v_days where id = v_player.id;
  return v_days;
end;
$$;

create or replace function public.save_trip_review(
  p_room_code text,
  p_device_token uuid,
  p_reviewed_on date,
  p_bonus boolean,
  p_note text,
  p_reviewed boolean
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
  v_player public.trip_room_players;
  v_old_bonus boolean := false;
begin
  select * into v_room from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_player from public.trip_room_players
  where room_id = v_room.id
    and device_token_hash = public.trip_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select bonus into v_old_bonus from public.trip_reviews
  where player_id = v_player.id and reviewed_on = p_reviewed_on;
  v_old_bonus := coalesce(v_old_bonus, false);

  insert into public.trip_reviews(room_id, player_id, reviewed_on, bonus, note, reviewed, updated_at)
  values (v_room.id, v_player.id, p_reviewed_on, p_bonus, left(coalesce(p_note, ''), 120), p_reviewed, now())
  on conflict (player_id, reviewed_on) do update set
    bonus = excluded.bonus,
    note = excluded.note,
    reviewed = excluded.reviewed,
    updated_at = now();

  if v_old_bonus is distinct from p_bonus then
    update public.trip_room_players
    set total_score = greatest(0, total_score + case when p_bonus then 1 else -1 end)
    where id = v_player.id;
  end if;
  return true;
end;
$$;

create or replace function public.get_trip_reviews(
  p_room_code text,
  p_device_token uuid,
  p_reviewed_on date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.trip_rooms;
begin
  select * into v_room from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  if not exists (
    select 1 from public.trip_room_players
    where room_id = v_room.id
      and device_token_hash = public.trip_token_hash(p_device_token)
  ) then raise exception 'INVALID_MEMBER'; end if;

  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'seat', player.seat,
      'name', player.name,
      'bonus', review.bonus,
      'note', review.note,
      'reviewed', review.reviewed,
      'updatedAt', review.updated_at
    ) order by player.seat)
    from public.trip_reviews review
    join public.trip_room_players player on player.id = review.player_id
    where review.room_id = v_room.id and review.reviewed_on = p_reviewed_on
  ), '[]'::jsonb);
end;
$$;

create or replace function public.update_trip_name(
  p_room_code text,
  p_device_token uuid,
  p_name text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
begin
  if char_length(trim(p_name)) not between 1 and 12 then
    raise exception 'INVALID_NAME';
  end if;
  select id into v_room_id from public.trip_rooms
  where code = trim(p_room_code) and ended_at is null;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  update public.trip_room_players
  set name = trim(p_name)
  where room_id = v_room_id
    and device_token_hash = public.trip_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  return true;
end;
$$;

revoke all on function public.trip_token_hash(uuid) from public;
revoke all on function public.trip_token_hash(uuid) from anon, authenticated;
revoke all on function public.get_trip_room(text, uuid) from public;
revoke all on function public.get_trip_room(text, uuid) from authenticated;
revoke all on function public.create_trip_room(text, uuid) from public;
revoke all on function public.create_trip_room(text, uuid) from authenticated;
revoke all on function public.join_trip_room(text, text, uuid) from public;
revoke all on function public.join_trip_room(text, text, uuid) from authenticated;
revoke all on function public.record_trip_score(text, uuid, text, text, text, integer, text, uuid, text, date) from public;
revoke all on function public.record_trip_score(text, uuid, text, text, text, integer, text, uuid, text, date) from authenticated;
revoke all on function public.set_trip_attendance(text, uuid, date, boolean) from public;
revoke all on function public.set_trip_attendance(text, uuid, date, boolean) from authenticated;
revoke all on function public.save_trip_review(text, uuid, date, boolean, text, boolean) from public;
revoke all on function public.save_trip_review(text, uuid, date, boolean, text, boolean) from authenticated;
revoke all on function public.get_trip_reviews(text, uuid, date) from public;
revoke all on function public.get_trip_reviews(text, uuid, date) from authenticated;
revoke all on function public.update_trip_name(text, uuid, text) from public;
revoke all on function public.update_trip_name(text, uuid, text) from authenticated;

grant execute on function public.get_trip_room(text, uuid) to anon;
grant execute on function public.create_trip_room(text, uuid) to anon;
grant execute on function public.join_trip_room(text, text, uuid) to anon;
grant execute on function public.record_trip_score(text, uuid, text, text, text, integer, text, uuid, text, date) to anon;
grant execute on function public.set_trip_attendance(text, uuid, date, boolean) to anon;
grant execute on function public.save_trip_review(text, uuid, date, boolean, text, boolean) to anon;
grant execute on function public.get_trip_reviews(text, uuid, date) to anon;
grant execute on function public.update_trip_name(text, uuid, text) to anon;
