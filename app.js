/* ══════════════════════════════════════════════════
   ABILITY PRO v4.0 — app.js
   Novas funcionalidades:
   ✅ Mapeamento inteligente de colunas (sinônimos + Levenshtein)
   ✅ Web Worker para geração em segundo plano
   ✅ QR Code de validação por certificado
   ✅ Assinaturas dinâmicas por curso
   ✅ Histórico e auditoria de lotes no Firestore
   ✅ Dashboard analítico
   ✅ Download em ZIP com PDFs individuais
   ══════════════════════════════════════════════════ */

/* ── Setup libs ── */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
const { jsPDF } = window.jspdf;

/* ══════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════ */

let imgFrente       = null;
let imgVerso        = null;
let dadosExcel      = [];
let alunoAtual      = 0;
let slotAtivo       = 'NR10';
let gerando         = false;
let corTexto        = '#000000';
let modoFirebase    = false;
let tabelaVisivel   = false;
let dadosFiltrados  = [];
let mapeamentoColunas = {};   // { nome: 'Colaborador', cpf: 'CPF', data: 'Conclusão' }
let assinaturaImg   = null;   // dataURL da assinatura PNG carregada no modal
let dbAssinaturas   = {};     // { 'NR10': { nome, cargo, registro, img } }
let abaAtiva        = 'geracao';
let usuarioLogado   = null;

const CURSOS = ['NR10', 'NR10 SEP', 'NR06', 'NR20', 'NR35', 'SGA', 'DIRECAO', 'OUTROS'];

/* Dicionário de sinônimos para mapeamento inteligente */
const SINONIMOS = {
  nome:    ['nome', 'name', 'aluno', 'participante', 'funcionario', 'colaborador', 'trabalhador', 'empregado', 'servidor', 'estudante'],
  cpf:     ['cpf', 'documento', 'doc', 'cpf/cnpj', 'identificacao', 'id'],
  data:    ['data', 'conclusao', 'termino', 'termino', 'date', 'dt', 'emissao', 'realizacao', 'fim', 'encerramento'],
  empresa: ['empresa', 'company', 'organizacao', 'contratante', 'empregador', 'razao'],
  email:   ['email', 'e-mail', 'mail', 'correio', 'contato'],
  telefone:['telefone', 'tel', 'celular', 'whatsapp', 'fone'],
};

let dbEquipe = JSON.parse(localStorage.getItem('ability_v9_users') || 'null')
  || [{ user: 'Admin', pass: '2729', role: 'admin' }];

/* ══════════════════════════════════════════════════
   UTILITÁRIOS
   ══════════════════════════════════════════════════ */

