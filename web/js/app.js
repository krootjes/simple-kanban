// ============================================================
// LOCALE
// ============================================================
const t = key => (window.LOCALE && window.LOCALE[key]) || key;

// ============================================================
// STATE
// ============================================================
const state = {
  columns: [],
  cards: [],
  tags: [],
  categories: [],
  settings: { app_name: 'Kanban' },
  filterTagId: null,
  filterCategoryId: null,
};

let dragging = false;

// Modal state
let currentCardId = null;
let currentCardColumnId = null;
let currentCardCategoryId = null;
let currentColumnModalId = null;

// Quick-add tag selection (Set of tag IDs)
const quickAddTagIds = new Set();

// ============================================================
// API
// ============================================================
async function apiFetch(path, method = 'GET', body = null) {
  const opts = { method, headers: {} };
  if (body !== null) {
    opts.headers['Content-Type'] = 'application/json';
    opts.body = JSON.stringify(body);
  }
  const res = await fetch(path, opts);
  if (res.status === 401) {
    window.location.href = '/login.html';
    throw Object.assign(new Error('unauthorized'), { status: 401 });
  }
  if (res.status === 204) return null;
  if (!res.ok) {
    const d = await res.json().catch(() => ({}));
    throw Object.assign(new Error(d.error || res.statusText), { status: res.status });
  }
  return res.json();
}

// ============================================================
// INITIALIZATION
// ============================================================
async function init() {
  try {
    await loadAll();
    applyLocaleToPage();
    render();
    initQuickAdd();
  } catch (e) {
    if (e.status !== 401) console.error('Init failed:', e);
  }
}

async function loadAll() {
  const [columns, cards, tags, categories, settings] = await Promise.all([
    apiFetch('/api/columns'),
    apiFetch('/api/cards'),
    apiFetch('/api/tags'),
    apiFetch('/api/tag-categories'),
    apiFetch('/api/settings'),
  ]);
  state.columns = columns || [];
  state.cards = cards || [];
  state.tags = tags || [];
  state.categories = categories || [];
  state.settings = settings || { app_name: 'Kanban' };
  if (state.settings.accent_color) applyAccentColor(state.settings.accent_color);
}

function darkenHex(hex, amount = 20) {
  const num = parseInt(hex.replace('#', ''), 16);
  const r = Math.max(0, (num >> 16) - amount);
  const g = Math.max(0, ((num >> 8) & 0xff) - amount);
  const b = Math.max(0, (num & 0xff) - amount);
  return '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
}

function applyAccentColor(hex) {
  document.documentElement.style.setProperty('--accent', hex);
  document.documentElement.style.setProperty('--accent-hover', darkenHex(hex));
}

function applyLocaleToPage() {
  document.getElementById('quick-add-input').placeholder = t('quick_add_placeholder');
}

async function logout() {
  await fetch('/auth/logout', { method: 'POST' });
  window.location.href = '/login.html';
}

// ============================================================
// RENDERING
// ============================================================
function render() {
  // App name
  const name = state.settings.app_name || t('app_default_name');
  document.title = name;
  const nameEl = document.getElementById('app-name');
  if (nameEl) nameEl.textContent = name;

  renderTagFilter();
  renderCategoryFilter();
  renderBoard();
  renderQuickAddColumnSelect();
  renderQuickAddCategorySelect();
  renderQuickAddTags();
}

function renderTagFilter() {
  const bar = document.getElementById('tag-filter');
  const visibleTags = state.filterCategoryId !== null
    ? state.tags.filter(t => t.tag_category_id === state.filterCategoryId)
    : state.tags;
  bar.innerHTML = `
    <button class="filter-btn ${state.filterTagId === null ? 'active' : ''}"
            onclick="setFilter(null)">${t('filter_all')}</button>
    ${visibleTags.map(tag => {
      const active = state.filterTagId === tag.id;
      const style = active
        ? `background:${tag.color};border-color:${tag.color}`
        : `border-color:${tag.color};color:${tag.color}`;
      return `<button class="filter-btn ${active ? 'active' : ''}" style="${style}"
                      onclick="setFilter(${tag.id})">${esc(tag.name)}</button>`;
    }).join('')}
  `;
}

function setFilter(tagId) {
  state.filterTagId = tagId;
  renderTagFilter();
  renderBoard();
}

