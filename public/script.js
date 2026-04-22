// RÁDIÓ LOGIKA
const audio = document.getElementById('radio-stream');
const playBtn = document.getElementById('play-pause-btn');
const icons = { play: document.getElementById('icon-play'), pause: document.getElementById('icon-pause'), load: document.getElementById('icon-loading') };
const visualizer = document.getElementById('visualizer');
const volumeSlider = document.getElementById('volume-slider');

audio.volume = volumeSlider.value / 100;
playBtn.addEventListener('click', () => {
    if (audio.paused) {
        const p = audio.play();
        icons.play.classList.add('hidden'); icons.pause.classList.add('hidden'); icons.load.classList.remove('hidden');
        if (p) p.then(() => { icons.load.classList.add('hidden'); icons.pause.classList.remove('hidden'); visualizer.classList.add('playing-animation'); })
                .catch(e => { icons.load.classList.add('hidden'); icons.play.classList.remove('hidden'); alert("Hiba a lejátszáskor!"); });
    } else {
        audio.pause();
        icons.pause.classList.add('hidden'); icons.play.classList.remove('hidden'); visualizer.classList.remove('playing-animation');
    }
});
volumeSlider.addEventListener('input', e => audio.volume = e.target.value / 100);
audio.addEventListener('waiting', () => { icons.play.classList.add('hidden'); icons.pause.classList.add('hidden'); icons.load.classList.remove('hidden'); visualizer.classList.remove('playing-animation'); });
audio.addEventListener('playing', () => { icons.load.classList.add('hidden'); icons.play.classList.add('hidden'); icons.pause.classList.remove('hidden'); visualizer.classList.add('playing-animation'); });

// CHAT LOGIKA
const socket = io(); 

let userDisplayName = '';
let myUniqueId = ''; 
let myRank = '';
let myAvatarSeed = '';
let myAvatarUrl = ''; 
let typingTimeout = null; 
let allMessages = []; 
let selectedUserId = null;
let onlineUsersData = [];

// TABS VÁLTOZÓK
let currentTab = 'main'; 
let pmTabs = {}; 

const RANKS_POWER = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0 };

const statusDot = document.getElementById('server-status-dot');
const statusText = document.getElementById('server-status-text');
const messagesContainer = document.getElementById('messages-container');
const onlineUsersSidebar = document.getElementById('online-users-sidebar');
const typingIndicator = document.getElementById('typing-indicator');

const sidebarContainer = document.getElementById('users-sidebar-container');
const sidebarOverlay = document.getElementById('sidebar-overlay');

// --- BIZTONSÁGOS EMOJI ÉS GIF PANEL LOGIKA ---
const mediaSearch = document.getElementById('media-search');
const emojiContainer = document.getElementById('content-emojis');
const gifContainer = document.getElementById('content-gifs');
let currentMediaTab = 'emojis';
let gifSearchTimeout = null;

window.toggleEmojiPanel = function(e) {
    if (e) {
        e.preventDefault();
        e.stopPropagation();
    }
    const emojiPanel = document.getElementById('emoji-panel');
    
    if (emojiPanel.classList.contains('active')) {
        emojiPanel.classList.remove('active');
    } else {
        emojiPanel.classList.add('active');
        if (currentMediaTab === 'gifs' && gifContainer.innerHTML.trim() === '') {
            fetchGifs('party dance club');
        }
    }
};

document.addEventListener('click', function(event) {
    const emojiPanel = document.getElementById('emoji-panel');
    const emojiBtn = document.getElementById('emoji-toggle-btn');
    if (emojiPanel && emojiPanel.classList.contains('active')) {
        const isClickInsidePanel = emojiPanel.contains(event.target);
        const isClickOnButton = emojiBtn.contains(event.target);
        
        if (!isClickInsidePanel && !isClickOnButton) {
            emojiPanel.classList.remove('active');
        }
    }
});

const emojisDict = [
    { e: '😀', k: 'mosoly smile happy vidám' }, { e: '😂', k: 'nevet sir lol rofl vicces' },
    { e: '😍', k: 'szerelem love imádom szív' }, { e: '😎', k: 'menő cool szemüveg' },
    { e: '🥳', k: 'buli party ünnep' }, { e: '🤩', k: 'sztár wow csillag' },
    { e: '😜', k: 'nyelv vicc dilis' }, { e: '🤪', k: 'őrült crazy' },
    { e: '🤬', k: 'dühös mérges káromkodás csúnya' }, { e: '🤯', k: 'agyrobbanás wtf' },
    { e: '❤️', k: 'szív szerelem piros' }, { e: '💔', k: 'törött szív szomorú' },
    { e: '💯', k: 'száz tökéletes' }, { e: '💥', k: 'robbanás bumm' },
    { e: '👋', k: 'hello szia viszlát' }, { e: '👍', k: 'ok like fasza jó' },
    { e: '👎', k: 'nem rossz dislike' }, { e: '🙏', k: 'kérlek please ima' },
    { e: '💃', k: 'tánc nő buli dance party' }, { e: '🕺', k: 'tánc férfi buli dance party' },
    { e: '👯‍♀️', k: 'lányok buli nyuszi tánc' }, { e: '🥂', k: 'koccintás pia pezsgő iszunk' },
    { e: '🍻', k: 'sör koccintás pia buli' }, { e: '🔥', k: 'tűz forró hot' },
    { e: '🎶', k: 'zene hangjegy dal' }, { e: '🎤', k: 'mikrofon ének karaoke' }
];

