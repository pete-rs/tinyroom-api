-- AlterTable
ALTER TABLE "elements" ADD COLUMN     "rotation" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "scale_x" DOUBLE PRECISION NOT NULL DEFAULT 1,
ADD COLUMN     "scale_y" DOUBLE PRECISION NOT NULL DEFAULT 1;
