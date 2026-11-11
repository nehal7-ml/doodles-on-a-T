-- Phase 5: money as integer cents, catalog images/status/slug, order addresses.
--
-- Turso's HTTP protocol does not support `PRAGMA foreign_keys=OFF`, so this
-- migration never relies on it. Instead:
--   1. rename the old tables out of the way,
--   2. create the new tables under their final names and copy the data,
--   3. drop the old tables now that nothing references them,
--   4. recreate the indexes (their names are only free after the drops).
--
-- All renamed children that reference a rebuilt table (CartItem, OrderEvent,
-- Payment, Refund) are rebuilt too, so their foreign keys point at the new
-- tables instead of the old_* copies. That makes the migration safe with
-- foreign-key enforcement enabled, which is how Turso runs it.

-- 1. Move the old tables aside. SQLite rewrites existing FK references to the
--    old_* names; every affected child is rebuilt below.
ALTER TABLE "Product" RENAME TO "old_Product";
ALTER TABLE "ProductVariant" RENAME TO "old_ProductVariant";
ALTER TABLE "Order" RENAME TO "old_Order";
ALTER TABLE "OrderItem" RENAME TO "old_OrderItem";
ALTER TABLE "CartItem" RENAME TO "old_CartItem";
ALTER TABLE "OrderEvent" RENAME TO "old_OrderEvent";
ALTER TABLE "Payment" RENAME TO "old_Payment";
ALTER TABLE "Refund" RENAME TO "old_Refund";

-- 2. Create the final tables. Parents are created before their children.
CREATE TABLE "Product" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "printfulProductId" INTEGER,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL DEFAULT '',
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'draft',
    "priceCents" INTEGER NOT NULL DEFAULT 0,
    "compareAtPriceCents" INTEGER,
    "thumbnailUrl" TEXT,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

CREATE TABLE "ProductVariant" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "printfulVariantId" INTEGER,
    "catalogVariantId" INTEGER,
    "externalId" TEXT,
    "name" TEXT NOT NULL,
    "size" TEXT,
    "color" TEXT,
    "colors" TEXT NOT NULL DEFAULT '[]',
    "priceCents" INTEGER,
    "compareAtPriceCents" INTEGER,
    "currency" TEXT,
    "image" TEXT,
    "sku" TEXT,
    "inStock" BOOLEAN NOT NULL DEFAULT true,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "productId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductVariant_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "ProductImage" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "productId" TEXT NOT NULL,
    "variantId" TEXT,
    "url" TEXT NOT NULL,
    "alt" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProductImage_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductImage_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Category" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "parentId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Category_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Category" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "ProductCategory" (
    "productId" TEXT NOT NULL,
    "categoryId" TEXT NOT NULL,
    PRIMARY KEY ("productId", "categoryId"),
    CONSTRAINT "ProductCategory_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProductCategory_categoryId_fkey" FOREIGN KEY ("categoryId") REFERENCES "Category" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "printfulStatus" TEXT,
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "printfulOrderId" INTEGER,
    "email" TEXT NOT NULL,
    "customerName" TEXT,
    "shippingMethod" TEXT,
    "shippingService" TEXT,
    "shippingCents" INTEGER NOT NULL DEFAULT 0,
    "subtotalCents" INTEGER NOT NULL DEFAULT 0,
    "discountCents" INTEGER NOT NULL DEFAULT 0,
    "taxCents" INTEGER NOT NULL DEFAULT 0,
    "totalCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "carrier" TEXT,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "canceledAt" DATETIME,
    "failureReason" TEXT,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrderItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "productId" TEXT,
    "variantId" TEXT,
    "printfulItemId" INTEGER,
    "printfulVariantId" INTEGER,
    "name" TEXT NOT NULL,
    "sku" TEXT,
    "size" TEXT,
    "color" TEXT,
    "quantity" INTEGER NOT NULL,
    "unitPriceCents" INTEGER NOT NULL,
    "lineTotalCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    CONSTRAINT "OrderItem_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
    CONSTRAINT "OrderItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "OrderAddress" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "kind" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "company" TEXT,
    "line1" TEXT NOT NULL,
    "line2" TEXT,
    "city" TEXT NOT NULL,
    "state" TEXT,
    "postalCode" TEXT,
    "countryCode" TEXT NOT NULL,
    "phone" TEXT,
    "email" TEXT,
    "taxId" TEXT,
    CONSTRAINT "OrderAddress_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "CartItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cartId" TEXT NOT NULL,
    "variantId" TEXT NOT NULL,
    "quantity" INTEGER NOT NULL DEFAULT 1,
    "unitPriceCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CartItem_cartId_fkey" FOREIGN KEY ("cartId") REFERENCES "Cart" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CartItem_variantId_fkey" FOREIGN KEY ("variantId") REFERENCES "ProductVariant" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "OrderEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "message" TEXT NOT NULL,
    "payload" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "OrderEvent_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE "Payment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "userId" TEXT,
    "provider" TEXT NOT NULL DEFAULT 'stripe',
    "providerPaymentId" TEXT,
    "providerCheckoutId" TEXT,
    "providerCustomerId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'requires_payment_method',
    "amountCents" INTEGER NOT NULL,
    "amountRefundedCents" INTEGER NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "method" TEXT,
    "brand" TEXT,
    "last4" TEXT,
    "receiptUrl" TEXT,
    "failureCode" TEXT,
    "failureMessage" TEXT,
    "metadata" TEXT,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Payment_orderId_fkey" FOREIGN KEY ("orderId") REFERENCES "Order" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Payment_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE TABLE "Refund" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "paymentId" TEXT NOT NULL,
    "providerRefundId" TEXT,
    "amountCents" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "reason" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Refund_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "Payment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- 3. Copy data, converting legacy Float money to cents.

