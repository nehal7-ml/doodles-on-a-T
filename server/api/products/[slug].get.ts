import { getProductByIdOrSlug } from "../../utils/products";

/**
 * Product detail. The path segment is the readable slug, but the local id is
 * also accepted so existing links keep working (the page 301s to the slug).
 */
export default defineEventHandler(async (event) => {
  const slug = getRouterParam(event, "slug");
  const product = slug ? await getProductByIdOrSlug(slug) : undefined;

  if (!product) {
    throw createError({
      statusCode: 404,
      statusMessage: "Product not found",
    });
  }

  return product;
});
