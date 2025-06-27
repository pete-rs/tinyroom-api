import { prisma } from '../config/prisma';
import { userSelect } from './prismaSelects';

export async function getElementsWithReactions(roomId: string, userId: string) {
  // Get elements with their reactions and comment counts
  const elementsWithReactions = await prisma.$queryRaw<any[]>`
    WITH reaction_stats AS (
      SELECT 
        er.element_id,
        COUNT(DISTINCT er.user_id) as reaction_count,
        BOOL_OR(er.user_id = ${userId}) as has_reacted,
        (SELECT emoji FROM element_reactions WHERE element_id = er.element_id AND user_id = ${userId} LIMIT 1) as user_emoji,
        (
          SELECT json_agg(
            json_build_object(
              'id', u.id,
              'username', u.username,
              'firstName', u.first_name,
              'avatarUrl', u.avatar_url,
              'emoji', er2.emoji
            ) ORDER BY er2.created_at
          )
          FROM (
            SELECT * FROM element_reactions
            WHERE element_id = er.element_id
            ORDER BY created_at
            LIMIT 3
          ) er2
          JOIN users u ON u.id = er2.user_id
        ) as top_reactors
      FROM element_reactions er
      GROUP BY er.element_id
    ),
    comment_stats AS (
      SELECT 
        ec.element_id,
        COUNT(*) as comment_count
      FROM element_comments ec
      WHERE ec.deleted_at IS NULL
      GROUP BY ec.element_id
    )
    SELECT 
      e.id,
      e.room_id,
      e.type,
      e.created_by,
      e.position_x,
      e.position_y,
      e.content,
      e.image_url,
      e.audio_url,
      e.video_url,
      e.thumbnail_url,
      e.duration,
      e.width,
      e.height,
      e.rotation,
      e.scale_x,
      e.scale_y,
      e.created_at,
      e.updated_at,
      json_build_object(
        'id', creator.id,
        'username', creator.username,
        'firstName', creator.first_name,
        'avatarUrl', creator.avatar_url
      ) as creator,
      COALESCE(rs.reaction_count, 0) as reaction_count,
      COALESCE(rs.has_reacted, false) as has_reacted,
      rs.user_emoji,
      COALESCE(rs.top_reactors, '[]'::json) as top_reactors,
      COALESCE(cs.comment_count, 0) as comment_count
    FROM elements e
    JOIN users creator ON creator.id = e.created_by
    LEFT JOIN reaction_stats rs ON rs.element_id = e.id
    LEFT JOIN comment_stats cs ON cs.element_id = e.id
    WHERE e.room_id = ${roomId} AND e.deleted_at IS NULL
    ORDER BY e.created_at ASC
  `;

  // Transform the raw data into the expected format
  return elementsWithReactions.map(element => ({
    id: element.id,
    roomId: element.room_id,
    type: element.type,
    createdBy: element.created_by,
    positionX: element.position_x,
    positionY: element.position_y,
    content: element.content,
    imageUrl: element.image_url,
    audioUrl: element.audio_url,
    videoUrl: element.video_url,
    thumbnailUrl: element.thumbnail_url,
    duration: element.duration,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    scaleX: element.scale_x,
    scaleY: element.scale_y,
    createdAt: element.created_at,
    updatedAt: element.updated_at,
    creator: element.creator,
    reactions: {
      count: Number(element.reaction_count),
      hasReacted: element.has_reacted,
      userEmoji: element.user_emoji || null,
      topReactors: element.top_reactors || [],
    },
    comments: {
      count: Number(element.comment_count),
    },
  }));
}