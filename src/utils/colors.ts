// Predefined color palette for session participants
const COLORS = [
  '#FF6B6B', // Red
  '#4ECDC4', // Teal
  '#45B7D1', // Blue
  '#FFA07A', // Light Salmon
  '#98D8C8', // Mint
  '#F7DC6F', // Yellow
  '#BB8FCE', // Purple
  '#85C1F5', // Sky Blue
];

export function getAvailableColor(usedColors: string[]): string {
  const availableColors = COLORS.filter(color => !usedColors.includes(color));
  
  if (availableColors.length === 0) {
    // If all colors are used, return a random color
    return COLORS[Math.floor(Math.random() * COLORS.length)];
  }
  
  return availableColors[0];
}