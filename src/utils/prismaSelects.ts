// Consistent Prisma select objects for user data

export const userSelect = {
  id: true,
  username: true,
  firstName: true,
  email: true,
  avatarUrl: true,
} as const;

export const minimalUserSelect = {
  id: true,
  username: true,
  firstName: true,
  avatarUrl: true,
} as const;