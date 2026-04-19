ALTER TABLE "campaign" ADD COLUMN "linkedin_ids" uuid[];
UPDATE "campaign" SET "linkedin_ids" = '{}' WHERE true;
ALTER TABLE "campaign" ALTER COLUMN "linkedin_ids" SET NOT NULL;
