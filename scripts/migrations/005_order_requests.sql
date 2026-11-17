-- Section L: wholesale order requests (no prices; cases). Additive, idempotent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'OrderRequestStatus') THEN
    CREATE TYPE "OrderRequestStatus" AS ENUM ('SUBMITTED','QUOTED','APPROVED','DECLINED','CANCELLED');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "OrderRequest" (
  "id"         TEXT PRIMARY KEY,
  "reference"  TEXT NOT NULL,
  "customerId" TEXT NOT NULL,
  "status"     "OrderRequestStatus" NOT NULL DEFAULT 'SUBMITTED',
  "note"       TEXT,
  "adminNote"  TEXT,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "OrderRequest_reference_key" ON "OrderRequest"("reference");
CREATE INDEX IF NOT EXISTS "OrderRequest_customerId_idx" ON "OrderRequest"("customerId");
CREATE INDEX IF NOT EXISTS "OrderRequest_status_idx" ON "OrderRequest"("status");

CREATE TABLE IF NOT EXISTS "OrderRequestLine" (
  "id"          TEXT PRIMARY KEY,
  "requestId"   TEXT NOT NULL,
  "productId"   TEXT,
  "slug"        TEXT,
  "productName" TEXT NOT NULL,
  "unitSize"    TEXT,
  "casePack"    INTEGER,
  "cases"       INTEGER NOT NULL,
  "createdAt"   TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "OrderRequestLine_requestId_idx" ON "OrderRequestLine"("requestId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRequest_customerId_fkey') THEN
    ALTER TABLE "OrderRequest" ADD CONSTRAINT "OrderRequest_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'OrderRequestLine_requestId_fkey') THEN
    ALTER TABLE "OrderRequestLine" ADD CONSTRAINT "OrderRequestLine_requestId_fkey"
      FOREIGN KEY ("requestId") REFERENCES "OrderRequest"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
