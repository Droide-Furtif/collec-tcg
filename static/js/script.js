let allCards = [];
let currentFilter = 'all';
let sortOrder = 'asc'; // 'asc' = Ancien -> Récent, 'desc' = Récent -> Ancien

document.addEventListener('DOMContentLoaded', () => {
    fetchCards();
});

async function fetchCards() {
    try {
        const response = await fetch('/api/cards');
        allCards = await response.json();
        renderCards();
        updateStats();
    } catch (err) {
        console.error("Erreur lors du chargement des cartes:", err);
    }
}

function renderCards() {
    const grid = document.getElementById('cardGrid');
    grid.innerHTML = '';

    const grouped = {};
    allCards.forEach(card => {
        const name = card.pokemon_name;
        if (!grouped[name]) grouped[name] = [];
        grouped[name].push(card);
    });

    Object.keys(grouped).sort().forEach(pokemonName => {
        let cards = grouped[pokemonName];
        
        // Tri des cartes par date de sortie
        cards.sort((a, b) => {
            const dateA = a.release_date || '0000/00/00';
            const dateB = b.release_date || '0000/00/00';
            return sortOrder === 'asc' ? dateA.localeCompare(dateB) : dateB.localeCompare(dateA);
        });

        const filtered = cards.filter(card => {
            if (currentFilter === 'owned') return card.owned;
            if (currentFilter === 'missing') return !card.owned;
            return true;
        });

        if (filtered.length === 0) return;

        const ownedCount = cards.filter(c => c.owned).length;
        const totalCount = cards.length;

        const section = document.createElement('div');
        section.className = 'pokemon-group';

        section.innerHTML = `
            <div class="flex justify-between items-end mb-4 px-2">
                <div>
                    <h3 class="text-xl font-bold text-white">${pokemonName} 
                        <span class="text-sm font-normal text-gray-500 ml-2">(${ownedCount}/${totalCount})</span>
                    </h3>
                </div>
                <div class="flex gap-2">
                    <button onclick="scrollSection('${pokemonName}', -1)" class="bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center text-xs transition">
                        <i class="fas fa-chevron-left"></i>
                    </button>
                    <button onclick="scrollSection('${pokemonName}', 1)" class="bg-gray-800 hover:bg-gray-700 w-8 h-8 rounded-full flex items-center justify-center text-xs transition">
                        <i class="fas fa-chevron-right"></i>
                    </button>
                    <button onclick="toggleExpand('${pokemonName}')" id="expand-btn-${pokemonName}" 
                        class="ml-2 bg-blue-600/20 hover:bg-blue-600/40 text-blue-400 px-3 py-1 rounded-lg text-xs font-bold transition">
                        Grille
                    </button>
                </div>
            </div>
            <div id="section-${pokemonName}" class="is-scroll custom-scrollbar px-2">
                <!-- Cartes ici -->
            </div>
        `;

        const cardsContainer = section.querySelector(`#section-${pokemonName}`);
        filtered.forEach(card => {
            cardsContainer.appendChild(createCardElement(card));
        });

        grid.appendChild(section);
    });
}

function createCardElement(card) {
    const div = document.createElement('div');
    div.className = 'card-item flex flex-col gap-2 mb-2 w-full';
    div.id = `card-container-${card.id}`;
    
    const isMissing = !card.owned;
    
    // Utiliser l'image locale si dispo, sinon l'URL API
    const displayImg = card.local_image || card.image_url;

    div.innerHTML = `
        <div class="relative cursor-pointer">
            <img 
                src="${displayImg}" 
                alt="${card.card_name}"
                loading="lazy"
                class="card-image w-full rounded-xl shadow-lg ${isMissing ? 'missing' : 'owned'}"
                id="img-${card.id}"
            >
        </div>
        <div class="text-center">
            <div class="text-[9px] font-bold text-gray-500 uppercase truncate">${card.set_name || 'N/A'}</div>
            <div class="text-[10px] font-medium text-gray-400">${card.set_id || ''} - ${card.number || ''}</div>
        </div>
    `;

    const img = div.querySelector('img');
    let pressTimer;

    const startPress = () => {
        pressTimer = setTimeout(() => {
            showDetails(card);
            pressTimer = null;
        }, 500);
    };
    const cancelPress = () => { if (pressTimer) clearTimeout(pressTimer); };

    img.addEventListener('mousedown', startPress);
    img.addEventListener('touchstart', startPress, { passive: true });
    img.addEventListener('mouseup', cancelPress);
    img.addEventListener('mouseleave', cancelPress);
    img.addEventListener('touchend', cancelPress);

    img.onclick = () => {
        if (pressTimer !== null) {
            clearTimeout(pressTimer);
            toggleOwnership(card.id);
        }
    };

    return div;
}

function scrollSection(name, direction) {
    const el = document.getElementById(`section-${name}`);
    const scrollAmount = el.clientWidth * 0.8;
    el.scrollBy({ left: direction * scrollAmount, behavior: 'smooth' });
}

