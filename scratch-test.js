import prisma from './src/config/prisma.js';
import notificationService from './src/modules/notifications/services/notification.service.js';

async function run() {
  console.log("Locating an active user in the database...");
  const user = await prisma.user.findFirst();
  if (!user) {
    console.error("❌ No user found in the database. Please register a user first.");
    await prisma.$disconnect();
    return;
  }
  
  console.log(`Found user! ID: ${user.id}, Tenant ID: ${user.tenantId}`);

  console.log("Triggering mock IN_APP notification...");
  const result = await notificationService.queueNotification({
    tenantId: user.tenantId,
    userId: user.id,
    notificationType: "System",
    channel: "IN_APP",
    subject: "Automated Integration Test",
    message: "Verifying that the notification service works and creates database rows successfully.",
  });
  
  console.log("Trigger Result:", result);

  console.log("Running SQL-equivalent query via Prisma Client...");
  const notifications = await prisma.notification.findMany({
    orderBy: { createdAt: 'desc' },
    take: 5,
  });
  
  console.log("Latest 5 notifications in DB:");
  console.log(JSON.stringify(notifications, null, 2));

  await prisma.$disconnect();
}

run().catch(async (err) => {
  console.error("❌ Test error:", err);
  await prisma.$disconnect();
});
