function updateClock() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const clockEl = document.getElementById('live-clock');
    if(clockEl) clockEl.innerText = timeString;
}
setInterval(updateClock, 1000);
updateClock();

async function fetchWeather() {
    try {
        const res = await fetch('https://api.open-meteo.com/v1/forecast?latitude=47.4984&longitude=19.0404&current_weather=true');
        const data = await res.json();
        const temp = Math.round(data.current_weather.temperature);
        const code = data.current_weather.weathercode;
        
        let icon = '🌤️';
        if(code === 0) icon = '☀️';
        else if(code >= 1 && code <= 3) icon = '⛅';
        else if(code >= 45 && code <= 48) icon = '🌫️';
        else if(code >= 51 && code <= 67) icon = '🌧️';
        else if(code >= 71 && code <= 77) icon = '❄️';
        else if(code >= 80 && code <= 82) icon = '🌦️';
        else if(code >= 95) icon = '⛈️';

        const tempEl = document.getElementById('weather-temp');
        const iconEl = document.getElementById('weather-icon');
        if(tempEl) tempEl.innerText = `${temp}°C`;
        if(iconEl) iconEl.innerText = icon;
    } catch (err) {
        const tempEl = document.getElementById('weather-temp');
        if(tempEl) tempEl.innerText = '--°C';
    }
}
fetchWeather();
setInterval(fetchWeather, 1800000); 

const audio = document.getElementById('radio-stream');
const playBtn = document.getElementById('play-pause-btn');
const icons = { play: document.getElementById('icon-play'), pause: document.getElementById('icon-pause'), load: document.getElementById('icon-loading') };
const visualizer = document.getElementById('visualizer');
const volumeSlider = document.getElementById('volume-slider');
const eqBars = document.getElementById('eq-bars');
const musicIcon = document.getElementById('music-icon');

audio.volume = volumeSlider.value / 100;

function toggleEq(playing) {
    if (playing) {
        if(musicIcon) musicIcon.classList.add('opacity-0');
        if(eqBars) {
            eqBars.classList.remove('opacity-0');
            eqBars.classList.add('opacity-100');
        }
    } else {
        if(musicIcon) musicIcon.classList.remove('opacity-0');
        if(eqBars) {
            eqBars.classList.add('opacity-0');
            eqBars.classList.remove('opacity-100');
        }
    }
}

playBtn.addEventListener('click', () => {
    if (audio.paused) {
        const p = audio.play();
        icons.play.classList.add('hidden'); icons.pause.classList.add('hidden'); icons.load.classList.remove('hidden');
        if (p) p.then(() => { 
            icons.load.classList.add('hidden'); 
            icons.pause.classList.remove('hidden'); 
            visualizer.classList.add('playing-animation');
            toggleEq(true);
        }).catch(e => { 
            icons.load.classList.add('hidden'); 
            icons.play.classList.remove('hidden'); 
            alert("Hiba a lejátszáskor!"); 
        });
    } else {
        audio.pause();
        icons.pause.classList.add('hidden'); icons.play.classList.remove('hidden'); 
        visualizer.classList.remove('playing-animation');
        toggleEq(false);
    }
});

volumeSlider.addEventListener('input', e => audio.volume = e.target.value / 100);

audio.addEventListener('waiting', () => { 
    icons.play.classList.add('hidden'); icons.pause.classList.add('hidden'); icons.load.classList.remove('hidden'); 
    visualizer.classList.remove('playing-animation'); 
    toggleEq(false);
});

audio.addEventListener('playing', () => { 
    icons.load.classList.add('hidden'); icons.play.classList.add('hidden'); icons.pause.classList.remove('hidden'); 
    visualizer.classList.add('playing-animation'); 
    toggleEq(true);
});


// --- ÚJ: BÖNGÉSZŐ UJJLENYOMAT LÉTREHOZÁSA (Lapok szinkronizálása) ---
let myBrowserId = localStorage.getItem('radio_browser_id');
if (!myBrowserId) {
    // Ha először jár itt, kap egy fix, állandó ID-t a gépére
    myBrowserId = 'V' + Math.floor(10000 + Math.random() * 90000);
    localStorage.setItem('radio_browser_id', myBrowserId);
}

// Csatlakozás az ujjlenyomattal
const socket = io({
    auth: { browserId: myBrowserId }
}); 

let userDisplayName = '';
let myUniqueId = ''; 
let myRank = '';
let myAvatarSeed = '';
let myAvatarUrl = ''; 
let myBio = ''; 
let typingTimeout = null; 
let allMessages = []; 
let selectedUserId = null;
let onlineUsersData = [];

let currentTab = 'main'; 
let pmTabs = {}; 

window.adminAccountsData = [];
let liveRadarInterval = null; 

const RANKS_POWER = { 'creator': 100, 'owner': 80, 'admin': 60, 'moderator': 40, 'vip': 30, 'user': 20, 'guest': 0, 'visitor': -1 };

const messagesContainer = document.getElementById('messages-container');
const onlineUsersSidebar = document.getElementById('online-users-sidebar');
const typingIndicator = document.getElementById('typing-indicator');
const msgInput = document.getElementById('message-input');
const sidebarContainer = document.getElementById('users-sidebar-container');
const sidebarOverlay = document.getElementById('sidebar-overlay');

const mediaSearch = document.getElementById('media-search');
const emojiContainer = document.getElementById('content-emojis');
const stickerContainer = document.getElementById('content-stickers');
const gifContainer = document.getElementById('content-gifs');
const emojiPanel = document.getElementById('emoji-panel');
const emojiBtn = document.getElementById('emoji-toggle-btn');
let currentMediaTab = 'emojis';

let gifSearchTimeout = null;
let currentGifQuery = 'party dance club';
let nextGifPos = '';
let isFetchingGifs = false;

if(emojiBtn) {
    emojiBtn.onclick = function(e) {
        e.preventDefault();
        e.stopPropagation();
        if (emojiPanel.classList.contains('active')) {
            emojiPanel.classList.remove('active');
        } else {
            emojiPanel.classList.add('active');
            if (currentMediaTab === 'gifs' && gifContainer.innerHTML.trim() === '') {
                fetchGifs('party dance club');
            }
        }
    };
}

document.onclick = function(event) {
    if (emojiPanel && emojiPanel.classList.contains('active')) {
        if (!emojiPanel.contains(event.target) && !emojiBtn.contains(event.target)) {
            emojiPanel.classList.remove('active');
        }
    }
};

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
    if(!emojiContainer) return;
    emojiContainer.innerHTML = '';
    
    let filteredDict = emojisDict;
    if (filterQuery) {
        filteredDict = emojisDict.filter(item => item.k.includes(filterQuery));
    }
    
    const createEmojiItem = (emojiChar) => {
        const div = document.createElement('div');
        div.className = "flex items-center justify-center p-1 cursor-pointer hover:scale-125 transition-transform";
        
        const hex = Array.from(emojiChar).map(c => c.codePointAt(0).toString(16)).join('_');
        const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`;
        
        div.innerHTML = `<img src="${url}" class="w-8 h-8 object-contain drop-shadow-md" onerror="this.outerHTML='<span class=\\'text-3xl\\'>${emojiChar}</span>'" alt="${emojiChar}">`;
        
        div.onclick = (e) => { 
            e.preventDefault(); e.stopPropagation();
            if(msgInput) { msgInput.value += emojiChar; msgInput.focus(); }
        };
        return div;
    };

    filteredDict.forEach(item => emojiContainer.appendChild(createEmojiItem(item.e)));

    if (!filterQuery) {
        genericEmojis.forEach(em => emojiContainer.appendChild(createEmojiItem(em)));
    }
}
renderEmojis();

async function fetchGifs(query, append = false) {
    if(!gifContainer) return;
    if(isFetchingGifs) return; 
    isFetchingGifs = true;

    if (!append) {
        gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-gray-500 py-4 w-full">Keresés...</div>';
        nextGifPos = '';
        currentGifQuery = query || 'party dance club';
    }

    try {
        let url = `https://g.tenor.com/v1/search?q=${encodeURIComponent(currentGifQuery)}&key=LIVDSRZULELA&limit=50`;
        if (append && nextGifPos) {
            url += `&pos=${nextGifPos}`; 
        }

        const res = await fetch(url);
        const data = await res.json();
        
        if (!append) gifContainer.innerHTML = '';
        
        if (!data.results || data.results.length === 0) {
            if(!append) gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-gray-500 py-4 w-full">Nincs találat.</div>';
            isFetchingGifs = false;
            return;
        }

        nextGifPos = data.next; 

        data.results.forEach(gif => {
            const img = document.createElement('img');
            img.src = gif.media[0].tinygif.url; 
            img.className = "gif-img";
            img.onclick = (e) => {
                e.preventDefault(); e.stopPropagation();
                const txt = `[GIF]${gif.media[0].gif.url}`; 
                if (currentTab !== 'main') socket.emit('sendMessage', `/msg #${currentTab} ${txt}`);
                else socket.emit('sendMessage', txt);
                if(emojiPanel) emojiPanel.classList.remove('active');
            };
            gifContainer.appendChild(img);
        });
        isFetchingGifs = false;
    } catch(e) {
        if(!append) gifContainer.innerHTML = '<div class="col-span-2 text-center text-xs text-red-500 py-4 w-full">Hiba a betöltéskor. Próbáld újra!</div>';
        isFetchingGifs = false;
    }
}

