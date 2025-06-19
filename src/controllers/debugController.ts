import { Response, Request } from 'express';
import { prisma } from '../config/prisma';

export const getDatabaseStats = async (req: Request, res: Response) => {
  try {
    // Get table sizes
    const tableSizes = await prisma.$queryRaw<Array<{
      table_name: string;
      size: string;
      row_count: bigint;
    }>>`
      SELECT 
        tablename as table_name,
        pg_size_pretty(pg_total_relation_size(schemaname||'.'||tablename)) as size,
        n_live_tup as row_count
      FROM pg_tables
      LEFT JOIN pg_stat_user_tables ON tablename = relname
      WHERE schemaname = 'public'
      ORDER BY pg_total_relation_size(schemaname||'.'||tablename) DESC
    `;

    // Get row counts for main tables
    const [userCount, roomCount, elementCount, messageCount] = await Promise.all([
      prisma.user.count(),
      prisma.room.count(),
      prisma.element.count(),
      prisma.message.count(),
    ]);

    res.json({
      totalDatabaseSize: '1.25 GB (from Railway dashboard)',
      tableSizes: tableSizes.map(t => ({
        ...t,
        row_count: Number(t.row_count)
      })),
      rowCounts: {
        users: userCount,
        rooms: roomCount,
        elements: elementCount,
        messages: messageCount,
      }
    });
  } catch (error) {
    console.error('Database stats error:', error);
    res.status(500).json({ error: 'Failed to get database stats' });
  }
};