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
    cors: { origin: "*" },
    pingTimeout: 60000 // Mobilkapcsolat megtartása
});

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
    rank: { type: String, default: 'user' }, 
    isBanned: { type: Boolean, default: false },
    banExpiresAt: { type: Date, default: null },
    muteExpiresAt: { type: Date, default: null },
    createdAt: { type: Date, default: Date.now }
});
const Account = mongoose.model('Account', accountSchema);

const messageSchema = new mongoose.Schema({
    text: String,
    senderDisplayName: String,
    senderUniqueId: String,
    recipientUniqueId: { type: String, default: null }, // ÚJ: Privát üzenet
    rank: String,
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const activeUsers = new Map();

// RANG HIERARCHIA
const RANKS_POWER = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0 };

io.on('connection', async (socket) => {
    
    try {
        const publicMessages = await Message.find({ recipientUniqueId: null }).sort({ createdAt: 1 }).limit(100);
        socket.emit('initMessages', publicMessages);
    } catch (e) { console.error(e); }

    socket.on('login', async (data, callback) => {
        const { username, password, isGuest } = data;
        let acc;

        if (!isGuest) {
            const lowUser = username.toLowerCase();
            acc = await Account.findOne({ username: lowUser });
            
            if (acc) {
                if (acc.isBanned) return callback({ success: false, error: "Véglegesen ki vagy tiltva a szerverről!" });
                if (acc.banExpiresAt && acc.banExpiresAt > new Date()) {
                    const mins = Math.ceil((acc.banExpiresAt - new Date()) / 60000);
                    return callback({ success: false, error: `Ideiglenesen ki vagy tiltva! Hátralévő idő: ${mins} perc.` });
                }
                if (acc.password !== password) return callback({ success: false, error: "Hibás jelszó!" });
            } else {
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

        if (!isGuest) {
            // Privát üzenetek betöltése a belépőnek
            try {
                const privateMessages = await Message.find({
                    recipientUniqueId: { $ne: null },
                    $or: [ { recipientUniqueId: acc.uniqueId }, { senderUniqueId: acc.uniqueId } ]
                }).sort({ createdAt: 1 }).limit(50);
                if (privateMessages.length > 0) socket.emit('initPMs', privateMessages);
            } catch(e) {}

            const isCreator = acc.rank === 'creator';
            const sysMsg = new Message({ 
                text: isCreator ? "a weboldal készítője csatlakozott a chathez! 🛡️" : "megérkezett a partyra!", 
                senderDisplayName: acc.displayName, 
                senderUniqueId: "SYS", 
                rank: acc.rank, 
                isSystem: true 
            });
            await sysMsg.save();
            io.emit('newMessage', sysMsg);
        }
    });

    socket.on('adminAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || RANKS_POWER[admin.rank] < 40) return;

        const { targetId, action, value } = data;
        const targetAcc = await Account.findOne({ uniqueId: targetId });

        if (targetAcc) {
            if (targetAcc.rank === 'creator') return; 
            if (RANKS_POWER[admin.rank] <= RANKS_POWER[targetAcc.rank] && admin.rank !== 'creator') return; 
        }

        if (action === 'setRank') {
            if (RANKS_POWER[admin.rank] <= RANKS_POWER[value] && admin.rank !== 'creator') return; 
            await Account.updateOne({ uniqueId: targetId }, { rank: value });
        } else if (action === 'ban') {
            await Account.updateOne({ uniqueId: targetId }, { isBanned: true });
        } else if (action === 'mute') {
            const expireDate = new Date(Date.now() + value * 60000);
            await Account.updateOne({ uniqueId: targetId }, { muteExpiresAt: expireDate });
        }

        for (let [sid, u] of activeUsers.entries()) {
            if (u.uniqueId === targetId) {
                if (action === 'ban') io.sockets.sockets.get(sid)?.disconnect();
                if (action === 'setRank') u.rank = value;
                if (action === 'mute') u.muteExpiresAt = new Date(Date.now() + value * 60000);
            }
        }
        io.emit('updateUsers', Array.from(activeUsers.values()));
        if (action === 'setRank') io.emit('newMessage', { text: `Rang módosítva: #${targetId} -> ${value}`, isSystem: true, senderDisplayName: 'RENDSZER' });
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.isBanned) return;

        if (user.muteExpiresAt && user.muteExpiresAt > new Date()) {
            const mins = Math.ceil((user.muteExpiresAt - new Date()) / 60000);
            return socket.emit('newMessage', { text: `Le vagy némítva még ${mins} percig!`, isSystem: true, senderDisplayName: 'RENDSZER' });
        }

        // Privát Üzenet
        if (text.startsWith('/msg ')) {
            const parts = text.split(' ');
            const targetId = parts[1]?.replace('#', '');
            const pmText = parts.slice(2).join(' ');

            if (!targetId || !pmText) return;

            const pmMsg = new Message({
                text: pmText,
                senderDisplayName: user.displayName,
                senderUniqueId: user.uniqueId,
                recipientUniqueId: targetId, 
                rank: user.rank
            });
            await pmMsg.save();

            socket.emit('newMessage', pmMsg); // Visszakapja a küldő
            for (let [sid, u] of activeUsers.entries()) {
                if (u.uniqueId === targetId) io.to(sid).emit('newMessage', pmMsg); // Megkapja a címzett
            }
            return; 
        }

        // Parancsok
        if (text.startsWith('/')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            const targetId = args[1]?.replace('#', '');
            const timeArg = parseInt(args[2]);

            if (cmd === '/clear' && RANKS_POWER[user.rank] >= 60) {
                await Message.deleteMany({}); 
                return io.emit('clearChat'); 
            }
            if (cmd === '/kick' && targetId && RANKS_POWER[user.rank] >= 40) {
                for (let [sid, u] of activeUsers.entries()) { if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect(); }
                return io.emit('newMessage', { text: `Kidobta #${targetId}-t a chatből.`, isSystem: true, senderDisplayName: user.displayName, rank: user.rank });
            }
            if (cmd === '/announce' && args.length > 1 && RANKS_POWER[user.rank] >= 60) {
                const annMsg = args.slice(1).join(' ');
                const sysMsg = new Message({ text: `📢 BEJELENTÉS: ${annMsg}`, isSystem: true, senderDisplayName: user.displayName, rank: user.rank });
                await sysMsg.save();
                return io.emit('newMessage', sysMsg);
            }
            return;
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
        await Account.updateOne({ uniqueId: user.uniqueId }, { displayName: user.displayName, avatarSeed: user.avatarSeed });
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });

    socket.on('typing', (isTyping) => {
        const user = activeUsers.get(socket.id);
        if (user) {
            user.isTyping = isTyping;
            io.emit('typingUpdate', Array.from(activeUsers.values()).filter(u => u.isTyping));
        }
    });

    socket.on('disconnect', () => {
        activeUsers.delete(socket.id);
        io.emit('updateUsers', Array.from(activeUsers.values()));
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running..."));