function renderCategoryFilter() {
  const bar = document.getElementById('category-filter');
  if (!bar) return;
  if (state.categories.length === 0) {
    bar.innerHTML = '';
    return;
  }
  bar.innerHTML = `
    <button class="filter-btn ${state.filterCategoryId === null ? 'active' : ''}"
            onclick="setCategoryFilter(null)">${t('filter_all')}</button>
    ${state.categories.map(cat => {
      const active = state.filterCategoryId === cat.id;
      const style = active
        ? `background:${cat.color};border-color:${cat.color}`
        : `border-color:${cat.color};color:${cat.color}`;
      return `<button class="filter-btn ${active ? 'active' : ''}" style="${style}"
                      onclick="setCategoryFilter(${cat.id})">${esc(cat.name)}</button>`;
    }).join('')}
  `;
}

function setCategoryFilter(categoryId) {
  state.filterCategoryId = categoryId;
  // Reset tag filter when the selected tag no longer belongs to the new category
  if (state.filterTagId !== null) {
    const tag = state.tags.find(t => t.id === state.filterTagId);
    if (!tag || (categoryId !== null && tag.tag_category_id !== categoryId)) {
      state.filterTagId = null;
    }
  }
  renderTagFilter();
  renderCategoryFilter();
  renderBoard();
}

function renderBoard() {
  const board = document.getElementById('board');

  if (window._sortables) window._sortables.forEach(s => s.destroy());
  window._sortables = [];

  const sortedCols = [...state.columns].sort((a, b) => a.position - b.position);

  board.innerHTML =
    sortedCols.map(col => columnHTML(col)).join('') +
    `<div class="add-column-btn" onclick="showAddColumnModal()">
       <span>+</span> ${t('add_column').replace('+ ', '')}
     </div>`;

  // Card sortables (one per column)
  sortedCols.forEach(col => {
    const listEl = board.querySelector(`.card-list[data-column-id="${col.id}"]`);
    if (!listEl) return;
    const s = Sortable.create(listEl, {
      group: 'cards',
      animation: 150,
      ghostClass: 'card-ghost',
      dragClass: 'card-dragging',
      onStart: () => { dragging = true; },
      onEnd: async (evt) => {
        setTimeout(() => { dragging = false; }, 50);
        const cardId = parseInt(evt.item.dataset.id);
        const srcColId = parseInt(evt.from.dataset.columnId);
        const dstColId = parseInt(evt.to.dataset.columnId);
        if (evt.oldIndex === evt.newIndex && srcColId === dstColId) return;
        try {
          await apiFetch(`/api/cards/${cardId}/move`, 'PUT', {
            column_id: dstColId,
            position: evt.newIndex,
          });
        } catch (e) { console.error(t('error_move_card'), e); }
        await loadAll();
        render();
      },
    });
    window._sortables.push(s);
  });

  // Column sortable
  const s = Sortable.create(board, {
    animation: 150,
    handle: '.column-drag-handle',
    draggable: '.column',
    ghostClass: 'column-ghost',
    onStart: () => { dragging = true; },
    onEnd: async (evt) => {
      setTimeout(() => { dragging = false; }, 50);
      const colId = parseInt(evt.item.dataset.id);
      if (evt.oldIndex === evt.newIndex) return;
      try {
        await apiFetch(`/api/columns/${colId}/move`, 'PUT', { position: evt.newIndex });
      } catch (e) { console.error(t('error_move_column'), e); }
      await loadAll();
      render();
    },
  });
  window._sortables.push(s);
}

function columnHTML(col) {
  const allCards = state.cards
    .filter(c => c.column_id === col.id)
    .sort((a, b) => a.position - b.position);
  const visibleCards = allCards.filter(c => {
    const tagMatch = state.filterTagId === null || c.tags.some(tag => tag.id === state.filterTagId);
    const catMatch = state.filterCategoryId === null || c.tag_category_id === state.filterCategoryId;
    return tagMatch && catMatch;
  });

  return `
    <div class="column" data-id="${col.id}">
      <div class="column-header">
        <span class="column-drag-handle" title="Drag to reorder">⠿</span>
        <span class="column-name">${esc(col.name)}</span>
        <span class="column-count">${allCards.length}</span>
        <div class="column-actions">
          <button class="icon-btn" onclick="showRenameColumnModal(${col.id}, '${escAttr(col.name)}')" title="Rename">✎</button>
          <button class="icon-btn danger" onclick="deleteColumn(${col.id})" title="Delete">×</button>
        </div>
      </div>
      <div class="card-list" data-column-id="${col.id}">
        ${visibleCards.map(card => cardHTML(card)).join('')}
      </div>
      <button class="add-card-btn" onclick="showCardModal(null, ${col.id})">${t('add_card')}</button>
    </div>
  `;
}

