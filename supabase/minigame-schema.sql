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

alter table public.secret_rooms
  add column if not exists hidden_editor_player_id uuid,
  add column if not exists hidden_assignee_player_id uuid,
  add column if not exists hidden_task_status text not null default 'unassigned',
  add column if not exists hidden_task_text text,
  add column if not exists hidden_task_uid text,
  add column if not exists hidden_task_code text,
  add column if not exists hidden_task_submitted_at timestamptz,
  add column if not exists hidden_task_claimed_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'secret_rooms_owner_player_id_fkey'
  ) then
    alter table public.secret_rooms
      add constraint secret_rooms_owner_player_id_fkey
      foreign key (owner_player_id) references public.secret_players(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'secret_rooms_hidden_editor_player_id_fkey'
  ) then
    alter table public.secret_rooms
      add constraint secret_rooms_hidden_editor_player_id_fkey
      foreign key (hidden_editor_player_id) references public.secret_players(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'secret_rooms_hidden_assignee_player_id_fkey'
  ) then
    alter table public.secret_rooms
      add constraint secret_rooms_hidden_assignee_player_id_fkey
      foreign key (hidden_assignee_player_id) references public.secret_players(id) on delete set null;
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'secret_rooms_hidden_task_status_check'
  ) then
    alter table public.secret_rooms
      add constraint secret_rooms_hidden_task_status_check
      check (hidden_task_status in ('unassigned', 'editing', 'ready', 'claimed'));
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

create or replace function public.secret_text_is_allowed(p_text text)
returns boolean
language sql
immutable
security definer
set search_path = public, extensions
as $$
  select trim(coalesce(p_text, '')) <> ''
    and trim(p_text) !~ '[[:cntrl:]]'
    and trim(p_text) !~* '(习近平|共产党|六四|色情|成人视频|裸聊|性交易|强奸|乱伦|赌博|博彩|下注|毒品|冰毒|海洛因|枪支|炸弹|恐怖主义|自杀|杀人|砍人|诈骗|洗钱|代开发票|辱骂|歧视|纳粹|邪教|加微信|联系方式|手机号|身份证|银行卡|密码|转账|付款|偷拍|陌生人)';
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
    ), '[]'::jsonb),
    'hiddenTask', jsonb_build_object(
      'status', v_room.hidden_task_status,
      'isEditor', v_self.id = v_room.hidden_editor_player_id,
      'needsSubmission', v_room.hidden_task_status = 'editing',
      'availableForSelf', v_self.id = v_room.hidden_assignee_player_id
        and v_room.hidden_task_status in ('ready', 'claimed'),
      'taskUid', case
        when v_self.id = v_room.hidden_assignee_player_id then v_room.hidden_task_uid
        else null
      end
    )
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
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 12
    or not public.secret_text_is_allowed(p_name) then
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
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 12
    or not public.secret_text_is_allowed(p_name) then
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

  if v_room.status <> 'lobby' or v_room.started_at is not null then raise exception 'ROOM_STARTED'; end if;
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

