import nodemailer, { Transporter } from 'nodemailer';
import { config } from '../config/config';
import { logger } from '../utils/logger';
import { Language } from '../types';
import path from 'path';

let transporter: Transporter | null = null;

function getTransporter(): Transporter {
  if (!transporter) {
    transporter = nodemailer.createTransport({
      host: config.smtp.host,
      port: config.smtp.port,
      secure: config.smtp.port === 465,
      auth: {
        user: config.smtp.user,
        pass: config.smtp.password,
      },
    });
  }
  return transporter;
}

// ─── Internal review email ────────────────────────────────────────────────────

export async function sendReviewEmail(params: {
  clientName: string;
  usdot: string;
  changesDescription: string;
  attachments: string[];
}): Promise<void> {
  const { clientName, usdot, changesDescription, attachments } = params;
  const subject = `[REVISION] ${clientName} // USDOT ${usdot}`;

  const html = `
    <p>Por favor revisar los siguientes cambios:</p>
    <pre>${changesDescription}</pre>
    <p>Adjunto el certificado(s) correspondiente(s).</p>
  `;

  await send({
    to: config.review.email,
    subject,
    html,
    attachments: attachments.map(f => ({ path: f, filename: path.basename(f) })),
  });

  logger.info(`Review email sent to ${config.review.email} for client "${clientName}"`);
}

// ─── Client approval email ────────────────────────────────────────────────────

export async function sendClientApprovalEmail(params: {
  clientName: string;
  usdot: string;
  clientEmails: string[];
  agentEmails: string[];
  language: Language;
  changesDescription: string;
  note?: string;
  attachments: string[];
  sendToCopy?: string;
  isWelcome?: boolean;
}): Promise<void> {
  const {
    clientName,
    usdot,
    clientEmails,
    agentEmails,
    language,
    changesDescription,
    note,
    attachments,
    sendToCopy,
    isWelcome,
  } = params;

  const t = getTemplate(language, isWelcome ?? false);
  const subject = `${t.subjectPrefix} // "${clientName}" // USDOT "${usdot}"`;

  const noteBlock = note ? `\n${note}` : '';
  const html = isWelcome
    ? buildWelcomeHtml(language, clientName, changesDescription, noteBlock)
    : buildUpdatedCertHtml(language, changesDescription, noteBlock);

  // Main email to client with BCC to agent
  await send({
    to: clientEmails.join(', '),
    bcc: agentEmails.join(', '),
    subject,
    html,
    attachments: attachments.map(f => ({ path: f, filename: path.basename(f) })),
  });

  logger.info(`Approval email sent to client: ${clientEmails.join(', ')}`);

  // Optional: send to specific additional address
  if (sendToCopy) {
    await send({
      to: sendToCopy,
      cc: clientEmails.join(', '),
      subject,
      html,
      attachments: attachments.map(f => ({ path: f, filename: path.basename(f) })),
    });
    logger.info(`Additional copy sent to: ${sendToCopy}`);
  }
}

// ─── Simple reply ─────────────────────────────────────────────────────────────

export async function replyRecibido(to: string): Promise<void> {
  await send({ to, subject: 'Recibido', html: '<p>Recibido</p>' });
  logger.info(`"Recibido" reply sent to ${to}`);
}

// ─── Alert email ──────────────────────────────────────────────────────────────

export async function sendAlertEmail(params: {
  to: string;
  subject: string;
  body: string;
}): Promise<void> {
  await send({ to: params.to, subject: params.subject, html: `<pre>${params.body}</pre>` });
  logger.warn(`Alert email sent: ${params.subject}`);
}

// ─── Error notification email ────────────────────────────────────────────────