function cardHTML(card) {
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const due = card.due_date ? new Date(card.due_date + 'T00:00:00') : null;
  const overdue = due && due < today;
  const isToday = due && due.getTime() === today.getTime();
  const dueFmt = due ? due.toLocaleDateString('nl-NL', { day: '2-digit', month: '2-digit', year: 'numeric' }) : '';

  const category = card.tag_category_id
    ? state.categories.find(c => c.id === card.tag_category_id)
    : null;

  return `
    <div class="card${overdue ? ' overdue' : ''}" data-id="${card.id}"
         onclick="if (!dragging) showCardModal(${card.id})">
      <div class="card-top">
        <div class="card-title">${esc(card.title)}</div>
        ${category ? `<span class="category-dot" style="background:${category.color}" title="${esc(category.name)}"></span>` : ''}
      </div>
      ${card.description ? `<div class="card-desc">${esc(card.description)}</div>` : ''}
      <div class="card-footer">
        <div class="card-tags">
          ${card.tags.map(tag => `<span class="tag-pill" style="background:${tag.color}">${esc(tag.name)}</span>`).join('')}
        </div>
        ${due ? `<span class="due-date${overdue ? ' overdue' : ''}${isToday ? ' today' : ''}">${dueFmt}</span>` : ''}
      </div>
    </div>
  `;
}

// ============================================================
// QUICK ADD
// ============================================================
function initQuickAdd() {
  const input = document.getElementById('quick-add-input');
  input.addEventListener('keydown', async (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      await submitQuickAdd();
    } else if (e.key === 'Escape') {
      input.blur();
    }
  });

}

function renderQuickAddColumnSelect() {
  const sel = document.getElementById('quick-add-col');
  const currentVal = sel.value;
  const sorted = [...state.columns].sort((a, b) => a.position - b.position);
  sel.innerHTML = sorted.map(c =>
    `<option value="${c.id}" ${String(c.id) === currentVal ? 'selected' : ''}>${esc(c.name)}</option>`
  ).join('');
}

function updateCategorySelectStyle(sel) {
  sel.classList.toggle('is-placeholder', !sel.value);
}

function renderQuickAddCategorySelect() {
  const sel = document.getElementById('quick-add-category');
  const currentVal = sel.value;
  sel.innerHTML = `<option value="" disabled${!currentVal ? ' selected' : ''}>Select category...</option>` +
    state.categories.map(c =>
      `<option value="${c.id}" ${String(c.id) === currentVal ? 'selected' : ''}>${esc(c.name)}</option>`
    ).join('');
  updateCategorySelectStyle(sel);
}

function onQuickAddCategoryChange(sel) {
  updateCategorySelectStyle(sel);
  quickAddTagIds.clear();
  renderQuickAddTags();
}

function renderQuickAddTags() {
  const container = document.getElementById('quick-add-tag-sel');
  const catId = document.getElementById('quick-add-category')?.value;

  const visibleTags = catId
    ? state.tags.filter(t => t.tag_category_id === parseInt(catId))
    : state.tags;

  container.innerHTML = visibleTags.map(tag => {
    const active = quickAddTagIds.has(tag.id);
    const style = active
      ? `background:${tag.color};border-color:${tag.color};color:#fff`
      : `border-color:${tag.color};color:${tag.color}`;
    return `<button type="button" class="filter-btn" style="${style}"
                    onclick="toggleQuickAddTag(${tag.id}, this, '${tag.color}')">${esc(tag.name)}</button>`;
  }).join('');
}

function toggleQuickAddTag(tagId, btn, color) {
  if (quickAddTagIds.has(tagId)) {
    quickAddTagIds.delete(tagId);
    btn.style.background = 'transparent';
    btn.style.borderColor = color;
    btn.style.color = color;
  } else {
    quickAddTagIds.add(tagId);
    btn.style.background = color;
    btn.style.borderColor = color;
    btn.style.color = '#fff';
  }
}

async function submitQuickAdd() {
  const input = document.getElementById('quick-add-input');
  const title = input.value.trim();
  if (!title) return;

  const colId = parseInt(document.getElementById('quick-add-col').value);
  if (!colId) return;

  const catVal = document.getElementById('quick-add-category').value;
  const tagCategoryId = catVal ? parseInt(catVal) : null;

  try {
    await apiFetch('/api/cards', 'POST', {
      column_id: colId,
      title,
      description: '',
      due_date: null,
      tag_ids: [...quickAddTagIds],
      tag_category_id: tagCategoryId,
    });
    input.value = '';
    input.focus();
    await loadAll();
    renderBoard();
    renderQuickAddTags();
  } catch (e) {
    alert(t('error_quick_add') + ': ' + e.message);
  }
}

