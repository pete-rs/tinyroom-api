import { Response } from 'express';
import { AuthRequest } from '../types';
import { prisma } from '../config/prisma';
import { AppError } from '../middleware/errorHandler';

/**
 * Improved user search with multiple strategies
 */
export const searchUsersOptimized = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;
    const page = parseInt(req.query.page as string) || 1;
    const limit = parseInt(req.query.limit as string) || 20;
    const offset = (page - 1) * limit;

    if (!q || typeof q !== 'string' || q.trim().length === 0) {
      throw new AppError(400, 'INVALID_QUERY', 'Search query parameter (q) is required');
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const searchTerm = q.trim().toLowerCase();
    
    // Strategy 1: Exact match (highest priority)
    // Strategy 2: Starts with (high priority)
    // Strategy 3: Contains (medium priority)
    // Strategy 4: Fuzzy match (low priority)
    
    const users = await prisma.$queryRaw<Array<{
      id: string;
      username: string;
      first_name: string;
      email: string;
      avatar_url: string | null;
      followers_count: number;
      following_count: number;
      following: boolean;
      follows_me: boolean;
      match_score: number;
    }>>`
      WITH search_results AS (
        SELECT 
          u.id,
          u.username,
          u.first_name,
          u.email,
          u.avatar_url,
          u.followers_count,
          u.following_count,
          CASE WHEN f1.id IS NOT NULL THEN true ELSE false END as following,
          CASE WHEN f2.id IS NOT NULL THEN true ELSE false END as follows_me,
          -- Calculate match score for better ranking
          CASE
            -- Exact matches get highest score
            WHEN LOWER(u.username) = ${searchTerm} THEN 100
            WHEN LOWER(u.first_name) = ${searchTerm} THEN 95
            -- Starts with matches
            WHEN LOWER(u.username) LIKE ${searchTerm + '%'} THEN 
              80 - LENGTH(u.username) + LENGTH(${searchTerm})
            WHEN LOWER(u.first_name) LIKE ${searchTerm + '%'} THEN 
              75 - LENGTH(u.first_name) + LENGTH(${searchTerm})
            -- Contains matches
            WHEN LOWER(u.username) LIKE ${'%' + searchTerm + '%'} THEN 50
            WHEN LOWER(u.first_name) LIKE ${'%' + searchTerm + '%'} THEN 45
            -- Fuzzy matches using similarity (if available)
            ELSE 0
          END as match_score
        FROM users u
        LEFT JOIN follows f1 ON f1.following_id = u.id AND f1.follower_id = ${req.user.id}
        LEFT JOIN follows f2 ON f2.follower_id = u.id AND f2.following_id = ${req.user.id}
        WHERE 
          u.id != ${req.user.id}
          AND u.first_name != ''
          AND NOT u.username LIKE 'user_%'
          AND (
            LOWER(u.username) LIKE ${'%' + searchTerm + '%'}
            OR LOWER(u.first_name) LIKE ${'%' + searchTerm + '%'}
          )
      )
      SELECT * FROM search_results
      WHERE match_score > 0
      ORDER BY 
        match_score DESC,
        followers_count DESC,
        username ASC
      LIMIT ${limit}
      OFFSET ${offset}
    `;

    // Get total count
    const totalCount = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*)::bigint as count
      FROM users u
      WHERE 
        u.id != ${req.user.id}
        AND u.first_name != ''
        AND NOT u.username LIKE 'user_%'
        AND (
          LOWER(u.username) LIKE ${'%' + searchTerm + '%'}
          OR LOWER(u.first_name) LIKE ${'%' + searchTerm + '%'}
        )
    `;

    const total = Number(totalCount[0].count);

    // Transform to camelCase and remove internal score
    const transformedUsers = users.map(({ match_score, ...user }) => ({
      id: user.id,
      username: user.username,
      firstName: user.first_name,
      email: user.email,
      avatarUrl: user.avatar_url,
      followersCount: user.followers_count,
      followingCount: user.following_count,
      following: user.following,
      followsMe: user.follows_me,
    }));

    res.json({
      data: transformedUsers,
      meta: {
        total,
        page,
        limit,
        hasMore: total > offset + limit,
        query: q,
      },
    });
  } catch (error) {
    throw error;
  }
};

/**
 * Get search suggestions (autocomplete)
 */
export const getSearchSuggestions = async (req: AuthRequest, res: Response) => {
  try {
    const { q } = req.query;

    if (!q || typeof q !== 'string' || q.trim().length < 2) {
      return res.json({ data: [] });
    }

    if (!req.user) {
      throw new AppError(401, 'UNAUTHORIZED', 'User not authenticated');
    }

    const searchTerm = q.trim().toLowerCase();
    
    // Get top 5 suggestions
    const suggestions = await prisma.$queryRaw<Array<{
      username: string;
      first_name: string;
    }>>`
      SELECT DISTINCT username, first_name
      FROM users
      WHERE 
        id != ${req.user.id}
        AND first_name != ''
        AND NOT username LIKE 'user_%'
        AND (
          LOWER(username) LIKE ${searchTerm + '%'}
          OR LOWER(first_name) LIKE ${searchTerm + '%'}
        )
      ORDER BY 
        CASE 
          WHEN LOWER(username) LIKE ${searchTerm + '%'} THEN 0
          ELSE 1
        END,
        username
      LIMIT 5
    `;

    const transformedSuggestions = suggestions.map(s => ({
      username: s.username,
      firstName: s.first_name,
      displayText: `${s.first_name} (@${s.username})`,
    }));

    res.json({
      data: transformedSuggestions,
    });
  } catch (error) {
    throw error;
  }
};