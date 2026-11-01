# Feature Specification: Landing Page & Modularized Schedule Workflow

This document serves as the implementation blueprint for transforming the consolidated modal into a clean, multi-view architecture. It isolates the presentation layer, the configuration panels, and the icon library to maintain a clean context footprint and prevent token bloat during agent refactoring sessions.

---

## 💻 1. Core Architecture Overview

The single-modal system is replaced by a high-level **View State Machine** in `renderer.js` coupled with contextual overlay modals.

```
                  ┌──────────────────────────────┐
                  │      1. Landing Page         │
                  └──────────────┬───────────────┘
                                 │
         ┌───────────────────────┴───────────────────────┐
         ▼                                               ▼
┌──────────────────────────────┐                ┌──────────────────────────────┐
│  2. Presentation View        │                │  3. Schedule Builder (Modal) │
│  (Classroom Mode)            │                │  (Add, Delete, Drag/Drop)    │
└──────────────────────────────┘                └──────────────────────────────┘
```

- **Views:** Toggled via CSS classes (`.is-hidden { display: none; }`) or DOM manipulation in a single-page arrangement inside `index.html`.
- **Modals:** UI overlays handled by `<dialog>` elements or floating absolute wrappers managed via event delegation.

---

## 🌐 2. Screen & Workflow Specifications

### View A: Landing Page
The initial viewport when the application initializes.
*   **Header Block:**
    *   Centrally aligned App Title.
    *   App Version displayed cleanly immediately underneath (e.g., `v2.1.0`).
    *   ⚙️ **Gear Icon (Top-Right):** Triggers the *Global Settings Dropdown/Modal* containing:
        *   "Check for Updates" action link/button.
        *   "Sign into YouTube" authentication toggle.
*   **Workflow Section:**
    *   **Schedule Selector Dropdown (`<select>`):** Populated dynamically via `better-sqlite3` data fetching.
    *   **Action Row (Hidden until a schedule is selected):**
        *   `Present` Button: Switches active view state to full-screen classroom presentation mode.
        *   `Edit` Button: Retains the landing page view state but fires open the *Schedule Builder Modal*.
*   **Footer Actions:**
    *   📂 **Icon Library Button:** Dedicated entry point to open the asset management overlay.

### View B: Presentation View (Classroom Mode)
Switches the interface to an immersive display optimized for student interaction.
*   **Persistent Overlays (Top Corner Controls):**
    *   Two floating, semi-transparent buttons placed outside standard layout flows:
        *   🏠 **Home Button:** Instantly drops presentation view state and takes the user back to the Landing Page.
        *   ✏️ **Edit Button:** Directly opens the *Schedule Builder Modal* targeting this active schedule. This allows teachers to change, append, or re-order elements instantly mid-class without losing their spot.

### Modal 1: Schedule Builder
The redesigned constructor workflow.
*   **Workspace Canvas:** Displays a drag-and-drop chronological row or list of visual cards representing active schedule items.
*   **Row Controls:** Every item contains explicit triggers for **Delete** and contextual positioning via drag and drop.
*   **Global Actions:**
    *   `Save` Button: Persists changes back to SQLite; leaves modal open or returns cleanly to the prior active view.
    *   `Save & Present` Button: Commits schema changes directly, forces a re-render of presentation components, dismisses the builder, and boots immediately into the full-screen Classroom Mode.

### Modal 2: Icon Library
An asset manager window to manage visual targets decoupled from schedule arrays.
*   **Asset Toolbar:**
    *   `+ Add Icon` Button: Invokes the Electron main process native system file-chooser wrapper (`dialog.showOpenDialog`) to select image files from the host environment.
*   **Grid Framework:**
    *   A responsive CSS grid displaying thumbnail previews of every stored asset image.
    *   Each card features:
        *   Editable Title String field (auto-updates or commits on blur).
        *   🗑️ **Trashcan Icon:** Triggers cascading data checks to flag or intercept asset deletes if the icon is currently bound to an active schedule.

---

## 🛠️ 3. Implementation Matrix

