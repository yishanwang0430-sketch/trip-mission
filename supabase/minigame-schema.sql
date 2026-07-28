create extension if not exists pgcrypto;

create table if not exists public.secret_rooms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[0-9]{6}$'),
  max_players smallint not null check (max_players between 3 and 12),
  status text not null default 'lobby' check (status in ('lobby', 'playing', 'review', 'ended')),
  owner_player_id uuid,
  current_review_on date,
  created_at timestamptz not null default now(),
  started_at timestamptz,
  ended_at timestamptz
);

create table if not exists public.secret_players (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  device_token_hash bytea not null,
  seat smallint not null check (seat between 1 and 12),
  name text not null check (char_length(name) between 1 and 12),
  total_score integer not null default 0 check (total_score >= 0),
  joined_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  unique (room_id, device_token_hash),
  unique (room_id, seat)
);

alter table public.secret_players
  add column if not exists is_present boolean not null default true;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'secret_rooms_owner_player_id_fkey'
  ) then
    alter table public.secret_rooms
      add constraint secret_rooms_owner_player_id_fkey
      foreign key (owner_player_id) references public.secret_players(id) on delete set null;
  end if;
end;
$$;

create table if not exists public.secret_score_claims (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  player_id uuid not null references public.secret_players(id) on delete cascade,
  witness_id uuid not null references public.secret_players(id) on delete cascade,
  task_uid text not null unique,
  task_code text not null,
  task_id text not null,
  points smallint not null check (points between 1 and 3),
  target_name text not null,
  status text not null default 'pending' check (status in ('pending', 'approved', 'rejected')),
  played_on date not null,
  created_at timestamptz not null default now(),
  resolved_at timestamptz
);

create table if not exists public.secret_reviews (
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  player_id uuid not null references public.secret_players(id) on delete cascade,
  reviewed_on date not null,
  note text not null default '' check (char_length(note) <= 120),
  updated_at timestamptz not null default now(),
  primary key (player_id, reviewed_on)
);

