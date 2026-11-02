(function () {
  const { formatPresentationUrl, getAudioStreamUrl, getYouTubeWatchUrl } = window.ScheduleUtils;
  const api = window.scheduleApi;
  const LAST_SCHEDULE_KEY = 'lastScheduleId';
  let audioProxyBase = '';

  const $ = (id) => document.getElementById(id);
  const els = {
    landing: $('view-landing'),
    presentation: $('view-presentation'),
    landingError: $('landing-error'),
    settingsBtn: $('btn-global-settings'),
    appVersion: $('app-version-label'),
    scheduleSelect: $('select-schedule'),
    actionsRow: $('schedule-actions-row'),
    present: $('btn-action-present'),
    editFromLanding: $('btn-action-edit'),
    openIcons: $('btn-open-icons'),
    home: $('btn-present-home'),
    quickEdit: $('btn-present-quick-edit'),
    settingsModal: $('modal-settings'),
    settingsClose: $('btn-settings-close'),
    builderModal: $('modal-builder'),
    builderSave: $('btn-builder-save'),
    builderSavePresent: $('btn-builder-save-present'),
    builderCancel: $('btn-builder-close'),
    iconsModal: $('modal-icons'),
    iconsError: $('icons-error'),
    iconsTitle: $('icons-title'),
    iconsClose: $('btn-icons-close'),
    iconGrid: $('icon-library-grid'),
    addIcon: $('btn-add-system-icon'),
    frame: $('presentation-frame'),
    youtubeFallback: $('youtube-fallback-btn'),
    youtubeSignIn: $('youtube-sign-in-btn'),
    placeholder: $('stage-placeholder'),
    stageTitle: $('stage-title'),
    stageImage: $('stage-image'),
    stageHint: $('stage-hint'),
    audioStage: $('audio-resource-player'),
    audioImage: $('audio-stage-graphic'),
    audio: $('native-audio-element'),
    bottom: $('bottom-row-container'),
    modalError: $('modal-error'),
    className: $('class-name-input'),
    classGrade: $('class-grade-input'),
    newClass: $('new-class-btn'),
    deleteClass: $('delete-class-btn'),
    resetProgress: $('reset-progress-btn'),
    stepList: $('item-sequence-list'),
    addStep: $('add-step-btn'),
    updateStatus: $('update-status'),
    checkUpdate: $('check-update-btn'),
    downloadUpdate: $('download-update-btn'),
    laterUpdate: $('later-update-btn'),
    installUpdate: $('install-update-btn')
  };

  const state = {
    schedules: [],
    images: [],
    scheduleId: null,
    items: [],
    completed: new Set(),
    audioFailed: new Set(),
    youtubeWatch: new Set(),
    activeIndex: -1,
    draft: [],
    draftScheduleId: null,
    view: 'landing',
    activeParentView: 'landing',
    pickStep: null
  };

  function assetUrl(filename) {
    return filename ? 'schedule-asset://library/' + encodeURIComponent(filename) : '';
  }

  /* ---------- Schedule display ---------- */

  function createCard(item, index) {
    const card = document.createElement('button');
    card.type = 'button';
    card.className = 'activity-card';
    if (index === state.activeIndex) card.classList.add('active');
    if (state.completed.has(index)) card.classList.add('completed');
    card.setAttribute('aria-label', item.activity_title + (state.completed.has(index) ? ' (done)' : ''));

    if (item.image_filename) {
      const img = document.createElement('img');
      img.src = assetUrl(item.image_filename);
      img.alt = '';
      card.appendChild(img);
    }
    const title = document.createElement('span');
    title.className = 'card-title';
    title.textContent = item.activity_title;
    card.appendChild(title);

    const check = document.createElement('div');
    check.className = 'checkmark-overlay';
    check.textContent = '✓';
    card.appendChild(check);

    card.addEventListener('click', () => onCardClick(index));
    return card;
  }

  function renderSchedule() {
    els.bottom.replaceChildren(...state.items.map(createCard));
    showStage();
  }

function showStage() {
    const item = state.items[state.activeIndex];
    const audioUrl = item ? getAudioStreamUrl(item.external_url, audioProxyBase) : '';
    const youtubeWatchUrl = item ? getYouTubeWatchUrl(item.external_url) : '';
    const useWatchPage = Boolean(youtubeWatchUrl) && state.youtubeWatch.has(item.external_url);
    const url = item ? formatPresentationUrl(item.external_url, { youtubeWatchPage: useWatchPage }) : '';
    els.youtubeFallback.hidden = !youtubeWatchUrl || Boolean(audioUrl);
    els.youtubeFallback.textContent = useWatchPage ? 'Use simple player' : 'Video not loading? Use full YouTube page';

    // Title lives in a bar below the stage content, so it shows for every content type
    els.stageTitle.textContent = item
      ? item.activity_title
      : (state.items.length ? 'All done!' : 'Welcome');

    if (audioUrl && state.audioFailed.has(audioUrl)) {
      if (els.audio.dataset.src) {
        els.audio.pause();
        delete els.audio.dataset.src;
        els.audio.removeAttribute('src');
      }
      delete els.frame.dataset.src;
      els.frame.removeAttribute('src');
      els.frame.hidden = true;
      els.audioStage.hidden = true;
      els.placeholder.hidden = false;
      els.stageImage.hidden = true;
      // Ensure title is shown even in error case
      if (item && els.stageTitle) {
          els.stageTitle.textContent = item.activity_title;
      }
      els.stageHint.textContent = "Couldn't stream this Drive file. Check the shared link and file access.";
      return;
    }

    if (audioUrl) {
      delete els.frame.dataset.src;
      els.frame.removeAttribute('src');
      els.frame.hidden = true;
      els.placeholder.hidden = true;
      els.audioStage.hidden = false;
      // Always show title for audio items
      if (item && els.stageTitle) {
          els.stageTitle.textContent = item.activity_title;
      }
      if (item.image_filename) {
        els.audioImage.src = assetUrl(item.image_filename);
        els.audioImage.hidden = false;
      } else {
        els.audioImage.removeAttribute('src');
        els.audioImage.hidden = true;
      }
      if (els.audio.dataset.src !== audioUrl) {
        els.audio.pause();
        els.audio.dataset.src = audioUrl;
        els.audio.autoplay = false;
        els.audio.src = audioUrl;
        els.audio.load();
      }
      return;
    }

    if (els.audio.dataset.src || els.audio.hasAttribute('src')) {
      els.audio.pause();
      delete els.audio.dataset.src;
      els.audio.removeAttribute('src');
      els.audio.autoplay = false;
      els.audio.load();
    }
    els.audioStage.hidden = true;

    if (url) {
      if (els.frame.dataset.src !== url) {
        els.frame.dataset.src = url;
        els.frame.src = url;
      }
      els.frame.hidden = false;
      els.placeholder.hidden = true;
      // Always show title for presentation items
      if (item && els.stageTitle) {
          els.stageTitle.textContent = item.activity_title;
      }
      return;
    }
    delete els.frame.dataset.src;
    els.frame.removeAttribute('src');
    els.frame.hidden = true;
    els.placeholder.hidden = false;
    if (item) {
      els.stageHint.textContent = '';
      if (item.image_filename) {
        els.stageImage.src = assetUrl(item.image_filename);
        els.stageImage.hidden = false;
      } else {
        els.stageImage.hidden = true;
      }
    } else {
      els.stageImage.hidden = true;
      els.stageHint.textContent = state.items.length ? '' : 'Tap the gear to build a schedule.';
    }
  }

  function nextIncomplete(from) {
    for (let i = 1; i <= state.items.length; i++) {
      const idx = (from + i) % state.items.length;
      if (!state.completed.has(idx)) return idx;
    }
    return -1;
  }

  // First tap selects a step; tapping the active step marks it done and advances.
  function onCardClick(index) {
    if (state.activeIndex === index) {
      if (state.completed.has(index)) state.completed.delete(index);
      else {
        state.completed.add(index);
        state.activeIndex = nextIncomplete(index);
      }
    } else {
      state.activeIndex = index;
    }
    renderSchedule();
  }

  // Next: check off the current step and advance. Previous: step back and uncheck it.
  function stepForward() {
    if (state.view !== 'presentation' || state.activeIndex < 0 || !state.items.length) return;
    state.completed.add(state.activeIndex);
    state.activeIndex = state.activeIndex + 1 < state.items.length ? state.activeIndex + 1 : -1;
    renderSchedule();
  }

  function stepBack() {
    if (state.view !== 'presentation' || !state.items.length) return;
    const target = state.activeIndex < 0 ? state.items.length - 1 : state.activeIndex - 1;
    if (target < 0) return;
    state.completed.delete(target);
    state.activeIndex = target;
    renderSchedule();
  }

  api.onNavigate((direction) => {
    if (direction === 'next') stepForward();
    else if (direction === 'prev') stepBack();
  });

  async function loadSchedule(id) {
    state.scheduleId = id;
    state.items = id ? await api.getItems(id) : [];
    state.completed = new Set();
    state.activeIndex = state.items.length ? 0 : -1;
    if (id) localStorage.setItem(LAST_SCHEDULE_KEY, String(id));
    renderSchedule();
  }

  /* ---------- Views, dialogs, and builder ---------- */

  const createTrashIcon = () => {
    const ns = 'http://www.w3.org/2000/svg';
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2.2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    ['M4 7h16', 'M9 7V4h6v3', 'M6 7l1 13h10l1-13', 'M10 11v6', 'M14 11v6'].forEach((d) => {
      const path = document.createElementNS(ns, 'path');
      path.setAttribute('d', d);
      svg.append(path);
    });
    return svg;
  };

  const showError = (message, target = els.modalError) => {
    target.replaceChildren();
    target.hidden = !message;
    if (!message) return;
    const text = document.createElement('span');
    text.textContent = message;
    const close = document.createElement('button');
    close.type = 'button';
    close.className = 'error-close';
    close.textContent = '✕';
    close.setAttribute('aria-label', 'Dismiss message');
    close.addEventListener('click', () => showError('', target));
    target.append(text, close);
  };

  async function guarded(fn, errorEl = els.modalError) {
    try {
      showError('', errorEl);
      return await fn();
    } catch (e) {
      showError((e && e.message ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''), errorEl);
      return undefined;
    }
  }

  // Clicker/keyboard capture in the main process is on only for the presentation with no dialog open.
  const syncNav = () => {
    api.setNavEnabled(state.view === 'presentation' && !document.querySelector('dialog[open]'));
  };

  const stopMedia = () => {
    els.audio.pause();
    delete els.audio.dataset.src;
    els.audio.removeAttribute('src');
    delete els.frame.dataset.src;
    els.frame.removeAttribute('src');
  };

  const switchView = (target) => {
    state.view = target;
    els.landing.hidden = target !== 'landing';
    els.presentation.hidden = target !== 'presentation';
    if (target === 'landing') stopMedia();
    syncNav();
  };

  const populateLandingSelect = () => {
    els.scheduleSelect.replaceChildren();
    const placeholder = document.createElement('option');
    placeholder.value = '';
    placeholder.disabled = true;
    placeholder.textContent = 'Select a schedule...';
    els.scheduleSelect.appendChild(placeholder);
    state.schedules.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = String(s.id);
      opt.textContent = s.grade_level ? `${s.name} (${s.grade_level})` : s.name;
      els.scheduleSelect.appendChild(opt);
    });
    const exists = state.schedules.some((s) => s.id === state.scheduleId);
    els.scheduleSelect.value = exists ? String(state.scheduleId) : '';
    els.actionsRow.hidden = !exists;
  };

  const selectSchedule = (id) => {
    state.scheduleId = id;
    if (id) localStorage.setItem(LAST_SCHEDULE_KEY, String(id));
    populateLandingSelect();
  };

  // Re-reads the active schedule after an edit while keeping the teacher's place.
  async function reloadItemsKeepingPlace() {
    const oldActive = state.activeIndex;
    state.items = state.scheduleId ? await api.getItems(state.scheduleId) : [];
    const last = state.items.length - 1;
    state.completed = new Set([...state.completed].filter((i) => i <= last));
    state.activeIndex = !state.items.length ? -1 : (oldActive < 0 ? -1 : Math.min(oldActive, last));
    renderSchedule();
  }

  function populateBuilderFields() {
    const current = state.schedules.find((s) => s.id === state.draftScheduleId);
    els.className.value = current ? current.name : '';
    els.classGrade.value = current && current.grade_level ? current.grade_level : '';
    [els.className, els.classGrade, els.addStep].forEach((el) => { el.disabled = !current; });
  }

  async function loadDraft(scheduleId) {
    state.draftScheduleId = scheduleId;
    state.draft = scheduleId
      ? (await api.getItems(scheduleId)).map((i) => ({
          activity_title: i.activity_title,
          image_id: i.image_id,
          external_url: i.external_url || ''
        }))
      : [];
    populateBuilderFields();
    renderDraft();
  }

  async function persistDraft() {
    if (!state.draftScheduleId) return;
    const id = state.draftScheduleId;
    await api.updateSchedule(id, els.className.value, els.classGrade.value);
    await api.saveItems(id, state.draft);
    state.schedules = await api.listSchedules();
  }

  /* ---------- Drag-to-reorder steps ---------- */

  const SCROLL_ZONE = 90;
  const SCROLL_MAX_SPEED = 28;
  const drag = { from: -1, to: -1, pointerY: 0, frame: 0 };

  const clearDropMarkers = () => {
    els.stepList.querySelectorAll('.drop-before, .drop-after').forEach((r) => r.classList.remove('drop-before', 'drop-after'));
  };

  const endDrag = () => {
    cancelAnimationFrame(drag.frame);
    drag.frame = 0;
    drag.from = -1;
    drag.to = -1;
    clearDropMarkers();
    els.stepList.querySelectorAll('.dragging').forEach((r) => r.classList.remove('dragging'));
  };

  // Speed grows quadratically as the pointer nears (or passes) the list edge.
  const autoScrollSpeed = () => {
    const rect = els.stepList.getBoundingClientRect();
    const fromTop = drag.pointerY - rect.top;
    const fromBottom = rect.bottom - drag.pointerY;
    const zone = Math.min(SCROLL_ZONE, rect.height / 2);
    if (fromTop < zone) return -SCROLL_MAX_SPEED * Math.pow(Math.min(1, (zone - fromTop) / zone), 2);
    if (fromBottom < zone) return SCROLL_MAX_SPEED * Math.pow(Math.min(1, (zone - fromBottom) / zone), 2);
    return 0;
  };

  const startAutoScroll = () => {
    const tick = () => {
      if (drag.from < 0) return;
      const speed = autoScrollSpeed();
      if (speed) {
        els.stepList.scrollTop += speed;
        updateDropTarget();
      }
      drag.frame = requestAnimationFrame(tick);
    };
    drag.frame = requestAnimationFrame(tick);
  };

  const updateDropTarget = () => {
    const rows = [...els.stepList.querySelectorAll('.step-row')];
    let to = rows.length;
    for (let i = 0; i < rows.length; i += 1) {
      const rect = rows[i].getBoundingClientRect();
      if (drag.pointerY < rect.top + rect.height / 2) { to = i; break; }
    }
    drag.to = to;
    clearDropMarkers();
    if (to < rows.length) rows[to].classList.add('drop-before');
    else if (rows.length) rows[rows.length - 1].classList.add('drop-after');
  };

  els.stepList.addEventListener('dragover', (e) => {
    if (drag.from < 0) return;
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    drag.pointerY = e.clientY;
    updateDropTarget();
  });

  els.stepList.addEventListener('drop', (e) => {
    if (drag.from < 0) return;
    e.preventDefault();
    const from = drag.from;
    let to = drag.to;
    endDrag();
    if (to < 0 || to === from || to === from + 1) return;
    const [moved] = state.draft.splice(from, 1);
    if (to > from) to -= 1;
    state.draft.splice(to, 0, moved);
    renderDraft();
  });

  // Keep scrolling and tracking even when the cursor leaves the list while dragging.
  document.addEventListener('dragover', (e) => {
    if (drag.from < 0) return;
    drag.pointerY = e.clientY;
  });

  function renderDraft() {
    els.stepList.replaceChildren();
    state.draft.forEach((step, index) => els.stepList.appendChild(createStepRow(step, index)));
  }

  function createStepRow(step, index) {
    const row = document.createElement('div');
    row.className = 'step-row';
    row.dataset.index = String(index);

    const handle = document.createElement('div');
    handle.className = 'drag-handle';
    handle.textContent = '⠿';
    handle.title = 'Drag to reorder';
    handle.setAttribute('aria-hidden', 'true');
    handle.addEventListener('mousedown', () => { row.draggable = true; });
    handle.addEventListener('mouseup', () => { row.draggable = false; });
    row.addEventListener('dragstart', (e) => {
      if (!row.draggable) return;
      drag.from = index;
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', String(index));
      requestAnimationFrame(() => row.classList.add('dragging'));
      startAutoScroll();
    });
    row.addEventListener('dragend', () => {
      row.draggable = false;
      endDrag();
    });
    row.appendChild(handle);

    const image = state.images.find((i) => i.id === step.image_id);
    if (image) {
      const thumb = document.createElement('img');
      thumb.className = 'thumb';
      thumb.src = assetUrl(image.image_filename);
      thumb.alt = '';
      row.appendChild(thumb);
    } else {
      const empty = document.createElement('div');
      empty.className = 'thumb-empty';
      row.appendChild(empty);
    }

    const fields = document.createElement('div');
    fields.className = 'step-fields';

    const title = document.createElement('input');
    title.type = 'text';
    title.maxLength = 100;
    title.placeholder = 'Activity title';
    title.setAttribute('aria-label', `Step ${index + 1} title`);
    title.value = step.activity_title;
    title.addEventListener('input', () => { step.activity_title = title.value; });
    fields.appendChild(title);

    const picker = document.createElement('div');
    picker.className = 'step-actions';
    const pick = document.createElement('button');
    pick.type = 'button';
    pick.className = 'subtle';
    pick.textContent = step.image_id ? 'Change image' : 'Pick image';
    pick.setAttribute('aria-label', `Step ${index + 1} pick image`);
    pick.addEventListener('click', () => openIconLibrary(step));
    picker.appendChild(pick);
    if (step.image_id) {
      const clear = document.createElement('button');
      clear.type = 'button';
      clear.className = 'subtle';
      clear.textContent = 'No image';
      clear.setAttribute('aria-label', `Step ${index + 1} remove image`);
      clear.addEventListener('click', () => { step.image_id = null; renderDraft(); });
      picker.appendChild(clear);
    }
    fields.appendChild(picker);
    row.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'step-actions';
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'danger';
    remove.textContent = '✕';
    remove.setAttribute('aria-label', `Remove step ${index + 1}`);
    remove.addEventListener('click', () => { state.draft.splice(index, 1); renderDraft(); });
    actions.appendChild(remove);
    row.appendChild(actions);

    const url = document.createElement('input');
    url.type = 'text';
    url.className = 'step-url';
    url.placeholder = 'Canva, Google Slides, or audio link (optional)';
    url.setAttribute('aria-label', `Step ${index + 1} resource link`);
    url.value = step.external_url;
    url.addEventListener('input', () => { step.external_url = url.value; });
    row.appendChild(url);

    return row;
  }

  async function openBuilder(parentView) {
    state.activeParentView = parentView;
    state.draftScheduleId = null;
    els.audio.pause();
    els.builderModal.showModal();
    syncNav();
    await guarded(async () => {
      [state.schedules, state.images] = await Promise.all([api.listSchedules(), api.listImages()]);
      await loadDraft(state.schedules.some((s) => s.id === state.scheduleId) ? state.scheduleId : null);
    });
  }

  const closeBuilder = () => {
    els.builderModal.close();
    syncNav();
  };

  // Escape and Cancel discard unsaved edits; saving is always explicit.
  const cancelBuilder = () => {
    state.draft = [];
    closeBuilder();
    showError('');
  };

  async function saveBuilder(present) {
    const ok = await guarded(async () => {
      await persistDraft();
      return true;
    });
    if (!ok) return;
    const fromPresentation = state.activeParentView === 'presentation';
    closeBuilder();
    populateLandingSelect();
    await guarded(async () => {
      if (fromPresentation) await reloadItemsKeepingPlace();
      else if (present) await loadSchedule(state.scheduleId);
    }, state.view === 'landing' ? els.landingError : els.modalError);
    if (present) switchView('presentation');
  }

  els.settingsBtn.addEventListener('click', () => { els.settingsModal.showModal(); syncNav(); });
  els.settingsClose.addEventListener('click', () => els.settingsModal.close());
  // Clicking the dimmed area outside the dropdown closes it.
  els.settingsModal.addEventListener('click', (e) => { if (e.target === els.settingsModal) els.settingsModal.close(); });
  // Opens the library; with a draft step it runs in pick mode (click an icon to assign it and close).
  async function openIconLibrary(pickStep = null) {
    state.pickStep = pickStep;
    els.iconGrid.classList.toggle('pick-mode', Boolean(pickStep));
    els.iconsTitle.textContent = pickStep ? 'Choose an Icon' : 'Icon Library';
    els.iconsClose.textContent = pickStep ? 'Cancel' : 'Close Library';
    els.iconsModal.showModal();
    syncNav();
    await guarded(async () => {
      state.images = await api.listImages();
      renderIconLibrary();
    }, els.iconsError);
  }

  els.openIcons.addEventListener('click', () => openIconLibrary());
  els.iconsClose.addEventListener('click', () => els.iconsModal.close());
  [els.settingsModal, els.iconsModal].forEach((d) => d.addEventListener('close', syncNav));
  els.iconsModal.addEventListener('close', () => {
    state.pickStep = null;
    els.iconGrid.classList.remove('pick-mode');
  });
  els.builderModal.addEventListener('cancel', (e) => { e.preventDefault(); cancelBuilder(); });

  els.builderSave.addEventListener('click', () => saveBuilder(false));
  els.builderSavePresent.addEventListener('click', () => saveBuilder(true));
  els.builderCancel.addEventListener('click', cancelBuilder);

  els.scheduleSelect.addEventListener('change', () => {
    const id = Number(els.scheduleSelect.value);
    selectSchedule(id > 0 ? id : null);
  });

  els.present.addEventListener('click', () => guarded(async () => {
    if (!state.scheduleId) return;
    await loadSchedule(state.scheduleId);
    switchView('presentation');
  }, els.landingError));

  els.editFromLanding.addEventListener('click', () => { if (state.scheduleId) openBuilder('landing'); });
  els.quickEdit.addEventListener('click', () => { if (state.scheduleId) openBuilder('presentation'); });
  els.home.addEventListener('click', () => switchView('landing'));

  els.newClass.addEventListener('click', () => guarded(async () => {
    const created = await api.createSchedule('New Schedule', '');
    state.schedules = await api.listSchedules();
    selectSchedule(created.id);
    await openBuilder('landing');
    els.className.focus();
    els.className.select();
  }, els.landingError));

  els.deleteClass.addEventListener('click', () => guarded(async () => {
    const current = state.schedules.find((s) => s.id === state.scheduleId);
    if (!current || !window.confirm(`Delete "${current.name}" and all of its steps?`)) return;
    await api.deleteSchedule(current.id);
    state.schedules = await api.listSchedules();
    selectSchedule(null);
  }, els.landingError));

  els.resetProgress.addEventListener('click', () => {
    state.completed = new Set();
    state.activeIndex = state.items.length ? 0 : -1;
    renderSchedule();
  });

  /* ---------- Icon library ---------- */

  function renderIconLibrary() {
    if (!state.images.length) {
      const empty = document.createElement('p');
      empty.className = 'icon-empty';
      empty.textContent = 'No icons yet. Use "+ Add Icon" to import images.';
      els.iconGrid.replaceChildren(empty);
      return;
    }
    els.iconGrid.replaceChildren(...state.images.map((icon) => {
      const card = document.createElement('div');
      card.className = 'icon-thumb-card';
      card.dataset.iconId = String(icon.id);

      const img = document.createElement('img');
      img.src = assetUrl(icon.image_filename);
      img.alt = '';

      const name = document.createElement('input');
      name.type = 'text';
      name.className = 'icon-rename-field';
      name.maxLength = 100;
      name.value = icon.title;
      name.dataset.action = 'rename';
      name.setAttribute('aria-label', `Title for ${icon.title}`);

      const trash = document.createElement('button');
      trash.type = 'button';
      trash.className = 'danger btn-trash';
      trash.dataset.action = 'delete';
      trash.append(createTrashIcon());
      trash.setAttribute('aria-label', `Delete ${icon.title}`);

      card.append(img, name, trash);
      return card;
    }));
  }

  els.addIcon.addEventListener('click', () => guarded(async () => {
    const added = await api.uploadImage();
    if (!added) return;
    state.images = await api.listImages();
    renderIconLibrary();
  }, els.iconsError));

  els.iconGrid.addEventListener('click', (e) => {
    const card = e.target.closest('[data-icon-id]');
    if (state.pickStep && card) {
      state.pickStep.image_id = Number(card.dataset.iconId);
      els.iconsModal.close();
      renderDraft();
      return;
    }
    const target = e.target.closest('[data-action="delete"]');
    if (!target || !card) return;
    const id = Number(card.dataset.iconId);
    guarded(async () => {
      const usage = await api.getImageUsage(id);
      if (usage.length) {
        throw new Error(`This icon is used by: ${usage.map((s) => s.name).join(', ')}. Remove it from those schedules first.`);
      }
      if (!window.confirm('Delete this icon from the library?')) return;
      await api.deleteImage(id);
      state.images = await api.listImages();
      renderIconLibrary();
    }, els.iconsError);
  });

  // Instant tooltip for truncated titles (native title tooltips have a fixed ~1s delay).
  const iconTip = $('icon-tooltip');
  const hideIconTip = () => { iconTip.hidden = true; };

  els.iconGrid.addEventListener('mouseover', (e) => {
    const field = e.target.closest('.icon-rename-field');
    if (!field || field === document.activeElement || field.scrollWidth <= field.clientWidth) {
      hideIconTip();
      return;
    }
    iconTip.textContent = field.value;
    iconTip.hidden = false;
    const rect = field.getBoundingClientRect();
    const tipRect = iconTip.getBoundingClientRect();
    const left = Math.min(Math.max(8, rect.left + rect.width / 2 - tipRect.width / 2), window.innerWidth - tipRect.width - 8);
    const top = rect.top - tipRect.height - 6 < 8 ? rect.bottom + 6 : rect.top - tipRect.height - 6;
    iconTip.style.left = `${left}px`;
    iconTip.style.top = `${top}px`;
  });
  els.iconGrid.addEventListener('mouseleave', hideIconTip);
  els.iconGrid.addEventListener('focusin', hideIconTip);
  els.iconGrid.addEventListener('scroll', hideIconTip, true);
  els.iconsModal.addEventListener('close', hideIconTip);

  els.iconGrid.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target.dataset.action === 'rename') e.target.blur();
  });

  els.iconGrid.addEventListener('focusout', (e) => {
    if (e.target.dataset.action !== 'rename') return;
    const card = e.target.closest('[data-icon-id]');
    const id = Number(card.dataset.iconId);
    const current = state.images.find((i) => i.id === id);
    const title = e.target.value.trim();
    if (!current || title === current.title) return;
    if (!title) { e.target.value = current.title; return; }
    guarded(async () => {
      const updated = await api.renameImage(id, title);
      current.title = updated.title;
      e.target.value = updated.title;
    }, els.iconsError);
  });

  els.addStep.addEventListener('click', () => {
    state.draft.push({ activity_title: '', image_id: null, external_url: '' });
    renderDraft();
  });

  // A stream that can't play shows a message rather than the provider's viewer or sign-in page.
  els.audio.addEventListener('error', () => {
    if (!els.audio.dataset.src) return;
    state.audioFailed.add(els.audio.dataset.src);
    showStage();
  });

  api.onAuthPopupClosed(() => {
    if (els.frame.dataset.src) els.frame.src = els.frame.dataset.src;
  });

  els.youtubeSignIn.addEventListener('click', () => api.signInToYouTube());

  els.youtubeFallback.addEventListener('click', () => {
    const item = state.items[state.activeIndex];
    if (!item) return;
    if (!state.youtubeWatch.delete(item.external_url)) state.youtubeWatch.add(item.external_url);
    showStage();
  });

  /* ---------- App updates ---------- */

  const renderUpdateStatus = (status) => {
    els.updateStatus.textContent = status.message || '';
    const busy = ['checking', 'available', 'downloading', 'ready'].includes(status.state);
    els.checkUpdate.disabled = busy;
    els.downloadUpdate.hidden = status.state !== 'available';
    els.laterUpdate.hidden = status.state !== 'available';
    els.installUpdate.hidden = status.state !== 'ready';
  };

  api.onUpdateStatus(renderUpdateStatus);
  els.checkUpdate.addEventListener('click', async () => renderUpdateStatus(await api.checkForUpdates()));
  els.downloadUpdate.addEventListener('click', async () => renderUpdateStatus(await api.downloadUpdate()));
  els.laterUpdate.addEventListener('click', async () => renderUpdateStatus(await api.deferUpdate()));
  els.installUpdate.addEventListener('click', () => api.installUpdate());

  /* ---------- Startup ---------- */

  (async function init() {
    await guarded(async () => {
      audioProxyBase = await api.getAudioProxyBase();
      els.appVersion.textContent = `v${await api.getAppVersion()}`;
      renderUpdateStatus(await api.getUpdateStatus());
      state.schedules = await api.listSchedules();
      const saved = Number(localStorage.getItem(LAST_SCHEDULE_KEY));
      const start = state.schedules.find((s) => s.id === saved);
      selectSchedule(start ? start.id : null);
      switchView('landing');
    }, els.landingError);
  })();
})();
