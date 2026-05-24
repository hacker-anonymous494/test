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
    
    // Funksioni per inicializimin e temes
    function initTheme() {
        const themeSwitch = document.getElementById('theme-switch');
        const body = document.body;
        
        // Exit if themeSwitch element doesn't exist (e.g., on pages without theme toggle)
        if (!themeSwitch) return;
        
        // Vendos temen e ruajtur
        if (currentTheme === 'dark') {
            themeSwitch.checked = true;
            body.setAttribute('data-theme', 'dark');
        } else {
            themeSwitch.checked = false;
            body.setAttribute('data-theme', 'light');
        }
        
        // Shto event listener per ndryshimin e temes
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
    
    // Funksioni per inicializimin e gjuhes
    function initLanguage() {
        const langOptions = document.querySelectorAll('.lang-option');
        
        // Vendos gjuhen e ruajtur
        document.documentElement.lang = currentLanguage;
        
        // Shto event listener per ndryshimin e gjuhes
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
    
    // Funksioni per ndryshimin e gjuhes (do te shtohet me shume me vone)
    function changeLanguage(lang) {
        // Kjo funksion do te plotesohet me tekstet e perkthimit
        console.log('Gjuha u nderrua ne:', lang);
        alert(`Gjuha u nderrua ne ${lang === 'sq' ? 'Shqip' : 'English'}. Ky funksion do te plotesohet me tej.`);
    }
    
    // Funksioni per inicializimin e menyse hamburger
    function initHamburgerMenu() {
        const hamburger = document.querySelector('.hamburger');
        const navMenu = document.querySelector('.nav-menu');
        
        if (hamburger && navMenu) {
            hamburger.addEventListener('click', function() {
                this.classList.toggle('active');
                navMenu.classList.toggle('active');
            });
            
            // Mbyll menune kur klikohet nje link
            document.querySelectorAll('.nav-link').forEach(link => {
                link.addEventListener('click', function() {
                    hamburger.classList.remove('active');
                    navMenu.classList.remove('active');
                });
            });
        }
    }
    
    // Funksioni per inicializimin e hartes
    function initMap() {
        const mapElement = document.getElementById('hero-map');
        
        if (mapElement) {
            // Inicializo harten me qender ne Tirane
            map = L.map('hero-map').setView([41.3275, 19.8187], 13);
            
            // Shto layer-in e hartes
            L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            }).addTo(map);

            // Expose map globally so other scripts (picker) can access it
            window.heroMap = map;
            
            // Shto marker per stacionet kryesore te autobuseve ne Tirane
            const busStations = [
                { name: 'Stacioni i Autobuseve te Jugut', lat: 41.3186, lng: 19.8184 },
                { name: 'Stacioni i Autobuseve te Veriut', lat: 41.3382, lng: 19.8201 },
                { name: 'Qendra e Tiranes', lat: 41.3275, lng: 19.8187 },
                { name: 'Stacioni i Trenit', lat: 41.3222, lng: 19.7986 },
                { name: 'Aeroporti Nene Tereza', lat: 41.4147, lng: 19.7206 }
            ];
            
            // Optional: bus station markers (commented out to avoid clutter)
            /*
            busStations.forEach(station => {
                L.marker([station.lat, station.lng])
                    .addTo(map)
                    .bindPopup(`<b>${station.name}</b><br>Stacion kryesor i autobuseve`)
                    .openPopup();
            });
            */
        }
    }
    
    // Funksioni per inicializimin e event listener-eve
    function initEventListeners() {
        // Butoni per lokacionin aktual
        const currentLocationBtn = document.getElementById('current-location-btn');
        if (currentLocationBtn) {
            currentLocationBtn.addEventListener('click', getCurrentLocation);
        }
        
        // Butoni per kerkimin e rruges
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
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke derguar...';
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
        alert('Mesazhi u dergua me sukses!');
        contactForm.reset();
      } else {
        alert(data.error || 'Dergimi deshtoi.');
      }
    } catch (err) {
      alert('Gabim ne lidhje me serverin.');
      console.error(err);
    } finally {
      submitBtn.innerHTML = originalText;
      submitBtn.disabled = false;
    }
  });
}
        
        // Modal per rezultatet e kerkimit
        const modalClose = document.querySelector('.modal-close');
        if (modalClose) {
            modalClose.addEventListener('click', closeModal);
        }
        
        // Mbyll modal kur klikohet jashte
        window.addEventListener('click', function(e) {
            const modal = document.getElementById('search-results-modal');
            if (e.target === modal) {
                closeModal();
            }
        });
    }
    
    // Funksioni per marrjen e lokacionit aktual
    function getCurrentLocation() {
        const fromLocationInput = document.getElementById('from-location');
        
        if (navigator.geolocation) {
            navigator.geolocation.getCurrentPosition(
                function(position) {
                    userLocation = {
                        lat: position.coords.latitude,
                        lng: position.coords.longitude
                    };
                    
                    // Perdor nje sherbim te kundert te geokodimit per te marre emrin e vendndodhjes
                    fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${userLocation.lat}&lon=${userLocation.lng}`)
                        .then(response => response.json())
                        .then(data => {
                            const address = data.display_name || 'Lokacioni juaj aktual';
                            fromLocationInput.value = address;
                            
                            // Shto marker ne harte per lokacionin aktual
                            if (map) {
                                if (userMarker) {
                                    map.removeLayer(userMarker);
                                }
                                
                                userMarker = L.marker([userLocation.lat, userLocation.lng])
                                    .addTo(map)
                                    .bindPopup('<b>Ju jeni ketu</b>')
                                    .openPopup();
                                
                                map.setView([userLocation.lat, userLocation.lng], 15);
                            }
                        })
                        .catch(error => {
                            console.error('Gabim ne marrjen e adreses:', error);
                            fromLocationInput.value = 'Lokacioni juaj aktual';
                        });
                },
                function(error) {
                    console.error('Gabim ne marrjen e lokacionit:', error);
                    alert('Nuk mundi te merret lokacioni juaj. Ju lutem sigurohuni qe keni lejuar aksesin ne lokacion.');
                    fromLocationInput.value = 'Lokacioni nuk eshte i disponueshem';
                }
            );
        } else {
            alert('Shfletuesi juaj nuk mbeshtet gjeolokacionin.');
        }
    }
    
    // Funksioni per kerkimin e rruges
    // Replace the old searchRoute function in script.js
function searchRoute() {
  const fromLocation = document.getElementById('from-location').value.trim();
  const toLocation = document.getElementById('to-location').value.trim();
  
  if (!fromLocation || !toLocation) {
    alert('Ju lutem plotesoni te dyja fushat: vendndodhjen dhe destinacionin.');
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
    
    // Funksioni per shfaqjen e ngarkimit
    function showLoading() {
        const searchBtn = document.getElementById('search-route-btn');
        const originalText = searchBtn.innerHTML;
        
        searchBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke kerkuar...';
        searchBtn.disabled = true;
        
        // Ruaj tekstin origjinal per ta rivendosur me vone
        searchBtn.setAttribute('data-original-text', originalText);
    }
    
    // Funksioni per fshehjen e ngarkimit
    function hideLoading() {
        const searchBtn = document.getElementById('search-route-btn');
        const originalText = searchBtn.getAttribute('data-original-text');
        
        if (originalText) {
            searchBtn.innerHTML = originalText;
        } else {
            searchBtn.innerHTML = '<i class="fas fa-search"></i> Gjej Rrugen';
        }
        
        searchBtn.disabled = false;
    }
    
    // Funksioni per shfaqjen e rezultateve te kerkimit
    function showSearchResults(from, to, option) {
        const modal = document.getElementById('search-results-modal');
        const routeOptionsContainer = document.getElementById('route-options');
        
        // Krijoj rezultate te simulura
        const results = [
            {
                id: 1,
                title: 'Rruga me e shpejte',
                time: '35 min',
                transfers: 1,
                price: '40 Leke',
                steps: [
                    'Ecni 5 minuta deri ne stacionin "Sheshi Shqiponja"',
                    'Merrni autobusin L2 per 20 minuta',
                    'Nda tek stacioni "21 Dhjetori"',
                    'Merrni autobusin L5 per 10 minuta',
                    'Arritni ne destinacion'
                ]
            },
            {
                id: 2,
                title: 'Rruga me me pak nderrime',
                time: '45 min',
                transfers: 0,
                price: '50 Leke',
                steps: [
                    'Ecni 10 minuta deri ne stacionin "Qendra"',
                    'Merrni autobusin L8 per 35 minuta',
                    'Arritni direkt ne destinacion'
                ]
            },
            {
                id: 3,
                title: 'Rruga me e lire',
                time: '55 min',
                transfers: 2,
                price: '30 Leke',
                steps: [
                    'Ecni 3 minuta deri ne stacionin "Pazari i Ri"',
                    'Merrni autobusin L1 per 25 minuta',
                    'Nda tek stacioni "Zogu i Zi"',
                    'Merrni autobusin L3 per 15 minuta',
                    'Nda tek stacioni "Kombinat"',
                    'Merrni autobusin L11 per 12 minuta',
                    'Arritni ne destinacion'
                ]
            }
        ];
        
        // Krijoj HTML per rezultatet
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
                            <span>${route.transfers} nderrime</span>
                        </div>
                        <div class="route-price">${route.price}</div>
                    </div>
                    <div class="route-steps">
                        ${route.steps.map(step => `<div class="route-step"><i class="fas fa-arrow-right"></i> ${step}</div>`).join('')}
                    </div>
                    <button class="btn btn-primary select-route-btn" style="margin-top: 15px; width: 100%;">
                        <i class="fas fa-directions"></i> Zgjidh kete rruge
                    </button>
                </div>
            `;
        });
        
        routeOptionsContainer.innerHTML = html;
        
        // Shto event listener per butonat e zgjedhjes se rruges
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
    
    // Funksioni per zgjedhjen e nje rruge
    function selectRoute(routeId) {
        alert(`Ju zgjodhet rrugen me ID: ${routeId}. Do te ridrejtoheni tek faqja me udhezimet e detajuara.`);
        closeModal();
        
        // Ne nje implementim real, do te ridrejtohej tek faqja e udhezimeve
        // window.location.href = `pages/route-details.html?route=${routeId}`;
    }
    
    // Funksioni per mbylljen e modal
    function closeModal() {
        const modal = document.getElementById('search-results-modal');
        modal.classList.remove('active');
        document.body.style.overflow = 'auto';
    }
    
    // Funksioni per trajtimin e formes se kontaktit
    function handleContactForm(e) {
        e.preventDefault();
        
        // Simuloj dergimin e formes
        showLoadingForm();
        
        // Simuloj vonesen e serverit
        setTimeout(() => {
            hideLoadingForm();
            alert('Mesazhi juaj u dergua me sukses! Do t\'ju kontaktojme se shpejti.');
            e.target.reset();
        }, 2000);
    }
    
    // Funksionet per ngarkimin e formes
    function showLoadingForm() {
        const submitBtn = document.querySelector('#contact-form button[type="submit"]');
        const originalText = submitBtn.innerHTML;
        
        submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Duke derguar...';
        submitBtn.disabled = true;
        submitBtn.setAttribute('data-original-text', originalText);
    }
    
    function hideLoadingForm() {
        const submitBtn = document.querySelector('#contact-form button[type="submit"]');
        const originalText = submitBtn.getAttribute('data-original-text');
        
        if (originalText) {
            submitBtn.innerHTML = originalText;
        } else {
            submitBtn.innerHTML = 'Dergo Mesazhin';
        }
        
        submitBtn.disabled = false;
    }
    
    // Funksioni per animimin e numrave te statistikave
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
    
    // Funksioni per mbylljen e dropdown-eve kur klikohet jashte
    document.addEventListener('click', function(e) {
        if (!e.target.closest('.dropdown')) {
            document.querySelectorAll('.dropdown-menu').forEach(menu => {
                menu.style.opacity = '0';
                menu.style.visibility = 'hidden';
                menu.style.transform = 'translateY(10px)';
            });
        }
    });
    
    // Funksioni per scroll-in e bute tek seksionet
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

// Funksion per inicializimin e autocomplete per lokacionet
function initAutocomplete() {
    const fromInput = document.getElementById('from-location');
    const toInput = document.getElementById('to-location');
    
    if (fromInput && toInput) {
        // Inicializo autocomplete per te dy inputet
        initLocationAutocomplete(fromInput);
        initLocationAutocomplete(toInput);
    }
}

// Funksioni per inicializimin e autocomplete per nje input
function initLocationAutocomplete(input) {
    // Ketu do te implementohet autocomplete me OpenStreetMap Nominatim
    // Per momentin, do te shtojme vetem disa sugjerime te thjeshta
    
    input.addEventListener('input', function() {
        const value = this.value.toLowerCase();
        
        if (value.length < 3) return;
        
        // Sugjerime te thjeshta (ne nje implementim real, do te behej nje kerkese ne server)
        const suggestions = [
            'Sheshi Skenderbej, Tirane',
            'Stacioni i Autobuseve te Jugut, Tirane',
            'Stacioni i Autobuseve te Veriut, Tirane',
            'Aeroporti Nene Tereza, Tirane',
            'Universiteti i Tiranes',
            'Qendra Tregtare TEG, Tirane',
            'Spitali Nene Tereza, Tirane',
            'Parku i Madh, Tirane',
            'Zona e Re, Tirane',
            'Kinema Millenium, Tirane'
        ];
        
        const filtered = suggestions.filter(suggestion => 
            suggestion.toLowerCase().includes(value)
        );
        
        // Krijoj dropdown per sugjerimet (do te implementohet me shume ne versionet e ardhshme)
        if (filtered.length > 0) {
            console.log('Sugjerime per', value, ':', filtered);
        }
    });
}

// Thirr funksionin per autocomplete pasi te ngarkohet faqja
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAutocomplete);
} else {
    initAutocomplete();
}

// Ruaj historikun e kerkimeve ne localStorage
function saveSearchHistory(from, to) {
    const history = JSON.parse(localStorage.getItem('searchHistory')) || [];
    
    // Shto kerkimin e ri ne fillim te historikut
    history.unshift({
        from,
        to,
        timestamp: new Date().toISOString()
    });
    
    // Ruaj vetem 10 kerkimet e fundit
    const limitedHistory = history.slice(0, 10);
    
    localStorage.setItem('searchHistory', JSON.stringify(limitedHistory));
}

// Funksioni per marrjen e historikut te kerkimeve
function getSearchHistory() {
    return JSON.parse(localStorage.getItem('searchHistory')) || [];
}

// Funksioni per pastrimin e historikut te kerkimeve
function clearSearchHistory() {
    localStorage.removeItem('searchHistory');
    alert('Historia e kerkimeve u pastrua.');
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