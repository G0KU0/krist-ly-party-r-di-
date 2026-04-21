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

mongoose.connect(MONGO_URI)
    .then(() => console.log('✅ MongoDB csatlakozva!'))
    .catch(err => console.error('❌ MongoDB hiba:', err));

// --- ADATMODELLEK ---
const accountSchema = new mongoose.Schema({
    username: { type: String, required: true, unique: true, lowercase: true }, // Ezzel lép be (pl. szaby)
    displayName: { type: String, required: true }, // Ez látszik a chatben
    password: { type: String, required: true },
    uniqueId: { type: String, required: true },
    avatarSeed: { type: String, default: () => Math.random().toString(36).substring(7) },
    rank: { type: String, default: 'user' }, // creator, admin, vip, user
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

// --- SZERVER LOGIKA ---
io.on('connection', async (socket) => {
    
    try {
        const messages = await Message.find().sort({ createdAt: 1 }).limit(100);
        socket.emit('initMessages', messages);
    } catch (e) { console.error(e); }

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
                // ÚJ REGISZTRÁCIÓ FIGYELÉSE: Ha a beírt név 'szaby', megkapja a 'creator' rangot
                const isCreator = (lowUser === 'szaby');
                acc = new Account({
                    username: lowUser,
                    displayName: username, // Kezdetben a felhasználónév a megjelenítő név
                    password: password,
                    uniqueId: Math.floor(10000 + Math.random() * 90000).toString(),
                    rank: isCreator ? 'creator' : 'vip'
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

        // Rendszerüzenet belépéskor
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

    socket.on('sendMessage', async (text) => {
        const user = activeUsers.get(socket.id);
        if (!user || user.isBanned) return;

        // MODERÁTORI PARANCSOK (/ban, /unban, /rank)
        if (text.startsWith('/') && (user.rank === 'admin' || user.rank === 'creator')) {
            const args = text.split(' ');
            const cmd = args[0].toLowerCase();
            const targetId = args[1]?.replace('#', '');

            if (cmd === '/ban' && targetId) {
                await Account.updateOne({ uniqueId: targetId }, { isBanned: true });
                for (let [sid, u] of activeUsers.entries()) {
                    if (u.uniqueId === targetId) io.sockets.sockets.get(sid)?.disconnect();
                }
                return socket.emit('newMessage', { text: `Sikeresen kitiltottad: #${targetId}`, isSystem: true, senderDisplayName: 'RENDSZER' });
            }

            if (cmd === '/unban' && targetId) {
                await Account.updateOne({ uniqueId: targetId }, { isBanned: false });
                return socket.emit('newMessage', { text: `Tiltás feloldva: #${targetId}`, isSystem: true, senderDisplayName: 'RENDSZER' });
            }

            if (cmd === '/rank' && targetId && args[2]) {
                await Account.updateOne({ uniqueId: targetId }, { rank: args[2].toLowerCase() });
                return socket.emit('newMessage', { text: `Rang módosítva: #${targetId} -> ${args[2]}`, isSystem: true, senderDisplayName: 'RENDSZER' });
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