INSERT INTO "Product" (
    "id", "slug", "printfulProductId", "externalId", "name", "description",
    "currency", "status", "priceCents", "thumbnailUrl", "raw", "createdAt", "updatedAt"
)
SELECT
    p."id",
    CASE
        WHEN REPLACE(LOWER(p."name"), ' ', '') = ''
            THEN 'product-' || SUBSTR(p."id", 1, 8)
        ELSE
            REPLACE(LOWER(p."name"), ' ', '-') || '-' ||
            SUBSTR(LOWER(HEX(RANDOMBLOB(4))), 1, 8)
    END,
    p."printfulProductId",
    p."externalId",
    p."name",
    p."description",
    p."currency",
    CASE WHEN p."isActive" THEN 'active' ELSE 'archived' END,
    COALESCE(
        (
            SELECT MIN(CAST(ROUND(v."price" * 100) AS INTEGER))
            FROM "old_ProductVariant" v
            WHERE v."productId" = p."id" AND v."isActive" = 1 AND v."price" IS NOT NULL
        ),
        CAST(ROUND(COALESCE(p."price", 0) * 100) AS INTEGER)
    ),
    p."thumbnailUrl",
    p."raw",
    p."createdAt",
    p."updatedAt"
FROM "old_Product" p;

INSERT INTO "ProductVariant" (
    "id", "printfulVariantId", "catalogVariantId", "externalId", "name", "size",
    "color", "colors", "priceCents", "currency", "image", "sku", "inStock",
    "isActive", "productId", "createdAt", "updatedAt"
)
SELECT
    "id", "printfulVariantId", "catalogVariantId", "externalId", "name", "size",
    "color", "colors",
    CASE WHEN "price" IS NULL THEN NULL ELSE CAST(ROUND("price" * 100) AS INTEGER) END,
    "currency", "image", "sku", "inStock", "isActive", "productId", "createdAt", "updatedAt"
FROM "old_ProductVariant";

INSERT INTO "ProductImage" ("id", "productId", "variantId", "url", "alt", "position", "createdAt")
SELECT
    LOWER(HEX(RANDOMBLOB(16))),
    p."id",
    NULL,
    je."value",
    NULL,
    CAST(je."key" AS INTEGER),
    CURRENT_TIMESTAMP
