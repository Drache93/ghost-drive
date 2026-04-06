const { cellery: html } = require('cellery')

const app = html`<>
  <div id="root">
    <style>
      .loader-wrap {
        position: absolute;
        left: 0;
        top: 0;
        display: flex;
        align-items: center;
        justify-content: center;
        height: 100vh;
        width: 100vw;
        background: #0a0a0c;
        flex-direction: column;
        gap: 16px;
      }
      .loader-title {
        font-family: monospace;
        font-size: 11px;
        text-transform: uppercase;
        letter-spacing: 4px;
        color: #c8a84e;
      }
      .loader-spinner {
        width: 24px;
        height: 24px;
        border: 2px solid #27272e;
        border-top-color: #c8a84e;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin {
        to { transform: rotate(360deg); }
      }
    </style>
    <div class="loader-wrap">
      <h1 class="loader-title">Ghost Drive</h1>
      <div class="loader-spinner"></div>
    </div>
  </div>
</>`

module.exports = { app }
