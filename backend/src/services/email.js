// backend/src/services/email.js
import nodemailer from 'nodemailer';
import { Resend } from 'resend';

const EMAIL_PROVIDER = String(process.env.EMAIL_PROVIDER || 'smtp').toLowerCase();

// ------- RESEND -------
const RESEND_API_KEY = process.env.RESEND_API_KEY || '';
const RESEND_FROM = process.env.RESEND_FROM || process.env.MAIL_FROM || '"Sistema" <no-reply@local>';
const RESEND_REPLY_TO = process.env.REPLY_TO || '';

// ------- SMTP (fallback/local) -------
const transporter = nodemailer.createTransport({
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: Number(process.env.SMTP_PORT || 587),
  secure: false, // 587 STARTTLS
  auth: {
    user: process.env.SMTP_USER,
    pass: process.env.SMTP_PASS,
  },
  pool: true,
  maxConnections: 3,
  maxMessages: 100,
  logger: true,
  debug: true,
  tls: { ciphers: 'TLSv1.2', rejectUnauthorized: false },
});

/** Verificación al iniciar el servidor (solo log informativo) */
export async function verifyEmailTransport() {
  if (EMAIL_PROVIDER === 'resend') {
    if (!RESEND_API_KEY) {
      console.error('[Email] Provider=Resend pero falta RESEND_API_KEY ❌');
      return { ok: false, provider: 'resend', error: 'Missing RESEND_API_KEY' };
    }
    console.log('[Email] Usando Resend ✅ from:', RESEND_FROM);
    return { ok: true, provider: 'resend' };
  }

  try {
    await transporter.verify();
    console.log('[Email] SMTP listo ✅ from:', process.env.MAIL_FROM || '"Sistema" <no-reply@local>');
    return { ok: true, provider: 'smtp' };
  } catch (err) {
    console.error('[Email] SMTP verificación ❌', err?.message || err);
    return { ok: false, provider: 'smtp', error: String(err?.message || err) };
  }
}

/**
 * Envía correo usando el provider configurado (Resend ➜ fallback SMTP).
 * @param {string|string[]} to
 * @param {string} subject
 * @param {string} html
 */
export async function sendEmail(to, subject, html) {
  const toList = Array.isArray(to) ? to : [to];

  // 1) Intentar RESEND si está activo
  if (EMAIL_PROVIDER === 'resend' && RESEND_API_KEY) {
    try {
      const resend = new Resend(RESEND_API_KEY);
      const { data, error } = await resend.emails.send({
        from: RESEND_FROM,
        to: toList,
        subject,
        html,
        reply_to: RESEND_REPLY_TO || undefined,
      });
      if (error) throw error;
      console.log('[Resend] Enviado ✅ id:', data?.id);
      return { provider: 'resend', id: data?.id, accepted: toList };
    } catch (e) {
      console.error('[Resend] Error ❌', e?.message || e);
      // sigue al fallback SMTP
    }
  }

  // 2) Fallback SMTP (útil para local o si Resend falla)
  const info = await transporter.sendMail({
    from: process.env.MAIL_FROM || '"Sistema" <no-reply@local>',
    to: toList,
    subject,
    html,
  });
  console.log('[SMTP] Enviado ✅', { messageId: info.messageId, accepted: info.accepted });
  return { provider: 'smtp', id: info.messageId, accepted: info.accepted };
}
