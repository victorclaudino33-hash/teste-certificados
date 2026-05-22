/* ══════════════════════════════════════════════════════════════════════ */
/* ABILITY PRO - CERTIFICATION SUITE v4.0                                 */
/* Core Application Script (Modular Firebase Integrated)                  */
/* ══════════════════════════════════════════════════════════════════════ */
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

// Inicializa o ecossistema Firebase
const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

document.addEventListener('DOMContentLoaded', () => {
    
    // ── ESTADO GLOBAL DA APLICAÇÃO ──
    const state = {
        currentUser: null,
        isAdmin: false,
        activeCourse: 'ALL',
        loadedStudents: [],
        currentIndex: -1,
        zoomLevel: 100,
        certificateTemplate: null,
        config: {
            textColor: '#f0f4ff',
            fontSizeMultiplier: 1.0,
            showSignature: true
        }
    };

    // Massa de dados inicial mockada para os alunos
    const MOCK_STUDENTS = [
        { id: '001', name: 'ANA SILVA', course: 'DEV', date: '22/05/2026', status: 'Aprovado' },
        { id: '002', name: 'BRUNO GOMES', course: 'DESIGN', date: '20/05/2026', status: 'Aprovado' },
        { id: '003', name: 'CARLOS SOUZA', course: 'DATA', date: '18/05/2026', status: 'Aprovado' },
        { id: '004', name: 'DANIELA LIMA', course: 'DEV', date: '15/05/2026', status: 'Aprovado' }
    ];

    // ── MAPEAMENTO DE ELEMENTOS DO DOM ──
    const DOM = {
        loginSection: document.getElementById('loginSection'),
        mainInterface: document.getElementById('mainInterface'),
        tabLogin: document.getElementById('tabLogin'),
        tabRegister: document.getElementById('tabRegister'),
        emailField: document.getElementById('emailField'),
        passwordField: document.getElementById('passwordField'),
        btnLogin: document.getElementById('btnLogin'),
        
        userBadge: document.getElementById('userBadge'),
        btnToggleAdminPanel: document.getElementById('btnToggleAdminPanel'),
        btnSair: document.getElementById('btnSair'),
        adminPanel: document.getElementById('adminPanel'),
        
        courseBtns: document.querySelectorAll('.cbtn'),
        fileInput: document.getElementById('csvUpload'),
        
        statNum: document.getElementById('statTotal'),
        statStatus: document.getElementById('txtStatus'),
        
        btnToggleTable: document.getElementById('btnToggleTable'),
        btnExportPDF: document.getElementById('btnExportPDF'),
        btnExportAll: document.getElementById('btnExportAll'),
        btnEmitir: document.getElementById('btnEmitir'),
        
        tabelaWrap: document.getElementById('tabelaWrap'),
        tabelaSearch: document.querySelector('.tabela-search'),
        tabelaClose: document.querySelector('.tabela-close'),
        tabelaBody: document.querySelector('.tabela tbody'),
        
        canvas: document.getElementById('previewCanvas'),
        placeholder: document.getElementById('canvasPlaceholder'),
        
        progPct: document.querySelector('.prog-pct'),
        progFill: document.querySelector('.prog-fill'),
        progSub: document.querySelector('.prog-sub')
    };

    const ctx = DOM.canvas ? DOM.canvas.getContext('2d') : null;
    let authMode = "login"; // "login" ou "cadastro"

    // ── MONITORA ESTADO DE AUTENTICAÇÃO DO FIREBASE ──
    onAuthStateChanged(auth, async (user) => {
        if (user) {
            state.currentUser = user.email;
            DOM.loginSection.classList.add('hidden');
            DOM.mainInterface.classList.remove('hidden');
            DOM.userBadge.textContent = user.email;

            // Busca privilégios de Admin no Firestore
            try {
                const docSnap = await getDoc(doc(db, "usuarios", user.uid));
                if (docSnap.exists() && docSnap.data().role === 'admin') {
                    state.isAdmin = true;
                    DOM.btnToggleAdminPanel.classList.remove('hidden');
                } else {
                    state.isAdmin = false;
                    DOM.btnToggleAdminPanel.classList.add('hidden');
                }
            } catch (err) {
                console.log("Perfil carregado sem banco Firestore ativo.");
            }

            // Inicializa dados do app se houver estudantes na fila
            if (state.loadedStudents.length === 0) {
                state.loadedStudents = [...MOCK_STUDENTS];
            }
            updateProgressTracks();
            renderTableRows();
            selectStudent(0);
        } else {
            state.currentUser = null;
            state.isAdmin = false;
            DOM.loginSection.classList.remove('hidden');
            DOM.mainInterface.classList.add('hidden');
            clearPreview();
        }
    });

    // ── INICIALIZAÇÃO GERAL DO SISTEMA ──
    function initApp() {
        createBaseTemplate();
        setupEventListeners();
    }

    // ── EVENTOS DE CADASTRO E LOGIN COM FIREBASE ──
    async function handleAuthAction() {
        const email = DOM.emailField.value.trim();
        const password = DOM.passwordField.value;

        if (!email || !password) {
            mostrarToast("Preencha todos os campos.");
            return;
        }

        try {
            if (authMode === "cadastro") {
                const credential = await createUserWithEmailAndPassword(auth, email, password);
                // Registra o perfil padrão de admin na coleção Firestore
                await setDoc(doc(db, "usuarios", credential.user.uid), {
                    email: credential.user.email,
                    role: "admin",
                    createdAt: new Date().toISOString()
                });
                mostrarToast("Conta de administrador criada!");
            } else {
                await signInWithEmailAndPassword(auth, email, password);
                mostrarToast("Acesso autorizado!");
            }
        } catch (error) {
            tratarErrosFirebase(error);
        }
    }

    // ── MOTOR DE RENDERIZAÇÃO DO CERTIFICADO (CANVAS) ──
    function createBaseTemplate() {
        state.certificateTemplate = new Image();
        const svg = `
            <svg xmlns="http://www.w3.org/2000/svg" width="1920" height="1080" viewBox="0 0 1920 1080">
                <rect width="1920" height="1080" fill="#090c14"/>
                <rect x="40" y="40" width="1840" height="1000" fill="none" stroke="#222e47" stroke-width="2"/>
                <rect x="55" y="55" width="1810" height="970" fill="none" stroke="#dc2626" stroke-width="1" stroke-opacity="0.4"/>
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
        DOM.canvas.width = 1920;
        DOM.canvas.height = 1080;

        if (state.certificateTemplate && state.certificateTemplate.complete) {
            ctx.drawImage(state.certificateTemplate, 0, 0);
        }

        const multiplier = state.config.fontSizeMultiplier;

        ctx.fillStyle = '#dc2626';
        ctx.font = `800 ${62 * multiplier}px Syne, sans-serif`;
        ctx.textAlign = 'center';
        ctx.fillText('CERTIFICADO DE PROFICIÊNCIA', 1920 / 2, 220);

        ctx.fillStyle = '#8494b8';
        ctx.font = `600 ${22 * multiplier}px 'DM Sans', sans-serif`;
        ctx.fillText('A COORDENAÇÃO DE CERTIFICAÇÕES DA ABILITY PRO DECLARA QUE', 1920 / 2, 360);

        ctx.fillStyle = state.config.textColor;
        ctx.font = `800 ${76 * multiplier}px Syne, sans-serif`;
        ctx.fillText(student.name, 1920 / 2, 490);

        ctx.fillStyle = '#8494b8';
        ctx.font = `400 ${24 * multiplier}px 'DM Sans', sans-serif`;
        ctx.fillText(`concluiu com êxito os requisitos e critérios de avaliação do programa em`, 1920 / 2, 590);

        ctx.fillStyle = '#ef4444';
        ctx.font = `700 ${38 * multiplier}px Syne, sans-serif`;
        ctx.fillText(student.course.toUpperCase() + ' ADVANCED EXPERT', 1920 / 2, 660);

        ctx.fillStyle = '#3d4a66';
        ctx.font = `500 16px monospace`;
        ctx.fillText(`DATA DA EMISSÃO: ${student.date}  |  VALIDAÇÃO AUTÊNTICA ID: AB-PRO-${student.id}94B`, 1920 / 2, 780);

        if (state.config.showSignature) {
            ctx.strokeStyle = '#222e47';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo((1920 / 2) - 250, 930);
            ctx.lineTo((1920 / 2) + 250, 930);
            ctx.stroke();

            ctx.fillStyle = '#8494b8';
            ctx.font = `italic 24px 'Syne', sans-serif`;
            ctx.fillText('Ability Certification Authority', 1920 / 2, 910);
        }
    }

    // ── LEITURA DE CSV EXTERNO ──
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
        const lines = text.split('\n');
        const result = [];
        for (let i = 1; i < lines.length; i++) {
            if (!lines[i].trim()) continue;
            const columns = lines[i].split(',');
            if (columns.length >= 2) {
                result.push({
                    id: String(i).padStart(3, '0'),
                    name: columns[0].replace(/"/g, '').trim().toUpperCase(),
                    course: columns[1].replace(/"/g, '').trim().toUpperCase(),
                    date: columns[2] ? columns[2].replace(/"/g, '').trim() : '22/05/2026',
                    status: 'Aprovado'
                });
            }
        }
        if (result.length > 0) {
            state.loadedStudents = result;
            const sub = document.getElementById('txtFrente');
            if (sub) sub.textContent = filename;
            state.activeCourse = 'ALL';
            renderTableRows();
            selectStudent(0);
            mostrarToast("Lista carregada com sucesso!");
        }
    }

    // ── FILTROS E TABELA DE ALUNOS ──
    function getFilteredStudents() {
        if (state.activeCourse === 'ALL') return state.loadedStudents;
        return state.loadedStudents.filter(s => s.course === state.activeCourse);
    }

    function renderTableRows() {
        if (!DOM.tabelaBody) return;
        DOM.tabelaBody.innerHTML = '';
        const filtered = getFilteredStudents();
        const searchWord = DOM.tabelaSearch ? DOM.tabelaSearch.value.toLowerCase() : "";

        filtered.forEach(student => {
            if (searchWord && !student.name.toLowerCase().includes(searchWord)) return;

            const tr = document.createElement('tr');
            tr.style.borderBottom = "1px solid #1a233a";
            tr.style.cursor = "pointer";
            tr.innerHTML = `
                <td style="padding:10px;">#${student.id}</td>
                <td style="padding:10px;"><strong>${student.name}</strong></td>
                <td style="padding:10px;">${student.course}</td>
                <td style="padding:10px;">${student.date}</td>
                <td style="padding:10px;"><button style="background:#dc2626; color:#fff; border:none; padding:4px 8px; border-radius:4px; cursor:pointer;">Focar</button></td>
            `;
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

        if (DOM.placeholder) DOM.placeholder.classList.add('hidden');
        if (DOM.canvas) DOM.canvas.classList.remove('hidden');

        if (DOM.statNum) DOM.statNum.textContent = String(student.id);
        if (DOM.statStatus) DOM.statStatus.innerHTML = `Visualizando: <strong>${student.name}</strong>`;

        updateProgressTracks();
        renderCertificateCanvas();
    }

    function updateProgressTracks() {
        const filtered = getFilteredStudents();
        if (filtered.length === 0) return;
        const currentStudent = state.loadedStudents[state.currentIndex];
        const currentFilteredIndex = filtered.findIndex(s => s.id === currentStudent?.id) + 1;
        const pct = Math.round((currentFilteredIndex / filtered.length) * 100);
        
        if (DOM.progPct) DOM.progPct.textContent = `${pct}%`;
        if (DOM.progFill) DOM.progFill.style.width = `${pct}%`;
        if (DOM.progSub) DOM.progSub.textContent = `Registro ${currentFilteredIndex} de ${filtered.length} ativos na fila.`;
    }

    function clearPreview() {
        state.currentIndex = -1;
        if (DOM.placeholder) DOM.placeholder.classList.remove('hidden');
        if (DOM.canvas) DOM.canvas.classList.add('hidden');
    }

    function exportSingleCertificate() {
        if (state.currentIndex === -1) return;
        const student = state.loadedStudents[state.currentIndex];
        const dataUrl = DOM.canvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = `CERTIFICADO_${student.course}_${student.name.replace(/\s+/g, '_')}.png`;
        link.href = dataUrl;
        link.click();
    }

    // ── ATRIBUIÇÃO DE EVENTOS DO DOM ──
    function setupEventListeners() {
        DOM.tabLogin.addEventListener('click', () => {
            DOM.tabLogin.classList.add('active');
            DOM.tabRegister.classList.remove('active');
            DOM.btnLogin.textContent = "Entrar na Conta";
            authMode = "login";
        });

        DOM.tabRegister.addEventListener('click', () => {
            DOM.tabRegister.classList.add('active');
            DOM.tabLogin.classList.remove('active');
            DOM.btnLogin.textContent = "Criar Nova Conta";
            authMode = "cadastro";
        });

        DOM.btnLogin.addEventListener('click', handleAuthAction);
        DOM.btnSair.addEventListener('click', () => signOut(auth));
        
        if (DOM.btnToggleAdminPanel) {
            DOM.btnToggleAdminPanel.addEventListener('click', () => DOM.adminPanel.classList.toggle('hidden'));
        }

        if (DOM.fileInput) DOM.fileInput.addEventListener('change', handleFileUpload);

        DOM.courseBtns.forEach(btn => {
            btn.addEventListener('click', (e) => {
                DOM.courseBtns.forEach(b => b.classList.remove('active'));
                e.currentTarget.classList.add('active');
                state.activeCourse = e.currentTarget.getAttribute('data-curso');
                renderTableRows();
                const filtered = getFilteredStudents();
                if (filtered.length > 0) {
                    const realIndex = state.loadedStudents.findIndex(s => s.id === filtered[0].id);
                    selectStudent(realIndex);
                } else {
                    clearPreview();
                }
            });
        });

        if (DOM.btnToggleTable) {
            DOM.btnToggleTable.addEventListener('click', () => DOM.tabelaWrap.classList.toggle('hidden'));
        }
        if (DOM.tabelaClose) DOM.tabelaClose.addEventListener('click', () => DOM.tabelaWrap.classList.add('hidden'));
        if (DOM.tabelaSearch) DOM.tabelaSearch.addEventListener('input', renderTableRows);

        DOM.btnExportPDF.addEventListener('click', exportSingleCertificate);
        DOM.btnEmitir.addEventListener('click', exportSingleCertificate);
        
        DOM.btnExportAll.addEventListener('click', () => {
            const filtered = getFilteredStudents();
            if (filtered.length === 0) return;
            mostrarToast("Exportando lote completo...");
            filtered.forEach((st, idx) => {
                setTimeout(() => {
                    const realIndex = state.loadedStudents.findIndex(s => s.id === st.id);
                    selectStudent(realIndex);
                    exportSingleCertificate();
                }, idx * 1000);
            });
        });
    }

    function mostrarToast(msg) {
        const container = document.querySelector(".toast-container");
        if (!container) return;
        const toast = document.createElement("div");
        toast.className = "toast";
        toast.style.background = "#1a233a";
        toast.style.color = "#fff";
        toast.style.padding = "12px 24px";
        toast.style.margin = "10px";
        toast.style.borderRadius = "4px";
        toast.innerText = msg;
        container.appendChild(toast);
        setTimeout(() => toast.remove(), 3500);
    }

    function tratarErrosFirebase(error) {
        switch (error.code) {
            case "auth/email-already-in-use": mostrarToast("E-mail em uso."); break;
            case "auth/invalid-credential": mostrarToast("Credenciais incorretas."); break;
            case "auth/weak-password": mostrarToast("Senha fraca (mínimo 6 dígitos)."); break;
            default: mostrarToast("Erro na operação.");
        }
    }

    initApp();
});