create table if not exists public.secret_review_awards (
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  reviewed_on date not null,
  player_id uuid not null references public.secret_players(id) on delete cascade,
  awarded_by uuid not null references public.secret_players(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (room_id, reviewed_on)
);

create index if not exists secret_players_room_idx on public.secret_players(room_id);
create index if not exists secret_claims_room_status_idx on public.secret_score_claims(room_id, status);
create index if not exists secret_reviews_room_date_idx on public.secret_reviews(room_id, reviewed_on);

alter table public.secret_rooms enable row level security;
alter table public.secret_players enable row level security;
alter table public.secret_score_claims enable row level security;
alter table public.secret_reviews enable row level security;
alter table public.secret_review_awards enable row level security;

revoke all on public.secret_rooms from anon, authenticated;
revoke all on public.secret_players from anon, authenticated;
revoke all on public.secret_score_claims from anon, authenticated;
revoke all on public.secret_reviews from anon, authenticated;
revoke all on public.secret_review_awards from anon, authenticated;

create or replace function public.secret_token_hash(p_token uuid)
returns bytea
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select digest(p_token::text, 'sha256');
$$;

create or replace function public.secret_room_payload(p_room_id uuid, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_self public.secret_players;
begin
  select * into v_room from public.secret_rooms where id = p_room_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_self
  from public.secret_players
  where room_id = v_room.id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  return jsonb_build_object(
    'roomId', v_room.id,
    'roomCode', v_room.code,
    'maxPlayers', v_room.max_players,
    'status', v_room.status,
    'ownerPlayerId', v_room.owner_player_id,
    'currentReviewOn', v_room.current_review_on,
    'createdAt', v_room.created_at,
    'startedAt', v_room.started_at,
    'endedAt', v_room.ended_at,
    'self', jsonb_build_object(
      'id', v_self.id,
      'seat', v_self.seat,
      'name', v_self.name,
      'isOwner', v_self.id = v_room.owner_player_id
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'seat', player.seat,
        'name', player.name,
        'totalScore', player.total_score,
        'present', player.is_present,
        'online', player.last_seen_at > now() - interval '25 seconds',
        'joinedAt', player.joined_at
      ) order by player.seat)
      from public.secret_players player
      where player.room_id = v_room.id
    ), '[]'::jsonb),
    'pendingApprovals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', claim.id,
        'playerId', claimant.id,
        'playerName', claimant.name,
        'playerSeat', claimant.seat,
        'taskCode', claim.task_code,
        'points', claim.points,
        'targetName', claim.target_name,
        'playedOn', claim.played_on,
        'createdAt', claim.created_at
      ) order by claim.created_at)
      from public.secret_score_claims claim
      join public.secret_players claimant on claimant.id = claim.player_id
      where claim.room_id = v_room.id
        and claim.witness_id = v_self.id
        and claim.status = 'pending'
    ), '[]'::jsonb),
    'myClaims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id,
        'taskUid', recent.task_uid,
        'taskCode', recent.task_code,
        'points', recent.points,
        'status', recent.status,
        'witnessId', recent.witness_id,
        'playedOn', recent.played_on,
        'createdAt', recent.created_at
      ) order by recent.created_at desc)
      from (
        select claim.*
        from public.secret_score_claims claim
        where claim.room_id = v_room.id and claim.player_id = v_self.id
        order by claim.created_at desc
        limit 30
      ) recent
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', player.id,
        'playerName', player.name,
        'playerSeat', player.seat,
        'note', review.note,
        'isWinner', award.player_id = player.id,
        'updatedAt', review.updated_at
      ) order by player.seat)
      from public.secret_reviews review
      join public.secret_players player on player.id = review.player_id
      left join public.secret_review_awards award
        on award.room_id = review.room_id and award.reviewed_on = review.reviewed_on
      where review.room_id = v_room.id
        and review.reviewed_on = v_room.current_review_on
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.set_secret_presence(
  p_room_code text,
  p_device_token uuid,
  p_present boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  update public.secret_players
  set is_present = p_present, last_seen_at = now()
  where room_id = v_room_id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  return public.secret_room_payload(v_room_id, p_device_token);
end;
$$;

create or replace function public.create_secret_room(
  p_name text,
  p_device_token uuid,
  p_max_players integer
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
  v_attempt integer := 0;
begin
  if trim(p_name) <> all(array['一山','阿禾','小满','青川','南星','木木','可乐','石榴','松风','朝露','云舟','听雨']) then
    raise exception 'INVALID_NAME';
  end if;
  if p_max_players not between 3 and 12 then raise exception 'INVALID_CAPACITY'; end if;

  loop
    v_attempt := v_attempt + 1;
    begin
      insert into public.secret_rooms(code, max_players)
      values ((floor(random() * 900000) + 100000)::integer::text, p_max_players)
      returning * into v_room;
      exit;
    exception when unique_violation then
      if v_attempt >= 20 then raise; end if;
    end;
  end loop;

  insert into public.secret_players(room_id, device_token_hash, seat, name)
  values (v_room.id, public.secret_token_hash(p_device_token), 1, trim(p_name))
  returning * into v_player;

  update public.secret_rooms set owner_player_id = v_player.id where id = v_room.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.join_secret_room(
  p_room_code text,
  p_name text,
  p_device_token uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_existing public.secret_players;
  v_seat integer;
begin
  if trim(p_name) <> all(array['一山','阿禾','小满','青川','南星','木木','可乐','石榴','松风','朝露','云舟','听雨']) then
    raise exception 'INVALID_NAME';
  end if;

  select * into v_room
  from public.secret_rooms
  where code = trim(p_room_code)
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_existing
  from public.secret_players
  where room_id = v_room.id
    and device_token_hash = public.secret_token_hash(p_device_token);

  if found then
    update public.secret_players
    set name = trim(p_name), last_seen_at = now()
    where id = v_existing.id;
    return public.secret_room_payload(v_room.id, p_device_token);
  end if;

  if v_room.status <> 'lobby' then raise exception 'ROOM_STARTED'; end if;
  if (select count(*) from public.secret_players where room_id = v_room.id) >= v_room.max_players then
    raise exception 'ROOM_FULL';
  end if;

  select candidate into v_seat
  from generate_series(1, v_room.max_players) candidate
  where not exists (
    select 1 from public.secret_players player
    where player.room_id = v_room.id and player.seat = candidate
  )
  order by candidate
  limit 1;

  insert into public.secret_players(room_id, device_token_hash, seat, name)
  values (v_room.id, public.secret_token_hash(p_device_token), v_seat, trim(p_name));
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.get_secret_room(p_room_code text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
begin
  select id into v_room_id from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  update public.secret_players
  set last_seen_at = now()
  where room_id = v_room_id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  return public.secret_room_payload(v_room_id, p_device_token);
end;
$$;

create or replace function public.start_secret_room(p_room_code text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_self_id uuid;
begin
  select room.* into v_room
  from public.secret_rooms room
  join public.secret_players player on player.room_id = room.id
  where room.code = trim(p_room_code)
    and player.device_token_hash = public.secret_token_hash(p_device_token)
  for update of room;
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select id into v_self_id from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if v_self_id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;
  if v_room.status <> 'lobby' then raise exception 'INVALID_ROOM_STATUS'; end if;
  if (select count(*) from public.secret_players where room_id = v_room.id) < 3 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  update public.secret_rooms set status = 'playing', started_at = now() where id = v_room.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.set_secret_room_status(
  p_room_code text,
  p_device_token uuid,
  p_status text,
  p_reviewed_on date default null
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_self_id uuid;
begin
  select room.* into v_room
  from public.secret_rooms room
  join public.secret_players player on player.room_id = room.id
  where room.code = trim(p_room_code)
    and player.device_token_hash = public.secret_token_hash(p_device_token)
  for update of room;
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select id into v_self_id from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if v_self_id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;

  if p_status = 'review' and v_room.status = 'playing' then
    update public.secret_rooms
    set status = 'review', current_review_on = coalesce(p_reviewed_on, current_date)
    where id = v_room.id;
  elsif p_status = 'playing' and v_room.status = 'review' then
    update public.secret_rooms set status = 'playing' where id = v_room.id;
  elsif p_status = 'ended' and v_room.status in ('lobby', 'playing', 'review') then
    if exists (
      select 1 from public.secret_score_claims
      where room_id = v_room.id and status = 'pending'
    ) then raise exception 'PENDING_CLAIMS'; end if;
    update public.secret_rooms set status = 'ended', ended_at = now() where id = v_room.id;
  else
    raise exception 'INVALID_ROOM_STATUS';
  end if;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.claim_secret_score(
  p_room_code text,
  p_device_token uuid,
  p_task_uid text,
  p_task_code text,
  p_task_id text,
  p_points integer,
  p_target_name text,
  p_witness_id uuid,
  p_played_on date
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
begin
  if p_points not between 1 and 3 then raise exception 'INVALID_SCORE'; end if;

  select * into v_room from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'playing' then raise exception 'INVALID_ROOM_STATUS'; end if;

  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if exists (
    select 1 from public.secret_score_claims
    where task_uid = left(p_task_uid, 80) and player_id = v_player.id
  ) then return public.secret_room_payload(v_room.id, p_device_token); end if;
  if not (
    (p_task_id ~ '^L(0[1-9]|1[0-2])$' and p_points = 1)
    or (p_task_id ~ '^M(0[1-9]|10)$' and p_points = 2)
    or (p_task_id ~ '^H0[1-8]$' and p_points = 3)
  ) then raise exception 'INVALID_TASK'; end if;
  if p_played_on < current_date - 1 or p_played_on > current_date + 1 then
    raise exception 'INVALID_PLAY_DATE';
  end if;
  if (
    select count(*) from public.secret_score_claims
    where room_id = v_room.id and player_id = v_player.id and played_on = p_played_on
  ) >= 2 then raise exception 'DAILY_LIMIT'; end if;
  if not exists (
    select 1 from public.secret_players
    where id = p_witness_id and room_id = v_room.id and id <> v_player.id
  ) then raise exception 'INVALID_WITNESS'; end if;

  insert into public.secret_score_claims(
    room_id, player_id, witness_id, task_uid, task_code, task_id,
    points, target_name, played_on
  ) values (
    v_room.id, v_player.id, p_witness_id, left(p_task_uid, 80),
    left(p_task_code, 32), left(p_task_id, 12), p_points,
    left(p_target_name, 40), p_played_on
  ) on conflict (task_uid) do nothing;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.resolve_secret_score(
  p_room_code text,
  p_device_token uuid,
  p_claim_id uuid,
  p_approved boolean
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_witness public.secret_players;
  v_claim public.secret_score_claims;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_witness from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select * into v_claim from public.secret_score_claims
  where id = p_claim_id and room_id = v_room.id
  for update;
  if not found then raise exception 'CLAIM_NOT_FOUND'; end if;
  if v_claim.witness_id <> v_witness.id then raise exception 'WITNESS_ONLY'; end if;

  if v_claim.status = 'pending' then
    update public.secret_score_claims
    set status = case when p_approved then 'approved' else 'rejected' end,
        resolved_at = now()
    where id = v_claim.id;

    if p_approved then
      update public.secret_players
      set total_score = total_score + v_claim.points
      where id = v_claim.player_id;
    end if;
  end if;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.save_secret_review(
  p_room_code text,
  p_device_token uuid,
  p_note text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'review' or v_room.current_review_on is null then
    raise exception 'INVALID_ROOM_STATUS';
  end if;

  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if trim(coalesce(p_note, '')) <> all(array[
    '最好笑的一次', '最巧妙的一次', '最默契的一次',
    '最意外的一次', '今天很顺利', '期待明天继续'
  ]) then raise exception 'INVALID_REVIEW'; end if;

  insert into public.secret_reviews(room_id, player_id, reviewed_on, note, updated_at)
  values (v_room.id, v_player.id, v_room.current_review_on, left(trim(coalesce(p_note, '')), 120), now())
  on conflict (player_id, reviewed_on) do update set
    note = excluded.note,
    updated_at = now();

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.award_secret_review(
  p_room_code text,
  p_device_token uuid,
  p_player_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_owner public.secret_players;
  v_inserted integer;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'review' or v_room.current_review_on is null then
    raise exception 'INVALID_ROOM_STATUS';
  end if;

  select * into v_owner from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_owner.id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;
  if not exists (
    select 1 from public.secret_players where id = p_player_id and room_id = v_room.id
  ) then raise exception 'INVALID_PLAYER'; end if;

  insert into public.secret_review_awards(room_id, reviewed_on, player_id, awarded_by)
  values (v_room.id, v_room.current_review_on, p_player_id, v_owner.id)
  on conflict (room_id, reviewed_on) do nothing;
  get diagnostics v_inserted = row_count;

  if v_inserted = 1 then
    update public.secret_players set total_score = total_score + 1 where id = p_player_id;
  end if;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.delete_secret_room(p_room_code text, p_device_token uuid)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_self_id uuid;
begin
  select room.* into v_room
  from public.secret_rooms room
  join public.secret_players player on player.room_id = room.id
  where room.code = trim(p_room_code)
    and player.device_token_hash = public.secret_token_hash(p_device_token)
  for update of room;
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select id into v_self_id from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if v_self_id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;
  if v_room.status <> 'ended' then raise exception 'ROOM_NOT_ENDED'; end if;

  delete from public.secret_rooms where id = v_room.id;
  return true;
end;
$$;

revoke all on function public.secret_token_hash(uuid) from public, anon, authenticated;
revoke all on function public.secret_room_payload(uuid, uuid) from public, anon, authenticated;

revoke all on function public.create_secret_room(text, uuid, integer) from public, authenticated;
revoke all on function public.join_secret_room(text, text, uuid) from public, authenticated;
revoke all on function public.get_secret_room(text, uuid) from public, authenticated;
revoke all on function public.start_secret_room(text, uuid) from public, authenticated;
revoke all on function public.set_secret_presence(text, uuid, boolean) from public, authenticated;
revoke all on function public.set_secret_room_status(text, uuid, text, date) from public, authenticated;
revoke all on function public.claim_secret_score(text, uuid, text, text, text, integer, text, uuid, date) from public, authenticated;
revoke all on function public.resolve_secret_score(text, uuid, uuid, boolean) from public, authenticated;
revoke all on function public.save_secret_review(text, uuid, text) from public, authenticated;
revoke all on function public.award_secret_review(text, uuid, uuid) from public, authenticated;
revoke all on function public.delete_secret_room(text, uuid) from public, authenticated;

grant execute on function public.create_secret_room(text, uuid, integer) to anon;
grant execute on function public.join_secret_room(text, text, uuid) to anon;
grant execute on function public.get_secret_room(text, uuid) to anon;
grant execute on function public.start_secret_room(text, uuid) to anon;
grant execute on function public.set_secret_presence(text, uuid, boolean) to anon;
grant execute on function public.set_secret_room_status(text, uuid, text, date) to anon;
grant execute on function public.claim_secret_score(text, uuid, text, text, text, integer, text, uuid, date) to anon;
grant execute on function public.resolve_secret_score(text, uuid, uuid, boolean) to anon;
grant execute on function public.save_secret_review(text, uuid, text) to anon;
grant execute on function public.award_secret_review(text, uuid, uuid) to anon;
grant execute on function public.delete_secret_room(text, uuid) to anon;
