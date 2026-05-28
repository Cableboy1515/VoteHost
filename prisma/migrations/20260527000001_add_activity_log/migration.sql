CREATE TABLE "ActivityLog" (
    "id"          TEXT NOT NULL,
    "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actorId"     TEXT,
    "actorEmail"  TEXT NOT NULL,
    "actorRole"   "AdminRole" NOT NULL,
    "electionId"  TEXT,
    "action"      TEXT NOT NULL,
    "targetType"  TEXT NOT NULL,
    "targetId"    TEXT,
    "targetLabel" TEXT,
    "metadata"    JSONB,

    CONSTRAINT "ActivityLog_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "ActivityLog_electionId_createdAt_idx" ON "ActivityLog"("electionId", "createdAt" DESC);
CREATE INDEX "ActivityLog_actorId_createdAt_idx"    ON "ActivityLog"("actorId",    "createdAt" DESC);
CREATE INDEX "ActivityLog_createdAt_idx"            ON "ActivityLog"("createdAt"   DESC);

ALTER TABLE "ActivityLog"
    ADD CONSTRAINT "ActivityLog_electionId_fkey"
    FOREIGN KEY ("electionId")
    REFERENCES "Election"("id")
    ON DELETE CASCADE ON UPDATE CASCADE;