// ============================================================
// CARD MODAL
// ============================================================
function showCardModal(cardId, columnId = null) {
  currentCardId = cardId;
  currentCardColumnId = columnId;

  document.getElementById('card-form').reset();

  const titleEl = document.getElementById('card-modal-title');
  const deleteBtn = document.getElementById('card-delete-btn');

  // Apply locale labels
  document.getElementById('lbl-card-title').textContent = t('card_field_title');
  document.getElementById('lbl-card-desc').textContent = t('card_field_description');
  document.getElementById('lbl-card-due').textContent = t('card_field_due_date');
  document.getElementById('lbl-card-category').textContent = t('card_field_category');
  document.getElementById('lbl-card-tags').textContent = t('card_field_tags');

  const card = cardId ? state.cards.find(c => c.id === cardId) : null;
  currentCardCategoryId = card ? (card.tag_category_id || null) : null;

  const selectedTagIds = card ? (card.tags || []).map(tag => tag.id) : [];

  renderCardCategorySelector(currentCardCategoryId);
  renderCardTagSelector(selectedTagIds, currentCardCategoryId);

  if (card) {
    titleEl.textContent = t('card_edit_title');
    document.getElementById('card-title').value = card.title;
    document.getElementById('card-desc').value = card.description || '';
    document.getElementById('card-due-date').value = (card.due_date || '').slice(0, 10);
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = t('card_add_title');
    deleteBtn.classList.add('hidden');
  }
  updateClearDueDateBtn();

  openModal('card-modal');
  document.getElementById('card-title').focus();
}

function renderCardCategorySelector(selectedCategoryId) {
  const container = document.getElementById('card-category-selector');
  const noneStyle = !selectedCategoryId
    ? 'background:var(--muted);border-color:var(--muted);color:#fff'
    : 'border-color:var(--border);color:var(--muted-light)';

  container.innerHTML =
    `<button type="button" class="tag-select-pill" style="${noneStyle}"
             data-category-id="" onclick="selectCardCategory(this)">None</button>` +
    state.categories.map(cat => {
      const active = selectedCategoryId === cat.id;
      const style = active
        ? `background:${cat.color};border-color:${cat.color};color:#fff`
        : `border-color:${cat.color};color:${cat.color}`;
      return `<button type="button" class="tag-select-pill" style="${style}"
                      data-category-id="${cat.id}" data-color="${cat.color}"
                      onclick="selectCardCategory(this)">${esc(cat.name)}</button>`;
    }).join('');
}

function selectCardCategory(btn) {
  // Deselect all
  document.querySelectorAll('#card-category-selector .tag-select-pill').forEach(b => {
    const color = b.dataset.color;
    if (color) {
      b.style.background = 'transparent';
      b.style.color = color;
      b.style.borderColor = color;
    } else {
      b.style.background = 'transparent';
      b.style.color = 'var(--muted-light)';
      b.style.borderColor = 'var(--border)';
    }
  });

  // Select clicked
  const color = btn.dataset.color;
  if (color) {
    btn.style.background = color;
    btn.style.color = '#fff';
    btn.style.borderColor = color;
  } else {
    btn.style.background = 'var(--muted)';
    btn.style.color = '#fff';
    btn.style.borderColor = 'var(--muted)';
  }

  currentCardCategoryId = btn.dataset.categoryId ? parseInt(btn.dataset.categoryId) : null;

  // Re-render tag selector filtered to new category (preserve current selection)
  const selectedTagIds = getSelectedCardTagIds();
  renderCardTagSelector(selectedTagIds, currentCardCategoryId);
}

function renderCardTagSelector(selectedTagIds, categoryId) {
  const container = document.getElementById('card-tag-selector');
  const hint = document.getElementById('card-no-tags-hint');

  const visibleTags = categoryId
    ? state.tags.filter(t => t.tag_category_id === categoryId)
    : state.tags;

  if (visibleTags.length === 0) {
    container.innerHTML = '';
    hint.textContent = enforce && categoryId
      ? t('card_no_tags_in_category')
      : t('card_no_tags_hint');
    hint.classList.remove('hidden');
    return;
  }

  hint.classList.add('hidden');
  container.innerHTML = visibleTags.map(tag => {
    const active = selectedTagIds.includes(tag.id);
    const style = active
      ? `background:${tag.color};border-color:${tag.color};color:#fff`
      : `border-color:${tag.color};color:${tag.color}`;
    return `<button type="button" class="tag-select-pill"
                    style="${style}"
                    data-tag-id="${tag.id}"
                    data-color="${tag.color}"
                    onclick="toggleCardTag(this)">${esc(tag.name)}</button>`;
  }).join('');
}