if(gifContainer) {
    gifContainer.addEventListener('scroll', () => {
        if (gifContainer.scrollTop + gifContainer.clientHeight >= gifContainer.scrollHeight - 50) {
            if (!isFetchingGifs && nextGifPos) {
                fetchGifs(currentGifQuery, true); 
            }
        }
    });
}

if(mediaSearch) {
    mediaSearch.addEventListener('input', (e) => {
        const query = e.target.value.toLowerCase().trim();
        if (currentMediaTab === 'emojis') {
            renderEmojis(query);
        } else if (currentMediaTab === 'gifs') {
            clearTimeout(gifSearchTimeout);
            gifSearchTimeout = setTimeout(() => {
                fetchGifs(query || 'party dance club', false);
            }, 600); 
        }
    });
}

window.switchEmojiTab = function(tab) {
    currentMediaTab = tab;
    const eBtn = document.getElementById('tab-btn-emojis');
    const sBtn = document.getElementById('tab-btn-stickers');
    const gBtn = document.getElementById('tab-btn-gifs');
    
    if(mediaSearch) mediaSearch.value = ''; 

    [eBtn, sBtn, gBtn].forEach(btn => { if(btn) btn.className = "flex-1 py-3 text-[10px] sm:text-xs font-bold text-slate-400 hover:text-white border-b-2 border-transparent transition-colors"; });
    [emojiContainer, stickerContainer, gifContainer].forEach(cont => { if(cont) cont.classList.add('hidden'); });

    if (tab === 'emojis') {
        if(eBtn) eBtn.className = "flex-1 py-3 text-[10px] sm:text-xs font-bold text-cyan-400 border-b-2 border-cyan-400 transition-colors";
        if(emojiContainer) emojiContainer.classList.remove('hidden'); 
        if(mediaSearch) {
            mediaSearch.placeholder = "Keresés (pl. mosoly, party)...";
            mediaSearch.disabled = false;
            mediaSearch.style.opacity = '1';
        }
        renderEmojis(); 
    } else if (tab === 'stickers') {
        if(sBtn) sBtn.className = "flex-1 py-3 text-[10px] sm:text-xs font-bold text-cyan-400 border-b-2 border-cyan-400 transition-colors";
        if(stickerContainer) stickerContainer.classList.remove('hidden'); 
        if(mediaSearch) {
            mediaSearch.placeholder = "Matricák (Hamarosan...)";
            mediaSearch.disabled = true;
            mediaSearch.style.opacity = '0.5';
        }
    } else {
        if(gBtn) gBtn.className = "flex-1 py-3 text-[10px] sm:text-xs font-bold text-cyan-400 border-b-2 border-cyan-400 transition-colors";
        if(gifContainer) gifContainer.classList.remove('hidden'); 
        if(mediaSearch) {
            mediaSearch.placeholder = "GIF Keresés (angolul a legjobb)...";
            mediaSearch.disabled = false;
            mediaSearch.style.opacity = '1';
        }
        if (gifContainer && gifContainer.innerHTML.trim() === '') fetchGifs('party dance club', false);
    }
}


// --- VEZÉRLŐPULT: ADATBÁZIS (CSAK KÉSZÍTŐ) ---
window.openAdminDashboard = function() {
    if (myRank !== 'creator') return alert("Ehhez csak a Készítőnek van jogosultsága!");
    const modal = document.getElementById('admin-dashboard-modal');
    if(modal) modal.classList.add('active');
    
    document.getElementById('admin-users-list').innerHTML = '<tr><td colspan="6" class="text-center py-4 text-cyan-400">Adatbázis betöltése...</td></tr>';
    socket.emit('requestAdminData');
}

