import os
import sqlite3
import requests
import json
import unicodedata
from flask import Flask, render_template, request, jsonify

app = Flask(__name__)
DB_PATH = 'database.db'

# Normalisation pour ignorer accents et casse
def normalize_text(text):
    if not text: return ""
    text = unicodedata.normalize('NFD', text)
    text = "".join([c for c in text if unicodedata.category(c) != 'Mn'])
    return text.lower().strip()

# Chargement des traductions normalisées
def load_translations():
    raw = {}
    try:
        if os.path.exists('translations.json'):
            with open('translations.json', 'r', encoding='utf-8') as f:
                raw = json.load(f)
    except: pass
    
    norm = {}
    for k, v in raw.items():
        norm[normalize_text(k)] = v
    return norm

TRANSLATIONS = load_translations()

def get_db_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    # Table des cartes enrichie
    conn.execute('''
        CREATE TABLE IF NOT EXISTS cards (
            id TEXT PRIMARY KEY,
            pokemon_name TEXT NOT NULL,
            card_name TEXT NOT NULL,
            image_url TEXT NOT NULL,
            set_name TEXT,
            set_id TEXT,
            number TEXT,
            rarity TEXT,
            artist TEXT,
            flavor_text TEXT,
            price TEXT,
            cardmarket_url TEXT,
            release_date TEXT,
            local_image TEXT,
            is_manual INTEGER DEFAULT 0
        )
    ''')
    # Table des possessions
    conn.execute('''
        CREATE TABLE IF NOT EXISTS owned_cards (
            card_id TEXT PRIMARY KEY,
            FOREIGN KEY (card_id) REFERENCES cards (id)
        )
    ''')
    conn.commit()
    conn.close()

def download_image(url, card_id):
    if not url: return None
    try:
        cache_dir = os.path.join('static', 'cache')
        if not os.path.exists(cache_dir):
            os.makedirs(cache_dir)
        filename = f"{card_id}.jpg"
        filepath = os.path.join(cache_dir, filename)
        if not os.path.exists(filepath):
            response = requests.get(url, timeout=10)
            if response.status_code == 200:
                with open(filepath, 'wb') as f:
                    f.write(response.content)
        return f"/static/cache/{filename}"
    except Exception as e:
        return url

@app.route('/')
def index():
    return render_template('index.html')

@app.route('/api/check_import', methods=['POST'])
def check_import():
    pokemon_input = request.json.get('pokemon_name', '').strip()
    if not pokemon_input:
        return jsonify({'error': 'Nom vide'}), 400
    
    # Recherche insensible à la casse et aux accents
    norm_input = normalize_text(pokemon_input)
    english_name = TRANSLATIONS.get(norm_input, pokemon_input)
    
    # On demande pageSize=1 pour que ce soit instantané
    url = f'https://api.pokemontcg.io/v2/cards?q=name:"{english_name}"&pageSize=1'
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        total_count = data.get('totalCount', 0)
        return jsonify({
            'english_name': english_name,
            'display_name': pokemon_input,
            'total_count': total_count
        })
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_pokemon():
    pokemon_input = request.json.get('pokemon_name', '').strip()
    display_name = request.json.get('display_name', pokemon_input).strip()
    
    if not pokemon_input:
        return jsonify({'error': 'Nom de Pokémon vide'}), 400
    
    url = f'https://api.pokemontcg.io/v2/cards?q=name:"{pokemon_input}"'
    try:
        response = requests.get(url, timeout=10)
        data = response.json()
        cards = data.get('data', [])
        
        conn = get_db_connection()
        count = 0
        for card in cards:
            card_id = card['id']
            name = card['name']
            img_url = card['images']['small']
            set_name = card.get('set', {}).get('name', '')
            set_id = card.get('set', {}).get('id', '')
            release_date = card.get('set', {}).get('releaseDate', '0000/00/00')
            number = card.get('number', '')
            rarity = card.get('rarity', '')
            artist = card.get('artist', '')
            flavor = card.get('flavorText', '')
            cm_url = card.get('cardmarket', {}).get('url', '')
            
            # Cache local
            local_img = download_image(img_url, card_id)

            # Récupération du prix
            prices = card.get('tcgplayer', {}).get('prices', {})
            price_val = "0"
            for p_type in prices:
                m_price = prices[p_type].get('market')
                if m_price:
                    price_val = str(m_price)
                    break

            existing = conn.execute('SELECT id FROM cards WHERE id = ?', (card_id,)).fetchone()
            if not existing:
                conn.execute(
                    '''INSERT INTO cards (id, pokemon_name, card_name, image_url, set_name, set_id, number, rarity, artist, flavor_text, price, cardmarket_url, release_date, local_image) 
                       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)''',
                    (card_id, display_name.capitalize(), name, img_url, set_name, set_id, number, rarity, artist, flavor, price_val, cm_url, release_date, local_img)
                )
                count += 1
        
        conn.commit()
        conn.close()
        return jsonify({'message': f'{count} nouvelles cartes importées.'})
    except Exception as e:
        return jsonify({'error': str(e)}), 500

