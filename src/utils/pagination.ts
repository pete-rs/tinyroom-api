export interface PaginationParams {
  page?: number;
  limit?: number;
}

export interface PaginationResult {
  skip: number;
  take: number;
  page: number;
}

export function getPagination({ page = 1, limit = 20 }: PaginationParams): PaginationResult {
  const take = Math.min(limit, 100); // Max 100 items per page
  const skip = (page - 1) * take;
  
  return {
    skip,
    take,
    page,
  };
}

export function getPaginationMeta(totalCount: number, page: number, limit: number) {
  const totalPages = Math.ceil(totalCount / limit);
  
  return {
    page,
    totalPages,
    totalCount,
  };
}