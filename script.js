// Inicializimi i aplikacionit
document.addEventListener('DOMContentLoaded', function() {
    // Variabla globale
    let currentTheme = localStorage.getItem('theme') || 'light';
    let currentLanguage = localStorage.getItem('language') || 'sq';
    let userLocation = null;
    let map = null;
    let userMarker = null;
    
    // Inicializimi i funksioneve
    initTheme();
    initLanguage();
    initHamburgerMenu();
    initMap();
    initEventListeners();
    initStatsCounter();
    
    // Funksioni për inicializimin e temës
    function initTheme() {
        const themeSwitch = document.getElementById('theme-switch');
        const body = document.body;
        
        // Vendos temën e ruajtur
        if (currentTheme === 'dark') {
            themeSwitch.checked = true;
            body.setAttribute('data-theme', 'dark');
        } else {
            themeSwitch.checked = false;
            body.setAttribute('data-theme', 'light');
        }
        
        // Shto event listener për ndryshimin e temës
        themeSwitch.addEventListener('change', function() {
            if (this.checked) {
                body.setAttribute('data-theme', 'dark');
                localStorage.setItem('theme', 'dark');
                currentTheme = 'dark';
            } else {
                body.setAttribute('data-theme', 'light');
                localStorage.setItem('theme', 'light');
                currentTheme = 'light';
            }
        });
    }
    
    // Funksioni për inicializimin e gjuhës
    function initLanguage() {
        const langOptions = document.querySelectorAll('.lang-option');
        
        // Vendos gjuhën e ruajtur
        document.documentElement.lang = currentLanguage;
        
        // Shto event listener për ndryshimin e gjuhës
        langOptions.forEach(option => {
            option.addEventListener('click', function(e) {
                e.preventDefault();
                const lang = this.getAttribute('data-lang');
                currentLanguage = lang;
                localStorage.setItem('language', lang);
                document.documentElement.lang = lang;
                changeLanguage(lang);
            });
        });
    }
    
    // Funksioni për ndryshimin e gjuhës (do të shtohet më shumë më vonë)
    function changeLanguage(lang) {
        // Kjo funksion do të plotësohet me tekstet e përkthimit
        console.log('Gjuha u ndërrua në:', lang);
        alert(`Gjuha u ndërrua në ${lang === 'sq' ? 'Shqip' : 'English'}. Ky funksion do të plotësohet më tej.`);
    }
    
    // Funksioni për inicializimin e menysë hamburger
    function initHamburgerMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        
        if (hamburger && navMenu) {
            hamburger.addEventListener('click', function() {
                this.classList.toggle('active');
                navMenu.classList.toggle('active');
            });
            
            // Mbyll menunë kur klikohet një link
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', function() {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                });
            });
        }
    }
    
    // Funksioni për inicializimin e hartës
    function initMap() {
        const mapElement = document.getElementById('hero-map');
        
        if (mapElement) {
            // Inicializo hartën me qendër në Tiranë
            map = L.map('hero-map').setView([41.3275, 19.8187], 13);
            
            // Shto layer-in e hartës
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);
            
            // Shto marker për stacionet kryesore të autobusëve në Tiranë
            const busStations = [
                { name: 'Stacioni i Autobusëve të Jugut', lat: 41.3186, lng: 19.8184 },
                { name: 'Stacioni i Autobusëve të Veriut', lat: 41.3382, lng: 19.8201 },
                { name: 'Qendra e Tiranës', lat: 41.3275, lng: 19.8187 },
                { name: 'Stacioni i Trenit', lat: 41.3222, lng: 19.7986 },
                { name: 'Aeroporti Nënë Tereza', lat: 41.4147, lng: 19.7206 }
            ];
            
            busStations.forEach(station => {
                L.marker([station.lat, station.lng])
                    .addTo(map)
                    .bindPopup(`<b>${station.name}</b><br>Stacion kryesor i autobusëve`)
                    .openPopup();
            });
        }
    }
    
    // Funksioni për inicializimin e event listener-ëve
    function initEventListeners() {
        // Butoni për lokacionin aktual
        const currentLocationBtn = document.getElementById('current-location-btn');
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', getCurrentLocation);
        }
        
        // Butoni për kërkimin e rrugës
        const searchRouteBtn = document.getElementById('search-route-btn');
        if (searchRouteBtn) {
            searchRouteBtn.addEventListener('click', searchRoute);
        }
        
        // Forma e kontaktit
        // Contact form submission
