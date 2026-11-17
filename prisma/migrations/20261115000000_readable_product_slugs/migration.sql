-- Make product slugs readable for SEO.
--
-- The phase-5 backfill appended a random 8-hex suffix
-- (`classic-cotton-t-shirt-100ced87`) to guarantee uniqueness. Real slugs
-- should be the plain name (`classic-cotton-t-shirt`) with a numeric suffix
-- only when two products share a name.
--
-- SQLite cannot update a column that the unique index is watching without
-- risking a mid-update collision, so:
--   1. remember each product's readable base slug,
--   2. park every slug behind a value that cannot collide (`slug-<id>`),
--   3. write the final slug (base, or base-2, base-3… for duplicates).

CREATE TABLE "_ProductSlugFix" (
    "id"   TEXT PRIMARY KEY,
    "base" TEXT NOT NULL
);

INSERT INTO "_ProductSlugFix" ("id", "base")
SELECT
    "id",
    CASE
        WHEN "slug" GLOB '*-[0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f][0-9a-f]'
            THEN substr("slug", 1, length("slug") - 9)
        ELSE "slug"
    END
FROM "Product";

UPDATE "Product" SET "slug" = 'slug-' || "id";

WITH ranked AS (
    SELECT
        "id",
        "base",
        ROW_NUMBER() OVER (PARTITION BY "base" ORDER BY "createdAt", "id") AS "rn"
    FROM "_ProductSlugFix"
)
UPDATE "Product"
SET "slug" = (
    SELECT CASE WHEN "rn" = 1 THEN "base" ELSE "base" || '-' || "rn" END
    FROM ranked
    WHERE ranked."id" = "Product"."id"
);

DROP TABLE "_ProductSlugFix";
