-- Add email send-status tracking fields to Voter
ALTER TABLE "Voter" ADD COLUMN "lastSendStatus" TEXT;
ALTER TABLE "Voter" ADD COLUMN "lastSendErrorCode" TEXT;
ALTER TABLE "Voter" ADD COLUMN "lastSendErrorMessage" TEXT;
ALTER TABLE "Voter" ADD COLUMN "lastSendAttemptAt" TIMESTAMP(3);
ALTER TABLE "Voter" ADD COLUMN "lastSendProvider" TEXT;

CREATE INDEX "Voter_electionId_lastSendStatus_idx" ON "Voter"("electionId", "lastSendStatus");
