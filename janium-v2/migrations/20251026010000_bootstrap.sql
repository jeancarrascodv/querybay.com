insert into "team" values ('00000000-0000-0000-0000-000000000000','Bootstrap','UTC','{}');
insert into "user_team_map" values ('00000000-0000-0000-0000-000000000000', '00000000-0000-0000-0000-000000000000','00000000-0000-0000-0000-000000000000','1',now());

alter table "user" add column "default_team_id" uuid references "team"("id");

update "user" set "default_team_id" = (
  select coalesce("team_id", '00000000-0000-0000-0000-000000000000')
  from "user_team_map"
  where "user_team_map"."user_id" = "user"."id"
);

alter table "user" alter column "default_team_id" set not null;