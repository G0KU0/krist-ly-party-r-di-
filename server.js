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
    pingTimeout: 60000 
});

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kristalyparty';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Online')).catch(err => console.error(err));

const RANKS = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0 };

const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, required: true },
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    avatarSeed: { type: String, default: () => Math.random().toString(36).substring(7) },
    avatarUrl: { type: String, default: '' },
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
    recipientUniqueId: { type: String, default: null }, 
    recipientDisplayName: { type: String, default: null }, 
    avatarSeed: { type: String, default: '' }, 
    avatarUrl: { type: String, default: '' }, 
    rank: String,
    isSystem: { type: Boolean, default: false },
    createdAt: { type: Date, default: Date.now }
});
const Message = mongoose.model('Message', messageSchema);

const activeUsers = new Map();

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
                    rank: isCreator ? 'creator' : 'user',
                    avatarUrl: ''
                });
                await acc.save();
            }
        } else {
            acc = { 
                displayName: username || "Vendég", 
                uniqueId: "G" + Math.floor(1000 + Math.random() * 9000), 
                rank: 'guest', 
                avatarSeed: socket.id,
                avatarUrl: ''
            };
        }

        activeUsers.set(socket.id, acc);
        callback({ success: true, user: acc });
        io.emit('updateUsers', Array.from(activeUsers.values()));

        if (!isGuest) {
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

    // --- ÚJ: VEZÉRLŐPULT (ADMIN PANEL) LOGIKA ---
    socket.on('requestAdminData', async () => {
        const user = activeUsers.get(socket.id);
        if (!user || user.rank !== 'creator') return; // CSAK SZABY (creator) FÉRHET HOZZÁ!
        
        try {
            const allAccounts = await Account.find({}, '-password').sort({ createdAt: -1 });
            socket.emit('adminDataResponse', allAccounts);
        } catch(e) { console.error(e); }
    });

    socket.on('adminDashboardAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || admin.rank !== 'creator') return; // CSAK SZABY MÓDOSÍTHAT!

        const { action, targetId, value } = data;
        
        try {
            if (action === 'delete') {
                await Account.deleteOne({ uniqueId: targetId });
                // Ha online van, kidobjuk
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect();
                }
            } else if (action === 'setRank') {
                await Account.updateOne({ uniqueId: targetId }, { rank: value });
                // Frissítjük, ha online
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) u.rank = value;
                }
            } else if (action === 'toggleBan') {
                const acc = await Account.findOne({ uniqueId: targetId });
                if(acc) {
                    acc.isBanned = !acc.isBanned;
                    await acc.save();
                    if(acc.isBanned) {
                        for (let [sid, u] of activeUsers.entries()) {
                            if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect();
                        }
                    }
                }
            }
            
            // Adatok újra lekérése és küldése a panelnek
            const allAccounts = await Account.find({}, '-password').sort({ createdAt: -1 });
            socket.emit('adminDataResponse', allAccounts);
            io.emit('updateUsers', Array.from(activeUsers.values()));

        } catch(e) { console.error(e); }
    });

    socket.on('adminAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || RANKS[admin.rank] < 40) return; 

        const { targetId, action, value } = data;
        const targetAcc = await Account.findOne({ uniqueId: targetId });
        
        if (targetAcc) {
            if (targetAcc.rank === 'creator') return; 
            if (RANKS[admin.rank] <= RANKS[targetAcc.rank] && admin.rank !== 'creator') return; 
        }

        if (action === 'setRank') {
            if (RANKS[admin.rank] <= RANKS[value] && admin.rank !== 'creator') return; 
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
        if (action === 'setRank') io.emit('newMessage', { text: `Rang módosítva: #${targetId} mostantól ${value}`, isSystem: true, senderDisplayName: 'RENDSZER' });
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.isBanned) return;

        if (user.muteExpiresAt && user.muteExpiresAt > new Date()) {
            const mins = Math.ceil((user.muteExpiresAt - new Date()) / 60000);
            return socket.emit('newMessage', { text: `Le vagy némítva még ${mins} percig!`, isSystem: true, senderDisplayName: 'RENDSZER' });
        }

        if (text.startsWith('/msg ')) {
            const parts = text.split(' ');
            const targetId = parts[1]?.replace('#', '');
            const pmText = parts.slice(2).join(' ');

            if (!targetId || !pmText) return;

            let targetName = 'Felhasználó';
            for (let [sid, u] of activeUsers.entries()) {
                if (u.uniqueId === targetId) targetName = u.displayName;
            }
            if (targetName === 'Felhasználó') {
                const acc = await Account.findOne({ uniqueId: targetId });
                if (acc) targetName = acc.displayName;
            }

            const pmMsg = {
                text: pmText,
                senderDisplayName: user.displayName,
                senderUniqueId: user.uniqueId,
                recipientUniqueId: targetId, 
                recipientDisplayName: targetName,
                avatarSeed: user.avatarSeed,
                avatarUrl: user.avatarUrl,
                rank: user.rank,
                createdAt: new Date(),
                isSystem: false
            };

            socket.emit('newMessage', pmMsg);
            for (let [sid, u] of activeUsers.entries()) {
                if (u.uniqueId === targetId) io.to(sid).emit('newMessage', pmMsg);
            }
            return; 
        }

        if (text.startsWith('/')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            const targetId = args[1]?.replace('#', '');

            if (cmd === '/clear' && RANKS[user.rank] >= 60) {
                await Message.deleteMany({}); 
                return io.emit('clearChat'); 
            }
            if (cmd === '/kick' && targetId && RANKS[user.rank] >= 40) {
                for (let [sid, u] of activeUsers.entries()) { if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect(); }
                return io.emit('newMessage', { text: `Kidobta #${targetId}-t a chatből.`, isSystem: true, senderDisplayName: user.displayName, rank: user.rank });
            }
            if (cmd === '/announce' && args.length > 1 && RANKS[user.rank] >= 60) {
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
            rank: user.rank,
            avatarSeed: user.avatarSeed,
            avatarUrl: user.avatarUrl
        });
        await newMsg.save();
        io.emit('newMessage', newMsg);
    });

    socket.on('updateProfile', async (data) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.rank === 'guest') return;
        
        user.displayName = data.displayName.substring(0, 20);
        user.avatarSeed = data.avatarSeed;
        user.avatarUrl = data.avatarUrl || '';
        
        await Account.updateOne({ uniqueId: user.uniqueId }, { 
            displayName: user.displayName, 
            avatarSeed: user.avatarSeed,
            avatarUrl: user.avatarUrl
        });
        
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
