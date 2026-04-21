require('dotenv').config(); // .env fájl betöltése (helyi teszteléshez)
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

// Express alkalmazás inicializálása
const app = express();
app.use(cors());

// A 'public' mappában lévő fájlokat (index.html) szolgálja ki a szerver
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- MONGODB ADATBÁZIS CSATLAKOZÁS (.env alapján) ---
// Render.com-on a környezeti változókból olvassa ki, helyben pedig alapértelmezett.
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kristalyparty';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Sikeresen csatlakozva a MongoDB adatbázishoz!'))
    .catch(err => console.error('❌ MongoDB csatlakozási hiba:', err));

// --- MONGODB ADATMODELLEK ---
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    originalName: { type: String, required: true },
    password: { type: String, required: true }, 
    createdAt: { type: Date, default: Date.now }
});
const Account = mongoose.model('Account', accountSchema);

const messageSchema = new mongoose.Schema({
    text: String,
    senderName: String,
    senderId: String,
    isRegistered: Boolean,
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Aktív felhasználók
const activeUsers = new Map();

// --- SOCKET.IO KOMMUNIKÁCIÓ ---
io.on('connection', async (socket) => {
    console.log(`🔌 Új kapcsolat: ${socket.id}`);

    try {
        const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
        socket.emit('initMessages', messages);
    } catch (err) { console.error(err); }

    socket.on('login', async (data, callback) => {
        const { username, password, isGuest } = data;
        let finalName = username;
        let isReg = false;

        if (!isGuest) {
            const lowerUsername = username.toLowerCase();
            try {
                let account = await Account.findOne({ username: lowerUsername });
                if (account) {
                    if (account.password === password) {
                        finalName = account.originalName;
                        isReg = true;
                    } else {
                        return callback({ success: false, error: "Ez a név már foglalt, és a jelszó helytelen!" });
                    }
                } else {
                    account = new Account({ username: lowerUsername, originalName: username, password: password });
                    await account.save();
                    finalName = username;
                    isReg = true;
                }
            } catch (err) { return callback({ success: false, error: "Adatbázis hiba történt." }); }
        } else {
            finalName = username || "Vendég_" + Math.floor(Math.random() * 9999);
        }

        activeUsers.set(socket.id, { id: socket.id, userName: finalName, isRegistered: isReg, isTyping: false });
        callback({ success: true, userName: finalName, isRegistered: isReg });
        io.emit('updateUsers', Array.from(activeUsers.values()));

        if (isReg) {
            const sysMsg = new Message({ text: "megérkezett a partyra!", senderName: finalName, senderId: "SYSTEM", isRegistered: true, isSystem: true });
            await sysMsg.save();
            io.emit('newMessage', sysMsg);
        }
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || !text.trim()) return;
        try {
            const newMsg = new Message({ text: text.trim(), senderName: user.userName, senderId: user.id, isRegistered: user.isRegistered, isSystem: false });
            await newMsg.save();
            io.emit('newMessage', newMsg);
        } catch (err) { console.error(err); }
    });

    socket.on('typing', (isTyping) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.isTyping = isTyping;
            io.emit('typingUpdate', Array.from(activeUsers.values()).filter(u => u.isTyping));
        }
    });

    socket.on('disconnect', () => {
        if (activeUsers.has(socket.id)) {
            activeUsers.delete(socket.id);
            io.emit('updateUsers', Array.from(activeUsers.values()));
        }
        console.log(`❌ Kapcsolat bontva: ${socket.id}`);
    });
});

// A portot a Render.com határozza meg, ha nem, akkor a 3000-es portot használjuk
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Szerver fut a ${PORT} porton!`);
});
