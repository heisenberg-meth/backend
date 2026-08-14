const BASE_STYLE = `
  font-family: 'Manrope', 'Helvetica Neue', Helvetica, Arial, sans-serif;
  max-width: 600px;
  margin: 0 auto;
  padding: 40px 20px;
  background-color: #0A0F1C;
  color: #E0E0E0;
  border-radius: 16px;
`;

const HEADER_STYLE = `
  color: #4FDBC8;
  margin-bottom: 24px;
  font-size: 24px;
  font-weight: 700;
`;

const CARD_STYLE = `
  background-color: #102131;
  padding: 24px;
  border-radius: 12px;
  border: 1px solid #1F2A44;
  margin-bottom: 24px;
`;

const FOOTER_STYLE = `
  font-size: 12px;
  color: #556B82;
  text-align: center;
  margin-top: 40px;
  border-top: 1px solid #1F2A44;
  padding-top: 20px;
`;

export const RESET_OTP_TEMPLATE = (otp) => `
  <div style="${BASE_STYLE}">
    <h2 style="${HEADER_STYLE}">Password Reset Request</h2>
    <div style="${CARD_STYLE}">
      <p style="margin-top: 0;">Use the following code to reset your password:</p>
      <div style="text-align: center; margin: 32px 0;">
        <span style="font-size: 40px; font-weight: 800; letter-spacing: 12px; color: #4FDBC8; font-family: monospace;">${otp}</span>
      </div>
      <p style="margin-bottom: 0; font-size: 14px; color: #8899AA;">This code will expire in 10 minutes. If you didn't request a password reset, please ignore this email.</p>
    </div>
    <div style="${FOOTER_STYLE}">
      <p>© 2026 Viyan MedAssist. All rights reserved.</p>
    </div>
  </div>
`;

export const CHANGE_EMAIL_TEMPLATE = (verifyUrl, newEmail) => `
  <div style="${BASE_STYLE}">
    <h2 style="${HEADER_STYLE}">Confirm Your New Email Address</h2>
    <div style="${CARD_STYLE}">
      <p style="margin-top: 0;">You requested to update your email address to <strong>${newEmail}</strong>.</p>
      <div style="text-align: center; margin: 32px 0;">
        <a href="${verifyUrl}" style="background-color: #4FDBC8; color: #0A0F1C; padding: 14px 28px; font-size: 16px; font-weight: 700; text-decoration: none; border-radius: 8px; display: inline-block;">Confirm Email Change</a>
      </div>
      <p style="margin-bottom: 0; font-size: 14px; color: #8899AA;">This link will expire in 1 hour. If you didn't request this change, please contact support immediately.</p>
    </div>
    <div style="${FOOTER_STYLE}">
      <p>© 2026 Viyan MedAssist. All rights reserved.</p>
    </div>
  </div>
`;
