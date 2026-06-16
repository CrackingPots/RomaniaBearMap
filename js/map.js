document.addEventListener('DOMContentLoaded', () => {
    // Center map on Romania (approx Brasov/Prahova)
    const map = L.map('map').setView([45.45, 25.55], 10);

    // Dark theme map tiles
    L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
        subdomains: 'abcd',
        maxZoom: 20
    }).addTo(map);

    let heatmapLayer = null;
    const markersLayer = L.layerGroup().addTo(map);
    
    let isPlacingPin = false;
    let tempMarker = null;

    // DOM Elements
    const btnAddReport = document.getElementById('btn-add-report');
    const modal = document.getElementById('report-modal');
    const closeBtn = document.querySelector('.close-btn');
    const form = document.getElementById('report-form');
    const coordsInput = document.getElementById('report-coords');
    const btnMock = document.getElementById('btn-generate-mock'); // Button repurposed to clear local storage

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
            // 1. Load RO-ALERTS from static JSON
            const alertsRes = await fetch('data/alerts.json');
            const alerts = await alertsRes.json();
            document.getElementById('ro-alert-count').textContent = alerts.length;
            
            alerts.forEach(alert => {
                const customIcon = L.divIcon({ html: alert.icon || '🚨', className: 'custom-icon', iconSize: [24, 24], iconAnchor: [12, 12] });
                const marker = L.marker([alert.lat, alert.lng], {icon: customIcon});
                marker.bindPopup(`
                    <b style="color: #ef4444;">${alert.icon || '🚨'} ${alert.source || 'RO-ALERT'}</b><br>
                    <small style="color:#94a3b8">${alert.timestamp}</small><br>
                    ${alert.county ? alert.county + ',' : ''} ${alert.city || ''} ${alert.street || ''}<br>
                    <i style="opacity: 0.8; margin-top: 8px; display: inline-block;">"${alert.text_content}"</i>
                `);
                markersLayer.addLayer(marker);
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

            // 3. Load Heatmap Data from static JSON
            const heatRes = await fetch('data/heatmap.json');
            const heatData = await heatRes.json();
            
            // --- NOU: Adăugăm dinamic la Heatmap ---
            // Adăugăm alertele RO-ALERT la zonele de risc
            alerts.forEach(alert => {
                if (alert.lat && alert.lng) heatData.push([alert.lat, alert.lng, 1.0]);
            });
            
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

            // 4. Load ArcGIS Habitat Data (Live)
            try {
                const habitatRes = await fetch('https://services8.arcgis.com/0hQCisFJf25NtYVr/arcgis/rest/services/CG_habitat/FeatureServer/5/query?where=1%3D1&outFields=*&outSR=4326&f=geojson');
                if (habitatRes.ok) {
                    const habitatData = await habitatRes.json();
                    L.geoJSON(habitatData, {
                        style: {
                            color: '#ff7800',
                            weight: 2,
                            opacity: 0.8,
                            fillColor: '#ff7800',
                            fillOpacity: 0.15
                        }
                    }).bindPopup("<b>Habitat Natural (ArcGIS)</b>").addTo(map);
                }
            } catch(e) {
                console.warn("Nu s-a putut încărca layerul ArcGIS:", e);
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

    // Map Click Logic for adding reports
    map.on('click', function(e) {
        if (!isPlacingPin) return;

        if (tempMarker) {
            map.removeLayer(tempMarker);
        }

        const lat = e.latlng.lat;
        const lng = e.latlng.lng;
        
        tempMarker = L.marker([lat, lng], {icon: reportIcon}).addTo(map);
        
        // Show form
        form.classList.remove('hidden');
        coordsInput.value = `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
        coordsInput.dataset.lat = lat;
        coordsInput.dataset.lng = lng;
    });

    btnAddReport.addEventListener('click', () => {
        modal.classList.add('active');
        isPlacingPin = true;
        form.classList.add('hidden'); // hidden until map click
        if(tempMarker) map.removeLayer(tempMarker);
    });

    closeBtn.addEventListener('click', () => {
        modal.classList.remove('active');
        isPlacingPin = false;
        if(tempMarker) map.removeLayer(tempMarker);
    });

    // Form Submit (Save to LocalStorage)
    form.addEventListener('submit', (e) => {
        e.preventDefault();
        
        const payload = {
            id: Date.now(),
            lat: parseFloat(coordsInput.dataset.lat),
            lng: parseFloat(coordsInput.dataset.lng),
            observation_type: document.getElementById('report-type').value,
            details: document.getElementById('report-details').value,
            timestamp: new Date().toLocaleString('ro-RO')
        };

        saveLocalReport(payload);
        
        modal.classList.remove('active');
        isPlacingPin = false;
        form.reset();
        loadData(); // refresh map
    });
    
    // Update button behavior
    if (btnMock) {
        btnMock.textContent = 'Șterge Date Locale';
        btnMock.addEventListener('click', () => {
            if(confirm('Sigur doriți să ștergeți raportările salvate pe acest dispozitiv?')) {
                localStorage.removeItem('bear_reports');
                loadData();
            }
        });
    }
});