FROM "old_Product" p, JSON_EACH(CASE WHEN JSON_VALID(p."images") THEN p."images" ELSE '[]' END) je
WHERE je."type" = 'text' AND je."value" <> '';

INSERT INTO "Order" (
    "id", "orderNumber", "externalId", "userId", "status", "paymentStatus",
    "refundedCents", "printfulOrderId", "email", "customerName",
    "shippingMethod", "shippingService", "shippingCents", "subtotalCents",
    "discountCents", "taxCents", "totalCents", "currency", "trackingNumber",
    "trackingUrl", "carrier", "shippedAt", "deliveredAt", "canceledAt",
    "failureReason", "raw", "createdAt", "updatedAt"
)
SELECT
    "id", "orderNumber", "externalId", "userId", "status", "paymentStatus",
    "refundedCents", "printfulOrderId", COALESCE("email", ''), "customerName",
    "shippingMethod", "shippingService",
    CAST(ROUND("shippingCost" * 100) AS INTEGER),
    CAST(ROUND("subtotal" * 100) AS INTEGER),
    CAST(ROUND("discount" * 100) AS INTEGER),
    CAST(ROUND("tax" * 100) AS INTEGER),
    CAST(ROUND("total" * 100) AS INTEGER),
    "currency", "trackingNumber", "trackingUrl", "carrier", "shippedAt",
    "deliveredAt", "canceledAt", "failureReason", "raw", "createdAt", "updatedAt"
FROM "old_Order";

INSERT INTO "OrderItem" (
    "id", "orderId", "productId", "variantId", "printfulItemId",
    "printfulVariantId", "name", "sku", "size", "color", "quantity",
    "unitPriceCents", "lineTotalCents", "currency"
)
SELECT
    oi."id", oi."orderId", oi."productId", oi."variantId", oi."printfulItemId",
    oi."printfulVariantId", oi."name",
    (SELECT v."sku" FROM "ProductVariant" v WHERE v."id" = oi."variantId"),
    oi."size", oi."color", oi."quantity",
    CAST(ROUND(oi."price" * 100) AS INTEGER),
    CAST(ROUND(oi."price" * 100) AS INTEGER) * oi."quantity",
    oi."currency"
FROM "old_OrderItem" oi;

INSERT INTO "OrderAddress" (
    "id", "orderId", "kind", "name", "company", "line1", "line2", "city",
    "state", "postalCode", "countryCode", "phone", "email", "taxId"
)
SELECT
    LOWER(HEX(RANDOMBLOB(16))),
    o."id",
    'shipping',
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.name') END,
        o."customerName",
        ''
    ),
    CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.company') END,
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.address1') END,
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.line1') END,
        ''
    ),
    CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.address2') END,
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.city') END,
        ''
    ),
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.state_code') END,
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.state') END
    ),
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.zip') END,
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.postal_code') END
    ),
    COALESCE(
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.country_code') END,
        ''
    ),
    CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.phone') END,
    COALESCE(
        o."email",
        CASE WHEN JSON_VALID(o."recipient") THEN JSON_EXTRACT(o."recipient", '$.email') END
    ),
    NULL
FROM "old_Order" o
WHERE o."recipient" IS NOT NULL
  AND o."recipient" <> ''
  AND o."recipient" <> '{}';

-- Cart lines reference the rebuilt variant table, so they are copied as-is.
INSERT INTO "CartItem" (
    "id", "cartId", "variantId", "quantity", "unitPriceCents", "currency",
    "createdAt", "updatedAt"
)
SELECT
    "id", "cartId", "variantId", "quantity", "unitPriceCents", "currency",
    "createdAt", "updatedAt"
FROM "old_CartItem";

INSERT INTO "OrderEvent" ("id", "orderId", "type", "message", "payload", "createdAt")
SELECT "id", "orderId", "type", "message", "payload", "createdAt"
FROM "old_OrderEvent";

