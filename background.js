// background.js — CDP typing with explicit code/key/text and proper modifiers
const MOD = { Alt:1, Ctrl:2, Meta:4, Shift:8 };

const PUNCT = {
  "'": { code: 'Quote',        key: "'", text: "'", shift: false },
  '"': { code: 'Quote',        key: '"', text: '"', shift: true  },
  '[': { code: 'BracketLeft',  key: '[', text: '[', shift: false },
  '{': { code: 'BracketLeft',  key: '{', text: '{', shift: true  },
  ']': { code: 'BracketRight', key: ']', text: ']', shift: false },
  '}': { code: 'BracketRight', key: '}', text: '}', shift: true  },
  '\\':{ code: 'Backslash',    key: '\\',text: '\\',shift: false },
  '|': { code: 'Backslash',    key: '|', text: '|', shift: true  },
  ';': { code: 'Semicolon',    key: ';', text: ';', shift: false },
  ':': { code: 'Semicolon',    key: ':', text: ':', shift: true  },
  ',': { code: 'Comma',        key: ',', text: ',', shift: false },
  '<': { code: 'Comma',        key: '<', text: '<', shift: true  },
  '.': { code: 'Period',       key: '.', text: '.', shift: false },
  '>': { code: 'Period',       key: '>', text: '>', shift: true  },
  '/': { code: 'Slash',        key: '/', text: '/', shift: false },
  '?': { code: 'Slash',        key: '?', text: '?', shift: true  },
  '`': { code: 'Backquote',    key: '`', text: '`', shift: false },
  '~': { code: 'Backquote',    key: '~', text: '~', shift: true  },
  '-': { code: 'Minus',        key: '-', text: '-', shift: false },
  '_': { code: 'Minus',        key: '_', text: '_', shift: true  },
  '=': { code: 'Equal',        key: '=', text: '=', shift: false },
  '+': { code: 'Equal',        key: '+', text: '+', shift: true  },
  ' ': { code: 'Space',        key: ' ', text: ' ', shift: false },
  '!': { code: 'Digit1',       key: '!', text: '!', shift: true  },
  '@': { code: 'Digit2',       key: '@', text: '@', shift: true  },
  '#': { code: 'Digit3',       key: '#', text: '#', shift: true  },
  '$': { code: 'Digit4',       key: '$', text: '$', shift: true  },
  '%': { code: 'Digit5',       key: '%', text: '%', shift: true  },
  '^': { code: 'Digit6',       key: '^', text: '^', shift: true  },
  '&': { code: 'Digit7',       key: '&', text: '&', shift: true  },
  '*': { code: 'Digit8',       key: '*', text: '*', shift: true  },
  '(': { code: 'Digit9',       key: '(', text: '(', shift: true  },
  ')': { code: 'Digit0',       key: ')', text: ')', shift: true  }
};

function charMeta(ch){
  if (ch === '\n' || ch === '\r') return { code: 'Enter', key: 'Enter', text: '', printable:false, shift:false };
  if (/^[A-Za-z]$/.test(ch)){
    const upper = ch === ch.toUpperCase();
    const base = ch.toUpperCase();
    return { code: 'Key'+base, key: ch, text: ch, shift: upper, printable:true };
  }
  if (/^[0-9]$/.test(ch)){
    return { code: 'Digit'+ch, key: ch, text: ch, shift:false, printable:true };
  }
  if (PUNCT[ch]) return { ...PUNCT[ch], printable:true };
  return { code: '', key: ch, text: ch, shift:false, printable:true };
}

function sleep(ms){ return new Promise(r=>setTimeout(r,ms)); }

async function sendKey(tabId, meta){
  const mods = meta.shift ? MOD.Shift : 0;
  const down = { type:'keyDown', key: meta.key, code: meta.code || undefined };
  const up   = { type:'keyUp',   key: meta.key, code: meta.code || undefined };
  if (meta.printable) down.text = meta.text;
  if (mods) { down.modifiers = mods; up.modifiers = mods; }
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', down);
  await chrome.debugger.sendCommand({ tabId }, 'Input.dispatchKeyEvent', up);
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
