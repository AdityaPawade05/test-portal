-- AlterTable
ALTER TABLE "Attempt" ADD COLUMN     "sectionState" JSONB;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "cutoffPercent" DOUBLE PRECISION;
