require('dotenv').config();
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const cors = require('cors');
const path = require('path');

const app = express();
app.use(cors());

const MONGO_URI = process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/kristalyparty';
mongoose.connect(MONGO_URI).then(() => console.log('✅ MongoDB Online')).catch(err => console.error(err));

// --- IP TŰZFAL ---
const bannedIpSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    bannedAt: { type: Date, default: Date.now }
});
const BannedIP = mongoose.model('BannedIP', bannedIpSchema);

app.use(async (req, res, next) => {
    let clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    if (clientIp && clientIp.includes(',')) clientIp = clientIp.split(',')[0];
    try {
        const isBanned = await BannedIP.exists({ ip: clientIp });
        if (isBanned) {
            return res.status(403).send("<h1 style='color:red; text-align:center; margin-top:50px; font-family:sans-serif;'>VÉGLEGESEN KI VAGY TILTVA ERRŐL A RENDSZERRŐL!</h1>");
        }
    } catch(e) { console.error(e); }
    next();
});

app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);

// JAVÍTÁS 1: Megnövelt Ping timeout, hogy a háttérben lévő lapok ne dobódjanak el azonnal!
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 120000,  // 2 percet vár, mielőtt eldobja a kapcsolatot
    pingInterval: 30000   // 30 másodpercenként ellenőriz
});

const RANKS = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0, 'visitor': -1 };

const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true },
    displayName: { type: String, required: true },
    password: { type: String, default: '' },
    uniqueId: { type: String, required: true },
    avatarSeed: { type: String, default: () => Math.random().toString(36).substring(7) },
    avatarUrl: { type: String, default: '' },
    bio: { type: String, default: '' }, 
    rank: { type: String, default: 'user' },
    isBanned: { type: Boolean, default: false },
    muteExpiresAt: { type: Date, default: null },
    lastIp: { type: String, default: '' }, 
    location: { type: String, default: 'Ismeretlen' },
    createdAt: { type: Date, default: Date.now },
    guestExpireAt: { type: Date, expires: 0 } 
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
    createdAt: { type: Date, default: Date.now, expires: 86400 } 
});
const Message = mongoose.model('Message', messageSchema);

const activeUsers = new Map();

// JAVÍTÁS 2: "SZELLEM MÓD" KÉSLELTETÉS (Ha valaki háttérbe rakja az oldalt, nem töröljük azonnal)
const pendingDisconnects = new Map();

function emitUpdatedUsers() {
    const uniqueUsers = [];
    const seen = new Set();
    const sorted = Array.from(activeUsers.values()).sort((a, b) => (RANKS[b.rank] || 0) - (RANKS[a.rank] || 0));
    
    for (let u of sorted) {
        if (!seen.has(u.uniqueId)) {
            seen.add(u.uniqueId);
            uniqueUsers.push(u);
        }
    }
    io.emit('updateUsers', uniqueUsers);
}

async function fetchLocation(ip) {
    if (!ip || ip === '::1' || ip === '127.0.0.1') return 'Helyi hálózat';
    try {
        const res = await fetch(`http://ip-api.com/json/${ip}`);
        const data = await res.json();
        if (data.status === 'success') return `${data.country}, ${data.city}`;
        return 'Ismeretlen';
    } catch (e) { return 'Ismeretlen'; }
}

