let audioCtx = null;

function getCtx() {
  if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  if (audioCtx.state === 'suspended') audioCtx.resume();
  return audioCtx;
}

function nota(ctx, freq, tipo, inicio, duracao, vol = 0.28) {
  const osc = ctx.createOscillator(), gain = ctx.createGain();
  osc.connect(gain);
  gain.connect(ctx.destination);
  osc.type = tipo;
  osc.frequency.setValueAtTime(freq, ctx.currentTime + inicio);
  gain.gain.setValueAtTime(0, ctx.currentTime + inicio);
  gain.gain.linearRampToValueAtTime(vol, ctx.currentTime + inicio + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + inicio + duracao);
  osc.start(ctx.currentTime + inicio);
  osc.stop(ctx.currentTime + inicio + duracao + 0.02);
}

export function somEntrada()  { try { const c = getCtx(); [262,330,392,523].forEach((f,i) => nota(c,f,'triangle',i*0.10,0.18,0.22)); nota(c,523,'sine',0.44,0.5,0.15); } catch(e) {} }
export function somAcerto()   { try { const c = getCtx(); nota(c,587,'sine',0,0.12,0.30); nota(c,784,'sine',0.13,0.22,0.25); } catch(e) {} }
export function somErro()     { try { const c = getCtx(); nota(c,330,'triangle',0,0.14,0.22); nota(c,220,'triangle',0.14,0.28,0.18); } catch(e) {} }
export function somFinalBom() { try { const c = getCtx(); [262,330,392,523,659].forEach((f,i) => nota(c,f,'triangle',i*0.07,0.14,0.20)); [523,659,784].forEach(f => nota(c,f,'sine',0.42,0.8,0.13)); } catch(e) {} }
export function somFinalRuim(){ try { const c = getCtx(); nota(c,392,'triangle',0,0.22,0.20); nota(c,330,'triangle',0.20,0.22,0.18); nota(c,262,'triangle',0.40,0.40,0.16); } catch(e) {} }

// Disponibiliza nota() para jogos que precisam de sons customizados
export { nota, getCtx as getAudioCtx };

document.addEventListener('click', () => {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume();
});
