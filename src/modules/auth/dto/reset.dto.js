export default class ResetDto {
  constructor({ email, otp, newPassword }) {
    this.email = email;
    this.otp = otp;
    this.newPassword = newPassword;
  }
}