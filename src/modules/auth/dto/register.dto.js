export default class RegisterDto {
  constructor({ email, password, shopName, fullName, role, branchName, fingerprint, selectedPlanId }) {
    this.email = email;
    this.password = password;
    this.shopName = shopName;
    this.fullName = fullName || '';
    this.role = role || 'owner';
    this.branchName = branchName || null;
    this.fingerprint = fingerprint || null;
    this.selectedPlanId = selectedPlanId || 'free-trial';
  }
}
