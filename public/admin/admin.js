(() => {
    'use strict';

    // ===== STATE =====
    let slidesData = [];
    let libraryData = [];
    let currentLayout = 'duo';
    let selectedImages = { left: null, right: null, wide: null };
    let activeSlot = null; // which slot is being filled

    // ===== DOM REFS =====
    const slidesList = document.getElementById('slides-list');
    const imagesGrid = document.getElementById('images-grid');
    const modal = document.getElementById('modal-slide');
    const pickerGrid = document.getElementById('picker-grid');
    const imagePicker = document.getElementById('image-picker');

    // ===== API HELPERS =====

    async function api(url, options = {}) {
        const res = await fetch(url, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Request failed');
        }
        return res.json();
    }

    // ===== VIEWS =====

    document.querySelectorAll('.tab').forEach(tab => {
        tab.addEventListener('click', () => {
            document.querySelectorAll('.tab').forEach(t => t.classList.remove('tab--active'));
            tab.classList.add('tab--active');
            document.querySelectorAll('.view').forEach(v => v.style.display = 'none');
            document.getElementById('view-' + tab.dataset.view).style.display = '';
        });
    });

    // ===== SLIDES =====

    async function loadSlides() {
        const data = await api('/api/slides');
        slidesData = data.slides;
        renderSlides();
    }

    function renderSlides() {
        if (slidesData.length === 0) {
            slidesList.innerHTML = '<div class="empty-state"><p>No slides yet.</p><p>Click "+ New slide" to create one.</p></div>';
            return;
        }

        slidesList.innerHTML = '';
        slidesData.forEach((slide, i) => {
            const card = document.createElement('div');
            card.className = 'slide-card';
            card.dataset.slideId = slide.id;
            card.draggable = true;

            const thumbs = slide.images.map(img => {
                const cls = img.role === 'wide' ? 'slide-card__thumb slide-card__thumb--wide' : 'slide-card__thumb';
                return '<img class="' + cls + '" src="' + img.src + '" alt="">';
            }).join('');

            const captions = slide.images.map(img => img.caption).filter(Boolean).join(' / ');

            card.innerHTML =
                '<span class="slide-card__handle">&#9776;</span>' +
                '<div class="slide-card__thumbs">' + thumbs + '</div>' +
                '<div class="slide-card__info">' +
                    '<span class="slide-card__type">' + slide.layout + ' — #' + (i + 1) + '</span>' +
                    (captions ? '<span class="slide-card__caption">' + captions + '</span>' : '') +
                '</div>' +
                '<div class="slide-card__actions">' +
                    '<button class="btn btn--danger btn--small btn-delete-slide" data-id="' + slide.id + '">&times;</button>' +
                '</div>';

            slidesList.appendChild(card);
        });

        // Delete buttons
        slidesList.querySelectorAll('.btn-delete-slide').forEach(btn => {
            btn.addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this slide?')) return;
                await api('/api/admin/slides/' + btn.dataset.id, { method: 'DELETE' });
                await loadSlides();
            });
        });

        // Drag and drop
        initDragDrop();
    }

    // ===== DRAG AND DROP =====

    function initDragDrop() {
        let draggedCard = null;

        slidesList.querySelectorAll('.slide-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                draggedCard = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                slidesList.querySelectorAll('.slide-card').forEach(c => c.classList.remove('drag-over'));
                draggedCard = null;
            });

            card.addEventListener('dragover', (e) => {
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (draggedCard && card !== draggedCard) {
                    card.classList.add('drag-over');
                }
            });

            card.addEventListener('dragleave', () => {
                card.classList.remove('drag-over');
            });

            card.addEventListener('drop', async (e) => {
                e.preventDefault();
                card.classList.remove('drag-over');
                if (!draggedCard || card === draggedCard) return;

                // Reorder in DOM
                const cards = [...slidesList.querySelectorAll('.slide-card')];
                const fromIdx = cards.indexOf(draggedCard);
                const toIdx = cards.indexOf(card);

                if (fromIdx < toIdx) {
                    card.after(draggedCard);
                } else {
                    card.before(draggedCard);
                }

                // Save new order
                const newOrder = [...slidesList.querySelectorAll('.slide-card')].map(c => c.dataset.slideId);
                await api('/api/admin/slides', {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ order: newOrder })
                });

                await loadSlides();
            });
        });
    }

    // ===== NEW SLIDE MODAL =====

    document.getElementById('btn-new-slide').addEventListener('click', () => {
        selectedImages = { left: null, right: null, wide: null };
        currentLayout = 'duo';
        updateLayoutPicker();
        updatePreviews();
        modal.style.display = '';
        imagePicker.style.display = 'none';
        modal.querySelectorAll('.caption-input').forEach(inp => inp.value = '');
    });

    document.getElementById('btn-cancel-slide').addEventListener('click', closeModal);
    modal.querySelector('.modal__backdrop').addEventListener('click', closeModal);

    function closeModal() {
        modal.style.display = 'none';
    }

    // Layout picker
    document.querySelectorAll('.layout-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            currentLayout = btn.dataset.layout;
            selectedImages = { left: null, right: null, wide: null };
            updateLayoutPicker();
            updatePreviews();
        });
    });

    function updateLayoutPicker() {
        document.querySelectorAll('.layout-btn').forEach(b => b.classList.remove('layout-btn--active'));
        document.querySelector('.layout-btn[data-layout="' + currentLayout + '"]').classList.add('layout-btn--active');
        document.getElementById('slot-duo').style.display = currentLayout === 'duo' ? '' : 'none';
        document.getElementById('slot-solo').style.display = currentLayout === 'solo' ? '' : 'none';
    }

    function updatePreviews() {
        ['left', 'right', 'wide'].forEach(role => {
            const preview = document.getElementById('preview-' + role);
            if (!preview) return;
            const img = selectedImages[role];
            if (img) {
                preview.innerHTML = '<img src="' + img.src + '" alt="">';
            } else {
                preview.textContent = 'Click to select image';
            }
        });
    }

    // Image slot click → open picker
    document.querySelectorAll('.image-slot__preview').forEach(preview => {
        preview.addEventListener('click', () => {
            const role = preview.closest('.image-slot').dataset.role;
            activeSlot = role;
            showImagePicker();
        });
    });

    async function showImagePicker() {
        if (libraryData.length === 0) {
            await loadLibrary();
        }
        renderPicker();
        imagePicker.style.display = '';
    }

    function renderPicker() {
        pickerGrid.innerHTML = '';
        if (libraryData.length === 0) {
            pickerGrid.innerHTML = '<p style="color:#999;">No images. Upload some first.</p>';
            return;
        }
        libraryData.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            if (selectedImages[activeSlot] && selectedImages[activeSlot].id === img.id) {
                card.classList.add('selected');
            }
            card.innerHTML = '<img src="' + img.src + '" alt="">';
            card.addEventListener('click', () => {
                selectedImages[activeSlot] = img;
                updatePreviews();
                imagePicker.style.display = 'none';
            });
            pickerGrid.appendChild(card);
        });
    }

    // Save slide
    document.getElementById('btn-save-slide').addEventListener('click', async () => {
        const images = [];

        if (currentLayout === 'duo') {
            if (!selectedImages.left || !selectedImages.right) {
                alert('Select both images for a duo slide.');
                return;
            }
            images.push({
                role: 'left',
                image_id: selectedImages.left.id,
                caption: modal.querySelector('.caption-input[data-role="left"]').value
            });
            images.push({
                role: 'right',
                image_id: selectedImages.right.id,
                caption: modal.querySelector('.caption-input[data-role="right"]').value
            });
        } else {
            if (!selectedImages.wide) {
                alert('Select an image for the solo slide.');
                return;
            }
            images.push({
                role: 'wide',
                image_id: selectedImages.wide.id,
                caption: modal.querySelector('.caption-input[data-role="wide"]').value
            });
        }

        await api('/api/admin/slides', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ layout: currentLayout, images })
        });

        closeModal();
        await loadSlides();
    });

    // ===== IMAGE LIBRARY =====

    async function loadLibrary() {
        const data = await api('/api/admin/images');
        libraryData = data.images;
        renderLibrary();
    }

    function renderLibrary() {
        if (libraryData.length === 0) {
            imagesGrid.innerHTML = '<div class="empty-state"><p>No images uploaded yet.</p></div>';
            return;
        }

        imagesGrid.innerHTML = '';
        libraryData.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.innerHTML =
                '<img src="' + img.src + '" alt="">' +
                '<div class="image-card__info">' + img.width + '&times;' + img.height + ' &middot; ' + formatSize(img.size_bytes) + '</div>' +
                '<button class="image-card__delete" data-id="' + img.id + '">&times;</button>';

            card.querySelector('.image-card__delete').addEventListener('click', async (e) => {
                e.stopPropagation();
                if (!confirm('Delete this image?')) return;
                try {
                    await api('/api/admin/images/' + img.id, { method: 'DELETE' });
                    await loadLibrary();
                } catch (err) {
                    alert(err.message);
                }
            });

            imagesGrid.appendChild(card);
        });
    }

    function formatSize(bytes) {
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // ===== UPLOAD =====

    document.getElementById('btn-upload').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        if (files.length === 0) return;

        for (const file of files) {
            await uploadImage(file);
        }

        e.target.value = '';
        await loadLibrary();
    });

    async function uploadImage(file) {
        // Resize client-side
        const { blob, width, height } = await resizeImage(file, 1600, 0.80);

        const formData = new FormData();
        formData.append('image', blob, file.name);
        formData.append('width', width);
        formData.append('height', height);
        formData.append('filename', file.name);

        await api('/api/admin/images', { method: 'POST', body: formData });
    }

    function resizeImage(file, shortSide, quality) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);

            img.onload = () => {
                URL.revokeObjectURL(url);

                let w = img.naturalWidth;
                let h = img.naturalHeight;

                // Calculate target dimensions: short side = shortSide px
                const minDim = Math.min(w, h);
                if (minDim > shortSide) {
                    const scale = shortSide / minDim;
                    w = Math.round(w * scale);
                    h = Math.round(h * scale);
                }

                const canvas = document.createElement('canvas');
                canvas.width = w;
                canvas.height = h;

                const ctx = canvas.getContext('2d');
                ctx.imageSmoothingEnabled = true;
                ctx.imageSmoothingQuality = 'high';
                ctx.drawImage(img, 0, 0, w, h);

                canvas.toBlob(
                    (blob) => resolve({ blob, width: w, height: h }),
                    'image/jpeg',
                    quality
                );
            };

            img.onerror = reject;
            img.src = url;
        });
    }

    // ===== INIT =====

    loadSlides();
    loadLibrary();
})();
