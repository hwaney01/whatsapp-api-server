const express = require('express');
const { Client, LocalAuth } = require('whatsapp-web.js');
const qrcode = require('qrcode');
const bodyParser = require('body-parser');
const app = express();

// Render يعطينا بورت تلقائي، نستخدمه أو نستخدم 3000
const port = process.env.PORT || 3000;

app.use(bodyParser.json());

const sessions = {};

// دالة التحقق من عمل السيرفر
app.get('/', (req, res) => {
    res.send('WhatsApp API Server is Running! 🚀');
});

app.post('/init-session', async (req, res) => {
    const { session_id } = req.body;
    if (sessions[session_id]) return res.json({ status: 'already_active' });

    console.log(`Starting session: ${session_id}`);
    
    const client = new Client({
        authStrategy: new LocalAuth({ 
            clientId: session_id,
            dataPath: './.wwebjs_auth' // حفظ الجلسة مؤقتاً
        }),
        puppeteer: { 
            headless: true,
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-accelerated-2d-canvas',
                '--no-first-run',
                '--single-process',
                '--disable-gpu'
            ]
        }
    });

    sessions[session_id] = { client: client, qr: null, status: 'initializing' };

    client.on('qr', (qr) => {
        console.log('QR Generated');
        qrcode.toDataURL(qr, (err, url) => {
            sessions[session_id].qr = url;
            sessions[session_id].status = 'qr_ready';
        });
    });

    client.on('ready', () => {
        console.log('Client Ready');
        sessions[session_id].status = 'connected';
        sessions[session_id].qr = null;
    });

    client.on('disconnected', (reason) => {
        console.log('Client was logged out', reason);
        delete sessions[session_id];
    });

    try {
        client.initialize();
        res.json({ status: 'initializing' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.get('/get-qr/:session_id', (req, res) => {
    const s = sessions[req.params.session_id];
    // إذا كانت الجلسة غير موجودة، نرجع not_found لكي يقوم Laravel بإعادة تشغيلها
    if (!s) return res.json({ status: 'not_found' });
    res.json({ status: s.status, qr: s.qr });
});

app.post('/send-message', async (req, res) => {
    const { session_id, phone, message } = req.body;
    const s = sessions[session_id];
    
    if (!s || s.status !== 'connected') {
        // محاولة إعادة التشغيل الذاتي في حالة الفصل
        return res.status(400).json({ error: 'Session not connected' });
    }

    try {
        const chatId = phone.includes('@c.us') ? phone : phone + "@c.us";
        await s.client.sendMessage(chatId, message);
        res.json({ status: 'success' });
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

app.listen(port, () => console.log(`Server running on port ${port}`));
