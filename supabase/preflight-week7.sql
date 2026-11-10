-- 7주차 restaurants가 있는 프로젝트에서 schema.sql을 실행하기 전에 확인합니다.
-- 결과가 있으면 표시된 ID의 해당 열을 확인·수정하고 0행이 될 때까지 다시 실행합니다.
select r.id, c.field, c.current_value
from public.restaurants as r
cross join lateral (
  values
    ('name', r.name, length(btrim(r.name)) between 1 and 300),
    ('category', r.category, length(btrim(r.category)) between 1 and 300),
    ('location', r.location, length(btrim(r.location)) between 1 and 300),
    ('rating', r.rating::text, r.rating between 0 and 5),
    ('likes', r.likes::text, r.likes >= 0)
) as c(field, current_value, is_valid)
where not c.is_valid
order by r.id, c.field;
