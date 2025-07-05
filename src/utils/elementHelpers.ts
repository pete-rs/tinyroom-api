import { prisma } from '../config/prisma';
import { userSelect } from './prismaSelects';

export async function getElementsWithReactions(roomId: string, userId: string) {
  // Get elements (reactions and comments are now at room level)
  const elements = await prisma.element.findMany({
    where: {
      roomId,
      deletedAt: null,
    },
    include: {
      creator: {
        select: userSelect,
      },
    },
    orderBy: {
      zIndex: 'asc',
    },
  });

  // Return elements without reaction/comment data (now at room level)
  return elements.map(element => ({
    id: element.id,
    roomId: element.roomId,
    type: element.type,
    createdBy: element.createdBy,
    positionX: element.positionX,
    positionY: element.positionY,
    content: element.content,
    imageUrl: element.imageUrl,
    audioUrl: element.audioUrl,
    videoUrl: element.videoUrl,
    thumbnailUrl: element.thumbnailUrl,
    duration: element.duration,
    width: element.width,
    height: element.height,
    rotation: element.rotation,
    scaleX: element.scaleX,
    scaleY: element.scaleY,
    stickerText: element.stickerText,
    zIndex: element.zIndex,
    createdAt: element.createdAt,
    updatedAt: element.updatedAt,
    creator: element.creator,
    // Legacy fields for backward compatibility - always empty
    reactions: {
      count: 0,
      hasReacted: false,
      userEmoji: null,
      topReactors: [],
    },
    comments: {
      count: 0,
    },
  }));
}