const genericEmojis = ['🤫','🤔','🤐','🥵','🥶','😱','🥸','🤓','😈','👿','🤡','💩','👻','💀','👽','👾','🤖','💋','💌','💘','💝','💖','💗','💓','💞','💕','💟','❣️','🧡','💛','💚','💙','💜','🤎','🖤','🤍','💢','💫','💦','💨','🕳️','💣','💬','👁️‍🗨️','🗨️','🗯️','💭','💤','🤚','🖐️','✋','🖖','👌','🤌','🤏','✌️','🤞','🤟','🤘','🤙','👈','👉','👆','🖕','👇','☝️','✊','👊','🤛','🤜','👏','🙌','👐','🤲','🤝','✍️','💅','🤳','💪','🦾','🦿','🦵','🦶','👂','🦻','👃','🦼','🦽','🦷','🦴','👀','👁️','👅','👄','👶','🧒','👦','👧','🧑','👱','👨','🧔','👨‍🦰','👨‍🦱','👨‍🦳','👨‍🦲','👩','👩‍🦰','🧑‍🦰','👩‍🦱','🧑‍🦱','👩‍🦳','🧑‍🦳','👩‍🦲','🧑‍🦲','👱‍♀️','👱‍♂️','🧓','👴','👵','🙍','🙎','🙅','🙆','💁','🙋','🧏','🙇','🤦','🤷','🧑‍⚕️','👨‍⚕️','👩‍⚕️','🧑‍🎓','👨‍🎓','👩‍🎓','🧑‍🏫','👨‍🏫','👩‍🏫','🧑‍⚖️','👨‍⚖️','👩‍⚖️','🧑‍🌾','👨‍🌾','👩‍🌾','🧑‍🍳','👨‍🍳','👩‍🍳','🧑‍🔧','👨‍🔧','👩‍🔧','🧑‍🏭','👨‍🏭','👩‍🏭','🧑‍💼','👨‍💼','👩‍⚖️','🧑‍🔬','👨‍🔬','👩‍🔬','🧑‍💻','👨‍💻','👩‍💻','🧑‍🎤','👨‍🎤','👩‍🎤','🧑‍🎨','👨‍🎨','👩‍🎨','🧑‍✈️','👨‍✈️','👩‍✈️','🧑‍🚀','👨‍✈️','👩‍🚀','🧑‍🚒','👨‍🚒','👩‍🚒','👮','👮‍♂️','👮‍♀️','🕵️','🕵️‍♂️','🕵️‍♀️','💂','💂‍♂️','💂‍♀️','🥷','👷','👷‍♂️','👷‍♀️','🤴','👸','👳','👳‍♂️','👳‍♀️','👲','🧕','🤵','🤵‍♂️','🤵‍♀️','👰','👰‍♂️','👰‍♀️','🤰','🤱','🧑‍🍼','👨‍🍼','👩‍🍼','👼','🎅','🤶','🧑‍🎄','🦸','🦸‍♂️','🦸‍♀️','🦹','🦹‍♂️','🦹‍♀️','🧙','🧙‍♂️','🧙‍♀️','🧚','🧚‍♂️','🧚‍♀️','🧛','🧛‍♂️','🧛‍♀️','🧜','🧜‍♂️','🧜‍♀️','🧝','🧝‍♂️','🧝‍♀️','🧞','🧞‍♂️','🧝‍♀️','🧟','🧟‍♂️','🧟‍♀️','💆','💇','🚶','🧍','🧎','🧑‍🦯','👨‍🦯','👩‍🦯','🧑‍🦼','👨‍🦼','👩‍🦼','🧑‍🦽','👨‍🦽','👩‍🦽','🏃','🏃‍♂️','🏃‍♀️','🕴️','👯‍♂️','🧖','🧗','🤺','🏇','⛷️','🏂','🏌️','🏄','🚣','🏊','⛹️','🏋️','🚴','🚵','🤸','🤼','🤽','🤾','🤹','🧘','🛀','🛌','👭','👫','👬','💏','👩‍❤️‍👨','👨‍❤️‍👨','👩‍❤️‍👩','💑','👩‍❤️‍💋‍👨','👨‍❤️‍💋‍👨','👩‍❤️‍💋‍👩','👪','👨‍👩‍👦','👨‍👩‍👧','👨‍👩‍👧‍👦','👨‍👩‍👦‍👦','👨‍👩‍👧‍👧','👨‍👨‍👦','👨‍👨‍👧','👨‍👨‍👧‍👦','👨‍👨‍👦‍👦','👨‍👨‍👧‍👧','👩‍👩‍👦','👩‍👩‍👧','👩‍👩‍👧‍👦','👩‍👩‍👦‍👦','👩‍👩‍👧‍👧','👨‍👦','👨‍👦‍👦','👨‍👧','👨‍👧‍👦','👨‍👧‍👧','👩‍👦','👩‍👦‍👦','👩‍👧','👩‍👧‍👦','👩‍👧‍👧','🗣️','👤','👥','🫂'];

function renderEmojis(filterQuery = '') {
    emojiContainer.innerHTML = '';
    const msgInput = document.getElementById('message-input');
    
    let filteredDict = emojisDict;
    if (filterQuery) {
        filteredDict = emojisDict.filter(item => item.k.includes(filterQuery));
    }
    
    filteredDict.forEach(item => {
        const span = document.createElement('span');
        span.innerText = item.e;
        span.className = "cursor-pointer hover:scale-125 transition-transform";
        span.onclick = (e) => { 
            e.preventDefault(); e.stopPropagation();
            if(msgInput) { msgInput.value += item.e; msgInput.focus(); }
        };
        emojiContainer.appendChild(span);
    });

    if (!filterQuery) {
        genericEmojis.forEach(em => {
            const span = document.createElement('span');
            span.innerText = em;
            span.className = "cursor-pointer hover:scale-125 transition-transform";
            span.onclick = (e) => { 
                e.preventDefault(); e.stopPropagation();
                if(msgInput) { msgInput.value += em; msgInput.focus(); }
            };
            emojiContainer.appendChild(span);
        });
    }
}

