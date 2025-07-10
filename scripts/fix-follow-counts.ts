import { prisma } from '../src/config/prisma';

async function fixFollowCounts() {
  console.log('🔧 Starting follow count fix...\n');

  // Get all users
  const users = await prisma.user.findMany({
    select: {
      id: true,
      username: true,
      followersCount: true,
      followingCount: true,
    },
  });

  console.log(`Found ${users.length} users to check\n`);

  for (const user of users) {
    // Count actual followers
    const actualFollowersCount = await prisma.follow.count({
      where: { followingId: user.id },
    });

    // Count actual following
    const actualFollowingCount = await prisma.follow.count({
      where: { followerId: user.id },
    });

    // Check if update needed
    if (user.followersCount !== actualFollowersCount || user.followingCount !== actualFollowingCount) {
      console.log(`📝 Updating ${user.username}:`);
      console.log(`   Followers: ${user.followersCount} → ${actualFollowersCount}`);
      console.log(`   Following: ${user.followingCount} → ${actualFollowingCount}`);

      // Update the counts
      await prisma.user.update({
        where: { id: user.id },
        data: {
          followersCount: actualFollowersCount,
          followingCount: actualFollowingCount,
        },
      });
    } else {
      console.log(`✅ ${user.username}: Counts are correct`);
    }
  }

  console.log('\n✨ Follow counts fixed!');
}

fixFollowCounts()
  .catch((e) => {
    console.error('Error:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });