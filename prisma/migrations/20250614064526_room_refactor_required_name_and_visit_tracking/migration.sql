/*
  Warnings:

  - Made the column `name` on table `rooms` required. This step will fail if there are existing NULL values in that column.

*/
-- AlterTable
ALTER TABLE "room_participants" ADD COLUMN     "last_visited_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- AlterTable
ALTER TABLE "rooms" ALTER COLUMN "name" SET NOT NULL;
