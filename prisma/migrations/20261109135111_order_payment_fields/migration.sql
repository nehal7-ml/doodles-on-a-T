-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Order" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderNumber" TEXT NOT NULL,
    "externalId" TEXT NOT NULL,
    "userId" TEXT,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "paymentStatus" TEXT NOT NULL DEFAULT 'unpaid',
    "refundedCents" INTEGER NOT NULL DEFAULT 0,
    "printfulOrderId" INTEGER,
    "email" TEXT,
    "customerName" TEXT,
    "shippingMethod" TEXT,
    "shippingService" TEXT,
    "shippingCost" REAL NOT NULL DEFAULT 0,
    "subtotal" REAL NOT NULL DEFAULT 0,
    "discount" REAL NOT NULL DEFAULT 0,
    "tax" REAL NOT NULL DEFAULT 0,
    "total" REAL NOT NULL DEFAULT 0,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "recipient" TEXT NOT NULL DEFAULT '{}',
    "trackingNumber" TEXT,
    "trackingUrl" TEXT,
    "carrier" TEXT,
    "shippedAt" DATETIME,
    "deliveredAt" DATETIME,
    "canceledAt" DATETIME,
    "failureReason" TEXT,
    "raw" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Order_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Order" ("canceledAt", "carrier", "createdAt", "currency", "customerName", "deliveredAt", "discount", "email", "externalId", "failureReason", "id", "orderNumber", "printfulOrderId", "raw", "recipient", "shippedAt", "shippingCost", "shippingMethod", "shippingService", "status", "subtotal", "tax", "total", "trackingNumber", "trackingUrl", "updatedAt") SELECT "canceledAt", "carrier", "createdAt", "currency", "customerName", "deliveredAt", "discount", "email", "externalId", "failureReason", "id", "orderNumber", "printfulOrderId", "raw", "recipient", "shippedAt", "shippingCost", "shippingMethod", "shippingService", "status", "subtotal", "tax", "total", "trackingNumber", "trackingUrl", "updatedAt" FROM "Order";
DROP TABLE "Order";
ALTER TABLE "new_Order" RENAME TO "Order";
CREATE UNIQUE INDEX "Order_orderNumber_key" ON "Order"("orderNumber");
CREATE UNIQUE INDEX "Order_externalId_key" ON "Order"("externalId");
CREATE UNIQUE INDEX "Order_printfulOrderId_key" ON "Order"("printfulOrderId");
CREATE INDEX "Order_userId_idx" ON "Order"("userId");
CREATE INDEX "Order_status_idx" ON "Order"("status");
CREATE INDEX "Order_paymentStatus_idx" ON "Order"("paymentStatus");
CREATE INDEX "Order_email_idx" ON "Order"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
