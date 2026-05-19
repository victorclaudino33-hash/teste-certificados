/* ══════════════════════════════════════════════════
   ABILITY PRO v3.0 — app.js
   ══════════════════════════════════════════════════ */

/* ── Setup libs ── */
pdfjsLib.GlobalWorkerOptions.workerSrc =
  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.4.120/pdf.worker.min.js';
const { jsPDF } = window.jspdf;

/* ══════════════════════════════════════════════════
   ESTADO GLOBAL
   ══════════════════════════════════════════════════ */

let imgFrente   = null;   // dataURL da frente
let imgVerso    = null;   // dataURL do verso
let dadosExcel  = [];
let alunoAtual  = 0;
let slotAtivo   = 'NR10';
let gerando     = false;
let corTexto    = '#000000';
let modoFirebase = false;   // true quando logado via Firebase
let tabelaVisivel = false;
let dadosFiltrados = [];

const CURSOS = ['NR10', 'NR10 SEP', 'NR06', 'NR20', 'NR35', 'SGA', 'DIRECAO', 'OUTROS'];

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
    // Serial do Excel para data
    const d = new Date(Math.round((v - 25569) * 86400 * 1000));
    return d.toLocaleDateString('pt-BR');
  }
  // Tenta converter string "YYYY-MM-DD" ou "DD/MM/YYYY"
  const s = String(v).trim();
  if (/^\d{4}-\d{2}-\d{2}/.test(s)) {
    const [ano, mes, dia] = s.split('-');
    return `${dia}/${mes}/${ano}`;
  }
  return s;
}

/**
 * Busca coluna na linha do Excel de forma flexível.
 * Aceita variações de maiúsculas, acentos e espaços.
 */
function buscarColuna(aluno, ...termos) {
  const chaves = Object.keys(aluno);
  for (const termo of termos) {
    const t = termo.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
    const found = chaves.find(c =>
      c.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').includes(t)
    );
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
    cor: corTexto,
  };
}

function hexParaRGB(hex) {
  const r = parseInt(hex.slice(1, 3), 16);
  const g = parseInt(hex.slice(3, 5), 16);
  const b = parseInt(hex.slice(5, 7), 16);
  return { r, g, b };
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

    // Buscar perfil no Firestore
    let role = 'user';
    try {
      const snap = await fb.getDoc(fb.doc(fb.db, 'users', user.uid));
      if (snap.exists()) role = snap.data().role || 'user';
    } catch(_) {}

    modoFirebase = true;
    entrarNaPainel(email.split('@')[0], role === 'admin');
    document.getElementById('syncBadge').classList.remove('hidden');

    // Carregar slots do Firebase
    await carregarSlotsFirebase(user.uid);

  } catch (err) {
    toast('Falha no login: ' + (err.message || 'Erro desconhecido'), 'error');
  }
}

/* ══════════════════════════════════════════════════
   ENTRAR NA PAINEL (comum para ambos os modos)
   ══════════════════════════════════════════════════ */

function entrarNaPainel(nomeUsuario, isAdmin) {
  document.getElementById('loginSection').style.display = 'none';
  const main = document.getElementById('mainInterface');
  main.classList.remove('hidden');
  document.getElementById('userBadge').textContent = `OP: ${nomeUsuario.toUpperCase()}`;

  if (isAdmin) {
    document.getElementById('adminBtn').classList.remove('hidden');
    renderizarEquipe();
  }

  inicializarSlots();
  inicializarExcelInput();
}

function fazerLogout() {
  const fb = window.__FB;
  if (fb && modoFirebase) {
    fb.signOut(fb.auth).catch(() => {});
  }
  location.reload();
}

/* ══════════════════════════════════════════════════
   FIREBASE — Sincronização de Slots
   ══════════════════════════════════════════════════ */

async function carregarSlotsFirebase(uid) {
  const fb = window.__FB;
  if (!fb || !uid) return;
  try {
    const snap = await fb.getDoc(fb.doc(fb.db, 'slots', uid));
    if (snap.exists()) {
      const data = snap.data();
      // Salva cada slot no localStorage para uso offline
      for (const [key, val] of Object.entries(data)) {
        localStorage.setItem('ability_v9_slot_' + key, JSON.stringify(val));
      }
      toast('Configurações sincronizadas do Firebase ☁', 'success', 2500);
    }
  } catch (e) {
    console.warn('Erro ao carregar slots do Firebase:', e);
  }
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
    // Não salvar base64 no Firestore (muito grande) — salva só configurações
    const { frente, verso, ...cfg } = dados;
    atual[slotNome] = cfg;
    await fb.setDoc(docRef, atual);
  } catch (e) {
    console.warn('Erro ao salvar slot no Firebase:', e);
  }
}

/* ══════════════════════════════════════════════════
   ADMIN
   ══════════════════════════════════════════════════ */

