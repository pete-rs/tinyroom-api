/**
 * Helper functions for thumbnail generation and URL transformation
 */

/**
 * Generate a Cloudinary thumbnail URL on-the-fly
 * @param originalUrl - The original image/video URL
 * @param type - Type of thumbnail: 'square' for 180x180, 'aspect' for preserving ratio
 * @returns Transformed thumbnail URL or null
 */
export function getSmallThumbnailUrl(originalUrl: string | null | undefined, type: 'square' | 'aspect' = 'aspect'): string | null {
  if (!originalUrl) return null;
  
  // Check if it's a Cloudinary URL
  if (!originalUrl.includes('cloudinary.com')) return originalUrl;
  
  // For square thumbnails (180x180 with center crop)
  if (type === 'square') {
    return originalUrl.replace('/upload/', '/upload/w_180,h_180,c_fill,g_center,q_auto,f_auto/');
  }
  
  // For aspect-preserved thumbnails (180px on shortest side)
  return originalUrl.replace('/upload/', '/upload/w_180,h_180,c_limit,q_auto,f_auto/');
}

/**
 * Get appropriate thumbnail URL for an element
 * Prioritizes stored small thumbnail, falls back to on-the-fly generation
 */
export function getElementThumbnailUrl(element: {
  type: string;
  smallThumbnailUrl?: string | null;
  imageUrl?: string | null;
  videoUrl?: string | null;
  thumbnailUrl?: string | null;
}): string | null {
  // If we have a stored small thumbnail, use it
  if (element.smallThumbnailUrl) {
    return element.smallThumbnailUrl;
  }
  
  // Otherwise, generate on-the-fly based on element type
  switch (element.type) {
    case 'PHOTO':
      return getSmallThumbnailUrl(element.imageUrl);
      
    case 'VIDEO':
      // For videos, use the video thumbnail if available
      return getSmallThumbnailUrl(element.thumbnailUrl || element.videoUrl);
      
    default:
      // For other types (AUDIO, NOTE, etc.), no thumbnail
      return null;
  }
}

/**
 * Cloudinary eager transformation options for upload
 */
export const THUMBNAIL_EAGER_OPTIONS = [
  {
    width: 180,
    height: 180,
    crop: 'limit',
    quality: 'auto',
    format: 'auto',
  },
  {
    width: 180,
    height: 180,
    crop: 'fill',
    gravity: 'center',
    quality: 'auto',
    format: 'auto',
  }
];