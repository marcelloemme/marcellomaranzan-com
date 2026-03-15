(() => {
    'use strict';

    // ===== STATE =====
    let slidesData = [];
    let libraryData = [];
    let allLibraryData = [];
    let currentLayout = 'duo';
    let selectedImages = { left: null, right: null, wide: null };
    let editingSlideId = null;
    let selectionMode = false;
    let selectedLibraryIds = new Set();
    let lastClickedIndex = -1;
    let currentFolderId = null;  // null = root (library view)
    let foldersData = [];
    let breadcrumbData = [];
    let browserFolderId = null;  // remembers folder in browser panel (slides view)
    let hideUsedImages = false;  // toggle to hide "in use" images in browser

    // ===== DOM REFS =====
    const slidesList = document.getElementById('slides-list');
    const imagesGrid = document.getElementById('images-grid');
    const browserGrid = document.getElementById('browser-grid');
    const editorTitle = document.getElementById('editor-title');
    const btnSave = document.getElementById('btn-save-slide');
    const btnCancel = document.getElementById('btn-cancel-edit');
    const uploadStatus = document.getElementById('upload-status');

    // ===== API =====
    async function api(url, options = {}) {
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
                    delBtn.dataset.armed = '1';
                    delBtn.textContent = 'delete?';
                    delBtn.classList.add('btn-delete-slide--armed');

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

        initSlideDragDrop();
    }

    // ===== EDIT SLIDE =====
    function editSlide(id) {
        const slide = slidesData.find(s => s.id === id);
        if (!slide) return;

        editingSlideId = id;
        currentLayout = slide.layout;
        selectedImages = { left: null, right: null, wide: null };

        for (const img of slide.images) {
            const libImg = allLibraryData.find(l => l.id === img.image_id);
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

        editorTitle.textContent = 'Edit slide #' + (slidesData.indexOf(slide) + 1);
        btnSave.textContent = 'Save changes';
        btnCancel.style.display = '';

        renderSlides();
        renderBrowser(); // refresh "in use" state
    }

    function resetEditor() {
        editingSlideId = null;
        currentLayout = 'duo';
        selectedImages = { left: null, right: null, wide: null };
        updateLayoutPicker();
        updatePreviews();
        document.querySelectorAll('.caption-input').forEach(inp => inp.value = '');

        editorTitle.textContent = 'New slide';
        btnSave.textContent = 'Create slide';
        btnCancel.style.display = 'none';

        renderSlides();
        renderBrowser();
    }

    btnCancel.addEventListener('click', resetEditor);

    // ===== SLIDE DRAG AND DROP (reorder) =====
    function initSlideDragDrop() {
        let draggedCard = null;

        slidesList.querySelectorAll('.slide-card').forEach(card => {
            card.addEventListener('dragstart', (e) => {
                // Only allow slide reorder if not dragging from browser
                if (e.dataTransfer.types.includes('application/x-image-id')) return;
                draggedCard = card;
                card.classList.add('dragging');
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('text/plain', 'slide-reorder');
            });

            card.addEventListener('dragend', () => {
                card.classList.remove('dragging');
                slidesList.querySelectorAll('.slide-card').forEach(c => c.classList.remove('drag-over'));
                draggedCard = null;
            });

            card.addEventListener('dragover', (e) => {
                if (!draggedCard) return;
                e.preventDefault();
                e.dataTransfer.dropEffect = 'move';
                if (card !== draggedCard) {
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
                preview.textContent = 'Drop image here';
            }
        });
    }

    // ===== DROP ZONES (image slots accept drops) =====
    function initDropZones() {
        document.querySelectorAll('.image-slot__preview').forEach(preview => {
            const role = preview.closest('.image-slot').dataset.role;

            preview.addEventListener('dragover', (e) => {
                if (e.dataTransfer.types.includes('application/x-image-id')) {
                    e.preventDefault();
                    e.dataTransfer.dropEffect = 'copy';
                    preview.classList.add('drop-hover');
                }
            });

            preview.addEventListener('dragleave', () => {
                preview.classList.remove('drop-hover');
            });

            preview.addEventListener('drop', (e) => {
                e.preventDefault();
                preview.classList.remove('drop-hover');

                const imageId = e.dataTransfer.getData('application/x-image-id');
                if (!imageId) return;

                // Find the image in allLibraryData
                const img = allLibraryData.find(i => i.id === imageId);
                if (!img) return;

                selectedImages[role] = img;
                updatePreviews();
                renderBrowser(); // refresh selected state
            });

            // Also allow clicking to remove
            preview.addEventListener('click', () => {
                if (selectedImages[role]) {
                    selectedImages[role] = null;
                    updatePreviews();
                    renderBrowser();
                }
            });
        });
    }

    initDropZones();

    // ===== BROWSER PANEL (right column in slides view) =====
    async function loadBrowser() {
        const folderParam = browserFolderId || 'root';
        const [imgData, folderData] = await Promise.all([
            api('/api/admin/images?folder_id=' + folderParam),
            api('/api/admin/folders?parent_id=' + (browserFolderId || ''))
        ]);

        // Store for browser rendering
        browserGrid._images = imgData.images;
        browserGrid._folders = folderData.folders;
        browserGrid._breadcrumb = folderData.breadcrumb;

        renderBrowser();
    }

    function renderBrowser() {
        const images = browserGrid._images || [];
        const folders = browserGrid._folders || [];
        const breadcrumb = browserGrid._breadcrumb || [];

        browserGrid.innerHTML = '';

        // Breadcrumb
        const breadcrumbEl = document.createElement('div');
        breadcrumbEl.className = 'browser-breadcrumb';
        const rootLink = document.createElement('span');
        rootLink.className = 'breadcrumb__item' + (!browserFolderId ? ' breadcrumb__item--current' : '');
        rootLink.textContent = 'All';
        if (browserFolderId) {
            rootLink.addEventListener('click', () => { browserFolderId = null; loadBrowser(); });
        }
        breadcrumbEl.appendChild(rootLink);

        for (const crumb of breadcrumb) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb__sep';
            sep.textContent = ' / ';
            breadcrumbEl.appendChild(sep);

            const link = document.createElement('span');
            const isLast = crumb.id === browserFolderId;
            link.className = 'breadcrumb__item' + (isLast ? ' breadcrumb__item--current' : '');
            link.textContent = crumb.name;
            if (!isLast) {
                link.addEventListener('click', () => { browserFolderId = crumb.id; loadBrowser(); });
            }
            breadcrumbEl.appendChild(link);
        }
        browserGrid.appendChild(breadcrumbEl);

        // Folder cards
        if (folders.length > 0) {
            const foldersRow = document.createElement('div');
            foldersRow.className = 'browser-folders-row';
            folders.forEach(f => {
                const btn = document.createElement('div');
                btn.className = 'browser-folder';
                btn.innerHTML = '<span class="folder-card__icon">&#128193;</span> ' + escHtml(f.name);
                btn.addEventListener('click', () => { browserFolderId = f.id; loadBrowser(); });
                foldersRow.appendChild(btn);
            });
            browserGrid.appendChild(foldersRow);
        }

        // Images
        if (images.length === 0 && folders.length === 0) {
            browserGrid.innerHTML += '<p style="color:#bbb;font-size:12px;text-align:center;padding:1rem;">Empty folder.</p>';
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

        // Which images are currently selected in slots
        const slotImageIds = new Set();
        for (const role of ['left', 'right', 'wide']) {
            if (selectedImages[role]) slotImageIds.add(selectedImages[role].id);
        }

        // Filter out PDFs (can't be used in slides) and optionally used images
        let sorted = [...images]
            .filter(img => img.file_type !== 'pdf')
            .sort((a, b) => a.filename.localeCompare(b.filename));

        if (hideUsedImages) {
            sorted = sorted.filter(img => !usedIds.has(img.id) || editingImageIds.has(img.id));
        }

        const imgsContainer = document.createElement('div');
        imgsContainer.className = 'browser-images';

        sorted.forEach(img => {
            const card = document.createElement('div');
            const isUsed = usedIds.has(img.id) && !editingImageIds.has(img.id);
            const isInSlot = slotImageIds.has(img.id);
            card.className = 'image-card' + (isUsed ? ' image-card--used' : '') + (isInSlot ? ' selected' : '');
            card.draggable = true;

            card.innerHTML = '<img src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">';

            // Drag start: set image ID
            card.addEventListener('dragstart', (e) => {
                e.dataTransfer.setData('application/x-image-id', img.id);
                e.dataTransfer.effectAllowed = 'copy';

                // Custom drag image
                const ghost = document.createElement('div');
                ghost.style.cssText = 'position:absolute;top:-9999px;width:60px;height:60px;overflow:hidden;border-radius:4px;';
                const ghostImg = document.createElement('img');
                ghostImg.src = img.src_half || img.src;
                ghostImg.style.cssText = 'width:60px;height:60px;object-fit:cover;';
                ghost.appendChild(ghostImg);
                document.body.appendChild(ghost);
                e.dataTransfer.setDragImage(ghost, 30, 30);
                setTimeout(() => ghost.remove(), 0);
            });

            imgsContainer.appendChild(card);
        });

        browserGrid.appendChild(imgsContainer);
    }

    // ===== SAVE SLIDE =====
    btnSave.addEventListener('click', async () => {
        const images = [];

        if (currentLayout === 'duo') {
            if (!selectedImages.left && !selectedImages.right) {
                showToast('Select at least one image for a duo slide.');
                return;
            }
            if (selectedImages.left) {
                images.push({
                    role: 'left',
                    image_id: selectedImages.left.id,
                    caption: document.querySelector('.caption-input[data-role="left"]').value
                });
            }
            if (selectedImages.right) {
                images.push({
                    role: 'right',
                    image_id: selectedImages.right.id,
                    caption: document.querySelector('.caption-input[data-role="right"]').value
                });
            }
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
            renderBrowser(); // refresh "in use" overlay
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    });

    // ===== IMAGE LIBRARY =====
    const btnSelectMode = document.getElementById('btn-select-mode');
    const btnDeleteSelected = document.getElementById('btn-delete-selected');
    const btnMoveSelected = document.getElementById('btn-move-selected');
    const btnNewFolder = document.getElementById('btn-new-folder');
    const selectCount = document.getElementById('select-count');

    btnNewFolder.addEventListener('click', () => {
        let foldersRow = imagesGrid.querySelector('.folders-row');
        if (!foldersRow) {
            foldersRow = document.createElement('div');
            foldersRow.className = 'folders-row';
            const breadcrumb = imagesGrid.querySelector('.breadcrumb');
            if (breadcrumb) {
                breadcrumb.after(foldersRow);
            } else {
                imagesGrid.prepend(foldersRow);
            }
        }

        if (foldersRow.querySelector('.folder-card--new')) return;

        const newCard = document.createElement('div');
        newCard.className = 'folder-card folder-card--new';
        newCard.innerHTML = '<span class="folder-card__icon">&#128193;</span>';
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'folder-card__rename-input';
        input.placeholder = 'Folder name';
        newCard.appendChild(input);
        foldersRow.appendChild(newCard);
        input.focus();

        let done = false;
        const doCreate = async () => {
            if (done) return;
            done = true;
            const name = input.value.trim();
            if (!name) {
                newCard.remove();
                return;
            }
            try {
                await api('/api/admin/folders', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ name, parent_id: currentFolderId })
                });
                showToast('Folder created.');
                await loadLibrary();
            } catch (err) {
                showToast('Error: ' + err.message);
                newCard.remove();
            }
        };

        input.addEventListener('keydown', (ev) => {
            if (ev.key === 'Enter') { ev.preventDefault(); doCreate(); }
            if (ev.key === 'Escape') { done = true; newCard.remove(); }
        });
        input.addEventListener('blur', doCreate);
    });

    async function loadLibrary() {
        const folderParam = currentFolderId || 'root';
        const [imgData, folderData] = await Promise.all([
            api('/api/admin/images?folder_id=' + folderParam),
            api('/api/admin/folders?parent_id=' + (currentFolderId || ''))
        ]);
        libraryData = imgData.images;
        foldersData = folderData.folders;
        breadcrumbData = folderData.breadcrumb;

        // Also load ALL images (no folder filter) for reference
        const allData = await api('/api/admin/images');
        allLibraryData = allData.images;

        renderLibrary();
    }

    function navigateToFolder(folderId) {
        currentFolderId = folderId;
        exitSelectionMode();
        loadLibrary();
    }

    function exitSelectionMode() {
        selectionMode = false;
        selectedLibraryIds.clear();
        lastClickedIndex = -1;
        btnSelectMode.textContent = 'Select';
        btnSelectMode.classList.remove('btn--primary');
        btnDeleteSelected.style.display = 'none';
        btnMoveSelected.style.display = 'none';
        selectCount.style.display = 'none';
        closeMoveDropdown();
        renderLibrary();
    }

    function updateSelectionUI() {
        const n = selectedLibraryIds.size;
        if (n > 0) {
            btnDeleteSelected.style.display = '';
            btnMoveSelected.style.display = '';
            selectCount.style.display = '';
            selectCount.textContent = n + ' selected';
        } else {
            btnDeleteSelected.style.display = 'none';
            btnMoveSelected.style.display = 'none';
            selectCount.style.display = 'none';
        }
    }

    // Move dropdown
    function closeMoveDropdown() {
        const existing = document.querySelector('.move-dropdown');
        if (existing) existing.remove();
    }

    btnMoveSelected.addEventListener('click', async () => {
        if (document.querySelector('.move-dropdown')) {
            closeMoveDropdown();
            return;
        }

        const allFolders = [];
        async function fetchFolders(parentId, depth) {
            const param = parentId || '';
            const data = await api('/api/admin/folders?parent_id=' + param);
            for (const f of data.folders) {
                allFolders.push({ ...f, depth });
                await fetchFolders(f.id, depth + 1);
            }
        }
        await fetchFolders(null, 0);

        const dropdown = document.createElement('div');
        dropdown.className = 'move-dropdown';

        const rootOpt = document.createElement('div');
        rootOpt.className = 'move-dropdown__item' + (!currentFolderId ? ' move-dropdown__item--current' : '');
        rootOpt.textContent = 'Library (root)';
        rootOpt.addEventListener('click', () => moveSelectedTo(null));
        dropdown.appendChild(rootOpt);

        allFolders.forEach(f => {
            const opt = document.createElement('div');
            opt.className = 'move-dropdown__item' + (f.id === currentFolderId ? ' move-dropdown__item--current' : '');
            opt.style.paddingLeft = (12 + f.depth * 16) + 'px';
            opt.textContent = f.name;
            opt.addEventListener('click', () => moveSelectedTo(f.id));
            dropdown.appendChild(opt);
        });

        btnMoveSelected.parentElement.appendChild(dropdown);

        setTimeout(() => {
            document.addEventListener('click', function closeHandler(e) {
                if (!dropdown.contains(e.target) && e.target !== btnMoveSelected) {
                    closeMoveDropdown();
                    document.removeEventListener('click', closeHandler);
                }
            });
        }, 0);
    });

    async function moveSelectedTo(folderId) {
        closeMoveDropdown();
        const ids = [...selectedLibraryIds];
        try {
            await api('/api/admin/images', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ image_ids: ids, folder_id: folderId })
            });
            showToast(ids.length + ' image' + (ids.length > 1 ? 's' : '') + ' moved.');
            exitSelectionMode();
            await loadLibrary();
        } catch (err) {
            showToast('Error: ' + err.message);
        }
    }

    btnSelectMode.addEventListener('click', () => {
        if (selectionMode) {
            exitSelectionMode();
        } else {
            selectionMode = true;
            btnSelectMode.textContent = 'Cancel';
            btnSelectMode.classList.add('btn--primary');
            renderLibrary();
        }
    });

    btnDeleteSelected.addEventListener('click', () => {
        if (selectedLibraryIds.size === 0) return;

        if (btnDeleteSelected.dataset.armed) {
            const ids = [...selectedLibraryIds];
            btnDeleteSelected.textContent = 'Deleting...';
            btnDeleteSelected.disabled = true;

            Promise.all(ids.map(id => api('/api/admin/images/' + id, { method: 'DELETE' }).catch(() => null)))
                .then(() => {
                    showToast(ids.length + ' file' + (ids.length > 1 ? 's' : '') + ' deleted.');
                    exitSelectionMode();
                    return loadLibrary();
                })
                .catch(err => {
                    showToast('Error: ' + err.message);
                })
                .finally(() => {
                    delete btnDeleteSelected.dataset.armed;
                    btnDeleteSelected.textContent = 'Delete selected';
                    btnDeleteSelected.disabled = false;
                });
        } else {
            btnDeleteSelected.dataset.armed = '1';
            btnDeleteSelected.textContent = 'Confirm delete (' + selectedLibraryIds.size + ')';
            btnDeleteSelected.classList.add('btn-delete-selected--armed');

            setTimeout(() => {
                if (btnDeleteSelected.dataset.armed) {
                    delete btnDeleteSelected.dataset.armed;
                    btnDeleteSelected.textContent = 'Delete selected';
                    btnDeleteSelected.classList.remove('btn-delete-selected--armed');
                }
            }, 4000);
        }
    });

    function renderLibrary() {
        imagesGrid.innerHTML = '';

        // Breadcrumb
        const breadcrumbEl = document.createElement('div');
        breadcrumbEl.className = 'breadcrumb';
        const rootLink = document.createElement('span');
        rootLink.className = 'breadcrumb__item' + (!currentFolderId ? ' breadcrumb__item--current' : '');
        rootLink.textContent = 'Library';
        if (currentFolderId) {
            rootLink.addEventListener('click', () => navigateToFolder(null));
        }
        breadcrumbEl.appendChild(rootLink);

        for (const crumb of breadcrumbData) {
            const sep = document.createElement('span');
            sep.className = 'breadcrumb__sep';
            sep.textContent = ' / ';
            breadcrumbEl.appendChild(sep);

            const link = document.createElement('span');
            const isLast = crumb.id === currentFolderId;
            link.className = 'breadcrumb__item' + (isLast ? ' breadcrumb__item--current' : '');
            link.textContent = crumb.name;
            if (!isLast) {
                link.addEventListener('click', () => navigateToFolder(crumb.id));
            }
            breadcrumbEl.appendChild(link);
        }
        imagesGrid.appendChild(breadcrumbEl);

        // Folder cards
        if (foldersData.length > 0 || !selectionMode) {
            const foldersRow = document.createElement('div');
            foldersRow.className = 'folders-row';

            foldersData.forEach(folder => {
                const card = document.createElement('div');
                card.className = 'folder-card';

                card.innerHTML =
                    '<span class="folder-card__icon">&#128193;</span>' +
                    '<span class="folder-card__name">' + escHtml(folder.name) + '</span>' +
                    '<div class="folder-card__actions">' +
                        '<button class="folder-card__btn folder-card__rename" title="Rename">&#9998;</button>' +
                        '<button class="folder-card__btn folder-card__delete" title="Delete">&times;</button>' +
                    '</div>';

                card.addEventListener('click', (e) => {
                    if (e.target.closest('.folder-card__actions')) return;
                    navigateToFolder(folder.id);
                });

                // Rename
                card.querySelector('.folder-card__rename').addEventListener('click', (e) => {
                    e.stopPropagation();
                    const nameEl = card.querySelector('.folder-card__name');
                    const input = document.createElement('input');
                    input.type = 'text';
                    input.className = 'folder-card__rename-input';
                    input.value = folder.name;
                    nameEl.replaceWith(input);
                    input.focus();
                    input.select();

                    const doRename = async () => {
                        const newName = input.value.trim();
                        if (!newName || newName === folder.name) {
                            input.replaceWith(nameEl);
                            return;
                        }
                        try {
                            await api('/api/admin/folders/' + folder.id, {
                                method: 'PUT',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ name: newName })
                            });
                            await loadLibrary();
                        } catch (err) {
                            showToast('Error: ' + err.message);
                            input.replaceWith(nameEl);
                        }
                    };

                    input.addEventListener('keydown', (ev) => {
                        if (ev.key === 'Enter') doRename();
                        if (ev.key === 'Escape') input.replaceWith(nameEl);
                    });
                    input.addEventListener('blur', doRename);
                });

                // Delete folder
                const delBtn = card.querySelector('.folder-card__delete');
                delBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    if (delBtn.dataset.armed) {
                        api('/api/admin/folders/' + folder.id, { method: 'DELETE' })
                            .then(() => loadLibrary())
                            .catch(err => showToast('Error: ' + err.message));
                    } else {
                        delBtn.dataset.armed = '1';
                        delBtn.textContent = 'delete?';
                        delBtn.style.width = 'auto';
                        delBtn.style.padding = '2px 8px';
                        setTimeout(() => {
                            if (delBtn.dataset.armed) {
                                delete delBtn.dataset.armed;
                                delBtn.innerHTML = '&times;';
                                delBtn.removeAttribute('style');
                            }
                        }, 3000);
                    }
                });

                foldersRow.appendChild(card);
            });

            if (foldersRow.children.length > 0) {
                imagesGrid.appendChild(foldersRow);
            }
        }

        // Images
        if (libraryData.length === 0 && foldersData.length === 0) {
            imagesGrid.innerHTML += '<div class="empty-state"><p>This folder is empty.</p></div>';
            return;
        }

        const sorted = [...libraryData].sort((a, b) => a.filename.localeCompare(b.filename));
        const imagesContainer = document.createElement('div');
        imagesContainer.className = 'images-grid-inner';

        sorted.forEach((img, index) => {
            const card = document.createElement('div');
            const isSelected = selectedLibraryIds.has(img.id);
            const isPdf = img.file_type === 'pdf';
            card.className = 'image-card' + (isSelected ? ' image-card--selected' : '') + (selectionMode ? ' image-card--selectable' : '') + (isPdf ? ' image-card--pdf' : '');
            card.dataset.index = index;

            card.innerHTML =
                '<img src="' + (img.src_half || img.src) + '" onerror="this.onerror=null;this.src=\'' + img.src + '\'" alt="">' +
                (isPdf ? '<span class="image-card__badge">PDF</span>' : '') +
                (selectionMode ? '<div class="image-card__check">' + (isSelected ? '&#10003;' : '') + '</div>' : '') +
                '<div class="image-card__info">' +
                    '<span class="filename">' + escHtml(img.filename) + '</span>' +
                    (isPdf ? formatSize(img.size_bytes) : img.width + '&times;' + img.height + ' &middot; ' + formatSize(img.size_bytes)) +
                '</div>' +
                (selectionMode ? '' : '<button class="image-card__link" title="Copy direct link">&#128279;</button><button class="image-card__delete">&times;</button>');

            if (selectionMode) {
                card.addEventListener('click', (e) => {
                    if (e.shiftKey && lastClickedIndex >= 0) {
                        const from = Math.min(lastClickedIndex, index);
                        const to = Math.max(lastClickedIndex, index);
                        for (let i = from; i <= to; i++) {
                            selectedLibraryIds.add(sorted[i].id);
                        }
                    } else {
                        if (selectedLibraryIds.has(img.id)) {
                            selectedLibraryIds.delete(img.id);
                        } else {
                            selectedLibraryIds.add(img.id);
                        }
                    }
                    lastClickedIndex = index;
                    updateSelectionUI();
                    renderLibrary();
                });
            } else {
                // Copy link button
                const linkBtn = card.querySelector('.image-card__link');
                linkBtn.addEventListener('click', (e) => {
                    e.stopPropagation();
                    const url = window.location.origin + img.src + '?dl=1';
                    navigator.clipboard.writeText(url).then(() => {
                        linkBtn.classList.add('image-card__link--copied');
                        setTimeout(() => linkBtn.classList.remove('image-card__link--copied'), 1000);
                    }).catch(() => {
                        showToast('Failed to copy link');
                    });
                });

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
            }

            imagesContainer.appendChild(card);
        });

        if (sorted.length > 0) {
            imagesGrid.appendChild(imagesContainer);
        }
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
                const isPdf = files[i].type === 'application/pdf' || files[i].name.toLowerCase().endsWith('.pdf');
                if (isPdf) {
                    await uploadPdf(files[i]);
                } else {
                    await uploadImage(files[i]);
                }
            } catch (err) {
                showToast('Error uploading ' + files[i].name + ': ' + err.message);
            }
        }

        uploadStatus.textContent = '';
        showToast(files.length + ' file' + (files.length > 1 ? 's' : '') + ' uploaded.');

        e.target.value = '';
        await loadLibrary();
        await loadBrowser();
    });

    function getImageDims(file) {
        return new Promise((resolve, reject) => {
            const img = new Image();
            const url = URL.createObjectURL(file);
            img.onload = () => {
                URL.revokeObjectURL(url);
                resolve({ width: img.naturalWidth, height: img.naturalHeight });
            };
            img.onerror = reject;
            img.src = url;
        });
    }

    async function uploadImage(file) {
        const dims = await getImageDims(file);
        const shortSide = Math.min(dims.width, dims.height);

        const fullPromise = shortSide <= 1800
            ? Promise.resolve({ blob: file, width: dims.width, height: dims.height })
            : resizeImage(file, 1600, 0.87);

        const [full, half] = await Promise.all([
            fullPromise,
            resizeImage(file, 800, 0.87)
        ]);

        const formData = new FormData();
        formData.append('image', full.blob, file.name);
        formData.append('image_half', half.blob, file.name);
        formData.append('width', full.width);
        formData.append('height', full.height);
        formData.append('filename', file.name);
        formData.append('file_type', 'image');
        if (currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }

        await api('/api/admin/images', { method: 'POST', body: formData });
    }

    // ===== PDF UPLOAD =====
    let _pdfjsLoaded = false;
    async function loadPdfJs() {
        if (_pdfjsLoaded) return;
        await new Promise((resolve, reject) => {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
        pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
        _pdfjsLoaded = true;
    }

    async function generatePdfThumbnail(file) {
        await loadPdfJs();
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);

        // Render at a scale that gives ~800px on the short side
        const viewport = page.getViewport({ scale: 1 });
        const shortSide = Math.min(viewport.width, viewport.height);
        const scale = 800 / shortSide;
        const scaledViewport = page.getViewport({ scale });

        const canvas = document.createElement('canvas');
        canvas.width = Math.round(scaledViewport.width);
        canvas.height = Math.round(scaledViewport.height);
        const ctx = canvas.getContext('2d');

        // White background
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        await page.render({ canvasContext: ctx, viewport: scaledViewport }).promise;

        const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/jpeg', 0.85));
        return { blob, width: canvas.width, height: canvas.height };
    }

    async function uploadPdf(file) {
        const thumb = await generatePdfThumbnail(file);

        const formData = new FormData();
        formData.append('image', file, file.name);
        formData.append('image_half', thumb.blob, file.name.replace('.pdf', '_thumb.jpg'));
        formData.append('width', thumb.width);
        formData.append('height', thumb.height);
        formData.append('filename', file.name);
        formData.append('file_type', 'pdf');
        if (currentFolderId) {
            formData.append('folder_id', currentFolderId);
        }

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

    // ===== OPTIONS TOGGLES =====
    const shuffleCheck = document.getElementById('shuffle-check');
    const hideUsedCheck = document.getElementById('hide-used-check');

    hideUsedCheck.addEventListener('change', () => {
        hideUsedImages = hideUsedCheck.checked;
        renderBrowser();
    });

    shuffleCheck.addEventListener('change', async () => {
        try {
            await api('/api/admin/settings', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: 'shuffle_slides', value: shuffleCheck.checked ? '1' : '0' })
            });
            showToast(shuffleCheck.checked ? 'Random order enabled' : 'Random order disabled');
        } catch (err) {
            shuffleCheck.checked = !shuffleCheck.checked;
            showToast('Error: ' + err.message);
        }
    });

    // ===== INIT =====
    async function init() {
        await Promise.all([loadSlides(), loadLibrary(), loadBrowser()]);

        // Load shuffle setting
        try {
            const settings = await api('/api/admin/settings');
            shuffleCheck.checked = settings.shuffle_slides === '1';
        } catch (e) {
            // settings table may not exist yet
        }
    }

    init();
})();
