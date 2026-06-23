/**
 * Migration Script: Fix existing image paths in database
 * 
 * This script converts all localhost/HTTP image URLs to relative paths
 * and ensures consistency across the database.
 * 
 * Run: node scripts/migrate-image-paths.js [--dry-run]
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const PRIVATE_IP_PATTERNS = [
  /^http:\/\/localhost[:/]/i,
  /^http:\/\/127\.0\.0\.1[:/]/i,
  /^http:\/\/192\.168\./i,
  /^http:\/\/10\./i,
  /^http:\/\/172\.(1[6-9]|2\d|3[01])\./i,
];

function isPrivateUrl(url) {
  if (!url || typeof url !== 'string') return false;
  return PRIVATE_IP_PATTERNS.some((pattern) => pattern.test(url));
}

function extractRelativePath(url) {
  if (!url || typeof url !== 'string') return url;
  
  if (isPrivateUrl(url)) {
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    if (path && path.startsWith('/')) return path;
  }
  
  if (url.startsWith('http://')) {
    return url.replace(/^http:\/\/[^/]+/, '');
  }
  
  return url;
}

function fixUrl(url) {
  if (!url || typeof url !== 'string') return url;
  
  let cleaned = extractRelativePath(url);
  
  if (cleaned && cleaned.startsWith('http://')) {
    cleaned = 'https://' + cleaned.slice(7);
  }
  
  return cleaned;
}

function fixJsonUrls(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  
  const fixed = { ...obj };
  for (const [key, value] of Object.entries(fixed)) {
    if (typeof value === 'string' && (key.toLowerCase().includes('url') || key.toLowerCase().includes('image') || key.toLowerCase().includes('logo'))) {
      fixed[key] = fixUrl(value);
    } else if (typeof value === 'object' && value !== null) {
      fixed[key] = fixJsonUrls(value);
    }
  }
  return fixed;
}

async function migrateUsers(dryRun) {
  const users = await prisma.user.findMany({
    where: {
      avatar: { not: null },
    },
    select: { id: true, avatar: true },
  });
  
  let updated = 0;
  for (const user of users) {
    const fixed = fixUrl(user.avatar);
    if (fixed !== user.avatar) {
      if (!dryRun) {
        await prisma.user.update({
          where: { id: user.id },
          data: { avatar: fixed },
        });
      }
      updated++;
      console.log(`  User ${user.id}: ${user.avatar} → ${fixed}`);
    }
  }
  return updated;
}

async function migrateMedicines(dryRun) {
  const medicines = await prisma.medicine.findMany({
    where: {
      imageUrl: { not: null },
    },
    select: { id: true, imageUrl: true },
  });
  
  let updated = 0;
  for (const med of medicines) {
    const fixed = fixUrl(med.imageUrl);
    if (fixed !== med.imageUrl) {
      if (!dryRun) {
        await prisma.medicine.update({
          where: { id: med.id },
          data: { imageUrl: fixed },
        });
      }
      updated++;
      console.log(`  Medicine ${med.id}: ${med.imageUrl} → ${fixed}`);
    }
  }
  return updated;
}

async function migrateTenantBranding(dryRun) {
  const brands = await prisma.tenantBranding.findMany({
    where: {
      OR: [
        { logoUrl: { not: null } },
        { faviconUrl: { not: null } },
      ],
    },
    select: { id: true, logoUrl: true, faviconUrl: true },
  });
  
  let updated = 0;
  for (const brand of brands) {
    const fixedLogo = fixUrl(brand.logoUrl);
    const fixedFavicon = fixUrl(brand.faviconUrl);
    
    if (fixedLogo !== brand.logoUrl || fixedFavicon !== brand.faviconUrl) {
      if (!dryRun) {
        await prisma.tenantBranding.update({
          where: { id: brand.id },
          data: {
            logoUrl: fixedLogo,
            faviconUrl: fixedFavicon,
          },
        });
      }
      updated++;
      console.log(`  TenantBranding ${brand.id}: logo=${brand.logoUrl} → ${fixedLogo}, favicon=${brand.faviconUrl} → ${fixedFavicon}`);
    }
  }
  return updated;
}

async function migrateSettings(dryRun) {
  const settings = await prisma.settings.findMany({
    where: {
      invoiceTemplate: { not: null },
    },
    select: { id: true, invoiceTemplate: true },
  });
  
  let updated = 0;
  for (const setting of settings) {
    const fixed = fixJsonUrls(setting.invoiceTemplate);
    if (JSON.stringify(fixed) !== JSON.stringify(setting.invoiceTemplate)) {
      if (!dryRun) {
        await prisma.settings.update({
          where: { id: setting.id },
          data: { invoiceTemplate: fixed },
        });
      }
      updated++;
      console.log(`  Settings ${setting.id}: invoiceTemplate logoUrl fixed`);
    }
  }
  return updated;
}

async function migrateStoreProfiles(dryRun) {
  const profiles = await prisma.storeProfile.findMany({
    where: {
      OR: [
        { logoUrl: { not: null } },
        { invoiceLogoUrl: { not: null } },
        { whatsappLogoUrl: { not: null } },
      ],
    },
    select: { id: true, logoUrl: true, invoiceLogoUrl: true, whatsappLogoUrl: true },
  });
  
  let updated = 0;
  for (const profile of profiles) {
    const fixedLogo = fixUrl(profile.logoUrl);
    const fixedInvoice = fixUrl(profile.invoiceLogoUrl);
    const fixedWhatsapp = fixUrl(profile.whatsappLogoUrl);
    
    if (fixedLogo !== profile.logoUrl || fixedInvoice !== profile.invoiceLogoUrl || fixedWhatsapp !== profile.whatsappLogoUrl) {
      if (!dryRun) {
        await prisma.storeProfile.update({
          where: { id: profile.id },
          data: {
            logoUrl: fixedLogo,
            invoiceLogoUrl: fixedInvoice,
            whatsappLogoUrl: fixedWhatsapp,
          },
        });
      }
      updated++;
      console.log(`  StoreProfile ${profile.id}: logo=${profile.logoUrl} → ${fixedLogo}`);
    }
  }
  return updated;
}

async function main() {
  const dryRun = process.argv.includes('--dry-run');
  
  console.log(`\n=== Image Path Migration ${dryRun ? '(DRY RUN)' : ''} ===\n`);
  
  try {
    console.log('Migrating Users...');
    const users = await migrateUsers(dryRun);
    console.log(`  → ${users} users updated\n`);
    
    console.log('Migrating Medicines...');
    const medicines = await migrateMedicines(dryRun);
    console.log(`  → ${medicines} medicines updated\n`);
    
    console.log('Migrating TenantBranding...');
    const brands = await migrateTenantBranding(dryRun);
    console.log(`  → ${brands} tenant brandings updated\n`);
    
    console.log('Migrating Settings (invoiceTemplate)...');
    const settings = await migrateSettings(dryRun);
    console.log(`  → ${settings} settings updated\n`);
    
    console.log('Migrating StoreProfiles...');
    const profiles = await migrateStoreProfiles(dryRun);
    console.log(`  → ${profiles} store profiles updated\n`);
    
    console.log('=== Migration Complete ===');
    console.log(`Total: ${users + medicines + brands + settings + profiles} records ${dryRun ? 'would be' : ''} updated`);
    
  } catch (error) {
    console.error('Migration failed:', error);
    process.exit(1);
  } finally {
    await prisma.$disconnect();
  }
}

main();
