/* ══════════════════════════════════════════════════════════════════════ */
/* ABILITY PRO - CERTIFICATION SUITE v4.0                               */
/* app.js — Script Principal                                             */
/* ══════════════════════════════════════════════════════════════════════ */

'use strict';

/* ── ESTADO GLOBAL ────────────────────────────────────────────────────── */
const STATE = {
  /* Auth */
  usuarioAtual: null,
  tipoAcesso: null,           // 'master' | 'team'
  loginTab: 'master',

  /* Curso */
  cursoAtivo: 'FSD',

  /* PDFs / Assets */
  pdfFrenteDoc: null,         // pdf.js document
  pdfVersoDoc: null,
  pdfFrenteNome: '',
  pdfVersoNome: '',
  assinaturaImg: null,        // HTMLImageElement
  assinaturaNome: '',
  assinaturaCargo: '',

  /* Dados importados */
  alunosOriginais: [],        // todos os alunos
  alunosFiltrados: [],        // lista filtrada (para tabela)
  alunoIndex: 0,              // índice actual no preview
  colMap: {},                 // { nome, cpf, data, empresa }
  colunasBruto: [],           // cabeçalhos da planilha
  linhasBruto: [],            // linhas raw

  /* Canvas / Zoom */
  canvasScale: 1.0,
  zoomFactor: 1.0,

  /* Config de layout */
  corTexto: '#05070d',
  posY: { nome: 260, meta: 340, assin: 440 },

  /* Geração */
  gerando: false,

  /* UI */
  adminAberto: false,
  tabelaAberta: false,

  /* Equipa (Firestore cache) */
  membrosEquipa: [],
};

/* ── CONSTANTES ──────────────────────────────────────────────────────── */
const LOCAL_ADMIN = { usuario: 'Admin', senha: '2729' };
const CERT_W = 841; // A4 landscape px a 96dpi (297mm ≈ 841px, 210mm ≈ 595px... usando A4L)
const CERT_H = 595;

/* ══════════════════════════════════════════════════════════════════════ */
/* INICIALIZAÇÃO                                                          */
/* ══════════════════════════════════════════════════════════════════════ */
window.addEventListener('DOMContentLoaded', () => {
  // Configura pdf.js worker
  if (window.pdfjsLib) {
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
  }

  // Aguarda Firebase
  const fbWait = setInterval(() => {
    if (window.__FB) {
      clearInterval(fbWait);
      iniciarFirebaseAuth();
      carregarEquipaLogin();
    }
  }, 100);

  // Fallback se Firebase demorar muito (modo offline/local)
  setTimeout(() => clearInterval(fbWait), 8000);
});

function iniciarFirebaseAuth() {
  const { auth, onAuthStateChanged } = window.__FB;
  onAuthStateChanged(auth, (user) => {
    if (user && STATE.tipoAcesso === 'master') {
      STATE.usuarioAtual = user;
      mostrarInterfacePrincipal('master-firebase', user.email);
    }
  });
}

/* ══════════════════════════════════════════════════════════════════════ */
/* LOGIN / LOGOUT                                                         */
/* ══════════════════════════════════════════════════════════════════════ */
window.setLoginTab = function (tab) {
  STATE.loginTab = tab;
  document.getElementById('btnTabMaster').classList.toggle('active', tab === 'master');
  document.getElementById('btnTabTeam').classList.toggle('active', tab === 'team');
  document.getElementById('wrapEmail').style.display = tab === 'master' ? '' : 'none';
  document.getElementById('wrapTeamUser').style.display = tab === 'team' ? '' : 'none';

  const hint = document.getElementById('loginHint');
  if (tab === 'master') {
    hint.innerHTML = 'Login local: <code>Admin</code> / <code>2729</code> ou email Firebase cadastrado.';
  } else {
    hint.innerHTML = 'Selecione o operador e introduza a sua senha pessoal.';
  }
};

window.executarLogin = async function () {
  const senha = document.getElementById('loginPassword').value.trim();
  const btn = document.querySelector('.login-btn');
  btn.textContent = 'Verificando...';
  btn.disabled = true;

  try {
    if (STATE.loginTab === 'master') {
      await loginMaster(senha);
    } else {
      await loginEquipa(senha);
    }
  } finally {
    btn.textContent = 'Entrar no Sistema';
    btn.disabled = false;
  }
};

