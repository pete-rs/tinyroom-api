/**
 * Split an array into chunks of specified size
 * @param array The array to chunk
 * @param size The size of each chunk
 * @returns Array of chunks
 */
export function chunkArray<T>(array: T[], size: number): T[][] {
  const chunks: T[][] = [];
  for (let i = 0; i < array.length; i += size) {
    chunks.push(array.slice(i, i + size));
  }
  return chunks;
}

/**
 * Get the size of a room (number of connected sockets)
 * @param io The Socket.io server instance
 * @param roomId The room ID
 * @returns Number of connected sockets in the room
 */
export async function getRoomSize(io: any, roomId: string): Promise<number> {
  const sockets = await io.in(roomId).fetchSockets();
  return sockets.length;
}