@app.route('/api/cards', methods=['GET'])
def get_cards():
    conn = get_db_connection()
    # On récupère toutes les cartes et on fait un LEFT JOIN pour savoir si elles sont possédées
    query = '''
        SELECT c.*, (o.card_id IS NOT NULL) as owned 
        FROM cards c 
        LEFT JOIN owned_cards o ON c.id = o.card_id
        ORDER BY c.pokemon_name ASC, c.card_name ASC
    '''
    cards = conn.execute(query).fetchall()
    conn.close()
    return jsonify([dict(row) for row in cards])

@app.route('/api/toggle', methods=['POST'])
def toggle_card():
    card_id = request.json.get('card_id')
    conn = get_db_connection()
    
    existing = conn.execute('SELECT card_id FROM owned_cards WHERE card_id = ?', (card_id,)).fetchone()
    
    if existing:
        conn.execute('DELETE FROM owned_cards WHERE card_id = ?', (card_id,))
        status = False
    else:
        conn.execute('INSERT INTO owned_cards (card_id) VALUES (?)', (card_id,))
        status = True
        
    conn.commit()
    conn.close()
    return jsonify({'card_id': card_id, 'owned': status})

@app.route('/api/manual_add', methods=['POST'])
def manual_add():
    import uuid
    data = request.json
    card_id = data.get('id') or f"manual-{uuid.uuid4().hex[:8]}"
    local_img = download_image(data.get('image_url'), card_id)
    
    conn = get_db_connection()
    try:
        conn.execute(
            '''INSERT INTO cards (id, pokemon_name, card_name, image_url, set_name, set_id, number, rarity, artist, flavor_text, price, cardmarket_url, release_date, local_image, is_manual) 
               VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)''',
            (
                card_id, 
                data.get('pokemon_name', 'Inconnu').capitalize(),
                data.get('name', 'Carte Manuelle'),
                data.get('image_url', ''),
                data.get('set_name', ''),
                data.get('set_id', ''),
                data.get('number', ''),
                data.get('rarity', ''),
                data.get('artist', ''),
                data.get('flavor_text', ''),
                data.get('price', '0').replace('$', ''),
                data.get('cardmarket_url', ''),
                data.get('release_date', '0000/00/00'),
                local_img
            )
        )
        conn.commit()
        return jsonify({'message': 'Carte ajoutée !', 'id': card_id})
    except Exception as e:
        return jsonify({'error': str(e)}), 400
    finally:
        conn.close()

@app.route('/api/stats', methods=['GET'])
def get_stats():
    conn = get_db_connection()
    total = conn.execute('SELECT COUNT(*) FROM cards').fetchone()[0]
    owned = conn.execute('SELECT COUNT(*) FROM owned_cards').fetchone()[0]
    conn.close()
    return jsonify({'total': total, 'owned': owned})

@app.route('/api/delete_card', methods=['DELETE'])
def delete_card():
    card_id = request.json.get('card_id')
    conn = get_db_connection()
    conn.execute('DELETE FROM owned_cards WHERE card_id = ?', (card_id,))
    conn.execute('DELETE FROM cards WHERE id = ?', (card_id,))
    conn.commit()
    conn.close()
    return jsonify({'message': 'Carte supprimée'})

@app.route('/api/export', methods=['GET'])
def export_collection():
    conn = get_db_connection()
    cards = conn.execute('SELECT * FROM cards').fetchall()
    owned = conn.execute('SELECT card_id FROM owned_cards').fetchall()
    conn.close()
    
    export_data = {
        'cards': [dict(c) for c in cards],
        'owned': [o['card_id'] for o in owned]
    }
    return jsonify(export_data)

if __name__ == '__main__':
    init_db()
    # Configuration pour localhost et VPS (WireGuard)
    # L'application écoute sur toutes les interfaces (0.0.0.0) pour être accessible via le réseau VPN si besoin,
    # mais peut être limitée à 127.0.0.1 sur le VPS via un reverse proxy ou configuration firewall.
    app.run(host='0.0.0.0', port=5000, debug=True)