export async function sendErrorNotification(params: {
  emailSubject: string;
  errorMessage: string;
  commandType?: string;
  clientName?: string;
  usdot?: string;
  screenshots?: string[];
}): Promise<void> {
  const notifyEmail = config.errorNotify?.email;
  if (!notifyEmail) return;

  const { emailSubject, errorMessage, commandType, clientName, usdot, screenshots } = params;
  const subject = `[BOT ERROR] ${clientName ? `${clientName}` : 'Unknown client'}${usdot ? ` USDOT ${usdot}` : ''}`;

  const screenshotsHtml = screenshots && screenshots.length > 0
    ? `<p><strong>Capturas de pantalla adjuntas:</strong> ${screenshots.length}</p>`
    : '';

  const html = `
    <h3 style="color:red;">Error en Bot de Endosos</h3>
    <p><strong>Email procesado:</strong> ${emailSubject}</p>
    ${clientName ? `<p><strong>Cliente:</strong> ${clientName}</p>` : ''}
    ${usdot ? `<p><strong>USDOT:</strong> ${usdot}</p>` : ''}
    ${commandType ? `<p><strong>Comando:</strong> ${commandType}</p>` : ''}
    <p><strong>Error:</strong></p>
    <pre style="background:#f5f5f5;padding:10px;border:1px solid #ddd;">${errorMessage}</pre>
    ${screenshotsHtml}
    <p><em>Fecha: ${new Date().toLocaleString('es-CO', { timeZone: 'America/Chicago' })}</em></p>
  `;

  const attachments = (screenshots ?? [])
    .filter(p => !!p)
    .map(p => ({ path: p, filename: path.basename(p) }));

  try {
    await send({ to: notifyEmail, subject, html, attachments });
    logger.info(`Error notification sent to ${notifyEmail}${attachments.length > 0 ? ` (${attachments.length} screenshots)` : ''}`);
  } catch (err) {
    logger.error(`Failed to send error notification: ${(err as Error).message}`);
  }
}

// ─── Internal send helper ─────────────────────────────────────────────────────

async function send(options: {
  to: string;
  cc?: string;
  bcc?: string;
  subject: string;
  html: string;
  attachments?: { path: string; filename: string }[];
}): Promise<void> {
  const t = getTransporter();
  await t.sendMail({
    from: config.smtp.from,
    ...options,
  });
}

// ─── Templates ────────────────────────────────────────────────────────────────

function getTemplate(lang: Language, isWelcome: boolean) {
  if (lang === 'es') {
    return {
      subjectPrefix: isWelcome ? 'Bienvenido' : 'Certificado Actualizado',
    };
  }
  return {
    subjectPrefix: isWelcome ? 'Welcome' : 'Updated Certificate',
  };
}

function buildUpdatedCertHtml(lang: Language, changes: string, note: string): string {
  const signature = getSignatureHtml();

  if (lang === 'es') {
    return `
      <p>Saludos cordiales</p>
      <p>Adjunto Certificado actualizado con los siguientes cambios:</p>
      <p><strong>${changes}</strong></p>
      ${note ? `<p>${note}</p>` : ''}
      <p>Atentamente.</p>
      ${signature}
    `;
  }

  return `
    <p>Greetings</p>
    <p>Please find updated Certificate attached with the following changes:</p>
    <p><strong>${changes}</strong></p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Regards</p>
    ${signature}
  `;
}

function buildWelcomeHtml(lang: Language, clientName: string, changes: string, note: string): string {
  const signature = getSignatureHtml();
  // Welcome template - content to be defined by H2O team
  if (lang === 'es') {
    return `
      <p>Saludos cordiales,</p>
      <p>Bienvenido a H2O Insurance Agency, ${clientName}.</p>
      <p>${changes}</p>
      ${note ? `<p>${note}</p>` : ''}
      <p>Atentamente.</p>
      ${signature}
    `;
  }
  return `
    <p>Greetings,</p>
    <p>Welcome to H2O Insurance Agency, ${clientName}.</p>
    <p>${changes}</p>
    ${note ? `<p>${note}</p>` : ''}
    <p>Regards</p>
    ${signature}
  `;
}

function getSignatureHtml(): string {
  return `
    <hr/>
    <table>
      <tr>
        <td style="padding-right:20px;">
          <strong>We Value The Relationship<br/>More Than The Quote!</strong>
        </td>
        <td>
          <strong>H2O Commercial Insurance Agency</strong><br/>
          <em>Warm Regards: Customer Service Department</em><br/>
          Address: 2001 Timberloch Place Suite 500, The Woodlands, TX 77380<br/>
          Direct Line: 281-892-1563 / 281-809-0112 Ext 104<br/>
          Fax: 281-809-0115<br/>
          <a href="http://www.h2oins.com">www.h2oins.com</a> | 
          <a href="mailto:services@h2oins.com">services@h2oins.com</a><br/>
          <br/>
          <a href="https://www.google.com/maps/place//data=!4m3!3m2!1s0x8647375d2ec126f7:0x261d640bc2e8c86f!12e1">Find us</a> |
          <a href="https://api.whatsapp.com/send/?phone=12818096876&text&type=phone_number&app_absent=0">WhatsApp</a> |
          <a href="https://www.facebook.com/h2o.insurance/">Facebook</a> |
          <a href="https://www.instagram.com/h2o_ins/">Instagram</a>
        </td>
      </tr>
    </table>
  `;
}
