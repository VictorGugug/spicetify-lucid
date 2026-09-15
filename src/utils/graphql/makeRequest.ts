type GraphQLQuery = {
  name: string;
  sha256Hash: string;
};

const MAX_QUERY_CACHE = 150;
const queryCache = new Map<string, any>();
const pendingRequests = new Map<string, Promise<any>>();

export const makeRequest = async <T>(
  query: GraphQLQuery,
  variables: Record<string, unknown>,
  retries = 2,
  retryDelayMs = 250,
): Promise<T | null> => {
  const cacheKey = `${query.name}-${JSON.stringify(variables)}`;
  if (queryCache.has(cacheKey)) {
    const cached = queryCache.get(cacheKey);
    queryCache.delete(cacheKey);
    queryCache.set(cacheKey, cached);
    return cached as T;
  }

  if (pendingRequests.has(cacheKey)) {
    return pendingRequests.get(cacheKey) as Promise<T | null>;
  }

  const executeRequest = async (): Promise<T | null> => {
    for (let attempt = 0; attempt <= retries; attempt++) {
      try {
        const response = await Spicetify.GraphQL.Request(
          { ...query, operation: "query", value: null },
          variables,
        );
        if (queryCache.size >= MAX_QUERY_CACHE) {
          const oldest = queryCache.keys().next().value;
          if (oldest) queryCache.delete(oldest);
        }
        queryCache.set(cacheKey, response);
        return response as T;
      } catch (err: unknown) {
        const error = err instanceof Error ? err : new Error("Unknown error");

        const isRetryable = error.message.includes("DUPLICATE_REQUEST_ERROR") && attempt < retries;

        if (isRetryable) {
          const delay = retryDelayMs * 2 ** attempt;
          console.warn(
            `Retrying ${query.name} (attempt ${attempt + 1}/${retries}) after ${delay}ms due to error: ${error.message}`,
          );
          await new Promise((resolve) => setTimeout(resolve, delay));
          continue;
        }

        console.error(`Error in ${query.name}:`, error);
        throw error;
      }
    }
    return null;
  };

  const requestPromise = executeRequest().finally(() => {
    pendingRequests.delete(cacheKey);
  });

  pendingRequests.set(cacheKey, requestPromise);
  return requestPromise;
};