socket.on('adminDataResponse', (accounts) => {
    window.adminAccountsData = accounts; 
    const list = document.getElementById('admin-users-list');
    if(!list) return;
    list.innerHTML = '';

    accounts.forEach(acc => {
        const isBanned = acc.isBanned;
        let rankOptions = ['user', 'vip', 'moderator', 'admin', 'owner', 'creator'].map(r => {
            return `<option value="${r}" ${acc.rank === r ? 'selected' : ''}>${r.toUpperCase()}</option>`;
        }).join('');

        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-700/50 hover:bg-white/5";
        tr.innerHTML = `
            <td class="p-2 text-gray-500 text-xs">#${acc.uniqueId}</td>
            <td class="p-2 font-mono text-cyan-500 text-xs">${acc.username}</td>
            <td class="p-2 font-bold">${escapeHTML(acc.displayName)}</td>
            <td class="p-2">
                <select onchange="adminAction('setRank', '${acc.uniqueId}', this.value)" class="bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs outline-none focus:border-cyan-400">
                    ${rankOptions}
                </select>
            </td>
            <td class="p-2 text-xs font-bold ${isBanned ? 'text-red-500' : 'text-green-500'}">
                ${isBanned ? 'KILTILTVA' : 'AKTÍV'}
            </td>
            <td class="p-2 text-right space-x-2">
                <button onclick="openAdminEdit('${acc.uniqueId}')" class="admin-action-btn text-blue-400 border-blue-400/50 hover:bg-blue-500 hover:text-white">Szerkeszt</button>
                <button onclick="adminAction('toggleBan', '${acc.uniqueId}')" class="admin-action-btn ${isBanned ? 'text-green-400' : 'text-orange-400'}">${isBanned ? 'Felold' : 'Kitilt'}</button>
                <button onclick="adminAction('delete', '${acc.uniqueId}')" class="admin-action-btn admin-action-delete">Törlés</button>
            </td>
        `;
        list.appendChild(tr);
    });
});

window.adminAction = function(action, targetId, value = null) {
    if (action === 'delete') {
        if (!confirm('BIZTOSAN törölni akarod ezt a fiókot az adatbázisból? Ez nem vonható vissza!')) return;
    }
    socket.emit('adminDashboardAction', { action, targetId, value });
}

window.openAdminEdit = function(id) {
    const acc = window.adminAccountsData.find(a => a.uniqueId === id);
    if(!acc) return;
    
    document.getElementById('edit-adm-old-id').value = acc.uniqueId;
    document.getElementById('edit-adm-id').value = acc.uniqueId;
    document.getElementById('edit-adm-username').value = acc.username;
    document.getElementById('edit-adm-displayname').value = acc.displayName;
    document.getElementById('edit-adm-password').value = acc.password || ''; 
    
    document.getElementById('admin-edit-modal').classList.add('active');
}

window.saveAdminEdit = function() {
    const oldId = document.getElementById('edit-adm-old-id').value;
    const newId = document.getElementById('edit-adm-id').value.trim();
    const newUsername = document.getElementById('edit-adm-username').value.trim();
    const newDisplayName = document.getElementById('edit-adm-displayname').value.trim();
    const newPassword = document.getElementById('edit-adm-password').value.trim();

    if(!newId || !newUsername || !newDisplayName) return alert("ID, Login név és Megjelenítő név kötelező!");

    socket.emit('adminDashboardAction', { 
        action: 'editUser', 
        targetId: oldId, 
        editData: { newUniqueId: newId, newUsername, newDisplayName, newPassword } 
    });

    closeModal('admin-edit-modal');
    document.getElementById('admin-users-list').innerHTML = '<tr><td colspan="6" class="text-center py-4 text-cyan-400">Frissítés...</td></tr>';
}

// --- ÉLŐ RADAR (KÉSZÍTŐ ÉS TULAJDONOS) ---
window.openLiveRadar = function() {
    if (myRank !== 'creator' && myRank !== 'owner') return alert("Ehhez nincs jogosultságod!");
    const modal = document.getElementById('live-radar-modal');
    if(modal) modal.classList.add('active');
    
    renderRadar();
}

function updateLiveTime() {
    document.querySelectorAll('.live-time-counter').forEach(el => {
        const joinedAt = parseInt(el.getAttribute('data-joined'));
        if(joinedAt) {
            const diffSec = Math.floor((Date.now() - joinedAt) / 1000);
            const mins = Math.floor(diffSec / 60);
            const secs = diffSec % 60;
            if(mins === 0) el.innerText = `${secs} másodperce`;
            else el.innerText = `${mins} p ${secs} mp`;
        }
    });
}
clearInterval(liveRadarInterval);
liveRadarInterval = setInterval(updateLiveTime, 1000);