create or replace function public.update_secret_name(
  p_room_code text,
  p_device_token uuid,
  p_name text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room_id uuid;
begin
  if char_length(trim(coalesce(p_name, ''))) not between 1 and 12
    or not public.secret_text_is_allowed(p_name) then
    raise exception 'INVALID_NAME';
  end if;

  select id into v_room_id
  from public.secret_rooms
  where code = trim(p_room_code) and status <> 'ended';
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  update public.secret_players
  set name = trim(p_name), last_seen_at = now()
  where room_id = v_room_id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  return public.secret_room_payload(v_room_id, p_device_token);
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
  v_editor_id uuid;
  v_assignee_id uuid;
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
  if (select count(*) from public.secret_players where room_id = v_room.id and is_present) < 3 then
    raise exception 'NOT_ENOUGH_PLAYERS';
  end if;

  if v_room.hidden_task_status = 'unassigned' then
    select id into v_editor_id
    from public.secret_players
    where room_id = v_room.id and is_present
    order by random()
    limit 1;

    select id into v_assignee_id
    from public.secret_players
    where room_id = v_room.id and is_present and id <> v_editor_id
    order by random()
    limit 1;

    update public.secret_rooms
    set hidden_editor_player_id = v_editor_id,
        hidden_assignee_player_id = v_assignee_id,
        hidden_task_status = 'editing'
    where id = v_room.id;
  elsif v_room.hidden_task_status <> 'editing' then
    raise exception 'INVALID_ROOM_STATUS';
  end if;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.submit_secret_hidden_task(
  p_room_code text,
  p_device_token uuid,
  p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_editor public.secret_players;
  v_description text;
begin
  select * into v_room
  from public.secret_rooms
  where code = trim(p_room_code)
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_editor
  from public.secret_players
  where room_id = v_room.id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_editor.id <> v_room.hidden_editor_player_id then
    raise exception 'HIDDEN_TASK_EDITOR_ONLY';
  end if;
  if v_room.status <> 'lobby' or v_room.hidden_task_status <> 'editing' then
    raise exception 'HIDDEN_TASK_LOCKED';
  end if;

  v_description := regexp_replace(trim(coalesce(p_description, '')), '[[:space:]]+', ' ', 'g');
  if char_length(v_description) not between 8 and 80
    or v_description ~ '[[:cntrl:]]' then
    raise exception 'INVALID_HIDDEN_TASK';
  end if;
  if v_description ~* '(亲吻|接吻|脱衣|裸露|打人|踢人|推人|绊倒|灌酒|喝酒|抽烟|药物|转账|付款|密码|证件|护照|行李|偷拿|偷拍|陌生人|开车|驾驶|闯红灯|攀爬|高处|下水|游泳|违法|侮辱|辱骂|歧视|性行为|赌博)' then
    raise exception 'UNSAFE_HIDDEN_TASK';
  end if;

  update public.secret_rooms
  set hidden_task_text = v_description,
      hidden_task_uid = 'hidden-' || gen_random_uuid()::text,
      hidden_task_code = 'X01-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 3)),
      hidden_task_status = 'ready',
      hidden_task_submitted_at = now(),
      status = 'playing',
      started_at = now()
  where id = v_room.id;

  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.take_secret_hidden_task(
  p_room_code text,
  p_device_token uuid
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
  select * into v_room
  from public.secret_rooms
  where code = trim(p_room_code)
  for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'playing' then raise exception 'INVALID_ROOM_STATUS'; end if;

  select * into v_player
  from public.secret_players
  where room_id = v_room.id
    and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_player.id <> v_room.hidden_assignee_player_id then
    raise exception 'HIDDEN_TASK_NOT_ASSIGNED';
  end if;
  if v_room.hidden_task_status not in ('ready', 'claimed')
    or v_room.hidden_task_text is null
    or v_room.hidden_task_uid is null then
    raise exception 'HIDDEN_TASK_NOT_READY';
  end if;

  if v_room.hidden_task_status = 'ready' then
    update public.secret_rooms
    set hidden_task_status = 'claimed', hidden_task_claimed_at = now()
    where id = v_room.id;
  end if;

  return jsonb_build_object(
    'task', jsonb_build_object(
      'uid', v_room.hidden_task_uid,
      'taskId', 'X01',
      'code', v_room.hidden_task_code,
      'score', 3,
      'targetName', '本轮隐藏任务',
      'description', v_room.hidden_task_text,
      'isHidden', true
    ),
    'room', public.secret_room_payload(v_room.id, p_device_token)
  );
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
    (p_task_id ~ '^L(0[1-9]|[12][0-9]|3[0-9]|40)$' and p_points = 1)
    or (p_task_id ~ '^M(0[1-9]|[12][0-9]|3[0-5])$' and p_points = 2)
    or (p_task_id ~ '^H(0[1-9]|1[0-9]|2[0-5])$' and p_points = 3)
    or (
      p_task_id = 'X01'
      and p_points = 3
      and v_room.hidden_assignee_player_id = v_player.id
      and v_room.hidden_task_status = 'claimed'
      and v_room.hidden_task_uid = left(p_task_uid, 80)
      and v_room.hidden_task_code = left(p_task_code, 32)
    )
  ) then raise exception 'INVALID_TASK'; end if;
  if p_played_on < current_date - 1 or p_played_on > current_date + 1 then
    raise exception 'INVALID_PLAY_DATE';
  end if;
  if (
    select count(*) from public.secret_score_claims
    where room_id = v_room.id
      and player_id = v_player.id
      and created_at > now() - interval '6 hours'
  ) >= 3 then raise exception 'DAILY_LIMIT'; end if;
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
revoke all on function public.submit_secret_hidden_task(text, uuid, text) from public, authenticated;
revoke all on function public.take_secret_hidden_task(text, uuid) from public, authenticated;
revoke all on function public.set_secret_presence(text, uuid, boolean) from public, authenticated;
revoke all on function public.update_secret_name(text, uuid, text) from public, authenticated;
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
grant execute on function public.submit_secret_hidden_task(text, uuid, text) to anon;
grant execute on function public.take_secret_hidden_task(text, uuid) to anon;
grant execute on function public.set_secret_presence(text, uuid, boolean) to anon;
grant execute on function public.update_secret_name(text, uuid, text) to anon;
grant execute on function public.set_secret_room_status(text, uuid, text, date) to anon;
grant execute on function public.claim_secret_score(text, uuid, text, text, text, integer, text, uuid, date) to anon;
grant execute on function public.resolve_secret_score(text, uuid, uuid, boolean) to anon;
grant execute on function public.save_secret_review(text, uuid, text) to anon;
grant execute on function public.award_secret_review(text, uuid, uuid) to anon;
grant execute on function public.delete_secret_room(text, uuid) to anon;

-- Round-based gameplay, bounty tasks, and four-round rewards.
alter table public.secret_rooms
  add column if not exists round_number integer not null default 1,
  add column if not exists round_started_at timestamptz,
  add column if not exists round_deadline timestamptz;

alter table public.secret_score_claims
  add column if not exists round_number integer not null default 1,
  add column if not exists claim_kind text not null default 'mission';

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'secret_score_claims_points_check') then
    alter table public.secret_score_claims drop constraint secret_score_claims_points_check;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'secret_score_claims_points_v2_check') then
    alter table public.secret_score_claims
      add constraint secret_score_claims_points_v2_check check (points between 1 and 5);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'secret_score_claims_kind_check') then
    alter table public.secret_score_claims
      add constraint secret_score_claims_kind_check check (claim_kind in ('mission', 'bounty'));
  end if;
