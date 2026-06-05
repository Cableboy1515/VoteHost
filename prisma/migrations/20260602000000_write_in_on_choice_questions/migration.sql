-- ============================================================
-- Write-in options on choice questions + review lifecycle
-- (Idempotent: DB may have been pre-seeded via prisma db push)
-- ============================================================

-- 1. Ensure COMMENT exists on QuestionType (rename from WRITE_IN if present, add if absent)
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM pg_enum e JOIN pg_type t ON e.enumtypid = t.oid
             WHERE t.typname = 'QuestionType' AND e.enumlabel = 'WRITE_IN') THEN
    ALTER TYPE "QuestionType" RENAME VALUE 'WRITE_IN' TO 'COMMENT';
  END IF;
END $$;
ALTER TYPE "QuestionType" ADD VALUE IF NOT EXISTS 'COMMENT';

-- 2. Add PENDING_REVIEW to ElectionStatus
ALTER TYPE "ElectionStatus" ADD VALUE IF NOT EXISTS 'PENDING_REVIEW' BEFORE 'COMPLETED';

-- 3. Add allowWriteIn to Question
ALTER TABLE "Question" ADD COLUMN IF NOT EXISTS "allowWriteIn" BOOLEAN NOT NULL DEFAULT false;

-- 4. Add finalization audit fields to Election
ALTER TABLE "Election" ADD COLUMN IF NOT EXISTS "finalizedAt"               TIMESTAMP(3);
ALTER TABLE "Election" ADD COLUMN IF NOT EXISTS "finalizedById"             TEXT;
ALTER TABLE "Election" ADD COLUMN IF NOT EXISTS "normalizationManifestHash" TEXT;

-- 5. Create WriteInMerge overlay table
CREATE TABLE IF NOT EXISTS "WriteInMerge" (
    "id"             TEXT NOT NULL,
    "electionId"     TEXT NOT NULL,
    "questionId"     TEXT NOT NULL,
    "rawText"        TEXT NOT NULL,
    "canonicalLabel" TEXT NOT NULL,
    "mergedById"     TEXT NOT NULL,
    "mergedByEmail"  TEXT NOT NULL,
    "createdAt"      TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "WriteInMerge_pkey" PRIMARY KEY ("id")
);

-- FK constraints (ignore if already exist)
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WriteInMerge_electionId_fkey') THEN
    ALTER TABLE "WriteInMerge" ADD CONSTRAINT "WriteInMerge_electionId_fkey"
        FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'WriteInMerge_questionId_fkey') THEN
    ALTER TABLE "WriteInMerge" ADD CONSTRAINT "WriteInMerge_questionId_fkey"
        FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;

-- Uniqueness index
CREATE UNIQUE INDEX IF NOT EXISTS "WriteInMerge_electionId_questionId_rawText_key"
    ON "WriteInMerge"("electionId", "questionId", "rawText");

-- Lookup index for tally overlay
CREATE INDEX IF NOT EXISTS "WriteInMerge_electionId_questionId_idx"
    ON "WriteInMerge"("electionId", "questionId");
