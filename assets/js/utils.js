// Frontend utility functions
class AppUtils {
    constructor() {
        this.apiBase = '/.netlify/functions';
        this.currentUser = null;
        this.map = null;
        this.busMarkers = {};
    }

    // Check authentication status
    async checkAuth() {
        try {
            const response = await fetch(`${this.apiBase}/validate-session`, {
                method: 'GET',
                credentials: 'include'
            });
            
            const data = await response.json();
            
            if (data.authenticated && data.user) {
                this.currentUser = data.user;
                return true;
            }
            return false;
        } catch (error) {
            console.error('Auth check error:', error);
            return false;
        }
    }

    // Show notification
    showNotification(message, type = 'info', duration = 5000) {
        // Remove existing notifications
        const existing = document.querySelectorAll('.notification');
        existing.forEach(n => n.remove());

        const notification = document.createElement('div');
        notification.className = `notification notification-${type}`;
        notification.innerHTML = `
            <div class="notification-content">
                <i class="fas fa-${this.getNotificationIcon(type)}"></i>
                <span>${message}</span>
                <button class="notification-close"><i class="fas fa-times"></i></button>
            </div>
        `;

        document.body.appendChild(notification);

        // Add close functionality
        const closeBtn = notification.querySelector('.notification-close');
        closeBtn.addEventListener('click', () => notification.remove());

        // Auto remove
        if (duration > 0) {
            setTimeout(() => {
                if (notification.parentNode) notification.remove();
            }, duration);
        }

        // Add animation
        setTimeout(() => notification.classList.add('show'), 10);
    }

    getNotificationIcon(type) {
        const icons = {
            'success': 'check-circle',
            'error': 'exclamation-circle',
            'warning': 'exclamation-triangle',
            'info': 'info-circle'
        };
        return icons[type] || 'info-circle';
    }

    // Format time
    formatTime(minutes) {
        if (minutes < 60) {
            return `${minutes} min`;
        }
        const hours = Math.floor(minutes / 60);
        const mins = minutes % 60;
        return mins > 0 ? `${hours}h ${mins}min` : `${hours}h`;
    }

    // Format distance
    formatDistance(km) {
        if (km < 1) {
            return `${Math.round(km * 1000)} m`;
        }
        return `${km.toFixed(1)} km`;
    }

    // Format price
    formatPrice(price) {
        return `${price.toFixed(2)} Lek`;
    }

    // Debounce function for search
    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }

    // Get current location
    async getCurrentLocation() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error('Geolocation not supported'));
                return;
            }

            navigator.geolocation.getCurrentPosition(
                (position) => {
                    resolve({
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    });
                },
                (error) => {
                    reject(error);
                },
                { 
                    enableHighAccuracy: true,
                    timeout: 10000,
                    maximumAge: 0
                }
            );
        });
    }

    // Reverse geocoding (get address from coordinates)
    async reverseGeocode(lat, lng) {
        try {
            // Using Nominatim (OpenStreetMap) - free service
            const response = await fetch(
                `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&zoom=18&addressdetails=1`,
                {
                    headers: {
                        'User-Agent': 'Sherbimijone/1.0'
                    }
                }
            );
            
            const data = await response.json();
            
            if (data.display_name) {
                return data.display_name;
            }
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        } catch (error) {
            console.error('Reverse geocode error:', error);
            return `${lat.toFixed(6)}, ${lng.toFixed(6)}`;
        }
    }

    // Geocoding (get coordinates from address)
    async geocode(address) {
        try {
            const response = await fetch(
                `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=al&viewbox=19.6,41.1,20.1,41.5&bounded=1`,
                {
                    headers: {
                        'User-Agent': 'Sherbimijone/1.0'
                    }
                }
            );
            
            const data = await response.json();
            
            if (data && data.length > 0) {
                return {
                    lat: parseFloat(data[0].lat),
                    lng: parseFloat(data[0].lon),
                    display_name: data[0].display_name
                };
            }
            return null;
        } catch (error) {
            console.error('Geocode error:', error);
            return null;
        }
    }

    // Calculate distance between two points (Haversine formula)
    calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = this.toRad(lat2 - lat1);
        const dLon = this.toRad(lon2 - lon1);
        
        const a = 
            Math.sin(dLat/2) * Math.sin(dLat/2) +
            Math.cos(this.toRad(lat1)) * Math.cos(this.toRad(lat2)) * 
            Math.sin(dLon/2) * Math.sin(dLon/2);
        
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }

    toRad(degrees) {
        return degrees * (Math.PI/180);
    }

    // Parse route steps for display
    parseRouteSteps(steps) {
        if (!steps || !Array.isArray(steps)) return [];
        
        return steps.map((step, index) => {
            const stepType = step.type || 'walk';
            let icon = 'fas fa-walking';
            let color = 'var(--text-secondary)';
            
            switch(stepType) {
                case 'bus':
                    icon = 'fas fa-bus';
                    color = 'var(--primary-color)';
                    break;
                case 'taxi':
                    icon = 'fas fa-taxi';
                    color = 'var(--secondary-color)';
                    break;
                case 'wait':
                    icon = 'fas fa-clock';
                    color = 'var(--accent-color)';
                    break;
            }
            
            return {
                ...step,
                icon,
                color,
                number: index + 1
            };
        });
    }
}

// Initialize app utilities
const appUtils = new AppUtils();

// Notification styles (inject into head)
const notificationStyles = document.createElement('style');
notificationStyles.textContent = `
    .notification {
        position: fixed;
        top: 20px;
        right: 20px;
        z-index: 10000;
        min-width: 300px;
        max-width: 400px;
        border-radius: 8px;
        padding: 15px;
        background: var(--bg-primary);
        box-shadow: 0 4px 12px rgba(0,0,0,0.15);
        transform: translateX(120%);
        transition: transform 0.3s ease;
        border-left: 4px solid var(--primary-color);
    }
    
    .notification.show {
        transform: translateX(0);
    }
    
    .notification-success {
        border-left-color: var(--success-color);
        background: linear-gradient(135deg, rgba(0,200,81,0.1) 0%, rgba(0,200,81,0.05) 100%);
    }
    
    .notification-error {
        border-left-color: var(--error-color);
        background: linear-gradient(135deg, rgba(255,68,68,0.1) 0%, rgba(255,68,68,0.05) 100%);
    }
    
    .notification-warning {
        border-left-color: var(--warning-color);
        background: linear-gradient(135deg, rgba(255,187,51,0.1) 0%, rgba(255,187,51,0.05) 100%);
    }
    
    .notification-info {
        border-left-color: var(--info-color);
        background: linear-gradient(135deg, rgba(0,172,193,0.1) 0%, rgba(0,172,193,0.05) 100%);
    }
    
    .notification-content {
        display: flex;
        align-items: center;
        gap: 12px;
    }
    
    .notification-content i:first-child {
        font-size: 20px;
    }
    
    .notification-content span {
        flex: 1;
        font-size: 14px;
        line-height: 1.4;
    }
    
    .notification-close {
        background: none;
        border: none;
        color: var(--text-secondary);
        cursor: pointer;
        font-size: 16px;
        padding: 0;
        width: 24px;
        height: 24px;
        display: flex;
        align-items: center;
        justify-content: center;
        border-radius: 4px;
        transition: var(--transition);
    }
    
    .notification-close:hover {
        background: rgba(0,0,0,0.1);
    }
`;

document.head.appendChild(notificationStyles);