renderEmojis();

// TENOR API KERESŐ (GIF)
async function fetchGifs(query) {
    gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-gray-500 py-4">Keresés...</div>';
    try {
        const res = await fetch(`https://g.tenor.com/v1/search?q=${encodeURIComponent(query)}&key=LIVDSRZULELA&limit=30`);
        const data = await res.json();
        gifContainer.innerHTML = '';
        
        if (!data.results || data.results.length === 0) {
            gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-gray-500 py-4">Nincs találat.</div>';
            return;
        }

        data.results.forEach(gif => {
            const img = document.createElement('img');
            img.src = gif.media[0].tinygif.url; 
            img.className = "gif-img";
            img.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                const txt = `[GIF]${gif.media[0].gif.url}`; 
                if (currentTab !== 'main') socket.emit('sendMessage', `/msg #${currentTab} ${txt}`);
                else socket.emit('sendMessage', txt);
                const p = document.getElementById('emoji-panel');
                if(p) p.classList.remove('active');
            };
            gifContainer.appendChild(img);
        });
    } catch(e) {
        console.error(e);
        gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-red-500 py-4">Hiba a betöltéskor.</div>';
    }
}

if(mediaSearch) {
    mediaSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (currentMediaTab === 'emojis') {
            renderEmojis(query);
        } else {
            clearTimeout(gifSearchTimeout);
            gifSearchTimeout = setTimeout(() => {
                fetchGifs(query || 'party dance club');
            }, 600); 
        }
    });
}

window.switchEmojiTab = function(tab) {
    currentMediaTab = tab;
    const eBtn = document.getElementById('tab-btn-emojis');
    const gBtn = document.getElementById('tab-btn-gifs');
    
    if(mediaSearch) mediaSearch.value = ''; 

    if (tab === 'emojis') {
        if(eBtn) eBtn.className = "flex-1 py-3 text-xs font-bold text-cyan-400 border-b-2 border-cyan-400";
        if(gBtn) gBtn.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-white border-b-2 border-transparent";
        if(emojiContainer) emojiContainer.classList.remove('hidden'); 
        if(gifContainer) gifContainer.classList.add('hidden');
        if(mediaSearch) mediaSearch.placeholder = "Keresés (pl. mosoly, party, szív)...";
        renderEmojis(); 
    } else {
        if(gBtn) gBtn.className = "flex-1 py-3 text-xs font-bold text-cyan-400 border-b-2 border-cyan-400";
        if(eBtn) eBtn.className = "flex-1 py-3 text-xs font-bold text-slate-400 hover:text-white border-b-2 border-transparent";
        if(gifContainer) gifContainer.classList.remove('hidden'); 
        if(emojiContainer) emojiContainer.classList.add('hidden');
        if(mediaSearch) mediaSearch.placeholder = "GIF Keresés (angolul a legjobb)...";
        if (gifContainer && gifContainer.innerHTML.trim() === '') fetchGifs('party dance club');
    }
}

// MOBILOS MENÜ LOGIKA (TAGLISTA)
window.openSidebar = function() {
    if(sidebarContainer) {
        sidebarContainer.classList.remove('translate-x-full');
        sidebarContainer.classList.add('translate-x-0');
    }
    if(sidebarOverlay) {
        sidebarOverlay.classList.remove('hidden');
        sidebarOverlay.classList.add('block');
    }
}
window.closeSidebar = function() {
    if(sidebarContainer) {
        sidebarContainer.classList.add('translate-x-full');
        sidebarContainer.classList.remove('translate-x-0');
    }
    if(sidebarOverlay) {
        sidebarOverlay.classList.remove('block');
        sidebarOverlay.classList.add('hidden');
    }
}

const mobileUsersToggle = document.getElementById('mobile-users-toggle');
if (mobileUsersToggle) mobileUsersToggle.addEventListener('click', openSidebar);

const closeSidebarBtn = document.getElementById('close-sidebar-btn');
if (closeSidebarBtn) closeSidebarBtn.addEventListener('click', closeSidebar);

// FÜLEK (TABS) LOGIKÁJA
window.switchTab = function(id) {
    currentTab = id;
    if (pmTabs[id]) pmTabs[id].unread = 0;
    renderTabs();
    renderMessages();
    
    const msgInput = document.getElementById('message-input');
    if(!msgInput) return;
    if (id === 'main') {
        msgInput.placeholder = "Írj egy üzenetet a fő chatbe (vagy /help)...";
    } else {
        msgInput.placeholder = `Privát üzenet neki: ${pmTabs[id].displayName}...`;
    }
    msgInput.focus();
}

window.closePMTab = function(e, id) {
    e.stopPropagation();
    delete pmTabs[id];
    if (currentTab === id) switchTab('main');
    else renderTabs();
}

function renderTabs() {
    const tabsDiv = document.getElementById('chat-tabs');
    if(!tabsDiv) return;
    if (Object.keys(pmTabs).length === 0) {
        tabsDiv.classList.add('hidden');
        return;
    } else {
        tabsDiv.classList.remove('hidden');
    }

    let html = `
        <button onclick="switchTab('main')" class="relative px-5 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest border-r border-gray-700/50 whitespace-nowrap transition-colors ${currentTab === 'main' ? 'bg-slate-800 text-cyan-400 border-b-2 border-b-cyan-400' : 'text-slate-500 hover:bg-slate-800'}">
            Fő Chat
        </button>
    `;
    
    for (let id in pmTabs) {
        const tab = pmTabs[id];
        const isActive = currentTab === id;
        const unreadBadge = tab.unread > 0 ? `<span class="absolute top-1.5 right-1 bg-red-500 text-white text-[8px] w-4 h-4 flex items-center justify-center rounded-full shadow-lg animate-pulse">${tab.unread}</span>` : '';
        
        html += `
            <div class="relative flex items-center border-r border-gray-700/50 transition-colors ${isActive ? 'bg-slate-800 border-b-2 border-b-fuchsia-500' : 'hover:bg-slate-800'}">
                <button onclick="switchTab('${id}')" class="px-5 py-3 text-[10px] sm:text-xs font-black uppercase tracking-widest whitespace-nowrap ${isActive ? 'text-fuchsia-400' : 'text-slate-400'}">
                    💬 ${escapeHTML(tab.displayName)}
                </button>
                <button onclick="closePMTab(event, '${id}')" class="px-3 py-3 text-slate-600 hover:text-red-400 transition-colors text-xs font-bold">✕</button>
                ${unreadBadge}
            </div>
        `;
    }
    tabsDiv.innerHTML = html;
}

