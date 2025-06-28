-- CreateIndex: Add indexes for user search performance
CREATE INDEX "users_username_idx" ON "users"("username");
CREATE INDEX "users_first_name_idx" ON "users"("first_name");

-- CreateIndex: Add composite index for username and first_name searches
CREATE INDEX "users_username_first_name_idx" ON "users"("username", "first_name");

-- CreateIndex: Add lowercase indexes for case-insensitive searches
CREATE INDEX "users_username_lower_idx" ON "users"(LOWER("username"));
CREATE INDEX "users_first_name_lower_idx" ON "users"(LOWER("first_name"));

-- CreateIndex: Add pattern matching indexes for LIKE queries
CREATE INDEX "users_username_pattern_ops_idx" ON "users"("username" varchar_pattern_ops);
CREATE INDEX "users_first_name_pattern_ops_idx" ON "users"("first_name" varchar_pattern_ops);