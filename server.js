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

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB csatlakozva!'))
    .catch(err => console.error('❌ MongoDB hiba:', err));

// --- ADATMODELLEK ---
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, required: true },
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    avatarSeed: { type: String, default: () => Math.random().toString(36).substring(7) },
    rank: { type: String, default: 'user' }, // user, vip, admin, creator
    isBanned: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
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

// --- LOGIKA ---
io.on('connection', async (socket) => {
    
    socket.on('login', async (data, callback) => {
        const { username, password, isGuest } = data;
        let acc;

        if (!isGuest) {
            const lowUser = username.toLowerCase();
            acc = await Account.findOne({ username: lowUser });
            
            if (acc) {
                if (acc.isBanned) return callback({ success: false, error: "Ki vagy tiltva a szerverről!" });
                if (acc.password !== password) return callback({ success: false, error: "Hibás jelszó!" });
            } else {
                // Regisztráció
                const isCreator = (lowUser === 'szaby');
                acc = new Account({
                    username: lowUser,
                    displayName: username,
                    password: password,
                    uniqueId: Math.floor(10000 + Math.random() * 90000).toString(),
                    rank: isCreator ? 'creator' : 'user'
                });
                await acc.save();
            }
        } else {
            // Vendég logika
            acc = { 
                displayName: username || "Vendég", 
                uniqueId: "G" + Math.floor(1000 + Math.random() * 9000), 
                rank: 'guest', 
                avatarSeed: socket.id 
            };
        }

        activeUsers.set(socket.id, acc);
        callback({ success: true, user: acc });
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.isBanned) return;

        // PARANCSOK KEZELÉSE
        if (text.startsWith('/') && (user.rank === 'admin' || user.rank === 'creator')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            const targetId = args[1]?.replace('#', '');

            if (cmd === '/ban' && targetId) {
                await Account.updateOne({ uniqueId: targetId }, { isBanned: true });
                // Kickeljük az online felhasználót ha bent van
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) {
                        io.to(sid).emit('banned');
                        io.sockets.sockets.get(sid)?.disconnect();
                    }
                }
                return socket.emit('newMessage', { text: `Sikeresen kitiltottad: #${targetId}`, isSystem: true, senderDisplayName: 'RENDSZER' });
            }

            if (cmd === '/unban' && targetId) {
                await Account.updateOne({ uniqueId: targetId }, { isBanned: false });
                return socket.emit('newMessage', { text: `Feloldva: #${targetId}`, isSystem: true, senderDisplayName: 'RENDSZER' });
            }

            if (cmd === '/rank' && targetId && args[2]) {
                const newRank = args[2].toLowerCase();
                await Account.updateOne({ uniqueId: targetId }, { rank: newRank });
                return socket.emit('newMessage', { text: `Rank módosítva (#${targetId} -> ${newRank})`, isSystem: true, senderDisplayName: 'RENDSZER' });
            }
        }

        const newMsg = new Message({
            text: text,
            senderDisplayName: user.displayName,
            senderUniqueId: user.uniqueId,
            rank: user.rank
        });
        await newMsg.save();
        io.emit('newMessage', newMsg);
    });

    socket.on('updateProfile', async (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.rank === 'guest') return;
        
        user.displayName = data.displayName.substring(0, 20);
        user.avatarSeed = data.avatarSeed;
        
        await Account.updateOne({ uniqueId: user.uniqueId }, { 
            displayName: user.displayName, 
            avatarSeed: user.avatarSeed 
        });
        
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running..."));