window.openPMTabFromUser = function(id, name) {
    if (!pmTabs[id]) {
        pmTabs[id] = { displayName: name, unread: 0 };
    }
    switchTab(id);
}

// AUTO-LOGIN ÉS HÁTTÉR VISSZATÉRÉS
document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (!socket.connected) socket.connect(); 
    }
});

window.onload = () => {
    const savedUser = localStorage.getItem('radio_user');
    const savedPass = localStorage.getItem('radio_pass');
    const savedGuest = localStorage.getItem('radio_guest');

    if (savedUser && savedPass) {
        socket.emit('login', { username: savedUser, password: savedPass, isGuest: false }, handleLoginResponse);
    } else if (savedGuest) {
        socket.emit('login', { username: savedGuest, password: '', isGuest: true }, handleLoginResponse);
    } else {
        const authPanelElem = document.getElementById('auth-panel');
        const chatPanelElem = document.getElementById('chat-panel');
        if(authPanelElem) authPanelElem.classList.remove('hidden');
        if(chatPanelElem) chatPanelElem.classList.add('hidden');
    }
};

window.logout = function() {
    localStorage.removeItem('radio_user');
    localStorage.removeItem('radio_pass');
    localStorage.removeItem('radio_guest');
    location.reload(); 
}

function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

function getAvatarUrl(seed, customUrl, name) { 
    if (customUrl && customUrl.startsWith('http')) return escapeHTML(customUrl);
    const finalSeed = seed || name || 'default';
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(finalSeed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`; 
}

function formatTime(timestamp) { const date = new Date(timestamp); return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); }

// --- KATTINTHATÓ NEVEK ÉS MODALOK ---
window.handleNameClick = function(id, name, rank) {
    if(!myUniqueId) return;
    if(id === myUniqueId) { 
        window.openProfileModal(); 
    } else {
        window.openUserModal(id, name, rank);
    }
}

window.openProfileModal = function() {
    if(!myUniqueId || myRank === 'guest') return alert("Vendégként nem szerkesztheted a profilodat. Kérlek regisztrálj!");
    const modal = document.getElementById('profile-modal');
    if(modal) modal.classList.add('active');
    
    const editDisplay = document.getElementById('edit-displayname');
    const editUrl = document.getElementById('edit-avatar-url');
    const editAvatar = document.getElementById('edit-avatar');
    
    if(editDisplay) editDisplay.value = userDisplayName;
    if(editUrl) editUrl.value = myAvatarUrl || '';
    tempSeed = myAvatarSeed || Math.random().toString(36).substring(7);
    if(editAvatar) editAvatar.src = getAvatarUrl(tempSeed, myAvatarUrl, userDisplayName);
}

const editAvatarUrlInput = document.getElementById('edit-avatar-url');
if(editAvatarUrlInput) {
    editAvatarUrlInput.addEventListener('input', (e) => {
        const val = e.target.value.trim();
        const editAvatar = document.getElementById('edit-avatar');
        if(editAvatar) editAvatar.src = getAvatarUrl(tempSeed, val, userDisplayName);
    });
}

window.openUserModal = function(id, name, rank) {
    if(!myUniqueId || id === myUniqueId) return;
    
    selectedUserId = id;
    const modName = document.getElementById('mod-name');
    const modId = document.getElementById('mod-id');
    const modAvatar = document.getElementById('mod-avatar');
    
    if(modName) modName.innerText = name;
    if(modId) modId.innerText = "#" + id;
    
    const targetUser = onlineUsersData.find(u => u.uniqueId === id);
    const targetAvatarUrl = targetUser ? getAvatarUrl(targetUser.avatarSeed, targetUser.avatarUrl, name) : getAvatarUrl('', '', name);
    if(modAvatar) modAvatar.src = targetAvatarUrl;
    
    const btnPm = document.getElementById('btn-pm');
    if(btnPm) {
        btnPm.onclick = () => {
            openPMTabFromUser(id, name);
            window.closeModal('user-modal');
            if (window.innerWidth < 1024) closeSidebar();
        };
    }

    const modSection = document.getElementById('mod-section');
    const btnBox = document.getElementById('rank-buttons');
    if(btnBox) btnBox.innerHTML = '';
    
    const canMod = RANKS_POWER[myRank] >= 40 && (RANKS_POWER[myRank] > RANKS_POWER[rank] || myRank === 'creator') && rank !== 'creator';

    if (canMod && modSection && btnBox) {
        modSection.classList.remove('hidden');
        
        if (RANKS_POWER[myRank] >= 60) {
            const ranksToOffer = [
                { key: 'owner', label: '👑 TULAJDONOS', classes: 'bg-purple-900/40 border-purple-500/50 hover:bg-purple-600 text-purple-200', min: 100 },
                { key: 'admin', label: '🛡️ ADMIN', classes: 'bg-orange-900/40 border-orange-500/50 hover:bg-orange-600 text-orange-200', min: 80 },
                { key: 'moderator', label: '⚔️ MODERÁTOR', classes: 'bg-green-900/40 border-green-500/50 hover:bg-green-600 text-green-200', min: 60 },
                { key: 'vip', label: '💎 VIP', classes: 'bg-blue-900/40 border-blue-500/50 hover:bg-blue-600 text-blue-200', min: 60 },
                { key: 'user', label: '👤 TAG', classes: 'bg-slate-800 border-slate-600 hover:bg-slate-600 text-slate-200', min: 60 }
            ];

            ranksToOffer.forEach(r => {
                if ((RANKS_POWER[myRank] >= r.min || myRank === 'creator') && rank !== r.key) {
                    const b = document.createElement('button');
                    b.className = `${r.classes} py-2 rounded-xl text-[10px] font-bold transition border`;
                    b.innerText = r.label;
                    b.onclick = () => { socket.emit('adminAction', { targetId: id, action: 'setRank', value: r.key }); window.closeModal('user-modal'); };
                    btnBox.appendChild(b);
                }
            });
        }

        const btnMute = document.getElementById('btn-mute');
        if(btnMute) btnMute.onclick = () => { socket.emit('adminAction', { targetId: id, action: 'mute', value: 10 }); window.closeModal('user-modal'); };
        
        const btnKick = document.getElementById('btn-kick');
        if(btnKick) btnKick.onclick = () => { socket.emit('sendMessage', `/kick ${id}`); window.closeModal('user-modal'); };
        
        const banBtn = document.getElementById('btn-ban');
        if(banBtn) {
            if (RANKS_POWER[myRank] >= 60) {
                banBtn.classList.remove('hidden');
                banBtn.onclick = () => { socket.emit('adminAction', { targetId: id, action: 'ban' }); window.closeModal('user-modal'); };
            } else {
                banBtn.classList.add('hidden');
            }
        }
    } else if (modSection) {
        modSection.classList.add('hidden');
    }

    const userModal = document.getElementById('user-modal');
    if(userModal) userModal.classList.add('active');
}

window.closeModal = function(modalId) { 
    const m = document.getElementById(modalId);
    if(m) m.classList.remove('active'); 
}

window.randomAvatar = function() {
    tempSeed = Math.random().toString(36).substring(7);
    const eaUrl = document.getElementById('edit-avatar-url');
    const eaImg = document.getElementById('edit-avatar');
    if(eaUrl) eaUrl.value = ''; 
    if(eaImg) eaImg.src = getAvatarUrl(tempSeed, '', userDisplayName);
}

window.saveProfile = function() {
    const nameInput = document.getElementById('edit-displayname');
    const urlInput = document.getElementById('edit-avatar-url');
    if(!nameInput || !urlInput) return;

    const name = nameInput.value.trim();
    const customUrl = urlInput.value.trim();
    if(!name) return alert("A név nem lehet üres!");
    
    socket.emit('updateProfile', { displayName: name, avatarSeed: tempSeed, avatarUrl: customUrl });
    userDisplayName = name; 
    myAvatarSeed = tempSeed;
    myAvatarUrl = customUrl;
    
    window.closeModal('profile-modal');
    renderTabs();
}

socket.on('connect', () => {
    if(statusDot) {
        statusDot.classList.replace('bg-yellow-500', 'bg-green-500');
        statusDot.classList.replace('shadow-[0_0_8px_#eab308]', 'shadow-[0_0_8px_#22c55e]');
        statusDot.classList.remove('animate-pulse');
    }
    if(statusText) statusText.textContent = 'Szerver Online';
});

socket.on('disconnect', () => {
    if(statusDot) statusDot.classList.replace('bg-green-500', 'bg-red-500');
    if(statusText) statusText.textContent = 'Nincs Kapcsolat';
});

socket.on('clearChat', () => {
    allMessages = [];
    renderMessages();
});

socket.on('initMessages', (messages) => { allMessages = messages; renderMessages(); });

socket.on('initPMs', (pms) => { 
    allMessages = [...allMessages, ...pms].sort((a,b)=>new Date(a.createdAt)-new Date(b.createdAt)); 
    
    pms.forEach(msg => {
        const isMe = myUniqueId && msg.senderUniqueId === myUniqueId;
        const otherId = isMe ? msg.recipientUniqueId : msg.senderUniqueId;
        const otherName = isMe ? (msg.recipientDisplayName || 'Felhasználó') : msg.senderDisplayName;
        
        if (!pmTabs[otherId]) pmTabs[otherId] = { displayName: otherName, unread: 0 };
    });
    
    renderTabs();
    renderMessages(); 
});

socket.on('newMessage', (msg) => { 
    allMessages.push(msg); 
    
    if (msg.recipientUniqueId) {
        const isMe = myUniqueId && msg.senderUniqueId === myUniqueId;
        const otherId = isMe ? msg.recipientUniqueId : msg.senderUniqueId;
        const otherName = isMe ? (msg.recipientDisplayName || 'Felhasználó') : msg.senderDisplayName;

        if (!pmTabs[otherId]) {
            pmTabs[otherId] = { displayName: otherName, unread: 0 };
        }
        
        if (currentTab !== otherId && !isMe) {
            pmTabs[otherId].unread += 1;
        }
        renderTabs();
    }

    renderMessages(); 
});

socket.on('updateUsers', (users) => {
    onlineUsersData = users; 
    const onlineCount = document.getElementById('online-count');
    const mobOnlineCount = document.getElementById('mobile-online-count');

    if(onlineCount) onlineCount.textContent = users.length;
    if(mobOnlineCount) mobOnlineCount.textContent = users.length;
    
    if (users.length === 0) { 
        if(onlineUsersSidebar) onlineUsersSidebar.innerHTML = '<span class="text-xs text-gray-500 italic text-center mt-4">Nincs senki online.</span>'; 
        return; 
    }
    
    users.sort((a, b) => { return (RANKS_POWER[b.rank] || 0) - (RANKS_POWER[a.rank] || 0); });

    const me = users.find(u => u.uniqueId === myUniqueId);
    if (me) { myAvatarSeed = me.avatarSeed; myAvatarUrl = me.avatarUrl; myRank = me.rank; }

    if(onlineUsersSidebar) {
        onlineUsersSidebar.innerHTML = '';
        users.forEach(u => {
            const isMe = u.uniqueId === myUniqueId;
            
            let badge = '';
            if (u.rank === 'creator') badge = '<span class="badge badge-creator">🛡️ KÉSZÍTŐ</span>';
            else if (u.rank === 'owner') badge = '<span class="badge badge-owner">👑 TULAJDONOS</span>';
            else if (u.rank === 'admin') badge = '<span class="badge badge-admin">🛡️ ADMIN</span>';
            else if (u.rank === 'moderator') badge = '<span class="badge badge-moderator">⚔️ MODERÁTOR</span>';
            else if (u.rank === 'vip') badge = '<span class="badge badge-vip">👑 VIP</span>';
            else if (u.rank === 'user') badge = '<span class="badge badge-guest" style="background:#0369a1; border-color:transparent;">👤 TAG</span>';
            
            const ringColor = u.rank === 'creator' ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : (u.rank === 'owner' ? 'border-fuchsia-500 shadow-[0_0_8px_rgba(192,38,211,0.5)]' : (u.rank === 'admin' ? 'border-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'border-gray-600'));
            const nameColor = u.rank === 'creator' ? 'creator-name' : (u.rank === 'owner' ? 'rank-owner' : (u.rank === 'admin' ? 'rank-admin' : 'text-gray-300'));
            
            const displayNameHtml = `<span class="editable-name" onclick="handleNameClick('${u.uniqueId}', '${escapeHTML(u.displayName)}', '${u.rank}')" title="${isMe ? 'Profilod szerkesztése' : 'Interakció (PM/Mod)'}">${escapeHTML(u.displayName)} ${isMe ? '✏️' : ''}</span>`;

            const div = document.createElement('div');
            div.className = `flex items-center gap-2 p-2 rounded-xl transition-colors ${isMe ? 'bg-gray-800/80 border border-gray-600/50' : 'hover:bg-gray-800/40 border border-transparent'}`;
            
            div.innerHTML = `
                <div class="relative shrink-0" title="${escapeHTML(u.displayName)} #${escapeHTML(u.uniqueId)}">
                    <img src="${getAvatarUrl(u.avatarSeed, u.avatarUrl, u.displayName)}" class="w-8 h-8 rounded-full bg-gray-800 border-2 ${ringColor} shadow-sm avatar-img">
                    <span class="absolute -bottom-1 -right-1 w-3 h-3 bg-green-500 border-2 border-gray-900 rounded-full"></span>
                </div>
                <div class="flex flex-col justify-center min-w-0 flex-grow">
                     <span class="text-sm truncate leading-tight ${nameColor}">${displayNameHtml}</span>
                     <span class="user-id-tag">#${escapeHTML(u.uniqueId)}</span>
                </div>
                ${badge}
            `;
            onlineUsersSidebar.appendChild(div);
        });
    }
});

socket.on('typingUpdate', (typists) => {
    if(!typingIndicator) return;
    const others = typists.filter(u => u.uniqueId !== myUniqueId);
    if (others.length > 0) {
        typingIndicator.textContent = others.length > 1 ? `${others.map(u=>u.displayName).join(', ')} éppen írnak...` : `${others[0].displayName} éppen ír...`;
        typingIndicator.classList.remove('hidden');
    } else { typingIndicator.classList.add('hidden'); }
});

function renderMessages() {
    if(!messagesContainer) return;
    messagesContainer.innerHTML = '';
    
    const filteredMessages = allMessages.filter(msg => {
        const isPM = !!msg.recipientUniqueId;
        if (currentTab === 'main') {
            return !isPM; 
        } else {
            if (!isPM) return false;
            return (msg.senderUniqueId === currentTab && msg.recipientUniqueId === myUniqueId) || 
                   (msg.senderUniqueId === myUniqueId && msg.recipientUniqueId === currentTab);
        }
    });

    if (filteredMessages.length === 0) {
        messagesContainer.innerHTML = currentTab === 'main' ? '<div class="text-center text-gray-400 mt-10 text-sm">Nincsenek még üzenetek. Légy te az első!</div>' : '<div class="text-center text-fuchsia-400 mt-10 text-sm">Küldj neki egy privát üzenetet! Itt senki más nem látja. 🤫</div>'; 
        return;
    }

    filteredMessages.forEach(msg => {
        const isMe = msg.senderUniqueId === myUniqueId && myUniqueId !== '';
        const isPM = !!msg.recipientUniqueId;
        const div = document.createElement('div');
        
        if (msg.isSystem) {
            div.className = `flex w-full justify-center mt-3 mb-1`;
            div.innerHTML = `<div class="bg-yellow-500/20 border border-yellow-500/50 text-yellow-300 text-xs sm:text-sm px-4 py-1.5 rounded-full shadow-[0_0_15px_rgba(234,179,8,0.2)] font-medium text-center">
                ${msg.rank === 'creator' ? '🛡️' : '🔔'} <b>${escapeHTML(msg.senderDisplayName)}</b> ${escapeHTML(msg.text)}</div>`;
            messagesContainer.appendChild(div); return;
        }

        // GIF RENDERELÉSE
        let msgTextHtml = escapeHTML(msg.text);
        if (msg.text.startsWith('[GIF]')) {
            const gifUrl = msg.text.replace('[GIF]', '');
            msgTextHtml = `<img src="${escapeHTML(gifUrl)}" class="w-48 sm:w-64 rounded-xl shadow-md border border-white/10 mt-1">`;
        }

        let bubbleClass = 'bg-gray-700/80 text-gray-100 border border-gray-600/50';
        if (isPM) bubbleClass = 'pm-bubble text-white font-medium';
        else if (msg.rank === 'creator') bubbleClass = 'creator-bubble text-white';
        else if (msg.rank === 'owner') bubbleClass = 'owner-bubble text-white';
        else if (isMe) bubbleClass = 'bg-gradient-to-br from-blue-600 to-purple-600 text-white';

        let badgeHtml = '<span class="badge badge-guest">Vendég</span>';
        if (msg.rank === 'creator') badgeHtml = '<span class="badge badge-creator">🛡️ KÉSZÍTŐ</span>';
        else if (msg.rank === 'owner') badgeHtml = '<span class="badge badge-owner">👑 TULAJDONOS</span>';
        else if (msg.rank === 'admin') badgeHtml = '<span class="badge badge-admin">🛡️ ADMIN</span>';
        else if (msg.rank === 'moderator') badgeHtml = '<span class="badge badge-moderator">⚔️ MODERÁTOR</span>';
        else if (msg.rank === 'vip') badgeHtml = '<span class="badge badge-vip">👑 VIP</span>';
        else if (msg.rank === 'user') badgeHtml = '<span class="badge badge-guest" style="background:#0369a1; border-color:transparent;">👤 TAG</span>';
        
        let nameClass = 'text-cyan-400 font-bold text-xs sm:text-sm';
        if (msg.rank === 'creator') nameClass = 'creator-name text-xs sm:text-sm tracking-wide';
        else if (msg.rank === 'owner') nameClass = 'rank-owner text-xs sm:text-sm tracking-wide';

        const displayNameHtml = `<span class="editable-name" onclick="handleNameClick('${msg.senderUniqueId}', '${escapeHTML(msg.senderDisplayName)}', '${msg.rank}')" title="Kattints az interakcióhoz!">${escapeHTML(msg.senderDisplayName)} ${isMe ? '✏️' : ''}</span>`;

        let pmHeader = '';
        if (isPM) {
            const dirText = isMe ? `💬 Privát tőled neki: #${escapeHTML(msg.recipientUniqueId)}` : `💬 Privát tőle: ${escapeHTML(msg.senderDisplayName)}`;
            pmHeader = `<div class="text-[9px] text-fuchsia-400 font-black mb-1 bg-black/40 rounded py-1 px-3 border border-fuchsia-500/30 inline-block">${dirText}</div>`;
        }

        const ring = msg.rank === 'creator' ? 'border-red-500 shadow-[0_0_5px_rgba(239,68,68,0.5)]' : (msg.rank === 'owner' ? 'border-fuchsia-500 shadow-[0_0_5px_rgba(192,38,211,0.5)]' : 'border-gray-600');

        div.className = `flex w-full ${isMe ? 'justify-end' : 'justify-start'} mt-3`;
        
        if (isMe) {
            div.innerHTML = `
                <div class="flex gap-2 sm:gap-3 max-w-[85%] justify-end w-full ml-auto">
                    <div class="flex flex-col items-end w-full">
                        ${pmHeader}
                        <div class="flex items-center mb-1 flex-wrap justify-end">
                            <span class="text-[10px] text-gray-500 mr-2 font-medium">${formatTime(msg.createdAt)}</span>
                            ${badgeHtml}
                            <span class="${nameClass} ml-2">${displayNameHtml} <span class="user-id-tag">#${escapeHTML(msg.senderUniqueId)}</span></span>
                        </div>
                        <div class="${bubbleClass} px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl rounded-tr-sm shadow-md text-sm sm:text-base break-words w-auto inline-block">${msgTextHtml}</div>
                    </div>
                    <div class="w-8 h-8 sm:w-10 sm:h-10 shrink-0 mt-1">
                        <img src="${getAvatarUrl(msg.avatarSeed, msg.avatarUrl, msg.senderDisplayName)}" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-700/50 border-2 ${ring} shadow-sm avatar-img">
                    </div>
                </div>`;
        } else {
            div.innerHTML = `
                <div class="flex gap-2 sm:gap-3 max-w-[85%]">
                    <div class="w-8 h-8 sm:w-10 sm:h-10 shrink-0 mt-1">
                        <img src="${getAvatarUrl(msg.avatarSeed, msg.avatarUrl, msg.senderDisplayName)}" class="w-8 h-8 sm:w-10 sm:h-10 rounded-full bg-gray-700/50 border-2 ${ring} shadow-sm avatar-img">
                    </div>
                    <div class="flex flex-col items-start w-full">
                        ${pmHeader}
                        <div class="flex items-center mb-1 w-full flex-wrap">
                            <span class="${nameClass}">${displayNameHtml} <span class="user-id-tag">#${escapeHTML(msg.senderUniqueId)}</span></span>
                            ${badgeHtml}
                            <span class="text-[9px] sm:text-[10px] text-gray-500 ml-2 font-medium">${formatTime(msg.createdAt)}</span>
                        </div>
                        <div class="${bubbleClass} px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl rounded-tl-sm shadow-sm text-sm sm:text-base break-words w-auto inline-block">${msgTextHtml}</div>
                    </div>
                </div>`;
        }
        messagesContainer.appendChild(div);
    });
    messagesContainer.scrollTop = messagesContainer.scrollHeight;
}

