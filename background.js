const MOD = { Alt:1, Ctrl:2, Meta:4, Shift:8 };

const SHIFT_LEFT = Object.freeze({
  keyDown: { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: MOD.Shift },
  keyUp:   { type: 'keyUp',   key: 'Shift', code: 'ShiftLeft', windowsVirtualKeyCode: 16, nativeVirtualKeyCode: 16, modifiers: 0 }
});

const PUNCT = {
  "'": { code: 'Quote',        text: "'", shift: false, vk: 222, baseKey:"'" },
  '"': { code: 'Quote',        text: '"', shift: true,  vk: 222, baseKey:"'" },
  '[': { code: 'BracketLeft',  text: '[', shift: false, vk: 219, baseKey:"[" },
  '{': { code: 'BracketLeft',  text: '{', shift: true,  vk: 219, baseKey:"[" },
  ']': { code: 'BracketRight', text: ']', shift: false, vk: 221, baseKey:"]" },
  '}': { code: 'BracketRight', text: '}', shift: true,  vk: 221, baseKey:"]" },
  '\\':{ code: 'Backslash',    text: '\\',shift: false, vk: 220, baseKey:"\\" },
  '|': { code: 'Backslash',    text: '|', shift: true,  vk: 220, baseKey:"\\" },
  ';': { code: 'Semicolon',    text: ';', shift: false, vk: 186, baseKey:";" },
  ':': { code: 'Semicolon',    text: ':', shift: true,  vk: 186, baseKey:";" },
  ',': { code: 'Comma',        text: ',', shift: false, vk: 188, baseKey:"," },
  '<': { code: 'Comma',        text: '<', shift: true,  vk: 188, baseKey:"," },
  '.': { code: 'Period',       text: '.', shift: false, vk: 190, baseKey:"." },
  '>': { code: 'Period',       text: '>', shift: true,  vk: 190, baseKey:"." },
  '/': { code: 'Slash',        text: '/', shift: false, vk: 191, baseKey:"/" },
  '?': { code: 'Slash',        text: '?', shift: true,  vk: 191, baseKey:"/" },
  '`': { code: 'Backquote',    text: '`', shift: false, vk: 192, baseKey:"`" },
  '~': { code: 'Backquote',    text: '~', shift: true,  vk: 192, baseKey:"`" },
  '-': { code: 'Minus',        text: '-', shift: false, vk: 189, baseKey:"-" },
  '_': { code: 'Minus',        text: '_', shift: true,  vk: 189, baseKey:"-" },
  '=': { code: 'Equal',        text: '=', shift: false, vk: 187, baseKey:"=" },
  '+': { code: 'Equal',        text: '+', shift: true,  vk: 187, baseKey:"=" },
  ' ': { code: 'Space',        text: ' ', shift: false, vk: 32,  baseKey:" " },
  '!': { code: 'Digit1',       text: '!', shift: true,  vk: 49,  baseKey:"1" },
  '@': { code: 'Digit2',       text: '@', shift: true,  vk: 50,  baseKey:"2" },
  '#': { code: 'Digit3',       text: '#', shift: true,  vk: 51,  baseKey:"3" },
  '$': { code: 'Digit4',       text: '$', shift: true,  vk: 52,  baseKey:"4" },
  '%': { code: 'Digit5',       text: '%', shift: true,  vk: 53,  baseKey:"5" },
  '^': { code: 'Digit6',       text: '^', shift: true,  vk: 54,  baseKey:"6" },
  '&': { code: 'Digit7',       text: '&', shift: true,  vk: 55,  baseKey:"7" },
  '*': { code: 'Digit8',       text: '*', shift: true,  vk: 56,  baseKey:"8" },
  '(': { code: 'Digit9',       text: '(', shift: true,  vk: 57,  baseKey:"9" },
  ')': { code: 'Digit0',       text: ')', shift: true,  vk: 48,  baseKey:"0" }
};

function charMeta(ch){
  if (ch === '\n' || ch === '\r') return { code: 'Enter', printable:false, shift:false, vk:13, baseKey:'Enter' };
  if (/^[A-Za-z]$/.test(ch)){
    const upper = ch === ch.toUpperCase();
    const base = ch.toUpperCase();
    const lo = ch.toLowerCase();
    return { code: 'Key'+base, baseKey: lo, text: ch, shift: upper, printable:true, vk: base.charCodeAt(0) };
  }
  if (/^[0-9]$/.test(ch)){
    return { code: 'Digit'+ch, baseKey: ch, text: ch, shift:false, printable:true, vk: 48 + Number(ch) };
  }
  if (PUNCT[ch]) return { ...PUNCT[ch], printable:true };
  return { code: '', baseKey: ch, text: ch, shift:false, printable:true };
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function sendKey(tabId, meta){
  const mods = meta.shift ? MOD.Shift : 0;
  const needShift = !!meta.shift;
  const baseKey = meta.baseKey ?? '';
  const down = { type: 'keyDown', key: baseKey, code: meta.code || undefined };
  const up   = { type:'keyUp',   key: baseKey, code: meta.code || undefined };
  if (meta.vk) {
    down.windowsVirtualKeyCode = meta.vk;
    down.nativeVirtualKeyCode = meta.vk;
    up.windowsVirtualKeyCode = meta.vk;
    up.nativeVirtualKeyCode = meta.vk;
  }
  if (mods) { down.modifiers = mods; up.modifiers = mods; }

  if (needShift) await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', SHIFT_LEFT.keyDown);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', down);

  if (meta.printable && meta.text) {
    const ch = { type:'char', text: meta.text };
    await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', ch);
  }

  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', up);
  if (needShift) await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', SHIFT_LEFT.keyUp);
}

async function sendAltShiftCombo(tabId){
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type:'keyDown', key:'Alt',   code:'AltLeft',   modifiers: MOD.Alt });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type:'keyDown', key:'Shift', code:'ShiftLeft', modifiers: MOD.Alt | MOD.Shift });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type:'keyUp',   key:'Shift', code:'ShiftLeft', modifiers: MOD.Alt });
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', { type:'keyUp',   key:'Alt',   code:'AltLeft',   modifiers: 0 });
}

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  if (msg?.type !== 'CDP_TYPE_TEXT') return;
  const { text, cps, altShiftPositions } = msg;
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return sendResponse({ ok:false, error:'No active tab' });
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    const delay = Math.max(0, Math.round(1000 / (cps ?? 40)));
    const toggles = new Set(Array.isArray(altShiftPositions) ? altShiftPositions : []);

    for (let i=0;i<text.length;i++){
      if (toggles.has(i)) await sendAltShiftCombo(tab.id);
      const meta = charMeta(text[i]);
      await sendKey(tab.id, meta);
      if (delay) await sleep(delay);
    }

    await chrome.debugger.detach({ tabId: tab.id });
    sendResponse({ ok:true });
  } catch (e) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) await chrome.debugger.detach({ tabId: tab.id });
    } catch {}
    sendResponse({ ok:false, error:String(e) });
  }
  return true;
});
