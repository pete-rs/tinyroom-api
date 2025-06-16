// Generate distinct colors for room participants
export function generateRoomColors(participantCount: number): string[] {
  // Predefined palette of distinct colors that work well together
  const colorPalette = [
    '#FF6B6B', // Coral Red
    '#4ECDC4', // Turquoise
    '#45B7D1', // Sky Blue
    '#F9CA24', // Golden Yellow
    '#6C5CE7', // Purple
    '#A29BFE', // Lavender
    '#74B9FF', // Light Blue
    '#81ECEC', // Mint
    '#FAB1A0', // Peach
    '#E17055', // Orange
    '#00B894', // Green
    '#FDCB6E', // Yellow
    '#D63031', // Red
    '#74B9FF', // Blue
    '#A29BFE', // Light Purple
  ];

  // If we need more colors than in our palette, generate them
  if (participantCount <= colorPalette.length) {
    return colorPalette.slice(0, participantCount);
  }

  // For larger groups, cycle through the palette and modify brightness
  const colors: string[] = [];
  for (let i = 0; i < participantCount; i++) {
    const baseColor = colorPalette[i % colorPalette.length];
    if (i < colorPalette.length) {
      colors.push(baseColor);
    } else {
      // Slightly modify the color for repeated use
      const variation = 1 - (Math.floor(i / colorPalette.length) * 0.15);
      colors.push(adjustColorBrightness(baseColor, variation));
    }
  }

  return colors;
}

// Helper function to adjust color brightness
function adjustColorBrightness(color: string, factor: number): string {
  const hex = color.replace('#', '');
  const r = parseInt(hex.substr(0, 2), 16);
  const g = parseInt(hex.substr(2, 2), 16);
  const b = parseInt(hex.substr(4, 2), 16);

  const newR = Math.round(r * factor);
  const newG = Math.round(g * factor);
  const newB = Math.round(b * factor);

  return `#${newR.toString(16).padStart(2, '0')}${newG.toString(16).padStart(2, '0')}${newB.toString(16).padStart(2, '0')}`;
}