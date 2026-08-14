import nodemailer from 'nodemailer';
import https from 'https';
import { mainQueue } from '../../queue/index.js';
import process from 'process';
import { Buffer } from 'buffer';
import logger from '../utils/logger.js';

const RESEND_API_KEY = process.env.RESEND_API || '';
const EMAIL_FROM = process.env.EMAIL_FROM || 'noreply@medassist.viyaninfo.com';

/**
 * Send email via Resend API directly (preferred)
 */
const sendViaResend = async (to, subject, html) => {
  if (!RESEND_API_KEY) throw new Error('RESEND_API_KEY not configured');

  return new Promise((resolve, reject) => {
    const data = JSON.stringify({
      from: EMAIL_FROM,

      to,
      subject,
      html,
    });

    const req = https.request(
      {
        hostname: 'api.resend.com',
        path: '/emails',
        method: 'POST',
        headers: {
          Authorization: `Bearer ${RESEND_API_KEY}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(data),
        },
      },
      (res) => {
        let body = '';
        res.on('data', (chunk) => (body += chunk));
        res.on('end', () => {
          if (res.statusCode === 200) {
            resolve(body);
          } else {
            reject(new Error(`Resend API error ${res.statusCode}: ${body}`));
          }
        });
      },
    );

    req.on('error', (err) => {
      reject(new Error(`Resend request failed: ${err.message}`));
    });

    req.write(data);
    req.end();
  });
};

/**
 * Send email via Nodemailer (Gmail SMTP fallback)
 */
const sendViaNodemailer = async (to, subject, html) => {
  if (!process.env.EMAIL_USER) throw new Error('EMAIL_USER not configured');

  const transporter = nodemailer.createTransport({
    service: process.env.EMAIL_SERVICE || 'gmail',
    auth: {
      user: process.env.EMAIL_USER || '',
      pass: process.env.EMAIL_PASS || '',
    },
  });

  await transporter.sendMail({
    from: `"Viyan MedAssist" <${process.env.EMAIL_USER}>`,
    to,
    subject,
    html,
  });
  return true;
};

/**
 * Queued email sending via BullMQ
 */
export const queueEmail = async (to, subject, html) => {
  await mainQueue.add('send-email', { to, subject, html });
};

export const sendEmail = async (to, subject, html) => {
  const errors = [];

  try {
    await sendViaResend(to, subject, html);
    return;
  } catch (err) {
    errors.push(`Resend: ${err.message}`);
    logger.warn({ to, error: err.message }, 'Resend failed, trying Nodemailer fallback');
  }

  try {
    await sendViaNodemailer(to, subject, html);
    return;
  } catch (err) {
    errors.push(`Nodemailer: ${err.message}`);
    logger.error({ to, error: err.message }, 'Nodemailer fallback also failed');
  }

  throw new Error(`All email providers failed: ${errors.join('; ')}`);
};

export const sendWelcomeEmail = async (to, name) => {
  const html = `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
    <h2 style="color:#2563eb;">Welcome to Viyan MedAssist!</h2>
    <p>Hi ${name},</p>
    <p>Your 28-day free trial has started. Get started by adding your inventory and exploring the dashboard.</p>
    <p style="margin-top:24px;color:#6b7280;font-size:12px;">&copy; 2026 Viyan MedAssist</p>
  </div>`;
  return queueEmail(to, 'Welcome to Viyan MedAssist — Your 28-Day Trial Awaits', html);
};

export const sendSubscriptionExpiredEmail = async (to, name) => {
  const html = `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
    <h2 style="color:#dc2626;">Trial Expired</h2>
    <p>Hi ${name},</p>
    <p>Your Viyan MedAssist trial has ended. Upgrade now to regain access to all features.</p>
    <p style="margin-top:24px;color:#6b7280;font-size:12px;">&copy; 2026 Viyan MedAssist</p>
  </div>`;
  return queueEmail(to, 'Your Viyan MedAssist Trial Has Expired', html);
};

export const sendTrialEndingReminder = async (to, name, daysLeft) => {
  const html = `<div style="font-family:Arial;max-width:480px;margin:0 auto;padding:24px;background:#f9fafb;border-radius:12px;">
    <h2 style="color:#d97706;">Trial Ending Soon</h2>
    <p>Hi ${name},</p>
    <p>Your Viyan MedAssist free trial ends in <strong>${daysLeft} day${daysLeft > 1 ? 's' : ''}</strong>.</p>
    <p>Upgrade now to keep using all features without interruption.</p>
    <p style="margin-top:24px;color:#6b7280;font-size:12px;">&copy; 2026 Viyan MedAssist</p>
  </div>`;
  return queueEmail(
    to,
    `Your Viyan MedAssist Trial Ends in ${daysLeft} Day${daysLeft > 1 ? 's' : ''}`,
    html,
  );
};