function renderRadar() {
    const list = document.getElementById('radar-users-list');
    if(!list) return;
    list.innerHTML = '';

    if (!onlineUsersData || onlineUsersData.length === 0) {
        list.innerHTML = '<tr><td colspan="5" class="text-center py-4 text-gray-500">Jelenleg senki sincs online.</td></tr>';
        return;
    }

    onlineUsersData.forEach(acc => {
        const locString = acc.location ? `<br><span class="text-[9px] text-gray-400">${acc.location}</span>` : '';
        const isVisitor = acc.rank === 'visitor';
        
        let displayHtml = isVisitor ? `<span class="text-gray-500 italic">Névtelen Látogató</span>` : `<span class="font-bold text-white">${escapeHTML(acc.displayName)}</span>`;
        let accountHtml = isVisitor ? `<span class="text-gray-500 text-[10px]">Csak böngész</span>` : `<span class="text-gray-400 text-[10px]">#${acc.uniqueId}</span><br><span class="text-cyan-500 text-[10px]">${acc.username}</span>`;
        
        const ipBanBtn = myRank === 'creator' ? `<button onclick="radarAction('banIp', '${acc.uniqueId}', '${acc.ip}')" class="admin-action-btn text-red-500 border-red-500/50 hover:bg-red-500 hover:text-white" title="Végleges kizárás az oldalról">IP TILTÁS</button>` : '';
        const disableKick = acc.rank === 'creator' ? 'hidden' : '';

        const tr = document.createElement('tr');
        tr.className = "border-b border-gray-700/50 hover:bg-white/5 transition-colors";
        tr.innerHTML = `
            <td class="p-2">${displayHtml}</td>
            <td class="p-2 leading-tight">${accountHtml}</td>
            <td class="p-2 text-fuchsia-400 font-mono text-[10px] text-center leading-tight">
                ${acc.ip || 'Ismeretlen'}
                ${locString}
            </td>
            <td class="p-2 text-[10px] font-bold text-green-500 text-center">
                <span class="live-time-counter" data-joined="${acc.connectedAt || Date.now()}">Számolás...</span>
            </td>
            <td class="p-2 text-right space-x-1">
                ${ipBanBtn}
                <button ${disableKick} onclick="radarAction('kick', '${acc.uniqueId}')" class="admin-action-btn text-orange-400 border-orange-400/50 hover:bg-orange-500 hover:text-white">KIDOBÁS</button>
            </td>
        `;
        list.appendChild(tr);
    });
    updateLiveTime();
}

window.radarAction = function(action, targetId, targetIp = null) {
    if (action === 'banIp') {
        if (!confirm(`BIZTOSAN ki akarod tiltani ezt az IP címet (${targetIp}) a weboldalról? Soha többet nem fogja tudni megnyitni az oldalt!`)) return;
    }
    socket.emit('radarAction', { action, targetId, targetIp });
}


// MOBILOS MENÜ LOGIKA
window.openSidebar = function() {
    if(sidebarContainer) { sidebarContainer.classList.remove('translate-x-full'); sidebarContainer.classList.add('translate-x-0'); }
    if(sidebarOverlay) { sidebarOverlay.classList.remove('hidden'); sidebarOverlay.classList.add('block'); }
}
window.closeSidebar = function() {
    if(sidebarContainer) { sidebarContainer.classList.add('translate-x-full'); sidebarContainer.classList.remove('translate-x-0'); }
    if(sidebarOverlay) { sidebarOverlay.classList.remove('block'); sidebarOverlay.classList.add('hidden'); }
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

function performAutoLogin() {
    const savedUser = localStorage.getItem('radio_user');
    const savedPass = localStorage.getItem('radio_pass');
    const guestName = localStorage.getItem('radio_guest_name');
    const guestId = localStorage.getItem('radio_guest_id');

    if (savedUser && savedPass) {
        socket.emit('login', { username: savedUser, password: savedPass, isGuest: false }, handleLoginResponse);
    } else if (guestName && guestId) {
        socket.emit('login', { username: guestName, isGuest: true, guestId: guestId }, handleLoginResponse);
    } else {
        const authPanelElem = document.getElementById('auth-panel');
        const chatPanelElem = document.getElementById('chat-panel');
        const unauthOverlay = document.getElementById('unauth-overlay');
        
        if(authPanelElem) authPanelElem.classList.remove('hidden');
        if(chatPanelElem) chatPanelElem.classList.add('hidden');
        if(unauthOverlay) unauthOverlay.classList.remove('hidden'); 
    }
}

socket.on('connect', () => {
    const statusDot = document.getElementById('server-status-dot');
    const statusText = document.getElementById('server-status-text');
    if(statusDot) {
        statusDot.classList.replace('bg-yellow-500', 'bg-green-500');
        statusDot.classList.replace('bg-red-500', 'bg-green-500'); 
        statusDot.classList.replace('shadow-[0_0_8px_#eab308]', 'shadow-[0_0_8px_#22c55e]');
        statusDot.classList.remove('animate-pulse');
    }
    if(statusText) statusText.textContent = 'Szerver Online';
    
    performAutoLogin();
});

document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") {
        if (!socket.connected) {
            socket.connect(); 
        } else {
            if (!userDisplayName) {
                performAutoLogin();
            }
        }
    }
});

