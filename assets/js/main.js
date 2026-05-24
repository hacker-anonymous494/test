// Main application functionality for Sherbimijone

class SherbimijoneApp {
    constructor() {
        this.utils = window.appUtils;
        this.map = null;
        this.busMarkers = {};
        this.currentSearch = null;
        this.searchResults = [];
        this.busInterval = null;
        this.userPreferences = {};
        
        // Initialize on DOM ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', () => this.init());
        } else {
            this.init();
        }
    }

    async init() {
        console.log('Initializing Sherbimijone App...');
        
        // Check authentication
        const isAuthenticated = await this.utils.checkAuth();
        this.updateAuthUI(isAuthenticated);
        
        // Initialize map
        this.initMap();
        
        // Initialize event listeners
        this.initEventListeners();
        
        // Load initial data
        this.loadInitialData();
        
        // Start bus tracking
        this.startBusTracking();
        
        // Initialize autocomplete for search
        this.initAutocomplete();
    }

    // Update authentication UI
    updateAuthUI(isAuthenticated) {
        const authButtons = document.getElementById('auth-buttons');
        const userProfile = document.getElementById('user-profile');
        const profileName = document.getElementById('profile-name');
        const profileFullname = document.getElementById('profile-fullname');
        const profileEmail = document.getElementById('profile-email');
        
        if (isAuthenticated && this.utils.currentUser) {
            // User is logged in
            authButtons.style.display = 'none';
            userProfile.style.display = 'block';
            
            const user = this.utils.currentUser;
            const fullName = `${user.firstName} ${user.lastName}`;
            
            profileName.textContent = user.firstName || 'User';
            profileFullname.textContent = fullName;
            profileEmail.textContent = user.email;
            
            // Load user preferences
            if (user.preferences) {
                this.userPreferences = user.preferences;
                this.applyUserPreferences();
            }
            
            // Load notifications
            this.loadUserNotifications();
        } else {
            // User is not logged in
            authButtons.style.display = 'flex';
            userProfile.style.display = 'none';
            
            // Set default auth buttons
            authButtons.innerHTML = `
                <a href="pages/login.html" class="btn btn-outline">
                    <i class="fas fa-sign-in-alt"></i> Kyçu
                </a>
                <a href="pages/register.html" class="btn btn-primary">
                    <i class="fas fa-user-plus"></i> Regjistrohu
                </a>
            `;
        }
        
        // Setup profile dropdown
        this.setupProfileDropdown();
    }

    // Apply user preferences
    applyUserPreferences() {
        // Apply theme
        if (this.userPreferences.theme) {
            document.body.setAttribute('data-theme', this.userPreferences.theme);
            const themeSwitch = document.getElementById('theme-switch');
            if (themeSwitch) {
                themeSwitch.checked = this.userPreferences.theme === 'dark';
            }
        }
        
        // Apply search preferences
        const fastestRadio = document.getElementById('fastest');
        const cheapestRadio = document.getElementById('cheapest');
        const fewestTransfersRadio = document.getElementById('fewest-transfers');
        
        if (this.userPreferences.preferred_transport === 'taxi') {
            if (fastestRadio) fastestRadio.checked = true;
        }
    }

    // Initialize map
    initMap() {
        // Default center (Tirana)
        const defaultCenter = [41.3275, 19.8187];
        
        // Create map
        this.map = L.map('hero-map').setView(defaultCenter, 13);
        
        // Add OpenStreetMap tile layer
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
            maxZoom: 19
        }).addTo(this.map);
        
        // Add bus stops layer
        this.addBusStopsLayer();
        
        // Add user location marker
        this.addUserLocation();
        
        // Fit bounds to Tirana area
        const tiranaBounds = L.latLngBounds(
            [41.29, 19.75],
            [41.36, 19.88]
        );
        this.map.fitBounds(tiranaBounds);
    }

    // Add bus stops layer
    async addBusStopsLayer() {
        try {
            // In production, you would fetch this from your database
            // For now, we'll use a sample of Tirana bus stops
            const busStops = [
                { name: "Sheshi Skenderbej", lat: 41.3275, lng: 19.8187, routes: ["L1", "L2", "L3"] },
                { name: "21 Dhjetori", lat: 41.3250, lng: 19.8200, routes: ["L2", "L4", "L5"] },
                { name: "Zogu i Zi", lat: 41.3333, lng: 19.8333, routes: ["L1", "L3", "L6"] },
                { name: "Unaza e Re", lat: 41.3200, lng: 19.8300, routes: ["L1", "L4", "L7"] },
                { name: "Kombinat", lat: 41.3150, lng: 19.8150, routes: ["L5", "L6", "L8"] },
                { name: "Qender", lat: 41.3300, lng: 19.8100, routes: ["L2", "L7", "L9"] }
            ];
            
            busStops.forEach(stop => {
                const marker = L.marker([stop.lat, stop.lng], {
                    icon: L.divIcon({
                        className: 'bus-stop-marker',
                        html: `<div class="bus-stop-icon"><i class="fas fa-bus-stop"></i></div>`,
                        iconSize: [30, 30],
                        iconAnchor: [15, 30]
                    })
                }).addTo(this.map);
                
                marker.bindPopup(`
                    <div class="bus-stop-popup">
                        <h4>${stop.name}</h4>
                        <p><strong>Linjat:</strong> ${stop.routes.join(', ')}</p>
                        <button class="btn btn-sm btn-primary use-stop-btn" data-location="${stop.name}">
                            Perdor kete stacion
                        </button>
                    </div>
                `);
            });
            
        } catch (error) {
            console.error('Error loading bus stops:', error);
        }
    }

    // Add user location
    async addUserLocation() {
        try {
            const location = await this.utils.getCurrentLocation();
            
            const userMarker = L.marker([location.lat, location.lng], {
                icon: L.divIcon({
                    className: 'user-location-marker',
                    html: '<div class="user-location-icon"><i class="fas fa-user"></i></div>',
                    iconSize: [30, 30],
                    iconAnchor: [15, 30]
                })
            }).addTo(this.map);
            
            userMarker.bindPopup('<strong>Ju jeni ketu</strong>');
            
            // Center map on user location
            this.map.setView([location.lat, location.lng], 15);
            
            // Get address from coordinates
            const address = await this.utils.reverseGeocode(location.lat, location.lng);
            document.getElementById('from-location').value = address;
            
        } catch (error) {
            console.log('Could not get user location:', error.message);
            // Don't show error for denied location permission
        }
    }

    // Initialize event listeners
    initEventListeners() {
        // Search button
        const searchBtn = document.getElementById('search-route-btn');
        if (searchBtn) {
            searchBtn.addEventListener('click', () => this.performSearch());
        }
        
        // Current location button
        const currentLocationBtn = document.getElementById('current-location-btn');
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', () => this.useCurrentLocation());
        }
        
        // Enter key in search inputs
        const fromInput = document.getElementById('from-location');
        const toInput = document.getElementById('to-location');
        
        if (fromInput) {
            fromInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.performSearch();
            });
        }
        
        if (toInput) {
            toInput.addEventListener('keypress', (e) => {
                if (e.key === 'Enter') this.performSearch();
            });
        }
        
        // Quick action buttons
        document.querySelectorAll('.quick-action').forEach(btn => {
            btn.addEventListener('click', (e) => {
                if (!this.utils.currentUser) {
                    e.preventDefault();
                    this.utils.showNotification('Ju duhet te identifikoheni per te perdorur kete veçori', 'warning');
                }
            });
        });
        
        // Theme toggle
        const themeSwitch = document.getElementById('theme-switch');
        if (themeSwitch) {
            themeSwitch.addEventListener('change', (e) => {
                const isDark = e.target.checked;
                document.body.setAttribute('data-theme', isDark ? 'dark' : 'light');
                localStorage.setItem('theme', isDark ? 'dark' : 'light');
                
                // Save to user preferences if logged in
                if (this.utils.currentUser) {
                    this.saveUserPreference('theme', isDark ? 'dark' : 'light');
                }
            });
        }
        
        // Language switcher
        document.querySelectorAll('.lang-option').forEach(option => {
            option.addEventListener('click', (e) => {
                e.preventDefault();
                const lang = e.target.dataset.lang;
                this.changeLanguage(lang);
            });
        });
        
        // Mobile menu toggle
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        
        if (hamburger && navMenu) {
            hamburger.addEventListener('click', () => {
                hamburger.classList.toggle('active');
                navMenu.classList.toggle('active');
            });
        }
        
        // Close mobile menu when clicking a link
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', () => {
                hamburger.classList.remove('active');
                navMenu.classList.remove('active');
            });
        });
    }

    // Initialize autocomplete for search inputs
    initAutocomplete() {
        const fromInput = document.getElementById('from-location');
        const toInput = document.getElementById('to-location');
        
        // Common locations in Tirana
        const commonLocations = [
            "Sheshi Skenderbej, Tirane",
            "21 Dhjetori, Tirane",
            "Zogu i Zi, Tirane",
            "Unaza e Re, Tirane",
            "Kombinat, Tirane",
            "Qender, Tirane",
            "Rruga Myslym Shyri, Tirane",
            "Bulevardi Deshmoret e Kombit, Tirane",
            "Parku i Madh, Tirane",
            "Universiteti i Tiranes",
            "Spitali Qendror, Tirane",
            "Aeroporti Nene Tereza, Tirane",
            "Stacioni i Autobuseve, Tirane",
            "Tregu i Bershit, Tirane"
        ];
        
        // Simple autocomplete implementation
        [fromInput, toInput].forEach(input => {
            if (!input) return;
            
            input.addEventListener('input', this.utils.debounce(async (e) => {
                const value = e.target.value;
                if (value.length < 2) return;
                
                // Filter common locations
                const suggestions = commonLocations.filter(loc => 
                    loc.toLowerCase().includes(value.toLowerCase())
                );
                
                // Also search via geocoding API
                const geocodeResults = await this.utils.geocode(value);
                
                // Show suggestions (you would implement a dropdown UI)
                if (suggestions.length > 0 || geocodeResults) {
                    console.log('Suggestions:', suggestions);
                    // In production, you would show these in a dropdown
                }
            }, 300));
        });
    }

    // Use current location
    async useCurrentLocation() {
        try {
            const location = await this.utils.getCurrentLocation();
            const address = await this.utils.reverseGeocode(location.lat, location.lng);
            
            document.getElementById('from-location').value = address;
            
            // Center map on user location
            if (this.map) {
                this.map.setView([location.lat, location.lng], 15);
                
                // Add marker
                L.marker([location.lat, location.lng], {
                    icon: L.divIcon({
                        className: 'current-location-marker',
                        html: '<div class="current-location-icon"><i class="fas fa-crosshairs"></i></div>',
                        iconSize: [30, 30],
                        iconAnchor: [15, 30]
                    })
                }).addTo(this.map).bindPopup('<strong>Lokacioni juaj aktual</strong>');
            }
            
            this.utils.showNotification('Lokacioni u vendos me sukses', 'success');
            
        } catch (error) {
            console.error('Error getting location:', error);
            this.utils.showNotification('Nuk mund te merret lokacioni. Ju lutem aktivizoni GPS.', 'error');
        }
    }

    // Perform search
    async performSearch() {
        const fromLocation = document.getElementById('from-location').value.trim();
        const toLocation = document.getElementById('to-location').value.trim();
        
        if (!fromLocation || !toLocation) {
            this.utils.showNotification('Ju lutem plotesoni te dyja lokacionet', 'error');
            return;
        }
        
        const searchType = document.querySelector('input[name="route-option"]:checked')?.id || 'fastest';
        
        const params = new URLSearchParams({
            from: fromLocation,
            to: toLocation,
            type: searchType
        });
        window.location.href = `pages/search.html?${params.toString()}`;
    }

    // Display search results
    displaySearchResults(results) {
        const modal = document.getElementById('search-results-modal');
        const resultsContainer = document.getElementById('route-options');
        
        if (!resultsContainer) return;
        
        if (results.length === 0) {
            resultsContainer.innerHTML = `
                <div class="no-results">
                    <i class="fas fa-search"></i>
                    <h4>Nuk u gjet asnje rruge</h4>
                    <p>Provoni te kerkoni me emra te ndryshem ose zgjidhni nje opsion tjeter kerkimi.</p>
                </div>
            `;
        } else {
            resultsContainer.innerHTML = results.map((route, index) => this.createRouteCard(route, index)).join('');
        }
        
        // Show modal
        modal.classList.add('show');
        document.body.style.overflow = 'hidden';
        
        // Add event listeners to route cards
        this.setupRouteCardListeners();
    }

    // Create route card HTML
    createRouteCard(route, index) {
        const isRecommended = index === 0;
        const stepsHtml = route.steps.map(step => `
            <div class="route-step">
                <div class="step-icon" style="color: ${step.color || 'var(--text-secondary)'}">
                    <i class="${step.icon || 'fas fa-walking'}"></i>
                </div>
                <div class="step-content">
                    <p class="step-description">${step.description}</p>
                    <p class="step-duration">${step.time} min ${step.distance ? `• ${this.utils.formatDistance(step.distance)}` : ''}</p>
                </div>
            </div>
        `).join('');
        
        return `
            <div class="route-option ${isRecommended ? 'recommended' : ''}" data-route-id="${route.id}">
                ${isRecommended ? '<div class="recommended-badge"><i class="fas fa-crown"></i> Rekomanduar</div>' : ''}
                
                <div class="route-header">
                    <div class="route-type">
                        <div class="route-type-icon" style="background: ${this.getRouteColor(route.type)}">
                            <i class="${this.getRouteIcon(route.type)}"></i>
                        </div>
                        <div class="route-info">
                            <h4>${route.routeName || route.serviceName || 'Rruge'}</h4>
                            <p class="route-details">
                                ${route.routeNumber ? `Linja ${route.routeNumber} • ` : ''}
                                ${route.transfers} nderrime • ${this.utils.formatDistance(route.distance)}
                            </p>
                        </div>
                    </div>
                    <div class="route-summary">
                        <div class="route-time">
                            <i class="fas fa-clock"></i>
                            <span>${this.utils.formatTime(route.totalTime)}</span>
                        </div>
                        <div class="route-price">
                            <i class="fas fa-money-bill-wave"></i>
                            <span>${this.utils.formatPrice(route.totalPrice)}</span>
                        </div>
                    </div>
                </div>
                
                <div class="route-steps">
                    ${stepsHtml}
                </div>
                
                <div class="route-actions">
                    <button class="btn btn-outline save-route-btn" data-route-id="${route.id}">
                        <i class="fas fa-bookmark"></i> Ruaj
                    </button>
                    <button class="btn btn-primary select-route-btn" data-route-id="${route.id}">
                        <i class="fas fa-check"></i> Zgjidh kete rruge
                    </button>
                </div>
                
                ${route.busInfo ? this.createBusInfoCard(route.busInfo) : ''}
                ${route.taxiInfo ? this.createTaxiInfoCard(route.taxiInfo) : ''}
            </div>
        `;
    }

    // Get route color based on type
    getRouteColor(type) {
        const colors = {
            'bus': 'var(--primary-color)',
            'taxi': 'var(--secondary-color)',
            'mixed': 'var(--accent-color)',
            'walk': 'var(--success-color)'
        };
        return colors[type] || 'var(--text-secondary)';
    }

    // Get route icon based on type
    getRouteIcon(type) {
        const icons = {
            'bus': 'fas fa-bus',
            'taxi': 'fas fa-taxi',
            'mixed': 'fas fa-random',
            'walk': 'fas fa-walking'
        };
        return icons[type] || 'fas fa-route';
    }

    // Create bus info card
    createBusInfoCard(busInfo) {
        if (!busInfo) return '';
        
        return `
            <div class="bus-info-card">
                <div class="bus-info-header">
                    <i class="fas fa-bus"></i>
                    <h5>Informacion per autobusin</h5>
                </div>
                <div class="bus-info-content">
                    <div class="bus-info-row">
                        <span>Numri i autobusit:</span>
                        <strong>${busInfo.bus_number || 'N/A'}</strong>
                    </div>
                    ${busInfo.driver ? `
                        <div class="bus-info-row">
                            <span>Shoferi:</span>
                            <strong>${busInfo.driver.name || 'N/A'}</strong>
                        </div>
                    ` : ''}
                    ${busInfo.current_speed ? `
                        <div class="bus-info-row">
                            <span>Shpejtesia:</span>
                            <strong>${busInfo.current_speed} km/h</strong>
                        </div>
                    ` : ''}
                    ${busInfo.passengers_count !== undefined ? `
                        <div class="bus-info-row">
                            <span>Pasagjere:</span>
                            <strong>${busInfo.passengers_count}/${busInfo.capacity || '?'}</strong>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Create taxi info card
    createTaxiInfoCard(taxiInfo) {
        if (!taxiInfo) return '';
        
        return `
            <div class="taxi-info-card">
                <div class="taxi-info-header">
                    <i class="fas fa-taxi"></i>
                    <h5>Informacion per taksi</h5>
                </div>
                <div class="taxi-info-content">
                    <div class="taxi-info-row">
                        <span>Kompania:</span>
                        <strong>${taxiInfo.name || 'N/A'}</strong>
                    </div>
                    ${taxiInfo.phone ? `
                        <div class="taxi-info-row">
                            <span>Telefoni:</span>
                            <strong><a href="tel:${taxiInfo.phone}">${taxiInfo.phone}</a></strong>
                        </div>
                    ` : ''}
                    ${taxiInfo.rating ? `
                        <div class="taxi-info-row">
                            <span>Vleresimi:</span>
                            <strong>${taxiInfo.rating}/5.0</strong>
                        </div>
                    ` : ''}
                    <div class="taxi-pricing">
                        <p><strong>Çmimi:</strong> ${taxiInfo.base_price || 300} Lek + ${taxiInfo.per_km_price || 100} Lek/km</p>
                    </div>
                </div>
            </div>
        `;
    }

    // Setup route card event listeners
    setupRouteCardListeners() {
        // Select route buttons
        document.querySelectorAll('.select-route-btn').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const routeId = e.target.dataset.routeId || e.target.closest('.select-route-btn').dataset.routeId;
                this.selectRoute(routeId);
            });
        });
        
        // Save route buttons
        document.querySelectorAll('.save-route-btn').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                const routeId = e.target.dataset.routeId || e.target.closest('.save-route-btn').dataset.routeId;
                await this.saveRoute(routeId);
            });
        });
        
        // Close modal
        const modal = document.getElementById('search-results-modal');
        const closeBtn = modal.querySelector('.modal-close');
        
        if (closeBtn) {
            closeBtn.addEventListener('click', () => {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            });
        }
        
        // Close modal when clicking outside
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.classList.remove('show');
                document.body.style.overflow = '';
            }
        });
    }

    // Select a route
    selectRoute(routeId) {
        const route = this.searchResults.find(r => r.id === routeId);
        if (!route) return;
        
        this.utils.showNotification(`Rruga u zgjodh! Koha e vleresuar: ${this.utils.formatTime(route.totalTime)}`, 'success');
        
        // In production, you would redirect to detailed view or start navigation
        console.log('Selected route:', route);
        
        // Close modal
        const modal = document.getElementById('search-results-modal');
        modal.classList.remove('show');
        document.body.style.overflow = '';
        
        // Update map with selected route
        this.drawSelectedRoute(route);
    }

    // Save a route
    async saveRoute(routeId) {
        if (!this.utils.currentUser) {
            this.utils.showNotification('Ju duhet te identifikoheni per te ruajtur rruge', 'warning');
            return;
        }
        
        const route = this.searchResults.find(r => r.id === routeId);
        if (!route) return;
        
        try {
            const response = await fetch('/.netlify/functions/save-route', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    routeData: route,
                    fromLocation: this.currentSearch.from,
                    toLocation: this.currentSearch.to
                })
            });
            
            const data = await response.json();
            
            if (!response.ok) {
                throw new Error(data.error || 'Gabim gjate ruajtjes');
            }
            
            this.utils.showNotification('Rruga u ruajt me sukses!', 'success');
            
        } catch (error) {
            console.error('Save route error:', error);
            this.utils.showNotification(error.message, 'error');
        }
    }

    // Draw route on map
    drawRouteOnMap(fromCoords, toCoords, route) {
        if (!this.map) return;
        
        // Clear existing route
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
        }
        
        // Draw line between points
        this.routeLayer = L.polyline([
            [fromCoords.lat, fromCoords.lng],
            [toCoords.lat, toCoords.lng]
        ], {
            color: 'var(--primary-color)',
            weight: 4,
            opacity: 0.7,
            dashArray: '10, 10'
        }).addTo(this.map);
        
        // Add markers
        const startIcon = L.divIcon({
            className: 'route-marker start-marker',
            html: '<div><i class="fas fa-map-marker-alt"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        const endIcon = L.divIcon({
            className: 'route-marker end-marker',
            html: '<div><i class="fas fa-flag-checkered"></i></div>',
            iconSize: [30, 30],
            iconAnchor: [15, 30]
        });
        
        L.marker([fromCoords.lat, fromCoords.lng], { icon: startIcon })
            .addTo(this.map)
            .bindPopup(`<strong>Nisja:</strong> ${this.currentSearch.from}`);
        
        L.marker([toCoords.lat, toCoords.lng], { icon: endIcon })
            .addTo(this.map)
            .bindPopup(`<strong>Destinacioni:</strong> ${this.currentSearch.to}`);
        
        // Fit bounds to show entire route
        this.map.fitBounds(this.routeLayer.getBounds().pad(0.1));
    }

    // Draw selected route with detailed steps
    drawSelectedRoute(route) {
        if (!this.map || !route.steps) return;
        
        // Clear existing route
        if (this.routeLayer) {
            this.map.removeLayer(this.routeLayer);
        }
        
        // In production, you would draw the actual route path
        // For now, we'll just show a simplified version
        
        console.log('Drawing detailed route:', route);
    }

    // Setup profile dropdown
    setupProfileDropdown() {
        const profileToggle = document.getElementById('profile-toggle');
        const profileMenu = document.getElementById('profile-menu');
        const logoutLink = document.getElementById('logout-link');
        
        if (!profileToggle || !profileMenu) return;
        
        // Toggle dropdown
        profileToggle.addEventListener('click', (e) => {
            e.stopPropagation();
            profileMenu.classList.toggle('show');
        });
        
        // Close dropdown when clicking outside
        document.addEventListener('click', (e) => {
            if (!profileToggle.contains(e.target) && !profileMenu.contains(e.target)) {
                profileMenu.classList.remove('show');
            }
        });
        
        // Logout
        if (logoutLink) {
            logoutLink.addEventListener('click', async (e) => {
                e.preventDefault();
                await this.logout();
            });
        }
    }

    // Logout
    async logout() {
        try {
            const response = await fetch('/.netlify/functions/logout', {
                method: 'POST',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.utils.currentUser = null;
                this.updateAuthUI(false);
                this.utils.showNotification('Ju jeni shkyçur me sukses', 'success');
                
                // Reload page after logout
                setTimeout(() => {
                    window.location.reload();
                }, 1500);
            } else {
                throw new Error(data.error || 'Gabim gjate shkyçjes');
            }
        } catch (error) {
            console.error('Logout error:', error);
            this.utils.showNotification(error.message, 'error');
        }
    }

    // Load initial data
    async loadInitialData() {
        // Load bus data
        await this.loadBusData();
        
        // Load user notifications if logged in
        if (this.utils.currentUser) {
            await this.loadUserNotifications();
        }
    }

    // Load bus data
    async loadBusData() {
        try {
            const response = await fetch('/.netlify/functions/get-buses', {
                method: 'GET',
                headers: {
                    'Cache-Control': 'no-cache'
                },
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (response.ok) {
                this.updateBusMarkers(data.buses);
            }
        } catch (error) {
            console.error('Error loading bus data:', error);
        }
    }

    // Update bus markers on map
    updateBusMarkers(buses) {
        // Remove old markers
        Object.values(this.busMarkers).forEach(marker => {
            if (marker && this.map) {
                this.map.removeLayer(marker);
            }
        });
        
        this.busMarkers = {};
        
        // Add new markers
        buses.forEach(bus => {
            if (!bus.currentLocation) return;
            
            const marker = L.marker([bus.currentLocation.lat, bus.currentLocation.lng], {
                icon: L.divIcon({
                    className: 'bus-marker',
                    html: `
                        <div class="bus-marker-icon" style="background: ${this.getBusColor(bus.occupancy)}">
                            <i class="fas fa-bus"></i>
                            <span class="bus-number">${bus.busNumber}</span>
                        </div>
                    `,
                    iconSize: [40, 40],
                    iconAnchor: [20, 20]
                })
            }).addTo(this.map);
            
            // Create popup content
            const popupContent = `
                <div class="bus-popup">
                    <h4>Autobusi ${bus.busNumber}</h4>
                    <p><strong>Linja:</strong> ${bus.routeNumber} - ${bus.routeName}</p>
                    <p><strong>Shoferi:</strong> ${bus.driver?.name || 'N/A'}</p>
                    <p><strong>Pasagjere:</strong> ${bus.passengersCount}/${bus.capacity} (${bus.occupancy}%)</p>
                    ${bus.nextStop ? `
                        <p><strong>Stacioni i radhes:</strong> ${bus.nextStop.name}</p>
                        <p><strong>Arritja e vleresuar:</strong> ${bus.estimatedArrival?.minutes || '?'} min</p>
                    ` : ''}
                    <p><strong>Statusi:</strong> ${this.getBusStatusText(bus.status)}</p>
                    <button class="btn btn-sm btn-primary track-bus-btn" data-bus-id="${bus.id}">
                        <i class="fas fa-location-arrow"></i> Gjurmo
                    </button>
                </div>
            `;
            
            marker.bindPopup(popupContent);
            this.busMarkers[bus.id] = marker;
        });
    }

    // Get bus color based on occupancy
    getBusColor(occupancy) {
        if (occupancy >= 90) return 'var(--accent-color)'; // Red - very crowded
        if (occupancy >= 70) return 'var(--warning-color)'; // Orange - crowded
        return 'var(--success-color)'; // Green - available seats
    }

    // Get bus status text
    getBusStatusText(status) {
        const statusMap = {
            'active': 'Aktiv',
            'inactive': 'Jo aktiv',
            'delayed': 'I vonuar',
            'broken': 'I prishur',
            'on_duty': 'Ne sherbim',
            'off_duty': 'Jashte sherbimit'
        };
        return statusMap[status] || status;
    }

    // Start bus tracking
    startBusTracking() {
        // Update bus positions every 30 seconds
        this.busInterval = setInterval(() => {
            this.loadBusData();
        }, 30000);
    }

    // Load user notifications
    async loadUserNotifications() {
        if (!this.utils.currentUser) return;
        
        try {
            const response = await fetch(`/.netlify/functions/get-notifications?userId=${this.utils.currentUser.id}`, {
                credentials: 'include'
            });
            
            if (response.ok) {
                const data = await response.json();
                this.updateNotificationBadge(data.notifications);
            }
        } catch (error) {
            console.error('Error loading notifications:', error);
        }
    }

    // Update notification badge
    updateNotificationBadge(notifications) {
        const badge = document.getElementById('notification-count');
        if (!badge) return;
        
        const unreadCount = notifications?.filter(n => !n.read).length || 0;
        
        if (unreadCount > 0) {
            badge.textContent = unreadCount > 99 ? '99+' : unreadCount.toString();
            badge.style.display = 'flex';
        } else {
            badge.style.display = 'none';
        }
    }

    // Save user preference
    async saveUserPreference(key, value) {
        if (!this.utils.currentUser) return;
        
        try {
            await fetch('/.netlify/functions/update-preference', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json'
                },
                credentials: 'include',
                body: JSON.stringify({
                    key: key,
                    value: value
                })
            });
        } catch (error) {
            console.error('Error saving preference:', error);
        }
    }

    // Change language
    changeLanguage(lang) {
        // In production, you would implement full i18n
        console.log('Changing language to:', lang);
        
        // For now, just show a notification
        const langName = lang === 'sq' ? 'Shqip' : 'English';
        this.utils.showNotification(`Gjuha u ndryshua ne ${langName}`, 'info');
        
        // Save preference
        if (this.utils.currentUser) {
            this.saveUserPreference('language', lang);
        }
        
        localStorage.setItem('language', lang);
    }

    // Add map styles
    addMapStyles() {
        const style = document.createElement('style');
        style.textContent = `
            .bus-marker-icon {
                width: 40px;
                height: 40px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                color: white;
                font-size: 16px;
                position: relative;
                box-shadow: 0 2px 5px rgba(0,0,0,0.3);
                border: 2px solid white;
            }
            
            .bus-number {
                position: absolute;
                bottom: -5px;
                right: -5px;
                background: white;
                color: var(--text-primary);
                font-size: 10px;
                font-weight: bold;
                width: 16px;
                height: 16px;
                border-radius: 50%;
                display: flex;
                align-items: center;
                justify-content: center;
                border: 1px solid var(--border-color);
            }
            
            .bus-stop-marker .bus-stop-icon {
                color: var(--primary-color);
                font-size: 24px;
                filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
            }
            
            .user-location-marker .user-location-icon {
                color: var(--secondary-color);
                font-size: 24px;
                filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
            }
            
            .current-location-marker .current-location-icon {
                color: var(--accent-color);
                font-size: 24px;
                filter: drop-shadow(0 2px 3px rgba(0,0,0,0.3));
            }
            
            .bus-popup, .bus-stop-popup {
                min-width: 200px;
            }
            
            .bus-popup h4, .bus-stop-popup h4 {
                margin: 0 0 10px 0;
                color: var(--primary-color);
            }
            
            .bus-popup p, .bus-stop-popup p {
                margin: 5px 0;
                font-size: 12px;
            }
            
            .bus-popup .btn {
                margin-top: 10px;
                width: 100%;
            }
        `;
        document.head.appendChild(style);
    }
}

// Initialize the app when DOM is ready
document.addEventListener('DOMContentLoaded', () => {
    // Make utils available globally
    window.appUtils = appUtils;
    
    // Initialize main app
    window.sherbimijoneApp = new SherbimijoneApp();
});