import nodemailer from "nodemailer";

const SENDER_EMAIL = process.env.MAILER_USER || "exocoreai@gmail.com";
const SENDER_PASS = process.env.MAILER_PASS || "imxy xyzh mizr yzij";

const transporter = nodemailer.createTransport({
  service: "gmail",
  auth: { user: SENDER_EMAIL, pass: SENDER_PASS },
});

const FROM = `"Exocore" <${SENDER_EMAIL}>`;

const wrap = (title: string, body: string) => `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#0a0a0a;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',sans-serif;color:#f0f0f0;">
  <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="background:#0a0a0a;padding:40px 20px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellspacing="0" cellpadding="0" style="max-width:520px;background:#111;border:2px solid #333;box-shadow:6px 6px 0 0 #FFE500;">
        <tr><td style="padding:24px 28px;border-bottom:1px solid #222;">
          <span style="color:#FFE500;font-size:13px;font-weight:800;letter-spacing:.2em;font-family:ui-monospace,monospace;">EXOCORE</span>
        </td></tr>
        <tr><td style="padding:28px;">
          <h1 style="margin:0 0 12px 0;font-size:22px;font-weight:800;color:#f0f0f0;">${title}</h1>
          ${body}
        </td></tr>
        <tr><td style="padding:18px 28px;border-top:1px solid #222;color:#777;font-size:11px;">
          You are receiving this because you signed up for Exocore. If this wasn't you, ignore this email.
        </td></tr>
      </table>
    </td></tr>
  </table>
</body></html>`;

export async function sendVerifyEmail(email: string, link: string, nickname?: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: "Verify your Exocore account",
      text: `Hi ${nickname || "there"}, click the link to verify your Exocore account: ${link}`,
      html: wrap(
        "Verify your account",
        `
        <p style="margin:0 0 18px 0;color:#a0a0a0;line-height:1.6;font-size:14px;">
          Hi ${nickname ? `<b style="color:#fff">${nickname}</b>` : "there"} — tap the button below to confirm your email and finish setting up your Exocore account.
        </p>
        <p style="margin:0 0 24px 0;">
          <a href="${link}" style="display:inline-block;background:#FFE500;color:#000;padding:14px 28px;border:2px solid #000;box-shadow:4px 4px 0 #000;text-decoration:none;font-weight:800;letter-spacing:.08em;text-transform:uppercase;font-size:13px;">Verify my email</a>
        </p>
        <p style="margin:0;color:#666;font-size:12px;line-height:1.6;">
          Button broken? Copy &amp; paste this URL:<br>
          <span style="color:#FFE500;word-break:break-all;font-family:ui-monospace,monospace;font-size:11px;">${link}</span>
        </p>`
      ),
    });
    return true;
  } catch (err) {
    console.error("[mailer] verify error:", (err as Error).message);
    return false;
  }
}

export async function sendResetOtp(email: string, otp: string, nickname?: string): Promise<boolean> {
  try {
    await transporter.sendMail({
      from: FROM,
      to: email,
      subject: "Your Exocore password reset code",
      text: `Your Exocore password reset code is: ${otp}`,
      html: wrap(
        "Reset your password",
        `
        <p style="margin:0 0 18px 0;color:#a0a0a0;line-height:1.6;font-size:14px;">
          Hi ${nickname ? `<b style="color:#fff">${nickname}</b>` : "there"} — use the one-time code below to reset your password. It expires in 15 minutes.
        </p>
        <div style="background:#0a0a0a;border:2px solid #FFE500;padding:22px;text-align:center;font-family:ui-monospace,monospace;font-size:30px;letter-spacing:.45em;color:#FFE500;font-weight:800;margin:0 0 18px 0;">
          ${otp}
        </div>
        <p style="margin:0;color:#666;font-size:12px;line-height:1.6;">
          Didn't request this? You can safely ignore this email — your password won't change.
        </p>`
      ),
    });
    return true;
  } catch (err) {
    console.error("[mailer] reset error:", (err as Error).message);
    return false;
  }
}
