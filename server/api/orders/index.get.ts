import type { Prisma } from "../../generated/prisma/client";
import { getSessionUser, hasRole } from "../../utils/auth";
import { serializeOrder } from "../../utils/orders";
import { prisma } from "../../utils/prisma";
import { requireAdminToken } from "../../utils/request";

export default defineEventHandler(async (event) => {
  const user = await getSessionUser(event);
  const privileged = Boolean(user && hasRole(user, ["staff", "admin"]));

  // Signed-in customers only see their own orders. Guests/machines must use
  // the admin token (and staff/admin sessions see the full list).
  if (!user) {
    requireAdminToken(event, { allowDevBypass: false });
  }

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
    ...(user && !privileged ? { userId: user.id } : {}),
    ...(status ? { status } : {}),
    ...(email ? { email: { contains: email } } : {}),
  };

  const [total, orders] = await Promise.all([
    prisma.order.count({ where }),
    prisma.order.findMany({
      where,
      include: {
        items: true,
        addresses: true,
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
