const MOD = { Alt:1, Ctrl:2, Meta:4, Shift:8 };

// tabId -> { state: 'running'|'paused', cancelRequested: boolean, attached: boolean, text: string, i: number, toggles: Set<number>, delay: number }
const JOBS = new Map();

const PUNCT = {
  "'": { code: 'Quote',        shift: false },
  '"': { code: 'Quote',        shift: true  },
  '[': { code: 'BracketLeft',  shift: false },
  '{': { code: 'BracketLeft',  shift: true  },
  ']': { code: 'BracketRight', shift: false },
  '}': { code: 'BracketRight', shift: true  },
  '\\':{ code: 'Backslash',    shift: false },
  '|': { code: 'Backslash',    shift: true  },
  ';': { code: 'Semicolon',    shift: false },
  ':': { code: 'Semicolon',    shift: true  },
  ',': { code: 'Comma',        shift: false },
  '<': { code: 'Comma',        shift: true  },
  '.': { code: 'Period',       shift: false },
  '>': { code: 'Period',       shift: true  },
  '/': { code: 'Slash',        shift: false },
  '?': { code: 'Slash',        shift: true  },
  '`': { code: 'Backquote',    shift: false },
  '~': { code: 'Backquote',    shift: true  },
  '-': { code: 'Minus',        shift: false },
  '_': { code: 'Minus',        shift: true  },
  '=': { code: 'Equal',        shift: false },
  '+': { code: 'Equal',        shift: true  },
  ' ': { code: 'Space',        shift: false },
  '!': { code: 'Digit1',       shift: true  },
  '@': { code: 'Digit2',       shift: true  },
  '#': { code: 'Digit3',       shift: true  },
  '$': { code: 'Digit4',       shift: true  },
  '%': { code: 'Digit5',       shift: true  },
  '^': { code: 'Digit6',       shift: true  },
  '&': { code: 'Digit7',       shift: true  },
  '*': { code: 'Digit8',       shift: true  },
  '(': { code: 'Digit9',       shift: true  },
  ')': { code: 'Digit0',       shift: true  }
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
  if (PUNCT[ch]) return { ...PUNCT[ch], key: ch, text: ch, printable:true };
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
