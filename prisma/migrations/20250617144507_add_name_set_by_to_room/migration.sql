-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "name_set_by" TEXT;

-- AddForeignKey
ALTER TABLE "rooms" ADD CONSTRAINT "rooms_name_set_by_fkey" FOREIGN KEY ("name_set_by") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
