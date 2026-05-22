* ══════════════════════════════════════════════════════════════════════ */
/* ABILITY PRO - CERTIFICATION SUITE v4.0                                 */
/* Core Application Script (app.js)                                       */
/* ══════════════════════════════════════════════════════════════════════ */
// 1. ADICIONE ISSO NO TOPO DO SEU SCRIPT.JS
import { initializeApp } from "firebase/app";
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, onAuthStateChanged, signOut } from "firebase/auth";
import { getFirestore, doc, setDoc, getDoc } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyBzUJOntKwQIqYONKYK_yZGDOn3LHMx9Rg",
  authDomain: "certificados-211e8.firebaseapp.com",
  projectId: "certificados-211e8",
  storageBucket: "certificados-211e8.firebasestorage.app",
  messagingSenderId: "778706007723",
  appId: "1:778706007723:web:dd3ddf6e8b2351d49e29ee"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// ... (Cole aqui o restante da lógica de login, abas e toasts que passei na resposta anterior) ...


// ==========================================================================
// 2. O SEU CÓDIGO ANTIGO COMEÇA AQUI EMBAIXO
// ==========================================================================
// Toda a lógica que você já tinha para gerar certificados, mexer no canvas, etc.
// vai continuar funcionando perfeitamente logo abaixo do bloco do Firebase.
document.addEventListener('DOMContentLoaded', () => {
    // ── STORES & ESTADO DA APLICAÇÃO ──
    const state = {
        currentUser: null,
        isAdmin: false,
        activeCourse: 'ALL',
        loadedStudents: [],
        currentIndex: -1,
        zoomLevel: 100,
        isZoomed: false,
        certificateTemplate: null,
        config: {
            textColor: '#f0f4ff',
            fontSizeMultiplier: 1.0,
            showSignature: true
        }
    };

    // Usuários padrão do sistema (Mock inicial)
    const DEFAULT_USERS = [
        { name: 'admin', pass: 'admin123', role: 'admin' },
        { name: 'user', pass: 'user123', role: 'user' }
    ];

    // Inicialização do LocalStorage para credenciais da equipe
    if (!localStorage.getItem('ability_users')) {
        localStorage.setItem('ability_users', JSON.stringify(DEFAULT_USERS));
    }

    // Alunos Mockados para popular a tabela dinamicamente caso um arquivo não seja carregado de imediato
    const MOCK_STUDENTS = [
        { id: '001', name: 'ANA SILVA', course: 'DEV', date: '22/05/2026', status: 'Aprovado' },
        { id: '002', name: 'BRUNO GOMES', course: 'DESIGN', date: '20/05/2026', status: 'Aprovado' },
        { id: '003', name: 'CARLOS SOUZA', course: 'DATA', date: '18/05/2026', status: 'Aprovado' },
        { id: '004', name: 'DANIELA LIMA', course: 'CYBER', date: '15/05/2026', status: 'Aprovado' }
    ];

    // ── MAPEAMENTO DE ELEMENTOS DOM ──
    const DOM = {
        // Telas principais
        loginSection: document.getElementById('loginSection'),
        mainInterface: document.getElementById('mainInterface'),
        
        // Formulário de Login
        loginForm: document.querySelector('.login-form-panel form') || document.getElementById('loginForm'),
        userInput: document.querySelector('input[placeholder="Nome de usuário..."]') || document.getElementById('username'),
        passInput: document.querySelector('input[placeholder="Senha secreta..."]') || document.getElementById('password'),
        loginBtn: document.querySelector('.login-btn'),
        tabs: document.querySelectorAll('.ltab'),
        
        // Topbar
        userBadge: document.getElementById('userBadge') || document.querySelector('.badge-neutral'),
        adminToggleBadge: document.getElementById('adminToggleBadge') || document.querySelector('.badge-blue'),
        btnExit: document.querySelector('.btn-exit'),
        
        // Painel Admin
        adminPanel: document.getElementById('adminPanel') || document.querySelector('.admin-panel'),
        adminForm: document.querySelector('.admin-form'),
        newUserName: document.querySelector('.admin-input[placeholder="Usuário"]'),
        newUserPass: document.querySelector('.admin-input[placeholder="Senha"]'),
        teamGrid: document.querySelector('.team-grid'),
        
        // Sidebar Filtros e Uploads
        courseBtns: document.querySelectorAll('.cbtn'),
        fileInput: document.getElementById('csvUpload') || document.querySelector('input[type="file"]'),
        pdfItems: document.querySelectorAll('.pdf-item'),
        colorSwatches: document.querySelectorAll('.color-swatch'),
        fontSizeSlider: document.querySelector('input[type="range"]'),
        signatureSwitch: document.querySelector('.switch input'),
        
        // Toolbar de Controle
        statNum: document.querySelector('.stat-num'),
        statStatus: document.querySelector('.stat-status'),
        btnPrev: document.querySelectorAll('.nav-btn')[0],
        btnNext: document.querySelectorAll('.nav-btn')[1],
        navCount: document.querySelector('.nav-count'),
        btnToggleTable: document.querySelector('.tb-neutral'),
        btnExportPDF: document.querySelector('.tb-blue'),
        btnExportAll: document.querySelector('.tb-green'),
        
        // Tabela de Dados (Gaveta Dropdown)
        tabelaWrap: document.getElementById('tabelaWrap') || document.querySelector('.tabela-wrap'),
        tabelaSearch: document.querySelector('.tabela-search'),
        tabelaClose: document.querySelector('.tabela-close'),
        tabelaBody: document.querySelector('.tabela tbody'),
        
        // Preview Area / Canvas
        previewArea: document.querySelector('.preview-area'),
        certFrame: document.querySelector('.cert-frame-wrapper'),
        canvas: document.getElementById('previewCanvas'),
        placeholder: document.querySelector('.placeholder'),
        
        // HUD & PSB Info Elements
        hudResolution: document.querySelector('.preview-hud-badge'),
        btnZoomIn: document.querySelectorAll('.preview-zoom-btn')[0],
        btnZoomOut: document.querySelectorAll('.preview-zoom-btn')[1],
        psbName: document.querySelector('.psb-name'),
        psbDetails: document.querySelector('.psb-details'),
        psbCurso: document.querySelector('.psb-curso'),
        
        // Progress e Ação Inferior
        progPct: document.querySelector('.prog-pct'),
        progFill: document.querySelector('.prog-fill'),
        progSub: document.querySelector('.prog-sub'),
        btnGenerateSingle: document.querySelector('.gen-btn')
    };

    const ctx = DOM.canvas ? DOM.canvas.getContext('2d') : null;

    // ── INTERFACES & NAVEGAÇÃO DE TELAS ──
    function initApp() {
        // Forçar injeção de IDs caso o HTML não possua mapeado nativamente
        setupFallbacksEIdentificadores();
        
        // Carrega estado de Alunos Padrão
        state.loadedStudents = [...MOCK_STUDENTS];
        updateGlobalStats();
        renderTableRows();

        // Esconder painel admin por padrão
        if (DOM.adminPanel) DOM.adminPanel.classList.add('hidden');
        if (DOM.tabelaWrap) DOM.tabelaWrap.classList.add('hidden');

        // Criação de Template de Certificado base em memória
        createBaseTemplate();
        setupEventListeners();
    }

    function setupFallbacksEIdentificadores() {
        // Garante que elementos estruturais críticos possuam gatilhos operacionais corretos
        if (DOM.loginForm) {
            DOM.loginForm.addEventListener('submit', (e) => e.preventDefault());
        }
    }

    // ── SESSÃO & AUTENTICAÇÃO ──
    function handleLogin() {
        const username = DOM.userInput.value.trim();
        const password = DOM.passInput.value.trim();

        if (!username || !password) {
            alert('Por favor, preencha todos os campos.');
            return;
        }

        const users = JSON.parse(localStorage.getItem('ability_users'));
        const userFound = users.find(u => u.name === username && u.pass === password);

        if (userFound) {
            state.currentUser = userFound.name;
            state.isAdmin = userFound.role === 'admin';

            // Transição visual fluida de telas
            DOM.loginSection.classList.add('hidden');
            DOM.mainInterface.classList.remove('hidden');

            // Atualização do HUD de controle de perfil
            if (DOM.userBadge) DOM.userBadge.textContent = state.currentUser;
            
            if (state.isAdmin) {
                if (DOM.adminToggleBadge) DOM.adminToggleBadge.classList.remove('hidden');
                renderTeamGrid();
            } else {
                if (DOM.adminToggleBadge) DOM.adminToggleBadge.classList.add('hidden');
            }
            
            // Renderiza o primeiro aluno disponível no preview
            if (state.loadedStudents.length > 0) {
                selectStudent(0);
            }
        } else {
            alert('Credenciais inválidas. Use os acessos indicados no rodapé.');
        }
    }

    function handleLogout() {
        state.currentUser = null;
        state.isAdmin = false;
        DOM.userInput.value = '';
        DOM.passInput.value = '';
        DOM.mainInterface.classList.add('hidden');
        DOM.loginSection.classList.remove('hidden');
    }

    // ── CONTROLE DO PAINEL ADMINISTRATIVO (GERENCIAMENTO DA EQUIPE) ──
    function toggleAdminPanel() {
        if (!state.isAdmin) return;
        DOM.adminPanel.classList.toggle('hidden');
    }

    function renderTeamGrid() {
        if (!DOM.teamGrid) return;
        const users = JSON.parse(localStorage.getItem('ability_users'));
        DOM.teamGrid.innerHTML = '';

        users.forEach(user => {
            const card = document.createElement('div');
            card.className = 'team-card';
            card.innerHTML = `
                <div class="team-card-name">${user.name} [${user.role}]</div>
                <div class="team-card-pass">Pass: ${user.pass}</div>
                ${user.name !== 'admin' ? `<button class="team-card-remove" data-name="${user.name}">Excluir</button>` : ''}
            `;
            DOM.teamGrid.appendChild(card);
        });

        // Eventos para remoção de membros
        DOM.teamGrid.querySelectorAll('.team-card-remove').forEach(btn => {
            btn.addEventListener('click', (e) => {
                const nameToRemove = e.target.getAttribute('data-name');
                let users = JSON.parse(localStorage.getItem('ability_users'));
                users = users.filter(u => u.name !== nameToRemove);
                localStorage.setItem('ability_users', JSON.stringify(users));
                renderTeamGrid();
            });
        });
    }

    function addNewUser(e) {
        if(e) e.preventDefault();
        const name = DOM.newUserName.value.trim();
        const pass = DOM.newUserPass.value.trim();

        if (!name || !pass) {
            alert('Preencha os dados do novo membro da equipe.');
            return;
        }

        let users = JSON.parse(localStorage.getItem('ability_users'));
        if (users.some(u => u.name === name)) {
            alert('Este usuário já existe.');
            return;
        }

        users.push({ name, pass, role: 'user' });
        localStorage.setItem('ability_users', JSON.stringify(users));
        
        DOM.newUserName.value = '';
        DOM.newUserPass.value = '';
        renderTeamGrid();
    }

    // ── PROCESSAMENTO DE ARQUIVOS (CSV DATA DISPATCHER) ──
    function triggerFileInput() {
        DOM.fileInput.click();
    }

    function handleFileUpload(e) {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = function(evt) {
            const text = evt.target.result;
            parseCSVData(text, file.name);
        };
        reader.readAsText(file, 'UTF-8');
    }

    function parseCSVData(text, filename) {
        try {
            const lines = text.split('\n');
            const result = [];
            
            // Loop pulando o cabeçalho simples do arquivo CSV
            for (let i = 1; i < lines.length; i++) {
                if (!lines[i].trim()) continue;
                const columns = lines[i].split(',');
                
                if (columns.length >= 3) {
                    result.push({
                        id: String(i).padStart(3, '0'),
                        name: columns[0].replace(/"/g, '').trim().toUpperCase(),
                        course: columns[1].replace(/"/g, '').trim().toUpperCase(),
                        date: columns[2].replace(/"/g, '').trim() || '22/05/2026',
                        status: columns[3] ? columns[3].replace(/"/g, '').trim() : 'Aprovado'
                    });
                }
            }

            if (result.length > 0) {
                state.loadedStudents = result;
                
                // Atualizar indicador visual de arquivo carregado (dot green)
                DOM.pdfItems.forEach(item => {
                    const dot = item.querySelector('.pdf-dot');
                    if (dot) dot.classList.add('loaded');
                    const sub = item.querySelector('.pdf-sub');
                    if (sub) sub.textContent = filename;
                });

                updateGlobalStats();
                state.activeCourse = 'ALL';
                resetCourseTabsActive();
                renderTableRows();
                selectStudent(0);
            } else {
                alert('Nenhum dado válido encontrado no arquivo CSV.');
            }
        } catch (err) {
            alert('Erro ao processar o arquivo de dados. Certifique-se que o layout segue o padrão: Nome, Curso, Data.');
        }
    }

    // ── FILTRAGEM, TABELA DE DADOS & NAVEGAÇÃO ──
    function handleCourseFilter(e) {
        const target = e.currentTarget;
        state.activeCourse = target.getAttribute('data-course') || 'ALL';
        
        resetCourseTabsActive();
        target.classList.add('active');
        
        renderTableRows();
        
        // Seleciona automaticamente o primeiro registro do novo filtro
        const filtered = getFilteredStudents();
        if (filtered.length > 0) {
            const realIndex = state.loadedStudents.findIndex(s => s.id === filtered[0].id);
            selectStudent(realIndex);
        } else {
            clearPreview();
        }
    }

    function resetCourseTabsActive() {
        DOM.courseBtns.forEach(btn => btn.classList.remove('active'));
        if (state.activeCourse === 'ALL') DOM.courseBtns[0].classList.add('active');
    }

    function getFilteredStudents() {
        if (state.activeCourse === 'ALL') {
            return state.loadedStudents;
        }
        return state.loadedStudents.filter(s => s.course === state.activeCourse);
    }

    function renderTableRows() {
        if (!DOM.tabelaBody) return;
        DOM.tabelaBody.innerHTML = '';
        
        const filtered = getFilteredStudents();
        const searchWord = DOM.tabelaSearch.value.toLowerCase();

        filtered.forEach(student => {
            if (searchWord && !student.name.toLowerCase().includes(searchWord) && !student.id.includes(searchWord)) {
                return;
            }

            const tr = document.createElement('tr');
            if (state.currentIndex !== -1 && state.loadedStudents[state.currentIndex]?.id === student.id) {
                tr.className = 'row-ativo';
            }

            tr.innerHTML = `
                <td>#${student.id}</td>
                <td><strong>${student.name}</strong></td>
                <td>${student.course}</td>
                <td>${student.date}</td>
                <td><button class="tabela-btn-gen" data-id="${student.id}">Focar</button></td>
            `;

            // Clique na linha foca o aluno para visualização
            tr.addEventListener('click', () => {
                const realIndex = state.loadedStudents.findIndex(s => s.id === student.id);
                selectStudent(realIndex);
            });

            DOM.tabelaBody.appendChild(tr);
        });
    }

    function selectStudent(index) {
        if (index < 0 || index >= state.loadedStudents.length) return;
        state.currentIndex = index;
        
        const student = state.loadedStudents[index];

        // Sincronizar classes ativas na tabela sem re-renderizar completa
        const rows = DOM.tabelaBody.querySelectorAll('tr');
        const filtered = getFilteredStudents();
        const filteredIndex = filtered.findIndex(s => s.id === student.id);

        // Atualizar HUD e Controles de Paginação
        if (DOM.navCount) DOM.navCount.textContent = `${filteredIndex + 1} / ${filtered.length}`;
        DOM.btnPrev.disabled = filteredIndex <= 0;
        DOM.btnNext.disabled = filteredIndex >= filtered.length - 1 || filteredIndex === -1;

        // Atualizar Informações de Status na Toolbar
        if (DOM.statNum) DOM.statNum.textContent = String(filteredIndex + 1).padStart(2, '0');
        if (DOM.statStatus) DOM.statStatus.innerHTML = `Visualizando: <strong>${student.name}</strong>`;

        // Ativar HUD Inferior e PSB
        if (DOM.placeholder) DOM.placeholder.classList.add('hidden');
        if (DOM.canvas) DOM.canvas.classList.remove('hidden');
        if (DOM.certFrame) DOM.certFrame.classList.add('loaded');

        if (DOM.psbName) DOM.psbName.textContent = student.name;
        if (DOM.psbDetails) DOM.psbDetails.textContent = `Emissão realizada em ${student.date} | ID único: REG-${student.id}94B`;
        if (DOM.psbCurso) DOM.psbCurso.textContent = student.course;

        updateProgressTracks();
        renderCertificateCanvas();
    }

    function navigateStudents(direction) {
        const filtered = getFilteredStudents();
        if (filtered.length === 0) return;

        const currentStudent = state.loadedStudents[state.currentIndex];
        let currentFilteredIndex = filtered.findIndex(s => s.id === currentStudent?.id);

        if (direction === 'next' && currentFilteredIndex < filtered.length - 1) {
            currentFilteredIndex++;
        } else if (direction === 'prev' && currentFilteredIndex > 0) {
            currentFilteredIndex--;
        }

        const realIndex = state.loadedStudents.findIndex(s => s.id === filtered[currentFilteredIndex].id);
        selectStudent(realIndex);
        
        // Destacar linha na tabela visível
        const rows = DOM.tabelaBody.querySelectorAll('tr');
        rows.forEach((row, idx) => {
             row.classList.remove('row-ativo');
             if(idx === currentFilteredIndex) row.classList.add('row-ativo');
        });
    }

    function updateGlobalStats() {
        // Atualiza percentuais das barras de progresso base
        updateProgressTracks();
    }

    function updateProgressTracks() {
        const filtered = getFilteredStudents();
        if (filtered.length === 0) return;

        const currentStudent = state.loadedStudents[state.currentIndex];
        const currentFilteredIndex = filtered.findIndex(s => s.id === currentStudent?.id) + 1;
        
        const pct = filtered.length > 0 ? Math.round((currentFilteredIndex / filtered.length) * 100) : 0;
        
        if (DOM.progPct) DOM.progPct.textContent = `${pct}%`;
        if (DOM.progFill) DOM.progFill.style.width = `${pct}%`;
        if (DOM.progSub) DOM.progSub.textContent = `Fila de Impressão de Certificados: Registro ${currentFilteredIndex} de ${filtered.length} ativos.`;
    }

    function clearPreview() {
        state.currentIndex = -1;
        if (DOM.placeholder) DOM.placeholder.classList.remove('hidden');
        if (DOM.canvas) DOM.canvas.classList.add('hidden');
        if (DOM.certFrame) DOM.certFrame.classList.remove('loaded');
        if (DOM.navCount) DOM.navCount.textContent = `0 / 0`;
        DOM.btnPrev.disabled = true;
        DOM.btnNext.disabled = true;
    }

    // ── MOTOR DE RENDERIZAÇÃO CANVAS GRAPHICS ──
    function createBaseTemplate() {
        // Inicializa uma imagem em cache para o fundo do certificado
        state.certificateTemplate = new Image();
        // Construção de um background procedural elegante via SVG em linha para evitar dependências externas de rede
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
                <rect width="1920" height="1080" fill="#090c14"/>
                <rect x="40" y="40" width="1840" height="1000" fill="none" stroke="#222e47" stroke-width="2"/>
                <rect x="55" y="55" width="1810" height="970" fill="none" stroke="#dc2626" stroke-width="1" stroke-opacity="0.4"/>
                <!-- Grafismos de fundo nos cantos -->
                <path d="M40 200 L200 40 M40 300 L300 40" stroke="#161c2a" stroke-width="1"/>
                <path d="M1880 880 L1720 1040 M1880 780 L1620 1040" stroke="#161c2a" stroke-width="1"/>
            </svg>
        `;
        state.certificateTemplate.src = 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
        state.certificateTemplate.onload = () => {
            if (state.currentIndex !== -1) renderCertificateCanvas();
        };
    }

    function renderCertificateCanvas() {
        if (!ctx || !DOM.canvas || state.currentIndex === -1) return;

        const student = state.loadedStudents[state.currentIndex];
        
        // Ajuste de resolução nativa para resoluções ultra nítidas (FHD)
        DOM.canvas.width = 1920;
        DOM.canvas.height = 1080;

        // Desenhar Background Base
        if (state.certificateTemplate && state.certificateTemplate.complete) {
            ctx.drawImage(state.certificateTemplate, 0, 0);
        } else {
            ctx.fillStyle = '#090c14';
            ctx.fillRect(0, 0, 1920, 1080);
        }

        // Configuração de Estilos Dinâmicos baseado nos painéis laterais de customização
        const textColor = state.config.textColor;
        const multiplier = state.config.fontSizeMultiplier;

        // Título Principal do Diploma
        ctx.fillStyle = '#dc2626';
        ctx.font = `800 ${62 * multiplier}px Syne, Arial, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('CERTIFICADO DE PROFICIÊNCIA', 1920 / 2, 220);

        // Subtítulo descritivo de Concessão
        ctx.fillStyle = '#8494b8';
        ctx.font = `600 ${22 * multiplier}px 'DM Sans', sans-serif`;
        ctx.fillText('A COORDENAÇÃO DE CERTIFICAÇÕES DA ABILITY PRO DECLARA QUE', 1920 / 2, 360);

        // Nome do Formando Aluno
        ctx.fillStyle = textColor;
        ctx.font = `800 ${76 * multiplier}px Syne, Arial, sans-serif`;
        ctx.fillText(student.name, 1920 / 2, 490);

        // Texto do escopo de aprovação do Curso
        ctx.fillStyle = '#8494b8';
        ctx.font = `400 ${24 * multiplier}px 'DM Sans', sans-serif`;
        ctx.fillText(`concluiu com êxito os requisitos e critérios de avaliação do programa de formação corporativa em`, 1920 / 2, 590);

        // Nome do Curso focado em Alta Definição
        ctx.fillStyle = '#ef4444';
        ctx.font = `700 ${38 * multiplier}px Syne, Arial, sans-serif`;
        ctx.fillText(student.course.toUpperCase() + ' ADVANCED EXPERT', 1920 / 2, 660);

        // Rodapé de segurança com metadados e data de emissão
        ctx.fillStyle = '#3d4a66';
        ctx.font = `500 ${16 * multiplier}px monospace`;
        ctx.fillText(`DATA DA EMISSÃO: ${student.date}  |  VALIDAÇÃO AUTÊNTICA ID: AB-PRO-${student.id}94B-2026`, 1920 / 2, 780);

        // Renderização Dinâmica Condicional de Assinatura Digital da Diretoria
        if (state.config.showSignature) {
            // Linha da assinatura
            ctx.strokeStyle = '#222e47';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo((1920 / 2) - 250, 930);
            ctx.lineTo((1920 / 2) + 250, 930);
            ctx.stroke();

            // Texto da Assinatura Corporativa (Mock de Controle de Logins de Administrador)
            ctx.fillStyle = '#8494b8';
            ctx.font = `italic 24px 'Syne', sans-serif`;
            ctx.fillText('Ability Certification Authority', 1920 / 2, 910);

            ctx.fillStyle = '#3d4a66';
            ctx.font = `600 ${14 * multiplier}px 'DM Sans', sans-serif`;
            ctx.fillText('DIRETOR DE OPERAÇÕES E LOGIN ROOT', 1920 / 2, 965);
        }

        // Atualiza a resolução dinamicamente no HUD para feedback imediato do operador
        if (DOM.hudResolution) {
            DOM.hudResolution.textContent = `PREVIEW ATIVO: 1920x1080 PX (FHD) - ZOOM ${state.zoomLevel}%`;
        }
    }

    // ── CONTROLES DE ZOOM & INTERAÇÃO DA VIEWPORT ──
    function handleZoom(amount) {
        if (amount === 'in' && state.zoomLevel < 150) {
            state.zoomLevel += 10;
        } else if (amount === 'out' && state.zoomLevel > 60) {
            state.zoomLevel -= 10;
        }
        applyZoomStyles();
    }

    function toggleCanvasZoom() {
        state.isZoomed = !state.isZoomed;
        if (state.isZoomed) {
            DOM.canvas.classList.add('zoomed');
            DOM.canvas.style.transform = 'scale(1.25)';
        } else {
            DOM.canvas.classList.remove('zoomed');
            DOM.canvas.style.transform = 'scale(1)';
            state.zoomLevel = 100;
        }
        renderCertificateCanvas();
    }

    function applyZoomStyles() {
        if (!DOM.canvas) return;
        DOM.canvas.style.transform = `scale(${state.zoomLevel / 100})`;
        renderCertificateCanvas();
    }

    // ── EXPORTADORES DE DOCUMENTOS (SINGLE & BATCH PROCESSORS) ──
    function exportSingleCertificate() {
        if (state.currentIndex === -1) return;
        const student = state.loadedStudents[state.currentIndex];
        
        // Simulação avançada de exportação via download direto de DataURL do Canvas
        const dataUrl = DOM.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `CERTIFICADO_${student.course}_${student.name.replace(/\s+/g, '_')}.png`;
        link.href = dataUrl;
        link.click();
    }

    function exportAllCertificates() {
        const filtered = getFilteredStudents();
        if (filtered.length === 0) {
            alert('Não existem certificados na fila atual para exportação.');
            return;
        }

        alert(`Iniciando lote de impressão em massa de ${filtered.length} certificados. O download dos arquivos iniciará automaticamente dentro de instantes.`);
        
        let batchIndex = 0;
        const interval = setInterval(() => {
            if (batchIndex >= filtered.length) {
                clearInterval(interval);
                alert('Lote de exportação finalizado com sucesso.');
                // Retorna a seleção visual pro primeiro elemento do lote
                const originalIndex = state.loadedStudents.findIndex(s => s.id === filtered[0].id);
                selectStudent(originalIndex);
                return;
            }

            const targetStudent = filtered[batchIndex];
            const realIndex = state.loadedStudents.findIndex(s => s.id === targetStudent.id);
            
            selectStudent(realIndex);
            
            // Força download do canvas renderizado no loop síncrono controlado por tempo
            const dataUrl = DOM.canvas.toDataURL('image/png');
            const link = document.createElement('a');
            link.download = `LOTE_NRO_${targetStudent.id}_${targetStudent.name.replace(/\s+/g, '_')}.png`;
            link.href = dataUrl;
            link.click();

            batchIndex++;
        }, 1200); // Delay seguro de 1.2s para evitar overload no barramento do navegador
    }

    // ── CONFIGURADORES LATERAIS (CUSTOMIZATION SLIDERS) ──
    function handleColorChange(e) {
        DOM.colorSwatches.forEach(swatch => swatch.classList.remove('active'));
        const activeSwatch = e.currentTarget;
        activeSwatch.classList.add('active');
        
        // Extrai a cor computada do background do elemento ou mapeamento manual
        const color = activeSwatch.style.backgroundColor || activeSwatch.getAttribute('data-color');
        if (color) {
            state.config.textColor = color;
            renderCertificateCanvas();
        }
    }

    function handleFontSizeSlider(e) {
        const val = parseFloat(e.target.value);
        state.config.fontSizeMultiplier = val;
        renderCertificateCanvas();
    }

    function handleSignatureToggle(e) {
        state.config.showSignature = e.target.checked;
        renderCertificateCanvas();
    }

    // ── ESCUTA E ATRIBUIÇÃO DOS EVENTOS DO DOM ──
    function setupEventListeners() {
        // Evento de Login e Abas de Credenciais Facilitadas do Rodapé
        if (DOM.loginForm) {
            DOM.loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                handleLogin();
            });
        }
        if (DOM.loginBtn) DOM.loginBtn.addEventListener('click', handleLogin);
        
        DOM.tabs.forEach(tab => {
            tab.addEventListener('click', (e) => {
                DOM.tabs.forEach(t => t.classList.remove('active'));
                e.currentTarget.classList.add('active');
                
                // Preenchimento de credenciais mockadas facilitadas pelas abas
                const userType = e.currentTarget.textContent.toLowerCase();
                if (userType.includes('admin')) {
                    DOM.userInput.value = 'admin';
                    DOM.passInput.value = 'admin123';
                } else {
                    DOM.userInput.value = 'user';
                    DOM.passInput.value = 'user123';
                }
            });
        });

        // Saída e Desconexão do painel
        if (DOM.btnExit) DOM.btnExit.addEventListener('click', handleLogout);

        // Painel Administrativo de Usuários da Equipe
        if (DOM.adminToggleBadge) DOM.adminToggleBadge.addEventListener('click', toggleAdminPanel);
        if (DOM.adminForm) DOM.adminForm.addEventListener('submit', addNewUser);
        const btnAddTeam = DOM.adminForm ? DOM.adminForm.querySelector('.btn-green') : null;
        if (btnAddTeam) btnAddTeam.addEventListener('click', addNewUser);

        // Carregamento de Lista por Upload de CSV Externo
        DOM.pdfItems.forEach(item => {
            item.addEventListener('click', triggerFileInput);
        });
        if (DOM.fileInput) DOM.fileInput.addEventListener('change', handleFileUpload);

        // Abas e Filtros de Categoria de Cursos Laterais
        DOM.courseBtns.forEach(btn => {
            btn.addEventListener('click', handleCourseFilter);
        });

        // Controles Customizados Laterais (Cores, Sliders, Switches)
        DOM.colorSwatches.forEach((swatch, idx) => {
            // Injeta cor padrão em linha caso o css não renderize nativo
            const colors = ['#f0f4ff', '#ef4444', '#60a5fa', '#22c55e', '#eab308'];
            swatch.style.backgroundColor = colors[idx] || '#fff';
            swatch.setAttribute('data-color', colors[idx]);
            swatch.addEventListener('click', handleColorChange);
        });

        if (DOM.fontSizeSlider) DOM.fontSizeSlider.addEventListener('input', handleFontSizeSlider);
        if (DOM.signatureSwitch) DOM.signatureSwitch.addEventListener('change', handleSignatureToggle);

        // Toolbar de Paginação e Tabela
        DOM.btnPrev.addEventListener('click', () => navigateStudents('prev'));
        DOM.btnNext.addEventListener('click', () => navigateStudents('next'));
        
        if (DOM.btnToggleTable) {
            DOM.btnToggleTable.addEventListener('click', () => {
                DOM.tabelaWrap.classList.toggle('hidden');
                renderTableRows();
            });
        }
        if (DOM.tabelaClose) DOM.tabelaClose.addEventListener('click', () => DOM.tabelaWrap.classList.add('hidden'));
        if (DOM.tabelaSearch) DOM.tabelaSearch.addEventListener('input', renderTableRows);

        // Ações de Emissão e Geração de Downloads
        if (DOM.btnExportPDF) DOM.btnExportPDF.addEventListener('click', exportSingleCertificate);
        if (DOM.btnGenerateSingle) DOM.btnGenerateSingle.addEventListener('click', exportSingleCertificate);
        if (DOM.btnExportAll) DOM.btnExportAll.addEventListener('click', exportAllCertificates);

        // Zoom do Canvas e HUD Contextual
        if (DOM.btnZoomIn) DOM.btnZoomIn.addEventListener('click', () => handleZoom('in'));
        if (DOM.btnZoomOut) DOM.btnZoomOut.addEventListener('click', () => handleZoom('out'));
        if (DOM.canvas) DOM.canvas.addEventListener('click', toggleCanvasZoom);
    }

    // Inicializar Motor da Aplicação
    initApp();
});
