import type { Prisma } from "../../generated/prisma/client";
import { serializeOrder } from "../../utils/orders";
import { prisma } from "../../utils/prisma";
import { requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  requireAdminToken(event);

  const query = getQuery(event);
  const status = typeof query.status === "string" ? query.status : undefined;
  const email = typeof query.email === "string" ? query.email : undefined;
  const limit = Math.min(
    Math.max(Number.parseInt(String(query.limit ?? "20"), 10) || 20, 1),
    100,
  );
  const offset = Math.max(
    Number.parseInt(String(query.offset ?? "0"), 10) || 0,
    0,
  );

  const where: Prisma.OrderWhereInput = {
    ...(status ? { status } : {}),
    ...(email ? { email: { contains: email } } : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        items: true,
        events: { orderBy: { createdAt: "desc" } },
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      skip: offset,
    }),
  ]);

  return {
    total,
    limit,
    offset,
    orders: orders.map(serializeOrder),
  };
});