window.handleLoginResponse = function(res) {
    if (res.success) {
        userDisplayName = res.user.displayName; 
        myUniqueId = res.user.uniqueId; 
        myRank = res.user.rank;
        myAvatarSeed = res.user.avatarSeed;
        myAvatarUrl = res.user.avatarUrl || '';
        
        const authPanelElem = document.getElementById('auth-panel');
        const chatPanelElem = document.getElementById('chat-panel');
        const logoutBtn = document.getElementById('logout-btn');
        const mobLogoutBtn = document.getElementById('mobile-logout');
        
        if(authPanelElem) authPanelElem.classList.add('hidden'); 
        if(chatPanelElem) chatPanelElem.classList.remove('hidden'); 
        if(logoutBtn) logoutBtn.classList.remove('hidden');
        if(mobLogoutBtn) mobLogoutBtn.classList.remove('hidden');
    } else { 
        alert(res.error); 
        window.logout(); 
    }
}

window.attemptLogin = function(isGuest) {
    const userField = isGuest ? document.getElementById('guest-username') : document.getElementById('vip-username');
    const passField = isGuest ? null : document.getElementById('vip-password');
    
    if(!userField) return;
    const user = userField.value.trim();
    const pass = passField ? passField.value.trim() : '';
    
    if(!isGuest && (!user || !pass)) return alert("Add meg a nevet és a jelszót is!");
    if(isGuest && !user) return alert("Adj meg egy becenevet!");

    socket.emit('login', { username: user, password: pass, isGuest: isGuest }, (res) => {
        if (res.success) {
            if (!isGuest) {
                localStorage.setItem('radio_user', user);
                localStorage.setItem('radio_pass', pass);
                localStorage.removeItem('radio_guest');
            } else {
                localStorage.setItem('radio_guest', user);
                localStorage.removeItem('radio_user');
                localStorage.removeItem('radio_pass');
            }
            window.handleLoginResponse(res);
        } else alert(res.error);
    });
}

