require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const io = new Server(server, {
    cors: { origin: "*", methods: ["GET", "POST"] }
});

// --- MONGODB CSATLAKOZÁS ---
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kristalyparty';

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ Sikeresen csatlakozva a MongoDB adatbázishoz!'))
    .catch(err => console.error('❌ MongoDB csatlakozási hiba:', err));

// --- ID GENERÁLÓ FÜGGVÉNY ---
function generateUniqueId() {
    return Math.floor(10000 + Math.random() * 90000).toString();
}

// --- MONGODB ADATMODELLEK ---
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true }, // Ezzel lép be
    displayName: { type: String, required: true }, // Ez jelenik meg a chatben (módosítható)
    password: { type: String, required: true }, 
    uniqueId: { type: String, required: true }, 
    createdAt: { type: Date, default: Date.now }
});
const Account = mongoose.model('Account', accountSchema);

const messageSchema = new mongoose.Schema({
    text: String,
    senderDisplayName: String, // Üzenetnél már a megjelenítő nevet mentjük
    senderId: String,       
    senderUniqueId: String, 
    isRegistered: Boolean,
    isCreator: { type: Boolean, default: false }, // ÚJ: Szaby-e az illető?
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

// Aktív felhasználók memóriában
const activeUsers = new Map();

// --- SOCKET.IO LOGIKA ---
io.on('connection', async (socket) => {
    console.log(`🔌 Új kapcsolat: ${socket.id}`);

    try {
        const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
        socket.emit('initMessages', messages);
    } catch (err) { console.error(err); }

    // 1. BEJELENTKEZÉS
    socket.on('login', async (data, callback) => {
        const { username, password, isGuest } = data;
        let finalDisplayName = username;
        let finalUsername = username;
        let isReg = false;
        let isCreator = false;
        let finalUniqueId = '';

        if (!isGuest) {
            const lowerUsername = username.toLowerCase();
            isCreator = (lowerUsername === 'szaby'); // FIGYELI A 'szaby' NEVET!

            try {
                let account = await Account.findOne({ username: lowerUsername });
                if (account) {
                    // Már regisztrált
                    if (account.password === password) {
                        finalDisplayName = account.displayName || account.originalName;
                        finalUsername = account.username;
                        finalUniqueId = account.uniqueId;
                        isReg = true;
                    } else {
                        return callback({ success: false, error: "Ez a név már foglalt, és a jelszó helytelen!" });
                    }
                } else {
                    // ÚJ REGISZTRÁCIÓ
                    finalUniqueId = generateUniqueId();
                    account = new Account({ 
                        username: lowerUsername, 
                        displayName: username, // Alapból a belépési név a megjelenítő
                        password: password,
                        uniqueId: finalUniqueId
                    });
                    await account.save();
                    finalDisplayName = username;
                    finalUsername = lowerUsername;
                    isReg = true;
                }
            } catch (err) { return callback({ success: false, error: "Adatbázis hiba történt." }); }
        } else {
            // Vendég
            finalDisplayName = username || "Vendég_" + Math.floor(Math.random() * 999);
            finalUsername = "guest_" + Math.floor(Math.random() * 99999);
            finalUniqueId = "G" + generateUniqueId().substring(1); 
        }

        activeUsers.set(socket.id, { 
            id: socket.id, 
            username: finalUsername,
            displayName: finalDisplayName, 
            uniqueId: finalUniqueId, 
            isRegistered: isReg, 
            isCreator: isCreator,
            isTyping: false 
        });

        callback({ success: true, displayName: finalDisplayName, uniqueId: finalUniqueId, isRegistered: isReg, isCreator: isCreator });
        io.emit('updateUsers', Array.from(activeUsers.values()));

        // Ha regisztrált lép be, írja ki (Szaby esetén extrán)
        if (isReg) {
            const sysMsg = new Message({ 
                text: isCreator ? "megérkezett, hogy felpörgesse a saját rádióját! 🎧" : "megérkezett a partyra!", 
                senderDisplayName: finalDisplayName, 
                senderId: "SYSTEM", 
                senderUniqueId: finalUniqueId,
                isRegistered: true, 
                isCreator: isCreator,
                isSystem: true 
            });
            await sysMsg.save();
            io.emit('newMessage', sysMsg);
        }
    });

    // 2. MEGJELENÍTŐ NÉV MÓDOSÍTÁSA (ÚJ)
    socket.on('changeDisplayName', async (newName) => {
        const user = activeUsers.get(socket.id);
        if (!user || !newName || newName.trim() === '') return;
        
        const safeName = newName.trim().substring(0, 20); // Max 20 karakter
        user.displayName = safeName;

        // Ha VIP, elmentjük a MongoDB-be is, hogy legközelebb is ez legyen!
        if (user.isRegistered) {
            try {
                await Account.updateOne({ username: user.username }, { displayName: safeName });
            } catch(e) { console.error("Hiba a név mentésekor", e); }
        }
        
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });

    // 3. ÜZENET KÜLDÉSE
    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || !text.trim()) return;
        try {
            const newMsg = new Message({ 
                text: text.trim(), 
                senderDisplayName: user.displayName, 
                senderId: user.id, 
                senderUniqueId: user.uniqueId, 
                isRegistered: user.isRegistered, 
                isCreator: user.isCreator, // Mentjük, ha a Készítő írt
                isSystem: false 
            });
            await newMsg.save();
            io.emit('newMessage', newMsg);
        } catch (err) { console.error(err); }
    });

    // 4. GÉPELÉS
    socket.on('typing', (isTyping) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.isTyping = isTyping;
            io.emit('typingUpdate', Array.from(activeUsers.values()).filter(u => u.isTyping));
        }
    });

    // 5. KILÉPÉS
    socket.on('disconnect', () => {
        if (activeUsers.has(socket.id)) {
            activeUsers.delete(socket.id);
            io.emit('updateUsers', Array.from(activeUsers.values()));
        }
        console.log(`❌ Kapcsolat bontva: ${socket.id}`);
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`🚀 Szerver fut a ${PORT} porton!`);
});
