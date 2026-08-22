-- DropForeignKey
ALTER TABLE "Option" DROP CONSTRAINT "Option_questionId_fkey";

-- DropForeignKey
ALTER TABLE "ProctoringEvent" DROP CONSTRAINT "ProctoringEvent_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "Response" DROP CONSTRAINT "Response_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "Score" DROP CONSTRAINT "Score_attemptId_fkey";

-- DropForeignKey
ALTER TABLE "Section" DROP CONSTRAINT "Section_testId_fkey";

-- DropIndex
DROP INDEX "Option_questionId_idx";

-- DropIndex
DROP INDEX "Response_attemptId_idx";

-- DropIndex
DROP INDEX "Section_testId_idx";

-- AlterTable
ALTER TABLE "Question" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "QuestionBank" ADD COLUMN     "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "Test" ADD COLUMN     "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- CreateIndex
CREATE UNIQUE INDEX "Option_questionId_order_key" ON "Option"("questionId", "order");

-- CreateIndex
CREATE INDEX "Response_questionId_idx" ON "Response"("questionId");

-- CreateIndex
CREATE UNIQUE INDEX "Section_testId_order_key" ON "Section"("testId", "order");

-- AddForeignKey
ALTER TABLE "Option" ADD CONSTRAINT "Option_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Section" ADD CONSTRAINT "Section_testId_fkey" FOREIGN KEY ("testId") REFERENCES "Test"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Response" ADD CONSTRAINT "Response_questionId_fkey" FOREIGN KEY ("questionId") REFERENCES "Question"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Score" ADD CONSTRAINT "Score_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ProctoringEvent" ADD CONSTRAINT "ProctoringEvent_attemptId_fkey" FOREIGN KEY ("attemptId") REFERENCES "Attempt"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- CheckConstraint: keep raw-percentage cutoff within a valid 0-100 range at the DB layer,
-- not just at the Zod boundary (lib/schemas already enforces this, this is a backstop).
ALTER TABLE "Test" ADD CONSTRAINT "Test_cutoffPercent_range"
  CHECK ("cutoffPercent" IS NULL OR ("cutoffPercent" >= 0 AND "cutoffPercent" <= 100));

-- CheckConstraint: difficulty is a provisional 0-1 calibration score (see Question.difficulty comment).
ALTER TABLE "Question" ADD CONSTRAINT "Question_difficulty_range"
  CHECK (difficulty >= 0 AND difficulty <= 1);

-- CheckConstraint: a section must have a positive time limit and serve at least one question.
ALTER TABLE "Section" ADD CONSTRAINT "Section_timeLimitSec_positive"
  CHECK ("timeLimitSec" > 0);

ALTER TABLE "Section" ADD CONSTRAINT "Section_questionCount_positive"
  CHECK ("questionCount" > 0);