function toggleCardTag(btn) {
  const color = btn.dataset.color;
  const currentBg = btn.style.background;
  const active = currentBg && currentBg !== 'transparent';

  if (active) {
    btn.style.background = 'transparent';
    btn.style.borderColor = color;
    btn.style.color = color;
  } else {
    btn.style.background = color;
    btn.style.borderColor = color;
    btn.style.color = '#fff';
  }
}

function getSelectedCardTagIds() {
  return [...document.querySelectorAll('#card-tag-selector .tag-select-pill')]
    .filter(btn => btn.style.background && btn.style.background !== 'transparent')
    .map(btn => parseInt(btn.dataset.tagId));
}

function updateClearDueDateBtn() {
  const hasDate = !!document.getElementById('card-due-date').value;
  document.getElementById('card-clear-due').classList.toggle('hidden', !hasDate);
}

function clearDueDate() {
  document.getElementById('card-due-date').value = '';
  updateClearDueDateBtn();
}

async function submitCard(e) {
  e.preventDefault();
  const title = document.getElementById('card-title').value.trim();
  const description = document.getElementById('card-desc').value.trim();
  const dueDate = document.getElementById('card-due-date').value || null;
  const tagIds = getSelectedCardTagIds();
  const tagCategoryId = currentCardCategoryId;

  try {
    if (currentCardId) {
      await apiFetch(`/api/cards/${currentCardId}`, 'PUT', {
        title, description, due_date: dueDate, tag_ids: tagIds, tag_category_id: tagCategoryId,
      });
    } else {
      await apiFetch('/api/cards', 'POST', {
        column_id: currentCardColumnId, title, description, due_date: dueDate,
        tag_ids: tagIds, tag_category_id: tagCategoryId,
      });
    }
    closeModal('card-modal');
    await loadAll();
    render();
  } catch (e) {
    alert(t('error_save_card') + ': ' + e.message);
  }
}

async function deleteCurrentCard() {
  if (!currentCardId || !confirm(t('card_delete_confirm'))) return;
  try {
    await apiFetch(`/api/cards/${currentCardId}`, 'DELETE');
    closeModal('card-modal');
    await loadAll();
    render();
  } catch (e) {
    alert(t('error_delete_card') + ': ' + e.message);
  }
}

// ============================================================
// COLUMN MODAL
// ============================================================
function showAddColumnModal() {
  currentColumnModalId = null;
  document.getElementById('column-modal-title').textContent = t('column_add_title');
  document.getElementById('lbl-col-name').textContent = t('column_field_name');
  document.getElementById('column-name-input').value = '';
  openModal('column-modal');
  document.getElementById('column-name-input').focus();
}

function showRenameColumnModal(colId, currentName) {
  currentColumnModalId = colId;
  document.getElementById('column-modal-title').textContent = t('column_rename_title');
  document.getElementById('lbl-col-name').textContent = t('column_field_name');
  document.getElementById('column-name-input').value = currentName;
  openModal('column-modal');
  document.getElementById('column-name-input').select();
}

async function submitColumn(e) {
  e.preventDefault();
  const name = document.getElementById('column-name-input').value.trim();
  if (!name) return;
  try {
    if (currentColumnModalId) {
      await apiFetch(`/api/columns/${currentColumnModalId}`, 'PUT', { name });
    } else {
      await apiFetch('/api/columns', 'POST', { name });
    }
    closeModal('column-modal');
    await loadAll();
    render();
  } catch (e) {
    alert(t('error_save_column') + ': ' + e.message);
  }
}

async function deleteColumn(colId) {
  if (!confirm(t('column_delete_confirm'))) return;
  try {
    await apiFetch(`/api/columns/${colId}`, 'DELETE');
    await loadAll();
    render();
  } catch (e) {
    if (e.status === 409) {
      alert(t('column_has_cards_error'));
    } else {
      alert(t('error_delete_column') + ': ' + e.message);
    }
  }
}

// ============================================================
// MODAL HELPERS
// ============================================================
function openModal(id) { document.getElementById(id).classList.remove('hidden'); }
function closeModal(id) { document.getElementById(id).classList.add('hidden'); }
function overlayClick(e, id) { if (e.target === e.currentTarget) closeModal(id); }

document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    ['card-modal', 'column-modal'].forEach(id => closeModal(id));
  }
});

// ============================================================
// UTILS
// ============================================================
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function escAttr(str) {
  return String(str).replace(/'/g, '&#39;').replace(/"/g, '&quot;');
}

// ============================================================
// BOOT
// ============================================================
init();
