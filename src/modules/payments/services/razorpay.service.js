import Razorpay from "razorpay";
import { getConfig } from "../../../config/payment.config.js";

const { keyId, keySecret } = getConfig();

export const razorpay = new Razorpay({
  key_id: keyId,
  key_secret: keySecret,
});
