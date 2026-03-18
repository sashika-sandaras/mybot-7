const { default: makeWASocket, useMultiFileAuthState, delay, fetchLatestBaileysVersion } = require('@whiskeysockets/baileys');
const pino = require('pino');
const fs = require('fs');
const zlib = require('zlib');
const { execSync } = require('child_process');
const path = require('path');

async function startBot() {
    const sessionData = process.env.SESSION_ID;
    const userJid = process.env.USER_JID;
    const fileId = process.env.FILE_ID; // Google Drive File ID එක මෙතනට දෙන්න

    // --- Authentication (Session) ---
    if (!fs.existsSync('./auth_info')) fs.mkdirSync('./auth_info');
    if (sessionData && sessionData.startsWith('Gifted~')) {
        try {
            const base64Data = sessionData.split('Gifted~')[1];
            const buffer = Buffer.from(base64Data, 'base64');
            const decodedSession = zlib.gunzipSync(buffer).toString();
            fs.writeFileSync('./auth_info/creds.json', decodedSession);
        } catch (e) { console.log("Session Sync Error"); }
    }

    const { state, saveCreds } = await useMultiFileAuthState('./auth_info');
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
        auth: state,
        version,
        logger: pino({ level: 'silent' }),
        browser: ["MFlix-Engine", "Chrome", "20.0.04"]
    });

    sock.ev.on('creds.update', saveCreds);

    async function sendMsg(text) {
        await sock.sendMessage(userJid, { text: text });
    }

    sock.ev.on('connection.update', async (update) => {
        const { connection } = update;
        if (connection === 'open') {
            console.log('✅ Connected to WhatsApp');

            try {
                // 1. Request Received
                await sendMsg("✅ *Request Received...*");
                await delay(1000);

                // 2. Downloading
                await sendMsg("📥 *Download වෙමින් පවතී...*");

                // Python script to download from Google Drive using gdown
                const pyScript = `
import os, sys
try:
    import gdown
    file_id = "${fileId}"
    url = f"https://drive.google.com/uc?id={file_id}"
    # quiet=True simplifies output, fuzzy=True helps find ID in URL
    output = gdown.download(url, quiet=True, fuzzy=True)
    if output and os.path.exists(output):
        print(output)
    else:
        sys.exit(1)
except Exception:
    sys.exit(1)
`;
                fs.writeFileSync('downloader.py', pyScript);

                // Install gdown if not present (usually pre-installed in Actions, but safe to keep)
                try { execSync('pip install gdown'); } catch(e) {}
                
                // Run python downloader and get filename
                const fileName = execSync('python3 downloader.py').toString().trim();

                if (!fileName || !fs.existsSync(fileName)) throw new Error("Download Failed");

                // 3. Uploading
                await sendMsg("📤 *Upload වෙමින් පවතී...*");

                // Determine file type and set caption/mimetype
                const extension = path.extname(fileName).toLowerCase();
                const isSub = ['.srt', '.vtt', '.ass'].includes(extension);
                
                let captionHeader = "";
                let mimetype = "";

                if (isSub) {
                    captionHeader = "💚 *Subtitles Upload Successfully...*";
                    mimetype = "text/plain"; // Generic text for subtitles
                } else {
                    captionHeader = "💚 *Video Upload Successfully...*";
                    // Set correct video mimetype
                    mimetype = (extension === '.mp4') ? 'video/mp4' : 'video/x-matroska';
                }

                const finalCaption = `${captionHeader}\n\n📦 *File :* ${fileName}\n\n🏷️ *Mflix WhDownloader*\n💌 *Made With Sashika Sandras*`;

                // 4. Send Document to WhatsApp
                await sock.sendMessage(userJid, {
                    document: { url: `./${fileName}` },
                    fileName: fileName,
                    mimetype: mimetype,
                    caption: finalCaption
                });

                // 5. Success Message
                await sendMsg("☺️ *Mflix භාවිතා කළ ඔබට සුභ දවසක්...*\n*කරුණාකර Report කිරීමෙන් වළකින්න...* 💝");
                
                // Cleanup
                if (fs.existsSync(fileName)) fs.unlinkSync(fileName);
                if (fs.existsSync('downloader.py')) fs.unlinkSync('downloader.py');
                
                // Exit after success
                setTimeout(() => process.exit(0), 5000);

            } catch (err) {
                // 6. Error Message
                await sendMsg("❌ *වීඩියෝ හෝ Subtitles ගොනුවේ දෝෂයක්...*");
                process.exit(1);
            }
        }
    });
}

startBot();
