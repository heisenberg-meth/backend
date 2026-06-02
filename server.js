import "dotenv/config";
import { listen } from "./src/app";
import connectDB from "./src/config/db";
import { schedule } from "node-cron";
import { find } from "./src/models/User";
import { findOne } from "./src/models/Settings";
import { find as _find } from "./src/models/Medicine";
import sendEmail from "./src/utils/email";

const PORT = process.env.PORT || 5000;

connectDB();

schedule("0 8 * * *", async () => {
  console.log("[CRON] Running daily expiry check...");
  try {
    const owners = await find({
      role: "owner",
      subscriptionStatus: { $in: ["active", "trial"] },
    });

    for (const owner of owners) {
      const settings = await findOne({ tenantEmail: owner.email });
      const daysAhead = settings?.expiryDays || 30;
      const cutoff = new Date(Date.now() + daysAhead * 24 * 60 * 60 * 1000);

      const expiring = await _find({
        tenantEmail: owner.email,
        expiry: { $ne: "", $lte: cutoff.toISOString().split("T")[0] },
      });

      if (expiring.length > 0) {
        const itemList = expiring
          .slice(0, 10)
          .map(
            (m) =>
              `<li>${m.name} — Expires: ${m.expiry} (Qty: ${m.quantity})</li>`,
          )
          .join("");
        await sendEmail(
          owner.email,
          `⚠ ${expiring.length} medicines expiring soon — Viyan MedAssist`,
          `
          <div style="font-family:Manrope,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#0A0F1C;border-radius:16px;color:#e0e0e0;">
            <h2 style="color:#ffb4ab;"> Expiry Alert — ${owner.shopName}</h2>
            <p>The following <strong>${expiring.length}</strong> medicines are expiring within ${daysAhead} days:</p>
            <ul style="padding-left:20px;color:#4fdbc8;">${itemList}</ul>
            ${expiring.length > 10 ? `<p style="color:#888;">...and ${expiring.length - 10} more items</p>` : ""}
            <p style="margin-top:24px;">Log in to your <a href="${process.env.FRONTEND_URL || "https://medassist.viyaninfo.com/"}" style="color:#4fdbc8;">MedAssist Dashboard</a> to take action.</p>
            <hr style="border-color:#1F2A44;margin:24px 0;" />
            <p style="font-size:10px;color:#555;">© 2026 Viyan MedAssist Enterprise — Automated Alert</p>
          </div>
        `,
        );
        console.log(
          `[CRON] Sent expiry alert to ${owner.email} (${expiring.length} items)`,
        );
      }
    }
  } catch (err) {
    console.error("[CRON_ERROR]", err);
  }
});

listen(PORT, () => {
  console.log(`Viyan MedAssist Backend running on port ${PORT}`);
});
