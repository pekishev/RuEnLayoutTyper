const MOD = { Alt:1, Ctrl:2, Meta:4, Shift:8 };

// tabId -> { state: 'running'|'paused', cancelRequested: boolean, attached: boolean, text: string, i: number, toggles: Set<number>, delay: number }
const JOBS = new Map();

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

async function runTyping(tabId, job){
  while (job.i < job.text.length) {
    if (job.cancelRequested) { job.state = 'paused'; return; }
    if (job.toggles.has(job.i)) await sendAltShiftCombo(tabId);
    if (job.cancelRequested) { job.state = 'paused'; return; }
    const meta = charMeta(job.text[job.i]);
    await sendKey(tabId, meta);
    job.i++;
    if (job.delay) await sleep(job.delay);
  }
}

chrome.runtime.onMessage.addListener(async (msg, _sender, sendResponse) => {
  try {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (!tab?.id) return sendResponse({ ok:false, error:'No active tab' });

    if (msg?.type === 'CDP_STATUS') {
      const job = JOBS.get(tab.id);
      if (!job) return sendResponse({ ok:true, state:'idle' });
      return sendResponse({ ok:true, state: job.state, i: job.i, len: job.text?.length ?? 0 });
    }

    if (msg?.type === 'CDP_STOP') {
      const job = JOBS.get(tab.id);
      if (job) {
        if (job.state === 'paused') JOBS.delete(tab.id); // second Stop = clear
        else { job.cancelRequested = true; job.state = 'paused'; }
      }
      return sendResponse({ ok:true });
    }

    if (msg?.type === 'CDP_RESUME') {
      const job = JOBS.get(tab.id);
      if (!job || job.state !== 'paused' || job.i >= job.text.length) return sendResponse({ ok:false, error:'Nothing to resume' });
      job.cancelRequested = false;
      job.state = 'running';
      // If we are still attached (previous run is winding down), just unpause.
      if (!job.attached) {
        await chrome.debugger.attach({ tabId: tab.id }, '1.3');
        job.attached = true;
        await runTyping(tab.id, job);
        try { await chrome.debugger.detach({ tabId: tab.id }); } finally { job.attached = false; }
        if (job.i >= job.text.length) JOBS.delete(tab.id);
      }
      return sendResponse({ ok:true });
    }

    if (msg?.type === 'CDP_ALT_SHIFT') {
      const job = JOBS.get(tab.id);
      if (job?.state === 'running') return sendResponse({ ok:false, error:'Busy' });
    }

    await chrome.debugger.attach({ tabId: tab.id }, '1.3');

    if (msg?.type === 'CDP_ALT_SHIFT') {
      await sendAltShiftCombo(tab.id);
    } else if (msg?.type === 'CDP_TYPE_TEXT') {
      const { text, cps, altShiftPositions } = msg;
      // overwrite any previous (paused) job for this tab
      const job = {
        state: 'running',
        cancelRequested: false,
        attached: true,
        text: String(text ?? ''),
        i: 0,
        toggles: new Set(Array.isArray(altShiftPositions) ? altShiftPositions : []),
        delay: Math.max(0, Math.round(1000 / (cps ?? 40)))
      };
      JOBS.set(tab.id, job);
      await runTyping(tab.id, job);
      job.attached = false;
      if (job.i >= job.text.length) JOBS.delete(tab.id);
    } else {
      await chrome.debugger.detach({ tabId: tab.id });
      sendResponse({ ok:false, error:'Unknown message type' });
      return true;
    }

    await chrome.debugger.detach({ tabId: tab.id });
    sendResponse({ ok:true });
  } catch (e) {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (tab?.id) {
        await chrome.debugger.detach({ tabId: tab.id });
      }
    } catch {}
    // If we were stopped (detached intentionally), keep the paused job.
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true }).catch(() => []);
    const tabId = tab?.id;
    const job = tabId ? JOBS.get(tabId) : null;
    if (job?.state === 'paused') sendResponse({ ok:true });
    else sendResponse({ ok:false, error:String(e) });
  }
  return true;
});