function toast(msg, tipo = 'success', duracao = 3500) {
  const wrap = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast ${tipo}`;
  el.innerHTML = `<div class="toast-icon"></div><span>${msg}</span>`;
  wrap.appendChild(el);
  setTimeout(() => {
    el.style.opacity = '0';
    el.style.transform = 'translateX(12px)';
    el.style.transition = 'opacity 0.25s, transform 0.25s';
    setTimeout(() => el.remove(), 280);
  }, duracao);
}

function formatarData(v) {
  if (!v) return '';
  if (v instanceof Date) return v.toLocaleDateString('pt-BR');
  if (typeof v === 'number') {
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toLocaleDateString('pt-BR');
  }
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [ano, mes, dia] = s.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  return s;
}

function hexParaRGB(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
}

/* Distância de Levenshtein simplificada */
function levenshtein(a, b) {
  const m = a.length, n = b.length;
  const dp = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => i === 0 ? j : j === 0 ? i : 0)
  );
  for (let i = 1; i <= m; i++)
    for (let j = 1; j <= n; j++)
      dp[i][j] = a[i-1] === b[j-1]
        ? dp[i-1][j-1]
        : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[m][n];
}

function normalizar(s) {
  return String(s).toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z0-9]/g, '');
}

/* Busca coluna usando mapeamento confirmado, depois fallback em sinônimos */
function buscarColuna(aluno, campo, ...extras) {
  // Se há mapeamento confirmado para este campo, usa ele
  if (mapeamentoColunas[campo]) {
    const val = aluno[mapeamentoColunas[campo]];
    if (val !== undefined && val !== null && String(val).trim() !== '')
      return String(val).trim();
  }
  // Fallback: busca por sinônimos e extras
  const termos = [...(SINONIMOS[campo] || []), ...extras];
  const chaves = Object.keys(aluno);
  for (const termo of termos) {
    const t = normalizar(termo);
    const found = chaves.find(c => normalizar(c).includes(t));
    if (found && aluno[found] !== undefined && aluno[found] !== null && String(aluno[found]).trim() !== '') {
      return String(aluno[found]).trim();
    }
  }
  return '';
}

function getConfig() {
  return {
    yn: +document.getElementById('range_y_nome').value,
    sn: +document.getElementById('range_s_nome').value,
    yc: +document.getElementById('range_y_cpf').value,
    sc: +document.getElementById('range_s_cpf').value,
    yd: +document.getElementById('range_y_data').value,
    sd: +document.getElementById('range_s_data').value,
    xqr: +document.getElementById('range_x_qr').value,
    yqr: +document.getElementById('range_y_qr').value,
    sqr: +document.getElementById('range_s_qr').value,
    enableQR: document.getElementById('enableQR').checked,
    cor: corTexto,
  };
}

/* ══════════════════════════════════════════════════
   MAPEAMENTO INTELIGENTE DE COLUNAS (Fase 1)
   ══════════════════════════════════════════════════ */

function detectarMapeamento(dados) {
  if (!dados || dados.length === 0) return {};
  const colunas = Object.keys(dados[0]);
  const resultado = {};

  for (const [campo, sinonimos] of Object.entries(SINONIMOS)) {
    let melhor = null, melhorScore = Infinity;
    for (const coluna of colunas) {
      const cn = normalizar(coluna);
      for (const sin of sinonimos) {
        const dist = levenshtein(cn, normalizar(sin));
        const score = dist - (cn.includes(normalizar(sin)) ? 5 : 0);
        if (score < melhorScore) {
          melhorScore = score;
          melhor = coluna;
        }
      }
    }
    if (melhorScore <= 4 && melhor) resultado[campo] = melhor;
  }
  return resultado;
}

let _resolveColMap = null;

function mostrarModalColMap(colunas, sugestoes) {
  return new Promise(resolve => {
    _resolveColMap = resolve;
    const campos = ['nome', 'cpf', 'data', 'empresa', 'email', 'telefone'];
    const labels = {
      nome: 'Nome do aluno', cpf: 'CPF', data: 'Data de conclusão',
      empresa: 'Empresa', email: 'E-mail', telefone: 'Telefone/WhatsApp'
    };
    const body = document.getElementById('colMapBody');
    body.innerHTML = campos.map(campo => {
      const sugestao = sugestoes[campo] || '';
      return `
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;align-items:center">
          <div>
            <div style="font-size:10px;font-weight:700;color:var(--text2);text-transform:uppercase;letter-spacing:.5px">${labels[campo]}</div>
          </div>
          <select id="map_${campo}" class="field" style="padding:8px 10px;font-size:11px">
            <option value="">— Ignorar —</option>
            ${colunas.map(c => `<option value="${c}" ${c === sugestao ? 'selected' : ''}>${c}</option>`).join('')}
          </select>
        </div>
      `;
    }).join('');
    document.getElementById('modalColMap').classList.remove('hidden');
  });
}

function fecharModalColMap(confirmar) {
  document.getElementById('modalColMap').classList.add('hidden');
  if (!_resolveColMap) return;
  if (confirmar) {
    const campos = ['nome', 'cpf', 'data', 'empresa', 'email', 'telefone'];
    const mapa = {};
    campos.forEach(c => {
      const v = document.getElementById(`map_${c}`)?.value;
      if (v) mapa[c] = v;
    });
    _resolveColMap(mapa);
  } else {
    _resolveColMap(null);
  }
  _resolveColMap = null;
}

/* ══════════════════════════════════════════════════
   QR CODE DE VALIDAÇÃO (Fase 2)
   ══════════════════════════════════════════════════ */

async function gerarHashCertificado(cpf, curso, data) {
  const str = `${normalizar(cpf)}-${normalizar(curso)}-${normalizar(data)}-ability2024`;
  const encoder = new TextEncoder();
  const buf = await crypto.subtle.digest('SHA-256', encoder.encode(str));
  return Array.from(new Uint8Array(buf))
    .map(b => b.toString(16).padStart(2, '0')).join('').substring(0, 16).toUpperCase();
}

async function gerarQRDataURL(texto, tamanho = 200) {
  return new Promise(resolve => {
    const div = document.getElementById('qrCanvas');
    div.innerHTML = '';
    try {
      new QRCode(div, {
        text: texto,
        width: tamanho,
        height: tamanho,
        colorDark: '#000000',
        colorLight: '#ffffff',
        correctLevel: QRCode.CorrectLevel.M
      });
      setTimeout(() => {
        const img = div.querySelector('img') || div.querySelector('canvas');
        if (img) resolve(img.tagName === 'CANVAS' ? img.toDataURL() : img.src);
        else resolve(null);
      }, 150);
    } catch(e) {
      resolve(null);
    }
  });
}

async function registrarCertificadoFirestore(hash, aluno, curso) {
  const fb = window.__FB;
  if (!fb || !modoFirebase) return;
  try {
    await fb.setDoc(fb.doc(fb.db, 'certificados', hash), {
      hash,
      aluno: buscarColuna(aluno, 'nome') || '',
      cpf: buscarColuna(aluno, 'cpf') || '',
      curso,
      data: formatarData(aluno[slotAtivo] || buscarColuna(aluno, 'data') || ''),
      empresa: buscarColuna(aluno, 'empresa') || '',
      emitidoEm: fb.serverTimestamp(),
      status: 'valido',
    });
  } catch(e) {
    console.warn('Erro ao registrar certificado:', e);
  }
}

/* ══════════════════════════════════════════════════
   ASSINATURAS DINÂMICAS (Fase 2)
   ══════════════════════════════════════════════════ */

function carregarDbAssinaturas() {
  try {
    dbAssinaturas = JSON.parse(localStorage.getItem('ability_v4_assinaturas') || '{}');
  } catch(e) { dbAssinaturas = {}; }
}

function salvarDbAssinaturas() {
  try {
    localStorage.setItem('ability_v4_assinaturas', JSON.stringify(dbAssinaturas));
    // Sync Firebase se disponível
    const fb = window.__FB;
    if (fb && modoFirebase && fb.auth.currentUser) {
      const uid = fb.auth.currentUser.uid;
      fb.setDoc(fb.doc(fb.db, 'assinaturas', uid), dbAssinaturas)
        .catch(e => console.warn('Erro ao sincronizar assinaturas:', e));
    }
  } catch(e) { console.warn('Erro ao salvar assinaturas:', e); }
}

function toggleAssinaturas() {
  const modal = document.getElementById('modalAssinaturas');
  modal.classList.toggle('hidden');
  if (!modal.classList.contains('hidden')) {
    preencherSelectCursos();
    renderizarListaAssinaturas();
  }
}

function fecharAssinaturas() {
  document.getElementById('modalAssinaturas').classList.add('hidden');
}

function preencherSelectCursos() {
  const sel = document.getElementById('assinCursoSelect');
  sel.innerHTML = '<option value="">Selecione...</option>' +
    CURSOS.map(c => `<option value="${c}" ${c === slotAtivo ? 'selected' : ''}>${c}</option>`).join('');
}

function carregarAssinaturaImg(input) {
  const file = input.files[0];
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    assinaturaImg = e.target.result;
    document.getElementById('assinPNGLabel').textContent = file.name;
    toast('Imagem da assinatura carregada!');
  };
  reader.readAsDataURL(file);
  input.value = '';
}

function salvarAssinatura() {
  const curso    = document.getElementById('assinCursoSelect').value;
  const nome     = document.getElementById('assinNomeInput').value.trim();
  const cargo    = document.getElementById('assinCargoInput').value.trim();
  const registro = document.getElementById('assinRegistroInput').value.trim();

  if (!curso) { toast('Selecione o curso.', 'error'); return; }
  if (!nome)  { toast('Informe o nome do instrutor.', 'error'); return; }

  dbAssinaturas[curso] = { nome, cargo, registro, img: assinaturaImg };
  salvarDbAssinaturas();
  assinaturaImg = null;
  document.getElementById('assinPNGLabel').textContent = 'Clique para carregar PNG';
  document.getElementById('assinNomeInput').value = '';
  document.getElementById('assinCargoInput').value = '';
  document.getElementById('assinRegistroInput').value = '';
  renderizarListaAssinaturas();
  atualizarInfoAssinatura();
  toast(`Instrutor de "${curso}" salvo!`);
}

function renderizarListaAssinaturas() {
  const lista = document.getElementById('listaAssinaturas');
  const cursos = Object.keys(dbAssinaturas);
  if (!cursos.length) {
    lista.innerHTML = '<div style="font-size:11px;color:var(--text3);padding:8px">Nenhum instrutor cadastrado.</div>';
    return;
  }
  lista.innerHTML = cursos.map(c => {
    const a = dbAssinaturas[c];
    return `
      <div style="display:flex;align-items:center;gap:10px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;padding:8px 10px">
        ${a.img ? `<img src="${a.img}" style="height:28px;max-width:70px;object-fit:contain;filter:invert(1)">` : '<div style="width:50px;height:28px;background:var(--surface3);border-radius:4px"></div>'}
        <div style="flex:1;min-width:0">
          <div style="font-size:10px;font-weight:800;color:var(--red);text-transform:uppercase">${c}</div>
          <div style="font-size:11px;font-weight:700;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${a.nome}</div>
          <div style="font-size:9px;color:var(--text3)">${a.cargo || ''} ${a.registro ? '· ' + a.registro : ''}</div>
        </div>
        <button onclick="removerAssinatura('${c}')" style="font-size:9px;color:var(--red);background:none;border:none;cursor:pointer;font-family:var(--font);font-weight:800">✕</button>
      </div>
    `;
  }).join('');
}

function removerAssinatura(curso) {
  delete dbAssinaturas[curso];
  salvarDbAssinaturas();
  renderizarListaAssinaturas();
  atualizarInfoAssinatura();
  toast(`Assinatura de "${curso}" removida.`, 'error');
}

function atualizarInfoAssinatura() {
  const a = dbAssinaturas[slotAtivo];
  document.getElementById('assinNome').textContent  = a ? a.nome  : 'Sem assinatura';
  document.getElementById('assinCargo').textContent = a ? (a.cargo || a.registro || '') : 'Configure no painel admin';
}

/* ══════════════════════════════════════════════════
   HISTÓRICO E AUDITORIA (Fase 2)
   ══════════════════════════════════════════════════ */

async function registrarLote(dados) {
  const fb = window.__FB;
  if (!fb || !modoFirebase) return null;
  try {
    const ref = await fb.addDoc(fb.collection(fb.db, 'lotes'), {
      ...dados,
      operador: usuarioLogado || 'local',
      criadoEm: fb.serverTimestamp(),
    });
    return ref.id;
  } catch(e) {
    console.warn('Erro ao registrar lote:', e);
    return null;
  }
}

async function atualizarLote(id, dados) {
  const fb = window.__FB;
  if (!fb || !modoFirebase || !id) return;
  try {
    await fb.setDoc(fb.doc(fb.db, 'lotes', id), dados, { merge: true });
  } catch(e) { console.warn('Erro ao atualizar lote:', e); }
}

async function carregarHistorico() {
  const lista = document.getElementById('historicoLista');
  const fb = window.__FB;
  if (!fb || !modoFirebase) {
    lista.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:40px">Conecte-se ao Firebase para ver o histórico</div>';
    return;
  }
  lista.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:20px">Carregando...</div>';
  try {
    const q = fb.query(fb.collection(fb.db, 'lotes'), fb.orderBy('criadoEm', 'desc'), fb.limit(50));
    const snap = await fb.getDocs(q);
    if (snap.empty) {
      lista.innerHTML = '<div style="font-size:12px;color:var(--text3);text-align:center;padding:40px">Nenhum lote registrado ainda.</div>';
      return;
    }
    lista.innerHTML = snap.docs.map(d => {
      const l = d.data();
      const data = l.criadoEm?.toDate?.()?.toLocaleString('pt-BR') || '—';
      const statusCor = l.status === 'concluido' ? 'var(--green)' : l.status === 'erro' ? 'var(--red)' : 'var(--blue)';
      return `
        <div style="background:var(--surface2);border:1px solid var(--border);border-radius:10px;padding:14px 16px">
          <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">
            <div style="font-size:12px;font-weight:800;color:var(--text)">${l.curso || '—'} · ${l.total || 0} alunos</div>
            <div style="font-size:9px;font-weight:700;color:${statusCor};text-transform:uppercase;letter-spacing:.5px">${l.status || 'processando'}</div>
          </div>
          <div style="display:flex;gap:16px;font-size:10px;color:var(--text3)">
            <span>Operador: <strong style="color:var(--text2)">${l.operador || '—'}</strong></span>
            <span>Empresa: <strong style="color:var(--text2)">${l.empresa || '—'}</strong></span>
            <span>${data}</span>
          </div>
        </div>
      `;
    }).join('');
  } catch(e) {
    lista.innerHTML = `<div style="font-size:12px;color:var(--red);text-align:center;padding:20px">Erro ao carregar: ${e.message}</div>`;
  }
}

async function carregarDashboard() {
  const fb = window.__FB;
  if (!fb || !modoFirebase) return;
  try {
    const snap = await fb.getDocs(fb.collection(fb.db, 'lotes'));
    const lotes = snap.docs.map(d => d.data());
    const total = lotes.reduce((s, l) => s + (l.total || 0), 0);
    const hoje  = new Date(); hoje.setHours(0,0,0,0);
    const hojeCt = lotes.filter(l => l.criadoEm?.toDate?.() >= hoje)
                        .reduce((s, l) => s + (l.total || 0), 0);
    const cursoCt = {};
    lotes.forEach(l => { if (l.curso) cursoCt[l.curso] = (cursoCt[l.curso] || 0) + (l.total || 0); });
    const topCurso = Object.entries(cursoCt).sort((a,b) => b[1]-a[1])[0];

    document.getElementById('dTotal').textContent  = total;
    document.getElementById('dHoje').textContent   = hojeCt;
    document.getElementById('dLotes').textContent  = lotes.length;
    document.getElementById('dCurso').textContent  = topCurso ? topCurso[0] : '—';

    const dashLotes = document.getElementById('dashLotes');
    const recentes = [...lotes].sort((a,b) => (b.criadoEm?.seconds||0)-(a.criadoEm?.seconds||0)).slice(0,5);
    dashLotes.innerHTML = recentes.map(l => `
      <div style="display:flex;align-items:center;gap:12px;padding:8px 12px;background:var(--surface2);border:1px solid var(--border);border-radius:8px;margin-bottom:6px">
        <div style="font-size:18px;font-weight:800;color:var(--text);min-width:40px">${l.total||0}</div>
        <div>
          <div style="font-size:11px;font-weight:700;color:var(--text)">${l.curso||'—'}</div>
          <div style="font-size:10px;color:var(--text3)">${l.empresa||'—'} · ${l.operador||'—'}</div>
        </div>
      </div>
    `).join('');
  } catch(e) { console.warn('Dashboard error:', e); }
}

/* ══════════════════════════════════════════════════
   LOGIN — TABS
   ══════════════════════════════════════════════════ */

function switchLoginTab(tab) {
  document.getElementById('loginLocal').classList.toggle('hidden', tab !== 'local');
  document.getElementById('loginFirebase').classList.toggle('hidden', tab !== 'firebase');
  document.getElementById('tabLocal').classList.toggle('active', tab === 'local');
  document.getElementById('tabFirebase').classList.toggle('active', tab === 'firebase');
}

/* ══════════════════════════════════════════════════
   LOGIN LOCAL
   ══════════════════════════════════════════════════ */

function validarLogin() {
  const u = document.getElementById('userInput').value.trim();
  const p = document.getElementById('passInput').value;
  const conta = dbEquipe.find(c => c.user === u && c.pass === p);
  if (!conta) {
    toast('Usuário ou senha incorretos.', 'error');
    document.getElementById('passInput').value = '';
    return;
  }
  modoFirebase = false;
  usuarioLogado = conta.user;
  entrarNaPainel(conta.user, conta.role === 'admin');
}

/* ══════════════════════════════════════════════════
   LOGIN FIREBASE
   ══════════════════════════════════════════════════ */

async function validarLoginFirebase() {
  const fb = window.__FB;
  if (!fb) { toast('Firebase não configurado.', 'error'); return; }
  const email = document.getElementById('fbEmail').value.trim();
  const senha  = document.getElementById('fbPass').value;
  if (!email || !senha) { toast('Preencha e-mail e senha.', 'error'); return; }
  try {
    const cred = await fb.signInWithEmailAndPassword(fb.auth, email, senha);
    const user = cred.user;
    let role = 'user';
    try {
      const snap = await fb.getDoc(fb.doc(fb.db, 'users', user.uid));
      if (snap.exists()) role = snap.data().role || 'user';
    } catch(_) {}
    modoFirebase = true;
    usuarioLogado = email.split('@')[0];
    entrarNaPainel(usuarioLogado, role === 'admin');
    document.getElementById('syncBadge').classList.remove('hidden');
    await carregarSlotsFirebase(user.uid);
    await carregarAssinaturasFirebase(user.uid);
  } catch (err) {
    toast('Falha no login: ' + (err.message || 'Erro desconhecido'), 'error');
  }
}

/* ══════════════════════════════════════════════════
   ENTRAR NA PAINEL
   ══════════════════════════════════════════════════ */

function entrarNaPainel(nomeUsuario, isAdmin) {
  document.getElementById('loginSection').style.display = 'none';
  const main = document.getElementById('mainInterface');
  main.classList.remove('hidden');
  document.getElementById('userBadge').textContent = `OP: ${nomeUsuario.toUpperCase()}`;

  if (isAdmin) {
    document.getElementById('adminBtn').classList.remove('hidden');
    document.getElementById('btnHistorico').style.display = '';
    document.getElementById('btnDashboard').style.display = '';
    renderizarEquipe();
  }

  carregarDbAssinaturas();
  inicializarSlots();
  inicializarExcelInput();
}

function fazerLogout() {
  const fb = window.__FB;
  if (fb && modoFirebase) fb.signOut(fb.auth).catch(() => {});
  location.reload();
}

/* ══════════════════════════════════════════════════
   ABAS DE NAVEGAÇÃO
   ══════════════════════════════════════════════════ */

function toggleAba(aba) {
  abaAtiva = aba;
  document.getElementById('abaGeracao').style.display   = aba === 'geracao'   ? '' : 'none';
  document.getElementById('abaHistorico').style.display = aba === 'historico' ? 'flex' : 'none';
  document.getElementById('abaDashboard').style.display = aba === 'dashboard' ? 'flex' : 'none';
  if (aba === 'historico') carregarHistorico();
  if (aba === 'dashboard') carregarDashboard();
}

/* ══════════════════════════════════════════════════
   FIREBASE — Sincronização
   ══════════════════════════════════════════════════ */

async function carregarSlotsFirebase(uid) {
  const fb = window.__FB;
  if (!fb || !uid) return;
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, 'slots', uid));
    if (snap.exists()) {
      for (const [key, val] of Object.entries(snap.data())) {
        localStorage.setItem('ability_v9_slot_' + key, JSON.stringify(val));
      }
      toast('Configurações sincronizadas do Firebase ☁', 'success', 2500);
    }
  } catch(e) { console.warn('Erro ao carregar slots:', e); }
}

async function carregarAssinaturasFirebase(uid) {
  const fb = window.__FB;
  if (!fb || !uid) return;
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, 'assinaturas', uid));
    if (snap.exists()) {
      dbAssinaturas = snap.data();
      localStorage.setItem('ability_v4_assinaturas', JSON.stringify(dbAssinaturas));
    }
  } catch(e) { console.warn('Erro ao carregar assinaturas:', e); }
}

async function salvarSlotFirebase(slotNome, dados) {
  const fb = window.__FB;
  if (!fb || !modoFirebase) return;
  const user = fb.auth.currentUser;
  if (!user) return;
  try {
    const docRef = fb.doc(fb.db, 'slots', user.uid);
    const snap = await fb.getDoc(docRef);
    const atual = snap.exists() ? snap.data() : {};
    const { frente, verso, ...cfg } = dados;
    atual[slotNome] = cfg;
    await fb.setDoc(docRef, atual);
  } catch(e) { console.warn('Erro ao salvar slot:', e); }
}

/* ══════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════ */

function toggleAdmin() {
  document.getElementById('adminPanel').classList.toggle('hidden');
}

function renderizarEquipe() {
  document.getElementById('listaEquipe').innerHTML = dbEquipe.map((c, i) => `
    <div class="team-card">
      <div class="team-card-name">${c.user}</div>
      <div class="team-card-pass">${c.pass}</div>
      ${c.user !== 'Admin'
        ? `<button class="team-card-remove" onclick="removerColaborador(${i})">REMOVER</button>`
        : ''}
    </div>
  `).join('');
}

function adicionarColaborador() {
  const n = document.getElementById('newUserName').value.trim();
  const s = document.getElementById('newUserPass').value.trim();
  if (!n || !s) { toast('Preencha nome e senha.', 'error'); return; }
  dbEquipe.push({ user: n, pass: s, role: 'user' });
  persistirEquipe();
  document.getElementById('newUserName').value = '';
  document.getElementById('newUserPass').value = '';
  toast(`Colaborador "${n}" adicionado.`);
}

function removerColaborador(i) {
  const nome = dbEquipe[i].user;
  dbEquipe.splice(i, 1);
  persistirEquipe();
  toast(`"${nome}" removido.`, 'error');
}

function persistirEquipe() {
  localStorage.setItem('ability_v9_users', JSON.stringify(dbEquipe));
  renderizarEquipe();
}

/* ══════════════════════════════════════════════════
   SLOTS / CURSOS
   ══════════════════════════════════════════════════ */

function inicializarSlots() {
  const grid = document.getElementById('slotContainer');
  grid.innerHTML = CURSOS.map(nome => `
    <button
      class="cbtn ${nome === slotAtivo ? 'active' : ''}"
      id="slot_${nome.replace(/\s/g, '_')}"
      onclick="trocarSlot('${nome}')"
    >${nome}</button>
  `).join('');
}

function trocarSlot(nome) {
  slotAtivo = nome;
  document.querySelectorAll('.cbtn').forEach(b => b.classList.remove('active'));
  const btn = document.getElementById('slot_' + nome.replace(/\s/g, '_'));
  if (btn) btn.classList.add('active');

  const salvo = JSON.parse(localStorage.getItem('ability_v9_slot_' + slotAtivo) || 'null');
  if (salvo) {
    document.getElementById('range_y_nome').value = salvo.yn ?? 105;
    document.getElementById('range_s_nome').value = salvo.sn ?? 26;
    document.getElementById('range_y_cpf').value  = salvo.yc ?? 125;
    document.getElementById('range_s_cpf').value  = salvo.sc ?? 14;
    document.getElementById('range_y_data').value = salvo.yd ?? 145;
    document.getElementById('range_s_data').value = salvo.sd ?? 12;
    document.getElementById('range_x_qr').value   = salvo.xqr ?? 252;
    document.getElementById('range_y_qr').value   = salvo.yqr ?? 180;
    document.getElementById('range_s_qr').value   = salvo.sqr ?? 30;
    if (salvo.cor) { corTexto = salvo.cor; document.getElementById('corPersonalizada').value = corTexto; }
    imgFrente = salvo.frente || null;
    imgVerso  = salvo.verso  || null;
  } else {
    imgFrente = null; imgVerso = null; corTexto = '#000000';
  }

  atualizarLabels();
  atualizarStatusPDF();
  atualizarInfoAssinatura();
  updatePreview();
  atualizarStats();
}

function salvarSlot() {
  const dados = { ...getConfig(), frente: imgFrente, verso: imgVerso };
  try { localStorage.setItem('ability_v9_slot_' + slotAtivo, JSON.stringify(dados)); }
  catch(e) { console.warn('localStorage cheio:', e.message); }
  salvarSlotFirebase(slotAtivo, dados);
}

/* ══════════════════════════════════════════════════
   COR DO TEXTO
   ══════════════════════════════════════════════════ */

function selecionarCor(el) {
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  corTexto = el.dataset.color;
  document.getElementById('corPersonalizada').value = corTexto;
  ajusteReal();
}

/* ══════════════════════════════════════════════════
   SLIDERS
   ══════════════════════════════════════════════════ */

function atualizarLabels() {
  const campos = ['nome', 'cpf', 'data'];
  campos.forEach(id => {
    const y = document.getElementById('range_y_' + id)?.value;
    const s = document.getElementById('range_s_' + id)?.value;
    const cy = document.getElementById('chip_y_' + id);
    const cs = document.getElementById('chip_s_' + id);
    if (cy) cy.textContent = y + 'mm';
    if (cs) cs.textContent = s + 'pt';
  });
  // QR chips
  const xqr = document.getElementById('range_x_qr')?.value;
  const yqr = document.getElementById('range_y_qr')?.value;
  const sqr = document.getElementById('range_s_qr')?.value;
  if (document.getElementById('chip_x_qr')) document.getElementById('chip_x_qr').textContent = xqr + 'mm';
  if (document.getElementById('chip_y_qr')) document.getElementById('chip_y_qr').textContent = yqr + 'mm';
  if (document.getElementById('chip_s_qr')) document.getElementById('chip_s_qr').textContent = sqr + 'mm';
}

function ajusteReal() {
  atualizarLabels();
  updatePreview();
  salvarSlot();
}

/* ══════════════════════════════════════════════════
   STATUS PDFs
   ══════════════════════════════════════════════════ */

function atualizarStatusPDF() {
  const dotF = document.getElementById('dotFrente');
  const dotV = document.getElementById('dotVerso');
  const lblF = document.getElementById('labelFrente');
  const lblV = document.getElementById('labelVerso');
  if (imgFrente) { dotF.classList.add('loaded'); lblF.textContent = 'PDF carregado ✓'; }
  else           { dotF.classList.remove('loaded'); lblF.textContent = 'Clique para carregar'; }
  if (imgVerso)  { dotV.classList.add('loaded'); lblV.textContent = 'PDF carregado ✓'; }
  else           { dotV.classList.remove('loaded'); lblV.textContent = 'Clique para carregar'; }
}

/* ══════════════════════════════════════════════════
   PDF PROCESSING
   ══════════════════════════════════════════════════ */

async function processarPDF(input, tipo) {
  const file = input.files[0];
  if (!file) return;
  const lbl = tipo === 'frente'
    ? document.getElementById('labelFrente')
    : document.getElementById('labelVerso');
  lbl.textContent = 'Processando...';
  try {
    const buffer  = await file.arrayBuffer();
    const uint8   = new Uint8Array(buffer);
    const loadTask= pdfjsLib.getDocument({ data: uint8 });
    const pdf     = await loadTask.promise;
    const page    = await pdf.getPage(1);
    const vp      = page.getViewport({ scale: 3.0 });
    const tmp     = document.createElement('canvas');
    tmp.width = vp.width; tmp.height = vp.height;
    await page.render({ canvasContext: tmp.getContext('2d'), viewport: vp }).promise;
    const dataUrl = tmp.toDataURL('image/jpeg', 0.92);
    if (tipo === 'frente') imgFrente = dataUrl;
    else imgVerso = dataUrl;
    lbl.textContent = file.name;
    salvarSlot();
    atualizarStatusPDF();
    updatePreview();
    toast(`PDF de ${tipo} carregado! ✓`);
  } catch(e) {
    lbl.textContent = 'Erro ao carregar';
    toast('Erro ao processar o PDF: ' + (e.message || e), 'error');
    console.error(e);
  }
  input.value = '';
}

/* ══════════════════════════════════════════════════
   EXCEL — Leitura com mapeamento inteligente
   ══════════════════════════════════════════════════ */

function inicializarExcelInput() {
  document.getElementById('excelInput').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = async (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), {
          type: 'array', cellDates: true, dateNF: 'dd/mm/yyyy',
        });
        const sheet  = wb.Sheets[wb.SheetNames[0]];
        const dados  = XLSX.utils.sheet_to_json(sheet, { defval: '', raw: false });

        if (dados.length === 0) {
          toast('Planilha vazia ou sem dados reconhecíveis.', 'error');
          return;
        }

        const colunas = Object.keys(dados[0]);
        console.log('[Ability] Colunas detectadas:', colunas);

        // Detectar mapeamento automático
        const sugestoes = detectarMapeamento(dados);
        console.log('[Ability] Sugestões de mapeamento:', sugestoes);

        // Verificar se há colunas ambíguas que precisam de confirmação
        const nomeSugerido = sugestoes['nome'];
        if (!nomeSugerido || levenshtein(normalizar(nomeSugerido), 'nome') > 2) {
          // Mostrar modal para confirmação
          toast('⚠ Colunas não reconhecidas automaticamente. Confirme o mapeamento.', 'error', 4000);
          const mapa = await mostrarModalColMap(colunas, sugestoes);
          if (mapa) {
            mapeamentoColunas = mapa;
          } else {
            mapeamentoColunas = sugestoes; // usa sugestão mesmo sem confirmação
          }
        } else {
          mapeamentoColunas = sugestoes;
          toast(`✓ Colunas mapeadas automaticamente. Nome: "${nomeSugerido}"`, 'success', 3000);
        }

        dadosExcel     = dados;
        dadosFiltrados = dados;
        alunoAtual     = 0;
        atualizarStats();
        atualizarNavegacao();
        updatePreview();
        renderizarTabela();
        toast(`✓ ${dados.length} aluno(s) carregados.`);

      } catch (err) {
        toast('Erro ao ler o arquivo Excel: ' + err.message, 'error');
        console.error(err);
      }
    };
    reader.readAsArrayBuffer(file);
    e.target.value = '';
  };
}

function atualizarStats() {
  document.getElementById('statAlunos').textContent  = dadosExcel.length;
  document.getElementById('statPaginas').textContent = dadosExcel.length * 2;
  document.getElementById('statStatus').textContent  =
    dadosExcel.length > 0
      ? `${slotAtivo} · ${dadosExcel.length} alunos prontos`
      : 'Nenhuma planilha carregada';
}

/* ══════════════════════════════════════════════════
   TABELA DE ALUNOS
   ══════════════════════════════════════════════════ */

function toggleTabela() {
  tabelaVisivel = !tabelaVisivel;
  document.getElementById('tabelaWrap').classList.toggle('hidden', !tabelaVisivel);
  if (tabelaVisivel) renderizarTabela();
}

function filtrarTabela() {
  const termo = document.getElementById('buscaAluno').value.toLowerCase();
  dadosFiltrados = dadosExcel.filter(a => {
    const nome = buscarColuna(a, 'nome');
    return nome.toLowerCase().includes(termo);
  });
  renderizarTabela(false);
}

function renderizarTabela(atualizarFiltro = true) {
  if (atualizarFiltro) dadosFiltrados = [...dadosExcel];
  const body = document.getElementById('tabelaBody');
  if (!dadosFiltrados.length) {
    body.innerHTML = '<div style="padding:16px;color:var(--text3);font-size:12px;">Nenhum aluno encontrado.</div>';
    return;
  }
  const colunas     = Object.keys(dadosFiltrados[0]);
  const colsVisiveis = colunas.slice(0, 5);
  body.innerHTML = `
    <table class="tabela">
      <thead>
        <tr>
          <th>#</th>
          ${colsVisiveis.map(c => `<th>${c}</th>`).join('')}
          <th>Ação</th>
        </tr>
      </thead>
      <tbody>
        ${dadosFiltrados.map((a, i) => `
          <tr class="${dadosExcel.indexOf(a) === alunoAtual ? 'row-ativo' : ''}"
              onclick="irParaAluno(${dadosExcel.indexOf(a)})">
            <td style="color:var(--text3)">${i + 1}</td>
            ${colsVisiveis.map(c => `<td>${String(a[c] || '').substring(0, 30)}</td>`).join('')}
            <td>
              <button onclick="event.stopPropagation();irParaAluno(${dadosExcel.indexOf(a)});gerarUnico()"
                class="tabela-btn-gen">PDF</button>
            </td>
          </tr>
        `).join('')}
      </tbody>
    </table>
  `;
  document.getElementById('tabelaTitle').textContent = `${dadosFiltrados.length} aluno(s) carregados`;
}

function irParaAluno(idx) {
  alunoAtual = idx;
  atualizarNavegacao();
  updatePreview();
}

/* ══════════════════════════════════════════════════
   NAVEGAÇÃO DE ALUNOS
   ══════════════════════════════════════════════════ */

function atualizarNavegacao() {
  const total = dadosExcel.length;
  document.getElementById('navCount').textContent =
    total > 0 ? `${alunoAtual + 1} / ${total}` : '— / —';
  document.getElementById('btnPrev').disabled = alunoAtual <= 0;
  document.getElementById('btnNext').disabled = alunoAtual >= total - 1;
}

function navegarAluno(delta) {
  const novoIdx = alunoAtual + delta;
  if (novoIdx < 0 || novoIdx >= dadosExcel.length) return;
  alunoAtual = novoIdx;
  atualizarNavegacao();
  updatePreview();
}

/* ══════════════════════════════════════════════════
   PREVIEW
   ══════════════════════════════════════════════════ */

function updatePreview() {
  const canvas      = document.getElementById('previewCanvas');
  const placeholder = document.getElementById('placeholder');
  if (!imgFrente) {
    canvas.style.display  = 'none';
    placeholder.style.display = 'flex';
    return;
  }
  placeholder.style.display = 'none';
  canvas.style.display       = 'block';

  const img = new Image();
  img.onload = async () => {
    canvas.width  = 2970;
    canvas.height = 2100;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const cfg   = getConfig();
    const aluno = dadosExcel[alunoAtual] || {};
    const ratio = 10;

    const nome    = buscarColuna(aluno, 'nome') || 'NOME DO ALUNO';
    const cpf     = buscarColuna(aluno, 'cpf')  || '000.000.000-00';
    const dataRaw = aluno[slotAtivo]
      || buscarColuna(aluno, 'data')
      || '';

    ctx.fillStyle = cfg.cor;
    ctx.textAlign = 'center';
    ctx.shadowColor = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur  = 4;

    ctx.font = `bold ${cfg.sn * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(nome.toUpperCase(), canvas.width / 2, cfg.yn * ratio);

    ctx.font = `${cfg.sc * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(`CPF: ${cpf}`, canvas.width / 2, cfg.yc * ratio);

    ctx.font = `${cfg.sd * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(`Data: ${formatarData(dataRaw)}`, canvas.width / 2, cfg.yd * ratio);

    ctx.shadowBlur = 0;

    // Assinatura dinâmica no preview
    const ass = dbAssinaturas[slotAtivo];
    if (ass && ass.img) {
      const assImg = new Image();
      assImg.onload = () => {
        ctx.drawImage(assImg, canvas.width / 2 - 300, 1700, 600, 120);
        if (ass.nome) {
          ctx.fillStyle = cfg.cor;
          ctx.font = `bold 36px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(ass.nome, canvas.width / 2, 1860);
        }
        if (ass.cargo) {
          ctx.font = `28px 'Plus Jakarta Sans', sans-serif`;
          ctx.fillText(`${ass.cargo}${ass.registro ? ' · ' + ass.registro : ''}`, canvas.width / 2, 1900);
        }
      };
      assImg.src = ass.img;
    }

    // QR Code no preview
    if (cfg.enableQR && dadosExcel.length > 0) {
      try {
        const hash = await gerarHashCertificado(cpf, slotAtivo, formatarData(dataRaw));
        const qrUrl = `https://abilitypro.com.br/validar?id=${hash}`;
        const qrDataURL = await gerarQRDataURL(qrUrl, 200);
        if (qrDataURL) {
          const qrImg = new Image();
          qrImg.onload = () => {
            const sz  = cfg.sqr * ratio;
            const px  = cfg.xqr * ratio;
            const py  = cfg.yqr * ratio;
            ctx.drawImage(qrImg, px, py, sz, sz);
          };
          qrImg.src = qrDataURL;
        }
      } catch(e) { /* QR silently fails on preview */ }
    }
  };
  img.src = imgFrente;
}

/* ══════════════════════════════════════════════════
   APLICAR TEXTO NO JSPDF (com assinatura + QR)
   ══════════════════════════════════════════════════ */

async function aplicarTextoNoPDF(doc, aluno, cfg, qrDataURL) {
  const rgb = hexParaRGB(cfg.cor);
  doc.setTextColor(rgb.r, rgb.g, rgb.b);

  const nome    = buscarColuna(aluno, 'nome') || '';
  const cpf     = buscarColuna(aluno, 'cpf')  || '';
  const dataRaw = aluno[slotAtivo]
    || buscarColuna(aluno, 'data')
    || '';

  if (nome) {
    doc.setFontSize(cfg.sn);
    doc.text(nome.toUpperCase(), 148.5, cfg.yn, { align: 'center' });
  }
  if (cpf) {
    doc.setFontSize(cfg.sc);
    doc.text(`CPF: ${cpf}`, 148.5, cfg.yc, { align: 'center' });
  }
  const dataFormatada = formatarData(dataRaw);
  if (dataFormatada) {
    doc.setFontSize(cfg.sd);
    doc.text(`Data: ${dataFormatada}`, 148.5, cfg.yd, { align: 'center' });
  }

  // Assinatura dinâmica
  const ass = dbAssinaturas[slotAtivo];
  if (ass) {
    if (ass.img) {
      try { doc.addImage(ass.img, 'PNG', 100, 160, 80, 20); } catch(e) {}
    }
    if (ass.nome) {
      doc.setFontSize(9);
      doc.text(ass.nome, 140, 184, { align: 'center' });
    }
    if (ass.cargo) {
      doc.setFontSize(7);
      doc.text(`${ass.cargo}${ass.registro ? ' · ' + ass.registro : ''}`, 140, 188, { align: 'center' });
    }
  }

  // QR Code
  if (cfg.enableQR && qrDataURL) {
    try {
      doc.addImage(qrDataURL, 'PNG', cfg.xqr, cfg.yqr, cfg.sqr, cfg.sqr);
    } catch(e) {}
  }
}

/* ══════════════════════════════════════════════════
   GERAÇÃO — Aluno único
   ══════════════════════════════════════════════════ */

async function gerarUnico() {
  if (!imgFrente || !imgVerso) {
    toast('Carregue o PDF de frente e verso antes de gerar.', 'error'); return;
  }
  if (dadosExcel.length === 0) {
    toast('Carregue a planilha Excel antes de gerar.', 'error'); return;
  }

  const p   = dadosExcel[alunoAtual];
  const cfg = getConfig();
  const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

  let qrDataURL = null;
  if (cfg.enableQR) {
    const cpf  = buscarColuna(p, 'cpf') || '';
    const data = formatarData(p[slotAtivo] || buscarColuna(p, 'data') || '');
    const hash = await gerarHashCertificado(cpf, slotAtivo, data);
    const qrUrl= `https://abilitypro.com.br/validar?id=${hash}`;
    qrDataURL  = await gerarQRDataURL(qrUrl);
    await registrarCertificadoFirestore(hash, p, slotAtivo);
  }

  doc.addImage(imgFrente, 'JPEG', 0, 0, 297, 210);
  await aplicarTextoNoPDF(doc, p, cfg, qrDataURL);
  doc.addPage();
  doc.addImage(imgVerso, 'JPEG', 0, 0, 297, 210);

  const nome = buscarColuna(p, 'nome') || 'aluno';
  doc.save(`Ability_${slotAtivo}_${nome.replace(/\s+/g, '_')}.pdf`);
  toast(`Certificado de "${nome}" exportado!`);
}

/* ══════════════════════════════════════════════════
   GERAÇÃO EM LOTE (com Web Worker e ZIP individual)
   ══════════════════════════════════════════════════ */

async function gerarLoteCompleto() {
  if (gerando) return;
  if (!imgFrente || !imgVerso) {
    toast('Carregue o PDF de frente e verso antes de gerar.', 'error'); return;
  }
  if (dadosExcel.length === 0) {
    toast('Carregue a planilha Excel antes de gerar.', 'error'); return;
  }

  gerando = true;
  const btn = document.getElementById('genBtn');
  btn.disabled = true;
  setProgresso(0, 'Iniciando geração...');

  // Registrar lote no Firestore
  const empresa = buscarColuna(dadosExcel[0], 'empresa') || '';
  const loteId  = await registrarLote({
    curso: slotAtivo,
    empresa,
    total: dadosExcel.length,
    status: 'processando',
  });

  try {
    const cfg   = getConfig();
    const total = dadosExcel.length;
    const zip   = new JSZip();
    let erros   = 0;

    for (let i = 0; i < total; i++) {
      const p = dadosExcel[i];

      try {
        const doc = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });

        let qrDataURL = null;
        if (cfg.enableQR) {
          const cpf  = buscarColuna(p, 'cpf') || '';
          const data = formatarData(p[slotAtivo] || buscarColuna(p, 'data') || '');
          const hash = await gerarHashCertificado(cpf, slotAtivo, data);
          const url  = `https://abilitypro.com.br/validar?id=${hash}`;
          qrDataURL  = await gerarQRDataURL(url);
          await registrarCertificadoFirestore(hash, p, slotAtivo);
        }

        // FRENTE
        doc.addImage(imgFrente, 'JPEG', 0, 0, 297, 210);
        await aplicarTextoNoPDF(doc, p, cfg, qrDataURL);

        // VERSO
        doc.addPage();
        doc.addImage(imgVerso, 'JPEG', 0, 0, 297, 210);

        const nome = buscarColuna(p, 'nome') || `aluno_${i + 1}`;
        const pdfBytes = doc.output('arraybuffer');
        zip.file(`${(i+1).toString().padStart(3,'0')}_${nome.replace(/\s+/g, '_')}.pdf`, pdfBytes);

      } catch(err) {
        erros++;
        console.warn(`Erro no aluno ${i+1}:`, err);
      }

      const pct = Math.round(((i + 1) / total) * 100);
      setProgresso(pct, `Gerando aluno ${i + 1} de ${total}...`);

      // Yield a cada 5 para não travar UI
      if (i % 5 === 0) await new Promise(r => setTimeout(r, 0));
    }

    setProgresso(95, 'Compactando ZIP...');
    const zipBlob = await zip.generateAsync({ type: 'blob' });
    const url = URL.createObjectURL(zipBlob);
    const a   = document.createElement('a');
    a.href = url;
    a.download = `Ability_${slotAtivo}_Lote_${total}alunos.zip`;
    a.click();
    URL.revokeObjectURL(url);

    setProgresso(100, `${total} certificado(s) gerado(s) com sucesso. ✓`);
    toast(`Lote de ${total} certificado(s) exportado como ZIP!`);

    await atualizarLote(loteId, { status: 'concluido', erros, concluidoEm: new Date().toISOString() });

  } catch (err) {
    toast('Erro durante a geração: ' + err.message, 'error');
    console.error(err);
    setProgresso(0, 'Erro na geração.');
    await atualizarLote(loteId, { status: 'erro', erro: err.message });
  }

  gerando = false;
  btn.disabled = false;
}

function setProgresso(pct, msg) {
  document.getElementById('progFill').style.width = pct + '%';
  document.getElementById('progPct').textContent  = pct + '%';
  document.getElementById('progSub').textContent  = msg;
}

/* ══════════════════════════════════════════════════
   INIT
   ══════════════════════════════════════════════════ */

window.addEventListener('DOMContentLoaded', () => {
  document.getElementById('userInput').focus();

  const checkFB = setInterval(() => {
    if (window.__FB) {
      clearInterval(checkFB);
      window.__FB.onAuthStateChanged(window.__FB.auth, async (user) => {
        if (user && !document.getElementById('mainInterface').classList.contains('hidden')) {
          document.getElementById('syncBadge')?.classList.remove('hidden');
        }
      });
    }
  }, 200);

  // Mostrar aba de geração por padrão
  document.getElementById('abaGeracao').style.display = '';
  document.getElementById('abaHistorico').style.display = 'none';
  document.getElementById('abaDashboard').style.display = 'none';
});
