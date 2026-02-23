(() => {
    'use strict';

    const viewport = document.getElementById('viewport');
    const slideshow = document.getElementById('slideshow');
    let slides = [];
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

    // ===== PROGRESSIVE IMAGE LOADING =====

    // State per <img>: 'none' | 'half' | 'full'
    const imgState = new Map();
    let loadQueue = [];
    let isProcessing = false;
    let queueGeneration = 0;

    function getState(img) {
        return imgState.get(img) || 'none';
    }

    /**
     * Build the loading queue centered on centerIndex.
     * Priority:
     *   1. Current slide: half then full
     *   2. Alternating bands — half coverage first, then nearby fulls:
     *      - half ±1..10, full ±1..3, half ±11..15,
     *        full ±4..9, half ±16..20, full ±10..20
     */
    const BANDS = [
        { res: 'half', from: 1,  to: 10 },
        { res: 'full', from: 1,  to: 3  },
        { res: 'half', from: 11, to: 15 },
        { res: 'full', from: 4,  to: 9  },
        { res: 'half', from: 16, to: 20 },
        { res: 'full', from: 10, to: 20 },
    ];

    function buildQueue(centerIndex) {
        loadQueue = [];
        const n = slides.length;
        const maxD = Math.floor(n / 2);

        // Helper: get slide indices at distance d (wrapping)
        function atDistance(d) {
            const result = [];
            if (d === 0) {
                result.push(centerIndex);
            } else {
                const fwd = (centerIndex + d) % n;
                const bwd = (centerIndex - d + n) % n;
                result.push(fwd);
                if (fwd !== bwd) result.push(bwd);
            }
            return result;
        }

        // Collect imgs for a slide index
        function imgsForSlide(i) {
            return [...slides[i].querySelectorAll('img[data-src-full]')];
        }

        // 1. Current slide: half → full
        for (const img of imgsForSlide(centerIndex)) {
            const st = getState(img);
            if (st === 'none') loadQueue.push({ img, res: 'half' });
            if (st !== 'full') loadQueue.push({ img, res: 'full' });
        }

        // 2. Alternating bands
        for (const band of BANDS) {
            const lo = Math.min(band.from, maxD);
            const hi = Math.min(band.to, maxD);
            for (let d = lo; d <= hi; d++) {
                for (const i of atDistance(d)) {
                    for (const img of imgsForSlide(i)) {
                        if (band.res === 'half' && getState(img) === 'none') {
                            loadQueue.push({ img, res: 'half' });
                        } else if (band.res === 'full' && getState(img) !== 'full') {
                            loadQueue.push({ img, res: 'full' });
                        }
                    }
                }
            }
        }
    }

    function processQueue() {
        if (isProcessing || loadQueue.length === 0) return;

        isProcessing = true;
        const gen = queueGeneration;

        // Find next actionable task
        let task;
        while (loadQueue.length > 0) {
            task = loadQueue.shift();
            const st = getState(task.img);
            // Skip if already done
            if (task.res === 'half' && st !== 'none') { task = null; continue; }
            if (task.res === 'full' && st === 'full') { task = null; continue; }
            break;
        }

        if (!task) {
            isProcessing = false;
            return;
        }

        const url = task.res === 'half'
            ? task.img.dataset.srcHalf
            : task.img.dataset.srcFull;

        if (!url) {
            isProcessing = false;
            processQueue();
            return;
        }

        const loader = new Image();

        loader.onload = () => {
            if (gen !== queueGeneration) { isProcessing = false; return; }

            // Don't downgrade: if full already loaded, skip half
            if (task.res === 'half' && getState(task.img) === 'full') {
                isProcessing = false;
                processQueue();
                return;
            }

            task.img.src = url;
            imgState.set(task.img, task.res);

            isProcessing = false;
            processQueue();
        };

        loader.onerror = () => {
            if (gen !== queueGeneration) { isProcessing = false; return; }

            // Half 404 (legacy image): skip to full
            if (task.res === 'half') {
                loadQueue.unshift({ img: task.img, res: 'full' });
            }

            isProcessing = false;
            processQueue();
        };

        loader.src = url;
    }

    // ===== NAVIGATION =====

    function goTo(index) {
        if (index < 0 || index >= slides.length || index === currentIndex) return;

        slides[currentIndex].classList.remove('active');
        slides[index].classList.add('active');
        currentIndex = index;

        // Rebuild queue from new position
        queueGeneration++;
        buildQueue(index);
        processQueue();
    }

    function goNext() {
        if (slides.length <= 1) return;
        goTo((currentIndex + 1) % slides.length);
    }

    function goPrev() {
        if (slides.length <= 1) return;
        goTo((currentIndex - 1 + slides.length) % slides.length);
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

    // ===== BIND CLICK HANDLERS =====

    function bindNavigation() {
        slideshow.querySelectorAll('.slide--duo').forEach(slide => {
            const leftImg = slide.querySelector('.slide__photo--left img');
            const rightImg = slide.querySelector('.slide__photo--right img');
            if (leftImg) leftImg.addEventListener('click', goPrev);
            if (rightImg) rightImg.addEventListener('click', goNext);
        });

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
        el.className = 'slide slide--' + slideData.layout + (index === 0 ? ' active' : '');
        el.dataset.index = index;

        if (slideData.layout === 'duo') {
            const left = slideData.images.find(function(img) { return img.role === 'left'; });
            const right = slideData.images.find(function(img) { return img.role === 'right'; });

            el.innerHTML =
                '<div class="slide__photo slide__photo--left">' +
                    '<img data-src-half="' + (left ? left.src_half || '' : '') + '" ' +
                         'data-src-full="' + (left ? left.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (left ? left.caption : '') + '</p>' +
                '</div>' +
                '<div class="slide__photo slide__photo--right">' +
                    '<img data-src-half="' + (right ? right.src_half || '' : '') + '" ' +
                         'data-src-full="' + (right ? right.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (right ? right.caption : '') + '</p>' +
                '</div>';
        } else {
            const wide = slideData.images.find(function(img) { return img.role === 'wide'; });

            el.innerHTML =
                '<div class="slide__photo slide__photo--wide">' +
                    '<img data-src-half="' + (wide ? wide.src_half || '' : '') + '" ' +
                         'data-src-full="' + (wide ? wide.src : '') + '" alt="">' +
                    '<p class="slide__caption">' + (wide ? wide.caption : '') + '</p>' +
                '</div>';
        }

        return el;
    }

    // ===== LOAD FIRST SLIDE THEN START QUEUE =====

    function loadFirstSlide(callback) {
        const firstImgs = [...slides[0].querySelectorAll('img[data-src-full]')];
        if (firstImgs.length === 0) { callback(); return; }

        let loaded = 0;
        function onDone() {
            loaded++;
            if (loaded >= firstImgs.length) callback();
        }

        firstImgs.forEach(img => {
            const halfUrl = img.dataset.srcHalf;
            const fullUrl = img.dataset.srcFull;

            function tryFull() {
                if (!fullUrl) { onDone(); return; }
                const fb = new Image();
                fb.onload = () => { img.src = fullUrl; imgState.set(img, 'full'); onDone(); };
                fb.onerror = onDone;
                fb.src = fullUrl;
            }

            if (!halfUrl) { tryFull(); return; }

            const loader = new Image();
            loader.onload = () => { img.src = halfUrl; imgState.set(img, 'half'); onDone(); };
            loader.onerror = tryFull; // half 404 → try full
            loader.src = halfUrl;
        });
    }

    // ===== INIT =====

    async function init() {
        try {
            const res = await fetch('/api/slides');
            const data = await res.json();

            if (!data.slides || data.slides.length === 0) {
                updateLayout();
                return;
            }

            // Build DOM (no images loaded yet)
            data.slides.forEach((slideData, i) => {
                slideshow.appendChild(buildSlideDOM(slideData, i));
            });

            slides = slideshow.querySelectorAll('.slide');
            currentIndex = 0;

            bindNavigation();

            // Load first slide half-res → layout → start full queue
            loadFirstSlide(() => {
                updateLayout();
                buildQueue(0);
                processQueue();
            });

        } catch (err) {
            console.error('Failed to load slides:', err);
            updateLayout();
        }
    }

    init();
})();