async function loginMaster(senha) {
  const email = document.getElementById('loginEmail').value.trim();

  // 1) Login local Admin/2729
  if ((email === '' || email.toLowerCase() === 'admin') && senha === LOCAL_ADMIN.senha) {
    STATE.usuarioAtual = { uid: 'local-admin', email: 'admin@local', displayName: 'Admin' };
    STATE.tipoAcesso = 'master';
    mostrarInterfacePrincipal('master-local', 'Admin');
    return;
  }

  // 2) Login Firebase
  if (!email) { toast('Erro', 'Introduza o e-mail.', 'error'); return; }
  if (!window.__FB) { toast('Erro', 'Firebase não disponível.', 'error'); return; }

  try {
    const { auth, signInWithEmailAndPassword } = window.__FB;
    const cred = await signInWithEmailAndPassword(auth, email, senha);
    STATE.usuarioAtual = cred.user;
    STATE.tipoAcesso = 'master';
    mostrarInterfacePrincipal('master-firebase', cred.user.email);
  } catch (e) {
    const msg = traduzirErroFirebase(e.code);
    toast('Falha na autenticação', msg, 'error');
  }
}

async function loginEquipa(senha) {
  const sel = document.getElementById('loginTeamSelect');
  const membroId = sel.value;
  if (!membroId) { toast('Erro', 'Selecione um operador.', 'error'); return; }

  const membro = STATE.membrosEquipa.find(m => m.id === membroId);
  if (!membro) { toast('Erro', 'Operador não encontrado.', 'error'); return; }
  if (membro.senha !== senha) { toast('Acesso Negado', 'Senha incorrecta.', 'error'); return; }

  STATE.usuarioAtual = { uid: membroId, displayName: membro.nome, email: '' };
  STATE.tipoAcesso = 'team';
  mostrarInterfacePrincipal('team', membro.nome);
}

window.executarLogout = async function () {
  if (window.__FB && STATE.tipoAcesso === 'master-firebase') {
    try { await window.__FB.signOut(window.__FB.auth); } catch (_) {}
  }
  STATE.usuarioAtual = null;
  STATE.tipoAcesso = null;
  resetEstadoCompleto();
  document.getElementById('loginSection').classList.remove('hidden');
  document.getElementById('mainInterface').classList.add('hidden');
  document.getElementById('loginPassword').value = '';
};

function mostrarInterfacePrincipal(tipo, nomeDisplay) {
  document.getElementById('loginSection').classList.add('hidden');
  document.getElementById('mainInterface').classList.remove('hidden');

  // Badge de role
  const isMaster = tipo.startsWith('master');
  document.getElementById('userRoleBadge').textContent = isMaster ? `Diretor — ${nomeDisplay}` : `Operador — ${nomeDisplay}`;

  // Painel Admin só para master
  const btnAdmin = document.getElementById('btnToggleAdmin');
  if (isMaster) {
    btnAdmin.classList.remove('hidden');
    carregarEquipaAdmin();
  } else {
    btnAdmin.classList.add('hidden');
  }

  toast('Bem-vindo', `Sessão iniciada como ${nomeDisplay}.`, 'success');
}

/* ══════════════════════════════════════════════════════════════════════ */
/* EQUIPA — CARREGAR / ADICIONAR / REMOVER                               */
/* ══════════════════════════════════════════════════════════════════════ */
async function carregarEquipaLogin() {
  if (!window.__FB) return;
  try {
    const { db, collection, getDocs } = window.__FB;
    const snap = await getDocs(collection(db, 'equipa'));
    STATE.membrosEquipa = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    popularSelectEquipa();
  } catch (_) {}
}

function popularSelectEquipa() {
  const sel = document.getElementById('loginTeamSelect');
  sel.innerHTML = '';
  if (STATE.membrosEquipa.length === 0) {
    sel.innerHTML = '<option value="">Nenhum operador cadastrado</option>';
    return;
  }
  const def = document.createElement('option');
  def.value = ''; def.textContent = 'Selecionar operador...';
  sel.appendChild(def);
  STATE.membrosEquipa.forEach(m => {
    const o = document.createElement('option');
    o.value = m.id; o.textContent = m.nome;
    sel.appendChild(o);
  });
}

async function carregarEquipaAdmin() {
  await carregarEquipaLogin();
  renderizarTeamGrid();
}

function renderizarTeamGrid() {
  const grid = document.getElementById('teamGrid');
  grid.innerHTML = '';
  STATE.membrosEquipa.forEach(m => {
    const card = document.createElement('div');
    card.className = 'team-card';
    card.innerHTML = `
      <div class="team-card-name">${escHtml(m.nome)}</div>
      <div class="team-card-pass">${escHtml(m.senha)}</div>
      <button class="team-card-remove" onclick="removerMembroEquipa('${m.id}')">✕ Remover</button>
    `;
    grid.appendChild(card);
  });
}

window.adicionarMembroEquipa = async function () {
  const nome = document.getElementById('newTeamName').value.trim();
  const senha = document.getElementById('newTeamPass').value.trim();
  if (!nome || !senha) { toast('Erro', 'Preencha nome e senha.', 'error'); return; }
  if (!window.__FB) { toast('Erro', 'Firebase não disponível.', 'error'); return; }

  try {
    const { db, collection, addDoc } = window.__FB;
    const docRef = await addDoc(collection(db, 'equipa'), { nome, senha, criado: new Date().toISOString() });
    STATE.membrosEquipa.push({ id: docRef.id, nome, senha });
    document.getElementById('newTeamName').value = '';
    document.getElementById('newTeamPass').value = '';
    renderizarTeamGrid();
    popularSelectEquipa();
    toast('Sucesso', `Operador "${nome}" adicionado.`, 'success');
  } catch (e) {
    toast('Erro', 'Falha ao salvar no Firestore.', 'error');
  }
};

window.removerMembroEquipa = async function (id) {
  if (!window.__FB) return;
  try {
    const { db, doc, deleteDoc } = window.__FB;
    await deleteDoc(doc(db, 'equipa', id));
    STATE.membrosEquipa = STATE.membrosEquipa.filter(m => m.id !== id);
    renderizarTeamGrid();
    popularSelectEquipa();
    toast('Removido', 'Operador eliminado.', 'success');
  } catch (_) {
    toast('Erro', 'Falha ao remover.', 'error');
  }
};

/* ══════════════════════════════════════════════════════════════════════ */
/* ADMIN PANEL TOGGLE                                                     */
/* ══════════════════════════════════════════════════════════════════════ */
window.toggleAdminPanel = function () {
  STATE.adminAberto = !STATE.adminAberto;
  document.getElementById('adminPanel').classList.toggle('hidden', !STATE.adminAberto);
};

/* ══════════════════════════════════════════════════════════════════════ */
/* CURSO                                                                  */
/* ══════════════════════════════════════════════════════════════════════ */
window.setCurso = function (cod) {
  STATE.cursoAtivo = cod;
  document.querySelectorAll('.cbtn').forEach(b => {
    b.classList.toggle('active', b.textContent.trim() === cod);
  });
  document.getElementById('psbCursoBadge').textContent = `CURSO: ${cod}`;
  if (STATE.alunosOriginais.length > 0) renderizarPreviewAtual();
};

/* ══════════════════════════════════════════════════════════════════════ */
/* UPLOAD PDF FRENTE                                                      */
/* ══════════════════════════════════════════════════════════════════════ */
window.manipularUploadPDFFrente = async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  document.getElementById('pdfFrenteNameDisplay').textContent = 'Carregando...';
  try {
    const ab = await file.arrayBuffer();
    STATE.pdfFrenteDoc = await pdfjsLib.getDocument({ data: ab }).promise;
    STATE.pdfFrenteNome = file.name;
    document.getElementById('pdfFrenteNameDisplay').textContent = file.name;
    document.getElementById('pdfFrenteSubDisplay').textContent = `${STATE.pdfFrenteDoc.numPages} página(s) • ${formatarBytes(file.size)}`;
    document.getElementById('pdfFrenteDotStatus').classList.add('loaded');
    toast('Template Carregado', `Frente: ${file.name}`, 'success');
    verificarProntoParaGerar();
    if (STATE.alunosOriginais.length > 0) renderizarPreviewAtual();
  } catch (e) {
    toast('Erro', 'Falha ao ler o PDF. Verifique se não está protegido.', 'error');
    console.error(e);
  }
  event.target.value = '';
};

/* ══════════════════════════════════════════════════════════════════════ */
/* UPLOAD PDF VERSO                                                       */
/* ══════════════════════════════════════════════════════════════════════ */
window.manipularUploadPDFVerso = async function (event) {
  const file = event.target.files[0];
  if (!file) return;

  try {
    const ab = await file.arrayBuffer();
    STATE.pdfVersoDoc = await pdfjsLib.getDocument({ data: ab }).promise;
    STATE.pdfVersoNome = file.name;
    document.getElementById('pdfVersoNameDisplay').textContent = file.name;
    document.getElementById('pdfVersoSubDisplay').textContent = `${STATE.pdfVersoDoc.numPages} página(s)`;
    document.getElementById('pdfVersoDotStatus').classList.add('loaded');
    toast('Verso Carregado', file.name, 'success');
  } catch (e) {
    toast('Erro', 'Falha ao ler o PDF verso.', 'error');
  }
  event.target.value = '';
};

/* ══════════════════════════════════════════════════════════════════════ */
/* UPLOAD ASSINATURA                                                      */
/* ══════════════════════════════════════════════════════════════════════ */
window.manipularUploadAssinatura = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    const img = new Image();
    img.onload = () => {
      STATE.assinaturaImg = img;
      document.getElementById('sigFileNameDisplay').textContent = file.name;
      document.getElementById('sigFileSubDisplay').textContent = `${img.width}×${img.height}px`;
      document.getElementById('sigDotStatus').classList.add('loaded');
      document.getElementById('assinaturaInfoWrap').classList.remove('hidden');
      toast('Assinatura Carregada', file.name, 'success');
      if (STATE.alunosOriginais.length > 0) renderizarPreviewAtual();
    };
    img.src = e.target.result;
  };
  reader.readAsDataURL(file);
  event.target.value = '';
};

/* ══════════════════════════════════════════════════════════════════════ */
/* UPLOAD EXCEL                                                           */
/* ══════════════════════════════════════════════════════════════════════ */
window.manipularUploadExcel = function (event) {
  const file = event.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (e) => {
    try {
      const wb = XLSX.read(e.target.result, { type: 'array' });
      const ws = wb.Sheets[wb.SheetNames[0]];
      const json = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' });

      if (json.length < 2) { toast('Erro', 'Planilha vazia ou sem dados.', 'error'); return; }

      STATE.colunasBruto = (json[0] || []).map(String);
      STATE.linhasBruto = json.slice(1).filter(r => r.some(c => c !== ''));

      // Mapeamento automático
      STATE.colMap = mapearColunasAutomatico(STATE.colunasBruto);

      // Verifica se mapeamento foi completo
      const camposFaltando = ['nome', 'cpf', 'data', 'empresa'].filter(k => STATE.colMap[k] === undefined || STATE.colMap[k] === null);
      if (camposFaltando.length > 0) {
        abrirModalMapeamento();
      } else {
        finalizarImportacao();
      }
    } catch (err) {
      toast('Erro', 'Não foi possível ler a planilha.', 'error');
      console.error(err);
    }
  };
  reader.readAsArrayBuffer(file);
  event.target.value = '';
};

/* ── Mapeamento Automático ─────────────────────────────────────────── */
function mapearColunasAutomatico(colunas) {
  const mapa = {};
  const regras = {
    nome:    /nome|aluno|estudante|candidato|participante/i,
    cpf:     /cpf|documento|doc|rg/i,
    data:    /data|conclus|fim|termino|término|date|end/i,
    empresa: /empresa|company|org|organiz|institui/i,
  };

  colunas.forEach((col, idx) => {
    for (const [campo, re] of Object.entries(regras)) {
      if (re.test(col) && mapa[campo] === undefined) {
        mapa[campo] = idx;
      }
    }
  });
  return mapa;
}

/* ── Modal Mapeamento ──────────────────────────────────────────────── */
function abrirModalMapeamento() {
  const campos = [
    { key: 'nome',    label: 'Nome do Aluno', icon: '👤' },
    { key: 'cpf',     label: 'CPF / Documento', icon: '🪪' },
    { key: 'data',    label: 'Data de Conclusão', icon: '📅' },
    { key: 'empresa', label: 'Empresa / Organização', icon: '🏢' },
  ];

  const body = document.getElementById('colMapBody');
  body.innerHTML = '';

  campos.forEach(({ key, label, icon }) => {
    const wrap = document.createElement('div');
    wrap.className = 'field-wrap';
    wrap.innerHTML = `
      <div class="field-label">${icon} ${label}</div>
      <select class="field" id="colmap_${key}">
        <option value="">— Não mapear —</option>
        ${STATE.colunasBruto.map((c, i) =>
          `<option value="${i}" ${STATE.colMap[key] === i ? 'selected' : ''}>${escHtml(c)}</option>`
        ).join('')}
      </select>
    `;
    body.appendChild(wrap);
  });

  document.getElementById('colMapModal').classList.remove('hidden');
}

window.confirmarMapeamentoColunas = function () {
  ['nome', 'cpf', 'data', 'empresa'].forEach(k => {
    const sel = document.getElementById(`colmap_${k}`);
    STATE.colMap[k] = sel.value !== '' ? parseInt(sel.value) : null;
  });

  if (STATE.colMap.nome === null) {
    toast('Erro', 'A coluna "Nome" é obrigatória.', 'error');
    return;
  }

  document.getElementById('colMapModal').classList.add('hidden');
  finalizarImportacao();
};

function finalizarImportacao() {
  STATE.alunosOriginais = STATE.linhasBruto.map(row => ({
    nome:    STATE.colMap.nome    !== null ? String(row[STATE.colMap.nome]    || '').trim() : '',
    cpf:     STATE.colMap.cpf     !== null ? String(row[STATE.colMap.cpf]     || '').trim() : '',
    data:    STATE.colMap.data    !== null ? String(row[STATE.colMap.data]    || '').trim() : '',
    empresa: STATE.colMap.empresa !== null ? String(row[STATE.colMap.empresa] || '').trim() : '',
  })).filter(a => a.nome !== '');

  STATE.alunosFiltrados = [...STATE.alunosOriginais];
  STATE.alunoIndex = 0;

  // UI
  document.getElementById('statTotalAlunos').textContent = STATE.alunosOriginais.length;
  document.getElementById('toolbarStats').classList.remove('hidden');
  document.getElementById('navGroupAlunos').classList.remove('hidden');
  document.getElementById('btnVerTabela').classList.remove('hidden');

  atualizarNavegacao();
  renderizarTabelaAlunos();
  renderizarPreviewAtual();
  verificarProntoParaGerar();

  toast('Importação Concluída', `${STATE.alunosOriginais.length} registos carregados.`, 'success');
}

/* ══════════════════════════════════════════════════════════════════════ */
/* TABELA DE ALUNOS                                                       */
/* ══════════════════════════════════════════════════════════════════════ */
window.toggleTabelaView = function () {
  STATE.tabelaAberta = !STATE.tabelaAberta;
  document.getElementById('tabelaDadosWrap').classList.toggle('hidden', !STATE.tabelaAberta);
};

function renderizarTabelaAlunos() {
  const tbody = document.getElementById('tabelaAlunosBody');
  tbody.innerHTML = '';

  STATE.alunosFiltrados.forEach((a, i) => {
    const idxOriginal = STATE.alunosOriginais.indexOf(a);
    const tr = document.createElement('tr');
    if (idxOriginal === STATE.alunoIndex) tr.classList.add('row-ativo');
    tr.innerHTML = `
      <td onclick="selecionarAlunoTabela(${idxOriginal})">${escHtml(a.nome)}</td>
      <td onclick="selecionarAlunoTabela(${idxOriginal})">${escHtml(a.cpf)}</td>
      <td onclick="selecionarAlunoTabela(${idxOriginal})">${escHtml(a.data)}</td>
      <td onclick="selecionarAlunoTabela(${idxOriginal})">${escHtml(a.empresa)}</td>
      <td><button class="tabela-btn-gen" onclick="gerarCertificadoUnico(${idxOriginal})">Gerar PDF</button></td>
    `;
    tbody.appendChild(tr);
  });
}

window.filtrarTabelaAlunos = function () {
  const q = document.getElementById('tabelaSearchInput').value.toLowerCase();
  STATE.alunosFiltrados = STATE.alunosOriginais.filter(a =>
    a.nome.toLowerCase().includes(q) || a.cpf.toLowerCase().includes(q)
  );
  renderizarTabelaAlunos();
};

window.selecionarAlunoTabela = function (idx) {
  STATE.alunoIndex = idx;
  atualizarNavegacao();
  renderizarPreviewAtual();
  renderizarTabelaAlunos();
};

/* ══════════════════════════════════════════════════════════════════════ */
/* NAVEGAÇÃO DE ALUNOS                                                   */
/* ══════════════════════════════════════════════════════════════════════ */
window.navegarAluno = function (dir) {
  const total = STATE.alunosOriginais.length;
  if (total === 0) return;
  STATE.alunoIndex = Math.max(0, Math.min(total - 1, STATE.alunoIndex + dir));
  atualizarNavegacao();
  renderizarPreviewAtual();
};

function atualizarNavegacao() {
  const total = STATE.alunosOriginais.length;
  document.getElementById('txtNavCount').textContent = total > 0 ? `${STATE.alunoIndex + 1} / ${total}` : '0 / 0';
  document.getElementById('btnNavPrev').disabled = STATE.alunoIndex <= 0;
  document.getElementById('btnNavNext').disabled = STATE.alunoIndex >= total - 1;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* RENDERIZAÇÃO DO CANVAS (PREVIEW)                                       */
/* ══════════════════════════════════════════════════════════════════════ */
async function renderizarPreviewAtual() {
  if (!STATE.pdfFrenteDoc || STATE.alunosOriginais.length === 0) return;
  const aluno = STATE.alunosOriginais[STATE.alunoIndex];
  await renderizarCertificadoNoCanvas(document.getElementById('previewCanvas'), aluno, STATE.pdfFrenteDoc);
  atualizarStudentBar(aluno);
}

async function renderizarCertificadoNoCanvas(canvas, aluno, pdfDoc) {
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });

  canvas.width  = viewport.width;
  canvas.height = viewport.height;

  const ctx = canvas.getContext('2d');
  await page.render({ canvasContext: ctx, viewport }).promise;

  // Escala de referência para posições
  const scaleX = viewport.width  / CERT_W;
  const scaleY = viewport.height / CERT_H;

  desenharTextosNoCanvas(ctx, aluno, scaleX, scaleY, viewport.width);

  // HUD
  document.getElementById('hudDimensao').textContent =
    `PDF: ${Math.round(viewport.width)}×${Math.round(viewport.height)}px`;

  // Mostrar canvas e frame
  canvas.classList.remove('hidden');
  document.getElementById('previewPlaceholder').classList.add('hidden');
  document.getElementById('canvasFrameWrapper').classList.add('loaded');
  aplicarZoom();
}

