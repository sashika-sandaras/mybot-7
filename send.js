const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');

async function sendMovie() {
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    
    const sessionData = process.env.SESSION_ID;
    try {
        const base64Data = sessionData.split('Gifted~')[1];
        const buffer = Buffer.from(base64Data, 'base64');
        const decodedSession = zlib.gunzipSync(buffer).toString();
        fs.writeFileSync('./auth_info/creds.json', decodedSession);
        console.log("📂 Session File Ready.");
    } catch (e) {
        console.log("❌ Session Error: " + e.message);
        process.exit(1);
    }

    const { version } = await fetchLatestBaileysVersion();
    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        // ලොකු ෆයිල් යැවීමේදී ඇතිවන ප්‍රශ්න අවම කිරීමට timeout වැඩි කිරීම
        connectTimeoutMs: 60000,
        defaultQueryTimeoutMs: 0,
        keepAliveIntervalMs: 10000
    });

    sock.ev.on('creds.update', saveCreds);

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        
        if (connection === 'open') {
            console.log("✅ WhatsApp Connected!");
            const userJid = process.env.USER_JID;
            const filePath = './movie_mflix.mp4';

            if (fs.existsSync(filePath)) {
                console.log("📤 Sending as Document (Stable for large files)...");
                
                // වීඩියෝ එකක් විදිහට නෙවෙයි, ඩොකියුමන්ට් එකක් විදිහට යවනවා (Bypass limit)
                await sock.sendMessage(userJid, { 
                    document: fs.readFileSync(filePath), 
                    mimetype: 'video/mp4',
                    fileName: 'MFlix_Movie.mp4',
                    caption: "🎬 *MFlix Video Delivery*\n\nලොකු ෆයිල් එකක් නිසා මෙය ඩොකියුමන්ට් එකක් ලෙස එවා ඇත. ඩවුන්ලෝඩ් කර රසවිඳින්න! 🍿"
                });

                console.log("🚀 Movie Sent Successfully!");
                await delay(15000); 
                process.exit(0);
            } else {
                console.log("❌ File not found!");
                process.exit(1);
            }
        }
    });
}

sendMovie();
