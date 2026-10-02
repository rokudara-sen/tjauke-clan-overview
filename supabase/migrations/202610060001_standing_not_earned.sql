-- Elder, Clan Leader and Ancient are conferred by the clan and the Council, not earned through one undertaking,
-- so a record conferring senior standing cannot cite an undertaking. Run once after 202610050001_household_seniors.sql.
-- Records that already do are kept unchanged (NOT VALID); the next edit of one has to clear its undertaking.
begin;
alter table public.promotions add constraint promotions_standing_not_earned
 check ("hunt" is null or "rank" not in ('Elder','Clan Leader','Ancient')) not valid;
commit;
