import emailjs from "@emailjs/browser";

const emailJsConfig = {
  serviceId: import.meta.env.VITE_EMAILJS_SERVICE_ID,
  publicKey: import.meta.env.VITE_EMAILJS_PUBLIC_KEY,
  notifyTemplateId: import.meta.env.VITE_EMAILJS_NOTIFY_TEMPLATE_ID,
  replyTemplateId: import.meta.env.VITE_EMAILJS_REPLY_TEMPLATE_ID,
};

export async function sendContactMessage({ name, email, subject, message }) {
  const requiredConfig = [
    ["VITE_EMAILJS_SERVICE_ID", emailJsConfig.serviceId],
    ["VITE_EMAILJS_PUBLIC_KEY", emailJsConfig.publicKey],
    ["VITE_EMAILJS_NOTIFY_TEMPLATE_ID", emailJsConfig.notifyTemplateId],
    ["VITE_EMAILJS_REPLY_TEMPLATE_ID", emailJsConfig.replyTemplateId],
  ];

  for (const [variable, value] of requiredConfig) {
    if (!value) {
      console.error(`EmailJS configuration is missing ${variable}.`);
      throw new Error(`Missing EmailJS configuration: ${variable}`);
    }
  }

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

  await emailjs.send(emailJsConfig.serviceId, emailJsConfig.notifyTemplateId, params, {
    publicKey: emailJsConfig.publicKey,
  });

  try {
    await emailjs.send(emailJsConfig.serviceId, emailJsConfig.replyTemplateId, params, {
      publicKey: emailJsConfig.publicKey,
    });
  } catch (error) {
    console.warn("EmailJS auto-reply failed after the contact message was sent.", error);
  }
}
