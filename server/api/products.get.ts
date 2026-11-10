import { listProducts, type ProductSort } from "../utils/products";

export default defineEventHandler(async (event) => {
  const query = getQuery(event);

  const search = typeof query.q === "string" ? query.q.trim() : "";
  const sort: ProductSort =
    query.sort === "price-asc" ||
    query.sort === "price-desc" ||
    query.sort === "name"
      ? query.sort
      : "featured";

  const requestedLimit = Number.parseInt(String(query.limit ?? ""), 10);
  const limit =
    Number.isFinite(requestedLimit) && requestedLimit > 0
      ? Math.min(requestedLimit, 100)
      : undefined;

  return await listProducts({ search, sort, limit });
});