function desenharTextosNoCanvas(ctx, aluno, scaleX, scaleY, canvasW) {
  const cor = STATE.corTexto;
  const yNome  = STATE.posY.nome  * scaleY;
  const yMeta  = STATE.posY.meta  * scaleY;
  const yAssin = STATE.posY.assin * scaleY;
  const cx = canvasW / 2;

  ctx.textAlign = 'center';
  ctx.fillStyle = cor;

  // Nome
  ctx.font = `bold ${Math.round(32 * scaleX)}px 'Syne', sans-serif`;
  ctx.fillText(aluno.nome, cx, yNome);

  // Meta linha 1: CPF e Data
  ctx.font = `${Math.round(14 * scaleX)}px 'DM Sans', sans-serif`;
  ctx.fillStyle = cor;
  let metaLinha1 = [];
  if (aluno.cpf)  metaLinha1.push(`CPF: ${aluno.cpf}`);
  if (aluno.data) metaLinha1.push(`Conclusão: ${aluno.data}`);
  ctx.fillText(metaLinha1.join('   •   '), cx, yMeta);

  // Meta linha 2: Empresa e Curso
  ctx.font = `${Math.round(13 * scaleX)}px 'DM Sans', sans-serif`;
  let metaLinha2 = [];
  if (aluno.empresa) metaLinha2.push(aluno.empresa);
  metaLinha2.push(`Curso: ${STATE.cursoAtivo}`);
  ctx.fillStyle = cor;
  ctx.globalAlpha = 0.7;
  ctx.fillText(metaLinha2.join('   •   '), cx, yMeta + 22 * scaleY);
  ctx.globalAlpha = 1.0;

  // Assinatura
  if (STATE.assinaturaImg) {
    const sigW = 160 * scaleX;
    const sigH = (STATE.assinaturaImg.height / STATE.assinaturaImg.width) * sigW;
    ctx.drawImage(STATE.assinaturaImg, cx - sigW / 2, yAssin - sigH / 2, sigW, sigH);

    // Nome e cargo da assinatura
    ctx.font = `bold ${Math.round(11 * scaleX)}px 'DM Sans', sans-serif`;
    ctx.fillStyle = cor;
    ctx.globalAlpha = 0.85;
    const nomeSig = document.getElementById('txtAssinNome').textContent;
    const cargoSig = document.getElementById('txtAssinCargo').textContent;
    if (nomeSig && nomeSig !== 'Nome Diretor') {
      ctx.fillText(nomeSig, cx, yAssin + sigH / 2 + 16 * scaleY);
      ctx.font = `${Math.round(10 * scaleX)}px 'DM Sans', sans-serif`;
      ctx.fillText(cargoSig, cx, yAssin + sigH / 2 + 30 * scaleY);
    }
    ctx.globalAlpha = 1.0;
  }
}

