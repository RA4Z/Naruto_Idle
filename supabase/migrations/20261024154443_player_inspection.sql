begin;
create function public.social_inspect_player(p_user uuid) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare target uuid := coalesce(p_user,auth.uid()); p jsonb; s jsonb; id text; level_value integer; training integer; gear jsonb := '{}'::jsonb;
begin
  p:=public.social_profile(target);
  select snapshot into s from public.game_saves where user_id=target;
  if s is null then return jsonb_build_object('profile',p,'character',null); end if;
  id:=s->>'activeEntityId';
  if id is null then
    id:=case s->>'character' when 'naruto' then '11000101' when 'sasuke' then '11000211' when 'sakura' then '11000301' end;
  end if;
  if id is null or id !~ '^[0-9]{8}$' then return jsonb_build_object('profile',p,'character',null); end if;
  level_value:=case when s->>'level' ~ '^[0-9]{1,6}$' then least(10000,greatest(1,(s->>'level')::integer)) else 1 end;
  training:=case when s->>'upgrades' ~ '^[0-9]{1,5}$' then least(10000,greatest(0,(s->>'upgrades')::integer)) else 0 end;
  select coalesce(jsonb_object_agg(e.key,e.value),'{}'::jsonb) into gear
    from jsonb_each_text(case when jsonb_typeof(s->'equipment')='object' then s->'equipment' else '{}'::jsonb end) e
    join (values
      ('kunai-treino','weapon',1),
      ('kunai-reforcada','weapon',1),
      ('colete-shinobi','armor',1),
      ('amuleto-chakra','charm',1),
      ('lamina-assalto-2','weapon',5),
      ('bastao-guardiao-2','weapon',5),
      ('selo-canalizador-2','weapon',5),
      ('traje-assalto-2','armor',5),
      ('armadura-guardiao-2','armor',5),
      ('manto-canalizador-2','armor',5),
      ('talisma-assalto-2','charm',5),
      ('talisma-guardiao-2','charm',5),
      ('talisma-canalizador-2','charm',5),
      ('lamina-assalto-3','weapon',12),
      ('bastao-guardiao-3','weapon',12),
      ('selo-canalizador-3','weapon',12),
      ('traje-assalto-3','armor',12),
      ('armadura-guardiao-3','armor',12),
      ('manto-canalizador-3','armor',12),
      ('talisma-assalto-3','charm',12),
      ('talisma-guardiao-3','charm',12),
      ('talisma-canalizador-3','charm',12),
      ('headband-shinobi-1','headband',1),
      ('scroll-shinobi-1','scroll',1),
      ('headband-shinobi-2','headband',5),
      ('scroll-shinobi-2','scroll',5),
      ('headband-shinobi-3','headband',12),
      ('scroll-shinobi-3','scroll',12)
    ) catalog(item_id,slot,required_level)
      on catalog.item_id=e.value and catalog.slot=e.key and catalog.required_level<=level_value
    where case when s->'inventory'->>catalog.item_id ~ '^[0-9]{1,12}$'
      then (s->'inventory'->>catalog.item_id)::bigint>0 else false end;
  return jsonb_build_object('profile',p,'character',
    jsonb_build_object('id',id,'level',level_value,'upgrades',training,'equipment',gear));
end $$;
revoke all on function public.social_inspect_player(uuid) from public,anon,authenticated;
grant execute on function public.social_inspect_player(uuid) to authenticated;
commit;
