const net = require('node:net');
const tls = require('node:tls');

function normalizeList(value) {
  return String(value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function getEmailConfig() {
  return {
    host: String(process.env.SMTP_HOST || '').trim(),
    port: Number(process.env.SMTP_PORT || 587),
    secure:
      String(process.env.SMTP_SECURE || '').trim().toLowerCase() === 'true' ||
      Number(process.env.SMTP_PORT || 587) === 465,
    startTls: String(process.env.SMTP_STARTTLS || 'true').trim().toLowerCase() !== 'false',
    user: String(process.env.SMTP_USER || '').trim(),
    password: String(process.env.SMTP_PASSWORD || '').trim(),
    from:
      String(process.env.SMTP_FROM || '').trim() ||
      String(process.env.SMTP_USER || '').trim(),
    adminEmails: [
      ...new Set([
        ...normalizeList(process.env.SPRINT_MANAGER_ADMIN_EMAILS),
        ...normalizeList(process.env.REACT_APP_SPRINT_MANAGER_ADMIN_EMAILS),
      ]),
    ],
  };
}

function buildAddressLine(values) {
  return normalizeList(values.join(','));
}

function formatMessage({ from, to, cc, subject, text }) {
  const headers = [
    `From: ${from}`,
    `To: ${buildAddressLine(to).join(', ')}`,
  ];

  const ccList = buildAddressLine(cc || []);

  if (ccList.length) {
    headers.push(`Cc: ${ccList.join(', ')}`);
  }

  headers.push(`Subject: ${subject}`);
  headers.push('MIME-Version: 1.0');
  headers.push('Content-Type: text/plain; charset=utf-8');
  headers.push('');
  headers.push(
    String(text || '')
      .replace(/\r?\n/g, '\r\n')
      .replace(/^\./gm, '..')
  );

  return `${headers.join('\r\n')}\r\n`;
}

function createSocket(config) {
  return new Promise((resolve, reject) => {
    const handleConnect = () => resolve(socket);
    const options = {
      host: config.host,
      port: config.port,
      servername: config.host,
    };
    const socket = config.secure
      ? tls.connect(options, handleConnect)
      : net.createConnection(options, handleConnect);

    socket.setEncoding('utf8');
    socket.once('error', reject);
  });
}

function readSmtpResponse(socket) {
  return new Promise((resolve, reject) => {
    let buffer = '';

    const handleData = (chunk) => {
      buffer += chunk;
      const lines = buffer.split(/\r?\n/).filter(Boolean);

      if (!lines.length) {
        return;
      }

      const lastLine = lines[lines.length - 1];

      if (/^\d{3} /.test(lastLine)) {
        socket.off('data', handleData);
        resolve(lines);
      }
    };

    socket.on('data', handleData);
    socket.once('error', (error) => {
      socket.off('data', handleData);
      reject(error);
    });
  });
}

async function sendCommand(socket, command, expectedCodes = [250]) {
  socket.write(`${command}\r\n`);
  const lines = await readSmtpResponse(socket);
  const code = Number(lines[lines.length - 1].slice(0, 3));

  if (!expectedCodes.includes(code)) {
    throw new Error(lines.join(' '));
  }

  return lines;
}

async function upgradeToTls(socket, config) {
  const securedSocket = tls.connect({
    socket,
    servername: config.host,
  });

  securedSocket.setEncoding('utf8');

  await new Promise((resolve, reject) => {
    securedSocket.once('secureConnect', resolve);
    securedSocket.once('error', reject);
  });

  return securedSocket;
}

async function authenticate(socket, config) {
  if (!config.user || !config.password) {
    return;
  }

  await sendCommand(socket, 'AUTH LOGIN', [334]);
  await sendCommand(socket, Buffer.from(config.user).toString('base64'), [334]);
  await sendCommand(socket, Buffer.from(config.password).toString('base64'), [235]);
}

async function sendSmtpEmail(message, config, recipients) {
  let socket = await createSocket(config);

  try {
    const greeting = await readSmtpResponse(socket);
    const greetingCode = Number(greeting[greeting.length - 1].slice(0, 3));

    if (greetingCode !== 220) {
      throw new Error(greeting.join(' '));
    }

    const ehloLines = await sendCommand(socket, 'EHLO localhost');
    const startTlsAvailable = ehloLines.some((line) => /STARTTLS/i.test(line));

    if (!config.secure && config.startTls && startTlsAvailable) {
      await sendCommand(socket, 'STARTTLS', [220]);
      socket = await upgradeToTls(socket, config);
      await sendCommand(socket, 'EHLO localhost');
    }

    await authenticate(socket, config);
    await sendCommand(socket, `MAIL FROM:<${config.from}>`);

    for (const recipient of recipients) {
      await sendCommand(socket, `RCPT TO:<${recipient}>`, [250, 251]);
    }

    await sendCommand(socket, 'DATA', [354]);
    socket.write(`${message}\r\n.\r\n`);
    const dataLines = await readSmtpResponse(socket);
    const dataCode = Number(dataLines[dataLines.length - 1].slice(0, 3));

    if (dataCode !== 250) {
      throw new Error(dataLines.join(' '));
    }

    await sendCommand(socket, 'QUIT', [221]);
  } finally {
    socket.end();
  }
}

async function sendEmail({ to = [], cc = [], subject, text }) {
  const config = getEmailConfig();
  const toList = buildAddressLine(Array.isArray(to) ? to : [to]);
  const ccList = buildAddressLine(Array.isArray(cc) ? cc : [cc]);
  const recipients = [...new Set([...toList, ...ccList])];

  if (!config.host || !config.from || !recipients.length) {
    return {
      sent: false,
      skipped: true,
      reason: 'SMTP is not configured.',
    };
  }

  const message = formatMessage({
    from: config.from,
    to: toList,
    cc: ccList,
    subject,
    text,
  });

  await sendSmtpEmail(message, config, recipients);

  return {
    sent: true,
    skipped: false,
  };
}

module.exports = {
  getEmailConfig,
  normalizeList,
  sendEmail,
};