function atualizarStudentBar(aluno) {
  document.getElementById('psbNome').textContent = aluno.nome || '—';
  let meta = [];
  if (aluno.cpf)  meta.push(`CPF: ${aluno.cpf}`);
  if (aluno.data) meta.push(`Conclusão: ${aluno.data}`);
  document.getElementById('psbMeta').textContent = meta.join(' • ') || '—';
  document.getElementById('psbCursoBadge').textContent = `CURSO: ${STATE.cursoAtivo}`;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* ZOOM DO CANVAS                                                         */
/* ══════════════════════════════════════════════════════════════════════ */
window.zoomCanvas = function (delta) {
  STATE.zoomFactor = Math.max(0.3, Math.min(3.0, STATE.zoomFactor + delta));
  aplicarZoom();
};

window.resetZoomCanvas = function () {
  STATE.zoomFactor = 1.0;
  aplicarZoom();
};

window.toggleZoomClique = function () {
  const canvas = document.getElementById('previewCanvas');
  if (STATE.zoomFactor > 1.05) {
    STATE.zoomFactor = 1.0;
    canvas.classList.remove('zoomed');
  } else {
    STATE.zoomFactor = 1.8;
    canvas.classList.add('zoomed');
  }
  aplicarZoom();
};

function aplicarZoom() {
  const canvas = document.getElementById('previewCanvas');
  canvas.style.transform = `scale(${STATE.zoomFactor})`;
  canvas.style.transformOrigin = 'center center';
}

/* ══════════════════════════════════════════════════════════════════════ */
/* CONFIGURAÇÕES DE POSIÇÃO E COR                                        */
/* ══════════════════════════════════════════════════════════════════════ */
window.atualizarConfigPosicao = function () {
  STATE.posY.nome  = parseInt(document.getElementById('scaleY_nome').value);
  STATE.posY.meta  = parseInt(document.getElementById('scaleY_meta').value);
  STATE.posY.assin = parseInt(document.getElementById('scaleY_assin').value);
  if (STATE.alunosOriginais.length > 0) renderizarPreviewAtual();
};

window.setCorTexto = function (cor, el) {
  STATE.corTexto = cor;
  document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
  el.classList.add('active');
  if (STATE.alunosOriginais.length > 0) renderizarPreviewAtual();
};

/* ══════════════════════════════════════════════════════════════════════ */
/* GERAÇÃO DE PDF — ÚNICO                                                */
/* ══════════════════════════════════════════════════════════════════════ */
window.gerarCertificadoUnico = async function (idx) {
  if (!STATE.pdfFrenteDoc) { toast('Erro', 'Carregue o template PDF antes.', 'error'); return; }
  const aluno = STATE.alunosOriginais[idx];
  if (!aluno) return;

  try {
    const pdfBytes = await gerarPDFAluno(aluno);
    const nomeArq = `certificado_${sanitizarNomeArquivo(aluno.nome)}_${STATE.cursoAtivo}.pdf`;
    downloadBlob(new Blob([pdfBytes], { type: 'application/pdf' }), nomeArq);
    toast('PDF Gerado', `${aluno.nome}`, 'success');
    await registrarAuditoria(aluno);
  } catch (e) {
    toast('Erro', `Falha ao gerar PDF: ${e.message}`, 'error');
    console.error(e);
  }
};

/* ══════════════════════════════════════════════════════════════════════ */
/* GERAÇÃO EM LOTE — ZIP                                                  */
/* ══════════════════════════════════════════════════════════════════════ */
window.gerarTodosCertificados = async function () {
  if (STATE.gerando) return;
  if (!STATE.pdfFrenteDoc) { toast('Erro', 'Carregue o template PDF.', 'error'); return; }
  if (STATE.alunosOriginais.length === 0) { toast('Erro', 'Nenhum aluno importado.', 'error'); return; }

  STATE.gerando = true;
  document.getElementById('btnGerarLote').disabled = true;

  const zip = new JSZip();
  const total = STATE.alunosOriginais.length;

  atualizarProgresso(0, total, 'Iniciando geração em lote...');

  for (let i = 0; i < total; i++) {
    const aluno = STATE.alunosOriginais[i];

    try {
      const pdfBytes = await gerarPDFAluno(aluno);
      const nomeArq = `${sanitizarNomeArquivo(aluno.nome)}_${STATE.cursoAtivo}.pdf`;
      zip.file(nomeArq, pdfBytes);
      await registrarAuditoria(aluno);
    } catch (e) {
      console.warn(`Erro ao gerar para ${aluno.nome}:`, e);
    }

    atualizarProgresso(i + 1, total, `Processando: ${aluno.nome}`);

    // Yield para não bloquear UI
    if (i % 5 === 0) await sleep(0);
  }

  atualizarProgresso(total, total, 'Compactando ZIP...');
  await sleep(50);

  try {
    const blob = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } });
    downloadBlob(blob, `certificados_${STATE.cursoAtivo}_${Date.now()}.zip`);
    toast('Lote Concluído', `${total} certificados gerados e compactados!`, 'success');
  } catch (e) {
    toast('Erro', 'Falha ao gerar ZIP.', 'error');
  }

  STATE.gerando = false;
  document.getElementById('btnGerarLote').disabled = false;
};

/* ── Gerar PDF de um aluno ─────────────────────────────────────────── */
async function gerarPDFAluno(aluno) {
  const { jsPDF } = window.jspdf;

  // Render frente numa canvas offscreen
  const canvas = document.createElement('canvas');
  await renderizarCertificadoNoCanvas(canvas, aluno, STATE.pdfFrenteDoc);

  const pdf = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
  const imgData = canvas.toDataURL('image/jpeg', 0.95);
  pdf.addImage(imgData, 'JPEG', 0, 0, 297, 210);

  // Verso (se existir)
  if (STATE.pdfVersoDoc) {
    const canvasVerso = document.createElement('canvas');
    await renderizarPaginaPura(canvasVerso, STATE.pdfVersoDoc);
    pdf.addPage();
    pdf.addImage(canvasVerso.toDataURL('image/jpeg', 0.92), 'JPEG', 0, 0, 297, 210);
  }

  return pdf.output('arraybuffer');
}

