import emailjs from "@emailjs/browser";

// EmailJS settings. These values are public by design (the public key is meant to
// live in the browser), so they are written here directly. No Vercel environment
// variables are needed for the contact form.
const SERVICE_ID = "service_ueshubp";
const PUBLIC_KEY = "u_O2tIicq0ruHsZN6";
const NOTIFY_TEMPLATE_ID = "template_6qzntzn"; // email to me
const REPLY_TEMPLATE_ID = "template_sg8gkdj"; // auto-reply to the visitor

export async function sendContactMessage({ name, email, subject, message }) {
  if (typeof name !== "string" || name.length > 100) {
    throw new Error("Name must be 100 characters or fewer.");
  }
  if (typeof email !== "string" || email.length > 200) {
    throw new Error("Email must be 200 characters or fewer.");
  }
  if (typeof message !== "string" || message.length > 2000) {
    throw new Error("Message must be 2000 characters or fewer.");
  }

  const params = {
    name,
    email,
    title: subject || "Portfolio inquiry",
    message,
    time: new Date().toLocaleString(),
  };

  // 1) Email to me. If this fails, stop.
  await emailjs.send(SERVICE_ID, NOTIFY_TEMPLATE_ID, params, { publicKey: PUBLIC_KEY });

  // 2) Auto-reply to the visitor. If only this fails, the message still counts as sent.
  try {
    await emailjs.send(SERVICE_ID, REPLY_TEMPLATE_ID, params, { publicKey: PUBLIC_KEY });
  } catch (error) {
    console.warn("EmailJS auto-reply failed after the contact message was sent.", error);
  }
}