function toggleAdmin() {
  const p = document.getElementById('adminPanel');
  p.classList.toggle('hidden');
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
    if (salvo.cor) {
      corTexto = salvo.cor;
      document.getElementById('corPersonalizada').value = corTexto;
    }
    imgFrente = salvo.frente || null;
    imgVerso  = salvo.verso  || null;
  } else {
    imgFrente = null;
    imgVerso  = null;
    corTexto  = '#000000';
  }

  atualizarLabels();
  atualizarStatusPDF();
  updatePreview();
  atualizarStats();
}

function salvarSlot() {
  const dados = {
    ...getConfig(),
    frente: imgFrente,
    verso:  imgVerso,
  };
  try {
    localStorage.setItem('ability_v9_slot_' + slotAtivo, JSON.stringify(dados));
  } catch (e) {
    console.warn('localStorage cheio:', e.message);
  }
  // Sincronizar com Firebase (sem os base64 de imagem)
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
   SLIDERS — labels
   ══════════════════════════════════════════════════ */

function atualizarLabels() {
  const ids = ['nome', 'cpf', 'data'];
  ids.forEach(id => {
    const y = document.getElementById('range_y_' + id).value;
    const s = document.getElementById('range_s_' + id).value;
    const cy = document.getElementById('chip_y_' + id);
    const cs = document.getElementById('chip_s_' + id);
    if (cy) cy.textContent = y + 'mm';
    if (cs) cs.textContent = s + 'pt';
  });
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
   PDF PROCESSING — Converte PDF em imagem PNG (dataURL)
   ══════════════════════════════════════════════════ */

async function processarPDF(input, tipo) {
  const file = input.files[0];
  if (!file) return;

  const lbl = tipo === 'frente'
    ? document.getElementById('labelFrente')
    : document.getElementById('labelVerso');
  lbl.textContent = 'Processando...';

  try {
    const buffer = await file.arrayBuffer();

    // PDF.js precisa de um Uint8Array ou cópia do buffer
    const uint8 = new Uint8Array(buffer);
    const loadTask = pdfjsLib.getDocument({ data: uint8 });
    const pdf  = await loadTask.promise;
    const page = await pdf.getPage(1);

    // Escala alta para boa resolução no certificado
    const vp  = page.getViewport({ scale: 3.0 });
    const tmp = document.createElement('canvas');
    tmp.width  = vp.width;
    tmp.height = vp.height;
    const ctx  = tmp.getContext('2d');

    await page.render({ canvasContext: ctx, viewport: vp }).promise;

    const dataUrl = tmp.toDataURL('image/jpeg', 0.92); // JPEG menor que PNG
    if (tipo === 'frente') imgFrente = dataUrl;
    else imgVerso = dataUrl;

    lbl.textContent = file.name;
    salvarSlot();
    atualizarStatusPDF();
    updatePreview();
    toast(`PDF de ${tipo} carregado com sucesso! ✓`);
  } catch (e) {
    lbl.textContent = 'Erro ao carregar';
    toast('Erro ao processar o PDF: ' + (e.message || e), 'error');
    console.error(e);
  }

  input.value = '';
}

/* ══════════════════════════════════════════════════
   EXCEL — Leitura robusta
   ══════════════════════════════════════════════════ */

function inicializarExcelInput() {
  document.getElementById('excelInput').onchange = (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const wb = XLSX.read(new Uint8Array(ev.target.result), {
          type: 'array',
          cellDates: true,
          dateNF: 'dd/mm/yyyy',
        });

        const sheet = wb.Sheets[wb.SheetNames[0]];

        // sheet_to_json com defval vazio para não perder linhas
        const dados = XLSX.utils.sheet_to_json(sheet, {
          defval: '',
          raw: false,        // converte datas automaticamente para string
        });

        if (dados.length === 0) {
          toast('Planilha vazia ou sem dados reconhecíveis.', 'error');
          return;
        }

        // Diagnóstico: mostra as colunas encontradas
        const colunas = Object.keys(dados[0]);
        console.log('[Ability] Colunas detectadas:', colunas);

        // Verifica se há coluna de nome
        const nomeEncontrado = buscarColuna(dados[0], 'nome', 'name', 'aluno', 'participante', 'funcionario');
        if (!nomeEncontrado) {
          toast(`⚠ Coluna "Nome" não encontrada. Colunas detectadas: ${colunas.slice(0,5).join(', ')}`, 'error', 6000);
          console.warn('[Ability] Colunas disponíveis:', colunas);
        }

        dadosExcel    = dados;
        dadosFiltrados = dados;
        alunoAtual    = 0;
        atualizarStats();
        atualizarNavegacao();
        updatePreview();
        renderizarTabela();
        toast(`✓ ${dados.length} aluno(s) carregados. Colunas: ${colunas.slice(0,4).join(', ')}...`);

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
  const wrap = document.getElementById('tabelaWrap');
  wrap.classList.toggle('hidden', !tabelaVisivel);
  if (tabelaVisivel) renderizarTabela();
}

function filtrarTabela() {
  const termo = document.getElementById('buscaAluno').value.toLowerCase();
  dadosFiltrados = dadosExcel.filter(a => {
    const nome = buscarColuna(a, 'nome', 'name', 'aluno');
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

  const colunas = Object.keys(dadosFiltrados[0]);
  const colsVisiveis = colunas.slice(0, 5); // máx 5 colunas

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

  document.getElementById('tabelaTitle').textContent =
    `${dadosFiltrados.length} aluno(s) carregados`;
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
  img.onload = () => {
    // A4 landscape em pixels a 300dpi equiv
    canvas.width  = 2970;
    canvas.height = 2100;

    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);

    const cfg   = getConfig();
    const aluno = dadosExcel[alunoAtual] || {};
    const ratio = 10; // mm → px  (2970px / 297mm = 10)

    const nome    = buscarColuna(aluno, 'nome', 'name', 'aluno', 'participante') || 'NOME DO ALUNO';
    const cpf     = buscarColuna(aluno, 'cpf', 'documento', 'doc')              || '000.000.000-00';
    const dataRaw = aluno[slotAtivo]
      || buscarColuna(aluno, 'data', 'conclusao', 'término', 'termino', 'date')
      || '';

    ctx.fillStyle = cfg.cor;
    ctx.textAlign = 'center';

    // Sombra suave para legibilidade
    ctx.shadowColor   = 'rgba(0,0,0,0.15)';
    ctx.shadowBlur    = 4;

    ctx.font = `bold ${cfg.sn * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(nome.toUpperCase(), canvas.width / 2, cfg.yn * ratio);

    ctx.font = `${cfg.sc * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(`CPF: ${cpf}`, canvas.width / 2, cfg.yc * ratio);

    ctx.font = `${cfg.sd * 3.5}px 'Plus Jakarta Sans', sans-serif`;
    ctx.fillText(`Data: ${formatarData(dataRaw)}`, canvas.width / 2, cfg.yd * ratio);

    ctx.shadowBlur = 0;
  };
  img.src = imgFrente;
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

  // FRENTE
  doc.addImage(imgFrente, 'JPEG', 0, 0, 297, 210);
  aplicarTextoNoPDF(doc, p, cfg);

  // VERSO
  doc.addPage();
  doc.addImage(imgVerso, 'JPEG', 0, 0, 297, 210);

  const nome = buscarColuna(p, 'nome', 'name', 'aluno') || 'aluno';
  doc.save(`Ability_${slotAtivo}_${nome.replace(/\s+/g, '_')}.pdf`);
  toast(`Certificado de "${nome}" exportado!`);
}

/* ══════════════════════════════════════════════════
   GERAÇÃO EM LOTE
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

  try {
    const doc   = new jsPDF({ orientation: 'landscape', unit: 'mm', format: 'a4' });
    const cfg   = getConfig();
    const total = dadosExcel.length;

    for (let i = 0; i < total; i++) {
      const p = dadosExcel[i];
      if (i > 0) doc.addPage();

      // FRENTE
      doc.addImage(imgFrente, 'JPEG', 0, 0, 297, 210);
      aplicarTextoNoPDF(doc, p, cfg);

      // VERSO
      doc.addPage();
      doc.addImage(imgVerso, 'JPEG', 0, 0, 297, 210);

      const pct = Math.round(((i + 1) / total) * 100);
      setProgresso(pct, `Gerando aluno ${i + 1} de ${total}...`);

      // Yield a cada 3 para não travar UI
      if (i % 3 === 0) await new Promise(r => setTimeout(r, 0));
    }

    doc.save(`Ability_${slotAtivo}_Lote_${total}alunos.pdf`);
    setProgresso(100, `${total} certificado(s) gerado(s) com sucesso. ✓`);
    toast(`Lote de ${total} certificado(s) exportado com sucesso!`);

  } catch (err) {
    toast('Erro durante a geração: ' + err.message, 'error');
    console.error(err);
    setProgresso(0, 'Erro na geração.');
  }

  gerando = false;
  btn.disabled = false;
}

/* ── Aplica texto no jsPDF ── */
function aplicarTextoNoPDF(doc, aluno, cfg) {
  const rgb = hexParaRGB(cfg.cor);
  doc.setTextColor(rgb.r, rgb.g, rgb.b);

  const nome    = buscarColuna(aluno, 'nome', 'name', 'aluno', 'participante') || '';
  const cpf     = buscarColuna(aluno, 'cpf', 'documento', 'doc')              || '';
  const dataRaw = aluno[slotAtivo]
    || buscarColuna(aluno, 'data', 'conclusao', 'término', 'termino', 'date')
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

  // Aguarda Firebase inicializar (módulo ES)
  const checkFB = setInterval(() => {
    if (window.__FB) {
      clearInterval(checkFB);
      // Verifica se já há sessão Firebase ativa
      window.__FB.onAuthStateChanged(window.__FB.auth, async (user) => {
        if (user && !document.getElementById('mainInterface').classList.contains('hidden')) {
          // já logado — atualiza sync badge
          document.getElementById('syncBadge')?.classList.remove('hidden');
        }
      });
    }
  }, 200);
});