### Front-End Structure (`index.html`)
```html
<!-- App Container -->
<div id="app-root">

  <!-- VIEW 1: LANDING PAGE -->
  <section id="view-landing" class="view-panel">
    <div class="top-bar">
      <button id="btn-global-settings" class="icon-btn">⚙️</button>
    </div>
    
    <div class="hero-brand">
      <h1>Visual Schedule Planner</h1>
      <span id="app-version-label" class="version-text">v0.0.0</span>
    </div>

    <div class="schedule-selector-card">
      <label for="select-schedule">Pick a Visual Schedule</label>
      <select id="select-schedule">
        <option value="" disabled selected>Select a profile...</option>
      </select>
      
      <div id="schedule-actions-row" class="actions-row is-hidden">
        <button id="btn-action-present" class="btn-primary">Present</button>
        <button id="btn-action-edit" class="btn-secondary">Edit</button>
      </div>
    </div>

    <div class="footer-bar">
      <button id="btn-open-icons" class="btn-link">📂 Open Icon Library</button>
    </div>
  </section>

  <!-- VIEW 2: PRESENTATION SCREEN -->
  <section id="view-presentation" class="view-panel is-hidden">
    <!-- Floating Transparent Classroom Controls -->
    <div class="floating-classroom-controls">
      <button id="btn-present-home" class="btn-translucent">🏠 Home</button>
      <button id="btn-present-quick-edit" class="btn-translucent">✏️ Edit</button>
    </div>
    
    <div id="presentation-canvas">
      <!-- Active timeline gets dynamically drawn here -->
    </div>
  </section>

  <!-- MODAL: SCHEDULE BUILDER -->
  <dialog id="modal-builder" class="app-modal">
    <div class="modal-header">
      <h2>Edit Schedule: <span id="builder-schedule-title">...</span></h2>
    </div>
    <div class="modal-body">
      <div id="builder-timeline-dropzone" class="drag-grid">
        <!-- Event delegation targets render here -->
      </div>
    </div>
    <div class="modal-footer">
      <button id="btn-builder-save" class="btn-save">Save</button>
      <button id="btn-builder-save-present" class="btn-save-present">Save & Present</button>
      <button id="btn-builder-close" class="btn-close">Cancel</button>
    </div>
  </dialog>

  <!-- MODAL: ICON LIBRARY -->
  <dialog id="modal-icons" class="app-modal">
    <div class="modal-header">
      <h2>Icon Asset Library</h2>
      <button id="btn-add-system-icon" class="btn-accent">+ Add System Icon</button>
    </div>
    <div class="modal-body">
      <div id="icon-library-grid" class="thumbnail-grid">
        <!-- Icons map template dynamically injected here -->
      </div>
    </div>
    <div class="modal-footer">
      <button id="btn-icons-close" class="btn-close">Close Library</button>
    </div>
  </dialog>

</div>
```

---

## 📡 4. IPC & Event Delegation Rules (`renderer.js` / `preload.js`)

To keep token overhead compact and maximize efficiency when using VS Code workspace tasks, do not write distinct inline event listeners for every single asset item or view change. Implement centralized event delegation on root wrappers.

### View Switching Controller
```javascript
const views = {
  landing: document.getElementById('view-landing'),
  presentation: document.getElementById('view-presentation')
};

function switchView(targetKey) {
  Object.keys(views).forEach(key => {
    views[key].classList.add('is-hidden');
  });
  views[targetKey].classList.remove('is-hidden');
}
```

### Dropdown Value Change Listener
```javascript
const selectSchedule = document.getElementById('select-schedule');
const actionsRow = document.getElementById('schedule-actions-row');

selectSchedule.addEventListener('change', (e) => {
  if (e.target.value) {
    actionsRow.classList.remove('is-hidden');
  } else {
    actionsRow.classList.add('is-hidden');
  }
});
```

### Icon Library Management Mechanics
When rendering individual thumbnails within the `#icon-library-grid`, apply direct resource IDs on the containing markup using HTML5 data attributes:

```html
<!-- Inside the runtime template builder string -->
<div class="icon-thumb-card" data-icon-id="${icon.id}">
  <img src="${icon.localPath}" alt="Thumbnail">
  <input type="text" class="icon-rename-field" value="${icon.name}" data-action="rename">
  <button class="btn-trash" data-action="delete">🗑️</button>
</div>
```

**Delegated Event Core Hook:**
```javascript
document.getElementById('icon-library-grid').addEventListener('click', async (e) => {
  const actionTarget = e.target.closest('[data-action]');
  if (!actionTarget) return;

  const cardElement = e.target.closest('[data-icon-id]');
  const iconId = cardElement.dataset.iconId;
  const actionType = actionTarget.dataset.action;

  if (actionType === 'delete') {
    const confirmed = confirm("Are you sure you want to delete this icon? It will impact any schedules utilizing it.");
    if (confirmed) {
      await window.api.deleteIconAsset(iconId);
      // Trigger local UI cleanup or fetch re-render
    }
  }
});

// Capture title naming alterations on loss of focus
document.getElementById('icon-library-grid').addEventListener('blur', async (e) => {
  if (e.target.dataset.action === 'rename') {
    const cardElement = e.target.closest('[data-icon-id]');
    const iconId = cardElement.dataset.iconId;
    const updatedName = e.target.value.trim();
    
    if (updatedName) {
      await window.api.updateIconName(iconId, updatedName);
    }
  }
}, true); // Use capture phase to intercept focusout/blur events safely
```

---

## 🔒 5. Agent Instructions for VS Code Prompt Assembly
When feeding changes into your VS Code context window, use the following directives to prevent breaking existing features:
1. **Preserve Database Connections:** Maintain all existing `better-sqlite3` bindings running via `app.js` main orchestration loops. Intercept and wire new operations (like deleting or editing raw icon entries) to existing table architectures.
2. **Handle Context State Splits:** Ensure that when the Schedule Builder opens from the floating presentation context overlay, closing or saving from that modal returns execution cleanly to the **Presentation Screen**, whereas if initialized from the initial window, it returns to the **Landing Page View**. Use a tracking reference pointer variable (e.g., `let activeParentView = 'landing'`) to handle context restoration dynamically.
