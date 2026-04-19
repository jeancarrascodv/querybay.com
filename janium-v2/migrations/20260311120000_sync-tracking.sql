ALTER TABLE "linked_in" ADD COLUMN "last_partial_sync" timestamptz;
ALTER TABLE "linked_in" ADD COLUMN "last_full_sync" timestamptz;
