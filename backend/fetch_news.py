import feedparser
import json
import os
import re
from datetime import datetime, timedelta
import pytz
from geopy.geocoders import Nominatim
from geopy.exc import GeocoderTimedOut
import time

# List of common bear-prone counties and cities in Romania
LOCATIONS = [
    "Brașov", "Sinaia", "Bușteni", "Predeal", "Azuga", "Băile Tușnad", "Tușnad", 
    "Covasna", "Harghita", "Mureș", "Prahova", "Argeș", "Buzău", "Vrancea", 
    "Sibiu", "Alba", "Bistrița", "Neamț", "Suceava", "Bacău", "Vâlcea", 
    "Gorj", "Hunedoara", "Caraș-Severin", "Cluj", "Maramureș", 
    "Arefu", "Vidraru", "Zărnești", "Râșnov", "Sovata", "Câmpina", "Comarnic",
    "Sfântu Gheorghe", "Miercurea Ciuc", "Gheorgheni", "Toplița", "Sighișoara",
    "Făgăraș", "Câmpulung"
]

# Normalize text for better matching (remove diacritics locally for simple matching)
def normalize_text(text):
    text = text.lower()
    replacements = {'ă': 'a', 'â': 'a', 'î': 'i', 'ș': 's', 'ț': 't'}
    for k, v in replacements.items():
        text = text.replace(k, v)
    return text

NORMALIZED_LOCATIONS = {normalize_text(loc): loc for loc in LOCATIONS}

def extract_location(title):
    normalized_title = normalize_text(title)
    # Find the first matching location
    for norm_loc, actual_loc in NORMALIZED_LOCATIONS.items():
        # Match whole words only
        if re.search(r'\b' + re.escape(norm_loc) + r'\b', normalized_title):
            return actual_loc
    return None

def geocode_location(location_name):
    geolocator = Nominatim(user_agent="BearTrackerRO_Automated_Bot")
    try:
        # Search specifically in Romania
        location = geolocator.geocode(f"{location_name}, Romania")
        if location:
            return location.latitude, location.longitude
    except GeocoderTimedOut:
        time.sleep(2)
        try:
            location = geolocator.geocode(f"{location_name}, Romania")
            if location:
                return location.latitude, location.longitude
        except:
            pass
    return None, None

def fetch_and_update_alerts():
    # Load existing alerts
    alerts_file = os.path.join("data", "alerts.json")
    existing_alerts = []
    if os.path.exists(alerts_file):
        with open(alerts_file, "r", encoding="utf-8") as f:
            try:
                existing_alerts = json.load(f)
            except json.JSONDecodeError:
                pass

    # We will use the URLs to track duplicates
    existing_urls = {alert.get("url") for alert in existing_alerts if alert.get("url")}
    
    # Filter out alerts older than 7 days
    tz = pytz.timezone('Europe/Bucharest')
    now = datetime.now(tz)
    seven_days_ago = now - timedelta(days=7)
    
    # Map months for Romanian date parsing (matching map.js logic)
    ro_months = { "Ian":1, "Feb":2, "Mar":3, "Apr":4, "Mai":5, "Iun":6, "Iul":7, "Aug":8, "Sep":9, "Oct":10, "Nov":11, "Dec":12 }
    valid_alerts = []
    
    for alert in existing_alerts:
        try:
            # Parse "DD-Mon-YYYY HH:MM"
            parts = re.split(r'[- :]', alert["timestamp"])
            if len(parts) >= 5:
                day = int(parts[0])
                month = ro_months.get(parts[1], 1)
                year = int(parts[2])
                hour = int(parts[3])
                minute = int(parts[4])
                alert_date = tz.localize(datetime(year, month, day, hour, minute))
                
                if alert_date >= seven_days_ago:
                    valid_alerts.append(alert)
        except Exception as e:
            # If parsing fails, keep it just in case, or drop it. We'll drop invalid old mock data.
            pass

    # Google News RSS for Bears in Romania (last 7 days)
    # query: "RO-ALERT urs" OR "urs vazut"
    rss_url = "https://news.google.com/rss/search?q=%22RO-ALERT%20urs%22%20OR%20%22urs%20vazut%22%20OR%20%22avertizare%20urs%22%20when:7d&hl=ro&gl=RO&ceid=RO:ro"
    
    feed = feedparser.parse(rss_url)
    
    new_alerts = []
    
    for entry in feed.entries:
        url = entry.link
        if url in existing_urls:
            continue
            
        title = entry.title
        published_parsed = entry.published_parsed
        
        # Determine the date
        if published_parsed:
            dt = datetime(*published_parsed[:6])
            dt = dt.replace(tzinfo=pytz.utc).astimezone(tz)
        else:
            dt = now
            
        # Format date as "16-Mai-2024 21:45"
        ro_months_inv = {1:"Ian", 2:"Feb", 3:"Mar", 4:"Apr", 5:"Mai", 6:"Iun", 7:"Iul", 8:"Aug", 9:"Sep", 10:"Oct", 11:"Nov", 12:"Dec"}
        timestamp_str = f"{dt.day:02d}-{ro_months_inv[dt.month]}-{dt.year} {dt.hour:02d}:{dt.minute:02d}"
        
        location_name = extract_location(title)
        
        if location_name:
            lat, lng = geocode_location(location_name)
            if lat and lng:
                new_alerts.append({
                    "id": f"news_{int(dt.timestamp())}",
                    "lat": lat,
                    "lng": lng,
                    "timestamp": timestamp_str,
                    "source": "Sursă: Știri/Presă",
                    "text_content": title,
                    "city": location_name,
                    "icon": "🚨",
                    "url": url
                })
                existing_urls.add(url)
                
                # Sleep a bit to respect Nominatim rate limit (1 req/sec max)
                time.sleep(1.5)
                
    # Combine valid old alerts + new alerts
    final_alerts = new_alerts + valid_alerts
    
    # Sort by timestamp descending (newest first)
    final_alerts.sort(key=lambda x: x["id"] if "id" in x else "", reverse=True)
    
    # Write back to alerts.json
    with open(alerts_file, "w", encoding="utf-8") as f:
        json.dump(final_alerts, f, ensure_ascii=False, indent=4)
        
    print(f"Scraping completed. Found {len(new_alerts)} new alerts. Total active alerts: {len(final_alerts)}")

if __name__ == "__main__":
    fetch_and_update_alerts()
