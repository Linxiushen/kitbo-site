'use strict';
(() => {
  const body = document.body;
  const toast = document.querySelector('.toast');
  let toastTimer;
  const notify = text => {
    if (!toast) return;
    toast.textContent = text;
    toast.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => toast.classList.remove('show'), 1800);
  };
  const watermark = document.querySelector('.watermark');
  if (watermark) {
    const canvas = document.createElement('canvas');
    canvas.width = 520; canvas.height = 320;
    const ctx = canvas.getContext('2d');
    ctx.translate(260, 160); ctx.rotate(-.4);
    ctx.font = '500 14px system-ui,sans-serif'; ctx.textAlign = 'center';
    ctx.fillStyle = 'rgba(50,90,90,.065)';
    ctx.fillText('Leon S Kennedy 陈旭林 · Kitbo', 0, -8);
    ctx.fillText('仅供浏览 · 版权所有', 0, 18);
    watermark.style.backgroundImage = `url(${canvas.toDataURL()})`;
  }
  const editable = target => target instanceof Element && target.matches('input,textarea');
  for (const type of ['copy','cut','dragstart','selectstart']) {
    document.addEventListener(type, event => {
      if (editable(event.target)) return;
      event.preventDefault();
      if (type !== 'selectstart') notify('资料仅供在线浏览');
    });
  }
  document.addEventListener('contextmenu', event => {
    if (!editable(event.target)) {event.preventDefault(); notify('资料仅供在线浏览');}
  });
  document.addEventListener('keydown', event => {
    if ((event.metaKey || event.ctrlKey) && ['c','x','s','p'].includes(event.key.toLowerCase()) && !editable(event.target)) {
      event.preventDefault(); notify('资料仅供在线浏览');
    }
  });
  document.addEventListener('visibilitychange', () => body.classList.toggle('hidden-tab', document.hidden));
  const dialog = document.querySelector('.lightbox');
  document.querySelectorAll('.scenarios img,.intelligence-layout>img').forEach(img => img.addEventListener('click', () => {
    dialog.querySelector('img').src = img.currentSrc;
    dialog.querySelector('img').alt = img.alt;
    dialog.querySelector('p').textContent = img.alt;
    dialog.showModal();
  }));
  if (dialog) {
    dialog.querySelector('button').addEventListener('click', () => dialog.close());
    dialog.addEventListener('click', event => {if (event.target === dialog) dialog.close();});
  }

  const forms = document.querySelectorAll('.access-form');
  if (!forms.length) return;
  const content = document.getElementById('cooperation-content');
  let vaultPromise;
  const loadVault = () => vaultPromise ||= fetch(body.dataset.vault, {cache:'no-store'}).then(response => {
    if (!response.ok) throw new Error('network');
    return response.json();
  });
  const bytes = value => Uint8Array.from(atob(value), c => c.charCodeAt(0));
  const B32 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
  async function unwrap(secret, entry, iterations) {
    const material = await crypto.subtle.importKey('raw', new TextEncoder().encode(secret), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey({name:'PBKDF2',salt:bytes(entry[0]),iterations,hash:'SHA-256'}, material, {name:'AES-GCM',length:256}, false, ['decrypt']);
    const raw = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(entry[1])},key,bytes(entry[2]));
    return crypto.subtle.importKey('raw',raw,'AES-GCM',false,['decrypt']);
  }
  async function unlock(password) {
    const vault = await loadVault();
    const now = Math.floor(Date.now()/3600000), hours = vault.valid_hours;
    let key, expires;
    const code = password.replace(/[^a-z0-9]/gi,'').toUpperCase();
    if (/^[A-Z2-7]{10}$/.test(code)) {
      const issued = vault.base_hour+(B32.indexOf(code[0])<<10)+(B32.indexOf(code[1])<<5)+B32.indexOf(code[2]);
      const entry = vault.hours[String(issued)];
      if (entry && now >= issued && now < issued+hours) {
        try {key=await unwrap(`${code}|${issued}`,entry,vault.temp_iter); expires=(issued+hours)*3600000;} catch {}
      }
    }
    if (!key) for (const [issued,entry] of Object.entries(vault.pw)) {
      if (now < Number(issued) || now >= Number(issued)+hours) continue;
      try {key=await unwrap(`${password}|${issued}`,entry,vault.pw_iter); expires=(Number(issued)+hours)*3600000; break;} catch {}
    }
    if (!key) throw new Error('bad');
    const decrypted = await crypto.subtle.decrypt({name:'AES-GCM',iv:bytes(vault.iv)},key,bytes(vault.ct));
    const stream = new Blob([decrypted]).stream().pipeThrough(new DecompressionStream('gzip'));
    const bundle = await new Response(stream).json();
    content.innerHTML = bundle.blocks.investor;
    content.hidden = false;
    const end = Math.min(expires, Date.now()+vault.view_minutes*60000);
    sessionStorage.setItem('kitbo_access',password);
    sessionStorage.setItem('kitbo_access_end',String(end));
    setTimeout(() => {content.replaceChildren();content.hidden=true;sessionStorage.removeItem('kitbo_access');sessionStorage.removeItem('kitbo_access_end');notify('本次浏览已结束，请重新解锁');}, Math.max(1000,end-Date.now()));
    for (const form of forms) {
      form.querySelector('.access-message').textContent = `已解锁 · 本次浏览至 ${new Date(end).toLocaleTimeString('zh-CN',{hour:'2-digit',minute:'2-digit'})}`;
      form.querySelector('.access-message').style.color = '#217e82';
      form.querySelector('input').value='';
    }
    return end;
  }
  forms.forEach(form => form.addEventListener('submit',async event => {
    event.preventDefault();
    const button = form.querySelector('button'), message = form.querySelector('.access-message');
    button.disabled=true; message.textContent='正在解锁…';
    try {await unlock(form.querySelector('input').value); content.scrollIntoView({behavior:'smooth',block:'start'});}
    catch(error) {message.style.color='#8c4053';message.textContent=error.message==='bad'?'密码不正确或已过期（有效期 48 小时）':'暂时无法解锁，请刷新后重试';}
    finally {button.disabled=false;}
  }));
  try {
    const saved=sessionStorage.getItem('kitbo_access'), end=Number(sessionStorage.getItem('kitbo_access_end'));
    if(saved && end>Date.now()) unlock(saved).catch(()=>sessionStorage.removeItem('kitbo_access'));
  } catch {}
})();
