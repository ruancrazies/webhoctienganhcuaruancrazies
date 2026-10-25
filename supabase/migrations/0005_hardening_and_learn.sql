-- 0005_hardening_and_learn.sql
--  (1) rate_limits: tự dọn các cửa sổ cũ của MỌI key (trước đây chỉ dọn cùng key → key dùng một lần tích tụ mãi).
--  (2) Hai hàm liệt kê từ cho chế độ Học: "từ mới" (chưa có tiến độ) và "ôn lại" (đã có tiến độ).
-- Chỉ service_role được gọi (như các hàm ở 0003).

-- ---------------------------------------------------------------------
-- (1) Dọn rate_limits
-- ---------------------------------------------------------------------
create index if not exists rate_limits_window_idx on public.rate_limits (window_start);

create or replace function public.hit_rate_limit(p_key text, p_window_seconds int, p_max int)
returns boolean language plpgsql set search_path = public as $$
declare
  v_start timestamptz;
  v_count int;
begin
  v_start := to_timestamp(floor(extract(epoch from now()) / p_window_seconds) * p_window_seconds);
  insert into rate_limits (key, window_start, count) values (p_key, v_start, 1)
  on conflict (key, window_start) do update set count = rate_limits.count + 1
  returning count into v_count;

  -- cửa sổ cũ của cùng key
  delete from rate_limits
   where key = p_key and window_start < v_start - make_interval(secs => p_window_seconds * 2);

  -- dọn toàn cục ~1% số lần gọi: mọi cửa sổ dùng trong ứng dụng đều ≤ 1 ngày nên > 2 ngày là chắc chắn hết hạn
  if random() < 0.01 then
    delete from rate_limits where window_start < now() - interval '2 days';
  end if;

  return v_count <= p_max;
end $$;

-- Dọn một lần ngay khi chạy migration
delete from public.rate_limits where window_start < now() - interval '2 days';

-- ---------------------------------------------------------------------
-- (2) Danh sách từ mới: chưa có dòng tiến độ nào của người dùng. Keyset (freq_rank, id).
-- ---------------------------------------------------------------------
create or replace function public.list_new_words(
  p_user uuid, p_cefr text, p_domain text, p_topic bigint, p_rank int, p_id bigint, p_limit int
) returns table (id bigint, freq_rank int)
language plpgsql stable set search_path = public as $$
declare
  v_rank int    := coalesce(p_rank, -1);
  v_id   bigint := coalesce(p_id, 0);
begin
  if p_topic is not null then
    return query
      select w.id, w.freq_rank
        from words w
       where w.status = 'active'
         and exists (select 1 from word_topics t where t.word_id = w.id and t.topic_id = p_topic)
         and not exists (select 1 from user_word_progress p where p.user_id = p_user and p.word_id = w.id)
         and (w.freq_rank, w.id) > (v_rank, v_id)
       order by w.freq_rank, w.id
       limit p_limit;
  else
    return query
      select w.id, w.freq_rank
        from words w
       where w.status = 'active'
         and w.cefr = p_cefr
         and (p_domain = 'all' or w.domain = p_domain)
         and not exists (select 1 from user_word_progress p where p.user_id = p_user and p.word_id = w.id)
         and (w.freq_rank, w.id) > (v_rank, v_id)
       order by w.freq_rank, w.id
       limit p_limit;
  end if;
end $$;

-- ---------------------------------------------------------------------
-- Danh sách ôn lại: từ ĐÃ có tiến độ, đến hạn trước (next_review tăng dần).
-- Con trỏ dùng micro-giây (bigint) để không mất độ chính xác của timestamptz.
-- ---------------------------------------------------------------------
create or replace function public.list_review_words(
  p_user uuid, p_cefr text, p_domain text, p_topic bigint, p_after_us bigint, p_id bigint, p_limit int
) returns table (id bigint, next_us bigint)
language plpgsql stable set search_path = public as $$
declare
  v_ts timestamptz := case when p_after_us is null then '-infinity'::timestamptz
                           else 'epoch'::timestamptz + p_after_us * interval '1 microsecond' end;
  v_id bigint := coalesce(p_id, 0);
begin
  if p_topic is not null then
    return query
      select p.word_id, (extract(epoch from p.next_review) * 1000000)::bigint
        from user_word_progress p
        join words w on w.id = p.word_id and w.status = 'active'
       where p.user_id = p_user
         and exists (select 1 from word_topics t where t.word_id = p.word_id and t.topic_id = p_topic)
         and (p.next_review, p.word_id) > (v_ts, v_id)
       order by p.next_review, p.word_id
       limit p_limit;
  else
    return query
      select p.word_id, (extract(epoch from p.next_review) * 1000000)::bigint
        from user_word_progress p
        join words w on w.id = p.word_id and w.status = 'active'
       where p.user_id = p_user
         and p.cefr = p_cefr
         and (p_domain = 'all' or p.domain = p_domain)
         and (p.next_review, p.word_id) > (v_ts, v_id)
       order by p.next_review, p.word_id
       limit p_limit;
  end if;
end $$;

revoke all on function public.list_new_words(uuid, text, text, bigint, int, bigint, int)    from public, anon, authenticated;
revoke all on function public.list_review_words(uuid, text, text, bigint, bigint, bigint, int) from public, anon, authenticated;
grant execute on function public.list_new_words(uuid, text, text, bigint, int, bigint, int)    to service_role;
grant execute on function public.list_review_words(uuid, text, text, bigint, bigint, bigint, int) to service_role;