// Belépés Gombok eseményei
const btnGuestLogin = document.getElementById('btn-guest-login');
if(btnGuestLogin) btnGuestLogin.addEventListener('click', () => attemptLogin(true));

const btnVipLogin = document.getElementById('btn-vip-login');
if(btnVipLogin) btnVipLogin.addEventListener('click', () => attemptLogin(false));

const tabVipElem = document.getElementById('tab-vip'); 
const tabGuestElem = document.getElementById('tab-guest');
const formVipElem = document.getElementById('form-vip'); 
const formGuestElem = document.getElementById('form-guest');

if(tabVipElem && tabGuestElem && formVipElem && formGuestElem) {
    tabVipElem.addEventListener('click', () => { 
        tabVipElem.className = "flex-1 text-xs sm:text-sm font-bold text-cyan-400 border-b-2 border-cyan-400 pb-1 transition-colors"; 
        tabGuestElem.className = "flex-1 text-xs sm:text-sm font-bold text-gray-500 hover:text-gray-300 pb-1 border-b-2 border-transparent transition-colors"; 
        formVipElem.classList.remove('hidden'); 
        formGuestElem.classList.add('hidden'); 
    });
    tabGuestElem.addEventListener('click', () => { 
        tabGuestElem.className = "flex-1 text-xs sm:text-sm font-bold text-cyan-400 border-b-2 border-cyan-400 pb-1 transition-colors"; 
        tabVipElem.className = "flex-1 text-xs sm:text-sm font-bold text-gray-500 hover:text-gray-300 pb-1 border-b-2 border-transparent transition-colors"; 
        formGuestElem.classList.remove('hidden'); 
        formVipElem.classList.add('hidden'); 
    });
}

