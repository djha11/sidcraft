export interface EmailSender {
  sendOtp(input: {
    email: string;
    code: string;
    purpose: "signup" | "password_reset";
    expiresMinutes: number;
  }): Promise<void>;
}

export class ConsoleEmailSender implements EmailSender {
  async sendOtp(input: {
    email: string;
    code: string;
    purpose: "signup" | "password_reset";
    expiresMinutes: number;
  }) {
    console.info(
      `[SidCraft OTP] ${input.purpose} for ${input.email}: ${input.code} (expires in ${input.expiresMinutes} minutes)`,
    );
  }
}

export class ResendEmailSender implements EmailSender {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}
  async sendOtp(input: {
    email: string;
    code: string;
    purpose: "signup" | "password_reset";
    expiresMinutes: number;
  }) {
    const action =
      input.purpose === "signup" ? "verify your email" : "reset your password";
    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        "content-type": "application/json",
      },
      body: JSON.stringify({
        from: this.from,
        to: [input.email],
        subject: `${input.code} is your SidCraft code`,
        html: `<div style="font-family:Arial,sans-serif;background:#0b0d12;color:#f5f6f8;padding:32px;border-radius:20px"><p style="color:#bfff46;font-weight:800">● SidCraft</p><h1>${input.code}</h1><p>Use this code to ${action}. It expires in ${input.expiresMinutes} minutes.</p><p style="color:#8f97a4">If you did not request this, you can safely ignore this email.</p></div>`,
      }),
    });
    if (!response.ok) throw new Error("EMAIL_DELIVERY_FAILED");
  }
}
