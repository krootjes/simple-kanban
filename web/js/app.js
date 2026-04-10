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
  settings: { app_name: 'Kanban' },
  filterTagId: null,
};

let dragging = false;

// Modal state
let currentCardId = null;
let currentCardColumnId = null;
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
  const [columns, cards, tags, settings] = await Promise.all([
    apiFetch('/api/columns'),
    apiFetch('/api/cards'),
    apiFetch('/api/tags'),
    apiFetch('/api/settings'),
  ]);
  state.columns = columns || [];
  state.cards = cards || [];
  state.tags = tags || [];
  state.settings = settings || { app_name: 'Kanban' };
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
  renderBoard();
  renderQuickAddColumnSelect();
  renderQuickAddTags();
}

function renderTagFilter() {
  const bar = document.getElementById('tag-filter');
  bar.innerHTML = `
    <button class="filter-btn ${state.filterTagId === null ? 'active' : ''}"
            onclick="setFilter(null)">${t('filter_all')}</button>
    ${state.tags.map(tag => {
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
  const visibleCards = state.filterTagId !== null
    ? allCards.filter(c => c.tags.some(tag => tag.id === state.filterTagId))
    : allCards;

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

  return `
    <div class="card${overdue ? ' overdue' : ''}" data-id="${card.id}"
         onclick="if (!dragging) showCardModal(${card.id})">
      <div class="card-title">${esc(card.title)}</div>
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

function renderQuickAddTags() {
  const container = document.getElementById('quick-add-tag-sel');
  container.innerHTML = state.tags.map(tag => {
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

  try {
    await apiFetch('/api/cards', 'POST', {
      column_id: colId,
      title,
      description: '',
      due_date: null,
      tag_ids: [...quickAddTagIds],
    });
    input.value = '';
    input.focus();
    await loadAll();
    renderBoard();
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
  document.getElementById('lbl-card-tags').textContent = t('card_field_tags');

  const selectedTagIds = cardId
    ? (state.cards.find(c => c.id === cardId)?.tags || []).map(tag => tag.id)
    : [];

  renderCardTagSelector(selectedTagIds);

  if (cardId) {
    const card = state.cards.find(c => c.id === cardId);
    titleEl.textContent = t('card_edit_title');
    document.getElementById('card-title').value = card.title;
    document.getElementById('card-desc').value = card.description || '';
    document.getElementById('card-due-date').value = card.due_date || '';
    deleteBtn.classList.remove('hidden');
  } else {
    titleEl.textContent = t('card_add_title');
    deleteBtn.classList.add('hidden');
  }

  openModal('card-modal');
  document.getElementById('card-title').focus();
}

function renderCardTagSelector(selectedTagIds) {
  const container = document.getElementById('card-tag-selector');
  const hint = document.getElementById('card-no-tags-hint');

  if (state.tags.length === 0) {
    container.innerHTML = '';
    hint.textContent = t('card_no_tags_hint');
    hint.classList.remove('hidden');
    return;
  }

  hint.classList.add('hidden');
  container.innerHTML = state.tags.map(tag => {
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
  const isActive = btn.style.background !== 'transparent' && btn.style.background !== '';

  // Check by whether background is set to the color
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
    .filter(btn => {
      const color = btn.dataset.color;
      return btn.style.background && btn.style.background !== 'transparent';
    })
    .map(btn => parseInt(btn.dataset.tagId));
}

async function submitCard(e) {
  e.preventDefault();
  const title = document.getElementById('card-title').value.trim();
  const description = document.getElementById('card-desc').value.trim();
  const dueDate = document.getElementById('card-due-date').value || null;
  const tagIds = getSelectedCardTagIds();

  try {
    if (currentCardId) {
      await apiFetch(`/api/cards/${currentCardId}`, 'PUT', { title, description, due_date: dueDate, tag_ids: tagIds });
    } else {
      await apiFetch('/api/cards', 'POST', {
        column_id: currentCardColumnId, title, description, due_date: dueDate, tag_ids: tagIds,
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
