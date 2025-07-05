import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';
import { Prisma } from '@prisma/client';

export const searchUsersForMentions = async (req: AuthRequest, res: Response) => {
  try {
    const { prefix = '', roomId, limit = '10' } = req.query;
    const limitNum = Math.min(parseInt(limit as string), 20); // Max 20 results

    console.log(`\n🔍 [MENTION SEARCH] User ${req.user?.username} searching for prefix: "${prefix}", room: ${roomId}, limit: ${limitNum}`);

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    // If roomId is provided, check room access and privacy
    let roomParticipantIds: string[] | undefined;
    let shouldFilterByRoom = false;
    
    if (roomId) {
      const room = await prisma.room.findFirst({
        where: {
          id: roomId as string,
          OR: [
            // User is a participant
            {
              participants: {
                some: {
                  userId: req.user.id,
                },
              },
            },
            // OR room is public
            {
              isPublic: true,
            },
          ],
        },
        select: {
          isPublic: true,
          participants: {
            select: {
              userId: true,
            },
          },
        },
      });

      if (!room) {
        throw new AppError(403, 'FORBIDDEN', 'You do not have access to this room');
      }

      // For private rooms, only search participants
      // For public rooms, search all users
      if (!room.isPublic) {
        shouldFilterByRoom = true;
        roomParticipantIds = room.participants.map(p => p.userId);
        console.log(`🔍 [MENTION SEARCH] Private room - limiting to ${roomParticipantIds.length} participants`);
      } else {
        console.log(`🔍 [MENTION SEARCH] Public room - searching all users`);
      }
    }

    // Build the query
    let users;
    const prefixLower = (prefix as string).toLowerCase();
    
    if (!prefix || prefix === '') {
      // No prefix: return recently active users or popular users
      // For now, just return some users ordered by creation date
      users = await prisma.user.findMany({
        where: {
          id: shouldFilterByRoom && roomParticipantIds ? { in: roomParticipantIds } : undefined,
          // Exclude users with incomplete profiles
          NOT: {
            username: {
              startsWith: 'user_',
            },
          },
        },
        select: {
          id: true,
          username: true,
          firstName: true,
          avatarUrl: true,
        },
        orderBy: {
          createdAt: 'desc',
        },
        take: limitNum,
      });
    } else {
      // With prefix: search for usernames starting with prefix (case-insensitive)
      users = await prisma.$queryRaw<Array<{
        id: string;
        username: string;
        first_name: string;
        avatar_url: string | null;
      }>>`
        SELECT 
          id,
          username,
          first_name,
          avatar_url
        FROM users
        WHERE 
          LOWER(username) LIKE ${prefixLower + '%'}
          AND username NOT LIKE 'user_%'
          ${shouldFilterByRoom && roomParticipantIds ? Prisma.sql`AND id IN (${Prisma.join(roomParticipantIds)})` : Prisma.empty}
        ORDER BY 
          CASE 
            WHEN LOWER(username) = ${prefixLower} THEN 0
            ELSE 1
          END,
          username ASC
        LIMIT ${limitNum}
      `;

      // Transform snake_case to camelCase
      users = users.map(user => ({
        id: user.id,
        username: user.username,
        firstName: user.first_name,
        avatarUrl: user.avatar_url,
      }));
    }

    console.log(`🔍 [MENTION SEARCH] Found ${users.length} users for prefix "${prefix}"`);
    
    if (users.length > 0) {
      console.log(`🔍 [MENTION SEARCH] First 3 results:`, 
        users.slice(0, 3).map(u => ({ username: u.username, firstName: u.firstName }))
      );
    }

    res.json({
      data: users,
    });
  } catch (error) {
    console.error('❌ [MENTION SEARCH] Error:', error);
    throw error;
  }
};

// Validate mentioned users exist (for comment submission)
export const validateMentionedUsers = async (req: AuthRequest, res: Response) => {
  try {
    const { usernames } = req.body;

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    if (!Array.isArray(usernames) || usernames.length === 0) {
      throw new AppError(400, 'INVALID_INPUT', 'Usernames must be a non-empty array');
    }

    // Limit to 20 usernames
    const limitedUsernames = usernames.slice(0, 20);

    const users = await prisma.user.findMany({
      where: {
        username: {
          in: limitedUsernames,
        },
      },
      select: {
        id: true,
        username: true,
      },
    });

    const usernameToId = new Map(users.map(u => [u.username, u.id]));
    const result = limitedUsernames.map(username => ({
      username,
      userId: usernameToId.get(username) || null,
      exists: usernameToId.has(username),
    }));

    console.log(`✅ [VALIDATE MENTIONS] Validated ${limitedUsernames.length} usernames, ${users.length} exist`);

    res.json({
      data: result,
    });
  } catch (error) {
    console.error('❌ [VALIDATE MENTIONS] Error:', error);
    throw error;
  }
};