end;
$$;

alter table public.secret_reviews add column if not exists round_number integer not null default 1;
alter table public.secret_review_awards add column if not exists round_number integer not null default 1;

do $$
begin
  if exists (select 1 from pg_constraint where conname = 'secret_reviews_pkey') then
    alter table public.secret_reviews drop constraint secret_reviews_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'secret_reviews_round_pkey') then
    alter table public.secret_reviews
      add constraint secret_reviews_round_pkey primary key (room_id, player_id, round_number);
  end if;
  if exists (select 1 from pg_constraint where conname = 'secret_review_awards_pkey') then
    alter table public.secret_review_awards drop constraint secret_review_awards_pkey;
  end if;
  if not exists (select 1 from pg_constraint where conname = 'secret_review_awards_round_pkey') then
    alter table public.secret_review_awards
      add constraint secret_review_awards_round_pkey primary key (room_id, round_number);
  end if;
end;
$$;

create table if not exists public.secret_round_progress (
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  player_id uuid not null references public.secret_players(id) on delete cascade,
  round_number integer not null check (round_number > 0),
  completed_at timestamptz not null default now(),
  primary key (room_id, player_id, round_number)
);

create table if not exists public.secret_bounties (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  round_number integer not null check (round_number > 1),
  editor_player_id uuid not null references public.secret_players(id) on delete cascade,
  description text,
  task_uid text,
  task_code text,
  status text not null default 'editing' check (status in ('editing', 'ready', 'pending', 'claimed')),
  claimant_player_id uuid references public.secret_players(id) on delete set null,
  claim_id uuid references public.secret_score_claims(id) on delete set null,
  created_at timestamptz not null default now(),
  submitted_at timestamptz,
  claimed_at timestamptz,
  unique (room_id, round_number)
);

create table if not exists public.secret_cycle_rewards (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.secret_rooms(id) on delete cascade,
  cycle_number integer not null check (cycle_number > 0),
  winner_player_id uuid not null references public.secret_players(id) on delete cascade,
  status text not null default 'pending' check (status in ('pending', 'revealed')),
  category text check (category in ('prank', 'honor')),
  result_text text,
  created_at timestamptz not null default now(),
  revealed_at timestamptz,
  unique (room_id, cycle_number)
);

create index if not exists secret_claims_round_idx on public.secret_score_claims(room_id, round_number, status);
create index if not exists secret_progress_round_idx on public.secret_round_progress(room_id, round_number);
create index if not exists secret_bounties_round_idx on public.secret_bounties(room_id, round_number);

alter table public.secret_round_progress enable row level security;
alter table public.secret_bounties enable row level security;
alter table public.secret_cycle_rewards enable row level security;
revoke all on public.secret_round_progress from anon, authenticated;
revoke all on public.secret_bounties from anon, authenticated;
revoke all on public.secret_cycle_rewards from anon, authenticated;

