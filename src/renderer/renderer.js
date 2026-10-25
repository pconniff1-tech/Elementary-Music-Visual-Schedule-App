(function () {
  const { formatPresentationUrl, getAudioStreamUrl } = window.ScheduleUtils;
  const api = window.scheduleApi;
  const LAST_SCHEDULE_KEY = 'lastScheduleId';
  let audioProxyBase = '';

  const $ = (id) => document.getElementById(id);
  const els = {
    gear: $('gear-btn'),
    frame: $('presentation-frame'),
    placeholder: $('stage-placeholder'),
    stageTitle: $('stage-title'),
    stageImage: $('stage-image'),
    stageHint: $('stage-hint'),
    audioStage: $('audio-resource-player'),
    audioImage: $('audio-stage-graphic'),
    audio: $('native-audio-element'),
    bottom: $('bottom-row-container'),
    modal: $('setup-modal'),
    modalError: $('modal-error'),
    closeBtn: $('close-modal-btn'),
    classSelect: $('class-select-dropdown'),
    className: $('class-name-input'),
    classGrade: $('class-grade-input'),
    newClass: $('new-class-btn'),
    deleteClass: $('delete-class-btn'),
    resetProgress: $('reset-progress-btn'),
    stepList: $('item-sequence-list'),
    addStep: $('add-step-btn'),
    appVersion: $('app-version'),
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
    activeIndex: -1,
    draft: [],
    draftScheduleId: null
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
    const url = item ? formatPresentationUrl(item.external_url) : '';

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
    if (state.activeIndex < 0 || !state.items.length) return;
    state.completed.add(state.activeIndex);
    state.activeIndex = state.activeIndex + 1 < state.items.length ? state.activeIndex + 1 : -1;
    renderSchedule();
  }

  function stepBack() {
    if (!state.items.length) return;
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

  /* ---------- Setup modal ---------- */

  function showError(message) {
    els.modalError.textContent = message || '';
    els.modalError.hidden = !message;
  }

  async function guarded(fn) {
    try {
      showError('');
      return await fn();
    } catch (e) {
      showError((e && e.message ? e.message : String(e)).replace(/^Error invoking remote method '[^']*': (Error: )?/, ''));
      return undefined;
    }
  }

  function populateScheduleSelect() {
    els.classSelect.replaceChildren();
    state.schedules.forEach((s) => {
      const opt = document.createElement('option');
      opt.value = String(s.id);
      opt.textContent = s.grade_level ? `${s.name} (${s.grade_level})` : s.name;
      els.classSelect.appendChild(opt);
    });
    if (state.draftScheduleId) els.classSelect.value = String(state.draftScheduleId);
    const current = state.schedules.find((s) => s.id === state.draftScheduleId);
    els.className.value = current ? current.name : '';
    els.classGrade.value = current && current.grade_level ? current.grade_level : '';
    const has = Boolean(current);
    [els.className, els.classGrade, els.deleteClass, els.addStep, els.resetProgress].forEach((el) => { el.disabled = !has; });
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
    populateScheduleSelect();
    renderDraft();
  }

  async function persistDraft() {
    if (!state.draftScheduleId) return;
    const id = state.draftScheduleId;
    await api.updateSchedule(id, els.className.value, els.classGrade.value);
    await api.saveItems(id, state.draft);
    state.schedules = await api.listSchedules();
  }

  function renderDraft() {
    els.stepList.replaceChildren();
    state.draft.forEach((step, index) => els.stepList.appendChild(createStepRow(step, index)));
  }

  function createStepRow(step, index) {
    const row = document.createElement('div');
    row.className = 'step-row';

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
    const select = document.createElement('select');
    select.setAttribute('aria-label', `Step ${index + 1} image`);
    const none = document.createElement('option');
    none.value = '';
    none.textContent = '— No image —';
    select.appendChild(none);
    state.images.forEach((img) => {
      const opt = document.createElement('option');
      opt.value = String(img.id);
      opt.textContent = img.title;
      select.appendChild(opt);
    });
    select.value = step.image_id ? String(step.image_id) : '';
    select.addEventListener('change', () => {
      step.image_id = select.value ? Number(select.value) : null;
      renderDraft();
    });
    const upload = document.createElement('button');
    upload.type = 'button';
    upload.className = 'subtle';
    upload.textContent = 'Upload image…';
    upload.addEventListener('click', () => guarded(async () => {
      const added = await api.uploadImage();
      if (!added) return;
      state.images = await api.listImages();
      step.image_id = added.id;
      renderDraft();
    }));
    picker.append(select, upload);
    fields.appendChild(picker);
    row.appendChild(fields);

    const actions = document.createElement('div');
    actions.className = 'step-actions';
    const mk = (label, aria, handler, disabled, cls) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.textContent = label;
      b.setAttribute('aria-label', `${aria} step ${index + 1}`);
      if (cls) b.className = cls;
      b.disabled = disabled;
      b.addEventListener('click', handler);
      return b;
    };
    const move = (delta) => () => {
      const target = index + delta;
      [state.draft[index], state.draft[target]] = [state.draft[target], state.draft[index]];
      renderDraft();
    };
    actions.append(
      mk('↑', 'Move up', move(-1), index === 0, 'subtle'),
      mk('↓', 'Move down', move(1), index === state.draft.length - 1, 'subtle'),
      mk('✕', 'Remove', () => { state.draft.splice(index, 1); renderDraft(); }, false, 'danger')
    );
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

  async function openModal() {
    els.modal.hidden = false;
    api.setNavEnabled(false);
    await guarded(async () => {
      [state.schedules, state.images] = await Promise.all([api.listSchedules(), api.listImages()]);
      const id = state.schedules.some((s) => s.id === state.scheduleId) ? state.scheduleId : (state.schedules[0] && state.schedules[0].id) || null;
      await loadDraft(id);
    });
  }

  async function closeModal() {
    const ok = await guarded(async () => {
      await persistDraft();
      return true;
    });
    if (!ok) return;
    els.modal.hidden = true;
    api.setNavEnabled(true);
    await guarded(() => loadSchedule(state.draftScheduleId));
  }

  els.gear.addEventListener('click', openModal);
  els.closeBtn.addEventListener('click', closeModal);

  els.classSelect.addEventListener('change', () => guarded(async () => {
    const next = Number(els.classSelect.value);
    await persistDraft();
    await loadDraft(next);
  }));

  els.newClass.addEventListener('click', () => guarded(async () => {
    await persistDraft();
    const created = await api.createSchedule('New Class', '');
    state.schedules = await api.listSchedules();
    await loadDraft(created.id);
    els.className.focus();
    els.className.select();
  }));

  els.deleteClass.addEventListener('click', () => guarded(async () => {
    const current = state.schedules.find((s) => s.id === state.draftScheduleId);
    if (!current || !window.confirm(`Delete "${current.name}" and all of its steps?`)) return;
    await api.deleteSchedule(current.id);
    state.schedules = await api.listSchedules();
    if (state.scheduleId === current.id) state.scheduleId = null;
    await loadDraft(state.schedules[0] ? state.schedules[0].id : null);
  }));

  els.resetProgress.addEventListener('click', () => {
    state.completed = new Set();
    state.activeIndex = state.items.length ? 0 : -1;
    renderSchedule();
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

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && !els.modal.hidden) closeModal();
  });

  /* ---------- Startup ---------- */

  (async function init() {
    await guarded(async () => {
      audioProxyBase = await api.getAudioProxyBase();
      els.appVersion.textContent = `Version ${await api.getAppVersion()}`;
      renderUpdateStatus(await api.getUpdateStatus());
      state.schedules = await api.listSchedules();
      const saved = Number(localStorage.getItem(LAST_SCHEDULE_KEY));
      const start = state.schedules.find((s) => s.id === saved) || state.schedules[0];
      state.scheduleId = start ? start.id : null;
      await loadSchedule(state.scheduleId);
    });
  })();
})();