async function renderizarPaginaPura(canvas, pdfDoc) {
  const page = await pdfDoc.getPage(1);
  const viewport = page.getViewport({ scale: 1.5 });
  canvas.width  = viewport.width;
  canvas.height = viewport.height;
  await page.render({ canvasContext: canvas.getContext('2d'), viewport }).promise;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* AUDITORIA (FIRESTORE)                                                  */
/* ══════════════════════════════════════════════════════════════════════ */
async function registrarAuditoria(aluno) {
  if (!document.getElementById('chkAuditoria').checked) return;
  if (!window.__FB) return;

  try {
    const { db, collection, addDoc, serverTimestamp } = window.__FB;
    await addDoc(collection(db, 'auditoria'), {
      nome:      aluno.nome,
      cpf:       aluno.cpf,
      curso:     STATE.cursoAtivo,
      operador:  STATE.usuarioAtual?.displayName || STATE.usuarioAtual?.email || 'desconhecido',
      timestamp: serverTimestamp(),
    });
  } catch (_) {
    // Auditoria não deve bloquear o processo
  }
}

/* ══════════════════════════════════════════════════════════════════════ */
/* PROGRESSO                                                              */
/* ══════════════════════════════════════════════════════════════════════ */
function atualizarProgresso(atual, total, label) {
  const pct = total > 0 ? Math.round((atual / total) * 100) : 0;
  document.getElementById('barProgressoFill').style.width = `${pct}%`;
  document.getElementById('txtProgressoPct').textContent = `${pct}%`;
  document.getElementById('txtProgressoLabel').textContent = label;
  document.getElementById('txtProgressoSub').textContent =
    total > 0 ? `${atual} de ${total} certificados processados.` : 'Aguardando início.';
}

function verificarProntoParaGerar() {
  const pronto = !!STATE.pdfFrenteDoc && STATE.alunosOriginais.length > 0;
  document.getElementById('btnGerarLote').disabled = !pronto;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* TOAST NOTIFICATIONS                                                    */
/* ══════════════════════════════════════════════════════════════════════ */
window.toast = function (titulo, msg, tipo = 'success') {
  const container = document.getElementById('toastContainer');
  const el = document.createElement('div');
  el.className = `toast toast-${tipo}`;
  el.innerHTML = `
    <div>
      <div class="toast-title">${escHtml(titulo)}</div>
      <div>${escHtml(msg)}</div>
    </div>
  `;
  container.appendChild(el);
  setTimeout(() => {
    el.style.transition = 'opacity 0.4s, transform 0.4s';
    el.style.opacity = '0';
    el.style.transform = 'translateX(40px)';
    setTimeout(() => el.remove(), 420);
  }, 3800);
};

/* ══════════════════════════════════════════════════════════════════════ */
/* RESET DE ESTADO                                                        */
/* ══════════════════════════════════════════════════════════════════════ */
function resetEstadoCompleto() {
  STATE.pdfFrenteDoc = null;
  STATE.pdfVersoDoc = null;
  STATE.assinaturaImg = null;
  STATE.alunosOriginais = [];
  STATE.alunosFiltrados = [];
  STATE.alunoIndex = 0;
  STATE.colMap = {};
  STATE.colunasBruto = [];
  STATE.linhasBruto = [];
  STATE.gerando = false;
  STATE.adminAberto = false;
  STATE.tabelaAberta = false;
  STATE.zoomFactor = 1.0;

  // UI Reset
  ['pdfFrenteDotStatus','pdfVersoDotStatus','sigDotStatus'].forEach(id =>
    document.getElementById(id)?.classList.remove('loaded'));
  ['toolbarStats','navGroupAlunos','btnVerTabela'].forEach(id =>
    document.getElementById(id)?.classList.add('hidden'));
  document.getElementById('btnToggleAdmin')?.classList.add('hidden');
  document.getElementById('adminPanel')?.classList.add('hidden');
  document.getElementById('previewCanvas')?.classList.add('hidden');
  document.getElementById('previewPlaceholder')?.classList.remove('hidden');
  document.getElementById('canvasFrameWrapper')?.classList.remove('loaded');
  document.getElementById('tabelaDadosWrap')?.classList.add('hidden');
  document.getElementById('btnGerarLote').disabled = true;
  atualizarProgresso(0, 0, 'Aguardando início do processo');
}

/* ══════════════════════════════════════════════════════════════════════ */
/* UTILITÁRIOS                                                            */
/* ══════════════════════════════════════════════════════════════════════ */
function escHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function sanitizarNomeArquivo(nome) {
  return nome.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-zA-Z0-9_\-]/g, '_').substring(0, 60);
}

function formatarBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function downloadBlob(blob, nome) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = nome; a.click();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function traduzirErroFirebase(code) {
  const msgs = {
    'auth/user-not-found':      'Utilizador não encontrado.',
    'auth/wrong-password':      'Senha incorrecta.',
    'auth/invalid-email':       'E-mail inválido.',
    'auth/too-many-requests':   'Demasiadas tentativas. Aguarde e tente novamente.',
    'auth/network-request-failed': 'Falha de rede. Verifique a ligação.',
    'auth/invalid-credential':  'Credenciais inválidas.',
  };
  return msgs[code] || `Erro Firebase: ${code}`;
}

/* ══════════════════════════════════════════════════════════════════════ */
/* TECLAS DE ATALHO                                                       */
/* ══════════════════════════════════════════════════════════════════════ */
document.addEventListener('keydown', (e) => {
  if (document.getElementById('mainInterface').classList.contains('hidden')) {
    // Na tela de login: Enter para submeter
    if (e.key === 'Enter') executarLogin();
    return;
  }

  // Navegação com setas
  if (e.key === 'ArrowLeft')  navegarAluno(-1);
  if (e.key === 'ArrowRight') navegarAluno(1);

  // Zoom com + e -
  if (e.key === '+' || e.key === '=') zoomCanvas(0.1);
  if (e.key === '-') zoomCanvas(-0.1);
  if (e.key === '0') resetZoomCanvas();
});
