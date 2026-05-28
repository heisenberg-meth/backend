-- CreateTable
CREATE TABLE "PatientAdmission" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "patientId" TEXT NOT NULL,
    "admissionNumber" TEXT NOT NULL,
    "admissionDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dischargeDate" TIMESTAMP(3),
    "ward" TEXT,
    "attendingDoctorId" TEXT,
    "admissionStatus" TEXT NOT NULL DEFAULT 'ACTIVE',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PatientAdmission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InpatientMedicationUsage" (
    "id" TEXT NOT NULL,
    "admissionId" TEXT NOT NULL,
    "medicineId" TEXT NOT NULL,
    "quantity" DECIMAL(10,2) NOT NULL,
    "administeredById" TEXT NOT NULL,
    "administeredAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InpatientMedicationUsage_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "PatientAdmission_admissionNumber_key" ON "PatientAdmission"("admissionNumber");

-- AddForeignKey
ALTER TABLE "PatientAdmission" ADD CONSTRAINT "PatientAdmission_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientMedicationUsage" ADD CONSTRAINT "InpatientMedicationUsage_admissionId_fkey" FOREIGN KEY ("admissionId") REFERENCES "PatientAdmission"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InpatientMedicationUsage" ADD CONSTRAINT "InpatientMedicationUsage_medicineId_fkey" FOREIGN KEY ("medicineId") REFERENCES "Medicine"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
