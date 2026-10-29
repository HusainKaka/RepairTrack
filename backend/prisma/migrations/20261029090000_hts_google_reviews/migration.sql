-- Owner-supplied link. Configure only one uniquely identified active HTS workspace;
-- never apply this brand's review destination to another tenant or override an
-- existing review preference. Ambiguous/missing workspaces use Settings > Delivery.
WITH hts AS (
  SELECT "id" FROM "businesses"
  WHERE lower(btrim("name")) = 'husaini tech solutions'
    AND "deletedAt" IS NULL AND "status" = 'ACTIVE'
)
INSERT INTO "settings" ("id", "businessId", "scope", "key", "value", "createdAt", "updatedAt")
SELECT md5('repairtrack:google-review:' || "id"::text)::uuid,
       "id", 'business:' || "id"::text, 'reviews.google',
       '{"googleReviewUrl":"https://g.page/r/Cbadgp9VKwYjEBI/review"}'::jsonb,
       CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM hts WHERE (SELECT count(*) FROM hts) = 1
ON CONFLICT ("scope", "key") DO NOTHING;
