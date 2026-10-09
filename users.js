/* Mi Voz · usuarios compartidos por las dos páginas.
   Cada usuario tiene sus propias bases de datos en este navegador; el usuario principal
   usa las de siempre, así que sus datos no se mueven. El usuario elegido es común a las dos páginas. */
(() => {
  const LS = {
    get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(e){} },
    del(k){ try { localStorage.removeItem(k); } catch(e){} }
  };
  const MAIN = 'main';
  function list(){
    let l = null; try { l = JSON.parse(LS.get('mivoz-users', 'null')); } catch(e){}
    if (!Array.isArray(l) || !l.some(u => u.id === MAIN)) l = [{ id: MAIN, name: 'Rober' }].concat(Array.isArray(l) ? l.filter(u => u && u.id && u.id !== MAIN) : []);
    return l;
  }
  function saveList(l){ LS.set('mivoz-users', JSON.stringify(l)); }
  function uid(){ const id = LS.get('mivoz-user', MAIN); return list().some(u => u.id === id) ? id : MAIN; }
  function user(){ return list().find(u => u.id === uid()); }
  /* Nombre de la base de datos y de las preferencias del usuario actual */
  function dbName(base, id){ id = id || uid(); return id === MAIN ? base : base + '--' + id; }
  function key(k, id){ id = id || uid(); return id === MAIN ? k : k + '@' + id; }
  function switchTo(id){ LS.set('mivoz-user', id); location.reload(); }
  function add(name){
    const l = list(), id = 'u' + Date.now().toString(36);
    l.push({ id, name }); saveList(l); return id;
  }
  function rename(id, name){ const l = list(), u = l.find(x => x.id === id); if (u){ u.name = name; saveList(l); } }
  function remove(id){
    if (id === MAIN) return;
    ['silabas-con-mi-voz', 'ingles-en-voz-alta'].forEach(b => { try { indexedDB.deleteDatabase(dbName(b, id)); } catch(e){} });
    try { Object.keys(localStorage).filter(k => k.endsWith('@' + id)).forEach(k => LS.del(k)); } catch(e){}
    saveList(list().filter(u => u.id !== id));
  }
  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const clean = s => s.replace(/\s+/g, ' ').trim().slice(0, 24);

  /* ---------- Estilos del selector y del aviso ---------- */
  const css = document.createElement('style');
  css.textContent = `
.mvu{position:relative;display:inline-block}
.mvu-chip{display:inline-flex;align-items:center;gap:6px;font:600 14px var(--body);padding:7px 12px;border-radius:999px;border:1.5px solid var(--accent);background:var(--accent-soft);color:var(--ink);cursor:pointer}
.mvu-panel{margin-top:10px;display:grid;gap:10px;padding:14px;border:1px solid var(--line);border-radius:12px;background:var(--surface);max-width:460px}
.mvu-row{display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding-block:6px;border-top:1px solid var(--line)}
.mvu-row .nm{flex:1 1 120px;min-width:0;font-weight:600;overflow-wrap:anywhere}
.mvu-row .nm small{font-weight:500;color:var(--muted)}
.mvu-row button,.mvu-add button{font:500 13px var(--body);padding:6px 10px}
.mvu-add{display:flex;gap:8px;flex-wrap:wrap}
.mvu-add input,.mvu-row input{flex:1 1 140px;min-width:0;font:15px var(--body);padding:7px 10px;border:1px solid var(--line);border-radius:8px;background:var(--bg);color:var(--ink)}
.mvu-warn{color:var(--rec);font-size:13px;flex-basis:100%}
.mvu-nag{display:flex;flex-wrap:wrap;align-items:center;gap:10px;padding:12px 14px;border-radius:12px;border:1.5px solid #E0A030;background:color-mix(in srgb,#E0A030 14%,var(--surface));color:var(--ink);font-size:14px;line-height:1.45}
.mvu-nag p{margin:0;flex:1 1 220px}
.mvu-nag button{font:600 13px var(--body);padding:7px 12px}`;
  document.head.append(css);

  /* ---------- Selector de usuario ---------- */
  function mount(el){
    if (!el) return;
    let open = false, editing = null, arming = null;
    const wrap = document.createElement('div'); wrap.className = 'mvu';
    el.append(wrap);
    const render = () => {
      const cur = uid(), l = list();
      wrap.innerHTML = '';
      const chip = document.createElement('button'); chip.className = 'mvu-chip'; chip.type = 'button';
      chip.setAttribute('aria-expanded', open); chip.innerHTML = '👤 ' + esc(user().name) + ' <span aria-hidden="true">' + (open ? '▴' : '▾') + '</span>';
      chip.title = 'Cambiar de usuario';
      chip.onclick = () => { open = !open; editing = arming = null; render(); };
      wrap.append(chip);
      if (!open) return;
      const p = document.createElement('div'); p.className = 'mvu-panel';
      p.innerHTML = '<div class="label">¿Quién usa la app?</div><p class="note" style="margin:0">Cada persona tiene sus propias sílabas, versiones, textos de inglés y ajustes. Al cambiar, lo de cada uno queda guardado hasta que vuelva.</p>';
      l.forEach(u => {
        const row = document.createElement('div'); row.className = 'mvu-row';
        if (editing === u.id){
          const inp = document.createElement('input'); inp.value = u.name; inp.maxLength = 24; inp.setAttribute('aria-label', 'Nuevo nombre');
          const ok = document.createElement('button'); ok.className = 'primary'; ok.textContent = 'Guardar';
          const go = () => { const n = clean(inp.value); if (n){ rename(u.id, n); editing = null; render(); } };
          ok.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
          const no = document.createElement('button'); no.className = 'ghost'; no.textContent = 'Cancelar'; no.onclick = () => { editing = null; render(); };
          row.append(inp, ok, no); p.append(row); setTimeout(() => inp.focus()); return;
        }
        const nm = document.createElement('span'); nm.className = 'nm';
        nm.innerHTML = esc(u.name) + (u.id === cur ? ' <small>· ahora</small>' : '') + (u.id === MAIN ? ' <small>· principal</small>' : '');
        row.append(nm);
        if (u.id !== cur){ const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Usar'; b.onclick = () => switchTo(u.id); row.append(b); }
        const rn = document.createElement('button'); rn.className = 'ghost'; rn.textContent = 'Renombrar'; rn.onclick = () => { editing = u.id; arming = null; render(); }; row.append(rn);
        if (u.id !== MAIN && u.id !== cur){
          const del = document.createElement('button'); del.className = 'ghost'; del.textContent = 'Eliminar';
          del.onclick = () => { arming = arming === u.id ? null : u.id; render(); };
          row.append(del);
          if (arming === u.id){
            const w = document.createElement('div'); w.className = 'mvu-warn';
            w.textContent = 'Se borrarán para siempre las sílabas, textos y palabras de ' + u.name + ' en este aparato. Escribe su nombre para confirmar:';
            const inp = document.createElement('input'); inp.setAttribute('aria-label', 'Escribe el nombre para confirmar');
            const yes = document.createElement('button'); yes.className = 'recbtn'; yes.textContent = 'Eliminar'; yes.disabled = true;
            inp.oninput = () => yes.disabled = clean(inp.value).toLowerCase() !== u.name.toLowerCase();
            yes.onclick = () => { remove(u.id); arming = null; render(); };
            row.append(w, inp, yes);
          }
        }
        p.append(row);
      });
      const addRow = document.createElement('div'); addRow.className = 'mvu-add';
      const inp = document.createElement('input'); inp.placeholder = 'Nombre del nuevo usuario'; inp.maxLength = 24; inp.setAttribute('aria-label', 'Nombre del nuevo usuario');
      const b = document.createElement('button'); b.textContent = '+ Añadir y usar';
      const go = () => { const n = clean(inp.value); if (!n) return inp.focus(); switchTo(add(n)); };
      b.onclick = go; inp.onkeydown = e => { if (e.key === 'Enter') go(); };
      addRow.append(inp, b); p.append(addRow);
      const note = document.createElement('p'); note.className = 'note'; note.style.margin = '0';
      note.textContent = 'Todo se guarda solo en este navegador. Para pasar la voz de alguien a otro aparato, usa su copia de seguridad.';
      p.append(note);
      wrap.append(p);
    };
    render();
  }

  /* ---------- Aviso de copia de seguridad ---------- */
  const DAY = 864e5;
  function changed(page){ LS.set(key('mvbk-chg-' + page), String(Date.now())); }
  function backedUp(page){ LS.set(key('mvbk-last-' + page), String(Date.now())); LS.del(key('mvbk-snooze-' + page)); }
  /* opts: { el, page, count(), what, run(), days } */
  function reminder(opts){
    const { el, page } = opts, days = opts.days || 7;
    if (!el) return { refresh(){} };
    const refresh = () => {
      el.innerHTML = ''; el.hidden = true;
      const n = opts.count(); if (!n) return;
      const now = Date.now(), last = +LS.get(key('mvbk-last-' + page), 0), chg = +LS.get(key('mvbk-chg-' + page), 0), snooze = +LS.get(key('mvbk-snooze-' + page), 0);
      if (snooze > now) return;
      if (last && chg <= last) return;            // nada nuevo desde la última copia
      const d = Math.floor((now - last) / DAY);
      if (last && d < days) return;
      if (!last && n < (opts.min || 1)) return;
      const box = document.createElement('div'); box.className = 'mvu-nag'; box.setAttribute('role', 'status');
      const msg = document.createElement('p');
      msg.innerHTML = '💾 <b>' + (last ? 'Hace ' + d + ' días' : 'Todavía no has hecho') + '</b> ' + (last ? 'que no guardas copia de ' : 'ninguna copia de ') + n + ' ' + esc(opts.what) + ' de <b>' + esc(user().name) + '</b>. Si se borran los datos del navegador, se perderían.';
      const b = document.createElement('button'); b.className = 'primary'; b.textContent = 'Guardar copia ahora';
      b.onclick = () => { opts.run(); };
      const later = document.createElement('button'); later.className = 'ghost'; later.textContent = 'Mañana';
      later.onclick = () => { LS.set(key('mvbk-snooze-' + page), String(now + DAY)); refresh(); };
      box.append(msg, b, later); el.append(box); el.hidden = false;
    };
    refresh();
    return { refresh };
  }

  window.MiVozUsers = { uid, user, list, dbName, key, mount, changed, backedUp, reminder, MAIN };
})();
