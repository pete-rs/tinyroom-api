-- AlterEnum
ALTER TYPE "ElementType" ADD VALUE 'VIDEO';

-- AlterTable
ALTER TABLE "elements" ADD COLUMN     "thumbnail_url" TEXT,
ADD COLUMN     "video_url" TEXT;
