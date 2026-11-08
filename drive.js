/* Mi Voz · sincronización con Google Drive.
   Cada página guarda la copia de cada usuario en la carpeta «MiVoz» de tu Drive:
     MiVoz/silabas-<usuario>.zip   (las sílabas con todas sus versiones y fichas)
     MiVoz/ingles-<usuario>.json   (libros, textos, palabras e historial de inglés)
   El permiso que se pide (drive.file) solo deja ver los archivos que crea esta app, nada más de tu Drive. */
(() => {
  /* ⇩⇩ Pega aquí el ID de cliente OAuth de Google Cloud (termina en .apps.googleusercontent.com) ⇩⇩ */
  const CLIENT_ID = '775415077551-v99g3415vpmd6vra392smfmv0q8meav3.apps.googleusercontent.com';
  /* ⇧⇧ ------------------------------------------------------------------------------------- ⇧⇧ */

  const SCOPE = 'https://www.googleapis.com/auth/drive.file';
  const API = 'https://www.googleapis.com/drive/v3', UPL = 'https://www.googleapis.com/upload/drive/v3';
  const FOLDER = 'MiVoz';
  const U = window.MiVozUsers;
  const LS = {
    get(k, d){ try { const v = localStorage.getItem(k); return v == null ? d : v; } catch(e){ return d; } },
    set(k, v){ try { localStorage.setItem(k, v); } catch(e){} },
    del(k){ try { localStorage.removeItem(k); } catch(e){} }
  };
  const ON = 'mvdrive-on', WHO = 'mvdrive-who';   // comunes a todos los usuarios: la cuenta de Google es la del aparato
  const hosted = location.protocol === 'https:' && /github\.io$/.test(location.hostname) || location.hostname === 'localhost';
  const ready = !!CLIENT_ID && hosted;

  let token = null, tokenExp = 0, tc = null, pend = null, folder = null;
  let page = null, busy = false, timer = null, view = null;
  let forceConsent = false;   // tras un permiso incompleto, la siguiente ventana de Google vuelve a mostrar la casilla

  /* La conexión con Google se recuerda en esta pestaña (sessionStorage, se borra al cerrarla):
     así no hay que volver a conectar al recargar ni al pasar de Sílabas a Inglés. */
  const SS_TOKEN = 'mvdrive-token';
  try {
    const sv = JSON.parse(sessionStorage.getItem(SS_TOKEN) || 'null');
    if (sv && sv.t && sv.exp > Date.now()){ token = sv.t; tokenExp = sv.exp; }
  } catch(e){}
  function keepToken(){ try { sessionStorage.setItem(SS_TOKEN, JSON.stringify({ t: token, exp: tokenExp })); } catch(e){} }
  function dropToken(){ token = null; tokenExp = 0; try { sessionStorage.removeItem(SS_TOKEN); } catch(e){} }

  const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
  const slug = s => String(s).normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || 'usuario';
  const fileName = () => page.name + '-' + slug(U.user().name) + '.' + page.ext;
  const stateKey = () => U.key('mvdrive-' + page.name);
  const getState = () => { try { return JSON.parse(LS.get(stateKey(), '{}')) || {}; } catch(e){ return {}; } };
  const setState = s => LS.set(stateKey(), JSON.stringify(s));
  const localChanged = () => +LS.get(U.key('mvbk-chg-' + page.name), 0) > (getState().at || 0);
  const hasToken = () => !!token && Date.now() < tokenExp - 60000;
  const fail = (code, msg) => Object.assign(new Error(msg || code), { code });

  /* ---------- Acceso a Google ---------- */
  function loadGis(){
    return new Promise((ok, ko) => {
      if (window.google && google.accounts && google.accounts.oauth2) return ok();
      const s = document.createElement('script');
      s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
      s.onload = () => ok(); s.onerror = () => ko(fail('net'));
      document.head.append(s);
    });
  }
  function initClient(){
    if (tc || !window.google) return;
    tc = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID, scope: SCOPE,
      callback: r => {
        const p = pend; pend = null;
        if (!p) return;
        if (r.error || !r.access_token) return p.ko(fail('denied'));
        if (google.accounts.oauth2.hasGrantedAllScopes && !google.accounts.oauth2.hasGrantedAllScopes(r, SCOPE)){ forceConsent = true; return p.ko(fail('scope')); }
        forceConsent = false;
        token = r.access_token; tokenExp = Date.now() + (+r.expires_in || 3600) * 1000; keepToken();
        LS.set(ON, '1'); p.ok(token);
      },
      error_callback: e => { const p = pend; pend = null; p && p.ko(fail(e && e.type === 'popup_closed' ? 'closed' : 'denied')); }
    });
  }
  /* Tiene que llamarse directamente desde un toque del usuario: Google abre una ventanita. */
  function askToken(){
    if (hasToken()) return Promise.resolve(token);
    if (!tc) return Promise.reject(fail('gis'));
    return new Promise((ok, ko) => {
      if (pend) pend.ko(fail('closed'));
      pend = { ok, ko };
      const o = { prompt: LS.get(ON) && !forceConsent ? '' : 'consent' };
      const who = LS.get(WHO, ''); if (who) o.hint = who;
      tc.requestAccessToken(o);
    });
  }
  async function api(url, opt = {}){
    if (!hasToken()) throw fail('auth');
    let r;
    try { r = await fetch(url, { ...opt, headers: { ...(opt.headers || {}), Authorization: 'Bearer ' + token } }); }
    catch(e){ throw fail('net'); }
    if (r.status === 401){ dropToken(); throw fail('auth'); }
    if (!r.ok) throw await errorFrom(r);
    return r;
  }
  /* Traduce el error de Google a un código claro y guarda su motivo («accessNotConfigured», etc.) para mostrarlo */
  async function errorFrom(r){
    let reason = '', message = '';
    try {
      const e = ((await r.json()) || {}).error || {};
      reason = (e.errors && e.errors[0] && e.errors[0].reason) || ((e.details || []).find(d => d && d.reason) || {}).reason || e.status || '';
      message = e.message || '';
    } catch(e){}
    const detail = 'Drive respondió ' + r.status + (reason ? ' · ' + reason : '');
    if (/storageQuotaExceeded|quotaExceeded/i.test(reason)) return fail('full', detail);
    if (/accessNotConfigured|SERVICE_DISABLED/i.test(reason) || /has not been used|is disabled/i.test(message)) return fail('api', detail);
    if (/insufficientPermissions|insufficientScopes|ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason)){ dropToken(); forceConsent = true; return fail('scope', detail); }
    if (r.status === 429 || /rateLimitExceeded|userRateLimitExceeded|RATE_LIMIT_EXCEEDED/i.test(reason)) return fail('rate', detail);
    return fail('http', detail);
  }
  const SCOPE_MSG = 'No se marcó la casilla de Google Drive en la ventana de Google. Toca «Sincronizar» y marca la casilla para permitir el acceso.';
  const q = s => "'" + String(s).replace(/\\/g, '\\\\').replace(/'/g, "\\'") + "'";
  async function list(query, fields){
    const u = API + '/files?spaces=drive&orderBy=modifiedTime%20desc&pageSize=10&fields=' + encodeURIComponent('files(' + fields + ')') + '&q=' + encodeURIComponent(query);
    return (await (await api(u)).json()).files || [];
  }
  async function getFolder(){
    if (folder) return folder;
    const f = await list('name=' + q(FOLDER) + " and mimeType='application/vnd.google-apps.folder' and trashed=false", 'id');
    if (f.length) return folder = f[0].id;
    const r = await api(API + '/files?fields=id', { method: 'POST', headers: { 'Content-Type': 'application/json; charset=UTF-8' },
      body: JSON.stringify({ name: FOLDER, mimeType: 'application/vnd.google-apps.folder' }) });
    return folder = (await r.json()).id;
  }
  async function findFile(){
    const fid = await getFolder();
    const f = await list('name=' + q(fileName()) + ' and ' + q(fid) + ' in parents and trashed=false', 'id,modifiedTime,size');
    return f[0] || null;
  }
  async function upload(id, blob){
    const meta = id ? {} : { name: fileName(), parents: [await getFolder()] };
    const b = 'mivoz' + Math.random().toString(36).slice(2);
    const body = new Blob([
      '--' + b + '\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n' + JSON.stringify(meta) + '\r\n',
      '--' + b + '\r\nContent-Type: ' + page.mime + '\r\n\r\n', blob, '\r\n--' + b + '--'
    ]);
    const r = await api(UPL + '/files' + (id ? '/' + id : '') + '?uploadType=multipart&fields=id,modifiedTime,size',
      { method: id ? 'PATCH' : 'POST', headers: { 'Content-Type': 'multipart/related; boundary=' + b }, body });
    return r.json();
  }
  async function whoAmI(){
    try {
      const u = (await (await api(API + '/about?fields=user(emailAddress)')).json()).user;
      if (u && u.emailAddress) LS.set(WHO, u.emailAddress);
    } catch(e){ if (e.code === 'scope' || e.code === 'api') throw e; }   // el email no es crítico, estos dos errores sí
  }

  /* ---------- Sincronizar ---------- */
  const mb = n => n < 1048576 ? Math.max(1, Math.round(n / 1024)).toLocaleString('es-ES') + ' KB' : (n / 1048576).toLocaleString('es-ES', { maximumFractionDigits: 1 }) + ' MB';
  async function sync({ interactive } = {}){
    if (!ready || busy) return;
    if (interactive){
      try { await askToken(); }
      catch(e){ say(e.code === 'closed' ? 'Has cerrado la ventana de Google sin conectar.' : e.code === 'gis' || e.code === 'net' ? 'No se ha podido cargar el acceso de Google. Revisa la conexión.' : e.code === 'scope' ? SCOPE_MSG : 'Google no ha dado permiso para usar Drive.', 'err'); return; }
    } else if (!hasToken() || !navigator.onLine) return render();
    busy = true; clearTimeout(timer); render('Sincronizando con Drive…');
    try {
      if (!LS.get(WHO)) await whoAmI();
      const st = getState(), remote = await findFile();
      const mine = localChanged(), theirs = remote && remote.modifiedTime !== st.mod;
      let msg = 'Todo al día con Drive.', up = false;
      if (theirs){
        render('Descargando de Drive (' + mb(+remote.size || 0) + ')…');
        const blob = await (await api(API + '/files/' + remote.id + '?alt=media')).blob();
        /* Si este aparato no tiene cambios, Drive manda: se copia tal cual (y así también llegan los borrados).
           Si los dos han cambiado, se juntan y no se pierde nada. */
        msg = await page.apply(blob, mine ? 'merge' : 'replace');
        if (mine) up = true;
        setState({ id: remote.id, mod: remote.modifiedTime, at: Date.now() });
      } else if (mine || (!remote && page.count() > 0)) up = true;
      if (up){
        render('Subiendo a Drive…');
        const blob = await page.build();
        const r = await upload(remote && remote.id, blob);
        setState({ id: r.id, mod: r.modifiedTime, at: Date.now() });
        U.backedUp(page.name);
        msg = (theirs ? msg + ' ' : '') + 'Guardado en Drive: ' + FOLDER + '/' + fileName() + ' (' + mb(blob.size) + ').';
      }
      busy = false; say(msg, 'ok');
      page.done && page.done();
    } catch(e){
      busy = false;
      say(e.code === 'auth' ? 'La conexión con Google ha caducado. Toca «Sincronizar» para seguir.'
        : e.code === 'net' ? 'Sin conexión con Google. Lo intento otra vez cuando vuelvas a tocar «Sincronizar».'
        : e.code === 'full' ? 'Tu Google Drive está lleno: no cabe la copia.'
        : e.code === 'api' ? 'La API de Google Drive no está activada en el proyecto de Google Cloud de la app. Hay que activarla en «APIs y servicios → Biblioteca» (' + e.message + ').'
        : e.code === 'scope' ? SCOPE_MSG
        : e.code === 'rate' ? 'Google Drive está recibiendo demasiadas peticiones seguidas. Espera un minuto y vuelve a sincronizar.'
        : e.code === 'bad' ? 'El archivo de Drive no es una copia válida de esta página. No he tocado nada.'
        : 'No se pudo sincronizar (' + (e.message || 'error') + ').', 'err');
    }
  }
  /* Cuando cambias algo, se sube solo al cabo de un rato (si la conexión con Google sigue abierta). */
  addEventListener('mivoz-changed', e => {
    if (!page || e.detail !== page.name || busy || !LS.get(ON)) return;
    render();
    if (hasToken()){ clearTimeout(timer); timer = setTimeout(() => sync(), 20000); }
  });
  addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && timer && hasToken()){ clearTimeout(timer); sync(); }
  });
  /* Sin internet los cambios esperan en el aparato; al volver la conexión se suben solos. */
  addEventListener('online', () => { if (page && LS.get(ON) && hasToken() && localChanged() && !busy) sync(); else render(); });
  addEventListener('offline', () => render());

  function disconnect(){
    try { if (token && window.google) google.accounts.oauth2.revoke(token, () => {}); } catch(e){}
    dropToken(); folder = null; forceConsent = false; LS.del(ON); LS.del(WHO); clearTimeout(timer);
    say('Desconectado de Google Drive. Tus copias siguen en la carpeta ' + FOLDER + ' de tu Drive.', '');
  }

  /* ---------- Interfaz ---------- */
  const css = document.createElement('style');
  css.textContent = `
.mvd{display:grid;gap:10px;padding:14px;border:1.5px solid var(--line);border-radius:12px;background:var(--surface)}
.mvd .mvd-h{display:flex;align-items:center;gap:8px;font-weight:700}
.mvd p{margin:0}
.mvd .row{display:flex;flex-wrap:wrap;gap:8px}
.mvd-chip{display:inline-flex;align-items:center;gap:6px;font:600 14px var(--body);padding:7px 12px;border-radius:999px;border:1.5px solid var(--line);background:var(--surface);color:var(--ink);cursor:pointer}
.mvd-chip.warn{border-color:#E0A030;background:color-mix(in srgb,#E0A030 14%,var(--surface))}
.mvd-chip.ok{border-color:color-mix(in srgb,var(--accent) 60%,var(--line))}
.mvd-chip.err{border-color:#C0392B;background:color-mix(in srgb,#C0392B 12%,var(--surface))}`;
  document.head.append(css);
  let last = { msg: '', kind: '' };
  function say(msg, kind){ last = { msg, kind }; render(); }
  function render(working){
    if (!view) return;
    const { box, chip } = view, on = !!LS.get(ON), who = LS.get(WHO, ''), pendingUp = on && localChanged();
    const offline = on && !navigator.onLine, failed = on && !busy && last.kind === 'err' && hasToken();
    /* Botón pequeño de la cabecera */
    if (chip){
      chip.hidden = !ready;
      chip.className = 'mvd-chip ' + (busy ? '' : !on ? 'ok' : failed ? 'err' : offline || !hasToken() || pendingUp ? 'warn' : 'ok');
      chip.textContent = busy ? '☁️ Sincronizando…' : !on ? '☁️ Conectar con Google Drive' : failed ? '☁️ Error en Drive · toca para ver'
        : offline ? (pendingUp ? '☁️ Sin conexión · cambios pendientes' : '☁️ Sin conexión') : !hasToken() ? '☁️ Toca para sincronizar' : pendingUp ? '☁️ Cambios por subir' : '☁️ Drive al día';
      chip.disabled = busy;
    }
    if (!box) return;
    let h = '<div class="mvd-h">☁️ Google Drive</div>';
    if (!hosted){
      h += '<p class="note">Drive solo funciona desde tu web en GitHub (quinigrama.github.io/GrabadoraVoz). Aquí usa la copia de seguridad normal.</p>';
    } else if (!CLIENT_ID){
      h += '<p class="note">Casi listo: falta poner el ID de cliente de Google en el archivo drive.js. Mientras tanto, usa la copia de seguridad normal.</p>';
    } else if (!on){
      h += '<p class="note">Guarda ' + esc(page.what) + ' en la carpeta «' + FOLDER + '» de tu Google Drive y tenlas iguales en el móvil, el ordenador o donde abras la app. La app solo puede ver los archivos que ella misma crea, nada más de tu Drive.</p>' +
        '<div class="row"><button class="primary" data-a="sync">Conectar con Google Drive</button></div>';
    } else {
      const st = getState();
      h += '<p class="note">' + (who ? 'Conectado como <b>' + esc(who) + '</b>. ' : 'Conectado. ') + 'Archivo: ' + FOLDER + '/' + esc(fileName()) + '.' +
        (st.at ? ' Última sincronización: ' + new Date(st.at).toLocaleString('es-ES', { dateStyle: 'short', timeStyle: 'short' }) + '.' : '') + '</p>' +
        '<p class="note">Mientras la tengas abierta, lo que cambies se sube solo; si no hay internet, espera en este aparato y se sube al volver la conexión. Al recargar o pasar de Sílabas a Inglés sigue conectada. Si Google cierra la conexión (más o menos al cabo de una hora), toca «Sincronizar» y sigue.</p>' +
        '<div class="row"><button class="primary" data-a="sync"' + (busy ? ' disabled' : '') + '>⇅ Sincronizar ahora</button>' +
        '<button class="ghost" data-a="off"' + (busy ? ' disabled' : '') + '>Desconectar</button></div>';
    }
    const m = working || last.msg;
    h += '<div class="status' + (working ? '' : last.kind ? ' ' + last.kind : '') + '">' + esc(m || '') + '</div>';
    box.innerHTML = h;
  }
  /* page: { name, ext, mime, what, count(), build() → Promise<Blob>, apply(blob, 'replace'|'merge') → Promise<mensaje>, done() } */
  function mount(p, boxEl, chipEl){
    page = p;
    const box = boxEl ? Object.assign(document.createElement('div'), { className: 'mvd' }) : null;
    if (box) boxEl.append(box);
    let chip = null;
    if (chipEl){
      chip = document.createElement('button'); chip.type = 'button'; chip.hidden = true;
      /* Con un error, el botón lleva al recuadro de Drive, donde se explica qué pasa. Si no, sincroniza. */
      chip.onclick = () => {
        if (LS.get(ON) && last.kind === 'err' && hasToken() && view.box){ view.box.scrollIntoView({ block: 'center', behavior: 'smooth' }); return; }
        sync({ interactive: true });
      };
      chipEl.append(chip);
    }
    if (box) box.addEventListener('click', e => {
      const a = e.target.closest('[data-a]'); if (!a) return;
      if (a.dataset.a === 'sync') sync({ interactive: true }); else disconnect();
    });
    view = { box, chip };
    render();
    if (ready) loadGis().then(initClient).catch(() => {});
    /* Si la conexión con Google sigue abierta en esta pestaña, sincroniza sola al abrir la página. */
    if (ready && LS.get(ON) && hasToken()) setTimeout(() => sync(), 600);
  }
  const err = code => fail(code);
  window.MiVozDrive = { mount, sync, bad: () => err('bad') };
})();