function toggleExpand(name) {
    const el = document.getElementById(`section-${name}`);
    const btn = document.getElementById(`expand-btn-${name}`);
    const gridClasses = ['grid', 'grid-cols-2', 'sm:grid-cols-3', 'md:grid-cols-4', 'lg:grid-cols-5', 'xl:grid-cols-6', 'gap-4', 'md:gap-6'];
    
    if (el.classList.contains('is-scroll')) {
        el.classList.remove('is-scroll');
        gridClasses.forEach(c => el.classList.add(c));
        btn.innerText = 'Ligne';
        btn.classList.replace('bg-blue-600/20', 'bg-purple-600/20');
        btn.classList.replace('text-blue-400', 'text-purple-400');
    } else {
        gridClasses.forEach(c => el.classList.remove(c));
        el.classList.add('is-scroll');
        btn.innerText = 'Grille';
        btn.classList.replace('bg-purple-600/20', 'bg-blue-600/20');
        btn.classList.replace('text-purple-400', 'text-blue-400');
    }
}

async function toggleOwnership(cardId) {
    try {
        const response = await fetch('/api/toggle', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: cardId })
        });
        const result = await response.json();

        const card = allCards.find(c => c.id === cardId);
        if (card) {
            card.owned = result.owned;
            const img = document.getElementById(`img-${cardId}`);
            if (img) {
                if (result.owned) { img.classList.remove('missing'); img.classList.add('owned'); }
                else { img.classList.remove('owned'); img.classList.add('missing'); }
            }
            if (currentFilter !== 'all') {
                renderCards(); 
            } else {
                updateStats();
                updateSectionCounter(card.pokemon_name);
            }
        }
    } catch (err) { console.error(err); }
}

function toggleSortOrder() {
    sortOrder = sortOrder === 'asc' ? 'desc' : 'asc';
    document.getElementById('sortOrderText').innerText = sortOrder === 'asc' ? 'Ancien → Récent' : 'Récent → Ancien';
    renderCards();
}

function updateSectionCounter(pokemonName) {
    const cards = allCards.filter(c => c.pokemon_name === pokemonName);
    const ownedCount = cards.filter(c => c.owned).length;
    const totalCount = cards.length;
    const groups = document.querySelectorAll('.pokemon-group');
    for (let g of groups) {
        const h3 = g.querySelector('h3');
        if (h3 && h3.innerText.includes(pokemonName)) {
            h3.querySelector('span').innerText = `(${ownedCount}/${totalCount})`;
            break;
        }
    }
}

async function importPokemon() {
    const input = document.getElementById('pokemonInput');
    const inputName = input.value.trim();
    if (!inputName) return;

    const loader = document.getElementById('loader');
    const loaderStatus = document.getElementById('loaderStatus');
    
    loader.classList.remove('hidden');
    loaderStatus.innerText = `Recherche de "${inputName}"...`;

    try {
        // 1. Vérifier la traduction et le nombre de cartes
        const checkResp = await fetch('/api/check_import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pokemon_name: inputName })
        });
        const checkData = await checkResp.json();

        if (checkData.error) {
            alert(checkData.error);
            loader.classList.add('hidden');
            return;
        }

        if (checkData.total_count === 0) {
            alert(`Aucune carte trouvée pour "${inputName}".`);
            loader.classList.add('hidden');
            return;
        }

        // 2. Lancer l'importation réelle
        loaderStatus.innerHTML = `
            <div class="text-blue-400 font-black text-xl mb-1">${checkData.total_count} cartes trouvées</div>
            <div class="text-gray-400 text-xs uppercase tracking-tighter">Importation & Mise en cache locale...</div>
            <div class="text-[10px] text-gray-500 mt-2 italic">Cela peut prendre 10-20 secondes.</div>
        `;

        const importResp = await fetch('/api/import', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                pokemon_name: checkData.english_name,
                display_name: checkData.display_name 
            })
        });
        
        await importResp.json();
        input.value = '';
        await fetchCards();
    } catch (err) { 
        alert("Erreur lors de l'importation"); 
    } finally {
        loader.classList.add('hidden');
    }
}

function updateStats() {
    const total = allCards.length;
    const owned = allCards.filter(c => c.owned).length;
    
    let ownedValue = 0;
    let missingValue = 0;

    allCards.forEach(card => {
        const val = parseFloat(card.price) || 0;
        if (card.owned) ownedValue += val;
        else missingValue += val;
    });

    document.getElementById('statsCount').innerText = `${owned} / ${total}`;
    document.getElementById('progressBar').style.width = `${total > 0 ? (owned/total)*100 : 0}%`;
    document.getElementById('ownedValue').innerText = ownedValue.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + '$';
    document.getElementById('missingValue').innerText = missingValue.toLocaleString('fr-FR', { minimumFractionDigits: 2 }) + '$';
}

