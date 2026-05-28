-- CreateTable
CREATE TABLE "PatientIdentityMap" (
    "id" TEXT NOT NULL,
    "externalPatientId" TEXT NOT NULL,
    "internalPatientId" TEXT NOT NULL,
    "sourceSystem" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientIdentityMap_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientIdentityMap_externalPatientId_sourceSystem_key" ON "PatientIdentityMap"("externalPatientId", "sourceSystem");

-- AddForeignKey
ALTER TABLE "PatientIdentityMap" ADD CONSTRAINT "PatientIdentityMap_internalPatientId_fkey" FOREIGN KEY ("internalPatientId") REFERENCES "Customer"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
