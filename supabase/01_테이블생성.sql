-- =====================================================================
-- 실행연구소 어드민 ─ 테이블 생성 (한 번만 실행)
-- Supabase 대시보드 → 왼쪽 SQL Editor → 통째로 붙여넣고 Run
-- =====================================================================
-- 설계 메모
--  * 사이트(index.html)는 "읽기만", 어드민(admin.html)은 "읽고 쓰기".
--  * 지금 어드민 로그인은 비밀번호 한 개짜리라 Supabase 계정 개념이 없다.
--    그래서 쓰기도 anon(공개키)에게 열어둔다. 나중에 Supabase Auth를 붙이면
--    아래 "쓰기" 정책만 authenticated 로 바꾸면 된다. (주석에 표시해둠)
--  * 정렬은 sort 컬럼(작을수록 위). 어드민에서 순서 바꾸면 이 값이 갱신된다.
-- =====================================================================

-- ─────────────── 1. 서비스 카드 ───────────────
create table if not exists public.services (
  id         uuid primary key default gen_random_uuid(),
  sort       int  not null default 0,          -- 노출 순서(작을수록 앞)
  title      text not null default '새 서비스',
  descr      text not null default '',          -- 설명 (desc는 SQL 예약어라 descr)
  tags       text[] not null default '{}',      -- 태그 목록
  url        text not null default '',          -- 클릭 시 이동할 주소
  image      text not null default '',          -- 카드 이미지 주소
  has_link   boolean not null default false,    -- 링크 있는 카드인지(호버 미리보기)
  soon       boolean not null default false,    -- 준비중 표시
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────── 2. 담당자 ───────────────
create table if not exists public.team_members (
  id         uuid primary key default gen_random_uuid(),
  sort       int  not null default 0,
  dept       text not null default '',          -- 부서명
  name       text not null default '',
  role       text not null default '',          -- 직책
  bio        text not null default '',          -- 소개 멘트
  photo      text not null default '',          -- 사진 주소
  qr         text not null default '',          -- 카톡 QR 이미지 주소
  kakao      text not null default '',          -- 카톡 프로필 링크
  qrmode     text not null default '',          -- '' | small | under | cta
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────── 3. 레퍼런스 카드 ───────────────
create table if not exists public.refs (
  id         uuid primary key default gen_random_uuid(),
  sort       int  not null default 0,
  caption    text not null default '',
  image      text not null default '',
  url        text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ─────────────── 4. 사이트 멘트(문구) ───────────────
-- 키-값 한 줄씩. 예) key='hero_title', value='마케팅의 이유…'
create table if not exists public.copy (
  key        text primary key,
  value      text not null default '',
  updated_at timestamptz not null default now()
);

-- ─────────────── 5. 상담/문의 접수 ───────────────
create table if not exists public.inquiries (
  id         uuid primary key default gen_random_uuid(),
  name       text not null default '',
  phone      text not null default '',
  email      text not null default '',
  message    text not null default '',
  status     text not null default 'pending',   -- pending | done
  memo       text not null default '',          -- 관리자 메모
  created_at timestamptz not null default now()
);

-- ─────────────── 6. 변경 히스토리 ───────────────
create table if not exists public.history (
  id         bigserial primary key,
  area       text not null default '',          -- team | svc | refs | copy | inq
  action     text not null default '',          -- 무엇을 했는지
  detail     text not null default '',
  created_at timestamptz not null default now()
);

-- =====================================================================
-- 보안(RLS) — 켜고, 정책으로 열어준다
-- =====================================================================
alter table public.services     enable row level security;
alter table public.team_members enable row level security;
alter table public.refs         enable row level security;
alter table public.copy         enable row level security;
alter table public.inquiries    enable row level security;
alter table public.history      enable row level security;

-- 사이트 방문자: 콘텐츠 4종은 읽기만 가능
drop policy if exists "read services"  on public.services;
drop policy if exists "read team"      on public.team_members;
drop policy if exists "read refs"      on public.refs;
drop policy if exists "read copy"      on public.copy;
create policy "read services" on public.services     for select using (true);
create policy "read team"     on public.team_members for select using (true);
create policy "read refs"     on public.refs         for select using (true);
create policy "read copy"     on public.copy         for select using (true);

-- 어드민: 콘텐츠 4종 쓰기
--   ※ Supabase Auth 붙이면 아래 to anon → to authenticated 로만 바꾸면 됨
drop policy if exists "write services"  on public.services;
drop policy if exists "write team"      on public.team_members;
drop policy if exists "write refs"      on public.refs;
drop policy if exists "write copy"      on public.copy;
create policy "write services" on public.services     for all to anon using (true) with check (true);
create policy "write team"     on public.team_members for all to anon using (true) with check (true);
create policy "write refs"     on public.refs         for all to anon using (true) with check (true);
create policy "write copy"     on public.copy         for all to anon using (true) with check (true);

-- 문의: 방문자는 "넣기만", 읽기·수정·삭제는 어드민만
--   → 남의 개인정보가 공개로 새지 않게 select를 막는다.
--   ※ 지금 어드민도 anon이라 임시로 열어둔다. Auth 붙이면 이 두 줄만 authenticated로.
drop policy if exists "insert inquiry" on public.inquiries;
drop policy if exists "manage inquiry" on public.inquiries;
create policy "insert inquiry" on public.inquiries for insert to anon with check (true);
create policy "manage inquiry" on public.inquiries for all    to anon using (true) with check (true);

-- 히스토리: 어드민 전용
drop policy if exists "manage history" on public.history;
create policy "manage history" on public.history for all to anon using (true) with check (true);

-- =====================================================================
-- 조회 속도용 인덱스
-- =====================================================================
create index if not exists services_sort_idx  on public.services(sort);
create index if not exists team_sort_idx      on public.team_members(sort);
create index if not exists refs_sort_idx      on public.refs(sort);
create index if not exists inq_created_idx    on public.inquiries(created_at desc);
create index if not exists hist_created_idx   on public.history(created_at desc);

-- 끝. 왼쪽 Table Editor 에 테이블 6개가 보이면 성공.
