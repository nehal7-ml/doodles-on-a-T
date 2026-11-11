import productsData from "../app/testData/products.json";
import { hashPassword } from "../server/auth/password";
import { prisma } from "../server/utils/prisma";

function readEnv(name: string): string | undefined {
  const value = process.env[name]?.trim().replace(/^["']|["']$/g, "");
  return value || undefined;
}

/**
 * Creates or promotes the admin account from ADMIN_EMAIL / ADMIN_PASSWORD.
 * Never logs the password. Safe to run repeatedly.
 */
async function seedAdmin() {
  const email = readEnv("ADMIN_EMAIL")?.toLowerCase();
  const password = readEnv("ADMIN_PASSWORD");

  if (!email || !password) {
    console.log("Skipping admin seed (ADMIN_EMAIL / ADMIN_PASSWORD not set).");
    return;
  }
  if (password.length < 12) {
    throw new Error("ADMIN_PASSWORD must be at least 12 characters.");
  }

  const passwordHash = await hashPassword(password);
  const admin = await prisma.user.upsert({
    where: { email },
    create: {
      email,
      name: "Admin",
      passwordHash,
      role: "admin",
      emailVerified: new Date(),
    },
    update: { passwordHash, role: "admin", isActive: true },
  });

  console.log(`  ✓ admin ${admin.email}`);
}

/**
 * Product fixtures are destructive (they clear the catalogue), so they are
 * opt-in. Production catalogues come from Printful sync.
 */
async function seedProducts() {
  if (process.env.SEED_PRODUCTS !== "true") {
    console.log(
      "Skipping product fixtures (set SEED_PRODUCTS=true to reset the catalogue).",
    );
    return;
  }

  console.log("Clearing existing products…");
  await prisma.productVariant.deleteMany();
  await prisma.productImage.deleteMany();
  await prisma.product.deleteMany();

  console.log(`Seeding ${productsData.length} products…`);

  for (const product of productsData) {
    const created = await prisma.product.create({
      data: {
        slug: product.name
          .toLowerCase()
          .replace(/[^a-z0-9]+/g, "-")
          .replace(/^-+|-+$/g, ""),
        name: product.name,
        description: product.description,
        priceCents: Math.round(product.price * 100),
        status: "active",
        images: {
          create: product.images.map((url, position) => ({ url, position })),
        },
      },
    });

    for (const variant of product.variants) {
      if (product.sizes.length) {
        for (const size of product.sizes) {
          await prisma.productVariant.create({
            data: {
              name: `${variant.name} / ${size}`,
              color: variant.name,
              size,
              colors: JSON.stringify(variant.colors),
              productId: created.id,
            },
          });
        }
      } else {
        await prisma.productVariant.create({
          data: {
            name: variant.name,
            color: variant.name,
            colors: JSON.stringify(variant.colors),
            productId: created.id,
          },
        });
      }
    }

    console.log(`  ✓ ${product.name}`);
  }
}

async function main() {
  await seedAdmin();
  await seedProducts();
  console.log("Done.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
