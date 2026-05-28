-- AlterTable
ALTER TABLE "Election" ADD COLUMN IF NOT EXISTS "dashboardDismissedAt" TIMESTAMP(3);
