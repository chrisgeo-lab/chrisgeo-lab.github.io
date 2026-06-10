/**
 * Custom confirm dialog matching app styling.
 * Replaces native browser confirm() with styled modal.
 */

let activeConfirm = null;

/**
 * Show styled confirmation dialog.
 * @param {string} message - Confirmation message
 * @param {Object} [options] - { okText, cancelText, dangerous }
 * @returns {Promise<boolean>} - Resolves to true if confirmed, false if cancelled
 */
export function confirm(message, options = {}) {
  return new Promise((resolve) => {
    // Close any existing confirm
    if (activeConfirm) {
      document.body.removeChild(activeConfirm);
      activeConfirm = null;
    }

    const { okText = 'Confirm', cancelText = 'Cancel', dangerous = false } = options;

    // Create modal overlay
    const overlay = document.createElement('div');
    overlay.className = 'modal-overlay confirm-overlay show';
    overlay.innerHTML = `
      <div class="modal confirm-modal">
        <h3>Confirm Action</h3>
        <p>${message}</p>
        <div class="modal-actions">
          <button class="modal-btn modal-btn-cancel" id="confirmCancelBtn">${cancelText}</button>
          <button class="modal-btn ${dangerous ? 'modal-btn-danger' : 'modal-btn-primary'}" id="confirmOkBtn">${okText}</button>
        </div>
      </div>
    `;

    document.body.appendChild(overlay);
    activeConfirm = overlay;

    // Focus OK button by default
    setTimeout(() => overlay.querySelector('#confirmOkBtn').focus(), 100);

    // Handle button clicks
    overlay.querySelector('#confirmCancelBtn').onclick = () => {
      document.body.removeChild(overlay);
      activeConfirm = null;
      resolve(false);
    };

    overlay.querySelector('#confirmOkBtn').onclick = () => {
      document.body.removeChild(overlay);
      activeConfirm = null;
      resolve(true);
    };

    // Handle backdrop click
    overlay.onclick = (e) => {
      if (e.target === overlay) {
        document.body.removeChild(overlay);
        activeConfirm = null;
        resolve(false);
      }
    };

    // Handle Escape key
    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        document.body.removeChild(overlay);
        activeConfirm = null;
        document.removeEventListener('keydown', handleEscape);
        resolve(false);
      }
    };
    document.addEventListener('keydown', handleEscape);
  });
}
