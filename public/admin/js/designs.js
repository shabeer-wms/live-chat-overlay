// One-click looks. Each is a complete style except the spotlight settings, which stay as the user set them.
const base = {
  fontFamily: '-apple-system, "Segoe UI", Roboto, Arial, sans-serif', fontSize: 28, textColor: '#ffffff', nameColor: '#ffffff',
  bgColor: '#000000', bgOpacity: 0, radius: 10, maxMessages: 6, fadeSeconds: 0,
  animation: 'slide', animationOut: 'fade', showAvatar: true, showPlatform: true, position: 'bottom', customCss: '',
  boxWidth: 'fit', align: 'left', maxWidth: 60, layout: 'inline', showName: true, showBadges: true, showTime: false, nameColorBy: 'fixed',
}

export const DESIGNS = [
  { name: 'Midnight', note: 'Solid dark card', style: { ...base, nameColor: '#8ab4ff', bgColor: '#0f1218', bgOpacity: 92, radius: 12, animationOut: 'slide',
    customCss: '.msg{border:1px solid rgba(255,255,255,.09);box-shadow:0 8px 24px rgba(0,0,0,.35)}' } },
  { name: 'Clean Light', note: 'White card, platform edge', style: { ...base, textColor: '#1d2330', nameColor: '#1d2330', bgColor: '#ffffff', bgOpacity: 96, radius: 12, animation: 'pop', animationOut: 'pop',
    customCss: '.msg{box-shadow:0 6px 20px rgba(15,23,42,.22)}.msg.youtube{border-left:5px solid #ff0033}.msg.facebook{border-left:5px solid #1877f2}' } },
  { name: 'News Lower-third', note: 'Broadcast name block', style: { ...base, fontSize: 30, bgColor: '#0a1f44', bgOpacity: 96, radius: 0, maxMessages: 3, fadeSeconds: 14, animation: 'left', animationOut: 'left',
    customCss: '.msg{padding:0 18px 0 0;overflow:hidden}.name{background:#c8102e;padding:10px 16px;margin-right:14px;text-transform:uppercase;letter-spacing:.06em;font-size:.8em;display:inline-block}.avatar{display:none}' } },
  { name: 'Broadcast Gold', note: 'Serif with a gold frame', style: { ...base, fontFamily: 'Georgia, "Times New Roman", serif', nameColor: '#e6c36a', bgColor: '#0b0b0d', bgOpacity: 90, radius: 6, animation: 'fade',
    customCss: '.msg{border:1px solid #c9a24a;box-shadow:0 0 0 3px rgba(201,162,74,.15)}.name{letter-spacing:.04em}' } },
  { name: 'Clean Text', note: 'No box, just text', style: { ...base, fontSize: 30, showAvatar: false, radius: 0, fadeSeconds: 15,
    customCss: '.msg{padding:2px 0;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.6)}.name{text-transform:uppercase;letter-spacing:.08em;font-size:.72em;opacity:.85}' } },
  { name: 'Soft Pill', note: 'Rounded and friendly', style: { ...base, nameColor: '#ffd9a8', bgColor: '#2a2f42', bgOpacity: 90, radius: 40, animation: 'pop', animationOut: 'pop',
    customCss: '.msg{padding:8px 20px 8px 10px}' } },
  { name: 'Glass Stack', note: 'Name above, quiet frame', style: { ...base, layout: 'stacked', nameColor: '#9fb4ff', bgColor: '#0d1117', bgOpacity: 72, radius: 14, nameColorBy: 'platform',
    customCss: '.msg{border:1px solid rgba(255,255,255,.12)}.name{text-transform:uppercase;letter-spacing:.08em;font-size:.9em}' } },
  { name: 'Role Card', note: 'Big avatar, role colours, time', style: { ...base, layout: 'card', bgColor: '#141922', bgOpacity: 94, radius: 14, showTime: true, nameColorBy: 'role', animation: 'pop', animationOut: 'pop',
    customCss: '.msg{box-shadow:0 8px 20px rgba(0,0,0,.35)}' } },
  { name: 'Name Chip', note: 'Name as a coloured tag', style: { ...base, layout: 'chip', nameColor: '#ffd54a', bgColor: '#000000', bgOpacity: 58, radius: 10, animation: 'left', animationOut: 'left' } },
  { name: 'Compact Feed', note: 'Dense, small, many lines', style: { ...base, layout: 'compact', fontSize: 22, showAvatar: false, bgColor: '#000000', bgOpacity: 48, radius: 6, maxMessages: 10, fadeSeconds: 25, animation: 'fade', animationOut: 'fade', nameColor: '#ffd54a' } },
  { name: 'Speech Bubble', note: 'White bubble with a tail', style: { ...base, textColor: '#1d2330', nameColor: '#2f6fed', bgColor: '#ffffff', bgOpacity: 98, radius: 18, animation: 'pop', animationOut: 'pop',
    customCss: '.msg{position:relative;margin-left:14px;box-shadow:0 4px 14px rgba(15,23,42,.25)}.msg::after{content:"";position:absolute;left:-10px;bottom:12px;border-style:solid;border-width:8px 10px 8px 0;border-color:transparent #ffffff transparent transparent}' } },
  { name: 'Right Rail', note: 'Right-aligned, name above', style: { ...base, layout: 'stacked', align: 'right', bgColor: '#10141c', bgOpacity: 86, radius: 12, nameColor: '#8ab4ff', animation: 'right', animationOut: 'right',
    customCss: '.msg{border-right:4px solid var(--name);text-align:right}' } },
  { name: 'Underline', note: 'No box, accent underline', style: { ...base, layout: 'stacked', showAvatar: false, radius: 0, nameColor: '#ffffff', fadeSeconds: 20, animation: 'fade',
    customCss: '.msg{padding:2px 0;text-shadow:0 1px 3px rgba(0,0,0,.9),0 0 10px rgba(0,0,0,.6)}.name{border-bottom:2px solid #ffd54a;padding-bottom:1px}' } },
  { name: 'Neon Night', note: 'Dark with a cyan glow', style: { ...base, nameColor: '#00e5ff', bgColor: '#070b1a', bgOpacity: 86, radius: 10,
    customCss: '.msg{border:1px solid rgba(0,229,255,.4);box-shadow:0 0 18px rgba(0,229,255,.2),inset 0 0 12px rgba(0,229,255,.08)}' } },
  { name: 'Sunset', note: 'Warm gradient pills', style: { ...base, fontFamily: 'Georgia, "Times New Roman", serif', nameColor: '#fff3b0', bgColor: '#000000', bgOpacity: 0, radius: 30, animation: 'pop', animationOut: 'pop',
    customCss: '.msg{background:linear-gradient(90deg,#ff512f,#dd2476);box-shadow:0 6px 18px rgba(221,36,118,.3)}' } },
]

export const FONTS = [
  ['System UI', base.fontFamily],
  ['Georgia (serif)', 'Georgia, "Times New Roman", serif'],
  ['Trebuchet', '"Trebuchet MS", Arial, sans-serif'],
  ['Verdana', 'Verdana, Geneva, sans-serif'],
  ['Courier (mono)', '"Courier New", Courier, monospace'],
  ['Impact (bold)', 'Impact, "Arial Black", sans-serif'],
]
export const ANIMATIONS = [['slide', 'Slide up'], ['pop', 'Pop'], ['left', 'From left'], ['right', 'From right'], ['fade', 'Fade'], ['none', 'None']]

export const SAMPLES = [
  { id: 's1', platform: 'youtube', name: 'Aisha', badge: 'member', avatar: '', parts: [{ text: 'Great stream, greetings from Dubai! 🔥' }] },
  { id: 's2', platform: 'facebook', name: 'Rahul K', badge: '', avatar: '', parts: [{ text: 'Can you play my request?' }] },
  { id: 's3', platform: 'youtube', name: 'Maria', badge: 'mod', avatar: '', parts: [{ text: 'Sound quality is perfect today' }] },
]
