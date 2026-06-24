import prisma from './src/config/prisma.js';
import { processExpiryReminder } from './src/modules/notifications/workers/expiry-reminder.handler.js';

async function run() {
  console.log('=== Active Sessions ===');
  const activeSessions = await prisma.userSession.findMany({
    where: {
      revoked: false,
      expiresAt: { gte: new Date() },
    },
    include: {
      user: true,
    },
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(
    activeSessions.map((s) => ({
      sessionId: s.id,
      userId: s.userId,
      email: s.user?.email,
      tenantId: s.user?.tenantId,
      expiresAt: s.expiresAt,
    })),
  );

  console.log('=== Expiry Alerts Count ===');
  const alertsCount = await prisma.expiryAlert.count();
  console.log('Total alerts:', alertsCount);

  console.log('=== Unresolved Expiry Alerts ===');
  const unresolvedAlerts = await prisma.expiryAlert.findMany({
    where: { isResolved: false },
    include: {
      batch: true,
      medicine: true,
    },
    take: 5,
  });
  console.log(
    unresolvedAlerts.map((a) => ({
      id: a.id,
      medicine: a.medicine?.name,
      batch: a.batch?.batchNumber,
      daysRemaining: a.daysRemaining,
      isResolved: a.isResolved,
    })),
  );

  if (unresolvedAlerts.length > 0) {
    console.log('Running processExpiryReminder() to process alerts...');
    await processExpiryReminder();
    console.log('Done running processExpiryReminder.');
  } else {
    console.log('No unresolved alerts to process. Creating a mock expiry notification...');
    const targetUser = activeSessions[0]?.user || (await prisma.user.findFirst());
    if (targetUser) {
      console.log(
        `Creating mock expiry alert notification for user ${targetUser.email} (ID: ${targetUser.id})`,
      );
      const res = await prisma.notification.create({
        data: {
          tenantId: targetUser.tenantId,
          userId: targetUser.id,
          notificationType: 'EXPIRY_ALERT',
          channel: 'IN_APP',
          recipient: targetUser.id,
          subject: 'Medicine Expiry Alert',
          message: 'Alert: Batch B12345 of Paracetamol is expiring in 15 days.',
          deliveryStatus: 'DELIVERED',
          sentAt: new Date(),
          deliveredAt: new Date(),
        },
      });
      console.log('Created mock notification:', res);
    }
  }

  const latestNotifs = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  console.log(
    'Latest notifications in DB:',
    latestNotifs.map((n) => ({
      id: n.id,
      userId: n.userId,
      subject: n.subject,
      message: n.message,
      notificationType: n.notificationType,
      createdAt: n.createdAt,
    })),
  );

  await prisma.$disconnect();
}

run().catch(async (e) => {
  console.error(e);
  await prisma.$disconnect();
});
