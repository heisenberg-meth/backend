import { PrismaClient } from '@prisma/client';
import { encrypt } from '../src/modules/security/utils/encryption.util.js';

const prisma = new PrismaClient();

async function main() {
  console.log('Starting PHI encryption migration...');

  let processedCount = 0;
  let encryptedCount = 0;
  let skippedCount = 0;

  const batchSize = 100;
  let cursor = null;
  let hasMore = true;

  while (hasMore) {
    const patients = await prisma.patient.findMany({
      take: batchSize,
      skip: cursor ? 1 : 0,
      cursor: cursor ? { id: cursor } : undefined,
      orderBy: { id: 'asc' },
      select: {
        id: true,
        medicalHistory: true,
        allergies: true,
        chronicConditions: true,
      },
    });

    if (patients.length === 0) {
      hasMore = false;
      break;
    }

    cursor = patients[patients.length - 1].id;

    for (const patient of patients) {
      processedCount++;
      let needsUpdate = false;
      const dataToUpdate = {};

      const isEncrypted = (val) => val && val.includes(':') && val.split(':').length === 3;

      if (patient.medicalHistory && !isEncrypted(patient.medicalHistory)) {
        dataToUpdate.medicalHistory = encrypt(patient.medicalHistory);
        needsUpdate = true;
      }
      if (patient.allergies && !isEncrypted(patient.allergies)) {
        dataToUpdate.allergies = encrypt(patient.allergies);
        needsUpdate = true;
      }
      if (patient.chronicConditions && !isEncrypted(patient.chronicConditions)) {
        dataToUpdate.chronicConditions = encrypt(patient.chronicConditions);
        needsUpdate = true;
      }

      if (needsUpdate) {
        await prisma.patient.update({
          where: { id: patient.id },
          data: dataToUpdate,
        });
        encryptedCount++;
        console.log(`Encrypted PHI for patient ID: ${patient.id}`);
      } else {
        skippedCount++;
      }
    }
  }

  console.log('Migration completed successfully!');
  console.log(`Total processed: ${processedCount}`);
  console.log(`Encrypted: ${encryptedCount}`);
  console.log(`Skipped (already encrypted or null): ${skippedCount}`);
}

main()
  .catch((e) => {
    console.error('Migration failed:', e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
