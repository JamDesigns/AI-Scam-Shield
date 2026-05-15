import type { ThreatType } from "./ai.js";

export function inferClassicThreatType(
  input: string,
  category: string,
): ThreatType {
  if (category === "low_risk") {
    return "none";
  }

  const lower = input.toLowerCase();

  const hasBankSignal =
    /\b(bank|banking|card|credit card|debit card|payment|paypal|account balance|transfer)\b/i.test(
      lower,
    );

  const hasAccountSignal =
    /\b(login|password|passcode|otp|verification code|security code|verify|account|locked|suspended|unauthorized|sign-in|signin)\b/i.test(
      lower,
    );

  const hasDeliverySignal =
    /\b(package|parcel|delivery|courier|customs|tracking|shipment|dhl|fedex|ups|usps)\b/i.test(
      lower,
    );

  const hasCryptoSignal =
    /\b(crypto|wallet|seed phrase|recovery phrase|private key|token|blockchain|exchange)\b/i.test(
      lower,
    );

  const hasInvestmentSignal =
    /\b(investment|invest|profit|returns|trading|passive income|guaranteed income|double your money)\b/i.test(
      lower,
    );

  const hasSupportSignal =
    /\b(support|technical support|customer support|help desk|agent|representative)\b/i.test(
      lower,
    );

  const hasMalwareSignal =
    /\b(download|install|attachment|open this file|apk|exe|update required|software update)\b/i.test(
      lower,
    );

  if (hasCryptoSignal) {
    return "crypto_scam";
  }

  if (hasDeliverySignal) {
    return "delivery_scam";
  }

  if (hasInvestmentSignal) {
    return "investment_scam";
  }

  if (hasMalwareSignal) {
    return "malware";
  }

  if (hasSupportSignal) {
    return "fake_support";
  }

  if (hasBankSignal && hasAccountSignal) {
    return "bank_phishing";
  }

  if (hasAccountSignal) {
    return "account_takeover";
  }

  if (hasBankSignal) {
    return "bank_phishing";
  }

  return "unknown_suspicious";
}
