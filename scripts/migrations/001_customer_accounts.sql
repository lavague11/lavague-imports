-- Section B: customer accounts. Additive, idempotent.
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'CustomerRole') THEN
    CREATE TYPE "CustomerRole" AS ENUM ('CUSTOMER', 'WHOLESALE');
  END IF;
END $$;

CREATE TABLE IF NOT EXISTS "Customer" (
  "id"            TEXT PRIMARY KEY,
  "email"         TEXT NOT NULL,
  "passwordHash"  TEXT,
  "name"          TEXT,
  "role"          "CustomerRole" NOT NULL DEFAULT 'CUSTOMER',
  "googleSub"     TEXT,
  "emailVerified" TIMESTAMP(3),
  "createdAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt"     TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_email_key" ON "Customer"("email");
CREATE UNIQUE INDEX IF NOT EXISTS "Customer_googleSub_key" ON "Customer"("googleSub");

CREATE TABLE IF NOT EXISTS "CustomerSession" (
  "token"      TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "CustomerSession_customerId_idx" ON "CustomerSession"("customerId");

CREATE TABLE IF NOT EXISTS "PasswordResetToken" (
  "token"      TEXT PRIMARY KEY,
  "customerId" TEXT NOT NULL,
  "expiresAt"  TIMESTAMP(3) NOT NULL,
  "usedAt"     TIMESTAMP(3),
  "createdAt"  TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX IF NOT EXISTS "PasswordResetToken_customerId_idx" ON "PasswordResetToken"("customerId");

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'CustomerSession_customerId_fkey') THEN
    ALTER TABLE "CustomerSession" ADD CONSTRAINT "CustomerSession_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'PasswordResetToken_customerId_fkey') THEN
    ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_customerId_fkey"
      FOREIGN KEY ("customerId") REFERENCES "Customer"("id") ON DELETE CASCADE ON UPDATE CASCADE;
  END IF;
END $$;