io.on('connection', async (socket) => {
    let clientIp = socket.handshake.headers['x-forwarded-for'] || socket.handshake.address || socket.conn.remoteAddress;
    if (clientIp && clientIp.includes(',')) clientIp = clientIp.split(',')[0]; 

    const isSocketBanned = await BannedIP.exists({ ip: clientIp });
    if (isSocketBanned) return socket.disconnect();

    const browserId = socket.handshake.auth.browserId || ('V' + Math.floor(10000 + Math.random() * 90000));
    const userLocation = await fetchLocation(clientIp);

    // Okos takarító funkció a dupla lapok és a szellem mód ellen
    const clearOldSessions = (matchFn) => {
        for (let [sid, u] of activeUsers.entries()) {
            if (matchFn(u) && sid !== socket.id) {
                // Ha visszajött, megszakítjuk a törlési időzítőt!
                const pending = pendingDisconnects.get(sid);
                if (pending) {
                    clearTimeout(pending);
                    pendingDisconnects.delete(sid);
                }
                activeUsers.delete(sid);
                io.sockets.sockets.get(sid)?.disconnect(true);
            }
        }
    };

    activeUsers.set(socket.id, {
        browserId: browserId,
        username: 'látogató_' + browserId.substring(0, 5),
        displayName: 'Névtelen Látogató',
        uniqueId: browserId,
        rank: 'visitor', 
        avatarSeed: browserId,
        avatarUrl: '',
        bio: '',
        ip: clientIp,
        location: userLocation,
        muteExpiresAt: null, 
        connectedAt: Date.now()
    });
    
    emitUpdatedUsers();

    socket.on('login', async (data, callback) => {
        const { username, password, isGuest, guestId } = data;
        let acc;
        const currentUserData = activeUsers.get(socket.id); 
        const currentBrowserId = currentUserData.browserId;

        if (!isGuest) {
            const lowUser = username.toLowerCase();
            acc = await Account.findOne({ username: lowUser });
            
            if (acc) {
                if (acc.isBanned) return callback({ success: false, error: "Véglegesen ki vagy tiltva a szerverről!" });
                if (acc.password !== password) return callback({ success: false, error: "Hibás jelszó!" });
                acc.lastIp = clientIp;
                acc.location = userLocation;
                await acc.save();
            } else {
                const isCreator = (lowUser === 'szaby');
                acc = new Account({
                    username: lowUser,
                    displayName: username,
                    password: password,
                    uniqueId: Math.floor(10000 + Math.random() * 90000).toString(),
                    rank: isCreator ? 'creator' : 'user',
                    lastIp: clientIp,
                    location: userLocation
                });
                await acc.save();
            }
        } else {
            if (guestId) acc = await Account.findOne({ uniqueId: guestId });

            if (acc) {
                acc.lastIp = clientIp;
                acc.location = userLocation;
                if (username && username !== acc.displayName) acc.displayName = username;
                await acc.save(); 
            } else {
                const newGuestId = "G" + Math.floor(1000 + Math.random() * 9000);
                const genUsername = `vendeg_${newGuestId}_${Date.now()}`;
                
                acc = new Account({
                    username: genUsername,
                    displayName: username || "Vendég",
                    password: "", 
                    uniqueId: newGuestId,
                    rank: 'guest',
                    avatarUrl: '',
                    bio: '',
                    lastIp: clientIp,
                    location: userLocation,
                    guestExpireAt: new Date(Date.now() + 24 * 60 * 60 * 1000) 
                });
                await acc.save();
            }
        }

        // Régi "szellem" munkamenetek takarítása a belépésnél
        clearOldSessions(u => 
            u.browserId === currentBrowserId || 
            (isGuest && guestId && u.uniqueId === guestId) || 
            (!isGuest && u.username === acc.username)
        );

        activeUsers.set(socket.id, {
            ...currentUserData, 
            username: acc.username,
            displayName: acc.displayName,
            uniqueId: acc.uniqueId,
            rank: acc.rank,
            avatarSeed: acc.avatarSeed || currentBrowserId,
            avatarUrl: acc.avatarUrl || '',
            bio: acc.bio || '',
            muteExpiresAt: acc.muteExpiresAt 
        });

        callback({ success: true, user: activeUsers.get(socket.id) });
        emitUpdatedUsers();

        try {
            const publicMessages = await Message.find({ recipientUniqueId: null }).sort({ createdAt: 1 }).limit(100);
            socket.emit('initMessages', publicMessages);
        } catch (e) { console.error(e); }

        const isCreator = acc.rank === 'creator';
        const isGuestRank = acc.rank === 'guest';
        
        let joinText = "megérkezett a partyra!";
        if (isCreator) joinText = "a weboldal készítője csatlakozott a chathez! 🛡️";
        else if (isGuestRank) joinText = "csatlakozott vendégként! 👋";

        const sysMsg = new Message({ 
            text: joinText, 
            senderDisplayName: acc.displayName, 
            senderUniqueId: "SYS", 
            rank: acc.rank, 
            isSystem: true 
        });
        await sysMsg.save();
        io.emit('newMessage', sysMsg);
    });

    socket.on('logoutAccount', async () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            if (user.rank === 'guest') {
                try { await Account.deleteOne({ uniqueId: user.uniqueId }); } catch(e) { console.error(e); }
            }
            
            const bId = user.browserId;
            for (let [sid, u] of activeUsers.entries()) {
                if (u.browserId === bId || u.uniqueId === user.uniqueId) {
                    activeUsers.set(sid, {
                        ...u,
                        username: 'látogató_' + bId.substring(0, 5),
                        displayName: 'Névtelen Látogató',
                        uniqueId: bId,
                        rank: 'visitor',
                        avatarUrl: '',
                        bio: '',
                        muteExpiresAt: null
                    });
                }
            }
            emitUpdatedUsers();
        }
    });

    socket.on('requestAdminData', async () => {
        const user = activeUsers.get(socket.id);
        if (!user || user.rank !== 'creator') return; 
        try {
            const allAccounts = await Account.find({}).sort({ createdAt: -1 }).lean();
            const bannedIps = await BannedIP.find({}).lean(); 
            socket.emit('adminDataResponse', { accounts: allAccounts, bannedIps: bannedIps });
        } catch(e) { console.error(e); }
    });

    socket.on('adminDashboardAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || admin.rank !== 'creator') return; 

        const { action, targetId, value, editData } = data;
        
        try {
            if (action === 'delete') {
                await Account.deleteOne({ uniqueId: targetId });
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect();
                }
            } else if (action === 'setRank') {
                await Account.updateOne({ uniqueId: targetId }, { rank: value });
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
            } else if (action === 'unbanIp') {
                await BannedIP.deleteOne({ ip: value });
            } else if (action === 'editUser') {
                const { newUsername, newDisplayName, newPassword, newUniqueId } = editData;
                const updateDoc = {};
                if (newUsername) updateDoc.username = newUsername.toLowerCase();
                if (newDisplayName) updateDoc.displayName = newDisplayName;
                if (newPassword !== undefined) updateDoc.password = newPassword;
                if (newUniqueId) updateDoc.uniqueId = newUniqueId;
                
                await Account.updateOne({ uniqueId: targetId }, updateDoc);
                
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) {
                        if (newUsername) u.username = newUsername.toLowerCase();
                        if (newDisplayName) u.displayName = newDisplayName;
                        if (newUniqueId) u.uniqueId = newUniqueId;
                    }
                }
            }
            
            const allAccounts = await Account.find({}).sort({ createdAt: -1 }).lean();
            const bannedIps = await BannedIP.find({}).lean();
            socket.emit('adminDataResponse', { accounts: allAccounts, bannedIps: bannedIps });
            emitUpdatedUsers();

        } catch(e) { console.error(e); }
    });

    socket.on('radarAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || (admin.rank !== 'creator' && admin.rank !== 'owner')) return;
        
        const { action, targetIp, targetId } = data;

        if (action === 'banIp' && admin.rank === 'creator') {
            if (targetIp) {
                await BannedIP.updateOne({ ip: targetIp }, { ip: targetIp }, { upsert: true });
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.ip === targetIp) {
                        io.sockets.sockets.get(sid)?.disconnect(true);
                        activeUsers.delete(sid);
                    }
                }
            }
        } else if (action === 'kick') {
            const targetAcc = Array.from(activeUsers.values()).find(u => u.uniqueId === targetId);
            if (targetAcc && targetAcc.rank === 'creator') return;

            for (let [sid, u] of activeUsers.entries()) {
                if (u.uniqueId === targetId) {
                    io.sockets.sockets.get(sid)?.disconnect();
                    activeUsers.delete(sid);
                }
            }
        }
        emitUpdatedUsers();
    });

    socket.on('adminAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || RANKS[admin.rank] < 40) return; 

        const { targetId, action, value } = data;
        const targetAcc = Array.from(activeUsers.values()).find(u => u.uniqueId === targetId);
        
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
        } else if (action === 'unmute') {
            await Account.updateOne({ uniqueId: targetId }, { muteExpiresAt: null });
        }

        for (let [sid, u] of activeUsers.entries()) {
            if (u.uniqueId === targetId) {
                if (action === 'ban') io.sockets.sockets.get(sid)?.disconnect();
                if (action === 'setRank') u.rank = value;
                if (action === 'mute') u.muteExpiresAt = new Date(Date.now() + value * 60000);
                if (action === 'unmute') u.muteExpiresAt = null;
            }
        }
        emitUpdatedUsers();
        if (action === 'setRank') io.emit('newMessage', { text: `Rang módosítva: #${targetId} mostantól ${value}`, isSystem: true, senderDisplayName: 'RENDSZER' });
        if (action === 'unmute') io.emit('newMessage', { text: `Némítás feloldva: #${targetId}`, isSystem: true, senderDisplayName: 'RENDSZER' });
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.rank === 'visitor' || user.isBanned) return;

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
            if (cmd === '/clear' && RANKS[user.rank] >= 60) {
                await Message.deleteMany({}); 
                return io.emit('clearChat'); 
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
        if (!user || user.rank === 'guest' || user.rank === 'visitor') return;
        
        user.displayName = data.displayName.substring(0, 20);
        user.avatarSeed = data.avatarSeed;
        user.avatarUrl = data.avatarUrl || '';
        user.bio = data.bio ? data.bio.substring(0, 40) : ''; 
        
        await Account.updateOne({ uniqueId: user.uniqueId }, { 
            displayName: user.displayName, 
            avatarSeed: user.avatarSeed,
            avatarUrl: user.avatarUrl,
            bio: user.bio 
        });
        
        emitUpdatedUsers();
    });

    socket.on('typing', (isTyping) => {
        const user = activeUsers.get(socket.id);
        if (user && user.rank !== 'visitor') {
            user.isTyping = isTyping;
            io.emit('typingUpdate', Array.from(activeUsers.values()).filter(u => u.isTyping));
        }
    });

    // JAVÍTÁS 3: Ha megszakad a socket, NEM TÖRÖLJÜK AZONNAL! Elindul egy 2 perces türelmi idő.
    socket.on('disconnect', () => {
        const user = activeUsers.get(socket.id);
        if (user) {
            const timeout = setTimeout(() => {
                activeUsers.delete(socket.id);
                emitUpdatedUsers();
                pendingDisconnects.delete(socket.id);
            }, 120000); // 120,000 ms = 2 perc szellem mód
            
            pendingDisconnects.set(socket.id, timeout);
        }
    });
});

server.listen(process.env.PORT || 3000, () => console.log("🚀 Server running..."));
