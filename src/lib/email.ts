import { Resend } from "resend";

const from = process.env.EMAIL_FROM ?? "LitLoot <onboarding@resend.dev>";

export async function sendEmail(opts: {
  to: string;
  subject: string;
  text: string;
  html?: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key || !opts.to || opts.to.endsWith("@users.invalid")) return;
  try {
    const resend = new Resend(key);
    await resend.emails.send({
      from,
      to: opts.to,
      subject: opts.subject,
      text: opts.text,
      html: opts.html ?? `<p>${opts.text.replace(/\n/g, "<br>")}</p>`
    });
  } catch (err) {
    console.error("email send failed", err);
  }
}
