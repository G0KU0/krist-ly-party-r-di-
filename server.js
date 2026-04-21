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
const io = new Server(server, { cors: { origin: "*" } });

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kristalyparty';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Online')).catch(err => console.error(err));

// RANGOK SÚLYOZÁSA (Hierarchia)
const RANKS = {
    'creator': 100,
    'owner': 80,
    'admin': 60,
    'moderator': 40,
    'user': 20,
    'guest': 0
};

const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, required: true },
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    avatarSeed: { type: String, default: "123" },
    rank: { type: String, default: 'user' }, 
    isBanned: { type: Boolean, default: false },
    muteExpiresAt: { type: Date, default: null }
});
const Account = mongoose.model('Account', accountSchema);

const messageSchema = new mongoose.Schema({
    text: String,
    senderDisplayName: String,
    senderUniqueId: String,
    rank: String,
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const activeUsers = new Map();

io.on('connection', async (socket) => {
    
    socket.on('login', async (data, callback) => {
        const { username, password, isGuest } = data;
        let acc;

        if (!isGuest) {
            const lowUser = username.toLowerCase();
            acc = await Account.findOne({ username: lowUser });
            if (acc) {
                if (acc.isBanned) return callback({ success: false, error: "Ki vagy tiltva!" });
                if (acc.password !== password) return callback({ success: false, error: "Hibás jelszó!" });
            } else {
                acc = new Account({
                    username: lowUser,
                    displayName: username,
                    password: password,
                    uniqueId: Math.floor(10000 + Math.random() * 90000).toString(),
                    rank: (lowUser === 'szaby') ? 'creator' : 'user'
                });
                await acc.save();
            }
        } else {
            acc = { displayName: username || "Vendég", uniqueId: "G" + Math.floor(1000 + Math.random() * 9000), rank: 'guest', avatarSeed: socket.id };
        }

        activeUsers.set(socket.id, acc);
        callback({ success: true, user: acc });
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });

    // RANG VÁLTOZTATÁSA (UI-BÓL VAGY PARANCCSAL)
    socket.on('changeRank', async ({ targetId, newRank }) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || RANKS[admin.rank] < 60) return; // Minimum Admin jog kell

        const targetAccount = await Account.findOne({ uniqueId: targetId });
        if (!targetAccount) return;

        // HIERARCHIA ELLENŐRZÉS
        // 1. Készítő rangját senki nem nyúlhatja
        if (targetAccount.rank === 'creator') return;
        // 2. Csak nálad kisebb rangút módosíthatsz
        if (RANKS[admin.rank] <= RANKS[targetAccount.rank] && admin.rank !== 'creator') return;

        targetAccount.rank = newRank;
        await targetAccount.save();

        // Frissítés az online listában
        for (let [sid, u] of activeUsers.entries()) {
            if (u.uniqueId === targetId) {
                u.rank = newRank;
                io.to(sid).emit('rankUpdated', newRank);
            }
        }
        io.emit('updateUsers', Array.from(activeUsers.values()));
        io.emit('newMessage', { text: `Rang módosítva: #${targetId} mostantól ${newRank}`, isSystem: true, senderDisplayName: 'RENDSZER' });
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.isBanned) return;

        if (user.muteExpiresAt && user.muteExpiresAt > new Date()) return;

        const newMsg = new Message({
            text: text,
            senderDisplayName: user.displayName,
            senderUniqueId: user.uniqueId,
            rank: user.rank
        });
        await newMsg.save();
        io.emit('newMessage', newMsg);
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server Online"));
