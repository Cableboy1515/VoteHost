-- ============================================================
-- Write-in options on choice questions + review lifecycle
-- ============================================================

-- 1. Rename WRITE_IN → COMMENT on QuestionType (value rename, no data rewrite)
ALTER TYPE "QuestionType" RENAME VALUE 'WRITE_IN' TO 'COMMENT';

-- 2. Add PENDING_REVIEW to ElectionStatus
ALTER TYPE "ElectionStatus" ADD VALUE 'PENDING_REVIEW' BEFORE 'COMPLETED';

-- 3. Add allowWriteIn to Question
ALTER TABLE "Question" ADD COLUMN "allowWriteIn" BOOLEAN NOT NULL DEFAULT false;

-- 4. Add finalization audit fields to Election
ALTER TABLE "Election" ADD COLUMN "finalizedAt"               TIMESTAMP(3);
ALTER TABLE "Election" ADD COLUMN "finalizedById"             TEXT;
ALTER TABLE "Election" ADD COLUMN "normalizationManifestHash" TEXT;

-- 5. Create WriteInMerge overlay table
CREATE TABLE "WriteInMerge" (
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

-- FK constraints
ALTER TABLE "WriteInMerge" ADD CONSTRAINT "WriteInMerge_electionId_fkey"
    FOREIGN KEY ("electionId") REFERENCES "Election"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WriteInMerge" ADD CONSTRAINT "WriteInMerge_questionId_fkey"
    FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Uniqueness: one canonical mapping per raw string per question
CREATE UNIQUE INDEX "WriteInMerge_electionId_questionId_rawText_key"
    ON "WriteInMerge"("electionId", "questionId", "rawText");

-- Lookup index for tally overlay
CREATE INDEX "WriteInMerge_electionId_questionId_idx"
    ON "WriteInMerge"("electionId", "questionId");