create or replace function public.secret_room_payload(p_room_id uuid, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_self public.secret_players;
  v_bounty public.secret_bounties;
  v_reward public.secret_cycle_rewards;
  v_can_advance boolean;
begin
  select * into v_room from public.secret_rooms where id = p_room_id;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;

  select * into v_self from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  select * into v_bounty from public.secret_bounties
  where room_id = v_room.id and round_number = v_room.round_number;
  select * into v_reward from public.secret_cycle_rewards
  where room_id = v_room.id order by cycle_number desc limit 1;

  v_can_advance := v_room.status = 'playing'
    and not exists (
      select 1 from public.secret_score_claims
      where room_id = v_room.id and round_number = v_room.round_number and status = 'pending'
    )
    and (
      (v_room.round_deadline is not null and now() >= v_room.round_deadline)
      or not exists (
        select 1 from public.secret_players player
        where player.room_id = v_room.id and player.is_present
          and not exists (
            select 1 from public.secret_round_progress progress
            where progress.room_id = v_room.id and progress.player_id = player.id
              and progress.round_number = v_room.round_number
          )
      )
    );

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
    'roundNumber', v_room.round_number,
    'roundStartedAt', v_room.round_started_at,
    'roundDeadline', v_room.round_deadline,
    'canAdvanceRound', v_can_advance,
    'roundDoneCount', (
      select count(*) from public.secret_round_progress
      where room_id = v_room.id and round_number = v_room.round_number
    ),
    'self', jsonb_build_object(
      'id', v_self.id, 'seat', v_self.seat, 'name', v_self.name,
      'isOwner', v_self.id = v_room.owner_player_id
    ),
    'players', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', player.id,
        'seat', player.seat,
        'name', player.name,
        'totalScore', player.total_score,
        'roundScore', coalesce((
          select sum(claim.points) from public.secret_score_claims claim
          where claim.room_id = v_room.id and claim.player_id = player.id
            and claim.round_number = v_room.round_number and claim.status = 'approved'
        ), 0) + case when exists (
          select 1 from public.secret_review_awards award
          where award.room_id = v_room.id and award.player_id = player.id
            and award.round_number = v_room.round_number
        ) then 1 else 0 end,
        'roundDone', exists (
          select 1 from public.secret_round_progress progress
          where progress.room_id = v_room.id and progress.player_id = player.id
            and progress.round_number = v_room.round_number
        ) or (v_room.round_deadline is not null and now() >= v_room.round_deadline),
        'present', player.is_present,
        'online', player.last_seen_at > now() - interval '25 seconds',
        'joinedAt', player.joined_at
      ) order by player.seat)
      from public.secret_players player where player.room_id = v_room.id
    ), '[]'::jsonb),
    'pendingApprovals', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', claim.id, 'playerId', claimant.id, 'playerName', claimant.name,
        'playerSeat', claimant.seat, 'taskCode', claim.task_code,
        'points', claim.points, 'targetName', claim.target_name,
        'playedOn', claim.played_on, 'createdAt', claim.created_at,
        'claimKind', claim.claim_kind, 'roundNumber', claim.round_number
      ) order by claim.created_at)
      from public.secret_score_claims claim
      join public.secret_players claimant on claimant.id = claim.player_id
      where claim.room_id = v_room.id and claim.witness_id = v_self.id and claim.status = 'pending'
    ), '[]'::jsonb),
    'myClaims', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', recent.id, 'taskUid', recent.task_uid, 'taskCode', recent.task_code,
        'points', recent.points, 'status', recent.status,
        'witnessId', recent.witness_id, 'playedOn', recent.played_on,
        'createdAt', recent.created_at, 'claimKind', recent.claim_kind,
        'roundNumber', recent.round_number
      ) order by recent.created_at desc)
      from (
        select claim.* from public.secret_score_claims claim
        where claim.room_id = v_room.id and claim.player_id = v_self.id
        order by claim.created_at desc limit 50
      ) recent
    ), '[]'::jsonb),
    'reviews', coalesce((
      select jsonb_agg(jsonb_build_object(
        'playerId', player.id, 'playerName', player.name, 'playerSeat', player.seat,
        'note', review.note, 'isWinner', award.player_id = player.id,
        'updatedAt', review.updated_at
      ) order by player.seat)
      from public.secret_reviews review
      join public.secret_players player on player.id = review.player_id
      left join public.secret_review_awards award
        on award.room_id = review.room_id and award.round_number = review.round_number
      where review.room_id = v_room.id and review.round_number = v_room.round_number
    ), '[]'::jsonb),
    'hiddenTask', jsonb_build_object(
      'status', v_room.hidden_task_status,
      'isEditor', v_self.id = v_room.hidden_editor_player_id,
      'needsSubmission', v_room.hidden_task_status = 'editing',
      'availableForSelf', v_self.id = v_room.hidden_assignee_player_id
        and v_room.hidden_task_status in ('ready', 'claimed'),
      'taskUid', case when v_self.id = v_room.hidden_assignee_player_id then v_room.hidden_task_uid else null end
    ),
    'bountyTask', case when v_bounty.id is null then jsonb_build_object(
      'status', 'none', 'isEditor', false, 'needsSubmission', false, 'availableToClaim', false
    ) else jsonb_build_object(
      'status', v_bounty.status,
      'isEditor', v_self.id = v_bounty.editor_player_id,
      'needsSubmission', v_bounty.status = 'editing',
      'availableToClaim', v_bounty.status = 'ready',
      'taskUid', v_bounty.task_uid,
      'taskCode', v_bounty.task_code,
      'description', case when v_bounty.status <> 'editing' then v_bounty.description else null end,
      'editorPlayerId', v_bounty.editor_player_id,
      'claimantPlayerId', v_bounty.claimant_player_id,
      'claimantName', (select name from public.secret_players where id = v_bounty.claimant_player_id)
    ) end,
    'cycleReward', case when v_reward.id is null then jsonb_build_object('status', 'none') else jsonb_build_object(
      'cycleNumber', v_reward.cycle_number,
      'status', v_reward.status,
      'winnerPlayerId', v_reward.winner_player_id,
      'winnerName', (select name from public.secret_players where id = v_reward.winner_player_id),
      'isWinner', v_self.id = v_reward.winner_player_id,
      'category', v_reward.category,
      'resultText', v_reward.result_text
    ) end
  );