// Üzenetküldés események
const msgInputElem = document.getElementById('message-input');
if(msgInputElem) {
    msgInputElem.addEventListener('input', () => {
        if (!userDisplayName) return;
        socket.emit('typing', true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { socket.emit('typing', false); }, 2000); 
    });

    msgInputElem.addEventListener('keypress', e => { 
        if(e.key === 'Enter') {
            const btn = document.getElementById('send-btn');
            if(btn) btn.click();
        }
    });
}

const sendBtn = document.getElementById('send-btn');
if(sendBtn) {
    sendBtn.addEventListener('click', () => {
        if(!msgInputElem) return;
        const text = msgInputElem.value.trim();
        if (!text) return;
        
        if (currentTab !== 'main' && !text.startsWith('/')) {
            socket.emit('sendMessage', `/msg #${currentTab} ${text}`);
        } else {
            if (text === '/help') {
                const helpDiv = document.createElement('div');
                helpDiv.className = "bg-slate-800/90 border border-cyan-500 p-4 rounded-xl text-xs text-slate-300 mt-2 mb-2 shadow-lg mx-3";
                helpDiv.innerHTML = `
                    <h4 class="font-bold text-cyan-400 mb-2">🛡️ PARANCSOK</h4>
                    <p><b>/msg #ID üzenet</b> - Privát üzenet küldése (kattinthatsz is a névre!)</p>
                    <p><b>/ban #ID</b> - Végleges tiltás</p>
                    <p><b>/timeout #ID perc</b> - Időszakos tiltás percekre</p>
                    <p><b>/unban #ID</b> - Tiltás feloldása</p>
                    <p><b>/mute #ID perc</b> - Némítás</p>
                    <p><b>/unmute #ID</b> - Némítás feloldása</p>
                    <p><b>/kick #ID</b> - Kidobás a chatből</p>
                    <p><b>/announce üzenet</b> - Globális figyelmeztetés</p>
                    <p><b>/clear</b> - Teljes chatfal letakarítása</p>
                `;
                const mc = document.getElementById('messages-container');
                if(mc) {
                    mc.appendChild(helpDiv);
                    mc.scrollTop = mc.scrollHeight;
                }
                msgInputElem.value = '';
                return;
            }
            socket.emit('sendMessage', text);
        }
        msgInputElem.value = ''; 
        socket.emit('typing', false);
    });
}
