(() => {
    'use strict';

    // ===== STATE =====
    let slidesData = [];
    let libraryData = [];
    let currentLayout = 'duo';
    let selectedImages = { left: null, right: null, wide: null };
    let activeSlot = null;
    let editingSlideId = null;

    // ===== DOM REFS =====
    const slidesList = document.getElementById('slides-list');
    const imagesGrid = document.getElementById('images-grid');
    const pickerGrid = document.getElementById('picker-grid');
    const imagePicker = document.getElementById('image-picker');
    const editorTitle = document.getElementById('editor-title');
    const btnSave = document.getElementById('btn-save-slide');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const uploadStatus = document.getElementById('upload-status');

    // ===== API =====
    async function api(url, options = {}) {
        // Bust browser cache on GET requests (API has Cache-Control: max-age=60)
        const method = (options.method || 'GET').toUpperCase();
        if (method === 'GET') {
            const sep = url.includes('?') ? '&' : '?';
            url += sep + '_t=' + Date.now();
        }
        const res = await fetch(url, options);
        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            throw new Error(err.error || 'Request failed');
        }
        return res.json();
    }

    // ===== TOAST =====
    function showToast(message) {
        const existing = document.querySelector('.toast');
        if (existing) existing.remove();

        const toast = document.createElement('div');
        toast.className = 'toast';
        toast.textContent = message;
        toast.style.cssText = 'position:fixed;bottom:2rem;left:50%;transform:translateX(-50%);' +
            'background:#333;color:#fff;padding:0.6rem 1.2rem;border-radius:6px;font-size:13px;' +
            'z-index:999;animation:confirmIn 0.15s ease;';
        document.body.appendChild(toast);
        setTimeout(() => toast.remove(), 3000);
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

    // ===== USED IMAGE IDS =====
    function getUsedImageIds() {
        const used = new Set();
        for (const slide of slidesData) {
            for (const img of slide.images) {
                if (img.image_id) used.add(img.image_id);
            }
        }
        return used;
    }

    // ===== SLIDES =====
    async function loadSlides() {
        const data = await api('/api/slides');
        slidesData = data.slides;
        renderSlides();
    }

    function renderSlides() {
        if (slidesData.length === 0) {
            slidesList.innerHTML = '<div class="empty-state"><p>No slides yet.</p><p>Use the editor to create one.</p></div>';
            return;
        }

        slidesList.innerHTML = '';
        slidesData.forEach((slide, i) => {
            const card = document.createElement('div');
            card.className = 'slide-card' + (editingSlideId === slide.id ? ' slide-card--editing' : '');
            card.dataset.slideId = slide.id;
            card.draggable = true;

            const thumbs = slide.images.map(img => {
                const cls = img.role === 'wide' ? 'slide-card__thumb slide-card__thumb--wide' : 'slide-card__thumb';
                return '<img class="' + cls + '" src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">';
            }).join('');

            const captions = slide.images.map(img => img.caption).filter(Boolean).join(' / ');

            card.innerHTML =
                '<span class="slide-card__handle">&#9776;</span>' +
                '<div class="slide-card__thumbs">' + thumbs + '</div>' +
                '<div class="slide-card__info">' +
                    '<span class="slide-card__type">' + slide.layout + ' #' + (i + 1) + '</span>' +
                    (captions ? '<span class="slide-card__caption">' + captions + '</span>' : '') +
                '</div>' +
                '<div class="slide-card__actions">' +
                    '<button class="btn btn--small btn-edit-slide">edit</button>' +
                    '<button class="btn btn--danger btn--small btn-delete-slide">&times;</button>' +
                '</div>';

            // Edit button
            card.querySelector('.btn-edit-slide').addEventListener('click', (e) => {
                e.stopPropagation();
                editSlide(slide.id);
            });

            // Delete button: first click = "delete?", second click = actual delete
            const delBtn = card.querySelector('.btn-delete-slide');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (delBtn.dataset.armed) {
                    // Second click — do the delete
                    delBtn.textContent = '...';
                    delBtn.disabled = true;
                    api('/api/admin/slides/' + slide.id, { method: 'DELETE' })
                        .then(() => {
                            if (editingSlideId === slide.id) resetEditor();
                            return loadSlides();
                        })
                        .catch(err => {
                            showToast('Error: ' + err.message);
                            delBtn.textContent = '\u00d7';
                            delBtn.disabled = false;
                            delete delBtn.dataset.armed;
                            delBtn.classList.remove('btn-delete-slide--armed');
                        });
                } else {
                    // First click — arm the button
                    delBtn.dataset.armed = '1';
                    delBtn.textContent = 'delete?';
                    delBtn.classList.add('btn-delete-slide--armed');

                    // Auto-disarm after 3 seconds
                    setTimeout(() => {
                        if (delBtn.dataset.armed) {
                            delete delBtn.dataset.armed;
                            delBtn.textContent = '\u00d7';
                            delBtn.classList.remove('btn-delete-slide--armed');
                        }
                    }, 3000);
                }
            });

            slidesList.appendChild(card);
        });

        initDragDrop();
    }

    // ===== EDIT SLIDE =====
    function editSlide(id) {
        const slide = slidesData.find(s => s.id === id);
        if (!slide) return;

        editingSlideId = id;
        currentLayout = slide.layout;
        selectedImages = { left: null, right: null, wide: null };

        for (const img of slide.images) {
            const libImg = libraryData.find(l => l.id === img.image_id);
            if (libImg) {
                selectedImages[img.role] = libImg;
            }
        }

        document.querySelectorAll('.caption-input').forEach(inp => inp.value = '');
        for (const img of slide.images) {
            const input = document.querySelector('.caption-input[data-role="' + img.role + '"]');
            if (input) input.value = img.caption || '';
        }

        updateLayoutPicker();
        updatePreviews();
        imagePicker.style.display = 'none';

        editorTitle.textContent = 'Edit slide #' + (slidesData.indexOf(slide) + 1);
        btnSave.textContent = 'Save changes';
        btnCancel.style.display = '';

        renderSlides();
    }

    function resetEditor() {
        editingSlideId = null;
        currentLayout = 'duo';
        selectedImages = { left: null, right: null, wide: null };
        updateLayoutPicker();
        updatePreviews();
        imagePicker.style.display = 'none';
        document.querySelectorAll('.caption-input').forEach(inp => inp.value = '');

        editorTitle.textContent = 'New slide';
        btnSave.textContent = 'Create slide';
        btnCancel.style.display = 'none';

        renderSlides();
    }

    btnCancel.addEventListener('click', resetEditor);

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

                const cards = [...slidesList.querySelectorAll('.slide-card')];
                const fromIdx = cards.indexOf(draggedCard);
                const toIdx = cards.indexOf(card);

                if (fromIdx < toIdx) {
                    card.after(draggedCard);
                } else {
                    card.before(draggedCard);
                }

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

    // ===== LAYOUT PICKER =====
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
                preview.innerHTML = '<img src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">';
            } else {
                preview.textContent = 'Click to select';
            }
        });
    }

    // ===== IMAGE SLOT CLICK → PICKER =====
    document.querySelectorAll('.image-slot__preview').forEach(preview => {
        preview.addEventListener('click', () => {
            const role = preview.closest('.image-slot').dataset.role;
            activeSlot = role;
            showImagePicker();
        });
    });

    function showImagePicker() {
        renderPicker();
        imagePicker.style.display = '';
    }

    function renderPicker() {
        pickerGrid.innerHTML = '';
        if (libraryData.length === 0) {
            pickerGrid.innerHTML = '<p style="color:#bbb;font-size:12px;">No images. Upload some in Library first.</p>';
            return;
        }

        const usedIds = getUsedImageIds();
        const editingImageIds = new Set();
        if (editingSlideId) {
            const slide = slidesData.find(s => s.id === editingSlideId);
            if (slide) {
                for (const img of slide.images) {
                    if (img.image_id) editingImageIds.add(img.image_id);
                }
            }
        }

        const sorted = [...libraryData].sort((a, b) => a.filename.localeCompare(b.filename));

        sorted.forEach(img => {
            const card = document.createElement('div');
            const isUsed = usedIds.has(img.id) && !editingImageIds.has(img.id);
            card.className = 'image-card' + (isUsed ? ' image-card--used' : '');

            if (selectedImages[activeSlot] && selectedImages[activeSlot].id === img.id) {
                card.classList.add('selected');
            }

            card.innerHTML = '<img src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">';
            card.addEventListener('click', () => {
                selectedImages[activeSlot] = img;
                updatePreviews();
                imagePicker.style.display = 'none';
            });
            pickerGrid.appendChild(card);
        });
    }

    // ===== SAVE SLIDE =====
    btnSave.addEventListener('click', async () => {
        const images = [];

        if (currentLayout === 'duo') {
            if (!selectedImages.left || !selectedImages.right) {
                showToast('Select both images for a duo slide.');
                return;
            }
            images.push({
                role: 'left',
                image_id: selectedImages.left.id,
                caption: document.querySelector('.caption-input[data-role="left"]').value
            });
            images.push({
                role: 'right',
                image_id: selectedImages.right.id,
                caption: document.querySelector('.caption-input[data-role="right"]').value
            });
        } else {
            if (!selectedImages.wide) {
                showToast('Select an image for the solo slide.');
                return;
            }
            images.push({
                role: 'wide',
                image_id: selectedImages.wide.id,
                caption: document.querySelector('.caption-input[data-role="wide"]').value
            });
        }

        try {
            if (editingSlideId) {
                await api('/api/admin/slides/' + editingSlideId, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ layout: currentLayout, images })
                });
                showToast('Slide updated.');
            } else {
                await api('/api/admin/slides', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ layout: currentLayout, images })
                });
                showToast('Slide created.');
            }

            resetEditor();
            await loadSlides();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
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

        const sorted = [...libraryData].sort((a, b) => a.filename.localeCompare(b.filename));

        imagesGrid.innerHTML = '';
        sorted.forEach(img => {
            const card = document.createElement('div');
            card.className = 'image-card';
            card.innerHTML =
                '<img src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">' +
                '<div class="image-card__info">' +
                    '<span class="filename">' + escHtml(img.filename) + '</span>' +
                    img.width + '&times;' + img.height + ' &middot; ' + formatSize(img.size_bytes) +
                '</div>' +
                '<button class="image-card__delete">&times;</button>';

            // Same two-click pattern for library delete
            const delBtn = card.querySelector('.image-card__delete');
            delBtn.addEventListener('click', (e) => {
                e.stopPropagation();

                if (delBtn.dataset.armed) {
                    delBtn.textContent = '...';
                    delBtn.disabled = true;
                    api('/api/admin/images/' + img.id, { method: 'DELETE' })
                        .then(() => loadLibrary())
                        .catch(err => {
                            showToast(err.message);
                            delBtn.textContent = '\u00d7';
                            delBtn.disabled = false;
                            delete delBtn.dataset.armed;
                        });
                } else {
                    delBtn.dataset.armed = '1';
                    delBtn.textContent = 'delete?';
                    delBtn.style.width = 'auto';
                    delBtn.style.borderRadius = '4px';
                    delBtn.style.padding = '2px 8px';
                    delBtn.style.display = 'flex';

                    setTimeout(() => {
                        if (delBtn.dataset.armed) {
                            delete delBtn.dataset.armed;
                            delBtn.textContent = '\u00d7';
                            delBtn.removeAttribute('style');
                        }
                    }, 3000);
                }
            });

            imagesGrid.appendChild(card);
        });
    }

    function formatSize(bytes) {
        if (!bytes) return '0 B';
        if (bytes < 1024) return bytes + ' B';
        if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(0) + ' KB';
        return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    function escHtml(str) {
        const d = document.createElement('div');
        d.textContent = str;
        return d.innerHTML;
    }

    // ===== UPLOAD =====
    document.getElementById('btn-upload').addEventListener('click', () => {
        document.getElementById('file-input').click();
    });

    document.getElementById('file-input').addEventListener('change', async (e) => {
        const files = [...e.target.files];
        if (files.length === 0) return;

        for (let i = 0; i < files.length; i++) {
            uploadStatus.textContent = 'Uploading ' + (i + 1) + '/' + files.length + '...';
            try {
                await uploadImage(files[i]);
            } catch (err) {
                showToast('Error uploading ' + files[i].name + ': ' + err.message);
            }
        }

        uploadStatus.textContent = '';
        showToast(files.length + ' image' + (files.length > 1 ? 's' : '') + ' uploaded.');

        e.target.value = '';
        await loadLibrary();
    });

    async function uploadImage(file) {
        const [full, half] = await Promise.all([
            resizeImage(file, 1600, 0.80),
            resizeImage(file, 800, 0.80)
        ]);

        const formData = new FormData();
        formData.append('image', full.blob, file.name);
        formData.append('image_half', half.blob, file.name);
        formData.append('width', full.width);
        formData.append('height', full.height);
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
    async function init() {
        await Promise.all([loadSlides(), loadLibrary()]);
    }

    init();
})();
