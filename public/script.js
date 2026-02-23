(() => {
    'use strict';

    const viewport = document.getElementById('viewport');
    const slideshow = document.getElementById('slideshow');
    let slides = []; // populated after fetch
    let currentIndex = 0;

    // ===== LAYOUT CALCULATION =====

    function updateLayout() {
        const vw = document.documentElement.clientWidth;
        const vh = document.documentElement.clientHeight;
        const fontSize = parseFloat(getComputedStyle(document.documentElement).fontSize);
        const gap = 0.25 * fontSize;
        const isPortrait = vh > vw;

        if (isPortrait) {
            viewport.style.removeProperty('--photo-h');
            slideshow.style.removeProperty('width');
            return;
        }

        const infoContent = document.querySelector('.info__content');
        const minInfoW = infoContent.offsetWidth + gap * 2;
        const infoW = Math.max(minInfoW, vw * 0.05 + infoContent.offsetWidth + gap);

        const photoArea = vw - infoW;
        const colW = (photoArea - gap) / 2;
        const naturalH = colW * 4 / 3;
        const photoH = Math.min(naturalH, vh * 0.925);

        viewport.style.setProperty('--photo-h', photoH + 'px');
        slideshow.style.width = (colW * 2 + gap) + 'px';
    }

    window.addEventListener('resize', updateLayout);

    // ===== NAVIGATION =====

    function goTo(index) {
        if (index < 0 || index >= slides.length || index === currentIndex) return;

        slides[currentIndex].classList.remove('active');
        slides[index].classList.add('active');
        currentIndex = index;

        prefetchAdjacent(index);
    }

    function goNext() {
        if (slides.length <= 1) return;
        const next = (currentIndex + 1) % slides.length;
        goTo(next);
    }

    function goPrev() {
        if (slides.length <= 1) return;
        const prev = (currentIndex - 1 + slides.length) % slides.length;
        goTo(prev);
    }

    // ===== KEYBOARD =====

    document.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowDown') {
            e.preventDefault();
            goNext();
        } else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') {
            e.preventDefault();
            goPrev();
        }
    });

    // ===== PREFETCH =====

    function prefetchAdjacent(index) {
        if (slides.length <= 1) return;
        const prev = (index - 1 + slides.length) % slides.length;
        const next = (index + 1) % slides.length;
        const toLoad = [...new Set([prev, next])];

        toLoad.forEach(i => {
            const imgs = slides[i].querySelectorAll('img[src]');
            imgs.forEach(img => {
                if (!img.dataset.prefetched) {
                    const preload = new Image();
                    preload.src = img.src;
                    img.dataset.prefetched = '1';
                }
            });
        });
    }

    // ===== BIND CLICK HANDLERS =====

    function bindNavigation() {
        // Duo: left photo = prev, right photo = next
        slideshow.querySelectorAll('.slide--duo').forEach(slide => {
            const leftImg = slide.querySelector('.slide__photo--left img');
            const rightImg = slide.querySelector('.slide__photo--right img');
            if (leftImg) leftImg.addEventListener('click', goPrev);
            if (rightImg) rightImg.addEventListener('click', goNext);
        });

        // Solo: invisible nav zones
        slideshow.querySelectorAll('.slide--solo .slide__photo--wide').forEach(photoWrap => {
            const prevZone = document.createElement('div');
            prevZone.className = 'nav-zone nav-zone--prev';
            prevZone.addEventListener('click', goPrev);

            const nextZone = document.createElement('div');
            nextZone.className = 'nav-zone nav-zone--next';
            nextZone.addEventListener('click', goNext);

            photoWrap.appendChild(prevZone);
            photoWrap.appendChild(nextZone);
        });
    }

    // ===== BUILD SLIDES FROM API DATA =====

    function buildSlideDOM(slideData, index) {
        const el = document.createElement('div');
        el.className = `slide slide--${slideData.layout}${index === 0 ? ' active' : ''}`;
        el.dataset.index = index;

        if (slideData.layout === 'duo') {
            const left = slideData.images.find(img => img.role === 'left');
            const right = slideData.images.find(img => img.role === 'right');

            el.innerHTML =
                '<div class="slide__photo slide__photo--left">' +
                    '<img src="' + (left ? left.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (left ? left.caption : '') + '</p>' +
                '</div>' +
                '<div class="slide__photo slide__photo--right">' +
                    '<img src="' + (right ? right.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (right ? right.caption : '') + '</p>' +
                '</div>';
        } else {
            const wide = slideData.images.find(img => img.role === 'wide');

            el.innerHTML =
                '<div class="slide__photo slide__photo--wide">' +
                    '<img src="' + (wide ? wide.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (wide ? wide.caption : '') + '</p>' +
                '</div>';
        }

        return el;
    }

    // ===== LOAD AND RENDER =====

    async function init() {
        try {
            const res = await fetch('/api/slides');
            const data = await res.json();

            if (!data.slides || data.slides.length === 0) {
                // No slides yet — show nothing
                updateLayout();
                return;
            }

            // Build DOM
            data.slides.forEach((slideData, i) => {
                slideshow.appendChild(buildSlideDOM(slideData, i));
            });

            // Collect slide elements
            slides = slideshow.querySelectorAll('.slide');
            currentIndex = 0;

            // Bind click handlers
            bindNavigation();

            // Wait for first slide images to load, then run layout
            const firstImgs = slides[0].querySelectorAll('img');
            let loaded = 0;
            const total = firstImgs.length;

            if (total === 0) {
                updateLayout();
            } else {
                const onLoad = () => {
                    loaded++;
                    if (loaded >= total) {
                        updateLayout();
                        prefetchAdjacent(0);
                    }
                };
                firstImgs.forEach(img => {
                    if (img.complete) {
                        onLoad();
                    } else {
                        img.addEventListener('load', onLoad);
                        img.addEventListener('error', onLoad);
                    }
                });
            }
        } catch (err) {
            console.error('Failed to load slides:', err);
            updateLayout();
        }
    }

    init();
})();
