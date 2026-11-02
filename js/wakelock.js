// Keep the screen on (Screen Wake Lock API) while KotoLab is open, so the
// score and the tuner stay visible while your hands are on the strings.
// Browsers drop the lock when the tab is hidden; it is re-requested when
// the tab comes back. Some browsers only allow the request after a tap, so
// a failed request is retried on the next interaction.

export class ScreenWake {
  constructor({ onChange } = {}) {
    this.supported = typeof navigator !== 'undefined' && 'wakeLock' in navigator;
    this.enabled = false;
    this.sentinel = null;
    this.onChange = onChange;
    this.error = null;
    this.retryOnGesture = () => {
      if (this.enabled && !this.sentinel) this.acquire();
    };
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'visible' && this.enabled && !this.sentinel) this.acquire();
    });
  }

  get active() {
    return !!this.sentinel && !this.sentinel.released;
  }

  async enable() {
    this.enabled = true;
    if (!this.supported) {
      this.error = 'unsupported';
      this.emit();
      return false;
    }
    return this.acquire();
  }

  async disable() {
    this.enabled = false;
    window.removeEventListener('pointerdown', this.retryOnGesture);
    const s = this.sentinel;
    this.sentinel = null;
    try { await s?.release(); } catch { /* already released */ }
    this.emit();
  }

  async acquire() {
    if (!this.supported || document.visibilityState !== 'visible') { this.emit(); return false; }
    try {
      const s = await navigator.wakeLock.request('screen');
      if (!this.enabled) { s.release(); return false; }
      this.sentinel = s;
      this.error = null;
      s.addEventListener('release', () => {
        if (this.sentinel === s) this.sentinel = null;
        this.emit();
      });
      window.removeEventListener('pointerdown', this.retryOnGesture);
      this.emit();
      return true;
    } catch (err) {
      this.error = err.name || 'error';
      // e.g. needs a tap first, or battery saver refused: try again on the next interaction
      window.addEventListener('pointerdown', this.retryOnGesture, { once: true });
      this.emit();
      return false;
    }
  }

  emit() {
    this.onChange && this.onChange(this);
  }
}
