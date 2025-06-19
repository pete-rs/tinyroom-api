/**
 * Configuration for element transform support
 * Allows phased rollout of transform features by element type
 */

import { ElementType } from '@prisma/client';

export interface TransformCapabilities {
  enabled: boolean;
  minScale: number;
  maxScale: number;
  rotationEnabled: boolean;
  aspectRatioLocked: boolean;
  snapRotation?: boolean;  // Snap to 0°, 90°, 180°, 270°
  snapThreshold?: number;  // Degrees to snap
}

// Phase 1: Start with notes only
export const ELEMENT_TRANSFORM_CONFIG: Record<ElementType, TransformCapabilities> = {
  [ElementType.NOTE]: {
    enabled: true,
    minScale: 0.1,
    maxScale: 10,
    rotationEnabled: true,
    aspectRatioLocked: false,
    snapRotation: false,
  },
  
  // Phase 2: Add photos
  [ElementType.PHOTO]: {
    enabled: false, // Set to true when iOS is ready
    minScale: 0.2,
    maxScale: 5,
    rotationEnabled: true,
    aspectRatioLocked: true,
    snapRotation: true,
    snapThreshold: 5, // Snap within 5 degrees of 90° angles
  },
  
  // Phase 3: Add media
  [ElementType.AUDIO]: {
    enabled: false,
    minScale: 0.5,  // Don't let audio controls get too small
    maxScale: 2,
    rotationEnabled: false, // Maybe audio shouldn't rotate?
    aspectRatioLocked: true,
  },
  
  [ElementType.VIDEO]: {
    enabled: false,
    minScale: 0.3,
    maxScale: 3,
    rotationEnabled: true,
    aspectRatioLocked: true,
    snapRotation: true,
    snapThreshold: 5,
  },
  
  // Phase 4: Special elements
  [ElementType.HOROSCOPE]: {
    enabled: false,
    minScale: 0.5,
    maxScale: 3,
    rotationEnabled: true,
    aspectRatioLocked: false,
  },
  
  [ElementType.LINK]: {
    enabled: false,
    minScale: 0.5,
    maxScale: 2,
    rotationEnabled: false,
    aspectRatioLocked: true,
  },
};

/**
 * Check if transforms are enabled for a given element type
 */
export function canTransform(type: ElementType): boolean {
  return ELEMENT_TRANSFORM_CONFIG[type]?.enabled || false;
}

/**
 * Get transform capabilities for a given element type
 */
export function getTransformCapabilities(type: ElementType): TransformCapabilities {
  return ELEMENT_TRANSFORM_CONFIG[type];
}

/**
 * Validate and constrain transform values based on element type
 */
export function validateTransform(
  type: ElementType, 
  transform: {
    rotation?: number;
    scaleX?: number;
    scaleY?: number;
  }
): {
  rotation: number;
  scaleX: number;
  scaleY: number;
} {
  const config = ELEMENT_TRANSFORM_CONFIG[type];
  
  if (!config.enabled) {
    return { rotation: 0, scaleX: 1, scaleY: 1 };
  }
  
  let { rotation = 0, scaleX = 1, scaleY = 1 } = transform;
  
  // Constrain scale
  scaleX = Math.max(config.minScale, Math.min(config.maxScale, scaleX));
  scaleY = Math.max(config.minScale, Math.min(config.maxScale, scaleY));
  
  // Lock aspect ratio if needed
  if (config.aspectRatioLocked && scaleX !== scaleY) {
    // Use the average of both scales to maintain aspect ratio
    const avgScale = (scaleX + scaleY) / 2;
    scaleX = avgScale;
    scaleY = avgScale;
  }
  
  // Handle rotation
  if (!config.rotationEnabled) {
    rotation = 0;
  } else if (config.snapRotation && config.snapThreshold) {
    // Snap to 90° angles if close enough
    const angles = [0, 90, 180, 270, 360];
    for (const angle of angles) {
      if (Math.abs(rotation - angle) <= config.snapThreshold) {
        rotation = angle % 360;
        break;
      }
    }
  }
  
  // Normalize rotation to 0-360
  rotation = ((rotation % 360) + 360) % 360;
  
  return { rotation, scaleX, scaleY };
}

/**
 * Get all transform capabilities for client
 */
export function getAllTransformCapabilities() {
  const capabilities: Record<string, TransformCapabilities> = {};
  
  for (const [type, config] of Object.entries(ELEMENT_TRANSFORM_CONFIG)) {
    capabilities[type] = config;
  }
  
  return capabilities;
}