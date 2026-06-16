document.addEventListener('DOMContentLoaded', () => {
    const map = L.map('map').setView([45.45, 25.55], 10);

    // Custom Fullscreen Control for Mobile (Fake Fullscreen)
    L.Control.CustomFullscreen = L.Control.extend({
        onAdd: function(map) {
            const btn = L.DomUtil.create('div', 'leaflet-control-custom-fs leaflet-bar');
            btn.innerHTML = '⛶';
            btn.title = 'Ecran Complet';
            
            L.DomEvent.on(btn, 'click', function(e) {
                L.DomEvent.stopPropagation(e);
                document.body.classList.toggle('fullscreen-mode');
                // Leaflet needs to know the container size changed
                setTimeout(() => { map.invalidateSize(); }, 300);
            });
            return btn;
        }
    });
    new L.Control.CustomFullscreen({ position: 'topleft' }).addTo(map);

    // Dark theme map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    let heatmapLayer = null;
    const markersLayer = L.layerGroup().addTo(map);
    


    // Icons
    const alertIcon = L.divIcon({ html: '🚨', className: 'custom-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
    const reportIcon = L.divIcon({ html: '🐻', className: 'custom-icon', iconSize: [24, 24], iconAnchor: [12, 12] });

    // Helper: Load local storage reports
    function getLocalReports() {
        const stored = localStorage.getItem('bear_reports');
        return stored ? JSON.parse(stored) : [];
    }

    function saveLocalReport(report) {
        const reports = getLocalReports();
        reports.push(report);
        localStorage.setItem('bear_reports', JSON.stringify(reports));
    }

    // Fetch and render data
    async function loadData() {
        markersLayer.clearLayers();
        
        try {
            // 0. Load Heatmap Data first so we can push to it
            const heatRes = await fetch('data/heatmap.json');
            const heatData = await heatRes.json();

            // 1. Load RO-ALERTS from static JSON
            const alertsRes = await fetch('data/alerts.json');
            const alerts = await alertsRes.json();
            document.getElementById('ro-alert-count').textContent = alerts.length;
            
            // Date parser helper for Romanian format: "16-Mai-2024 21:45"
            function parseRomanianDate(dateStr) {
                const months = { "Ian":0, "Feb":1, "Mar":2, "Apr":3, "Mai":4, "Iun":5, "Iul":6, "Aug":7, "Sep":8, "Oct":9, "Nov":10, "Dec":11 };
                const parts = dateStr.split(/[- :]/);
                if (parts.length >= 5) {
                    return new Date(parseInt(parts[2], 10), months[parts[1]], parseInt(parts[0], 10), parseInt(parts[3], 10), parseInt(parts[4], 10));
                }
                return new Date(); // fallback
            }

            const now = new Date();
            const oneWeekMs = 7 * 24 * 60 * 60 * 1000;

            alerts.forEach(alert => {
                // Add to heatmap unconditionally
                if (alert.lat && alert.lng) heatData.push([alert.lat, alert.lng, 1.0]);

                // Check age for icon
                const alertDate = parseRomanianDate(alert.timestamp);
                const ageMs = now - alertDate;

                if (ageMs <= oneWeekMs) {
                    const customIcon = L.divIcon({ html: alert.icon || '🚨', className: 'custom-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
                    const marker = L.marker([alert.lat, alert.lng], {icon: customIcon});
                    marker.bindPopup(`
                        <b style="color: #ef4444;">${alert.icon || '🚨'} ${alert.source || 'RO-ALERT'}</b><br>
                        <small style="color:#94a3b8">${alert.timestamp}</small><br>
                        ${alert.county ? alert.county + ',' : ''} ${alert.city || ''} ${alert.street || ''}<br>
                        <i style="opacity: 0.8; margin-top: 8px; display: inline-block;">"${alert.text_content}"</i>
                    `);
                    markersLayer.addLayer(marker);
                }
            });

            // 2. Load User Reports from LocalStorage
            const reports = getLocalReports();
            document.getElementById('user-report-count').textContent = reports.length;

            reports.forEach(report => {
                const marker = L.marker([report.lat, report.lng], {icon: reportIcon});
                marker.bindPopup(`
                    <b style="color: #f59e0b;">🐻 Raport Utilizator (Local)</b><br>
                    <small style="color:#94a3b8">${report.timestamp}</small><br>
                    <strong>Tip:</strong> ${report.observation_type.replace('_', ' ')}<br>
                    <strong>Detalii:</strong> ${report.details}
                `);
                markersLayer.addLayer(marker);
            });

            // 3. (Heatmap base data was loaded at step 0)
            
            // Alerts are already added to heatmap in the loop above
            
            // Adăugăm raportările utilizatorilor la zonele de risc
            reports.forEach(report => {
                if (report.lat && report.lng) heatData.push([report.lat, report.lng, 0.8]);
            });

            if (heatmapLayer) {
                map.removeLayer(heatmapLayer);
            }
            if (heatData.length > 0) {
                heatmapLayer = L.heatLayer(heatData, {
                    radius: 25,
                    blur: 15,
                    maxZoom: 10,
                    gradient: {0.4: 'blue', 0.6: 'lime', 0.8: 'yellow', 1.0: 'red'}
                }).addTo(map);
            }

            // 4. Load ArcGIS Ecological Network Data (Local JSON)
            try {
                const habitatRes = await fetch('data/habitat.json');
                
                if (habitatRes.ok) {
                    const habitatData = await habitatRes.json();
                    
                    // Filter features roughly to Romania's bounding box to avoid main thread freeze
                    // Romania approx bounds: Lat 43.6 - 48.3, Lng 20.2 - 29.8
                    const romanianFeatures = [];
                    habitatData.features.forEach(f => {
                        try {
                            let pt;
                            if (f.geometry && f.geometry.type === 'Polygon') {
                                pt = f.geometry.coordinates[0][0];
                            } else if (f.geometry && f.geometry.type === 'MultiPolygon') {
                                pt = f.geometry.coordinates[0][0][0];
                            }
                            
                            if (pt && pt.length >= 2) {
                                const lng = pt[0];
                                const lat = pt[1];
                                // Check if inside bounding box
                                if (lat >= 43.6 && lat <= 48.3 && lng >= 20.2 && lng <= 29.8) {
                                    romanianFeatures.push(f);
                                }
                            }
                        } catch(e) {
                            // ignore invalid geometries
                        }
                    });
                    
                    // Function to style based on SUBC_CODE
                    function styleEcologicalNetwork(feature) {
                        let colorCode = '#ffffff';
                        switch(feature.properties.SUBC_CODE) {
                            case 11: colorCode = '#008000'; break; // continuous favorable
                            case 12: colorCode = '#00d600'; break; // other suitable
                            case 21: colorCode = '#0070ff'; break; // linkage area
                            case 22: colorCode = '#00a9e6'; break; // corridor
                            case 23: colorCode = '#002691'; break; // stepping stone
                            case 32: colorCode = '#ffaa00'; break; // critical connectivity sector
                            case 31: colorCode = '#ff0000'; break; // critical connectivity area
                        }
                        return {
                            color: colorCode,
                            weight: 1.5,
                            opacity: 0.8,
                            fillColor: colorCode,
                            fillOpacity: 0.4
                        };
                    }

                    L.geoJSON({type: 'FeatureCollection', features: romanianFeatures}, {
                        style: styleEcologicalNetwork,
                        onEachFeature: function (feature, layer) {
                            if (feature.properties && feature.properties.SUBC_NAME) {
                                layer.bindPopup(`<b>Rețea Ecologică Carpați</b><br>${feature.properties.SUBC_NAME}`);
                            }
                        }
                    }).addTo(map);
                }
            } catch(e) {
                console.warn("Nu s-a putut încărca layerul ArcGIS local:", e);
            }
        } catch (error) {
            console.error('Error loading data:', error);
            // If opening from file:// protocol, fetch might fail due to CORS.
            if(window.location.protocol === 'file:') {
                alert('Eroare: Pentru a încărca fișierele JSON locale, te rog să deschizi proiectul cu un server web local (ex: Live Server din VS Code sau "python -m http.server").');
            }
        }
    }

    // Initial load
    loadData();


});