window.logout = function() {
    socket.emit('logoutAccount');
    setTimeout(() => {
        localStorage.removeItem('radio_user');
        localStorage.removeItem('radio_pass');
        localStorage.removeItem('radio_guest_name');
        localStorage.removeItem('radio_guest_id');
        location.reload(); 
    }, 100); 
}

function escapeHTML(str) { return str.replace(/[&<>'"]/g, tag => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;' }[tag] || tag)); }

function getAvatarUrl(seed, customUrl, name) { 
    if (customUrl && customUrl.startsWith('http')) return escapeHTML(customUrl);
    const finalSeed = seed || name || 'default';
    return `https://api.dicebear.com/7.x/adventurer/svg?seed=${encodeURIComponent(finalSeed)}&backgroundColor=b6e3f4,c0aede,d1d4f9,ffd5dc,ffdfbf`; 
}

function formatTime(timestamp) { const date = new Date(timestamp); return date.toLocaleTimeString('hu-HU', { hour: '2-digit', minute: '2-digit' }); }

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
    const editBio = document.getElementById('edit-bio');
    const editUrl = document.getElementById('edit-avatar-url');
    const editAvatar = document.getElementById('edit-avatar');
    
    if(editDisplay) editDisplay.value = userDisplayName;
    if(editBio) editBio.value = myBio || '';
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
    const modBio = document.getElementById('mod-bio');
    const modAvatar = document.getElementById('mod-avatar');
    
    const targetUser = onlineUsersData.find(u => u.uniqueId === id);
    
    if(modName) modName.innerText = name;
    if(modId) modId.innerText = `ID: #${id} | Fiók: ${targetUser ? targetUser.username : 'Ismeretlen'}`;
    if(modBio) modBio.innerText = targetUser && targetUser.bio ? `"${targetUser.bio}"` : '';
    
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
    const bioInput = document.getElementById('edit-bio');
    
    if(!nameInput || !urlInput) return;

    const name = nameInput.value.trim();
    const customUrl = urlInput.value.trim();
    const bioStr = bioInput ? bioInput.value.trim() : '';
    
    if(!name) return alert("A név nem lehet üres!");
    
    socket.emit('updateProfile', { displayName: name, avatarSeed: tempSeed, avatarUrl: customUrl, bio: bioStr });
    userDisplayName = name; 
    myAvatarSeed = tempSeed;
    myAvatarUrl = customUrl;
    myBio = bioStr;
    
    window.closeModal('profile-modal');
    renderTabs();
}

socket.on('disconnect', () => {
    const statusDot = document.getElementById('server-status-dot');
    const statusText = document.getElementById('server-status-text');
    if(statusDot) statusDot.classList.replace('bg-green-500', 'bg-red-500');
    if(statusText) statusText.textContent = 'Nincs Kapcsolat';
});

socket.on('clearChat', () => {
    allMessages = [];
    renderMessages();
});

socket.on('initMessages', (messages) => { 
    if (!myUniqueId) return; 
    allMessages = messages; 
    renderMessages(); 
});

