import { getProductById } from "../../utils/products";

export default defineEventHandler(async (event) => {
  const id = getRouterParam(event, "id");
  const product = id ? await getProductById(id) : undefined;

  if (!product) {
    throw createError({
      statusCode: 404,
      statusMessage: "Product not found",
    });
  }

  return product;
});
