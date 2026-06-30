-- CreateTable
CREATE TABLE "ScanState" (
    "id" TEXT NOT NULL,
    "lastScannedBlock" INTEGER NOT NULL,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ScanState_pkey" PRIMARY KEY ("id")
);
