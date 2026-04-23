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

// --- ÚJ TŰZFAL RENDSZER: IP TILTÁSOK ADATBÁZISA ---
const bannedIpSchema = new mongoose.Schema({
    ip: { type: String, required: true, unique: true },
    bannedAt: { type: Date, default: Date.now }
});
const BannedIP = mongoose.model('BannedIP', bannedIpSchema);

// --- ÚJ: EXPRESS MIDDLEWARE (TŰZFAL) ---
// Ez minden bejövő kérést ellenőriz, mielőtt még betöltene a weboldal!
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
const io = new Server(server, { 
    cors: { origin: "*" },
    pingTimeout: 60000 
});

const RANKS = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0 };

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
    createdAt: { type: Date, default: Date.now, expires: 86400 } 
});
const Message = mongoose.model('Message', messageSchema);

// EBBEN A MAP-BEN TÁROLJUK AZ ÉLŐ, JELENLEGI LÁTOGATÓKAT (NEM A DB-BEN)
const activeUsers = new Map();

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

    // Ha véletlenül átcsúszott a tűzfalon a socket, itt is kidobjuk
    const isSocketBanned = await BannedIP.exists({ ip: clientIp });
    if (isSocketBanned) return socket.disconnect();

    socket.on('login', async (data, callback) => {
        const { username, password, isGuest, guestId } = data;
        let acc;
        const userLocation = await fetchLocation(clientIp);

        if (!isGuest) {
            const lowUser = username.toLowerCase();
            
            for (let [sid, u] of activeUsers.entries()) {
                if (u.username === lowUser) {
                    io.sockets.sockets.get(sid)?.disconnect();
                    activeUsers.delete(sid);
                }
            }

            acc = await Account.findOne({ username: lowUser });
            
            if (acc) {
                if (acc.isBanned) return callback({ success: false, error: "Véglegesen ki vagy tiltva a szerverről!" });
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
            // VENDÉGEKET NEM MENTÜNK ADATBÁZISBA! Csak legeneráljuk a memóriának.
            let existingGuest = null;
            if (guestId) {
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === guestId) {
                        existingGuest = u;
                        io.sockets.sockets.get(sid)?.disconnect();
                        activeUsers.delete(sid);
                        break;
                    }
                }
            }

            if (existingGuest) {
                acc = existingGuest;
                if (username && username !== acc.displayName) acc.displayName = username;
            } else {
                const newGuestId = "G" + Math.floor(1000 + Math.random() * 9000);
                acc = {
                    username: `vendeg_${newGuestId}`,
                    displayName: username || "Vendég",
                    uniqueId: newGuestId,
                    rank: 'guest',
                    avatarSeed: socket.id,
                    avatarUrl: '',
                    bio: ''
                };
            }
        }

        // TÁROLÁS KIZÁRÓLAG AZ ÉLŐ MEMÓRIÁBAN (Látható az Admin Panelben)
        activeUsers.set(socket.id, {
            username: acc.username,
            displayName: acc.displayName,
            uniqueId: acc.uniqueId,
            rank: acc.rank,
            avatarSeed: acc.avatarSeed,
            avatarUrl: acc.avatarUrl,
            bio: acc.bio || '',
            ip: clientIp, // Mentjük az IP-t
            location: userLocation, // Mentjük a helyet
            connectedAt: Date.now() // Mentjük a belépés percét
        });

        callback({ success: true, user: activeUsers.get(socket.id) });
        io.emit('updateUsers', Array.from(activeUsers.values()));

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

    // --- ÚJ: ÉLŐ RADAR ADATKÉRÉS (CSAK AKTÍV FELHASZNÁLÓK!) ---
    socket.on('requestAdminData', async () => {
        const user = activeUsers.get(socket.id);
        if (!user || (user.rank !== 'creator' && user.rank !== 'owner')) return; 
        
        // Csak azokat küldjük, akik benne vannak az activeUsers Map-ben (éppen online)
        const liveViewers = Array.from(activeUsers.values());
        socket.emit('adminDataResponse', liveViewers);
    });

    socket.on('adminDashboardAction', async (data) => {
        const admin = activeUsers.get(socket.id);
        if (!admin || (admin.rank !== 'creator' && admin.rank !== 'owner')) return; 

        const { action, targetIp, targetId, value } = data;
        
        try {
            // ÚJ: WEBOLDAL IP TILTÁSA (CSAK CREATOR!)
            if (action === 'banIp' && admin.rank === 'creator') {
                if (targetIp) {
                    await BannedIP.updateOne({ ip: targetIp }, { ip: targetIp }, { upsert: true });
                    // Azonnal kidobunk mindenkit, aki ezzel az IP-vel van bent
                    for (let [sid, u] of activeUsers.entries()) {
                        if (u.ip === targetIp) {
                            io.sockets.sockets.get(sid)?.disconnect(true);
                            activeUsers.delete(sid);
                        }
                    }
                }
            } 
            else if (action === 'setRank') {
                // Csak regisztráltakat lehet rangolni DB-ben
                await Account.updateOne({ uniqueId: targetId }, { rank: value });
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) u.rank = value;
                }
            }
            
            // Frissített élő adatok visszaküldése
            const liveViewers = Array.from(activeUsers.values());
            socket.emit('adminDataResponse', liveViewers);
            io.emit('updateUsers', liveViewers);

        } catch(e) { console.error(e); }
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
        } else if (action === 'kick') {
            for (let [sid, u] of activeUsers.entries()) {
                if (u.uniqueId === targetId) {
                    io.sockets.sockets.get(sid)?.disconnect();
                }
            }
            return io.emit('newMessage', { text: `Kidobta #${targetId}-t a chatből.`, isSystem: true, senderDisplayName: admin.displayName, rank: admin.rank });
        } else if (action === 'mute') {
            const expireDate = new Date(Date.now() + value * 60000);
            await Account.updateOne({ uniqueId: targetId }, { muteExpiresAt: expireDate });
        }

        for (let [sid, u] of activeUsers.entries()) {
            if (u.uniqueId === targetId) {
                if (action === 'setRank') u.rank = value;
                if (action === 'mute') u.muteExpiresAt = new Date(Date.now() + value * 60000);
            }
        }
        io.emit('updateUsers', Array.from(activeUsers.values()));
        if (action === 'setRank') io.emit('newMessage', { text: `Rang módosítva: #${targetId} mostantól ${value}`, isSystem: true, senderDisplayName: 'RENDSZER' });
    });

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user) return;

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
        if (!user || user.rank === 'guest') return;
        
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