const contactForm = document.getElementById('contact-form');
if (contactForm) {
  contactForm.addEventListener('submit', async function(e) {
    e.preventDefault();

    const name = this.querySelector('input[placeholder="Emri Juaj"]').value;
    const email = this.querySelector('input[placeholder="Email Juaj"]').value;
    const subject = this.querySelector('input[placeholder="Subjekti"]').value;
    const message = this.querySelector('textarea').value;

    // Disable button and show loading
    const submitBtn = this.querySelector('button[type="submit"]');
    const originalText = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke dërguar...';
    submitBtn.disabled = true;

    try {
      const response = await fetch(`${API_BASE_URL}/api/contact`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Client-IP': window.clientIP || '', // if available from security script
          'X-Session-ID': window.securitySessionId || '',
          'X-User-ID': window.authManager.getCurrentUser()?.id || ''
        },
        body: JSON.stringify({ name, email, subject, message })
      });

      const data = await response.json();
      if (response.ok) {
        // Show success message
        alert('Mesazhi u dërgua me sukses!');
        contactForm.reset();
      } else {
        alert(data.error || 'Dërgimi dështoi.');
      }
    } catch (err) {
      alert('Gabim në lidhje me serverin.');
      console.error(err);
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });
}
        
        // Modal për rezultatet e kërkimit
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }
        
        // Mbyll modal kur klikohet jashtë
        window.addEventListener('click', function(e) {
            const modal = document.getElementById('search-results-modal');
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // Funksioni për marrjen e lokacionit aktual
    function getCurrentLocation() {
        const fromLocationInput = document.getElementById('from-location');
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Përdor një shërbim të kundërt të geokodimit për të marrë emrin e vendndodhjes
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`)
                        .then(response => response.json())
                        .then(data => {
                            const address = data.display_name || 'Lokacioni juaj aktual';
                            fromLocationInput.value = address;
                            
                            // Shto marker në hartë për lokacionin aktual
                            if (map) {
                                if (userMarker) {
                                    map.removeLayer(userMarker);
                                }
                                
                                userMarker = L.marker([userLocation.lat, userLocation.lng])
                                    .addTo(map)
                                    .bindPopup('<b>Ju jeni këtu</b>')
                                    .openPopup();
                                
                                map.setView([userLocation.lat, userLocation.lng], 15);
                            }
                        })
                        .catch(error => {
                            console.error('Gabim në marrjen e adresës:', error);
                            fromLocationInput.value = 'Lokacioni juaj aktual';
                        });
                },
                function(error) {
                    console.error('Gabim në marrjen e lokacionit:', error);
                    alert('Nuk mundi të merret lokacioni juaj. Ju lutem sigurohuni që keni lejuar aksesin në lokacion.');
                    fromLocationInput.value = 'Lokacioni nuk është i disponueshëm';
                }
            );
        } else {
            alert('Shfletuesi juaj nuk mbështet gjeolokacionin.');
        }
    }
    
    // Funksioni për kërkimin e rrugës
    // Replace the old searchRoute function in script.js
function searchRoute() {
  const fromLocation = document.getElementById('from-location').value.trim();
  const toLocation = document.getElementById('to-location').value.trim();
  
  if (!fromLocation || !toLocation) {
    alert('Ju lutem plotësoni të dyja fushat: vendndodhjen dhe destinacionin.');
    return;
  }
  
  // Get selected search option
  let searchType = 'fastest';
  if (document.getElementById('cheapest').checked) searchType = 'cheapest';
  if (document.getElementById('fewest-transfers').checked) searchType = 'fewest-transfers';
  
  // Redirect to search.html with parameters
  const params = new URLSearchParams({
    from: fromLocation,
    to: toLocation,
    type: searchType
  });
  window.location.href = `pages/search.html?${params.toString()}`;
}
    
    // Funksioni për shfaqjen e ngarkimit
    function showLoading() {
        const searchBtn = document.getElementById('search-route-btn');
        const originalText = searchBtn.innerHTML;
        
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke kërkuar...';
        searchBtn.disabled = true;
        
        // Ruaj tekstin origjinal për ta rivendosur më vonë
        searchBtn.setAttribute('data-original-text', originalText);
    }
    
    // Funksioni për fshehjen e ngarkimit
    function hideLoading() {
        const searchBtn = document.getElementById('search-route-btn');
        const originalText = searchBtn.getAttribute('data-original-text');
        
        if (originalText) {
            searchBtn.innerHTML = originalText;
        } else {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Gjej Rrugën';
        }
        
        searchBtn.disabled = false;
    }
    
    // Funksioni për shfaqjen e rezultateve të kërkimit
    function showSearchResults(from, to, option) {
        const modal = document.getElementById('search-results-modal');
        const routeOptionsContainer = document.getElementById('route-options');
        
        // Krijoj rezultate të simulura
        const results = [
            {
                id: 1,
                title: 'Rruga më e shpejtë',
                time: '35 min',
                transfers: 1,
                price: '40 Lekë',
                steps: [
                    'Ecni 5 minuta deri në stacionin "Sheshi Shqiponja"',
                    'Merrni autobusin L2 për 20 minuta',
                    'Nda tek stacioni "21 Dhjetori"',
                    'Merrni autobusin L5 për 10 minuta',
                    'Arritni në destinacion'
                ]
            },
            {
                id: 2,
                title: 'Rruga me më pak ndërrime',
                time: '45 min',
                transfers: 0,
                price: '50 Lekë',
                steps: [
                    'Ecni 10 minuta deri në stacionin "Qendra"',
                    'Merrni autobusin L8 për 35 minuta',
                    'Arritni direkt në destinacion'
                ]
            },
            {
                id: 3,
                title: 'Rruga më e lirë',
                time: '55 min',
                transfers: 2,
                price: '30 Lekë',
                steps: [
                    'Ecni 3 minuta deri në stacionin "Pazari i Ri"',
                    'Merrni autobusin L1 për 25 minuta',
                    'Nda tek stacioni "Zogu i Zi"',
                    'Merrni autobusin L3 për 15 minuta',
                    'Nda tek stacioni "Kombinat"',
                    'Merrni autobusin L11 për 12 minuta',
                    'Arritni në destinacion'
                ]
            }
        ];
        
        // Krijoj HTML për rezultatet
        let html = '';
        results.forEach(route => {
            html += `
                <div class="route-option" data-route-id="${route.id}">
                    <div class="route-header">
                        <div class="route-title">${route.title}</div>
                        <div class="route-time">${route.time}</div>
                    </div>
                    <div class="route-details">
                        <div class="route-stops">
                            <i class="fas fa-exchange-alt"></i>
                            <span>${route.transfers} ndërrime</span>
                        </div>
                        <div class="route-price">${route.price}</div>
                    </div>
                    <div class="route-steps">
                        ${route.steps.map(step => `<div class="route-step"><i class="fas fa-arrow-right"></i> ${step}</div>`).join('')}
                    </div>
                    <button class="btn btn-primary select-route-btn" style="margin-top: 15px; width: 100%;">
                        <i class="fas fa-directions"></i> Zgjidh këtë rrugë
                    </button>
                </div>
            `;
        });
        
        routeOptionsContainer.innerHTML = html;
        
        // Shto event listener për butonat e zgjedhjes së rrugës
        document.querySelectorAll('.select-route-btn').forEach(btn => {
            btn.addEventListener('click', function() {
                const routeOption = this.closest('.route-option');
                const routeId = routeOption.getAttribute('data-route-id');
                selectRoute(routeId);
            });
        });
        
        // Shfaq modal
        modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    }
    
    // Funksioni për zgjedhjen e një rruge
    function selectRoute(routeId) {
        alert(`Ju zgjodhët rrugën me ID: ${routeId}. Do të ridrejtoheni tek faqja me udhëzimet e detajuara.`);
        closeModal();
        
        // Në një implementim real, do të ridrejtohej tek faqja e udhëzimeve
        // window.location.href = `pages/route-details.html?route=${routeId}`;
    }
    
    // Funksioni për mbylljen e modal
    function closeModal() {
        const modal = document.getElementById('search-results-modal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    // Funksioni për trajtimin e formës së kontaktit
    function handleContactForm(e) {
        e.preventDefault();
        
        // Simuloj dërgimin e formës
        showLoadingForm();
        
        // Simuloj vonesën e serverit
        setTimeout(() => {
            hideLoadingForm();
            alert('Mesazhi juaj u dërgua me sukses! Do t\'ju kontaktojmë së shpejti.');
            e.target.reset();
        }, 2000);
    }
    
    // Funksionet për ngarkimin e formës
    function showLoadingForm() {
        const submitBtn = document.querySelector('#contact-form button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke dërguar...';
        submitBtn.disabled = true;
        submitBtn.setAttribute('data-original-text', originalText);
    }
    
    function hideLoadingForm() {
        const submitBtn = document.querySelector('#contact-form button[type="submit"]');
        const originalText = submitBtn.getAttribute('data-original-text');
        
        if (originalText) {
            submitBtn.innerHTML = originalText;
        } else {
            submitBtn.innerHTML = 'Dërgo Mesazhin';
        }
        
        submitBtn.disabled = false;
    }
    
    // Funksioni për animimin e numrave të statistikave
    function initStatsCounter() {
        const statNumbers = document.querySelectorAll('.stat-number');
        
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const statNumber = entry.target;
                    const target = parseInt(statNumber.getAttribute('data-count'));
                    const duration = 2000; // 2 sekonda
                    const step = target / (duration / 16); // 60 FPS
                    let current = 0;
                    
                    const timer = setInterval(() => {
                        current += step;
                        if (current >= target) {
                            statNumber.textContent = target;
                            clearInterval(timer);
                        } else {
                            statNumber.textContent = Math.floor(current);
                        }
                    }, 16);
                    
                    observer.unobserve(statNumber);
                }
            });
        }, { threshold: 0.5 });
        
        statNumbers.forEach(stat => {
            observer.observe(stat);
        });
    }
    
    // Funksioni për mbylljen e dropdown-ëve kur klikohet jashtë
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.style.opacity = '0';
                menu.style.visibility = 'hidden';
                menu.style.transform = 'translateY(10px)';
            });
        }
    });
    
    // Funksioni për scroll-in e butë tek seksionet
    document.querySelectorAll('a[href^="#"]').forEach(anchor => {
        anchor.addEventListener('click', function(e) {
            const href = this.getAttribute('href');
            
            if (href === '#') return;
            
            e.preventDefault();
            const targetElement = document.querySelector(href);
            
            if (targetElement) {
                window.scrollTo({
                    top: targetElement.offsetTop - 100,
                    behavior: 'smooth'
                });
            }
        });
    });
});

// Funksion për inicializimin e autocomplete për lokacionet
function initAutocomplete() {
    const fromInput = document.getElementById('from-location');
    const toInput = document.getElementById('to-location');
    
    if (fromInput && toInput) {
        // Inicializo autocomplete për të dy inputet
        initLocationAutocomplete(fromInput);
        initLocationAutocomplete(toInput);
    }
}

// Funksioni për inicializimin e autocomplete për një input
function initLocationAutocomplete(input) {
    // Këtu do të implementohet autocomplete me OpenStreetMap Nominatim
    // Për momentin, do të shtojmë vetëm disa sugjerime të thjeshta
    
    input.addEventListener('input', function() {
        const value = this.value.toLowerCase();
        
        if (value.length < 3) return;
        
        // Sugjerime të thjeshta (në një implementim real, do të bëhej një kërkesë në server)
        const suggestions = [
            'Sheshi Skënderbej, Tiranë',
            'Stacioni i Autobusëve të Jugut, Tiranë',
            'Stacioni i Autobusëve të Veriut, Tiranë',
            'Aeroporti Nënë Tereza, Tiranë',
            'Universiteti i Tiranës',
            'Qendra Tregtare TEG, Tiranë',
            'Spitali Nënë Tereza, Tiranë',
            'Parku i Madh, Tiranë',
            'Zona e Re, Tiranë',
            'Kinema Millenium, Tiranë'
        ];
        
        const filtered = suggestions.filter(suggestion => 
            suggestion.toLowerCase().includes(value)
        );
        
        // Krijoj dropdown për sugjerimet (do të implementohet më shumë në versionet e ardhshme)
        if (filtered.length > 0) {
            console.log('Sugjerime për', value, ':', filtered);
        }
    });
}

// Thirr funksionin për autocomplete pasi të ngarkohet faqja
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutocomplete);
} else {
    initAutocomplete();
}

// Ruaj historikun e kërkimeve në localStorage
function saveSearchHistory(from, to) {
    const history = JSON.parse(localStorage.getItem('searchHistory')) || [];
    
    // Shto kërkimin e ri në fillim të historikut
    history.unshift({
        from,
        to,
        timestamp: new Date().toISOString()
    });
    
    // Ruaj vetëm 10 kërkimet e fundit
    const limitedHistory = history.slice(0, 10);
    
    localStorage.setItem('searchHistory', JSON.stringify(limitedHistory));
}

// Funksioni për marrjen e historikut të kërkimeve
function getSearchHistory() {
    return JSON.parse(localStorage.getItem('searchHistory')) || [];
}

// Funksioni për pastrimin e historikut të kërkimeve
function clearSearchHistory() {
    localStorage.removeItem('searchHistory');
    alert('Historia e kërkimeve u pastrua.');
}

// Language dropdown toggle
document.addEventListener('DOMContentLoaded', function() {
    const dropdownToggle = document.querySelector('.nav-item.dropdown > .nav-link');
    const dropdownMenu = document.querySelector('.nav-item.dropdown .dropdown-menu');

    if (dropdownToggle && dropdownMenu) {
        dropdownToggle.addEventListener('click', function(e) {
            e.preventDefault();        // Prevent page jump
            e.stopPropagation();       // Prevent event from bubbling
    console.log('Dropdown clicked');

            // Close any other open dropdowns (optional)
            document.querySelectorAll('.dropdown-menu.show').forEach(menu => {
                if (menu !== dropdownMenu) menu.classList.remove('show');
            });

            dropdownMenu.classList.toggle('show');
        });

        // Close when clicking outside
        document.addEventListener('click', function(e) {
            if (!dropdownToggle.contains(e.target) && !dropdownMenu.contains(e.target)) {
                dropdownMenu.classList.remove('show');
            }
        });
    }
});

let closeTimeout;

// User dropdown toggle (event delegation)
document.addEventListener('click', function(e) {
    const button = e.target.closest('.user-profile-btn');
    const menu = e.target.closest('.user-dropdown .dropdown-menu');

    if (button) {
        e.preventDefault();
        clearTimeout(closeTimeout); // cancel any pending close

        const dropdownMenu = button.closest('.user-dropdown').querySelector('.dropdown-menu');
        
        // Remove inline styles
        dropdownMenu.style.removeProperty('opacity');
        dropdownMenu.style.removeProperty('visibility');
        dropdownMenu.style.removeProperty('transform');
        
        // Close other open dropdowns
        document.querySelectorAll('.user-dropdown .dropdown-menu.show').forEach(m => {
            if (m !== dropdownMenu) m.classList.remove('show');
        });

        // Toggle current
        dropdownMenu.classList.toggle('show');
    } else if (!menu) {
        // Click outside: close after a tiny delay to allow moving to menu
        clearTimeout(closeTimeout);
        closeTimeout = setTimeout(() => {
            document.querySelectorAll('.user-dropdown .dropdown-menu.show').forEach(m => {
                m.classList.remove('show');
            });
        }, 200); // 200ms delay
    }
});

// Optional: cancel close if mouse enters the menu
document.addEventListener('mouseover', function(e) {
    if (e.target.closest('.user-dropdown .dropdown-menu')) {
        clearTimeout(closeTimeout);
    }
});