end;
$$;

create or replace function public.complete_secret_round(p_room_code text, p_device_token uuid)
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
  if v_room.status <> 'playing' then raise exception 'INVALID_ROOM_STATUS'; end if;
  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;

  insert into public.secret_round_progress(room_id, player_id, round_number, completed_at)
  values (v_room.id, v_player.id, v_room.round_number, now())
  on conflict (room_id, player_id, round_number) do update set completed_at = excluded.completed_at;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.submit_secret_bounty_task(
  p_room_code text, p_device_token uuid, p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
  v_bounty public.secret_bounties;
  v_description text;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  select * into v_bounty from public.secret_bounties
  where room_id = v_room.id and round_number = v_room.round_number for update;
  if not found or v_player.id <> v_bounty.editor_player_id then raise exception 'BOUNTY_EDITOR_ONLY'; end if;
  if v_room.status <> 'lobby' or v_bounty.status <> 'editing' then raise exception 'BOUNTY_LOCKED'; end if;

  v_description := regexp_replace(trim(coalesce(p_description, '')), '[[:space:]]+', ' ', 'g');
  if char_length(v_description) not between 8 and 100 or not public.secret_text_is_allowed(v_description) then
    raise exception 'INVALID_BOUNTY_TASK';
  end if;
  if v_description ~* '(亲吻|接吻|脱衣|裸露|打人|踢人|推人|绊倒|灌酒|喝酒|抽烟|药物|转账|付款|密码|证件|护照|行李|偷拿|偷拍|陌生人|开车|驾驶|闯红灯|攀爬|高处|下水|游泳|违法|侮辱|辱骂|歧视|性行为|赌博)' then
    raise exception 'UNSAFE_BOUNTY_TASK';
  end if;

  update public.secret_bounties set
    description = v_description,
    task_uid = 'bounty-' || gen_random_uuid()::text,
    task_code = 'B01-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 3)),
    status = 'ready', submitted_at = now()
  where id = v_bounty.id;
  update public.secret_rooms set
    status = 'playing', round_started_at = now(), round_deadline = now() + interval '2 hours'
  where id = v_room.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.claim_secret_bounty(
  p_room_code text, p_device_token uuid, p_witness_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
  v_bounty public.secret_bounties;
  v_claim_id uuid;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  if v_room.status <> 'playing' then raise exception 'INVALID_ROOM_STATUS'; end if;
  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  select * into v_bounty from public.secret_bounties
  where room_id = v_room.id and round_number = v_room.round_number for update;
  if not found or v_bounty.status <> 'ready' then raise exception 'BOUNTY_ALREADY_CLAIMED'; end if;
  if not exists (
    select 1 from public.secret_players where id = p_witness_id and room_id = v_room.id and id <> v_player.id
  ) then raise exception 'INVALID_WITNESS'; end if;

  insert into public.secret_score_claims(
    room_id, player_id, witness_id, task_uid, task_code, task_id,
    points, target_name, played_on, round_number, claim_kind
  ) values (
    v_room.id, v_player.id, p_witness_id,
    left(v_bounty.task_uid || '-' || gen_random_uuid()::text, 80),
    v_bounty.task_code, 'B01', 5, '全员悬赏', current_date,
    v_room.round_number, 'bounty'
  ) returning id into v_claim_id;

  update public.secret_bounties set
    status = 'pending', claimant_player_id = v_player.id, claim_id = v_claim_id
  where id = v_bounty.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.choose_secret_cycle_reward(
  p_room_code text, p_device_token uuid, p_category text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_player public.secret_players;
  v_reward public.secret_cycle_rewards;
  v_options text[];
  v_result text;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code);
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  select * into v_reward from public.secret_cycle_rewards
  where room_id = v_room.id order by cycle_number desc limit 1 for update;
  if not found or v_reward.winner_player_id <> v_player.id then raise exception 'REWARD_WINNER_ONLY'; end if;
  if v_reward.status <> 'pending' then return public.secret_room_payload(v_room.id, p_device_token); end if;
  if p_category = 'prank' then
    v_options := array[
      '模仿一种动物的叫声', '尝试一种从未尝试过且确认安全的美食',
      '用播音腔介绍下一站', '为大家表演十秒无声慢动作',
      '给本轮旅程起一个夸张片名', '用三个表情演出今天的心情'
    ];
  elsif p_category = 'honor' then
    v_options := array[
      '获得团队摄影师称号', '获得团队最佳路线规划称号',
      '获得旅行气氛担当称号', '获得团队守时之星称号',
      '获得最佳美食发现者称号', '获得本轮最强游侠称号'
    ];
  else raise exception 'INVALID_REWARD_CATEGORY'; end if;
  v_result := v_options[1 + floor(random() * array_length(v_options, 1))::integer];
  update public.secret_cycle_rewards set
    status = 'revealed', category = p_category, result_text = v_result, revealed_at = now()
  where id = v_reward.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.start_secret_next_round(p_room_code text, p_device_token uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_owner public.secret_players;
  v_editor_id uuid;
  v_cycle_winner_id uuid;
  v_next_round integer;
  v_cycle_start integer;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_owner from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_owner.id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;
  if v_room.status <> 'review' then raise exception 'INVALID_ROOM_STATUS'; end if;
  if exists (
    select 1 from public.secret_score_claims
    where room_id = v_room.id and round_number = v_room.round_number and status = 'pending'
  ) then raise exception 'PENDING_CLAIMS'; end if;

  select player.id into v_editor_id
  from public.secret_players player
  where player.room_id = v_room.id
  order by (
    coalesce((select sum(claim.points) from public.secret_score_claims claim
      where claim.room_id = v_room.id and claim.player_id = player.id
        and claim.round_number = v_room.round_number and claim.status = 'approved'), 0)
    + case when exists (select 1 from public.secret_review_awards award
      where award.room_id = v_room.id and award.player_id = player.id
        and award.round_number = v_room.round_number) then 1 else 0 end
  ) desc, random()
  limit 1;

  if mod(v_room.round_number, 4) = 0 then
    v_cycle_start := v_room.round_number - 3;
    select player.id into v_cycle_winner_id
    from public.secret_players player
    where player.room_id = v_room.id
    order by (
      coalesce((select sum(claim.points) from public.secret_score_claims claim
        where claim.room_id = v_room.id and claim.player_id = player.id
          and claim.round_number between v_cycle_start and v_room.round_number
          and claim.status = 'approved'), 0)
      + (select count(*) from public.secret_review_awards award
        where award.room_id = v_room.id and award.player_id = player.id
          and award.round_number between v_cycle_start and v_room.round_number)
    ) desc, random()
    limit 1;
    insert into public.secret_cycle_rewards(room_id, cycle_number, winner_player_id)
    values (v_room.id, v_room.round_number / 4, v_cycle_winner_id)
    on conflict (room_id, cycle_number) do nothing;
  end if;

  v_next_round := v_room.round_number + 1;
  insert into public.secret_bounties(room_id, round_number, editor_player_id)
  values (v_room.id, v_next_round, v_editor_id)
  on conflict (room_id, round_number) do nothing;
  update public.secret_rooms set
    round_number = v_next_round, status = 'lobby', current_review_on = null,
    round_started_at = null, round_deadline = null
  where id = v_room.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.set_secret_room_status(
  p_room_code text, p_device_token uuid, p_status text, p_reviewed_on date default null
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
  select room.* into v_room from public.secret_rooms room
  join public.secret_players player on player.room_id = room.id
  where room.code = trim(p_room_code)
    and player.device_token_hash = public.secret_token_hash(p_device_token)
  for update of room;
  if not found then raise exception 'INVALID_MEMBER'; end if;
  select id into v_self_id from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if v_self_id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;

  if p_status = 'review' and v_room.status = 'playing' then
    if exists (select 1 from public.secret_score_claims
      where room_id = v_room.id and round_number = v_room.round_number and status = 'pending') then
      raise exception 'PENDING_CLAIMS';
    end if;
    if (v_room.round_deadline is null or now() < v_room.round_deadline) and exists (
      select 1 from public.secret_players player
      where player.room_id = v_room.id and player.is_present
        and not exists (select 1 from public.secret_round_progress progress
          where progress.room_id = v_room.id and progress.player_id = player.id
            and progress.round_number = v_room.round_number)
    ) then raise exception 'ROUND_NOT_READY'; end if;
    update public.secret_rooms set
      status = 'review', current_review_on = coalesce(p_reviewed_on, current_date)
    where id = v_room.id;
  elsif p_status = 'ended' and v_room.status in ('lobby', 'playing', 'review') then
    if exists (select 1 from public.secret_score_claims
      where room_id = v_room.id and status = 'pending') then raise exception 'PENDING_CLAIMS'; end if;
    update public.secret_rooms set status = 'ended', ended_at = now() where id = v_room.id;
  else raise exception 'INVALID_ROOM_STATUS'; end if;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.claim_secret_score(
  p_room_code text, p_device_token uuid, p_task_uid text, p_task_code text,
  p_task_id text, p_points integer, p_target_name text, p_witness_id uuid, p_played_on date
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
  if exists (select 1 from public.secret_score_claims
    where task_uid = left(p_task_uid, 80) and player_id = v_player.id) then
    return public.secret_room_payload(v_room.id, p_device_token);
  end if;
  if not (
    (p_task_id ~ '^L(0[1-9]|[12][0-9]|3[0-9]|40)$' and p_points = 1)
    or (p_task_id ~ '^M(0[1-9]|[12][0-9]|3[0-5])$' and p_points = 2)
    or (p_task_id ~ '^H(0[1-9]|1[0-9]|2[0-5])$' and p_points = 3)
    or (p_task_id = 'X01' and p_points = 3
      and v_room.hidden_assignee_player_id = v_player.id
      and v_room.hidden_task_status = 'claimed'
      and v_room.hidden_task_uid = left(p_task_uid, 80)
      and v_room.hidden_task_code = left(p_task_code, 32))
  ) then raise exception 'INVALID_TASK'; end if;
  if p_played_on < current_date - 1 or p_played_on > current_date + 1 then raise exception 'INVALID_PLAY_DATE'; end if;
  if (select count(*) from public.secret_score_claims
    where room_id = v_room.id and player_id = v_player.id and claim_kind = 'mission'
      and created_at > now() - interval '6 hours') >= 3 then raise exception 'DAILY_LIMIT'; end if;
  if not exists (select 1 from public.secret_players
    where id = p_witness_id and room_id = v_room.id and id <> v_player.id) then
    raise exception 'INVALID_WITNESS';
  end if;
  insert into public.secret_score_claims(
    room_id, player_id, witness_id, task_uid, task_code, task_id,
    points, target_name, played_on, round_number, claim_kind
  ) values (
    v_room.id, v_player.id, p_witness_id, left(p_task_uid, 80),
    left(p_task_code, 32), left(p_task_id, 12), p_points,
    left(p_target_name, 40), p_played_on, v_room.round_number, 'mission'
  ) on conflict (task_uid) do nothing;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.resolve_secret_score(
  p_room_code text, p_device_token uuid, p_claim_id uuid, p_approved boolean
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
  where id = p_claim_id and room_id = v_room.id for update;
  if not found then raise exception 'CLAIM_NOT_FOUND'; end if;
  if v_claim.witness_id <> v_witness.id then raise exception 'WITNESS_ONLY'; end if;

  if v_claim.status = 'pending' then
    update public.secret_score_claims set
      status = case when p_approved then 'approved' else 'rejected' end, resolved_at = now()
    where id = v_claim.id;
    if p_approved then
      update public.secret_players set total_score = total_score + v_claim.points where id = v_claim.player_id;
    end if;
    if v_claim.claim_kind = 'bounty' then
      if p_approved then
        update public.secret_bounties set status = 'claimed', claimed_at = now()
        where claim_id = v_claim.id;
      else
        update public.secret_bounties set
          status = 'ready', claimant_player_id = null, claim_id = null
        where claim_id = v_claim.id;
      end if;
    end if;
  end if;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.save_secret_review(
  p_room_code text, p_device_token uuid, p_note text
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
  if v_room.status <> 'review' or v_room.current_review_on is null then raise exception 'INVALID_ROOM_STATUS'; end if;
  select * into v_player from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if trim(coalesce(p_note, '')) <> all(array[
    '最好笑的一次', '最巧妙的一次', '最默契的一次',
    '最意外的一次', '今天很顺利', '期待明天继续'
  ]) then raise exception 'INVALID_REVIEW'; end if;
  insert into public.secret_reviews(room_id, player_id, reviewed_on, round_number, note, updated_at)
  values (v_room.id, v_player.id, v_room.current_review_on, v_room.round_number,
    left(trim(coalesce(p_note, '')), 120), now())
  on conflict (room_id, player_id, round_number) do update set note = excluded.note, updated_at = now();
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.award_secret_review(
  p_room_code text, p_device_token uuid, p_player_id uuid
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
  if v_room.status <> 'review' or v_room.current_review_on is null then raise exception 'INVALID_ROOM_STATUS'; end if;
  select * into v_owner from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_owner.id <> v_room.owner_player_id then raise exception 'OWNER_ONLY'; end if;
  if not exists (select 1 from public.secret_players where id = p_player_id and room_id = v_room.id) then
    raise exception 'INVALID_PLAYER';
  end if;
  insert into public.secret_review_awards(room_id, reviewed_on, round_number, player_id, awarded_by)
  values (v_room.id, v_room.current_review_on, v_room.round_number, p_player_id, v_owner.id)
  on conflict (room_id, round_number) do nothing;
  get diagnostics v_inserted = row_count;
  if v_inserted = 1 then
    update public.secret_players set total_score = total_score + 1 where id = p_player_id;
  end if;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

create or replace function public.submit_secret_hidden_task(
  p_room_code text, p_device_token uuid, p_description text
)
returns jsonb
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_room public.secret_rooms;
  v_editor public.secret_players;
  v_description text;
begin
  select * into v_room from public.secret_rooms where code = trim(p_room_code) for update;
  if not found then raise exception 'ROOM_NOT_FOUND'; end if;
  select * into v_editor from public.secret_players
  where room_id = v_room.id and device_token_hash = public.secret_token_hash(p_device_token);
  if not found then raise exception 'INVALID_MEMBER'; end if;
  if v_editor.id <> v_room.hidden_editor_player_id then raise exception 'HIDDEN_TASK_EDITOR_ONLY'; end if;
  if v_room.status <> 'lobby' or v_room.hidden_task_status <> 'editing' then raise exception 'HIDDEN_TASK_LOCKED'; end if;
  v_description := regexp_replace(trim(coalesce(p_description, '')), '[[:space:]]+', ' ', 'g');
  if char_length(v_description) not between 8 and 80 or not public.secret_text_is_allowed(v_description) then
    raise exception 'INVALID_HIDDEN_TASK';
  end if;
  if v_description ~* '(亲吻|接吻|脱衣|裸露|打人|踢人|推人|绊倒|灌酒|喝酒|抽烟|药物|转账|付款|密码|证件|护照|行李|偷拿|偷拍|陌生人|开车|驾驶|闯红灯|攀爬|高处|下水|游泳|违法|侮辱|辱骂|歧视|性行为|赌博)' then
    raise exception 'UNSAFE_HIDDEN_TASK';
  end if;
  update public.secret_rooms set
    hidden_task_text = v_description,
    hidden_task_uid = 'hidden-' || gen_random_uuid()::text,
    hidden_task_code = 'X01-' || upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 3)),
    hidden_task_status = 'ready', hidden_task_submitted_at = now(),
    status = 'playing', started_at = coalesce(started_at, now()),
    round_started_at = now(), round_deadline = now() + interval '2 hours'
  where id = v_room.id;
  return public.secret_room_payload(v_room.id, p_device_token);
end;
$$;

revoke all on function public.secret_text_is_allowed(text) from public, anon, authenticated;
revoke all on function public.complete_secret_round(text, uuid) from public, authenticated;
revoke all on function public.submit_secret_bounty_task(text, uuid, text) from public, authenticated;
revoke all on function public.claim_secret_bounty(text, uuid, uuid) from public, authenticated;
revoke all on function public.choose_secret_cycle_reward(text, uuid, text) from public, authenticated;
revoke all on function public.start_secret_next_round(text, uuid) from public, authenticated;
grant execute on function public.complete_secret_round(text, uuid) to anon;
grant execute on function public.submit_secret_bounty_task(text, uuid, text) to anon;
grant execute on function public.claim_secret_bounty(text, uuid, uuid) to anon;
grant execute on function public.choose_secret_cycle_reward(text, uuid, text) to anon;
grant execute on function public.start_secret_next_round(text, uuid) to anon;
