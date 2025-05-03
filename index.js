const { default: makeWASocket, useMultiFileAuthState } = require('@whiskeysockets/baileys');
const { Boom } = require('@hapi/boom');
const P = require('pino');
const fs = require('fs');
const { google } = require('googleapis');
require('dotenv').config();

const SCOPES = ['https://www.googleapis.com/auth/spreadsheets'];

const authGoogle = new google.auth.GoogleAuth({
  keyFile: './credentials.json',
  scopes: SCOPES,
});

const sheets = google.sheets({ version: 'v4', auth: authGoogle });
const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
const SHEET_NAME = 'Conversaciones';

async function startBot() {
  const { state, saveCreds } = await useMultiFileAuthState('./session');

  const sock = makeWASocket({
    logger: P({ level: 'silent' }),
    printQRInTerminal: true,
    auth: state,
  });

  sock.ev.on('creds.update', saveCreds);

  sock.ev.on('messages.upsert', async ({ messages, type }) => {
    if (type !== 'notify') return;
    const msg = messages[0];
    if (!msg.message || msg.key.fromMe) return;

    const texto = msg.message.conversation || msg.message.extendedTextMessage?.text;
    const numero = msg.key.remoteJid.replace(/@s.whatsapp.net/, '');
    const fecha = new Date().toISOString();

    console.log(`📩 ${numero}: ${texto}`);

    const respuesta = generarRespuesta(texto);

    try {
      await sheets.spreadsheets.values.append({
        spreadsheetId: SPREADSHEET_ID,
        range: `${SHEET_NAME}!A:D`,
        valueInputOption: 'USER_ENTERED',
        requestBody: { values: [[fecha, numero, texto, respuesta]] },
      });
      console.log('✅ Guardado en Sheets');
    } catch (e) {
      console.error('❌ Error al guardar en Sheets:', e);
    }

    await sock.sendMessage(msg.key.remoteJid, { text: respuesta });
  });
}

function generarRespuesta(texto) {
  const t = texto.toLowerCase();
  if (t.includes('no')) return 'No hay problema. ¿Prefieres que te llamemos por teléfono?';
  if (t.includes('sí') || t.includes('si')) return 'Perfecto, ahora te explico los pasos para ahorrar en tu factura.';
  if (t.includes('precio') || t.includes('cuánto')) return 'Nuestros precios varían según el plan. ¿Te gustaría que te mande la información completa?';
  if (t.includes('factura') || t.includes('recibo')) return 'Claro, ¿quieres ayuda para reducir tu factura de luz o de otro servicio?';
  return 'Gracias por responder. ¿Te gustaría continuar por aquí o prefieres una llamada?';
}

startBot();