socket.on('initPMs', (pms) => { 
    if (!myUniqueId) return; 
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
    if (!myUniqueId) return; 
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
    
    const radarModal = document.getElementById('live-radar-modal');
    if(radarModal && radarModal.classList.contains('active')) {
        renderRadar();
    }

    const visibleUsers = users.filter(u => u.rank !== 'visitor');

    const onlineCount = document.getElementById('online-count');
    const mobOnlineCount = document.getElementById('mobile-online-count');
    const onlineUsersSidebar = document.getElementById('online-users-sidebar');

    if(onlineCount) onlineCount.textContent = !myUniqueId ? '?' : visibleUsers.length;
    if(mobOnlineCount) mobOnlineCount.textContent = !myUniqueId ? '?' : visibleUsers.length;
    
    if (!myUniqueId) {
        if(onlineUsersSidebar) onlineUsersSidebar.innerHTML = '<div class="flex flex-col items-center justify-center h-full opacity-50 mt-10"><span class="text-4xl mb-2">🔒</span><span class="text-xs text-gray-400 text-center uppercase tracking-widest font-bold">Taglista Rejtve</span></div>'; 
        return; 
    }

    if (visibleUsers.length === 0) { 
        if(onlineUsersSidebar) onlineUsersSidebar.innerHTML = '<span class="text-xs text-gray-500 italic text-center mt-4">Nincs senki online.</span>'; 
        return; 
    }
    
    visibleUsers.sort((a, b) => { return (RANKS_POWER[b.rank] || 0) - (RANKS_POWER[a.rank] || 0); });

    const me = users.find(u => u.uniqueId === myUniqueId);
    if (me) { 
        myAvatarSeed = me.avatarSeed; 
        myAvatarUrl = me.avatarUrl; 
        myRank = me.rank; 

        const dashBtn = document.getElementById('btn-admin-dashboard');
        const radarBtn = document.getElementById('btn-live-radar');
        
        if (myRank === 'creator') {
            if(dashBtn) dashBtn.classList.remove('hidden');
            if(radarBtn) radarBtn.classList.remove('hidden');
        } else if (myRank === 'owner') {
            if(dashBtn) dashBtn.classList.add('hidden');
            if(radarBtn) radarBtn.classList.remove('hidden');
        } else {
            if(dashBtn) dashBtn.classList.add('hidden');
            if(radarBtn) radarBtn.classList.add('hidden');
        }
    }

    if(onlineUsersSidebar) {
        onlineUsersSidebar.innerHTML = '';
        visibleUsers.forEach(u => {
            const isMe = u.uniqueId === myUniqueId;
            
            let badge = '';
            if (u.rank === 'creator') badge = '<span class="badge badge-creator !ml-0">🛡️ KÉSZÍTŐ</span>';
            else if (u.rank === 'owner') badge = '<span class="badge badge-owner !ml-0">👑 TULAJDONOS</span>';
            else if (u.rank === 'admin') badge = '<span class="badge badge-admin !ml-0">🛡️ ADMIN</span>';
            else if (u.rank === 'moderator') badge = '<span class="badge badge-moderator !ml-0">⚔️ MODERÁTOR</span>';
            else if (u.rank === 'vip') badge = '<span class="badge badge-vip !ml-0">👑 VIP</span>';
            else if (u.rank === 'user') badge = '<span class="badge badge-guest !ml-0" style="background:#0369a1; border-color:transparent;">👤 TAG</span>';
            
            const ringColor = u.rank === 'creator' ? 'border-red-500 shadow-[0_0_8px_rgba(239,68,68,0.5)]' : (u.rank === 'owner' ? 'border-fuchsia-500 shadow-[0_0_8px_rgba(192,38,211,0.5)]' : (u.rank === 'admin' ? 'border-yellow-400 shadow-[0_0_8px_rgba(251,191,36,0.5)]' : 'border-gray-600'));
            const nameColor = u.rank === 'creator' ? 'creator-name' : (u.rank === 'owner' ? 'rank-owner' : (u.rank === 'admin' ? 'rank-admin' : 'text-gray-300'));
            
            const displayNameHtml = `<span class="editable-name" onclick="handleNameClick('${u.uniqueId}', '${escapeHTML(u.displayName)}', '${u.rank}')" title="${isMe ? 'Profilod szerkesztése' : 'Interakció (PM/Mod)'}">${escapeHTML(u.displayName)} ${isMe ? '✏️' : ''}</span>`;
            
            const bioHtml = u.bio ? `<span class="text-[11px] text-cyan-400/80 italic block mt-1 break-words leading-snug">${escapeHTML(u.bio)}</span>` : '';
            const badgeHtml = badge ? `<div class="mt-1 mb-0.5">${badge}</div>` : '';

            const div = document.createElement('div');
            div.className = `flex items-start gap-3 p-3 rounded-xl transition-colors ${isMe ? 'bg-gray-800/80 border border-gray-600/50 shadow-inner' : 'hover:bg-gray-800/40 border border-transparent'}`;
            
            div.innerHTML = `
                <div class="relative shrink-0 mt-1" title="${escapeHTML(u.displayName)}">
                    <img src="${getAvatarUrl(u.avatarSeed, u.avatarUrl, u.displayName)}" class="w-11 h-11 rounded-full bg-gray-800 border-2 ${ringColor} shadow-md avatar-img">
                    <span class="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-green-500 border-2 border-gray-900 rounded-full shadow-sm"></span>
                </div>
                <div class="flex flex-col min-w-0 flex-grow justify-center">
                     <span class="text-[15px] font-bold break-words leading-tight ${nameColor}">${displayNameHtml}</span>
                     ${badgeHtml}
                     ${bioHtml}
                </div>
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
    if (!myUniqueId) return; 
    
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

        let msgTextHtml = escapeHTML(msg.text);

        if (msg.text.startsWith('[GIF]')) {
            const gifUrl = msg.text.replace('[GIF]', '');
            msgTextHtml = `<img src="${escapeHTML(gifUrl)}" class="w-48 sm:w-64 rounded-xl shadow-md border border-white/10 mt-1">`;
        } else {
            msgTextHtml = msgTextHtml.replace(/[\p{Extended_Pictographic}]/gu, match => {
                const hex = Array.from(match).map(c => c.codePointAt(0).toString(16)).join('_');
                const url = `https://fonts.gstatic.com/s/e/notoemoji/latest/${hex}/512.gif`;
                return `<img src="${url}" class="w-6 h-6 sm:w-7 sm:h-7 inline-block align-bottom mx-0.5 drop-shadow-md" onerror="this.outerHTML='${match}'" alt="${match}">`;
            });
        }

        let bubbleClass = 'text-white font-medium ';
        
        let bgColor = 'bg-gray-700/80 text-gray-100 border border-gray-600/50';
        if (isPM) bgColor = 'pm-bubble text-white font-medium';
        else if (msg.rank === 'creator') bgColor = 'creator-bubble text-white';
        else if (msg.rank === 'owner') bgColor = 'owner-bubble text-white';
        else if (isMe) bgColor = 'bg-gradient-to-br from-blue-600 to-purple-600 text-white';
        
        bubbleClass += `${bgColor} px-3 sm:px-4 py-2 sm:py-2.5 rounded-2xl shadow-md text-sm sm:text-base break-words w-auto inline-block`;
        if (isMe) bubbleClass += ' rounded-tr-sm';
        else bubbleClass += ' rounded-tl-sm';

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
                            <span class="${nameClass} ml-2">${displayNameHtml}</span>
                        </div>
                        <div class="${bubbleClass}">${msgTextHtml}</div>
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
                            <span class="${nameClass}">${displayNameHtml}</span>
                            ${badgeHtml}
                            <span class="text-[9px] sm:text-[10px] text-gray-500 ml-2 font-medium">${formatTime(msg.createdAt)}</span>
                        </div>
                        <div class="${bubbleClass}">${msgTextHtml}</div>
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
        myBio = res.user.bio || ''; 
        
        const authPanelElem = document.getElementById('auth-panel');
        const chatPanelElem = document.getElementById('chat-panel');
        const logoutBtn = document.getElementById('logout-btn');
        const mobLogoutBtn = document.getElementById('mobile-logout');
        
        const unauthOverlay = document.getElementById('unauth-overlay');
        if(unauthOverlay) unauthOverlay.classList.add('hidden');
        
        if(authPanelElem) authPanelElem.classList.add('hidden'); 
        if(chatPanelElem) chatPanelElem.classList.remove('hidden'); 
        if(logoutBtn) logoutBtn.classList.remove('hidden');
        if(mobLogoutBtn) mobLogoutBtn.classList.remove('hidden');

        const dashBtn = document.getElementById('btn-admin-dashboard');
        const radarBtn = document.getElementById('btn-live-radar');
        
        if (myRank === 'creator') {
            if(dashBtn) dashBtn.classList.remove('hidden');
            if(radarBtn) radarBtn.classList.remove('hidden');
        } else if (myRank === 'owner') {
            if(dashBtn) dashBtn.classList.add('hidden');
            if(radarBtn) radarBtn.classList.remove('hidden');
        }

        if (myRank === 'guest') {
            const guestWarning = document.getElementById('guest-warning-modal');
            if(guestWarning) guestWarning.classList.add('active');
        }

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
                localStorage.removeItem('radio_guest_name');
                localStorage.removeItem('radio_guest_id');
            } else {
                localStorage.setItem('radio_guest_name', res.user.displayName);
                localStorage.setItem('radio_guest_id', res.user.uniqueId);
                localStorage.removeItem('radio_user');
                localStorage.removeItem('radio_pass');
            }
            window.handleLoginResponse(res);
        } else alert(res.error);
    });
}

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

if(msgInput) {
    msgInput.addEventListener('input', () => {
        if (!userDisplayName) return;
        socket.emit('typing', true);
        clearTimeout(typingTimeout);
        typingTimeout = setTimeout(() => { socket.emit('typing', false); }, 2000); 
    });

    msgInput.addEventListener('keypress', e => { 
        if(e.key === 'Enter') {
            const btn = document.getElementById('send-btn');
            if(btn) btn.click();
        }
    });
}

const sendBtn = document.getElementById('send-btn');
if(sendBtn) {
    sendBtn.addEventListener('click', () => {
        if(!msgInput) return;
        const text = msgInput.value.trim();
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
                msgInput.value = '';
                return;
            }
            socket.emit('sendMessage', text);
        }
        msgInput.value = ''; 
        socket.emit('typing', false);
    });
}