function setFilter(filter) {
    currentFilter = filter;
    ['all', 'owned', 'missing'].forEach(f => {
        const btn = document.getElementById(`filter-${f}`);
        btn.className = f === filter ? 'flex-1 px-4 py-2 rounded-lg transition bg-blue-600 text-white text-sm' : 'flex-1 px-4 py-2 rounded-lg transition hover:bg-gray-700 text-sm';
    });
    renderCards();
}

function showDetails(card) {
    document.getElementById('d_img').src = card.local_image || card.image_url;
    document.getElementById('d_name').innerText = card.card_name;
    document.getElementById('d_set_info').innerText = `${card.set_name} (${card.set_id}) - #${card.number}`;
    document.getElementById('d_rarity').innerText = card.rarity || 'Inconnue';
    document.getElementById('d_artist').innerText = card.artist || 'Inconnu';
    document.getElementById('d_flavor').innerText = card.flavor_text || 'Aucune description disponible.';
    document.getElementById('d_price').innerText = (parseFloat(card.price) || 0).toFixed(2) + '$';
    
    const cmUrl = card.cardmarket_url || `https://www.cardmarket.com/en/Pokemon/Products/Search?searchString=${encodeURIComponent(card.card_name + ' ' + card.number)}`;
    const links = document.getElementById('d_links');
    links.innerHTML = `
        <a href="${cmUrl}" target="_blank" class="flex-1 text-center bg-blue-600 hover:bg-blue-700 p-2 rounded-lg text-xs font-bold transition">
           <i class="fas fa-shopping-cart mr-2"></i>Cardmarket
        </a>
        <button onclick="deleteCard('${card.id}')" class="flex-1 text-center bg-red-600 hover:bg-red-700 p-2 rounded-lg text-xs font-bold transition">
           <i class="fas fa-trash mr-2"></i>Supprimer
        </button>
    `;
    document.getElementById('detailsModal').classList.remove('hidden');
}

async function deleteCard(cardId) {
    if (!confirm("Supprimer cette carte ?")) return;
    try {
        const response = await fetch('/api/delete_card', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ card_id: cardId })
        });
        if (response.ok) {
            closeDetailsModal();
            allCards = allCards.filter(c => c.id !== cardId);
            renderCards();
            updateStats();
        }
    } catch (err) { console.error(err); }
}

function closeDetailsModal() { document.getElementById('detailsModal').classList.add('hidden'); }
function openManualModal() { document.getElementById('manualModal').classList.remove('hidden'); }
function closeManualModal() { document.getElementById('manualModal').classList.add('hidden'); }

async function smartFill() {
    const url = document.getElementById('m_link').value.trim();
    if (!url) return;
    let apiId = null;
    if (url.includes('pokemontcg.io/cards/')) apiId = url.split('/cards/')[1].split('?')[0];
    else if (url.includes('scrydex.com/pokemon/cards/')) {
        const parts = url.split('?')[0].split('/');
        apiId = parts[parts.length - 1];
    }
    if (apiId) {
        try {
            const resp = await fetch(`https://api.pokemontcg.io/v2/cards/${apiId}`);
            const data = await resp.json();
            const card = data.data;
            if (card) {
                document.getElementById('m_name').value = card.name;
                document.getElementById('m_img').value = card.images.small;
                document.getElementById('m_set').value = card.set.name;
                document.getElementById('m_num').value = card.number;
                document.getElementById('m_rarity').value = card.rarity || '';
                document.getElementById('m_artist').value = card.artist || '';
                document.getElementById('m_flavor').value = card.flavorText || '';
                if (card.cardmarket?.url) window.currentManualCMUrl = card.cardmarket.url;
                const prices = card.tcgplayer?.prices || {};
                for (let type in prices) {
                    if (prices[type].market) {
                        document.getElementById('m_price').value = prices[type].market;
                        break;
                    }
                }
            }
        } catch (e) { alert("Erreur API"); }
    }
}

async function submitManualAdd() {
    const data = {
        pokemon_name: document.getElementById('m_pkmn').value.trim(),
        name: document.getElementById('m_name').value.trim(),
        image_url: document.getElementById('m_img').value.trim(),
        set_name: document.getElementById('m_set').value.trim(),
        number: document.getElementById('m_num').value.trim(),
        price: document.getElementById('m_price').value.trim(),
        rarity: document.getElementById('m_rarity').value.trim(),
        artist: document.getElementById('m_artist').value.trim(),
        flavor_text: document.getElementById('m_flavor').value.trim(),
        cardmarket_url: window.currentManualCMUrl || ''
    };
    if (!data.pokemon_name) return alert("Pokémon requis");
    try {
        await fetch('/api/manual_add', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(data)
        });
        closeManualModal();
        fetchCards();
    } catch (err) { console.error(err); }
}

async function exportJSON() {
    const response = await fetch('/api/export');
    const data = await response.json();
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a'); a.href = url; a.download = 'pkmn_export.json'; a.click();
}
