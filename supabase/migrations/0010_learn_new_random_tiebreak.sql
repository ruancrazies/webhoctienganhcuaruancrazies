-- 0010_learn_new_random_tiebreak.sql
-- Danh sách "từ mới" trước đây sắp theo (freq_rank, id). Từ không có rank đều mang freq_rank = 1000000000,
-- nên cả cấp bị xếp theo id = thứ tự nạp = bảng chữ cái. Nay các từ cùng freq_rank được xếp theo `rand`
-- (số ngẫu nhiên cố định của từ) rồi mới đến id: vẫn ổn định giữa các lần gọi nên keyset vẫn đúng,
-- nhưng thứ tự là ngẫu nhiên. Con trỏ giữ nguyên (freq_rank, id); rand của con trỏ được tra theo id.

create index if not exists words_rank_rand_idx on public.words (cefr, domain, freq_rank, rand, id) where status = 'active';

create or replace function public.list_new_words(
  p_user uuid, p_cefr text, p_domain text, p_topic bigint, p_rank int, p_id bigint, p_limit int
) returns table (id bigint, freq_rank int)
language plpgsql stable set search_path = public as $$
declare
  v_rank int    := coalesce(p_rank, -1);
  v_id   bigint := coalesce(p_id, 0);
  v_rand double precision := coalesce((select w.rand from words w where w.id = p_id), -1);
begin
  if p_topic is not null then
    return query
      select w.id, w.freq_rank
        from words w
       where w.status = 'active'
         and exists (select 1 from word_topics t where t.word_id = w.id and t.topic_id = p_topic)
         and not exists (select 1 from user_word_progress p where p.user_id = p_user and p.word_id = w.id)
         and (w.freq_rank, w.rand, w.id) > (v_rank, v_rand, v_id)
       order by w.freq_rank, w.rand, w.id
       limit p_limit;
  else
    return query
      select w.id, w.freq_rank
        from words w
       where w.status = 'active'
         and w.cefr = p_cefr
         and (p_domain = 'all' or w.domain = p_domain)
         and not exists (select 1 from user_word_progress p where p.user_id = p_user and p.word_id = w.id)
         and (w.freq_rank, w.rand, w.id) > (v_rank, v_rand, v_id)
       order by w.freq_rank, w.rand, w.id
       limit p_limit;
  end if;
end $$;
