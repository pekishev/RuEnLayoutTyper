const MOD = { Alt:1, Ctrl:2, Meta:4, Shift:8 };

const SHIFT_LEFT = Object.freeze({
  keyDown: { type: 'keyDown', key: 'Shift', code: 'ShiftLeft', modifiers: MOD.Shift },
  keyUp:   { type: 'keyUp',   key: 'Shift', code: 'ShiftLeft', modifiers: 0 }
});

const PUNCT = {
  "'": { code: 'Quote',        shift: false, baseKey:"'" },
  '"': { code: 'Quote',        shift: true,  baseKey:"'" },
  '[': { code: 'BracketLeft',  shift: false, baseKey:"[" },
  '{': { code: 'BracketLeft',  shift: true,  baseKey:"[" },
  ']': { code: 'BracketRight', shift: false, baseKey:"]" },
  '}': { code: 'BracketRight', shift: true,  baseKey:"]" },
  '\\':{ code: 'Backslash',    shift: false, baseKey:"\\" },
  '|': { code: 'Backslash',    shift: true,  baseKey:"\\" },
  ';': { code: 'Semicolon',    shift: false, baseKey:";" },
  ':': { code: 'Semicolon',    shift: true,  baseKey:";" },
  ',': { code: 'Comma',        shift: false, baseKey:"," },
  '<': { code: 'Comma',        shift: true,  baseKey:"," },
  '.': { code: 'Period',       shift: false, baseKey:"." },
  '>': { code: 'Period',       shift: true,  baseKey:"." },
  '/': { code: 'Slash',        shift: false, baseKey:"/" },
  '?': { code: 'Slash',        shift: true,  baseKey:"/" },
  '`': { code: 'Backquote',    shift: false, baseKey:"`" },
  '~': { code: 'Backquote',    shift: true,  baseKey:"`" },
  '-': { code: 'Minus',        shift: false, baseKey:"-" },
  '_': { code: 'Minus',        shift: true,  baseKey:"-" },
  '=': { code: 'Equal',        shift: false, baseKey:"=" },
  '+': { code: 'Equal',        shift: true,  baseKey:"=" },
  ' ': { code: 'Space',        shift: false, baseKey:" " },
  '!': { code: 'Digit1',       shift: true,  baseKey:"1" },
  '@': { code: 'Digit2',       shift: true,  baseKey:"2" },
  '#': { code: 'Digit3',       shift: true,  baseKey:"3" },
  '$': { code: 'Digit4',       shift: true,  baseKey:"4" },
  '%': { code: 'Digit5',       shift: true,  baseKey:"5" },
  '^': { code: 'Digit6',       shift: true,  baseKey:"6" },
  '&': { code: 'Digit7',       shift: true,  baseKey:"7" },
  '*': { code: 'Digit8',       shift: true,  baseKey:"8" },
  '(': { code: 'Digit9',       shift: true,  baseKey:"9" },
  ')': { code: 'Digit0',       shift: true,  baseKey:"0" }
};

function charMeta(ch){
  if (ch === '\n' || ch === '\r') return { code: 'Enter', printable:false, shift:false, baseKey:'Enter' };
  if (/^[A-Za-z]$/.test(ch)){
    const upper = ch === ch.toUpperCase();
    const base = ch.toUpperCase();
    const lo = ch.toLowerCase();
    return { code: 'Key'+base, baseKey: lo, text: ch, shift: upper, printable:true };
  }
  if (/^[0-9]$/.test(ch)){
    return { code: 'Digit'+ch, baseKey: ch, text: ch, shift:false, printable:true };
  }
  if (PUNCT[ch]) return { ...PUNCT[ch], text: ch, printable:true };
  return { code: '', baseKey: ch, text: ch, shift:false, printable:true };
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function sendKey(tabId, meta){
  const mods = meta.shift ? MOD.Shift : 0;
  const needShift = !!meta.shift;
  const baseKey = meta.baseKey ?? '';
  const down = { type: 'keyDown', key: baseKey, code: meta.code || undefined };
  const up   = { type:'keyUp',   key: baseKey, code: meta.code || undefined };
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
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return sendResponse({ ok:false, error:'No active tab' });
    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    if (msg?.type === 'CDP_ALT_SHIFT') {
      await sendAltShiftCombo(tab.id);
    } else if (msg?.type === 'CDP_TYPE_TEXT') {
      const { text, cps, altShiftPositions } = msg;
      const delay = Math.max(0, Math.round(1000 / (cps ?? 40)));
      const toggles = new Set(Array.isArray(altShiftPositions) ? altShiftPositions : []);

      for (let i=0;i<text.length;i++){
        if (toggles.has(i)) await sendAltShiftCombo(tab.id);
        const meta = charMeta(text[i]);
        await sendKey(tab.id, meta);
        if (delay) await sleep(delay);
      }
    } else {
      await chrome.debugger.detach({ tabId: tab.id });
      return;
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