INSERT INTO "Payment" (
    "id", "orderId", "userId", "provider", "providerPaymentId",
    "providerCheckoutId", "providerCustomerId", "status", "amountCents",
    "amountRefundedCents", "currency", "method", "brand", "last4", "receiptUrl",
    "failureCode", "failureMessage", "metadata", "raw", "createdAt", "updatedAt"
)
SELECT
    "id", "orderId", "userId", "provider", "providerPaymentId",
    "providerCheckoutId", "providerCustomerId", "status", "amountCents",
    "amountRefundedCents", "currency", "method", "brand", "last4", "receiptUrl",
    "failureCode", "failureMessage", "metadata", "raw", "createdAt", "updatedAt"
FROM "old_Payment";

INSERT INTO "Refund" (
    "id", "paymentId", "providerRefundId", "amountCents", "currency", "reason",
    "status", "createdAt", "updatedAt"
)
SELECT
    "id", "paymentId", "providerRefundId", "amountCents", "currency", "reason",
    "status", "createdAt", "updatedAt"
FROM "old_Refund";

-- 4. Drop the old tables. Nothing references them any more.
DROP TABLE "old_Refund";
DROP TABLE "old_Payment";
DROP TABLE "old_OrderEvent";
DROP TABLE "old_CartItem";
DROP TABLE "old_OrderItem";
DROP TABLE "old_Order";
DROP TABLE "old_ProductVariant";
DROP TABLE "old_Product";

-- 5. Recreate indexes (the old index names were only free after the drops).
CREATE UNIQUE INDEX "Product_slug_key" ON "Product"("slug");
CREATE UNIQUE INDEX "Product_printfulProductId_key" ON "Product"("printfulProductId");
CREATE UNIQUE INDEX "Product_externalId_key" ON "Product"("externalId");
CREATE INDEX "Product_status_idx" ON "Product"("status");

CREATE UNIQUE INDEX "ProductVariant_printfulVariantId_key" ON "ProductVariant"("printfulVariantId");
CREATE UNIQUE INDEX "ProductVariant_externalId_key" ON "ProductVariant"("externalId");
CREATE INDEX "ProductVariant_productId_idx" ON "ProductVariant"("productId");
CREATE INDEX "ProductVariant_catalogVariantId_idx" ON "ProductVariant"("catalogVariantId");
CREATE INDEX "ProductVariant_isActive_inStock_idx" ON "ProductVariant"("isActive", "inStock");

CREATE INDEX "ProductImage_productId_position_idx" ON "ProductImage"("productId", "position");

CREATE UNIQUE INDEX "Category_slug_key" ON "Category"("slug");
CREATE INDEX "Category_parentId_idx" ON "Category"("parentId");

CREATE INDEX "ProductCategory_categoryId_idx" ON "ProductCategory"("categoryId");

CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_externalId_key" ON "Order"("externalId");
CREATE UNIQUE INDEX "Order_printfulOrderId_key" ON "Order"("printfulOrderId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_email_idx" ON "Order"("email");

CREATE INDEX "OrderItem_orderId_idx" ON "OrderItem"("orderId");
CREATE INDEX "OrderItem_productId_idx" ON "OrderItem"("productId");

CREATE UNIQUE INDEX "OrderAddress_orderId_kind_key" ON "OrderAddress"("orderId", "kind");
CREATE INDEX "OrderAddress_orderId_idx" ON "OrderAddress"("orderId");

CREATE INDEX "CartItem_variantId_idx" ON "CartItem"("variantId");
CREATE UNIQUE INDEX "CartItem_cartId_variantId_key" ON "CartItem"("cartId", "variantId");

CREATE INDEX "OrderEvent_orderId_idx" ON "OrderEvent"("orderId");

CREATE UNIQUE INDEX "Payment_providerPaymentId_key" ON "Payment"("providerPaymentId");
CREATE UNIQUE INDEX "Payment_providerCheckoutId_key" ON "Payment"("providerCheckoutId");
CREATE INDEX "Payment_orderId_idx" ON "Payment"("orderId");
CREATE INDEX "Payment_status_idx" ON "Payment"("status");
CREATE INDEX "Payment_provider_idx" ON "Payment"("provider");

CREATE UNIQUE INDEX "Refund_providerRefundId_key" ON "Refund"("providerRefundId");
CREATE INDEX "Refund_paymentId_idx" ON "Refund"("paymentId");
