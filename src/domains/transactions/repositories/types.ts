// Cursor-based pagination types for transactions
export interface CursorPaginationOptions {
    limit: number;
    cursor?: string;
}

export interface CursorFilters {
    type?: 'income' | 'expense' | 'transfer';
    categoryId?: string;
    category?: string;
    startDate?: string;
    endDate?: string;
    search?: string;
}

export interface PaginatedResult<T> {
    data: T[];
    pagination: {
        nextCursor: string | null;
        hasMore: boolean;
    };
}
