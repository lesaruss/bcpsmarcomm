// The request forms' look (MarComm Request Form, 2026-10-08), shared by
// /marcomm-request and /calendar-request.
export const REQUEST_FORM_CSS = `
.mcr { min-height: 100vh; background: #f5f5f5; font-family: 'Montserrat', -apple-system, 'Segoe UI', sans-serif; color: #1a1a1a; }
.mcr-header { position: sticky; top: 0; z-index: 10; height: 64px; background: #fff; border-bottom: 3px solid #1672A7; display: flex; align-items: center; gap: 18px; padding: 0 28px; box-shadow: 0 1px 4px rgba(0,0,0,0.08); }
.mcr-header img { height: 42px; width: auto; }
.mcr-header .div { width: 1px; height: 32px; background: rgba(0,0,0,0.12); }
.mcr-header .ttl { font-size: 12px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.16em; color: #1672A7; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.mcr-main { max-width: 860px; margin: 0 auto; padding: 32px 20px 64px; }
.mcr h1 { font-size: clamp(26px, 4vw, 36px); font-weight: 900; text-transform: uppercase; letter-spacing: -0.02em; margin: 0 0 8px; }
.lede { font-size: 15px; line-height: 1.7; color: rgba(26,26,26,0.75); margin: 0 0 22px; }
.mcr-card { background: #fff; border: 1px solid rgba(0,0,0,0.09); border-radius: 8px; padding: 22px 24px; margin-bottom: 16px; }
.mcr h2 { font-size: 11px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.2em; color: #1672A7; margin: 0 0 16px; }
.mcr label { display: flex; flex-direction: column; gap: 6px; font-size: 13px; font-weight: 700; color: #1a1a1a; min-width: 0; }
.mcr label.full { margin-top: 14px; }
.mcr .grid { display: grid; grid-template-columns: repeat(2, minmax(0,1fr)); gap: 14px; }
.mcr input:not([type=checkbox]):not([type=radio]), .mcr textarea, .mcr select { font: inherit; font-size: 14px; font-weight: 400; padding: 10px 12px; border: 1px solid rgba(0,0,0,0.22); border-radius: 6px; background: #fff; color: #1a1a1a; width: 100%; box-sizing: border-box; }
.mcr input:focus-visible, .mcr textarea:focus-visible { outline: 3px solid #1672A7; outline-offset: 1px; }
.mcr input.ro { background: #f3f4f6; color: rgba(26,26,26,0.75); }
.mcr fieldset { border: none; padding: 0; margin: 16px 0 0; }
.mcr legend a { color: #0e4e73; font-weight: 800; }
.mcr legend { font-size: 13px; font-weight: 700; margin-bottom: 8px; padding: 0; }
.lede a { color: #0e4e73; font-weight: 700; }
.hint { font-size: 12px; font-weight: 400; color: rgba(26,26,26,0.6); }
.radios { display: flex; gap: 16px; flex-wrap: wrap; }
.pick { flex-direction: row !important; align-items: center; gap: 8px !important; font-weight: 600 !important; cursor: pointer; }
.checks { display: grid; grid-template-columns: repeat(auto-fill, minmax(min(220px, 100%), 1fr)); gap: 8px; }
.pick.box { align-items: flex-start; border: 1px solid rgba(0,0,0,0.14); border-radius: 6px; padding: 10px 12px; background: #fafafa; }
.pick.box.on { border-color: #1672A7; background: rgba(22,114,167,0.06); }
.pick.box input { margin-top: 2px; }
.pick small { display: block; font-size: 11px; font-weight: 400; color: rgba(26,26,26,0.6); margin-top: 2px; }
.note { font-size: 13px; margin: 8px 0 0; }
.note a { color: #0e4e73; font-weight: 700; }
.files { font-size: 13px; margin: 8px 0 0 18px; }
.mcr-btn { font: inherit; font-size: 14px; font-weight: 800; padding: 13px 22px; border-radius: 6px; border: none; background: #1672A7; color: #fff; cursor: pointer; }
.mcr-btn:disabled { opacity: 0.6; cursor: default; }
.mcr-hp { position: absolute; left: -9999px; width: 1px; height: 1px; opacity: 0; }
.mcr-error { color: #b91c1c; font-size: 14px; font-weight: 600; }
.mcr-done p { font-size: 15px; line-height: 1.7; }
@media (max-width: 640px) {
  .mcr-header { padding: 0 16px; gap: 12px; }
  .mcr-header img { height: 34px; }
  .mcr-main { padding: 24px 16px 48px; }
  .mcr .grid { grid-template-columns: minmax(0,1fr); }
  .mcr-card { padding: 18px 16px; }
}
`
