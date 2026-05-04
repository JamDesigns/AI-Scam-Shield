import { describe, expect, it } from "vitest";

import { inferClassicThreatType } from "./threat-type.js";

describe("inferClassicThreatType", () => {
  it("returns none for low risk content", () => {
    expect(
      inferClassicThreatType(
        "This is a normal public news article about the weather.",
        "low_risk",
      ),
    ).toBe("none");
  });

  it("detects bank phishing", () => {
    expect(
      inferClassicThreatType(
        "Your bank account is locked. Verify your card details now.",
        "high_risk",
      ),
    ).toBe("bank_phishing");
  });

  it("detects account takeover", () => {
    expect(
      inferClassicThreatType(
        "Confirm your login password and verification code immediately.",
        "high_risk",
      ),
    ).toBe("account_takeover");
  });

  it("detects delivery scams", () => {
    expect(
      inferClassicThreatType(
        "Your package is held at customs. Pay the delivery fee now.",
        "high_risk",
      ),
    ).toBe("delivery_scam");
  });

  it("detects crypto scams", () => {
    expect(
      inferClassicThreatType(
        "Your wallet is restricted. Confirm your seed phrase now.",
        "high_risk",
      ),
    ).toBe("crypto_scam");
  });

  it("detects investment scams", () => {
    expect(
      inferClassicThreatType(
        "Deposit today and get guaranteed trading profits within 24 hours.",
        "high_risk",
      ),
    ).toBe("investment_scam");
  });

  it("detects fake support scams", () => {
    expect(
      inferClassicThreatType(
        "Customer support agent here. We need access to fix your account.",
        "high_risk",
      ),
    ).toBe("fake_support");
  });

  it("detects malware attempts", () => {
    expect(
      inferClassicThreatType(
        "Download this urgent security update attachment and install it now.",
        "high_risk",
      ),
    ).toBe("malware");
  });

  it("falls back to unknown suspicious for unmatched risky content", () => {
    expect(
      inferClassicThreatType(
        "This message looks suspicious and asks for immediate action.",
        "medium_risk",
      ),
    ).toBe("unknown_suspicious");
  });
});
